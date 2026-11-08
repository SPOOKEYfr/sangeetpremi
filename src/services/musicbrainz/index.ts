/**
 * MusicBrainz API client for SangeetPremi.
 *
 * Live-contract implementation:
 * - artist search parses the `artists` envelope;
 * - release groups use the documented browse endpoint (`/release-group?artist=`);
 * - recordings use documented browse endpoints (`/recording?artist=` and
 *   `/release?release-group=`), never an artist sub-resource;
 * - artwork comes from Cover Art Archive (`coverartarchive.org`), not a
 *   fabricated MusicBrainz path;
 * - canonical artist, release-group, release and recording MBIDs are kept.
 *
 * Compliance:
 * - at most one request per second (process-global for the default client)
 * - exponential backoff on HTTP 503/429
 * - Retry-After support (both seconds and HTTP-date forms)
 * - meaningful User-Agent
 *
 * The client is created through `createMusicBrainzClient` so tests can inject
 * a deterministic fetch implementation and clock. The named exports below use
 * one shared, process-global client.
 */
import type {
  MusicBrainzArtist,
  MusicBrainzArtistCredit,
  MusicBrainzRecording,
  MusicBrainzReleaseGroup,
} from '../../types/index';

const API_BASE = 'https://musicbrainz.org/ws/2';
const COVER_ART_BASE = 'https://coverartarchive.org';
const DEFAULT_REQUEST_INTERVAL_MS = 1000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_USER_AGENT = 'SangeetPremi/1.0 (+https://sangeetpremi.org)';

/** Inc tokens verified against the live MusicBrainz API. */
const ARTIST_SEARCH_INC = 'aliases+tags+ratings';
const ARTIST_LOOKUP_INC = 'aliases+tags+ratings';
const RELEASE_GROUP_BROWSE_INC = 'artist-credits';
const RECORDING_BROWSE_INC = 'artist-credits+isrcs';
const RELEASE_BROWSE_INC = 'recordings+artist-credits';
const RECORDING_LOOKUP_INC = 'releases+release-groups';
const RECORDING_RELATIONSHIP_LOOKUP_INC = 'url-rels+artist-credits+isrcs';
const RELEASE_GROUP_LOOKUP_INC = 'artist-credits';

/** Cover Art Archive image URLs for one release group. */
export interface CoverArt {
  front?: string;
  back?: string;
  thumb?: string;
}

/**
 * MusicBrainz recording plus the release/release-group context exposed by the
 * discovery engine. `MusicBrainzRecording` itself is the shared catalogue type.
 */
export interface MusicBrainzRecordingResult extends MusicBrainzRecording {
  firstreleaseyear?: number;
}

/**
 * Explicit provenance for a recording-to-YouTube decision.
 *
 * `verified` is true only when MusicBrainz itself attaches a qualifying
 * YouTube/YouTube Music URL relationship to the exact recording MBID that was
 * looked up. A caller-supplied boolean, a title match, or an arbitrary
 * valid-looking video ID can never produce a verified result.
 */
export type MusicBrainzYouTubeVerificationStatus =
  | 'verified'
  | 'unmapped'
  | 'invalid-mbid'
  | 'recording-not-found';

export interface MusicBrainzRecordingYouTubeRelationship {
  /** Canonical MusicBrainz recording MBID used for the lookup. */
  recordingMBID: string;
  /** Validated recording metadata, when the recording was found. */
  recordingTitle?: string;
  artistCredit?: string[];
  lengthSeconds?: number;
  isrc?: string;
  /** Exact URL attached by the MusicBrainz relationship, or null. */
  relationshipUrl: string | null;
  /** Exact MusicBrainz relationship type, or null. */
  relationshipType: string | null;
  relationshipDirection: 'forward' | 'backward' | null;
  /** This decision is always sourced from MusicBrainz. */
  source: 'musicbrainz';
  verificationStatus: MusicBrainzYouTubeVerificationStatus;
  verified: boolean;
  youtubeVideoId: string | null;
  /** Canonical YouTube watch URL derived from the relationship URL. */
  youtubeUrl: string | null;
}

