/**
 * SangeetPremi core data models.
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
  { id: 'acoustic', label: 'Acoustic Versions', description: 'Acoustic renditions' },
  { id: 'unplugged', label: 'Unplugged', description: 'Unplugged performances' },
  { id: 'remix', label: 'Remixes', description: 'Official and unofficial remixes' },
  { id: 'cover', label: 'Covers', description: 'Cover versions' },
  { id: 'instrumental', label: 'Instrumental', description: 'Instrumental versions' },
  { id: 'other', label: 'Other Recordings', description: 'Other relevant recordings' },
];

export type ArtistRole = 'primary' | 'featured' | 'playback' | 'composer' | 'lyricist' | 'cover' | 'other';

export interface Artist {
  id: string; // YouTube channel id when known, else slug
  name: string;
  normalizedName: string;
  channelId?: string;
  thumbnail?: string;
  description?: string;
  country?: string;
  subscriberCount?: number;
}

export interface Track {
  id: string; // stable id: videoId (dedup keeps one per canonical group)
  videoId: string;
  title: string;
  normalizedTitle: string;
  artist: string;
  channelId?: string;
  channelTitle?: string;
  thumbnail?: string;
  durationSeconds?: number;
  publishedAt?: string;
  viewCount?: number;
  category: DiscoveryCategory;
  role: ArtistRole;
  versionTags: string[];
  language?: string;
  dedupeKey: string;
  isDuplicate: boolean;
  canonicalId?: string; // videoId of the kept representative when isDuplicate
  source: 'youtube';
  discoveredAt: number;
}

export interface DiscoveryReport {
  query: string;
  artistId?: string;
  candidatesFound: number;
  accepted: number;
  duplicatesRemoved: number;
  excluded: number;
  exclusionReasons: Record<string, number>;
  startedAt: number;
  finishedAt: number;
}

export interface DiscoverySession {
  id: string;
  artist: Artist;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  depth: DiscoveryDepth;
  categories: DiscoveryCategory[];
  tracks: Track[];
  report: DiscoveryReport;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type DiscoveryDepth = 'quick' | 'standard' | 'deep';

export type SortKey = 'title' | 'publishedAt' | 'viewCount' | 'duration';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackVideoIds: string[]; // ordered
  categoryFilter?: DiscoveryCategory[];
  createdAt: number;
  updatedAt: number;
  youtubePlaylistId?: string;
}

export interface LibraryState {
  artists: Record<string, Artist & { discoveredAt: number; favorite: boolean }>;
  sessions: Record<string, DiscoverySession>;
  playlists: Record<string, Playlist>;
  favorites: { trackIds: string[] };
  history: { query: string; artistId?: string; at: number }[];
}

export interface Settings {
  theme: 'dark' | 'system';
  defaultDepth: DiscoveryDepth;
  defaultCategories: DiscoveryCategory[];
  includeAlternateVersions: boolean;
  dedupStrictness: 'strict' | 'balanced' | 'off';
  maxResultsPerQuery: number;
  youtubeApiKeyConfigured: boolean;
  youtubeClientIdConfigured: boolean;
}

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
  youtubeApiKeyConfigured: false,
  youtubeClientIdConfigured: false,
};

export interface QuotaUsage {
  date: string; // YYYY-MM-DD
  used: number;
  limit: number;
}
