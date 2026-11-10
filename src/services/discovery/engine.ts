/**
 * The discovery engine — MusicBrainz-first architecture.
 *
 * MusicBrainz is the canonical catalogue and the only source of artist,
 * release-group, recording and cover-art identity. YouTube remains optional
 * and is never guessed from a title: a track without a verified relationship
 * is a valid MusicBrainz-only track.
 */
import type {
  Artist,
  ArtistRole,
  DiscoveryCategory,
  DiscoveryDepth,
  DiscoveryReport,
  DiscoverySession,
  MusicBrainzArtist,
  MusicBrainzReleaseGroup,
  MusicBrainzRecording,
  Track,
} from '../../types';
import { randomId } from '../../utils/id';
import {
  extractVersionTags,
  normalizeArtistName,
  normalizeText,
} from '../../utils/normalize';
import type { MusicBrainzClient, MusicBrainzRecordingResult } from '../musicbrainz/index';
import { getUiMusicBrainzClient } from '../musicbrainz/bridge';
import type { YouTubeClient, YouTubeIntegrationState } from '../youtube/api';

export interface ProgressEvent {
  phase: 'resolve' | 'search' | 'dedupe' | 'done';
  message: string;
  done?: number;
  total?: number;
}
export type ProgressCallback = (e: ProgressEvent) => void;

export interface DiscoveryOptions {
  depth: DiscoveryDepth;
  categories: DiscoveryCategory[];
  dedup: 'strict' | 'balanced' | 'off';
  maxPerQuery: number;
  signal?: AbortSignal;
}

const RELEASE_GROUP_LIMIT: Record<DiscoveryDepth, number> = {
  quick: 8,
  standard: 32,
  deep: 100,
};

const MBID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidMBID(value: string | undefined): value is string {
  return typeof value === 'string' && MBID_PATTERN.test(value);
}

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

function toArtist(mb: MusicBrainzArtist, fallback?: Artist): Artist {
  return {
    id: mb.id,
    name: mb.name,
    normalizedName: normalizeArtistName(mb.name),
    mbid: mb.id,
    type: mb.type,
    disambiguation: mb.disambiguation,
    description: mb.disambiguation ?? fallback?.description,
    country: mb.country ?? fallback?.country,
    // Only carry an image forward when the caller already had a real source;
    // MusicBrainz artist search does not include artwork.
    thumbnail: fallback?.thumbnail,
    channelId: fallback?.channelId,
    subscriberCount: fallback?.subscriberCount,
  };
}

function categoryFromEvidence(
  recording: MusicBrainzRecording,
  releaseGroup: MusicBrainzReleaseGroup,
  targetArtistMBID: string,
): DiscoveryCategory {
  const tags = extractVersionTags(recording.title);
  if (tags.includes('live')) return 'live';
  if (tags.includes('unplugged')) return 'unplugged';
  if (tags.includes('acoustic')) return 'acoustic';
  if (tags.includes('remix')) return 'remix';
  if (tags.includes('cover')) return 'cover';
  if (tags.includes('instrumental')) return 'instrumental';

  const secondary = (releaseGroup.secondarytypes ?? []).map((type) =>
    type.toLocaleLowerCase(),
  );
  if (secondary.includes('live')) return 'live';
  if (secondary.includes('soundtrack')) return 'soundtrack';
  if (secondary.includes('remix')) return 'remix';

  const credits = recording.artist_credit ?? [];
  const targetIndex = credits.findIndex(
    (credit) => credit.artist.id === targetArtistMBID,
  );
  if (targetIndex > 0) return 'featured';
  if (credits.length > 1) return 'collaboration';

  switch (releaseGroup.primarytype) {
    case 'Single':
      return 'single';
    case 'Album':
    case 'EP':
    case 'Compilation':
      return 'album';
    default:
      return 'other';
  }
}

function roleFromCredits(
  recording: MusicBrainzRecording,
  targetArtistMBID: string,
): ArtistRole {
  const credits = recording.artist_credit ?? [];
  if (credits.length === 0) return 'other';

  const index = credits.findIndex((credit) => credit.artist.id === targetArtistMBID);
  if (index < 0) return 'other';
  if (index === 0) return 'primary';
  return 'featured';
}