/** Dependencies that can be replaced by tests. */
export interface MusicBrainzClientOptions {
  /** Fetch implementation. Defaults to global fetch, resolved lazily at call time. */
  fetchImpl?: typeof fetch;
  /** Clock used for rate limiting and HTTP-date Retry-After values. */
  now?: () => number;
  /** Sleep implementation. Tests can advance a fake clock instead of waiting. */
  sleep?: (ms: number) => Promise<void>;
  /** Minimum time between request starts. Defaults to 1000 ms. */
  requestIntervalMs?: number;
  /** Number of retries after the initial attempt. Defaults to 5. */
  maxRetries?: number;
  /** Base for exponential backoff. Defaults to 1000 ms. */
  baseBackoffMs?: number;
  /** User-Agent sent with every request. */
  userAgent?: string;
}

export interface MusicBrainzClient {
  searchArtists(name: string, limit?: number): Promise<MusicBrainzArtist[]>;
  getArtistByMBID(mbid: string, inc?: string): Promise<MusicBrainzArtist | null>;
  getReleaseGroupsByArtistMBID(
    artistMBID: string,
    inc?: string,
    limit?: number,
  ): Promise<MusicBrainzReleaseGroup[]>;
  getRecordingsByArtistMBID(
    artistMBID: string,
    inc?: string,
    limit?: number,
  ): Promise<MusicBrainzRecordingResult[]>;
  getRecordingsByReleaseGroupMBID(
    releaseGroupMBID: string,
    inc?: string,
    limit?: number,
  ): Promise<MusicBrainzRecordingResult[]>;
  getCoverArtArchive(recordingMBID: string): Promise<CoverArt>;
  getCoverArtArchiveByReleaseGroupMBID(releaseGroupMBID: string): Promise<CoverArt>;
  getArtistCreditsForReleaseGroup(releaseGroupMBID: string): Promise<MusicBrainzArtistCredit[]>;
  getRecordingYouTubeRelationship(
    recordingMBID: string,
  ): Promise<MusicBrainzRecordingYouTubeRelationship>;
}

/** Error raised for non-2xx responses and unreadable/malformed response bodies. */
export class MusicBrainzError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'MusicBrainzError';
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(record: UnknownRecord, key: string): UnknownRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function readArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function readStringArray(record: UnknownRecord, key: string): string[] {
  return readArray(record, key).filter((value): value is string => typeof value === 'string');
}

/** Read the first array found under any of the supplied exact keys. */
function readCollection(payload: unknown, ...keys: string[]): unknown[] {
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

function readRating(record: UnknownRecord): number | undefined {
  const rating = readRecord(record, 'rating');
  return rating ? readNumber(rating, 'value') : undefined;
}

function mapArtistType(value: string | undefined): MusicBrainzArtist['type'] {
  return value === 'Group' || value === 'Person' || value === 'Corporation' ? value : undefined;
}

function mapArtist(value: unknown): MusicBrainzArtist | null {
  if (!isRecord(value)) return null;

  const id = readString(value, 'id');
  const name = readString(value, 'name');
  if (!id || !name) return null;

  const area = readRecord(value, 'area');
  const isoCodes = area ? readStringArray(area, 'iso-3166-1-codes') : [];
  const isoCode = isoCodes[0] ?? (area ? readString(area, 'iso31661Code') : undefined);
  const areaName = area ? readString(area, 'name') : undefined;
  const rawType = readString(value, 'type');

  return {
    id,
    name,
    sortName: readString(value, 'sort-name') ?? readString(value, 'sortName'),
    type: mapArtistType(rawType),
    country: readString(value, 'country'),
    area: area ? { iso31661Code: isoCode, name: areaName } : undefined,
    disambiguation: readString(value, 'disambiguation'),
    score: readNumber(value, 'score'),
    rating: readRating(value),
    primary_type: rawType,
  };
}

function mapPrimaryType(value: string | undefined): MusicBrainzReleaseGroup['primarytype'] {
  return value === 'Album' || value === 'Single' || value === 'EP' || value === 'Compilation'
    ? value
    : '';
}

function mapArtistCredits(value: unknown): Array<{ artist: { id: string; name: string } }> {
  if (!Array.isArray(value)) return [];

  const credits: Array<{ artist: { id: string; name: string } }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;

    const artist = readRecord(entry, 'artist');
    const id = artist ? readString(artist, 'id') : readString(entry, 'id');
    const name = (artist ? readString(artist, 'name') : undefined) ?? readString(entry, 'name');
    if (!name) continue;

    credits.push({ artist: { id: id ?? '', name } });
  }
  return credits;
}

