/**
 * Multi-artist merge + incremental refresh diffing. Pure functions.
 *
 * Attribution rule: every merged track keeps the artist it was discovered
 * for — merging never reassigns a track to another artist.
 */
import type { Artist, DiscoverySession, Track } from '../../types';
import { dedupeKeyOf } from './dedup';

export interface MergedDiscovery {
  artists: Artist[];
  tracks: Track[]; // kept (non-duplicate) tracks across all artists
  duplicates: Track[];
  perArtistCounts: Record<string, number>;
}

/** Merge several discovery sessions into one combined collection. */
export function mergeSessions(sessions: DiscoverySession[]): MergedDiscovery {
  const artists = sessions.map((s) => s.artist);
  const all = sessions.flatMap((s) => s.tracks);
  // Cross-artist dedup: group by recording identity WITHOUT the artist name,
  // but only collapse a group when it contains a shared recording (a duet /
  // collaboration / featured track). Two different artists' unrelated songs
  // that merely share a title are never merged.
  const SHARED_CATEGORIES = new Set(['collaboration', 'featured', 'duet']);
  const groups = new Map<string, Track[]>();
  for (const t of all) {
    const key = dedupeKeyOf(t.title, ''); // artist-agnostic recording key
    t.dedupeKey = key;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  const tracks: Track[] = [];
  const duplicates: Track[] = [];
  for (const g of groups.values()) {
    const isSharedRecording = g.some((t) => SHARED_CATEGORIES.has(t.category) || t.role === 'featured');
    if (g.length === 1 || !isSharedRecording) {
      tracks.push(...g);
      continue;
    }
    const sorted = [...g].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    tracks.push(sorted[0]); // attribution stays with the highest-view keeper
    for (const d of sorted.slice(1)) {
      d.isDuplicate = true;
      d.canonicalId = sorted[0].videoId;
      duplicates.push(d);
    }
  }
  const perArtistCounts: Record<string, number> = {};
  for (const t of tracks) perArtistCounts[t.artist] = (perArtistCounts[t.artist] ?? 0) + 1;
  return { artists, tracks, duplicates, perArtistCounts };
}

export interface RefreshDiff {
  /** Candidates not present in the existing collection. */
  newTracks: Track[];
  /** Existing video ids that were re-found (still valid). */
  stillPresent: number;
  /** Existing ids no longer found by the API (left untouched — never auto-removed). */
  notRefreshed: number;
  totalCandidates: number;
}

/**
 * Diff a fresh discovery against an existing session's tracks.
 * Existing tracks are never modified or removed here — the UI decides
 * what to merge, so a refresh can never silently overwrite a collection.
 */
export function diffRefresh(existing: Track[], fresh: Track[]): RefreshDiff {
  const existingIds = new Set(existing.map((t) => t.videoId));
  const freshIds = new Set(fresh.map((t) => t.videoId));
  const newTracks = fresh.filter((t) => !existingIds.has(t.videoId) && !t.isDuplicate);
  return {
    newTracks,
    stillPresent: fresh.filter((t) => existingIds.has(t.videoId)).length,
    notRefreshed: existing.filter((t) => !freshIds.has(t.videoId)).length,
    totalCandidates: fresh.length,
  };
}
