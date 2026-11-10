import { beforeEach, describe, it, expect } from 'vitest';
import {
  addQuota,
  importLibraryJson,
  exportLibraryJson,
  loadQuota,
  wipeAllData,
  EMPTY_LIBRARY,
} from '../src/services/storage/storage';

beforeEach(async () => {
  await wipeAllData();
});

describe('backup/restore round-trip', () => {
  it('exports and re-imports a library', async () => {
    const lib = {
      ...EMPTY_LIBRARY,
      artists: { a1: { id: 'a1', name: 'Artist', normalizedName: 'artist', discoveredAt: 1, favorite: true } },
      playlists: { p1: { id: 'p1', name: 'Mix', trackIds: ['dQw4w9WgXcQ'], createdAt: 1, updatedAt: 1 } },
    };
    const json = JSON.stringify({ app: 'SangeetPremi', version: 1, library: lib });
    await importLibraryJson(json);
    const out = JSON.parse(await exportLibraryJson());
    expect(out.library.playlists.p1.name).toBe('Mix');
    expect(out.library.artists.a1.favorite).toBe(true);
  });
  it('rejects malformed json', async () => {
    await expect(importLibraryJson('not json')).rejects.toThrow('not valid JSON');
    await expect(importLibraryJson('{"foo":1}')).rejects.toThrow('backup');
  });
});

describe('quota persistence', () => {
  it('persists quota increments through the storage backend', async () => {
    const before = await loadQuota();
    expect(before.used).toBe(0);

    const after = await addQuota(7);
    expect(after.used).toBe(7);

    const reloaded = await loadQuota();
    expect(reloaded.used).toBe(7);
    expect(reloaded.date).toBe(before.date);
  });
});