function toTrack(
  recording: MusicBrainzRecordingResult,
  releaseGroup: MusicBrainzReleaseGroup,
  artist: Artist,
): Track {
  const now = Date.now();
  const coverFront = recording.coverartimage;
  const coverThumb = recording.coverartthumb ?? coverFront;
  const metadata: Record<string, unknown> = {
    releaseGroup: {
      id: releaseGroup.id,
      title: releaseGroup.title,
      primarytype: releaseGroup.primarytype,
      secondarytypes: releaseGroup.secondarytypes ?? [],
    },
  };

  if (recording.releaseTitle) metadata.releaseTitle = recording.releaseTitle;
  if (recording.firstReleaseDate) {
    metadata.firstReleaseDate = recording.firstReleaseDate;
  }
  if (coverFront || recording.coverartthumb) {
    metadata.coverArt = {
      front: coverFront,
      back: undefined,
      thumb: coverThumb,
    };
  }

  return {
    id: recording.id,
    title: recording.title,
    normalizedTitle: normalizeText(recording.title),
    artist: artist.name,
    canonicalId: undefined,
    dedupeKey: '',
    isDuplicate: false,
    source: 'musicbrainz',
    discoveredAt: now,
    lastUpdated: now,
    year:
      recording.firstreleaseyear ??
      parseYear(recording.firstReleaseDate) ??
      releaseGroup.firstreleaseyear,
    isrc: recording.isrc,
    language: undefined,
    category: categoryFromEvidence(recording, releaseGroup, artist.mbid ?? artist.id),
    role: roleFromCredits(recording, artist.mbid ?? artist.id),
    versionTags: extractVersionTags(recording.title),
    durationSeconds: recording.length,
    releaseId: recording.releaseId,
    releaseGroupId: recording.releaseGroupId ?? releaseGroup.id,
    metadata,
    thumbnail: coverThumb,
    // No YouTube identity is inferred. A missing link is a valid state.
    youtubeVideoId: undefined,
    videoId: undefined,
    youtubeUrl: undefined,
    youtubeSource: 'none',
    youtubeVerified: false,
  };
}

export class DiscoveryEngine {
  private youtubeClient: YouTubeClient | null = null;
  private musicbrainz: MusicBrainzClient;

  /**
   * `new DiscoveryEngine(client)` remains compatible with the existing GUI.
   * Tests and callers may pass a MusicBrainz client as the first argument, or
   * supply one as the second argument after a YouTube client.
   */
  constructor(
    clientOrYouTube?: YouTubeClient | MusicBrainzClient | null,
    musicbrainzClient?: MusicBrainzClient,
  ) {
    const possibleMusicBrainz = clientOrYouTube as
      | (MusicBrainzClient & { searchArtists?: unknown })
      | null
      | undefined;

    if (
      possibleMusicBrainz &&
      typeof possibleMusicBrainz.searchArtists === 'function'
    ) {
      this.musicbrainz = possibleMusicBrainz;
    } else {
      this.youtubeClient = (clientOrYouTube as YouTubeClient | null | undefined) ?? null;
      this.musicbrainz = musicbrainzClient ?? getUiMusicBrainzClient();
    }
  }

  setYoutubeClient(client: YouTubeClient | null): void {
    this.youtubeClient = client;
  }

  setMusicBrainzClient(client: MusicBrainzClient | null): void {
    this.musicbrainz = client ?? getUiMusicBrainzClient();
  }

  getYoutubeState(): YouTubeIntegrationState {
    const client = this.youtubeClient as
      | (YouTubeClient & { getState?: () => YouTubeIntegrationState })
      | null;
    if (client?.getState) return client.getState();
    return {
      apiKeyConfigured: client?.hasKey() ?? false,
      clientIdConfigured: false,
      linkOutCount: 0,
      apiCallsMade: 0,
    };
  }

  /** Step 1 — resolve a query to candidate artists via MusicBrainz. */
  async resolveArtists(
    query: string,
    onProgress?: ProgressCallback,
  ): Promise<Artist[]> {
    const name = query.trim();
    if (!name) return [];

    onProgress?.({ phase: 'resolve', message: `Finding artists matching “${name}”…` });
    const matches = await this.musicbrainz.searchArtists(name, 10);
    const artists = matches.map((match) => toArtist(match));

    if (artists.length === 0) {
      onProgress?.({ phase: 'resolve', message: `No MusicBrainz artist matches found for “${name}”.` });
    } else {
      onProgress?.({
        phase: 'resolve',
        message: `Found ${artists.length} MusicBrainz artist match(es).`,
      });
    }
    return artists;
  }

