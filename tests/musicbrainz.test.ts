import { describe, expect, it } from 'vitest';
import { MusicBrainzError } from '../src/services/musicbrainz/index';
import {
  ANATO_RELEASE_MBID,
  ANATO_RG_MBID,
  BACK_URL,
  BOHEMIAN_RECORDING_MBID,
  EMPTY_MBID,
  FRONT_URL,
  QUEEN_MBID,
  SHEER_HEART_RG_MBID,
  THUMB_URL,
  catalogueHandler,
  createClientHarness,
  jsonResponse,
} from './musicbrainzHarness';

describe('MusicBrainz client — searchArtists', () => {
  it('parses the live artists envelope and returns the exact match first', async () => {
    const harness = createClientHarness(catalogueHandler);
    const results = await harness.client.searchArtists('Queen', 5);

    expect(results.map((artist) => artist.name)).toEqual(['Queen', 'David Bowie']);
    expect(results[0]).toMatchObject({
      id: QUEEN_MBID,
      sortName: 'Queen',
      type: 'Group',
      country: 'GB',
      area: { name: 'United Kingdom' },
      disambiguation: 'UK rock group',
      score: 100,
    });
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].url.pathname).toBe('/ws/2/artist');
    expect(harness.requests[0].url.searchParams.get('query')).toBe('Queen');
    expect(harness.requests[0].url.searchParams.get('limit')).toBe('5');
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('aliases+tags+ratings');
  });

  it('returns an empty array when no artist matches', async () => {
    const harness = createClientHarness(catalogueHandler);
    const results = await harness.client.searchArtists('NonExistentArtist12345', 3);

    expect(results).toEqual([]);
    expect(harness.requests[0].url.searchParams.get('query')).toBe(
      'NonExistentArtist12345',
    );
  });

  it('requests and returns no more than the requested limit', async () => {
    const harness = createClientHarness(catalogueHandler);
    const results = await harness.client.searchArtists('The Beatles', 3);

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe('The Beatles');
    expect(harness.requests[0].url.searchParams.get('limit')).toBe('3');
  });

  it('does not use the legacy singular artist envelope', async () => {
    const harness = createClientHarness((url) => {
      if (url.pathname === '/ws/2/artist') {
        return jsonResponse({ artist: [{ id: QUEEN_MBID, name: 'Queen' }] });
      }
      return catalogueHandler(url);
    });

    await expect(harness.client.searchArtists('Queen', 5)).resolves.toEqual([]);
  });
});

describe('MusicBrainz client — MBID validation', () => {
  it('returns null for an invalid artist MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(harness.client.getArtistByMBID('invalid')).resolves.toBeNull();
    expect(harness.requests).toHaveLength(0);
  });

  it('returns [] for an invalid release-group artist MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(harness.client.getReleaseGroupsByArtistMBID('invalid')).resolves.toEqual([]);
    expect(harness.requests).toHaveLength(0);
  });

  it('returns [] for an invalid recordings artist MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(harness.client.getRecordingsByArtistMBID('invalid')).resolves.toEqual([]);
    expect(harness.requests).toHaveLength(0);
  });

  it('returns [] for an invalid release-group MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(
      harness.client.getRecordingsByReleaseGroupMBID('invalid'),
    ).resolves.toEqual([]);
    expect(harness.requests).toHaveLength(0);
  });

  it('returns {} for an invalid recording MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(harness.client.getCoverArtArchive('invalid')).resolves.toEqual({});
    expect(harness.requests).toHaveLength(0);
  });

  it('returns {} for an invalid release-group MBID without making a request', async () => {
    const harness = createClientHarness(catalogueHandler);

    await expect(
      harness.client.getCoverArtArchiveByReleaseGroupMBID('invalid'),
    ).resolves.toEqual({});
    expect(harness.requests).toHaveLength(0);
  });
});