function extractLabel(record: UnknownRecord): string | undefined {
  const labelInfo = record['label-info'];
  if (!Array.isArray(labelInfo)) return undefined;

  for (const entry of labelInfo) {
    if (!isRecord(entry)) continue;
    const label = readRecord(entry, 'label');
    const name = label ? readString(label, 'name') : undefined;
    if (name) return name;
  }
  return undefined;
}

function mapReleaseGroup(value: unknown): MusicBrainzReleaseGroup | null {
  if (!isRecord(value)) return null;

  const id = readString(value, 'id');
  const title = readString(value, 'title');
  if (!id || !title) return null;

  return {
    id,
    title,
    primarytype: mapPrimaryType(
      readString(value, 'primary-type') ?? readString(value, 'primarytype'),
    ),
    textlabel: extractLabel(value) ?? readString(value, 'textlabel'),
    firstreleaseyear:
      readNumber(value, 'firstreleaseyear') ??
      parseYear(readString(value, 'first-release-date')),
    disambiguation: readString(value, 'disambiguation'),
    secondarytypes: readStringArray(value, 'secondary-types'),
    artist_credit: mapArtistCredits(value['artist-credit'] ?? value['artist_credit']),
  };
}

function normalizeLength(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  // MusicBrainz always reports recording/track lengths in milliseconds.
  return Math.round(value / 1000);
}

function mapRecording(value: unknown): MusicBrainzRecordingResult | null {
  if (!isRecord(value)) return null;

  const id = readString(value, 'id');
  const title = readString(value, 'title');
  if (!id || !title) return null;

  const firstReleaseDate = readString(value, 'first-release-date');

  return {
    id,
    title,
    length: normalizeLength(readNumber(value, 'length')),
    textlabel: extractLabel(value) ?? readString(value, 'textlabel'),
    isrc: readString(value, 'isrc') ?? readStringArray(value, 'isrcs')[0],
    coverartimage: readString(value, 'coverartimage'),
    coverartthumb: readString(value, 'coverartthumb'),
    firstReleaseDate,
    firstreleaseyear: parseYear(firstReleaseDate),
    video: typeof value.video === 'boolean' ? value.video : undefined,
    artist_credit: mapArtistCredits(value['artist-credit'] ?? value['artist_credit']),
  };
}

/**
 * Map a release (with `inc=recordings+artist-credits`) into recording results.
 * A release track's `id` is the track MBID; the canonical recording MBID is
 * `track.recording.id`.
 */
function mapReleaseRecordings(
  release: unknown,
  releaseGroupMBID: string,
): MusicBrainzRecordingResult[] {
  if (!isRecord(release)) return [];

  const releaseId = readString(release, 'id');
  const releaseTitle = readString(release, 'title');
  const releaseDate = readString(release, 'date');
  const releaseCredits = release['artist-credit'];
  const results: MusicBrainzRecordingResult[] = [];

  for (const media of readArray(release, 'media')) {
    if (!isRecord(media)) continue;
    for (const track of readArray(media, 'tracks')) {
      if (!isRecord(track)) continue;

      const recording = readRecord(track, 'recording') ?? track;
      const id = readString(recording, 'id');
      const title = readString(recording, 'title') ?? readString(track, 'title');
      if (!id || !title) continue;

      const firstReleaseDate = readString(recording, 'first-release-date') ?? releaseDate;
      const length = readNumber(recording, 'length') ?? readNumber(track, 'length');

      results.push({
        id,
        title,
        length: normalizeLength(length),
        isrc:
          readString(recording, 'isrc') ?? readStringArray(recording, 'isrcs')[0],
        firstReleaseDate,
        firstreleaseyear: parseYear(firstReleaseDate),
        releaseGroupId: releaseGroupMBID,
        releaseId,
        releaseTitle,
        video: typeof recording.video === 'boolean' ? recording.video : undefined,
        artist_credit: mapArtistCredits(
          recording['artist-credit'] ?? track['artist-credit'] ?? releaseCredits,
        ),
      });
    }
  }

  return results;
}

