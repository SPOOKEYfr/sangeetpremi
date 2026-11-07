import { describe, expect, it } from 'vitest';
import {
  ANATO_RG_MBID,
  BACK_URL,
  BOHEMIAN_RECORDING_MBID,
  EMPTY_MBID,
  FRONT_URL,
  QUEEN_MBID,
  THUMB_URL,
  catalogueHandler,
  createClientHarness,
} from './musicbrainzHarness';

describe('MusicBrainz integration — artist search and MBID resolution', () => {
  it('searches artists over the live request path and returns the exact match first', async () => {
    const harness = createClientHarness(catalogueHandler);
    const results = await harness.client.searchArtists('Queen', 5);

    expect(results.map((artist) => artist.name)).toEqual(['Queen', 'David Bowie']);
    expect(results[0]).toMatchObject({
      id: QUEEN_MBID,
      name: 'Queen',
      type: 'Group',
      country: 'GB',
      disambiguation: 'UK rock group',
    });

    const request = harness.requests[0];
    expect(request.url.origin).toBe('https://musicbrainz.org');
    expect(request.url.pathname).toBe('/ws/2/artist');
    expect(request.url.searchParams.get('query')).toBe('Queen');
    expect(request.url.searchParams.get('limit')).toBe('5');
    expect(request.url.searchParams.get('inc')).toBe('aliases+tags+ratings');
    expect(request.url.searchParams.get('fmt')).toBe('json');
    expect(request.init?.headers).toMatchObject({
      'User-Agent': 'SangeetPremi/1.0 (+https://sangeetpremi.org)',
      Accept: 'application/json',
    });
  });

  it('returns no candidates for an unknown artist', async () => {
    const harness = createClientHarness(catalogueHandler);
    const results = await harness.client.searchArtists('NonExistentArtist12345', 3);

    expect(results).toEqual([]);
    expect(harness.requests).toHaveLength(1);
  });

  it('resolves a valid artist MBID and returns null for an invalid one', async () => {
    const harness = createClientHarness(catalogueHandler);

    const artist = await harness.client.getArtistByMBID(QUEEN_MBID);
    expect(artist).toMatchObject({ id: QUEEN_MBID, name: 'Queen' });
    expect(harness.requests[0].url.pathname).toBe(`/ws/2/artist/${QUEEN_MBID}`);

    await expect(harness.client.getArtistByMBID('not-an-mbid')).resolves.toBeNull();
    expect(harness.requests).toHaveLength(1);
  });
});