  /** Step 2–7 — resolve artist → release groups → recordings → artwork. */
  async discover(
    artist: Artist,
    opts: DiscoveryOptions,
    onProgress?: ProgressCallback,
  ): Promise<{ session: DiscoverySession; tracks: Track[] }> {
    const startedAt = Date.now();
    const artistMBID = artist.mbid ?? (isValidMBID(artist.id) ? artist.id : undefined);
    if (!artistMBID) {
      throw new Error(
        'A MusicBrainz artist MBID is required. Search for the artist and select a MusicBrainz candidate first.',
      );
    }

    const report: DiscoveryReport = {
      query: artist.name,
      artistId: artistMBID,
      candidatesFound: 0,
      accepted: 0,
      duplicatesRemoved: 0,
      excluded: 0,
      exclusionReasons: {},
      startedAt,
      finishedAt: 0,
    };

    onProgress?.({
      phase: 'search',
      message: `Resolving artist ${artist.name} by MusicBrainz MBID…`,
    });
    const resolved = await this.musicbrainz.getArtistByMBID(artistMBID);
    const canonicalArtist = resolved ? toArtist(resolved, artist) : toArtist(
      { id: artistMBID, name: artist.name },
      artist,
    );

    onProgress?.({
      phase: 'search',
      message: `Fetching release groups for “${canonicalArtist.name}”…`,
      done: 0,
      total: 1,
    });
    const releaseGroups = await this.musicbrainz.getReleaseGroupsByArtistMBID(
      artistMBID,
    );

    const groupLimit = RELEASE_GROUP_LIMIT[opts.depth];
    const selectedGroups = releaseGroups.slice(0, groupLimit);
    const recordings: MusicBrainzRecordingResult[] = [];
    const seenRecordings = new Set<string>();
    let releaseGroupErrors = 0;

    for (let index = 0; index < selectedGroups.length; index += 1) {
      if (opts.signal?.aborted) break;
      const releaseGroup = selectedGroups[index];
      onProgress?.({
        phase: 'search',
        message: `Fetching recordings from “${releaseGroup.title}”…`,
        done: index,
        total: selectedGroups.length,
      });

      let groupRecordings: MusicBrainzRecordingResult[];
      try {
        groupRecordings = await this.musicbrainz.getRecordingsByReleaseGroupMBID(
          releaseGroup.id,
        );
      } catch {
        releaseGroupErrors += 1;
        continue;
      }

      if (groupRecordings.length > 0) {
        let artwork: Awaited<ReturnType<MusicBrainzClient['getCoverArtArchiveByReleaseGroupMBID']>> = {};
        try {
          artwork = await this.musicbrainz.getCoverArtArchiveByReleaseGroupMBID(
            releaseGroup.id,
          );
        } catch {
          // Missing artwork never breaks catalogue discovery.
        }

        for (const recording of groupRecordings) {
          if (seenRecordings.has(recording.id)) continue;
          seenRecordings.add(recording.id);
          recordings.push({
            ...recording,
            releaseGroupId: recording.releaseGroupId ?? releaseGroup.id,
            coverartimage: recording.coverartimage ?? artwork.front,
            coverartthumb:
              recording.coverartthumb ?? artwork.thumb ?? artwork.front,
          });
        }
      }
    }

    const mappedTracks = recordings.map((recording) => {
      const releaseGroup =
        selectedGroups.find((group) => group.id === recording.releaseGroupId) ??
        selectedGroups[0];
      return toTrack(
        recording,
        releaseGroup ?? {
          id: recording.releaseGroupId ?? '',
          title: '',
          primarytype: '',
          artist_credit: [],
        },
        canonicalArtist,
      );
    });

    report.candidatesFound = mappedTracks.length;

    onProgress?.({ phase: 'dedupe', message: 'Removing duplicate recordings…' });
    const { deduplicate } = await import('./dedup');
    const dedupResult = deduplicate(mappedTracks, opts.dedup);
    report.duplicatesRemoved = dedupResult.removedCount;

    const allowed = new Set(opts.categories);
    const filtered =
      allowed.size === 0
        ? dedupResult.kept
        : dedupResult.kept.filter(
            (track) =>
              track.category !== undefined && allowed.has(track.category),
          );
    const categoryFiltered = dedupResult.kept.length - filtered.length;

    report.accepted = filtered.length;
    report.excluded = mappedTracks.length - filtered.length;
    if (dedupResult.removedCount > 0) {
      report.exclusionReasons.duplicates = dedupResult.removedCount;
    }
    if (categoryFiltered > 0) {
      report.exclusionReasons.categoryFiltered = categoryFiltered;
    }
    if (releaseGroupErrors > 0) {
      report.exclusionReasons.releaseGroupErrors = releaseGroupErrors;
    }

    report.finishedAt = Date.now();
    onProgress?.({
      phase: 'done',
      message: `Discovery complete — ${filtered.length} tracks kept.`,
      done: 1,
      total: 1,
    });

    const youtubeState = this.getYoutubeState();
    const session: DiscoverySession = {
      id: randomId('session'),
      artist: canonicalArtist,
      status: opts.signal?.aborted ? 'cancelled' : 'completed',
      depth: opts.depth,
      categories: opts.categories,
      tracks: filtered,
      report,
      createdAt: startedAt,
      updatedAt: Date.now(),
      youtubeIntegration: {
        linkOutCount: youtubeState.linkOutCount,
        apiCallsMade: youtubeState.apiCallsMade,
      },
    };

    return { session, tracks: [...filtered, ...dedupResult.duplicates] };
  }

  /**
   * Validate a user-supplied YouTube URL. Without a genuine verified mapping
   * source this reports `verified: false`; it never guesses a recording match.
   */
  async validateVideoUrl(
    url: string,
  ): Promise<{ videoId: string; verified: boolean } | null> {
    const { videoIdFromUrl } = await import('../../utils/sanitize');
    const id = videoIdFromUrl(url);
    if (!id) return null;

    const client = this.youtubeClient as
      | (YouTubeClient & {
          getVerifiedVideoInfo?: (
            videoId: string,
          ) => Promise<{ videoId: string; verified: boolean }>;
        })
      | null;
    if (!client || !client.hasKey() || !client.getVerifiedVideoInfo) {
      return { videoId: id, verified: false };
    }

    try {
      const info = await client.getVerifiedVideoInfo(id);
      return { videoId: id, verified: info.verified === true };
    } catch {
      return { videoId: id, verified: false };
    }
  }
}