function preferRecording(
  current: MusicBrainzRecordingResult,
  next: MusicBrainzRecordingResult,
): MusicBrainzRecordingResult {
  const merged: MusicBrainzRecordingResult = {
    ...current,
    isrc: current.isrc ?? next.isrc,
    length: current.length ?? next.length,
    releaseGroupId: current.releaseGroupId ?? next.releaseGroupId,
    releaseId: current.releaseId ?? next.releaseId,
    releaseTitle: current.releaseTitle ?? next.releaseTitle,
    firstReleaseDate: current.firstReleaseDate ?? next.firstReleaseDate,
    firstreleaseyear: current.firstreleaseyear ?? next.firstreleaseyear,
    artist_credit:
      current.artist_credit.length > 0 ? current.artist_credit : next.artist_credit,
  };

  if (current.firstReleaseDate && next.firstReleaseDate) {
    return next.firstReleaseDate < current.firstReleaseDate ? { ...merged, ...next, isrc: merged.isrc } : merged;
  }
  return merged;
}

function dedupeRecordings(
  recordings: MusicBrainzRecordingResult[],
): MusicBrainzRecordingResult[] {
  const byId = new Map<string, MusicBrainzRecordingResult>();
  for (const recording of recordings) {
    const existing = byId.get(recording.id);
    byId.set(recording.id, existing ? preferRecording(existing, recording) : recording);
  }
  return [...byId.values()];
}

function mapReleaseGroupArtistCredit(value: unknown): MusicBrainzArtistCredit | null {
  if (!isRecord(value)) return null;

  const artist = readRecord(value, 'artist');
  const id = (artist ? readString(artist, 'id') : undefined) ?? readString(value, 'id');
  const name = (artist ? readString(artist, 'name') : undefined) ?? readString(value, 'name');
  if (!name) return null;

  return {
    artistID: id ?? '',
    name,
    artist: { id: id ?? '', name },
  };
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith('http://') ? `https://${value.slice('http://'.length)}` : value;
}

function mapCoverArt(payload: unknown): CoverArt {
  if (!isRecord(payload)) return {};

  let front: string | undefined;
  let back: string | undefined;
  let thumb: string | undefined;
  let firstImage: string | undefined;

  for (const entry of readArray(payload, 'images')) {
    if (!isRecord(entry)) continue;

    const image = normalizeHttpUrl(readString(entry, 'image'));
    if (!image) continue;
    firstImage ??= image;

    const isFront = entry.front === true;
    const isBack = entry.back === true;
    const thumbnails = readRecord(entry, 'thumbnails');

    if (isFront && !front) {
      front = image;
      const thumbnail =
        (thumbnails ? readString(thumbnails, '250') : undefined) ??
        (thumbnails ? readString(thumbnails, '500') : undefined) ??
        (thumbnails ? readString(thumbnails, 'small') : undefined) ??
        (thumbnails ? readString(thumbnails, 'large') : undefined) ??
        image;
      thumb = normalizeHttpUrl(thumbnail);
    }
    if (isBack && !back) back = image;
  }

  if (!front && firstImage) {
    front = firstImage;
    thumb ??= firstImage;
  }

  return { front, back, thumb };
}

/** Resolve a recording to its release-group MBID from the live wire shape. */
function extractReleaseGroupMBID(recording: unknown): string | undefined {
  if (!isRecord(recording)) return undefined;

  const firstRelease = readRecord(recording, 'firstRelease');
  if (firstRelease) {
    const releaseGroup = readRecord(firstRelease, 'releaseGroup');
    const id = releaseGroup
      ? readString(releaseGroup, 'id') ?? readString(releaseGroup, 'mbid')
      : undefined;
    if (id) return id;
  }

  for (const release of readArray(recording, 'releases')) {
    if (!isRecord(release)) continue;
    const releaseGroup =
      readRecord(release, 'release-group') ?? readRecord(release, 'releaseGroup');
    const id = releaseGroup
      ? readString(releaseGroup, 'id') ?? readString(releaseGroup, 'mbid')
      : undefined;
    if (id) return id;
  }

  return undefined;
}

