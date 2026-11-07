/**
 * MusicBrainz-First Canonical Metadata Models & Utilities.
 * Sourced from MusicBrainz Open Data and Cover Art Archive.
 */
import type { Artist, DiscoveryCategory, Track } from '../../types';

export type ReleaseType = 'Album' | 'Single' | 'EP' | 'Soundtrack' | 'Compilation' | 'Live' | 'Other';

export const RELEASE_TYPES: { id: ReleaseType; label: string; description: string }[] = [
  { id: 'Album', label: 'Albums', description: 'Canonical studio and long-playing albums' },
  { id: 'Single', label: 'Singles', description: 'Standalone and promotional singles' },
  { id: 'EP', label: 'EPs', description: 'Extended plays and mini-albums' },
  { id: 'Soundtrack', label: 'Soundtracks', description: 'Original film, television, and game soundtracks' },
  { id: 'Compilation', label: 'Compilations', description: 'Anthologies, best-of, and retrospective collections' },
  { id: 'Live', label: 'Live Releases', description: 'Concert and live stage recordings' },
  { id: 'Other', label: 'Other Releases', description: 'Spoken, demo, and miscellaneous official releases' },
];

export interface MusicBrainzArtist {
  id: string; // MusicBrainz Artist MBID (UUID)
  name: string;
  sortName?: string;
  type?: 'Person' | 'Group' | 'Orchestra' | 'Choir' | 'Other' | string;
  country?: string; // ISO 3166-1 alpha-2 code e.g. 'GB', 'IN', 'US'
  area?: string; // e.g. 'London', 'Chennai', 'West Reading'
  disambiguation?: string; // Canonical disambiguation comment e.g. 'UK rock band formed in London in 1997'
  lifeSpan?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  tags?: string[];
  score?: number;
  isCuratedPreview?: boolean; // Clearly marks offline preview/demo data
}

export interface MusicBrainzReleaseGroup {
  id: string; // Release Group MBID (UUID)
  title: string;
  primaryType: ReleaseType;
  secondaryTypes?: string[];
  firstReleaseDate: string; // ISO date string e.g. '2000-07-10' or year '2000'
  disambiguation?: string;
  coverArtUrl?: string; // Cover Art Archive URL
  trackCount?: number;
}

export interface CanonicalRecording {
  id: string; // MusicBrainz Recording MBID (UUID)
  title: string;
  artistCredit: string;
  artistMbid: string;
  releaseGroupTitle: string;
  releaseGroupMbid: string;
  releaseType: ReleaseType;
  releaseDate: string; // 'YYYY-MM-DD' or 'YYYY'
  trackNumber?: number;
  durationSeconds?: number;
  isrc?: string;
  coverArtUrl?: string;
  /**
   * Optional verified YouTube playback stream mapping.
   * If not verified, stream status is explicitly marked unmapped.
   */
  youtubeStream?: {
    videoId: string;
    verified: boolean;
    title?: string;
  };
}

export function isVerifiedYouTubeId(_videoId: string): boolean {
  // An 11-character YouTube video ID alone is NOT proof of a verified recording relationship.
  return false;
}

/**
 * Returns canonical Cover Art Archive image URL for a Release Group MBID.
 * Defaults to 250px thumbnail; Cover Art Archive provides 250, 500, and 1200px sizes.
 */
export function coverArtArchiveUrl(releaseGroupMbid: string, size: 250 | 500 = 250): string {
  return `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-${size}.jpg`;
}

/**
 * Maps ReleaseType to existing DiscoveryCategory for backwards-compatible store persistence.
 */
export function releaseTypeToCategory(rt: string | ReleaseType): DiscoveryCategory {
  switch (rt) {
    case 'Album':
      return 'album';
    case 'Single':
      return 'single';
    case 'EP':
      return 'album';
    case 'Soundtrack':
      return 'soundtrack';
    case 'Compilation':
      return 'other';
    case 'Live':
      return 'live';
    default:
      return 'other';
  }
}

/**
 * Converts a MusicBrainzArtist to SangeetPremi Artist model for storage.
 */
export function mbArtistToAppArtist(mb: MusicBrainzArtist): Artist {
  return {
    id: mb.id,
    name: mb.name,
    normalizedName: mb.name.toLowerCase().trim(),
    channelId: undefined, // MusicBrainz canonical artist does not inherit a YouTube channel ID
    thumbnail: undefined,
    description: mb.disambiguation ?? (mb.area ? `Artist based in ${mb.area}` : undefined),
    country: mb.country ?? mb.area,
    subscriberCount: undefined, // Strictly stripped: YouTube subscriber count is not a canonical property
  };
}

/**
 * Determines whether a track has a verified recording playback relationship.
 * Genuine MusicBrainz URL relationships will be consumed from the backend
 * once OpenCode supplies the agreed API contract.
 * Until genuine verification is available, no recordings have a verified relationship.
 */
export function hasVerifiedRecordingStream(_t: Track): boolean {
  return false;
}

/**
 * Converts a CanonicalRecording to SangeetPremi Track model for local storage/playlists.
 */
export function canonicalRecordingToTrack(rec: CanonicalRecording, fallbackArtist: string): Track {
  // Do not trust hardcoded verified: true or infer verification from 11-char IDs.
  // Genuine MusicBrainz URL relationships will be consumed once OpenCode supplies the contract.
  const now = Date.now();
  const year = rec.releaseDate ? rec.releaseDate.slice(0, 4) : '';
  const versionTags: string[] = [rec.releaseType];
  if (year) versionTags.push(year);

  return {
    id: rec.id, // Canonical MusicBrainz recording MBID
    title: rec.title,
    normalizedTitle: rec.title.toLowerCase().trim(),
    artist: rec.artistCredit || fallbackArtist,
    channelTitle: rec.releaseGroupTitle,
    thumbnail: rec.coverArtUrl,
    durationSeconds: rec.durationSeconds,
    publishedAt: rec.releaseDate,
    viewCount: undefined, // Strictly stripped: YouTube view counts are not canonical properties
    category: releaseTypeToCategory(rec.releaseType),
    role: 'primary',
    versionTags,
    language: undefined,
    dedupeKey: `mb:${rec.id}`,
    isDuplicate: false,
    canonicalId: undefined,
    source: 'musicbrainz',
    discoveredAt: now,
    lastUpdated: now,
    youtubeVideoId: undefined,
    videoId: undefined,
    youtubeUrl: undefined,
    youtubeVerified: false,
    youtubeSource: 'none',
  };
}
