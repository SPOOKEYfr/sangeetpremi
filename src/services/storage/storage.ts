/**
 * Safe local storage wrapper around chrome.storage.local with an
 * in-memory/localStorage fallback for development outside the extension.
 * All library data is user-owned and stays on-device unless the user
 * explicitly exports it.
 */
import type { LibraryState, Settings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

const LIBRARY_KEY = 'sangeetpremi.library';
const SETTINGS_KEY = 'sangeetpremi.settings';

const memoryFallback = new Map<string, unknown>();

function backend() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
  return null;
}

async function get<T>(key: string, fallback: T): Promise<T> {
  const b = backend();
  if (!b) return (memoryFallback.get(key) as T) ?? fallback;
  const res = await b.get(key);
  return (res[key] as T) ?? fallback;
}

async function set<T>(key: string, value: T): Promise<void> {
  const b = backend();
  if (!b) {
    memoryFallback.set(key, value);
    return;
  }
  await b.set({ [key]: value });
}

export const EMPTY_LIBRARY: LibraryState = {
  artists: {},
  sessions: {},
  playlists: {},
  favorites: { trackIds: [] },
  history: [],
};

export async function loadLibrary(): Promise<LibraryState> {
  const lib = await get<LibraryState>(LIBRARY_KEY, EMPTY_LIBRARY);
  return { ...EMPTY_LIBRARY, ...lib, favorites: { ...EMPTY_LIBRARY.favorites, ...lib.favorites } };
}

export async function saveLibrary(lib: LibraryState): Promise<void> {
  await set(LIBRARY_KEY, lib);
}

export async function loadSettings(): Promise<Settings> {
  return get<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export async function saveSettings(s: Settings): Promise<void> {
  await set(SETTINGS_KEY, s);
}

/** Export the whole user library as a JSON string (backup feature). */
export async function exportLibraryJson(): Promise<string> {
  const [lib, settings] = await Promise.all([loadLibrary(), loadSettings()]);
  return JSON.stringify(
    { app: 'SangeetPremi', version: 1, exportedAt: new Date().toISOString(), library: lib, settings },
    null,
    2,
  );
}

/** Import a previously exported library JSON. Throws on malformed input. */
export async function importLibraryJson(json: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The provided file is not valid JSON.');
  }
  const lib = (parsed as { library?: LibraryState }).library;
  if (!lib || typeof lib !== 'object' || !lib.artists || !lib.playlists || !lib.sessions) {
    throw new Error('The file does not look like a SangeetPremi backup.');
  }
  await saveLibrary({ ...EMPTY_LIBRARY, ...lib });
}

/**
 * Every storage key owned by SangeetPremi. wipeAllData removes ALL of them —
 * including the OAuth token. Remote revocation of the Google grant is a
 * separate best-effort step (see services/youtube/oauth.revoke); local deletion
 * is guaranteed even if the network call fails.
 */
export const OWNED_STORAGE_KEYS = [
  LIBRARY_KEY,
  SETTINGS_KEY,
  'sangeetpremi.config',
  'sangeetpremi.quota',
  'sangeetpremi.oauthToken',
] as const;

/** Wipe all local SangeetPremi data (library, settings, config, quota, OAuth token). */
export async function wipeAllData(): Promise<void> {
  const b = backend();
  if (!b) {
    memoryFallback.clear();
    return;
  }
  await b.remove([...OWNED_STORAGE_KEYS]);
}