describe('MusicBrainz client — catalogue retrieval', () => {
  it('maps an artist by MBID using valid lookup parameters', async () => {
    const harness = createClientHarness(catalogueHandler);
    const artist = await harness.client.getArtistByMBID(QUEEN_MBID);

    expect(artist).toMatchObject({
      id: QUEEN_MBID,
      name: 'Queen',
      type: 'Group',
      country: 'GB',
      area: { name: 'United Kingdom' },
      disambiguation: 'UK rock group',
    });
    expect(harness.requests[0].url.pathname).toBe(`/ws/2/artist/${QUEEN_MBID}`);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('aliases+tags+ratings');
  });

  it('browses release groups through /release-group?artist=', async () => {
    const harness = createClientHarness(catalogueHandler);
    const groups = await harness.client.getReleaseGroupsByArtistMBID(QUEEN_MBID);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: ANATO_RG_MBID,
      title: 'A Night at the Opera',
      primarytype: 'Album',
      firstreleaseyear: 1975,
      disambiguation: 'Studio album',
      secondarytypes: [],
    });
    expect(groups[0].artist_credit).toEqual([
      { artist: { id: QUEEN_MBID, name: 'Queen' } },
    ]);
    expect(groups[1].primarytype).toBe('Album');
    expect(harness.requests[0].url.pathname).toBe('/ws/2/release-group');
    expect(harness.requests[0].url.searchParams.get('artist')).toBe(QUEEN_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('artist-credits');
    expect(harness.requests[0].url.searchParams.get('limit')).toBe('50');
  });

  it('browses artist recordings through /release?artist= with release groups', async () => {
    const harness = createClientHarness(catalogueHandler);
    const recordings = await harness.client.getRecordingsByArtistMBID(QUEEN_MBID);

    expect(recordings).toHaveLength(2);
    expect(recordings[0]).toMatchObject({
      id: BOHEMIAN_RECORDING_MBID,
      title: 'Bohemian Rhapsody',
      length: 355,
      isrc: 'GBUM71100531',
      firstreleaseyear: 1975,
      releaseGroupId: ANATO_RG_MBID,
    });
    expect(recordings[1].length).toBe(121);
    expect(recordings[1].releaseGroupId).toBe(SHEER_HEART_RG_MBID);
    expect(harness.requests[0].url.pathname).toBe('/ws/2/release');
    expect(harness.requests[0].url.searchParams.get('artist')).toBe(QUEEN_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe(
      'recordings+artist-credits+release-groups',
    );
  });

  it('preserves one appearance per release for artist provenance', async () => {
    const release = (
      id: string,
      title: string,
      releaseGroupId: string,
      releaseGroupTitle: string,
      recordingId: string,
      recordingTitle: string,
    ) => ({
      id,
      title,
      date: '1975-11-21',
      'release-group': {
        id: releaseGroupId,
        title: releaseGroupTitle,
        'primary-type': 'Album',
      },
      media: [
        {
          tracks: [
            {
              id: `${recordingId}-track`,
              title: recordingTitle,
              length: 355_106,
              recording: {
                id: recordingId,
                title: recordingTitle,
                length: 355_106,
                'first-release-date': '1975-11-21',
                'artist-credit': [{ artist: { id: QUEEN_MBID, name: 'Queen' } }],
              },
            },
          ],
        },
      ],
    });

    const harness = createClientHarness((url) => {
      if (url.pathname === '/ws/2/release') {
        return jsonResponse({
          releases: [
            release(
              ANATO_RELEASE_MBID,
              'A Night at the Opera',
              ANATO_RG_MBID,
              'A Night at the Opera',
              BOHEMIAN_RECORDING_MBID,
              'Bohemian Rhapsody',
            ),
            release(
              '99999999-8888-4777-8666-555555555555',
              'Greatest Hits',
              SHEER_HEART_RG_MBID,
              'Greatest Hits',
              BOHEMIAN_RECORDING_MBID,
              'Bohemian Rhapsody',
            ),
          ],
        });
      }
      return jsonResponse({});
    });

    const recordings = await harness.client.getRecordingsByArtistMBID(QUEEN_MBID);
    expect(recordings).toHaveLength(2);
    expect(
      recordings
        .filter((recording) => recording.id === BOHEMIAN_RECORDING_MBID)
        .map((recording) => recording.releaseGroupId),
    ).toEqual([ANATO_RG_MBID, SHEER_HEART_RG_MBID]);
  });

  it('maps recordings through the release-group browse relationship', async () => {
    const harness = createClientHarness(catalogueHandler);
    const recordings = await harness.client.getRecordingsByReleaseGroupMBID(ANATO_RG_MBID);

    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({
      id: BOHEMIAN_RECORDING_MBID,
      title: 'Bohemian Rhapsody',
      length: 355,
      firstReleaseDate: '1975-11-21',
      releaseGroupId: ANATO_RG_MBID,
      releaseId: ANATO_RELEASE_MBID,
      releaseTitle: 'A Night at the Opera',
    });
    expect(harness.requests[0].url.pathname).toBe('/ws/2/release');
    expect(harness.requests[0].url.searchParams.get('release-group')).toBe(ANATO_RG_MBID);
    expect(harness.requests[0].url.searchParams.get('inc')).toBe(
      'recordings+artist-credits',
    );
  });

  it('maps artist credits through a release-group lookup', async () => {
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

  it('returns an empty artist-credit list when the release group has none', async () => {
    const harness = createClientHarness(catalogueHandler);
    const credits = await harness.client.getArtistCreditsForReleaseGroup(EMPTY_MBID);

    expect(credits).toEqual([]);
    expect(harness.requests).toHaveLength(1);
  });
});

describe('MusicBrainz client — Cover Art Archive', () => {
  it('resolves a recording to its release group and fetches CAA artwork', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchive(BOHEMIAN_RECORDING_MBID);

    expect(art).toEqual({ front: FRONT_URL, back: BACK_URL, thumb: THUMB_URL });
    expect(harness.requests.map((request) => request.url.pathname)).toEqual([
      `/ws/2/recording/${BOHEMIAN_RECORDING_MBID}`,
      `/release-group/${ANATO_RG_MBID}`,
    ]);
    expect(harness.requests[0].url.hostname).toBe('musicbrainz.org');
    expect(harness.requests[0].url.searchParams.get('inc')).toBe('releases+release-groups');
    expect(harness.requests[1].url.origin).toBe('https://coverartarchive.org');
    expect(harness.requests[1].at - harness.requests[0].at).toBeGreaterThanOrEqual(1000);
  });

  it('fetches artwork directly by release-group MBID', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchiveByReleaseGroupMBID(ANATO_RG_MBID);

    expect(art).toEqual({ front: FRONT_URL, back: BACK_URL, thumb: THUMB_URL });
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].url.toString()).toBe(
      `https://coverartarchive.org/release-group/${ANATO_RG_MBID}`,
    );
  });

  it('returns empty artwork when the recording has no release group', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchive(EMPTY_MBID);

    expect(art).toEqual({});
    expect(harness.requests).toHaveLength(1);
  });

  it('returns empty artwork when the release group has no images', async () => {
    const harness = createClientHarness(catalogueHandler);
    const art = await harness.client.getCoverArtArchiveByReleaseGroupMBID(EMPTY_MBID);

    expect(art).toEqual({});
    expect(harness.requests).toHaveLength(1);
  });
});