describe('MusicBrainz integration — release groups and recordings', () => {
  it('retrieves and maps release groups through the browse endpoint', async () => {
    const harness = createClientHarness(catalogueHandler);
    const groups = await harness.client.getReleaseGroupsByArtistMBID(QUEEN_MBID);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: ANATO_RG_MBID,
      title: 'A Night at the Opera',
      primarytype: 'Album',
      firstreleaseyear: 1975,
    });
    expect(groups[1].title).toBe('Sheer Heart Attack');
    expect(harness.requests[0].url.pathname).toBe('/ws/2/release-group');
    expect(harness.requests[0].url.searchParams.get('artist')).toBe(QUEEN_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('artist-credits');
    expect(harness.requests[0].url.searchParams.get('limit')).toBe('50');
  });

  it('retrieves recordings for an artist through the recording browse endpoint', async () => {
    const harness = createClientHarness(catalogueHandler);
    const recordings = await harness.client.getRecordingsByArtistMBID(QUEEN_MBID);

    expect(recordings).toHaveLength(2);
    expect(recordings[0]).toMatchObject({
      id: BOHEMIAN_RECORDING_MBID,
      title: 'Bohemian Rhapsody',
      length: 355,
      isrc: 'GBUM71100531',
      firstreleaseyear: 1975,
    });
    expect(recordings[1].title).toBe('We Will Rock You');
    expect(harness.requests[0].url.pathname).toBe('/ws/2/recording');
    expect(harness.requests[0].url.searchParams.get('artist')).toBe(QUEEN_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('artist-credits+isrcs');
  });

  it('retrieves recordings for a selected release group and preserves MBIDs', async () => {
    const harness = createClientHarness(catalogueHandler);
    const recordings = await harness.client.getRecordingsByReleaseGroupMBID(ANATO_RG_MBID);

    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({
      id: BOHEMIAN_RECORDING_MBID,
      releaseGroupId: ANATO_RG_MBID,
      releaseId: '0a1982c2-2870-4e24-9811-5bfa9686d4a3',
      length: 355,
    });
    expect(harness.requests[0].url.pathname).toBe('/ws/2/release');
    expect(harness.requests[0].url.searchParams.get('release-group')).toBe(ANATO_RG_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe(
      'recordings+artist-credits',
    );
  });
});

describe('MusicBrainz integration — recording to Cover Art Archive', () => {
  it('resolves a recording to its release group and fetches CAA images', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchive(BOHEMIAN_RECORDING_MBID);

    expect(art).toEqual({ front: FRONT_URL, back: BACK_URL, thumb: THUMB_URL });
    expect(harness.requests.map((request) => request.url.pathname)).toEqual([
      `/ws/2/recording/${BOHEMIAN_RECORDING_MBID}`,
      `/release-group/${ANATO_RG_MBID}`,
    ]);
    expect(harness.requests[1].url.origin).toBe('https://coverartarchive.org');
    expect(harness.requests[1].at - harness.requests[0].at).toBeGreaterThanOrEqual(1000);
  });

  it('handles missing artwork gracefully', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchiveByReleaseGroupMBID(EMPTY_MBID);

    expect(art).toEqual({});
    expect(harness.requests).toHaveLength(1);
  });

  it('retrieves artist credits for a release group', async () => {
    const harness = createClientHarness(catalogueHandler);
    const credits = await harness.client.getArtistCreditsForReleaseGroup(ANATO_RG_MBID);

    expect(credits).toEqual([
      {
        artistID: QUEEN_MBID,
        name: 'Queen',
        artist: { id: QUEEN_MBID, name: 'Queen' },
      },
    ]);
    expect(harness.requests[0].url.pathname).toBe(
      `/ws/2/release-group/${ANATO_RG_MBID}`,
    );
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('artist-credits');
  });
});

describe('MusicBrainz integration — resilience', () => {
  it('retries HTTP 503 using Retry-After and then returns the response', async () => {
    const harness = createClientHarness((url, _init, requestIndex) => {
      if (requestIndex === 0) {
        return new Response('service unavailable', {
          status: 503,
          headers: { 'Retry-After': '3' },
        });
      }
      return catalogueHandler(url);
    });

    const results = await harness.client.searchArtists('Queen', 5);

    expect(results[0].name).toBe('Queen');
    expect(harness.requests).toHaveLength(2);
    expect(harness.sleeps).toEqual([3000]);
    expect(harness.requests[0].at).toBe(0);
    expect(harness.requests[1].at).toBe(3000);
  });

  it('serializes concurrent requests across different catalogue endpoints', async () => {
    const harness = createClientHarness(catalogueHandler);

    const [artist, groups, recordings] = await Promise.all([
      harness.client.getArtistByMBID(QUEEN_MBID),
      harness.client.getReleaseGroupsByArtistMBID(QUEEN_MBID),
      harness.client.getRecordingsByReleaseGroupMBID(ANATO_RG_MBID),
    ]);

    expect(artist?.name).toBe('Queen');
    expect(groups).toHaveLength(2);
    expect(recordings).toHaveLength(1);
    expect(harness.requests.map((request) => request.url.pathname)).toEqual([
      `/ws/2/artist/${QUEEN_MBID}`,
      '/ws/2/release-group',
      '/ws/2/release',
    ]);
    expect(harness.requests.map((request) => request.at)).toEqual([0, 1000, 2000]);
    expect(harness.sleeps).toEqual([1000, 1000]);
  });
});