function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined;

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && String(seconds) === value.trim()) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - nowMs);
  return undefined;
}

function isRetryable(error: unknown): error is MusicBrainzError {
  return (
    error instanceof MusicBrainzError && (error.status === 503 || error.status === 429)
  );
}

/** Read one response body exactly once, then validate status and JSON. */
async function readJsonResponse(response: Response, nowMs: number): Promise<unknown> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new MusicBrainzError('MusicBrainz response body could not be read', response.status);
  }

  if (!response.ok) {
    const detail = body.trim().slice(0, 200);
    const suffix = detail.length > 0 ? `: ${detail}` : '';
    throw new MusicBrainzError(
      `MusicBrainz request failed with HTTP ${response.status}${suffix}`,
      response.status,
      parseRetryAfter(response.headers.get('retry-after'), nowMs),
    );
  }

  if (body.trim().length === 0) {
    throw new MusicBrainzError('MusicBrainz returned an empty response body', response.status);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new MusicBrainzError('MusicBrainz returned malformed JSON', response.status);
  }
}

function isValidMBID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

interface RecordingUrlRelation {
  type: string;
  direction: 'forward' | 'backward' | undefined;
  url: string;
}

interface ParsedYouTubeRelationshipUrl {
  videoId: string;
  canonicalUrl: string;
  hostRank: number;
}

interface YouTubeRelationshipMatch {
  relation: RecordingUrlRelation;
  parsed: ParsedYouTubeRelationshipUrl;
  typeRank: number;
}

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Only streaming relationships may supply playback. A YouTube-hosted URL
 * attached under an unrelated relationship type (for example "official
 * homepage") is not a recording playback relationship.
 */
const PLAYBACK_RELATIONSHIP_TYPE_RANKS = new Map<string, number>([
  ['free streaming', 0],
  ['streaming', 1],
]);

/** Prefer the canonical YouTube watch host, then mirror/short hosts. */
const YOUTUBE_HOST_RANKS = new Map<string, number>([
  ['youtube.com', 0],
  ['www.youtube.com', 0],
  ['m.youtube.com', 1],
  ['music.youtube.com', 2],
  ['youtu.be', 3],
]);

/**
 * Read the `relations` array from a recording lookup. Missing `relations`
 * means the recording has none; a present non-array is malformed and must not
 * be mistaken for an absence of a relationship.
 */
function readRecordingUrlRelations(payload: UnknownRecord): RecordingUrlRelation[] {
  const value = payload.relations;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new MusicBrainzError('MusicBrainz returned malformed recording relationships');
  }

  const relations: RecordingUrlRelation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new MusicBrainzError('MusicBrainz returned a malformed recording relationship');
    }

    const type = readString(entry, 'type');
    const urlRecord = readRecord(entry, 'url');
    const resource = urlRecord ? readString(urlRecord, 'resource') : undefined;
    if (!type || !resource) {
      throw new MusicBrainzError('MusicBrainz returned a malformed recording relationship');
    }

    const direction =
      entry.direction === 'forward' || entry.direction === 'backward'
        ? entry.direction
        : undefined;
    relations.push({ type, direction, url: resource });
  }
  return relations;
}

/**
 * Extract a YouTube video ID only from an exact MusicBrainz relationship URL.
 * A lone 11-character string, a video title, or a search result can never enter
 * this function as a verification source.
 */
function parseYouTubeRelationshipUrl(
  resource: string,
): ParsedYouTubeRelationshipUrl | null {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const hostRank = YOUTUBE_HOST_RANKS.get(host);
  if (hostRank === undefined) return null;

  let videoId: string | undefined;
  if (host === 'youtu.be') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    videoId = segments[0];
  } else {
    if (url.pathname !== '/watch' && url.pathname !== '/watch/') return null;
    const values = url.searchParams.getAll('v');
    if (values.length !== 1) return null;
    videoId = values[0];
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_RE.test(videoId)) return null;

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    hostRank,
  };
}

