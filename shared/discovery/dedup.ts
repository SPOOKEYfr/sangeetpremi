/**
 * Smart duplicate detection.
 *
 * Two uploads are duplicates when they share a dedupe key built from the
 * normalized base title + normalized artist. Alternate versions (live,
 * remix, acoustic…) get their own key so they survive as separate entries,
 * unless strict mode collapses them.
 *
 * Pure functions — unit tested in tests/dedup.test.ts
 */
import type { Track } from '../types.js';
import { baseTitle, extractVersionTags, normalizeArtistName } from '../normalize.js';
import { stableKey } from '../id.js';

export type DedupMode = 'strict' | 'balanced' | 'off';

/** Key that identifies "the same recording". */
export function dedupeKeyOf(title: string, artist: string, includeVersion = true): string {
  const base = baseTitle(title);
  const artistNorm = normalizeArtistName(artist);
  const tags = includeVersion ? extractVersionTags(title).sort().join('+') : '';
  return stableKey(base, artistNorm, tags);
}

export interface DedupResult {
  kept: Track[];
  duplicates: Track[];
  removedCount: number;
}

/**
 * Deduplicate a list of tracks.
 * - 'off':       no dedup.
 * - 'balanced':  same base title + artist + version tags collapse; the
 *                representative is the one with most views (official-ish).
 * - 'strict':    version tags ignored — all versions of a song collapse
 *                into one entry (alternate versions are excluded, not
 *                deleted, so the user can restore them).
 */
export function deduplicate(tracks: Track[], mode: DedupMode = 'balanced'): DedupResult {
  if (mode === 'off') {
    return { kept: [...tracks], duplicates: [], removedCount: 0 };
  }
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = dedupeKeyOf(t.title, t.artist, mode === 'balanced');
    t.dedupeKey = key;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  const kept: Track[] = [];
  const duplicates: Track[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    // Representative: highest view count, then earliest publish.
    const sorted = [...group].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) || (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''));
    const rep = sorted[0];
    kept.push(rep);
    for (const dup of sorted.slice(1)) {
      dup.isDuplicate = true;
      dup.canonicalId = rep.videoId;
      duplicates.push(dup);
    }
  }
  return { kept, duplicates, removedCount: duplicates.length };
}
