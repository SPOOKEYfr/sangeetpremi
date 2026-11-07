import { beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryEngine } from '../src/services/discovery/engine';
import { createStoreFacade, wipeAllData } from '../src/state/store';
import {
  ANATO_RELEASE_MBID,
  ANATO_RG_MBID,
  BOHEMIAN_RECORDING_MBID,
  FRONT_URL,
  QUEEN_MBID,
  THUMB_URL,
  catalogueHandler,
  createClientHarness,
} from './musicbrainzHarness';

beforeEach(async () => {
  await wipeAllData();
});

describe('DiscoveryEngine — artist resolution', () => {
  it('returns MusicBrainz candidates with real disambiguation and no fabricated image', async () => {
    const harness = createClientHarness(catalogueHandler);
    const engine = new DiscoveryEngine(null, harness.client);

    const artists = await engine.resolveArtists('Queen');

    expect(artists).toHaveLength(2);
    expect(artists[0]).toMatchObject({
      id: QUEEN_MBID,
      mbid: QUEEN_MBID,
      name: 'Queen',
      normalizedName: 'queen',
      type: 'Group',
      country: 'GB',
      disambiguation: 'UK rock group',
      description: 'UK rock group',
    });
    expect(artists[0].thumbnail).toBeUndefined();
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].url.pathname).toBe('/ws/2/artist');
  });
});

describe('DiscoveryEngine — MusicBrainz-only catalogue', () => {
  it('walks artist → release groups → recordings → artwork and keeps canonical MBIDs', async () => {
    const harness = createClientHarness(catalogueHandler);
    const engine = new DiscoveryEngine(null, harness.client);
    const [artist] = await engine.resolveArtists('Queen');

    const { session, tracks } = await engine.discover(
      artist,
      {
        depth: 'standard',
        categories: ['album'],
        dedup: 'balanced',
        maxPerQuery: 25,
      },
    );

    expect(tracks).toHaveLength(1);
    const track = tracks[0];
    expect(track.id).toBe(BOHEMIAN_RECORDING_MBID);
    expect(track.releaseGroupId).toBe(ANATO_RG_MBID);
    expect(track.releaseId).toBe(ANATO_RELEASE_MBID);
    expect(track.title).toBe('Bohemian Rhapsody');
    expect(track.durationSeconds).toBe(355);
    expect(track.year).toBe(1975);
    expect(track.category).toBe('album');
    expect(track.thumbnail).toBe(THUMB_URL);
    expect(track.metadata?.coverArt).toEqual({
      front: FRONT_URL,
      back: undefined,
      thumb: THUMB_URL,
    });

    // No title matching, search fallback or invented video relationship.
    expect(track.videoId).toBeUndefined();
    expect(track.youtubeVideoId).toBeUndefined();
    expect(track.youtubeUrl).toBeUndefined();
    expect(track.youtubeVerified).toBe(false);
    expect(track.channelTitle).toBeUndefined();

    expect(session.report).toMatchObject({
      artistId: QUEEN_MBID,
      candidatesFound: 1,
      accepted: 1,
      duplicatesRemoved: 0,
      excluded: 0,
    });
    expect(session.artist.mbid).toBe(QUEEN_MBID);

    expect(harness.requests.map((request) => request.url.pathname)).toEqual([
      '/ws/2/artist',
      `/ws/2/artist/${QUEEN_MBID}`,
      '/ws/2/release-group',
      '/ws/2/release',
      `/release-group/${ANATO_RG_MBID}`,
      '/ws/2/release',
    ]);
    expect(harness.requests.map((request) => request.at)).toEqual([
      0, 1000, 2000, 3000, 4000, 5000,
    ]);
  });

  it('handles missing Cover Art Archive artwork without losing the recording', async () => {
    const harness = createClientHarness((url) => {
      if (url.hostname === 'coverartarchive.org') {
        return new Response('no artwork', { status: 404 });
      }
      return catalogueHandler(url);
    });
    const engine = new DiscoveryEngine(null, harness.client);
    const [artist] = await engine.resolveArtists('Queen');

    const { tracks } = await engine.discover(artist, {
      depth: 'standard',
      categories: [],
      dedup: 'balanced',
      maxPerQuery: 25,
    });

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(BOHEMIAN_RECORDING_MBID);
    expect(tracks[0].thumbnail).toBeUndefined();
    expect(tracks[0].metadata?.coverArt).toBeUndefined();
  });

  it('applies the requested category filter without inventing a category', async () => {
    const harness = createClientHarness(catalogueHandler);
    const engine = new DiscoveryEngine(null, harness.client);
    const [artist] = await engine.resolveArtists('Queen');

    const { session, tracks } = await engine.discover(artist, {
      depth: 'standard',
      categories: ['single'],
      dedup: 'balanced',
      maxPerQuery: 25,
    });

    expect(tracks).toHaveLength(0);
    expect(session.report).toMatchObject({
      candidatesFound: 1,
      accepted: 0,
      excluded: 1,
      exclusionReasons: { categoryFiltered: 1 },
    });
  });

  it('saves and reloads a MusicBrainz-only session through the store façade', async () => {
    const harness = createClientHarness(catalogueHandler);
    const engine = new DiscoveryEngine(null, harness.client);
    const [artist] = await engine.resolveArtists('Queen');
    const { session, tracks } = await engine.discover(artist, {
      depth: 'standard',
      categories: ['album'],
      dedup: 'balanced',
      maxPerQuery: 25,
    });

    const store = createStoreFacade();
    await store.init();
    store.saveArtist({ ...artist, discoveredAt: Date.now(), favorite: false });
    store.saveSession(session);
    store.toggleFavoriteTrack(tracks[0].id);
    const playlist = store.createPlaylist('Queen MB-only', [tracks[0].id]);
    await store.flush();

    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(reloaded.allTracks()).toHaveLength(1);
    expect(reloaded.allTracks()[0].id).toBe(BOHEMIAN_RECORDING_MBID);
    expect(reloaded.library.favorites.trackIds).toEqual([
      BOHEMIAN_RECORDING_MBID,
    ]);
    expect(reloaded.library.playlists[playlist.id].trackIds).toEqual([
      BOHEMIAN_RECORDING_MBID,
    ]);
    expect(reloaded.library.playlists[playlist.id].trackVideoIds).toEqual([]);
  });
});
