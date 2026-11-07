import { beforeEach, describe, expect, it } from 'vitest';
import { createStoreFacade, wipeAllData } from '../src/state/store';
import type { Artist, DiscoverySession, Track } from '../src/types';

const ARTIST_MBID = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';
const RECORDING_MBID = 'b1a9c0e9-d987-4042-ae91-78d6a3267d69';
const SECOND_RECORDING_MBID = 'ab0c5d37-ee99-4cc5-a9b6-13556cf08f72';

function artist(): Artist {
  return {
    id: ARTIST_MBID,
    name: 'Queen',
    normalizedName: 'queen',
    mbid: ARTIST_MBID,
  };
}

function track(
  id: string,
  title: string,
  youtubeVideoId?: string,
): Track {
  return {
    id,
    title,
    normalizedTitle: title.toLowerCase(),
    artist: 'Queen',
    youtubeVideoId,
    videoId: youtubeVideoId,
    youtubeVerified: Boolean(youtubeVideoId),
    youtubeSource: youtubeVideoId ? 'link-out' : 'none',
    versionTags: [],
    dedupeKey: '',
    isDuplicate: false,
    category: 'album',
    role: 'primary',
    source: 'musicbrainz',
    discoveredAt: 1,
    lastUpdated: 1,
  };
}

function session(id: string, tracks: Track[], updatedAt = 1): DiscoverySession {
  return {
    id,
    artist: artist(),
    status: 'completed',
    depth: 'standard',
    categories: ['album'],
    tracks,
    report: {
      query: 'Queen',
      artistId: ARTIST_MBID,
      candidatesFound: tracks.length,
      accepted: tracks.length,
      duplicatesRemoved: 0,
      excluded: 0,
      exclusionReasons: {},
      startedAt: 1,
      finishedAt: 2,
    },
    createdAt: 1,
    updatedAt,
  };
}

beforeEach(async () => {
  await wipeAllData();
});

describe('store façade — initialization and persistence', () => {
  it('starts with a usable empty state and loads persisted data', async () => {
    const store = createStoreFacade();
    expect(store.library.provenance).toBe('mixed');
    expect(store.settings.defaultDepth).toBe('standard');
    expect(store.allTracks()).toEqual([]);

    await store.init();
    expect(store.library.favorites.trackIds).toEqual([]);
    expect(store.library.playlists).toEqual({});
  });

  it('saves artists, sessions, favorites and playlists through the storage layer', async () => {
    const store = createStoreFacade();
    await store.init();

    const mbOnly = track(RECORDING_MBID, 'Bohemian Rhapsody');
    const linked = track(SECOND_RECORDING_MBID, 'We Will Rock You', 'yt-rock');
    store.saveArtist({ ...artist(), discoveredAt: 55, favorite: false });
    store.saveSession(session('session-1', [mbOnly, linked]));
    store.pushHistory('Queen');
    store.toggleFavoriteTrack('yt-rock');
    const playlist = store.createPlaylist('Queen mix', ['yt-rock']);
    store.toggleFavoriteArtist(ARTIST_MBID);
    await store.flush();

    expect(store.library.artists[ARTIST_MBID].favorite).toBe(true);
    expect(store.library.favorites.trackIds).toEqual([SECOND_RECORDING_MBID]);
    expect(playlist.trackIds).toEqual([SECOND_RECORDING_MBID]);
    expect(playlist.trackVideoIds).toEqual(['yt-rock']);

    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(reloaded.library.artists[ARTIST_MBID].favorite).toBe(true);
    expect(reloaded.library.history[0].query).toBe('Queen');
    expect(reloaded.allTracks().map((item) => item.id).sort()).toEqual(
      [RECORDING_MBID, SECOND_RECORDING_MBID].sort(),
    );
    expect(reloaded.library.favorites.trackIds).toEqual([SECOND_RECORDING_MBID]);
    expect(reloaded.library.playlists[playlist.id].trackIds).toEqual([
      SECOND_RECORDING_MBID,
    ]);
  });

  it('persists settings and notifies subscribers after each mutation', async () => {
    const store = createStoreFacade();
    await store.init();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.updateSettings({ theme: 'system', defaultDepth: 'deep' });
    store.pushHistory('Queen');
    await store.flush();
    unsubscribe();

    expect(notifications).toBe(2);
    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(reloaded.settings.theme).toBe('system');
    expect(reloaded.settings.defaultDepth).toBe('deep');
  });
});

