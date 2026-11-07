/**
 * Application state façade for the dashboard, popup and background contexts.
 *
 * Storage itself lives in `src/services/storage/storage.ts`; this module owns
 * the immediately-usable in-memory state, mutation helpers, subscriptions and
 * serialized persistence. There is intentionally no second storage backend.
 */
import type {
  Artist,
  DiscoverySession,
  LibraryState,
  Playlist,
  Settings,
  Track,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { randomId } from '../utils/id';
import {
  EMPTY_LIBRARY,
  loadLibrary,
  loadSettings,
  saveLibrary,
  saveSettings,
} from '../services/storage/storage';

export {
  EMPTY_LIBRARY,
  addQuota,
  clearOauthToken,
  exportLibraryJson,
  importLibraryJson,
  loadConfig,
  loadLibrary,
  loadOauthToken,
  loadQuota,
  loadSettings,
  saveLibrary,
  saveOauthToken,
  saveSettings,
  updateYouTubeConfig,
  wipeAllData,
} from '../services/storage/storage';

export type {
  Artist,
  DiscoverySession,
  LibraryState,
  Playlist,
  Settings,
  Track,
} from '../types';

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLibrary(library: LibraryState): LibraryState {
  const playlists: Record<string, Playlist> = {};
  for (const [id, playlist] of Object.entries(library.playlists ?? {})) {
    playlists[id] = {
      ...playlist,
      trackIds: [...(playlist.trackIds ?? [])],
      trackVideoIds: [...(playlist.trackVideoIds ?? [])],
    };
  }

  return {
    ...EMPTY_LIBRARY,
    ...library,
    artists: { ...(library.artists ?? {}) },
    sessions: { ...(library.sessions ?? {}) },
    playlists,
    favorites: { trackIds: [...(library.favorites?.trackIds ?? [])] },
    history: [...(library.history ?? [])],
    provenance: 'mixed',
  };
}

function normalizeSettings(settings: Settings | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    youtube: { ...DEFAULT_SETTINGS.youtube, ...(settings?.youtube ?? {}) },
  };
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

interface PlaylistIdentity {
  trackIds: string[];
  trackVideoIds: string[];
}

export class StoreFacade {
  /** Immediately usable in-memory library state. */
  library: LibraryState = normalizeLibrary(EMPTY_LIBRARY);
  /** Immediately usable in-memory settings. */
  settings: Settings = normalizeSettings(DEFAULT_SETTINGS);

  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private writeChain: Promise<void> = Promise.resolve();
  /**
   * Last persisted playlist identity per playlist. The GUI mutates playlist
   * objects in place, so comparing a playlist with itself cannot detect a
   * changed trackVideoIds array. This snapshot makes those edits observable.
   */
  private playlistSnapshots = new Map<string, PlaylistIdentity>();

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.writeChain.catch(() => undefined);
        const [library, settings] = await Promise.all([loadLibrary(), loadSettings()]);
        this.library = normalizeLibrary(library);
        this.settings = normalizeSettings(settings);
        this.reindexPlaylists();
        this.initialized = true;
        this.notify();
      })();
    }
    return this.initPromise;
  }

  /** Wait for every queued persistence write to settle. */
  flush(): Promise<void> {
    return this.writeChain;
  }

  allTracks(): Track[] {
    const byId = new Map<string, Track>();
    for (const session of Object.values(this.library.sessions)) {
      for (const track of session.tracks ?? []) {
        if (!byId.has(track.id)) byId.set(track.id, track);
      }
    }
    return [...byId.values()];
  }

  pushHistory(query: string, artistId?: string): void {
    const normalized = query.trim();
    if (!normalized) return;
    this.library.history = [
      { query: normalized, artistId, at: Date.now() },
      ...this.library.history.filter((entry) => entry.query !== normalized),
    ].slice(0, 100);
    this.commitLibrary();
  }

  saveSession(session: DiscoverySession): void {
    this.library.sessions[session.id] = clone(session);
    this.commitLibrary();
  }

  deleteSession(id: string): void {
    if (!this.library.sessions[id]) return;
    delete this.library.sessions[id];
    this.commitLibrary();
  }

  saveArtist(
    artist: Artist & { discoveredAt?: number; favorite?: boolean },
  ): void {
    const existing = this.library.artists[artist.id];
    this.library.artists[artist.id] = {
      ...existing,
      ...clone(artist),
      discoveredAt:
        artist.discoveredAt ?? existing?.discoveredAt ?? Date.now(),
      favorite: artist.favorite ?? existing?.favorite ?? false,
    };
    this.commitLibrary();
  }

  toggleFavoriteArtist(id: string): void {
    const artist = this.library.artists[id];
    if (!artist) return;
    this.library.artists[id] = { ...artist, favorite: !artist.favorite };
    this.commitLibrary();
  }

  toggleFavoriteTrack(id: string | undefined): void {
    const canonicalId = this.resolveTrackId(id);
    if (!canonicalId) return;

    const favorites = new Set(this.library.favorites.trackIds);
    if (favorites.has(canonicalId)) favorites.delete(canonicalId);
    else favorites.add(canonicalId);

    this.library.favorites = { trackIds: [...favorites] };
    this.commitLibrary();
  }

  createPlaylist(
    name: string,
    trackIds: string[] = [],
    description?: string,
  ): Playlist {
    const canonicalIds = this.canonicalTrackIds(trackIds);
    const now = Date.now();
    const playlist: Playlist = {
      id: randomId('playlist'),
      name: name.trim() || 'Untitled playlist',
      description,
      trackIds: canonicalIds,
      trackVideoIds: this.youtubeIdsFor(canonicalIds),
      createdAt: now,
      updatedAt: now,
    };

    this.library.playlists[playlist.id] = playlist;
    this.rememberPlaylist(playlist);
    this.commitLibrary();
    return playlist;
  }

  updatePlaylist(playlist: Playlist): void {
    const existing = this.library.playlists[playlist.id];
    if (!existing) return;

    const canonicalIds = this.canonicalIdsForPlaylist(playlist, existing);
    const updated: Playlist = {
      ...existing,
      ...playlist,
      trackIds: canonicalIds,
      trackVideoIds: this.youtubeIdsFor(canonicalIds),
      updatedAt: Date.now(),
    };

    this.library.playlists[playlist.id] = updated;
    this.rememberPlaylist(updated);
    // Keep the caller's object coherent if it is the same reference the GUI
    // mutates before calling updatePlaylist().
    Object.assign(playlist, updated);
    this.commitLibrary();
  }

  deletePlaylist(id: string): void {
    if (!this.library.playlists[id]) return;
    delete this.library.playlists[id];
    this.playlistSnapshots.delete(id);
    this.commitLibrary();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = normalizeSettings({
      ...this.settings,
      ...patch,
      youtube: { ...this.settings.youtube, ...(patch.youtube ?? {}) },
    });
    this.commitSettings();
  }

  private resolveTrackId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const tracks = this.allTracks();
    const direct = tracks.find((track) => track.id === id);
    if (direct) return direct.id;

    const linked = tracks.find(
      (track) => track.youtubeVideoId === id || track.videoId === id,
    );
    return linked?.id ?? id;
  }

  private canonicalTrackIds(ids: string[]): string[] {
    const canonical: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const resolved = this.resolveTrackId(id);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      canonical.push(resolved);
    }
    return canonical;
  }

  private youtubeIdForTrack(id: string): string | undefined {
    const track = this.allTracks().find((candidate) => candidate.id === id);
    return track?.youtubeVideoId ?? track?.videoId;
  }

  private youtubeIdsFor(trackIds: string[]): string[] {
    const ids: string[] = [];
    for (const id of trackIds) {
      const youtubeId = this.youtubeIdForTrack(id);
      if (youtubeId && !ids.includes(youtubeId)) ids.push(youtubeId);
    }
    return ids;
  }

  private canonicalIdsForPlaylist(
    playlist: Playlist,
    existing: Playlist,
  ): string[] {
    const previous = this.playlistSnapshots.get(playlist.id) ?? {
      trackIds: [...(existing.trackIds ?? [])],
      trackVideoIds: [...(existing.trackVideoIds ?? [])],
    };

    const legacyChanged =
      playlist.trackVideoIds !== undefined &&
      !sameStringArray(playlist.trackVideoIds, previous.trackVideoIds);
    const canonicalChanged = !sameStringArray(playlist.trackIds, previous.trackIds);

    if (legacyChanged) {
      const fromLegacy = this.canonicalTrackIds(playlist.trackVideoIds ?? []);
      const represented = new Set(fromLegacy);
      // MB-only tracks have no video ID, so they cannot appear in the GUI's
      // legacy trackVideoIds array. Preserve them while applying legacy edits.
      const mbOnly = previous.trackIds.filter(
        (id) => !this.youtubeIdForTrack(id) && !represented.has(id),
      );
      return [...fromLegacy, ...mbOnly.filter((id) => !fromLegacy.includes(id))];
    }

    if (canonicalChanged) {
      return this.canonicalTrackIds(playlist.trackIds ?? []);
    }
    return this.canonicalTrackIds(previous.trackIds);
  }

  private rememberPlaylist(playlist: Playlist): void {
    this.playlistSnapshots.set(playlist.id, {
      trackIds: [...playlist.trackIds],
      trackVideoIds: [...(playlist.trackVideoIds ?? [])],
    });
  }

  private reindexPlaylists(): void {
    this.playlistSnapshots.clear();
    for (const playlist of Object.values(this.library.playlists)) {
      this.rememberPlaylist(playlist);
    }
  }

  private commitLibrary(): void {
    const snapshot = clone(this.library);
    this.enqueueWrite(() => saveLibrary(snapshot));
    this.notify();
  }

  private commitSettings(): void {
    const snapshot = clone(this.settings);
    this.enqueueWrite(() => saveSettings(snapshot));
    this.notify();
  }

  private enqueueWrite(task: () => Promise<void>): void {
    // Both branches run the next task so one failed write cannot block later
    // writes. `flush()` still surfaces the failure for callers that await it.
    this.writeChain = this.writeChain.then(task, task);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A presentation listener must never break state mutations.
      }
    }
  }
}

/** Singleton used by the dashboard, popup and side-panel iframe. */
export const store = new StoreFacade();

/** Factory for tests or isolated state containers. */
export function createStoreFacade(): StoreFacade {
  return new StoreFacade();
}
