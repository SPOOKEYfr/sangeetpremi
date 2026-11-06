/** Phase B stubs: providers exist as contracts but are not wired to live services. */
import { err } from '../http/responses.js';
import type { ArtistCandidate, ChannelMeta, MetadataProvider, RecordingMeta, VideoMeta, VideoProvider } from './types.js';

const notImplemented = (what: string) =>
  err.notImplemented(`${what} is not implemented yet — provider wiring is Phase C. No live external calls are made in Phase B.`);

export class StubMetadataProvider implements MetadataProvider {
  readonly name = 'stub-metadata';
  async resolveArtist(_query: string): Promise<ArtistCandidate[]> {
    throw notImplemented('MetadataProvider.resolveArtist');
  }
  async recordingsOf(_artistId: string): Promise<RecordingMeta[]> {
    throw notImplemented('MetadataProvider.recordingsOf');
  }
}

export class StubVideoProvider implements VideoProvider {
  readonly name = 'stub-video';
  async resolveChannel(): Promise<ChannelMeta[]> {
    throw notImplemented('VideoProvider.resolveChannel');
  }
  async searchVideos(): Promise<{ items: VideoMeta[]; nextPageToken?: string }> {
    throw notImplemented('VideoProvider.searchVideos');
  }
  async channelUploads(): Promise<VideoMeta[]> {
    throw notImplemented('VideoProvider.channelUploads');
  }
  async videoDetails(): Promise<VideoMeta[]> {
    throw notImplemented('VideoProvider.videoDetails');
  }
}