function findYouTubeRelationship(
  relations: RecordingUrlRelation[],
): YouTubeRelationshipMatch | null {
  const candidates: Array<YouTubeRelationshipMatch & { index: number }> = [];

  relations.forEach((relation, index) => {
    const typeRank = PLAYBACK_RELATIONSHIP_TYPE_RANKS.get(
      relation.type.trim().toLowerCase(),
    );
    if (typeRank === undefined) return;

    const parsed = parseYouTubeRelationshipUrl(relation.url);
    if (!parsed) return;

    candidates.push({ relation, parsed, typeRank, index });
  });

  candidates.sort(
    (a, b) =>
      a.typeRank - b.typeRank ||
      a.parsed.hostRank - b.parsed.hostRank ||
      a.index - b.index,
  );

  const best = candidates[0];
  if (!best) return null;
  return { relation: best.relation, parsed: best.parsed, typeRank: best.typeRank };
}

function unmappedRecordingYouTubeRelationship(
  recordingMBID: string,
  verificationStatus: Exclude<MusicBrainzYouTubeVerificationStatus, 'verified'>,
  recording?: MusicBrainzRecordingResult,
): MusicBrainzRecordingYouTubeRelationship {
  return {
    recordingMBID,
    ...(recording
      ? {
          recordingTitle: recording.title,
          artistCredit: recording.artist_credit.map((credit) => credit.artist.name),
          lengthSeconds: recording.length,
          isrc: recording.isrc,
        }
      : {}),
    relationshipUrl: null,
    relationshipType: null,
    relationshipDirection: null,
    source: 'musicbrainz',
    verificationStatus,
    verified: false,
    youtubeVideoId: null,
    youtubeUrl: null,
  };
}

function verifiedRecordingYouTubeRelationship(
  recording: MusicBrainzRecordingResult,
  relation: RecordingUrlRelation,
  parsed: ParsedYouTubeRelationshipUrl,
): MusicBrainzRecordingYouTubeRelationship {
  return {
    recordingMBID: recording.id,
    recordingTitle: recording.title,
    artistCredit: recording.artist_credit.map((credit) => credit.artist.name),
    lengthSeconds: recording.length,
    isrc: recording.isrc,
    relationshipUrl: relation.url,
    relationshipType: relation.type,
    relationshipDirection: relation.direction ?? null,
    source: 'musicbrainz',
    verificationStatus: 'verified',
    verified: true,
    youtubeVideoId: parsed.videoId,
    youtubeUrl: parsed.canonicalUrl,
  };
}

/**
 * Create an isolated MusicBrainz client. Each instance owns its queue and
 * rate-limit clock, so tests never share scheduler state.
 */
