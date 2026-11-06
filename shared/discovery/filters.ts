/**
 * Pure track filtering helpers used by discovery results, library and
 * playlist views. Year filtering uses publishedAt (verified metadata);
 * language filtering uses script detection (labelled heuristic in the UI).
 */
import type { DiscoveryCategory, Track } from '../types.js';
import { detectLanguage } from '../language.js';

export function filterByCategory(tracks: Track[], categories: DiscoveryCategory | DiscoveryCategory[] | 'all'): Track[] {
  if (categories === 'all') return tracks;
  const set = new Set(Array.isArray(categories) ? categories : [categories]);
  if (set.size === 0) return tracks;
  return tracks.filter((t) => set.has(t.category));
}

export function searchTracks(tracks: Track[], query: string): Track[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.channelTitle ?? '').toLowerCase().includes(q),
  );
}

/** Year range filter. Years come from publishedAt — verified API metadata. */
export function filterByYearRange(tracks: Track[], from?: number, to?: number): Track[] {
  if (!from && !to) return tracks;
  return tracks.filter((t) => {
    if (!t.publishedAt) return false; // unknown year: excluded when a range is set (never invented)
    const y = Number(t.publishedAt.slice(0, 4));
    if (Number.isNaN(y)) return false;
    if (from !== undefined && y < from) return false;
    if (to !== undefined && y > to) return false;
    return true;
  });
}

/** Language filter — heuristic for Latin scripts, script-verified otherwise. */
export function filterByLanguage(tracks: Track[], langCode: string | 'all'): Track[] {
  if (langCode === 'all') return tracks;
  return tracks.filter((t) => detectLanguage(`${t.title} ${t.channelTitle ?? ''}`).code === langCode);
}

export function sortTracks(tracks: Track[], key: 'title' | 'publishedAt' | 'viewCount' | 'duration' | 'artist', dir: 'asc' | 'desc' = 'desc'): Track[] {
  const out = [...tracks];
  out.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'title': cmp = a.title.localeCompare(b.title); break;
      case 'artist': cmp = a.artist.localeCompare(b.artist); break;
      case 'publishedAt': cmp = (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''); break;
      case 'duration': cmp = (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0); break;
      default: cmp = (a.viewCount ?? 0) - (b.viewCount ?? 0);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return out;
}
