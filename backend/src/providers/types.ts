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
  source: string; // provenance: which provider supplied this
}

export interface RecordingMeta {
  id: string;
  title: string;
  artistId: string;
  releaseGroup?: string;
  year?: number;
  language?: string;
  source: string;
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
}

export interface MetadataProvider {
  readonly name: string;
  resolveArtist(query: string): Promise<ArtistCandidate[]>;
  recordingsOf(artistId: string): Promise<RecordingMeta[]>;
}

export interface VideoProvider {
  readonly name: string;
  searchVideos(query: string, maxResults: number, pageToken?: string): Promise<{ items: VideoMeta[]; nextPageToken?: string }>;
  /** Cost-efficient catalogue enumeration: channel uploads playlist (1 unit / 50 videos). Not a complete catalogue — search remains the fallback. */
  channelUploads(channelId: string, maxItems: number): Promise<VideoMeta[]>;
  videoDetails(videoIds: string[]): Promise<VideoMeta[]>;
}
