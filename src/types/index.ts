/**
 * SangeetPremi core data models.
 * MusicBrainz-first architecture.
 * Shared by the dashboard app, popup, side panel and background worker.
 */

export type DiscoveryCategory =
  | 'official'
  | 'album'
  | 'single'
  | 'soundtrack'
  | 'collaboration'
  | 'featured'
  | 'duet'
  | 'live'
  | 'acoustic'
  | 'unplugged'
  | 'remix'
  | 'cover'
  | 'instrumental'
  | 'other';

export const DISCOVERY_CATEGORIES: { id: DiscoveryCategory; label: string; description: string }[] = [
  { id: 'official', label: 'Official Songs', description: 'Official audio/video releases' },
  { id: 'album', label: 'Album Tracks', description: 'Songs from albums' },
  { id: 'single', label: 'Singles', description: 'Standalone single releases' },
  { id: 'soundtrack', label: 'Movie Soundtracks', description: 'Playback songs from films' },
  { id: 'collaboration', label: 'Collaborations', description: 'Songs with other primary artists' },
  { id: 'featured', label: 'Featured Appearances', description: 'Songs where the artist is featured' },
  { id: 'duet', label: 'Duets', description: 'Duet recordings' },
  { id: 'live', label: 'Live Performances', description: 'Live concert recordings' },
  { id: 'acoustic', label: 'Acoustic Versions', description: 'Acoustic re‑recordings and stripped‑back versions' },
  { id: 'unplugged', label: 'Unplugged', description: 'Unplugged or acoustic live performances' },
  { id: 'remix', label: 'Remix', description: 'Official or unofficial remixes' },
  { id: 'cover', label: 'Cover', description: 'Cover versions of existing songs' },
  { id: 'instrumental', label: 'Instrumental', description: 'Instrumental versions or tracks' },
  { id: 'other', label: 'Other', description: 'Songs that do not fit the above categories' }
];

/**
 * SangeetPremi core data models.
 * MusicBrainz-first architecture.
 * Shared by the dashboard app, popup, side panel and background worker.
 * 
 * YouTube API data is strictly separate and optional (link-outs only).
 * No mandatory API keys, OAuth, or paid services for core catalogue.
 */

// =======================
// MusicBrainz Types
// =======================

/** MusicBrainz Artist (canonical catalogue identity). */
export interface MusicBrainzArtist {
  id: string; // MBID
  name: string;
  sortName?: string;
  type?: 'Group' | 'Person' | 'Corporation';
  country?: string;
  area?: { iso31661Code?: string; name?: string };
  /** MusicBrainz disambiguation comment, e.g. "UK rock group". */
  disambiguation?: string;
  /** Search relevance score (0-100) when returned by artist search. */
  score?: number;
  gender?: string;
  rating?: number;
  abbreviation?: string;
  realname?: string[];
  beginning_date?: string;
  ending_date?: string;
  primary_type?: string;
  rating_label?: string;
}

/** MusicBrainz Release Group. */
export interface MusicBrainzReleaseGroup {
  id: string; // MBID
  title: string;
  primarytype: 'Album' | 'Single' | 'EP' | 'Compilation' | '';
  textlabel?: string;
  firstreleaseyear?: number;
  endyear?: number;
  disambiguation?: string;
  /** MusicBrainz secondary types, e.g. ["Live"], ["Soundtrack"]. */
  secondarytypes?: string[];
  artist_credit: Array<{ artist: { id: string; name: string } }>;
}

/** MusicBrainz Recording (canonical catalogue identity). */
export interface MusicBrainzRecording {
  id: string; // MBID
  title: string;
  length?: number; // in seconds
  textlabel?: string;
  isrc?: string;
  coverartimage?: string; // Cover Art Archive front
  coverartthumb?: string; // Cover Art Archive thumb
  /** First release date reported by MusicBrainz, if available. */
  firstReleaseDate?: string;
  /** Release-group MBID this recording was retrieved through. */
  releaseGroupId?: string;
  /** Release MBID this recording was retrieved through. */
  releaseId?: string;
  /** Release title this recording was retrieved through. */
  releaseTitle?: string;
  /** MusicBrainz recording video flag. */
  video?: boolean;
  artist_credit: Array<{ artist: { id: string; name: string } }>;
}

/** MusicBrainz Artist Credit. */
export interface MusicBrainzArtistCredit {
  artistID: string; // MBID (may be empty if unknown)
  name: string;
  artist: { id: string; name: string };
}

// =======================
// Core Catalogue Types
// =======================

