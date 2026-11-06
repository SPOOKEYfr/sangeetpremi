/**
 * Discovery orchestrator (Phase C2): the full pipeline, reusing the SHARED
 * pure engine modules (shared/discovery/*) — no duplicated classification
 * logic. Providers are injected; tests use mocks.
 *
 * Pipeline: artist resolution -> metadata -> YouTube channel resolution ->
 * uploads-playlist enumeration -> controlled search fallback -> normalize ->
 * classify/role -> dedup -> filters -> stats -> result.
 * Partial provider failure (e.g. MusicBrainz down) degrades gracefully to the
 * remaining providers instead of failing the whole job.
 */
import { randomBytes } from 'node:crypto';
import { classifyVideo } from '../../shared/discovery/classify.js';
import { deduplicate } from '../../shared/discovery/dedup.js';
import { mergeSessions } from '../../shared/discovery/merge.js';
import { computeStats, relatedArtists } from '../../shared/discovery/stats.js';
import { detectLanguage } from '../../shared/language.js';
import { normalizeText as normText } from '../../shared/normalize.js';
import type { Artist, DiscoveryCategory, DiscoveryDepth, Track } from '../../shared/types.js';
import type { MetadataProvider, VideoProvider, VideoMeta } from './providers/types.js';

export type JobState = 'queued' | 'running' | 'completed' | 'failed';

export interface DiscoveryProgress {
  phase: string;
  message: string;
  done?: number;
  total?: number;
}

export interface DiscoveryResult {
  artists: Artist[];
  tracks: Track[];
  duplicates: Track[];
  stats: ReturnType<typeof computeStats>;
  related: ReturnType<typeof relatedArtists>;
  perArtistCounts: Record<string, number>;
  report: {
    candidatesFound: number;
    accepted: number;
    duplicatesRemoved: number;
    excluded: number;
    exclusionReasons: Record<string, number>;
    providersUsed: string[];
    notes: string[];
  };
}

export interface DiscoverParams {
  artists: string[];
  depth: DiscoveryDepth;
  categories: DiscoveryCategory[];
  filters?: { language?: string; yearFrom?: number; yearTo?: number };
}

const SEARCH_FALLBACK: Record<DiscoveryDepth, (a: string) => string[]> = {
  quick: (a) => [`${a} official video`, `${a} songs`],
  standard: (a) => [`${a} official video`, `${a} songs`, `${a} duet`, `${a} live`, `${a} acoustic`, `${a} remix`, `${a} movie songs`],
  deep: (a) => [`${a} official video`, `${a} songs`, `${a} all songs`, `${a} duet`, `${a} live`, `${a} acoustic`, `${a} unplugged`, `${a} remix`, `${a} cover`, `${a} movie songs`, `${a} film songs`, `${a} soundtrack`, `${a} collaboration`, `${a} feat`],
};
const MIN_RELEVANCE = 0.4;

export class DiscoveryOrchestrator {
  constructor(
    private video: VideoProvider,
    private metadata: MetadataProvider,
  ) {}