export function createMusicBrainzClient(
  options: MusicBrainzClientOptions = {},
): MusicBrainzClient {
  const fetchImpl: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const requestIntervalMs = Math.max(0, options.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS);
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
  const baseBackoffMs = Math.max(0, options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  let tail: Promise<void> = Promise.resolve();
  let nextRequestAt = 0;

  /** Serialize complete operations (including retries) for this client. */
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function waitForSlot(): Promise<void> {
    const waitMs = Math.max(0, nextRequestAt - now());
    if (waitMs > 0) await sleep(waitMs);
    nextRequestAt = now() + requestIntervalMs;
  }

  async function fetchJson(url: URL): Promise<unknown> {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    });
    return readJsonResponse(response, now());
  }

  async function requestUrl(url: URL): Promise<unknown> {
    return enqueue(async () => {
      let attempt = 0;
      for (;;) {
        await waitForSlot();
        try {
          return await fetchJson(url);
        } catch (error) {
          if (!isRetryable(error) || attempt >= maxRetries) throw error;

          const delayMs = error.retryAfterMs ?? baseBackoffMs * 2 ** attempt;
          attempt += 1;
          await sleep(delayMs);
        }
      }
    });
  }

  async function requestJson(
    path: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const url = new URL(API_BASE + path);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('timeout', '10');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return requestUrl(url);
  }

  async function getCoverArtArchiveByReleaseGroupMBID(
    releaseGroupMBID: string,
  ): Promise<CoverArt> {
    if (!isValidMBID(releaseGroupMBID)) return {};

    try {
      const payload = await requestUrl(
        new URL(`${COVER_ART_BASE}/release-group/${releaseGroupMBID}`),
      );
      return mapCoverArt(payload);
    } catch {
      // Missing artwork must never break catalogue discovery.
      return {};
    }
  }

  return {
    async searchArtists(name, limit = 10) {
      const clampedLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
      const payload = await requestJson('/artist', {
        query: name,
        limit: String(clampedLimit),
        inc: ARTIST_SEARCH_INC,
      });

      const artists = readCollection(payload, 'artists')
        .map(mapArtist)
        .filter((artist): artist is MusicBrainzArtist => artist !== null);

      // Exact-name matches are the safest identity resolution candidate.
      const normalizedName = name.trim().toLocaleLowerCase();
      artists.sort(
        (a, b) =>
          Number(b.name.toLocaleLowerCase() === normalizedName) -
          Number(a.name.toLocaleLowerCase() === normalizedName),
      );

      return artists.slice(0, clampedLimit);
    },

    async getArtistByMBID(mbid, inc = ARTIST_LOOKUP_INC) {
      if (!isValidMBID(mbid)) return null;
      const payload = await requestJson(`/artist/${mbid}`, { inc });
      return mapArtist(payload);
    },

    async getReleaseGroupsByArtistMBID(
      artistMBID,
      inc = RELEASE_GROUP_BROWSE_INC,
      limit = 50,
    ) {
      if (!isValidMBID(artistMBID)) return [];
      const payload = await requestJson('/release-group', {
        artist: artistMBID,
        inc,
        limit: String(Math.min(Math.max(Math.floor(limit), 1), 100)),
      });

      return readCollection(payload, 'release-groups')
        .map(mapReleaseGroup)
        .filter((group): group is MusicBrainzReleaseGroup => group !== null);
    },

    async getRecordingsByArtistMBID(
      artistMBID,
      inc = RECORDING_BROWSE_INC,
      limit = 50,
    ) {
      if (!isValidMBID(artistMBID)) return [];
      const payload = await requestJson('/recording', {
        artist: artistMBID,
        inc,
        limit: String(Math.min(Math.max(Math.floor(limit), 1), 100)),
      });

      return readCollection(payload, 'recordings')
        .map(mapRecording)
        .filter((recording): recording is MusicBrainzRecordingResult => recording !== null);
    },

    async getRecordingsByReleaseGroupMBID(
      releaseGroupMBID,
      inc = RELEASE_BROWSE_INC,
      limit = 50,
    ) {
      if (!isValidMBID(releaseGroupMBID)) return [];
      const payload = await requestJson('/release', {
        'release-group': releaseGroupMBID,
        inc,
        limit: String(Math.min(Math.max(Math.floor(limit), 1), 100)),
      });

      const recordings: MusicBrainzRecordingResult[] = [];
      for (const release of readCollection(payload, 'releases')) {
        recordings.push(...mapReleaseRecordings(release, releaseGroupMBID));
      }
      return dedupeRecordings(recordings);
    },

    async getCoverArtArchive(recordingMBID) {
      if (!isValidMBID(recordingMBID)) return {};

      try {
        const recording = await requestJson(`/recording/${recordingMBID}`, {
          inc: RECORDING_LOOKUP_INC,
        });
        const releaseGroupMBID = extractReleaseGroupMBID(recording);
        if (!releaseGroupMBID) return {};
        return await getCoverArtArchiveByReleaseGroupMBID(releaseGroupMBID);
      } catch {
        // Missing artwork must never break catalogue discovery.
        return {};
      }
    },

    async getRecordingYouTubeRelationship(recordingMBID) {
      const requested = typeof recordingMBID === 'string' ? recordingMBID.trim() : '';
      if (!isValidMBID(requested)) {
        return unmappedRecordingYouTubeRelationship(requested, 'invalid-mbid');
      }

      let payload: unknown;
      try {
        payload = await requestJson(`/recording/${requested}`, {
          inc: RECORDING_RELATIONSHIP_LOOKUP_INC,
        });
      } catch (error) {
        if (error instanceof MusicBrainzError && error.status === 404) {
          return unmappedRecordingYouTubeRelationship(requested, 'recording-not-found');
        }
        throw error;
      }

      if (!isRecord(payload)) {
        throw new MusicBrainzError('MusicBrainz returned an invalid recording lookup response');
      }

      const recording = mapRecording(payload);
      if (!recording || recording.id.toLowerCase() !== requested.toLowerCase()) {
        throw new MusicBrainzError('MusicBrainz returned an invalid recording lookup response');
      }

      const relations = readRecordingUrlRelations(payload);
      const match = findYouTubeRelationship(relations);
      if (!match) {
        return unmappedRecordingYouTubeRelationship(recording.id, 'unmapped', recording);
      }

      return verifiedRecordingYouTubeRelationship(recording, match.relation, match.parsed);
    },

    getCoverArtArchiveByReleaseGroupMBID,

    async getArtistCreditsForReleaseGroup(releaseGroupMBID) {
      if (!isValidMBID(releaseGroupMBID)) return [];
      const payload = await requestJson(`/release-group/${releaseGroupMBID}`, {
        inc: RELEASE_GROUP_LOOKUP_INC,
      });
      if (!isRecord(payload)) return [];

      return readArray(payload, 'artist-credit')
        .map(mapReleaseGroupArtistCredit)
        .filter((credit): credit is MusicBrainzArtistCredit => credit !== null);
    },
  };
}

