import { describe, expect, it } from 'vitest';
import { createMusicBrainzClient } from '../src/services/musicbrainz/index';

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