describe('store façade — canonical MBID identity', () => {
  it('favors and stores MusicBrainz-only tracks without YouTube IDs', async () => {
    const store = createStoreFacade();
    await store.init();
    const mbOnly = track(RECORDING_MBID, 'Bohemian Rhapsody');
    store.saveSession(session('session-mb-only', [mbOnly]));

    store.toggleFavoriteTrack(RECORDING_MBID);
    const playlist = store.createPlaylist('No YouTube needed', [RECORDING_MBID]);
    await store.flush();

    expect(playlist.trackIds).toEqual([RECORDING_MBID]);
    expect(playlist.trackVideoIds).toEqual([]);
    expect(store.library.favorites.trackIds).toEqual([RECORDING_MBID]);

    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(reloaded.library.playlists[playlist.id].trackIds).toEqual([
      RECORDING_MBID,
    ]);
    expect(reloaded.library.favorites.trackIds).toEqual([RECORDING_MBID]);
  });

  it('translates legacy video IDs to recording MBIDs', async () => {
    const store = createStoreFacade();
    await store.init();
    store.saveSession(
      session('session-linked', [
        track(SECOND_RECORDING_MBID, 'We Will Rock You', 'yt-rock'),
      ]),
    );

    store.toggleFavoriteTrack('yt-rock');
    const playlist = store.createPlaylist('Linked', ['yt-rock']);
    await store.flush();

    expect(store.library.favorites.trackIds).toEqual([SECOND_RECORDING_MBID]);
    expect(playlist.trackIds).toEqual([SECOND_RECORDING_MBID]);
    expect(playlist.trackVideoIds).toEqual(['yt-rock']);
  });

  it('applies in-place GUI playlist edits while preserving MB-only tracks', async () => {
    const store = createStoreFacade();
    await store.init();
    const mbOnly = track(RECORDING_MBID, 'Bohemian Rhapsody');
    const linked = track(SECOND_RECORDING_MBID, 'We Will Rock You', 'yt-rock');
    store.saveSession(session('session-mixed', [mbOnly, linked]));

    const playlist = store.createPlaylist('Mixed', ['yt-rock']);
    playlist.trackIds.push(RECORDING_MBID);
    store.updatePlaylist(playlist);
    expect(playlist.trackIds).toEqual([SECOND_RECORDING_MBID, RECORDING_MBID]);

    // The GUI removes the YouTube-backed entry by mutating trackVideoIds.
    // MB-only entries must survive because they cannot be represented there.
    playlist.trackVideoIds = [];
    store.updatePlaylist(playlist);
    await store.flush();

    expect(playlist.trackIds).toEqual([RECORDING_MBID]);
    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(reloaded.library.playlists[playlist.id].trackIds).toEqual([
      RECORDING_MBID,
    ]);
  });
});

describe('store façade — serialized concurrent writes', () => {
  it('does not let an earlier snapshot overwrite a later one', async () => {
    const store = createStoreFacade();
    await store.init();

    for (let index = 0; index < 25; index += 1) {
      store.saveSession(
        session(`session-${index}`, [
          track(RECORDING_MBID, `Title ${index}`),
        ], index),
      );
    }
    store.updateSettings({ maxResultsPerQuery: 42 });
    await store.flush();

    const reloaded = createStoreFacade();
    await reloaded.init();
    expect(Object.keys(reloaded.library.sessions)).toHaveLength(25);
    expect(reloaded.library.sessions['session-24'].updatedAt).toBe(24);
    expect(reloaded.settings.maxResultsPerQuery).toBe(42);
  });
});
