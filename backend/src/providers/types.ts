/**
 * Provider interfaces — the seam between the discovery orchestrator and
 * external data sources. Phase C implements these; Phase B ships stubs.
 *
 * Separation of concerns:
 *  - MetadataProvider: artist identification + recording/release metadata
 *    (e.g. MusicBrainz — licensed open data, no API key).
 *  - VideoProvider: resolving playable YouTube videos (authoritative source
 *    for playback). Never claim another source covers YouTube videos.
 */
export interface ArtistCandidate {
  id: string;
  name: string;
  country?: string;
  description?: string;
  thumbnail?: string;
  subscriberCount?: number;
  source: string; // provenance: which provider supplied this (e.g. 'musicbrainz', 'youtube')
  fetchedAt: number; // retrieval timestamp (retention/refresh accounting)
  expiresAt?: number; // optional cache expiry; permanent caches are NOT permitted for YouTube API data
}

export interface ChannelMeta {
  channelId: string;
  title: string;
  description?: string;
  country?: string;
  uploadsPlaylistId?: string; // contentDetails.relatedPlaylists.uploads — for cheap enumeration
  subscriberCount?: number;
  thumbnail?: string;
  source: string;
  fetchedAt: number;
  expiresAt?: number;
}

export interface RecordingMeta {
  id: string; // external provider identifier (e.g. MusicBrainz MBID) — preserved, never invented
  title: string;
  artistId: string;
  releaseGroup?: string;
  year?: number; // only when present in source data
  language?: string; // only when present in source data — never guessed
  source: string;
  fetchedAt: number;
  expiresAt?: number;
}

export interface VideoMeta {
  videoId: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  durationSeconds?: number;
  viewCount?: number;
  thumbnail?: string;
  source: string;
  fetchedAt: number; // provenance timestamp for cache expiry
  expiresAt?: number; // cache expiry; permanent YouTube-data caches are not permitted
}

export interface MetadataProvider {
  readonly name: string;
  resolveArtist(query: string): Promise<ArtistCandidate[]>;
  recordingsOf(artistId: string): Promise<RecordingMeta[]>;
}

export interface VideoProvider {
  readonly name: string;
  /** Channel identification via channels.list (1 general unit/call). */
  resolveChannel(query: string, maxResults?: number): Promise<ChannelMeta[]>;
  searchVideos(query: string, maxResults: number, pageToken?: string): Promise<{ items: VideoMeta[]; nextPageToken?: string }>;
  /** Uploads-playlist enumeration via channels.list + playlistItems.list (1 unit/page). NOT a complete catalogue. */
  channelUploads(channelId: string, maxItems: number): Promise<VideoMeta[]>;
  /** Cost-efficient catalogue enumeration: channel uploads playlist (1 unit / 50 videos). Not a complete catalogue — search remains the fallback. */
  channelUploads(channelId: string, maxItems: number): Promise<VideoMeta[]>;
  videoDetails(videoIds: string[]): Promise<VideoMeta[]>;
}