/** Lazily created process-global client used by the application. */
let defaultClient: MusicBrainzClient | null = null;

/**
 * The client owned by the process that imports this module. In the extension
 * that process is the MV3 background service worker, which makes this the one
 * scheduler every UI request is routed to. Creation is lazy so merely
 * importing types or the UI bridge never starts a second scheduler.
 */
export function getSharedMusicBrainzClient(): MusicBrainzClient {
  defaultClient ??= createMusicBrainzClient();
  return defaultClient;
}

export function searchArtists(name: string, limit = 10): Promise<MusicBrainzArtist[]> {
  return getSharedMusicBrainzClient().searchArtists(name, limit);
}

export function getArtistByMBID(
  mbid: string,
  inc: string = ARTIST_LOOKUP_INC,
): Promise<MusicBrainzArtist | null> {
  return getSharedMusicBrainzClient().getArtistByMBID(mbid, inc);
}

export function getReleaseGroupsByArtistMBID(
  artistMBID: string,
  inc: string = RELEASE_GROUP_BROWSE_INC,
  limit = 50,
): Promise<MusicBrainzReleaseGroup[]> {
  return getSharedMusicBrainzClient().getReleaseGroupsByArtistMBID(artistMBID, inc, limit);
}

export function getRecordingsByArtistMBID(
  artistMBID: string,
  inc: string = RECORDING_BROWSE_INC,
  limit = 50,
): Promise<MusicBrainzRecordingResult[]> {
  return getSharedMusicBrainzClient().getRecordingsByArtistMBID(artistMBID, inc, limit);
}

export function getRecordingsByReleaseGroupMBID(
  releaseGroupMBID: string,
  inc: string = RELEASE_BROWSE_INC,
  limit = 50,
): Promise<MusicBrainzRecordingResult[]> {
  return getSharedMusicBrainzClient().getRecordingsByReleaseGroupMBID(releaseGroupMBID, inc, limit);
}

export function getCoverArtArchive(recordingMBID: string): Promise<CoverArt> {
  return getSharedMusicBrainzClient().getCoverArtArchive(recordingMBID);
}

export function getCoverArtArchiveByReleaseGroupMBID(
  releaseGroupMBID: string,
): Promise<CoverArt> {
  return getSharedMusicBrainzClient().getCoverArtArchiveByReleaseGroupMBID(releaseGroupMBID);
}

export function getArtistCreditsForReleaseGroup(
  releaseGroupMBID: string,
): Promise<MusicBrainzArtistCredit[]> {
  return getSharedMusicBrainzClient().getArtistCreditsForReleaseGroup(releaseGroupMBID);
}

export function getRecordingYouTubeRelationship(
  recordingMBID: string,
): Promise<MusicBrainzRecordingYouTubeRelationship> {
  return getSharedMusicBrainzClient().getRecordingYouTubeRelationship(recordingMBID);
}
