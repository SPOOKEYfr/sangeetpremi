import { beforeEach, describe, expect, it } from 'vitest';
import {
  createStoreFacade,
  loadLibrary,
  saveLibrary,
  wipeAllData,
} from '../src/state/store';
import type {
  Artist,
  DiscoverySession,
  LibraryState,
  Track,
} from '../src/types';

const ARTIST_MBID = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';
const TRACK_A = 'b1a9c0e9-d987-4042-ae91-78d6a3267d69';
const TRACK_B = 'ab0c5d37-ee99-4cc5-a9b6-13556cf08f72';
const TRACK_C = '729cf505-94eb-4fbe-bc76-cbae44cff091';

function artist(): Artist {
  return {
    id: ARTIST_MBID,
    name: 'Queen',
    normalizedName: 'queen',
    mbid: ARTIST_MBID,
  };
}

function track(id: string, title: string, youtubeVideoId?: string): Track {
  return {
    id,
    title,
    normalizedTitle: title.toLowerCase(),
    artist: 'Queen',
    category: 'album',
    role: 'primary',
    versionTags: [],
    dedupeKey: `mb:${id}`,
    isDuplicate: false,
    discoveredAt: 1,
    lastUpdated: 1,
    youtubeVideoId,
    videoId: youtubeVideoId,
    youtubeVerified: Boolean(youtubeVideoId),
    youtubeSource: youtubeVideoId ? 'link-out' : 'none',
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

const legacyLibrary = (tracks: Track[]): LibraryState =>
  ({
    artists: {},
    sessions: { 'legacy-session': session('legacy-session', tracks) },
    playlists: {},
    favorites: { trackIds: [] },
    history: [],
    provenance: 'mixed',
    // Intentionally no canonicalTracks / libraryTrackIds /
    // libraryMigrationVersion: this is the version-0 shape.
  }) as unknown as LibraryState;

beforeEach(async () => {
  await wipeAllData();
});

describe('storage contract — explicit library membership', () => {
  it('1. fresh discovery has no library membership', async () => {
    const store = createStoreFacade();
    await store.init();

    store.saveSession(session('discovery-1', [track(TRACK_A, 'Song A')]));
    await store.flush();

    expect(store.getLibraryTracks()).toEqual([]);
    expect(store.isInLibrary(TRACK_A)).toBe(false);
    expect(store.library.libraryTrackIds).toEqual([]);
  });

  it('2. explicit Add to Library creates membership', async () => {
    const store = createStoreFacade();
    await store.init();

    store.addTracksToLibrary([track(TRACK_A, 'Song A')]);
    await store.flush();

    expect(store.library.libraryTrackIds).toEqual([TRACK_A]);
    expect(store.isInLibrary(TRACK_A)).toBe(true);
    expect(store.getLibraryTracks().map((item) => item.id)).toEqual([TRACK_A]);
  });

  it('3. adding the same tracks again is idempotent', async () => {
    const store = createStoreFacade();
    await store.init();

    store.addTracksToLibrary([track(TRACK_A, 'Song A')]);
    store.addTracksToLibrary([track(TRACK_A, 'Song A')]);
    await store.flush();

    expect(store.library.libraryTrackIds).toEqual([TRACK_A]);
    expect(store.getLibraryTracks()).toHaveLength(1);
  });

  it('4. creating a playlist does not add tracks to Library', async () => {
    const store = createStoreFacade();
    await store.init();

    const song = track(TRACK_A, 'Song A');
    store.upsertTrackRecords([song]);
    const playlist = store.createPlaylist('Not saved', [song.id]);
    await store.flush();

    expect(playlist.trackIds).toEqual([TRACK_A]);
    expect(store.getLibraryTracks()).toEqual([]);
    expect(store.library.libraryTrackIds).toEqual([]);
    expect(store.getTrackById(TRACK_A)?.title).toBe('Song A');
  });
});

describe('storage contract — removal retains referenced canonical data', () => {
  it('5. removing a track from Library preserves playlist references', async () => {
    const store = createStoreFacade();
    await store.init();

    const song = track(TRACK_A, 'Song A');
    store.addTracksToLibrary([song]);
    store.upsertTrackRecords([song]);
    const playlist = store.createPlaylist('Mix', [song.id]);
    store.removeTrackFromLibrary(song.id);
    await store.flush();

    expect(store.isInLibrary(song.id)).toBe(false);
    expect(playlist.trackIds).toEqual([TRACK_A]);
    expect(store.getTrackById(TRACK_A)?.title).toBe('Song A');
  });

  it('6. removing a track from Library preserves favorite references', async () => {
    const store = createStoreFacade();
    await store.init();

    const song = track(TRACK_A, 'Song A');
    store.addTracksToLibrary([song]);
    store.toggleFavoriteTrack(song.id);
    store.removeTrackFromLibrary(song.id);
    await store.flush();

    expect(store.isInLibrary(song.id)).toBe(false);
    expect(store.library.favorites.trackIds).toEqual([TRACK_A]);
    expect(store.getTrackById(TRACK_A)?.title).toBe('Song A');
  });

  it('7. removing a track from Library does not erase canonical data while referenced', async () => {
    const store = createStoreFacade();
    await store.init();

    const song = track(TRACK_A, 'Song A');
    store.addTracksToLibrary([song]);
    store.toggleFavoriteTrack(song.id);
    store.upsertTrackRecords([song]);
    store.createPlaylist('Mix', [song.id]);
    store.removeTrackFromLibrary(song.id);
    await store.flush();

    expect(store.library.canonicalTracks[TRACK_A]).toMatchObject({
      id: TRACK_A,
      title: 'Song A',
    });
  });

  it('8. deleting the final reference allows orphan garbage collection', async () => {
    const store = createStoreFacade();
    await store.init();

    const libraryOnly = track(TRACK_A, 'Library only');
    store.addTracksToLibrary([libraryOnly]);
    store.removeTrackFromLibrary(libraryOnly.id);
    expect(store.library.canonicalTracks[TRACK_A]).toBeUndefined();

    const playlistOnly = track(TRACK_B, 'Playlist only');
    store.upsertTrackRecords([playlistOnly]);
    const playlist = store.createPlaylist('Temporary', [playlistOnly.id]);
    expect(store.library.canonicalTracks[TRACK_B]).toBeDefined();
    store.deletePlaylist(playlist.id);
    await store.flush();

    expect(store.library.canonicalTracks[TRACK_B]).toBeUndefined();
  });

  it('9. re-adding a removed track restores membership without duplicates', async () => {
    const store = createStoreFacade();
    await store.init();

    const song = track(TRACK_A, 'Song A');
    store.addTracksToLibrary([song]);
    store.removeTrackFromLibrary(song.id);
    expect(store.isInLibrary(song.id)).toBe(false);

    store.addTracksToLibrary([song]);
    store.addTracksToLibrary([song]);
    await store.flush();

    expect(store.library.libraryTrackIds).toEqual([TRACK_A]);
    expect(store.getLibraryTracks()).toHaveLength(1);
  });
});

describe('storage contract — restart and migration', () => {
  it('10. library and canonical records survive restart', async () => {
    const first = createStoreFacade();
    await first.init();
    first.addTracksToLibrary([
      track(TRACK_A, 'Song A'),
      track(TRACK_B, 'Song B', 'yt-b'),
    ]);
    await first.flush();

    const restarted = createStoreFacade();
    await restarted.init();

    expect(restarted.getLibraryTracks().map((item) => item.id)).toEqual([
      TRACK_A,
      TRACK_B,
    ]);
    expect(restarted.library.canonicalTracks[TRACK_A].title).toBe('Song A');
    expect(restarted.library.canonicalTracks[TRACK_B].youtubeVideoId).toBe('yt-b');
  });

  it('11. legacy schema migration seeds membership and canonical records once', async () => {
    const songA = track(TRACK_A, 'Song A');
    const songB = track(TRACK_B, 'Song B');
    await saveLibrary(legacyLibrary([songA, songB]));

    const migrated = await loadLibrary();
    expect(migrated.libraryMigrationVersion).toBe(1);
    expect(migrated.libraryTrackIds).toEqual([TRACK_A, TRACK_B]);
    expect(Object.keys(migrated.canonicalTracks).sort()).toEqual(
      [TRACK_A, TRACK_B].sort(),
    );

    const store = createStoreFacade();
    await store.init();
    expect(store.getLibraryTracks().map((item) => item.id).sort()).toEqual(
      [TRACK_A, TRACK_B].sort(),
    );
    expect(store.isInLibrary(TRACK_A)).toBe(true);
  });

  it('12. migration is idempotent and does not resurrect removed membership', async () => {
    const song = track(TRACK_A, 'Song A');
    await saveLibrary(legacyLibrary([song]));

    const store = createStoreFacade();
    await store.init();
    expect(store.library.libraryTrackIds).toEqual([TRACK_A]);

    store.removeTrackFromLibrary(TRACK_A);
    await store.flush();
    expect(store.library.libraryTrackIds).toEqual([]);

    const restarted = createStoreFacade();
    await restarted.init();
    expect(restarted.library.libraryTrackIds).toEqual([]);
    expect(restarted.isInLibrary(TRACK_A)).toBe(false);

    const reloaded = await loadLibrary();
    expect(reloaded.libraryTrackIds).toEqual([]);
    expect(reloaded.libraryMigrationVersion).toBe(1);
  });

  it('13. discovery-session overwrite does not break playlist or favorite rendering', async () => {
    const store = createStoreFacade();
    await store.init();

    const songA = track(TRACK_A, 'Song A');
    const songB = track(TRACK_B, 'Song B', 'yt-b');
    store.saveSession(session('discovery-1', [songA, songB]));

    store.upsertTrackRecords([songA, songB]);
    const playlist = store.createPlaylist('Durable mix', [songA.id, songB.id]);
    store.toggleFavoriteTrack(songA.id);
    await store.flush();

    // Overwrite the discovery session so it no longer contains either track.
    store.saveSession(session('discovery-1', [track(TRACK_C, 'Song C')], 2));
    await store.flush();

    expect(store.getTrackById(TRACK_A)?.title).toBe('Song A');
    expect(store.getTrackById(TRACK_B)?.title).toBe('Song B');
    expect(
      playlist.trackIds.map((id) => store.getTrackById(id)?.title),
    ).toEqual(['Song A', 'Song B']);
    expect(
      store.library.favorites.trackIds.map((id) => store.getTrackById(id)?.title),
    ).toEqual(['Song A']);

    const restarted = createStoreFacade();
    await restarted.init();
    expect(
      restarted.library.playlists[playlist.id].trackIds.map(
        (id) => restarted.getTrackById(id)?.title,
      ),
    ).toEqual(['Song A', 'Song B']);
    expect(
      restarted.library.favorites.trackIds.map(
        (id) => restarted.getTrackById(id)?.title,
      ),
    ).toEqual(['Song A']);
    // Neither the playlist nor the favorite created library membership.
    expect(restarted.getLibraryTracks()).toEqual([]);
  });
});