/** Core Artist identity — MusicBrainz MBID when known. */
export interface Artist {
  /** MusicBrainz MBID when available; otherwise a slug derived from name. */
  id: string;
  name: string;
  normalizedName: string;
  /** MBID of the primary artist credit, if resolved. */
  mbid?: string;
  /** MusicBrainz artist type (Group, Person, Corporation), when known. */
  type?: MusicBrainzArtist['type'];
  /** MusicBrainz disambiguation comment, shown to distinguish same-name artists. */
  disambiguation?: string;
  /** Channel ID when YouTube-connected (optional, never mandatory). */
  channelId?: string;
  /** Cover/artist image URL only when it comes from a real source. */
  thumbnail?: string;
  description?: string;
  country?: string;
  /** Optional YouTube subscriber count — only if user has configured API key. */
  subscriberCount?: number;
}

/** Core Track identity — MusicBrainz recording MBID when known. */
export interface Track {
  /** MusicBrainz recording MBID — primary catalogue identity. */
  id: string; // MBID
  title: string;
  normalizedTitle: string;
  artist: string;
  /** MBID of the keeping representative when isDuplicate. */
  canonicalId?: string;
  /** YouTube video ID — only when a genuine traceable relationship exists. */
  youtubeVideoId?: string;
  /** Canonical YouTube watch URL — only when youtubeVideoId is set. */
  youtubeUrl?: string;
  /** True if YouTube link is a verified recording-to-video relationship. */
  youtubeVerified: boolean;
  /** Source of the YouTube link: 'link-out' (MusicBrainz-verified) or 'search' (programmatic). */
  youtubeSource?: 'link-out' | 'search' | 'none';
  /** All known version tags (from MusicBrainz or user-added). */
  versionTags: string[];
  /** Optional duration in seconds. */
  durationSeconds?: number;
  /** Optional — the release this track belongs to. */
  releaseId?: string;
  /** Optional — the release group this track belongs to. */
  releaseGroupId?: string;
  /** Optional — language code (e.g. 'en', 'de'). */
  language?: string;
  /** Dedup key. */
  dedupeKey: string;
  /** True if this track is a duplicate of the canonical representative. */
  isDuplicate: boolean;
  /** Canonical ID of the representative track when isDuplicate. */
  canonicalTrackId?: string;
  /** Optional — year of release. */
  year?: number;
  /** Optional — catalog number or ISRC. */
  isrc?: string;
  /** Optional — additional metadata. */
  metadata?: Record<string, any>;
  /** When the track was first discovered/added. */
  discoveredAt: number;
  /** When the track was last updated. */
  lastUpdated: number;
  /** Optional — YouTube video ID (backward compatibility with GUI). */
  videoId?: string;
  /** Optional — YouTube view count (backward compatibility with GUI). */
  viewCount?: number;
  /** Optional — YouTube published date (backward compatibility with GUI). */
  publishedAt?: string;
  /** Optional — Cover Art Archive image URL when available. Never fabricated. */
  thumbnail?: string;
  /** Optional — YouTube channel name (backward compatibility); never set for MB-only tracks. */
  channelTitle?: string;
  /** Optional — discovery category (backward compatibility with GUI). */
  category?: DiscoveryCategory;
  /** Optional — artist role (backward compatibility with GUI). */
  role?: ArtistRole;
  /** Source of the track discovery: 'musicbrainz' or 'youtube'. */
  source?: string;
}

/** Core Release. */
export interface Release {
  id: string; // MusicBrainz release MBID
  title: string;
  primarytype: 'Album' | 'Single' | 'EP' | 'Compilation' | '';
  year?: number;
  artist: Artist; // Primary artist
  trackCount?: number;
  disambiguation?: string;
}

/** Core Release Group. */
export interface ReleaseGroup {
  id: string; // MusicBrainz release group MBID
  title: string;
  primarytype: 'Album' | 'Single' | 'EP' | 'Compilation' | '';
  year?: number;
  artist: Artist; // Primary artist (or Various Artists)
  trackCount?: number;
  firstRelease?: Release; // The earliest release in the group
  disambiguation?: string;
}

/** Discovery Report — now MBJ-centric. */
export interface DiscoveryReport {
  query: string;
  artistId?: string; // MusicBrainz MBID when available
  candidatesFound: number; // MusicBrainz artist matches
  accepted: number; // Tracks kept after dedup
  duplicatesRemoved: number;
  /** Total tracks excluded by dedup/category filtering. */
  excluded: number;
  exclusionReasons: Record<string, number>;
  startedAt: number;
  finishedAt: number;
  // YouTube-specific metrics are NOT included in the core report.
  // If YouTube link-outs were performed, they are recorded separately.
}

/** Discovery Session — MusicBrainz-first. */
export interface DiscoverySession {
  id: string;
  artist: Artist;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  depth: 'quick' | 'standard' | 'deep';
  categories: DiscoveryCategory[];
  tracks: Track[];
  report: DiscoveryReport;
  error?: string;
  createdAt: number;
  updatedAt: number;
  // YouTube integration is optional and orthogonal.
  youtubeIntegration?: {
    /** Number of YouTube link-outs provided. */
    linkOutCount: number;
    /** Whether any YouTube API calls were made. */
    apiCallsMade: number;
  };
}