describe('MusicBrainz client — retries and errors', () => {
  it('retries HTTP 503 after the Retry-After delay', async () => {
    let calls = 0;
    const harness = createClientHarness((url) => {
      calls += 1;
      if (calls === 1) {
        return new Response('busy', { status: 503, headers: { 'Retry-After': '2' } });
      }
      return catalogueHandler(url);
    });

    const results = await harness.client.searchArtists('Queen', 5);

    expect(results[0].name).toBe('Queen');
    expect(harness.requests).toHaveLength(2);
    expect(harness.sleeps).toEqual([2000]);
    expect(harness.requests[1].at - harness.requests[0].at).toBeGreaterThanOrEqual(2000);
  });

  it('uses exponential backoff when 503 has no Retry-After', async () => {
    let calls = 0;
    const harness = createClientHarness((url) => {
      calls += 1;
      if (calls <= 2) return new Response('busy', { status: 503 });
      return catalogueHandler(url);
    });

    const results = await harness.client.searchArtists('Queen', 5);

    expect(results).toHaveLength(2);
    expect(harness.requests).toHaveLength(3);
    expect(harness.sleeps).toEqual([1000, 2000]);
    expect(harness.requests.map((request) => request.at)).toEqual([0, 1000, 3000]);
  });

  it('supports an HTTP-date Retry-After header', async () => {
    let calls = 0;
    const retryAt = new Date(4000).toUTCString();
    const harness = createClientHarness((url) => {
      calls += 1;
      if (calls === 1) {
        return new Response('busy', { status: 503, headers: { 'Retry-After': retryAt } });
      }
      return catalogueHandler(url);
    });

    await harness.client.searchArtists('Queen', 5);

    expect(harness.sleeps).toEqual([4000]);
    expect(harness.requests[1].at).toBe(4000);
  });

  it('throws after maxRetries without making additional requests', async () => {
    const harness = createClientHarness(() => new Response('down', { status: 503 }), {
      maxRetries: 2,
    });

    const error = await harness.client.searchArtists('Queen', 5).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.status).toBe(503);
      expect(error.message).toContain('HTTP 503');
    }
    expect(harness.requests).toHaveLength(3);
    expect(harness.sleeps).toEqual([1000, 2000]);
  });

  it('does not retry non-retryable HTTP errors', async () => {
    const harness = createClientHarness(() => new Response('missing', { status: 404 }));

    const error = await harness.client.getArtistByMBID(QUEEN_MBID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) expect(error.status).toBe(404);
    expect(harness.requests).toHaveLength(1);
    expect(harness.sleeps).toEqual([]);
  });

  it('rejects malformed JSON responses without retrying', async () => {
    const harness = createClientHarness(
      () =>
        new Response('{"artists": [', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const error = await harness.client.searchArtists('Queen', 5).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MusicBrainzError);
    if (error instanceof MusicBrainzError) {
      expect(error.message).toMatch(/malformed JSON/i);
    }
    expect(harness.requests).toHaveLength(1);
    expect(harness.sleeps).toEqual([]);
  });
});

