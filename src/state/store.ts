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

function uniqueIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeLibrary(library: LibraryState): LibraryState {
  const playlists: Record<string, Playlist> = {};
  for (const [id, playlist] of Object.entries(library.playlists ?? {})) {
    playlists[id] = {
      ...playlist,
      trackIds: uniqueIds(playlist.trackIds),
      trackVideoIds: uniqueIds(playlist.trackVideoIds),
    };
  }

  return {
    ...EMPTY_LIBRARY,
    ...library,
    canonicalTracks: { ...(library.canonicalTracks ?? {}) },
    libraryTrackIds: uniqueIds(library.libraryTrackIds),
    libraryMigrationVersion:
      typeof library.libraryMigrationVersion === 'number'
        ? library.libraryMigrationVersion
        : EMPTY_LIBRARY.libraryMigrationVersion,
    artists: { ...(library.artists ?? {}) },
    sessions: { ...(library.sessions ?? {}) },
    playlists,
    favorites: { trackIds: uniqueIds(library.favorites?.trackIds) },
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
    for (const track of Object.values(this.library.canonicalTracks)) {
      if (track?.id) byId.set(track.id, track);
    }
    for (const session of Object.values(this.library.sessions)) {
      for (const track of session.tracks ?? []) {
        if (track?.id && !byId.has(track.id)) byId.set(track.id, track);
      }
    }
    return [...byId.values()];
  }

  /** Explicitly saved library tracks, in membership order. */
  getLibraryTracks(): Track[] {
    const tracks: Track[] = [];
    const seen = new Set<string>();
    for (const id of this.library.libraryTrackIds) {
      if (seen.has(id)) continue;
      const track =
        this.library.canonicalTracks[id] ??
        this.allTracks().find((candidate) => candidate.id === id);
      if (!track) continue;
      seen.add(id);
      tracks.push(track);
    }
    return tracks;
  }

  /**
   * Resolve a canonical recording from any durable reference. Playlists and
   * favorites therefore survive discovery-session replacement or deletion.
   */
  getTrackById(trackId: string): Track | undefined {
    if (!trackId) return undefined;
    const direct = this.library.canonicalTracks[trackId];
    if (direct) return direct;
    return this.allTracks().find(
      (track) =>
        track.id === trackId ||
        track.youtubeVideoId === trackId ||
        track.videoId === trackId,
    );
  }

  isInLibrary(trackId: string): boolean {
    const resolved = this.resolveTrackId(trackId);
    if (!resolved) return false;
    return this.library.libraryTrackIds.includes(resolved);
  }

  /** Explicit Add to Library. Caches canonical data and creates membership. */
  addTracksToLibrary(tracks: Track[]): void {
    let changed = false;
    const membership = new Set(this.library.libraryTrackIds);

    for (const track of tracks) {
      if (!track || typeof track.id !== 'string' || track.id.length === 0) continue;
      this.library.canonicalTracks[track.id] = {
        ...(this.library.canonicalTracks[track.id] ?? {}),
        ...clone(track),
      };
      if (!membership.has(track.id)) {
        membership.add(track.id);
        changed = true;
      }
      changed = true;
    }

    if (!changed) return;
    this.library.libraryTrackIds = [...membership];
    this.commitLibrary();
  }

  /**
   * Remove membership only. Canonical records referenced by playlists,
   * favorites or discovery sessions remain resolvable; unreferenced records
   * are collected afterwards.
   */
  removeTrackFromLibrary(trackId: string): void {
    const resolved = this.resolveTrackId(trackId);
    if (!resolved) return;
    const next = this.library.libraryTrackIds.filter((id) => id !== resolved);
    if (next.length === this.library.libraryTrackIds.length) return;
    this.library.libraryTrackIds = next;
    this.collectOrphanTracks();
    this.commitLibrary();
  }

  /** Cache canonical records without creating library membership. */
  upsertTrackRecords(tracks: Track[]): void {
    let changed = false;
    for (const track of tracks) {
      if (!track || typeof track.id !== 'string' || track.id.length === 0) continue;
      this.library.canonicalTracks[track.id] = {
        ...(this.library.canonicalTracks[track.id] ?? {}),
        ...clone(track),
      };
      changed = true;
    }
    if (changed) this.commitLibrary();
  }

  private collectOrphanTracks(): void {
    const referenced = new Set<string>();
    for (const id of this.library.libraryTrackIds) referenced.add(id);
    for (const id of this.library.favorites.trackIds) referenced.add(id);
    for (const playlist of Object.values(this.library.playlists)) {
      for (const id of playlist.trackIds ?? []) referenced.add(id);
    }
    for (const session of Object.values(this.library.sessions)) {
      for (const track of session.tracks ?? []) {
        if (track?.id) referenced.add(track.id);
      }
    }

    for (const id of Object.keys(this.library.canonicalTracks)) {
      if (!referenced.has(id)) delete this.library.canonicalTracks[id];
    }
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
    this.collectOrphanTracks();
    this.commitLibrary();
  }

  deleteSession(id: string): void {
    if (!this.library.sessions[id]) return;
    delete this.library.sessions[id];
    this.collectOrphanTracks();
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
    if (favorites.has(canonicalId)) {
      favorites.delete(canonicalId);
    } else {
      favorites.add(canonicalId);
      const track = this.getTrackById(canonicalId);
      if (track) {
        this.library.canonicalTracks[canonicalId] = {
          ...(this.library.canonicalTracks[canonicalId] ?? {}),
          ...clone(track),
        };
      }
    }

    this.library.favorites = { trackIds: [...favorites] };
    this.collectOrphanTracks();
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
    this.collectOrphanTracks();
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
    this.collectOrphanTracks();
    this.commitLibrary();
  }

  deletePlaylist(id: string): void {
    if (!this.library.playlists[id]) return;
    delete this.library.playlists[id];
    this.playlistSnapshots.delete(id);
    this.collectOrphanTracks();
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
