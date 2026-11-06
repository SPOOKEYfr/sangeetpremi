/**
 * Catalogue statistics + explainable related-artist suggestions.
 * Every number is derived from actual discovered tracks; the UI labels
 * what is verified (counts from the API-backed session) vs estimated
 * (e.g. language guesses). Pure functions — unit tested.
 */
import type { DiscoverySession, Track } from '../types.js';
import { collectLanguages } from '../language.js';

export interface CatalogueStats {
  totalTracks: number;
  categoryCounts: Record<string, number>;
  yearRange: { min?: number; max?: number; verified: true };
  languages: { code: string; label: string; confidence: string }[];
  collaborations: { channelTitle: string; count: number }[];
}

export function computeStats(session: DiscoverySession | Track[]): CatalogueStats {
  const tracks = Array.isArray(session) ? session : session.tracks;
  const categoryCounts: Record<string, number> = {};
  let min: number | undefined;
  let max: number | undefined;
  for (const t of tracks) {
    categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1;
    if (t.publishedAt) {
      const y = Number(t.publishedAt.slice(0, 4));
      if (!Number.isNaN(y)) {
        min = min === undefined ? y : Math.min(min, y);
        max = max === undefined ? y : Math.max(max, y);
      }
    }
  }
  const collabCounts = new Map<string, number>();
  for (const t of tracks) {
    if ((t.role === 'featured' || t.role === 'other' || t.category === 'collaboration') && t.channelTitle) {
      collabCounts.set(t.channelTitle, (collabCounts.get(t.channelTitle) ?? 0) + 1);
    }
  }
  return {
    totalTracks: tracks.length,
    categoryCounts,
    yearRange: { min, max, verified: true },
    languages: collectLanguages(tracks.map((t) => t.title)).map((l) => ({ code: l.code, label: l.label, confidence: l.confidence })),
    collaborations: [...collabCounts.entries()]
      .map(([channelTitle, count]) => ({ channelTitle, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

export interface RelatedArtist {
  name: string;
  channelTitle: string;
  reason: string; // human-readable, explainable
  sharedTracks: number;
}

/**
 * Suggest related artists from channels that actually appear in the
 * discovered collaborations/features of this artist — never random.
 */
export function relatedArtists(session: DiscoverySession, limit = 6): RelatedArtist[] {
  const self = new Set([session.artist.channelId, session.artist.name.toLowerCase()]);
  const counts = new Map<string, { channelTitle: string; shared: number }>();
  for (const t of session.tracks) {
    if (t.category !== 'collaboration' && t.category !== 'featured' && t.category !== 'duet') continue;
    const key = (t.channelId ?? t.channelTitle ?? '').toLowerCase();
    if (!key || self.has(key)) continue;
    const cur = counts.get(key);
    if (cur) cur.shared++;
    else counts.set(key, { channelTitle: t.channelTitle ?? t.channelId ?? 'Unknown', shared: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map((c) => ({
      name: c.channelTitle,
      channelTitle: c.channelTitle,
      sharedTracks: c.shared,
      reason: `Appears on ${c.shared} discovered collaboration/duet/featured track${c.shared > 1 ? 's' : ''}`,
    }));
}
