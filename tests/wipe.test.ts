/**
 * Regression test for Phase B.1 defect B: wipeAllData() must remove every
 * SangeetPremi-owned key, including the OAuth token.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wipeAllData, OWNED_STORAGE_KEYS, loadLibrary } from '../src/services/storage/storage';

function mockChromeStorage(seed: Record<string, unknown>) {
  const data = { ...seed };
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: data[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(data, obj)),
        remove: vi.fn(async (keys: string[]) => { for (const k of keys) delete data[k]; }),
      },
    },
  };
  return data;
}

describe('wipeAllData removes ALL owned keys', () => {
  beforeEach(() => { delete (globalThis as Record<string, unknown>).chrome; });

  it('removes library, settings, config, quota AND oauth token', async () => {
    const data = mockChromeStorage({
      'sangeetpremi.library': { artists: {}, sessions: {}, playlists: {}, favorites: { trackIds: [] }, history: [] },
      'sangeetpremi.settings': { theme: 'dark' },
      'sangeetpremi.config': { youtubeApiKey: 'secret' },
      'sangeetpremi.quota': { date: '2026-11-06', search: 3, uploads: 0, general: 12 },
      'sangeetpremi.oauthToken': { accessToken: 'ya29.token', expiresAt: Date.now() + 1e6 },
    });
    expect(OWNED_STORAGE_KEYS).toContain('sangeetpremi.oauthToken');
    await wipeAllData();
    for (const key of OWNED_STORAGE_KEYS) {
      expect(data[key], `key ${key} should be removed`).toBeUndefined();
    }
    expect(Object.keys(data).filter((k) => k.startsWith('sangeetpremi.'))).toEqual([]);
  });

  it('library is empty after wipe', async () => {
    mockChromeStorage({ 'sangeetpremi.library': { artists: { a: {} }, sessions: {}, playlists: {}, favorites: { trackIds: ['x'] }, history: [{ query: 'x', at: 1 }] } });
    await wipeAllData();
    const lib = await loadLibrary();
    expect(lib.artists).toEqual({});
    expect(lib.favorites.trackIds).toEqual([]);
  });
});
