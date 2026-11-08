import { describe, expect, it } from 'vitest';
import { createMusicBrainzClient } from '../src/services/musicbrainz/index';
import {
  YELLOW_RECORDING_MBID,
  YELLOW_VIDEO_ID,
  YELLOW_VIDEO_URL,
} from './musicbrainzHarness';

const live =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.RUN_LIVE_MB === '1';
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opt-in live contract check. Mocks prove the parser against recorded shapes;
 * this test proves the endpoints and envelopes still match the real service.
 *
 * Run with: RUN_LIVE_MB=1 npx vitest run tests/musicbrainz.live.test.ts
 */
describe('MusicBrainz live contract', () => {
  it.runIf(live)(
    'resolves a real artist, release group, recording and cover art',
    async () => {
      const client = createMusicBrainzClient({
        userAgent: 'SangeetPremi/1.0 (live-contract-test; +https://sangeetpremi.org)',
      });

      const artists = await client.searchArtists('Queen', 5);
      const queen = artists.find((artist) => artist.name === 'Queen');
      expect(queen).toBeDefined();
      expect(queen?.id).toMatch(MBID);
      expect(queen?.disambiguation).toBeTruthy();

      const groups = await client.getReleaseGroupsByArtistMBID(queen!.id);
      const anato = groups.find(
        (group) => group.title === 'A Night at the Opera',
      );
      expect(anato).toBeDefined();
      expect(anato?.primarytype).toBe('Album');
      expect(anato?.id).toMatch(MBID);

      const recordings = await client.getRecordingsByReleaseGroupMBID(anato!.id);
      const bohemian = recordings.find(
        (recording) => recording.title === 'Bohemian Rhapsody',
      );
      expect(bohemian).toBeDefined();
      expect(bohemian?.id).toMatch(MBID);
      expect(bohemian?.releaseGroupId).toBe(anato!.id);
      expect(bohemian?.length).toBeGreaterThan(300);

      const artwork = await client.getCoverArtArchiveByReleaseGroupMBID(anato!.id);
      expect(artwork.front ?? artwork.thumb).toBeDefined();
      expect(new URL(artwork.front ?? artwork.thumb ?? '').hostname).toBe(
        'coverartarchive.org',
      );
    },
    120_000,
  );

  it.runIf(live)(
    'verifies the real Yellow recording from its MusicBrainz URL relationship',
    async () => {
      const client = createMusicBrainzClient({
        userAgent: 'SangeetPremi/1.0 (live-contract-test; +https://sangeetpremi.org)',
      });

      const result = await client.getRecordingYouTubeRelationship(
        YELLOW_RECORDING_MBID,
      );

      expect(result.verificationStatus).toBe('verified');
      expect(result.verified).toBe(true);
      expect(result.source).toBe('musicbrainz');
      expect(result.recordingMBID).toBe(YELLOW_RECORDING_MBID);
      expect(result.recordingTitle).toBe('Yellow');
      expect(result.artistCredit).toContain('Coldplay');
      expect(result.relationshipType).toBe('free streaming');
      expect(result.relationshipDirection).toBe('forward');
      expect(result.relationshipUrl).toMatch(
        /^https:\/\/(?:www|music)\.youtube\.com\/watch\?v=9qnqYL0eNNI$/,
      );
      expect(result.youtubeVideoId).toBe(YELLOW_VIDEO_ID);
      expect(result.youtubeUrl).toBe(YELLOW_VIDEO_URL);
    },
    120_000,
  );

  it.runIf(live)(
    'returns empty artwork rather than throwing for an unknown release group',
    async () => {
      const client = createMusicBrainzClient({
        userAgent: 'SangeetPremi/1.0 (live-contract-test; +https://sangeetpremi.org)',
      });
      // Valid-shaped but nonexistent MBID.
      const artwork = await client.getCoverArtArchiveByReleaseGroupMBID(
        '00000000-0000-4000-8000-000000000000',
      );
      expect(artwork).toEqual({});
    },
    60_000,
  );
});