  async run(params: DiscoverParams, onProgress: (p: DiscoveryProgress) => void): Promise<DiscoveryResult> {
    const notes: string[] = [];
    const providersUsed = new Set<string>();
    const sessions: { artist: Artist; tracks: Track[]; report: DiscoveryResult['report'] }[] = [];

    for (const query of params.artists) {
      onProgress({ phase: 'resolve', message: `Resolving artist "${query}"…` });
      // 1. Artist resolution: MusicBrainz first (metadata), YouTube channel as fallback/confirmation.
      let artist: Artist | undefined;
      let mbOk = true;
      try {
        const candidates = await this.metadata.resolveArtist(query);
        providersUsed.add(this.metadata.name);
        const exact = candidates.find((c) => c.name.toLowerCase() === query.toLowerCase()) ?? candidates[0];
        if (exact) artist = { id: exact.id, name: exact.name, normalizedName: exact.name.toLowerCase(), description: exact.description, country: exact.country };
      } catch (e) {
        mbOk = false;
        notes.push(`Metadata provider unavailable (${(e as Error).message.split(':')[0]}); continuing with YouTube only.`);
      }
      let channelId: string | undefined;
      try {
        const channels = await this.video.resolveChannel(query, 5);
        providersUsed.add(this.video.name);
        const ch = channels[0];
        channelId = ch?.channelId;
        if (!artist) {
          artist = { id: ch?.channelId ?? query, name: ch?.title ?? query, normalizedName: (ch?.title ?? query).toLowerCase(), channelId: ch?.channelId, thumbnail: ch?.thumbnail, country: ch?.country, subscriberCount: ch?.subscriberCount };
        } else if (ch?.channelId) {
          artist.channelId = ch.channelId;
          artist.thumbnail = artist.thumbnail ?? ch.thumbnail;
        }
      } catch (e) {
        notes.push(`YouTube channel resolution failed (${(e as Error).message.split(':')[0]}); using search fallback only.`);
      }
      if (!artist) throw new Error(`No artist match found for "${query}".`);
      void mbOk;

      // 2-3. Catalogue: uploads enumeration first (cheap), then controlled search fallback.
      const candidates = new Map<string, VideoMeta>();
      if (channelId) {
        onProgress({ phase: 'discover', message: `Enumerating ${artist.name}'s channel uploads…` });
        try {
          const uploads = await this.video.channelUploads(channelId, params.depth === 'deep' ? 500 : 200);
          for (const v of uploads) candidates.set(v.videoId, v);
        } catch { notes.push('Uploads enumeration failed; relying on search fallback.'); }
      }
      const queries = SEARCH_FALLBACK[params.depth](artist.name);
      for (let i = 0; i < queries.length; i++) {
        onProgress({ phase: 'search', message: `Searching: ${queries[i]}`, done: i, total: queries.length });
        try {
          const { items } = await this.video.searchVideos(queries[i], 25);
          for (const v of items) if (!candidates.has(v.videoId)) candidates.set(v.videoId, v);
        } catch { /* one failed query must not kill the job */ }
      }

      // 4-6. Normalize + classify + role + dedup.
      onProgress({ phase: 'classify', message: `Classifying ${candidates.size} candidates…` });
      const tracks: Track[] = [];
      const exclusionReasons: Record<string, number> = {};
      let excluded = 0;
      for (const v of candidates.values()) {
        const cls = classifyVideo(
          { videoId: v.videoId, title: v.title, description: '', channelId: v.channelId ?? '', channelTitle: v.channelTitle ?? '', thumbnail: v.thumbnail, publishedAt: v.publishedAt, durationSeconds: v.durationSeconds, viewCount: v.viewCount },
          artist.name,
          channelId,
        );
        if (cls.score < MIN_RELEVANCE) {
          excluded++;
          exclusionReasons.lowRelevance = (exclusionReasons.lowRelevance ?? 0) + 1;
          continue;
        }
        tracks.push({
          id: v.videoId, videoId: v.videoId, title: v.title, normalizedTitle: normText(v.title), artist: artist.name,
          channelId: v.channelId, channelTitle: v.channelTitle, thumbnail: v.thumbnail, durationSeconds: v.durationSeconds,
          publishedAt: v.publishedAt, viewCount: v.viewCount, category: cls.category, role: cls.role, versionTags: cls.versionTags,
          language: detectLanguage(`${v.title} ${v.channelTitle ?? ''}`).code, dedupeKey: '', isDuplicate: false,
          source: 'youtube', discoveredAt: Date.now(),
        });
      }
      onProgress({ phase: 'dedupe', message: 'Removing duplicates…' });
      const dedup = deduplicate(tracks, 'balanced');

      sessions.push({
        artist,
        tracks: dedup.kept,
        report: {
          candidatesFound: candidates.size, accepted: dedup.kept.length, duplicatesRemoved: dedup.removedCount,
          excluded, exclusionReasons, providersUsed: [...providersUsed], notes,
        },
      });
    }

    // Multi-artist merge (attribution preserved).
    const merged = mergeSessions(sessions.map((s, i) => ({
      id: `s${i}`, artist: s.artist, status: 'completed' as const, depth: params.depth,
      categories: params.categories, tracks: s.tracks,
      report: { query: s.artist.name, candidatesFound: s.report.candidatesFound, accepted: s.report.accepted, duplicatesRemoved: s.report.duplicatesRemoved, excluded: s.report.excluded, exclusionReasons: s.report.exclusionReasons, startedAt: Date.now(), finishedAt: Date.now() },
      createdAt: Date.now(), updatedAt: Date.now(),
    })));

    // Filters (language/year) — preserved semantics from v0.2.
    let finalTracks = merged.tracks;
    if (params.filters?.language) finalTracks = finalTracks.filter((t) => t.language === params.filters!.language);
    if (params.filters?.yearFrom || params.filters?.yearTo) {
      finalTracks = finalTracks.filter((t) => {
        if (!t.publishedAt) return false;
        const y = Number(t.publishedAt.slice(0, 4));
        if (params.filters!.yearFrom !== undefined && y < params.filters!.yearFrom) return false;
        if (params.filters!.yearTo !== undefined && y > params.filters!.yearTo) return false;
        return true;
      });
    }

    onProgress({ phase: 'done', message: `Discovery complete — ${finalTracks.length} tracks.` });
    const pseudoSession = { tracks: finalTracks, artist: merged.artists[0] ?? { id: 'multi', name: params.artists.join(' + '), normalizedName: 'multi' } };
    return {
      artists: merged.artists,
      tracks: finalTracks,
      duplicates: merged.duplicates,
      stats: computeStats(pseudoSession as never),
      related: relatedArtists(pseudoSession as never),
      perArtistCounts: merged.perArtistCounts,
      report: {
        candidatesFound: sessions.reduce((s, x) => s + x.report.candidatesFound, 0),
        accepted: finalTracks.length,
        duplicatesRemoved: merged.duplicates.length,
        excluded: sessions.reduce((s, x) => s + x.report.excluded, 0),
        exclusionReasons: sessions.reduce((acc, x) => { for (const [k, v] of Object.entries(x.report.exclusionReasons)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {} as Record<string, number>),
        providersUsed: [...providersUsed],
        notes,
      },
    };
  }
}

export function newJobId(): string {
  return randomBytes(12).toString('hex'); // 24 hex chars — not predictable
}