/** Discovery Depth. */
export type DiscoveryDepth = 'quick' | 'standard' | 'deep';

/** Sort Key. */
export type SortKey = 'title' | 'publishedAt' | 'duration';

/** Playlist — local track lists only. YouTube playlist IDs are optional. */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  /** MusicBrainz recording IDs — the canonical catalogue. */
  trackIds: string[]; // MBIDs or slugs
  /** Optional YouTube playlist ID — only if OAuth‑enabled. */
  youtubePlaylistId?: string;
  /** Optional YouTube video IDs (backward compatibility with GUI). */
  trackVideoIds?: string[];
  categoryFilter?: DiscoveryCategory[];
  createdAt: number;
  updatedAt: number;
}

/** Library State — fully MusicBrainz-centric. */
export interface LibraryState {
  /**
   * Canonical track records keyed by MusicBrainz recording MBID. This cache is
   * the durable identity behind library membership, favorites, playlists and
   * discovery sessions; sessions are never the only source of a saved track.
   */
  canonicalTracks: Record<string, Track>;
  /** Explicit library membership — MBIDs only. Never inferred from playlists. */
  libraryTrackIds: string[];
  /**
   * Library schema version. Version 0 (or a missing value) is the legacy
   * session-derived schema; version 1 is the canonical/membership schema.
   */
  libraryMigrationVersion: number;
  artists: Record<string, Artist & { discoveredAt: number; favorite: boolean }>;
  sessions: Record<string, DiscoverySession>;
  playlists: Record<string, Playlist>;
  favorites: { trackIds: string[] };
  history: { query: string; artistId?: string; at: number }[];
  /** Provenance: always 'mixed' — MusicBrainz canonical + optional YouTube link-outs. */
  provenance: 'mixed';
}

// =======================
// Settings ( YouTube‑optional )
// =======================

/** User‑provided YouTube configuration — strictly optional. */
export interface YouTubeConfig {
  apiKey?: string;
  clientId?: string;
  configuredAt?: number;
}

/** Local daily quota accounting for optional YouTube API usage. */
export interface QuotaUsage {
  date: string; // YYYY-MM-DD
  used: number;
  limit: number;
}

/** Global settings. */
export interface Settings {
  theme: 'dark' | 'system';
  defaultDepth: DiscoveryDepth;
  defaultCategories: DiscoveryCategory[];
  includeAlternateVersions: boolean;
  dedupStrictness: 'strict' | 'balanced' | 'off';
  maxResultsPerQuery: number;
  /** YouTube config — optional, never mandatory. */
  youtube: YouTubeConfig;
  /**
   * Legacy presentation flags used by the existing settings view. They are
   * derived from the optional config and kept so the Arena-owned GUI does not
   * need to change to stay type-compatible.
   */
  youtubeApiKeyConfigured?: boolean;
  youtubeClientIdConfigured?: boolean;
  /** Last.fm config (future). */
  // lastfm: LastFmConfig;
}

// Defaults — YouTube config is intentionally omitted so the core catalogue
// never requires an API key.
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  defaultDepth: 'standard',
  defaultCategories: [
    'official', 'album', 'single', 'soundtrack', 'collaboration',
    'featured', 'duet', 'live', 'acoustic', 'unplugged', 'remix',
  ],
  includeAlternateVersions: true,
  dedupStrictness: 'balanced',
  maxResultsPerQuery: 25,
  youtube: {
    // apiKey and clientId are left unset — the core catalogue works without them.
  },
  youtubeApiKeyConfigured: false,
  youtubeClientIdConfigured: false,
};

// =======================
// Artist Role
// =======================

export type ArtistRole = 'primary' | 'featured' | 'playback' | 'composer' | 'lyricist' | 'cover' | 'other';

// =======================
// URL Constants
// =======================

/** Canonical YouTube watch URL builder (used only for verified link-outs). */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// =======================
// Provenance Helpers
// =======================

/** Check if a Track has a verified YouTube relationship. */
export function hasVerifiedYouTubeLink(track: Track): boolean {
  return track.youtubeVerified && !!track.youtubeVideoId;
}

/** Check if a Track's YouTube link is a programmatic search result. */
export function hasSearchYouTubeLink(track: Track): boolean {
  return track.youtubeSource === 'search';
}

/** Check if a Track's YouTube link is a MusicBrainz‑verified link‑out. */
export function hasLinkOutYouTubeLink(track: Track): boolean {
  return track.youtubeSource === 'link-out';
}

/** Check if a Track has no YouTube association. */
export function hasNoYouTubeLink(track: Track): boolean {
  return !track.youtubeVideoId;
}
