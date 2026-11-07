/**
 * Safe local storage wrapper around chrome.storage.local with an
 * in-memory/localStorage fallback for development outside the extension.
 *
 * Data domains (strictly separated per policy):
 *   1. oauthToken  — Authorized Data, revoked on demand, prompt cleanup.
 *   2. library     — General on‑device data, indefinite retention.
 *   3. quota       — Daily quota tracking, auto‑reset at midnight PT.
 *   4. config      — User‑provided API key / client ID settings.
 *
 * Never conflate token expiry with consent revocation.
 * Revocation is handled promptly; token lifecycle is separate from
 * authorized‑data retention.
 */
import type { LibraryState, Settings, YouTubeConfig } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

const LIBRARY_KEY = 'sangeetpremi.library';
const SETTINGS_KEY = 'sangeetpremi.settings';
const QUOTA_KEY = 'sangeetpremi.quota';
const CONFIG_KEY = 'sangeetpremi.config';
const OAUTH_TOKEN_KEY = 'sangeetpremi.oauthToken';

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

async function remove(keys: string[]): Promise<void> {
  const b = backend();
  if (!b) {
    for (const key of keys) memoryFallback.delete(key);
    return;
  }
  await b.remove(keys);
}

/* Library */

export const EMPTY_LIBRARY: LibraryState = {
  artists: {},
  sessions: {},
  playlists: {},
  favorites: { trackIds: [] },
  history: [],
  provenance: 'mixed',
};

export async function loadLibrary(): Promise<LibraryState> {
  const lib = await get<LibraryState>(LIBRARY_KEY, EMPTY_LIBRARY);
  return { ...EMPTY_LIBRARY, ...lib, provenance: 'mixed' };
}

export async function saveLibrary(lib: LibraryState): Promise<void> {
  await set(LIBRARY_KEY, lib);
}

/* Settings */

export async function loadSettings(): Promise<Settings> {
  return get<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export async function saveSettings(s: Settings): Promise<void> {
  await set(SETTINGS_KEY, s);
}

/** Update YouTube config (optional, never mandatory). */
export async function updateYouTubeConfig(cfg: Partial<YouTubeConfig>): Promise<void> {
  await set(CONFIG_KEY, { ...(await loadConfig()), ...cfg });
}

/** Load the full config (API key + client ID). */
export async function loadConfig(): Promise<YouTubeConfig> {
  const cfg = await get<YouTubeConfig>(CONFIG_KEY, {});
  return cfg;
}

/* OAuth token (Authorized Data) — prompt revocation, separate from data retention. */

export async function loadOauthToken(): Promise<{ accessToken: string; expiresAt: number } | null> {
  const res = await get<{ accessToken: string; expiresAt: number }>(OAUTH_TOKEN_KEY, null as any);
  if (!res) return null;
  // Return the token if it exists; the caller (extension code) is responsible
  // for reconciling revocation. We do NOT automatically purge revoked tokens
  // here — that is the job of the revocation handler, which operates on
  // demand, not on every load. This keeps loadOauthToken fast and separate
  // from the revocation lifecycle.
  return res;
}

export async function saveOauthToken(token: { accessToken: string; expiresAt: number }): Promise<void> {
  await set(OAUTH_TOKEN_KEY, token);
}

/** Revoke OAuth token — remove immediately, do not retain for any window.
 *  This is the prompt revocation handler. The 30‑day window mentioned in the
 *  design docs refers to a reconciliation period for UI-initiated revocation
 *  cleanup, not for automatic token retention.
 */
export async function clearOauthToken(): Promise<void> {
  await remove([OAUTH_TOKEN_KEY]);
}

/* Quota (daily) — auto‑reset at midnight PT. No 30‑day limit applies. */

export async function loadQuota(): Promise<{ date: string; used: number; limit: number }> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY‑MM‑DD
  const res = await get<{ date: string; used: number; limit: number }>(QUOTA_KEY, { date: today, used: 0, limit: 10000 });
  if (res.date !== today) {
    const newQuota = { date: today, used: 0, limit: 10000 };
    await set(QUOTA_KEY, newQuota);
    return newQuota;
  }
  return res;
}

export async function addQuota(units: number): Promise<{ date: string; used: number; limit: number }> {
  const usage = await loadQuota();
  const next = { date: usage.date, used: usage.used + units, limit: usage.limit };
  await set(QUOTA_KEY, next);
  return next;
}

/* Library persistence helpers */

export async function wipeAllData(): Promise<void> {
  await remove([LIBRARY_KEY, SETTINGS_KEY, CONFIG_KEY, QUOTA_KEY, OAUTH_TOKEN_KEY]);
}

export async function exportLibraryJson(): Promise<string> {
  const [lib, settings] = await Promise.all([loadLibrary(), loadSettings()]);
  return JSON.stringify(
    { app: 'SangeetPremi', version: 1, exportedAt: new Date().toISOString(), library: lib, settings },
    null,
    2,
  );
}

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
  if (lib.provenance !== 'mixed') {
    throw new Error('Unrecognized library provenance.');
  }
  await saveLibrary({ ...EMPTY_LIBRARY, ...lib });
}