describe('MusicBrainz client — rate limit', () => {
  it('serializes concurrent requests at least one second apart', async () => {
    const harness = createClientHarness((url) => {
      const query = url.searchParams.get('query') ?? 'Unknown';
      return jsonResponse({ artists: [{ id: QUEEN_MBID, name: query }] });
    });

    const [first, second, third] = await Promise.all([
      harness.client.searchArtists('One', 1),
      harness.client.searchArtists('Two', 1),
      harness.client.searchArtists('Three', 1),
    ]);

    expect(harness.requests.map((request) => request.url.searchParams.get('query'))).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect(harness.requests.map((request) => request.at)).toEqual([0, 1000, 2000]);
    expect(harness.sleeps).toEqual([1000, 1000]);
    expect(first[0].name).toBe('One');
    expect(second[0].name).toBe('Two');
    expect(third[0].name).toBe('Three');
  });
});

describe('MusicBrainz client — request contract', () => {
  it('sends the MusicBrainz User-Agent and JSON Accept header', async () => {
    const harness = createClientHarness(catalogueHandler);

    await harness.client.searchArtists('Queen', 5);

    expect(harness.requests[0].init?.headers).toMatchObject({
      'User-Agent': 'SangeetPremi/1.0 (+https://sangeetpremi.org)',
      Accept: 'application/json',
    });
    expect(harness.requests[0].url.searchParams.get('fmt')).toBe('json');
    expect(harness.requests[0].url.searchParams.get('timeout')).toBe('10');
  });
});
