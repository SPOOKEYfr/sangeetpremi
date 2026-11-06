/**
 * Centralized application state. A tiny observable store — components
 * subscribe to slices and re-render on change. Persistence goes through
 * services/storage so state survives extension/browser restarts.
 */
import type { LibraryState, Playlist, Settings, Track } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { loadLibrary, loadSettings, saveLibrary, saveSettings } from '../services/storage/storage';
import { randomId } from '../utils/id';

type Listener = () => void;

class Store {
  library: LibraryState | null = null;
  settings: Settings = DEFAULT_SETTINGS;
  private listeners = new Set<Listener>();
  private loaded = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    const [lib, settings] = await Promise.all([loadLibrary(), loadSettings()]);
    this.library = lib;
    this.settings = settings;
    this.loaded = true;
    this.emit();
  }

  private async persistLibrary(): Promise<void> {
    if (this.library) await saveLibrary(this.library);
  }

  private async persistSettings(): Promise<void> {
    await saveSettings(this.settings);
  }

  // ---- Artists ----
  saveArtist(a: LibraryState['artists'][string]): void {
    if (!this.library) return;
    this.library.artists[a.id] = a;
    void this.persistLibrary();
    this.emit();
  }

  toggleFavoriteArtist(id: string): void {
    if (!this.library?.artists[id]) return;
    this.library.artists[id].favorite = !this.library.artists[id].favorite;
    void this.persistLibrary();
    this.emit();
  }

  // ---- Sessions ----
  saveSession(s: LibraryState['sessions'][string]): void {
    if (!this.library) return;
    this.library.sessions[s.id] = s;
    void this.persistLibrary();
    this.emit();
  }

  deleteSession(id: string): void {
    if (!this.library) return;
    delete this.library.sessions[id];
    void this.persistLibrary();
    this.emit();
  }

  // ---- Playlists ----
  createPlaylist(name: string, trackVideoIds: string[] = [], description = ''): Playlist {
    const now = Date.now();
    const p: Playlist = { id: randomId('pl'), name, description, trackVideoIds, createdAt: now, updatedAt: now };
    if (this.library) this.library.playlists[p.id] = p;
    void this.persistLibrary();
    this.emit();
    return p;
  }

  updatePlaylist(p: Playlist): void {
    if (!this.library) return;
    p.updatedAt = Date.now();
    this.library.playlists[p.id] = p;
    void this.persistLibrary();
    this.emit();
  }

  deletePlaylist(id: string): void {
    if (!this.library) return;
    delete this.library.playlists[id];
    void this.persistLibrary();
    this.emit();
  }

  // ---- Favorites / history ----
  toggleFavoriteTrack(videoId: string): void {
    if (!this.library) return;
    const favs = this.library.favorites.trackIds;
    const i = favs.indexOf(videoId);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(videoId);
    void this.persistLibrary();
    this.emit();
  }

  pushHistory(query: string, artistId?: string): void {
    if (!this.library) return;
    this.library.history.unshift({ query, artistId, at: Date.now() });
    this.library.history = this.library.history.slice(0, 30);
    void this.persistLibrary();
  }

  // ---- Settings ----
  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    void this.persistSettings();
    this.emit();
  }

  /** Flatten all tracks across sessions (for library views). */
  allTracks(): Track[] {
    if (!this.library) return [];
    const map = new Map<string, Track>();
    for (const s of Object.values(this.library.sessions)) {
      for (const t of s.tracks) map.set(t.videoId, t);
    }
    return [...map.values()];
  }
}

export const store = new Store();
