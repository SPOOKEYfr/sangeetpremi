/**
 * The discovery engine: given an artist query it
 *   1. resolves candidate artist identities (disambiguation),
 *   2. runs a set of search queries across YouTube (depth-aware),
 *   3. scores + classifies every candidate video,
 *   4. filters weak/irrelevant results,
 *   5. deduplicates,
 *   6. emits progress events and a DiscoveryReport.
 *
 * All network access goes through YouTubeClient (quota-aware). The engine
 * is async and never blocks the UI thread.
 */
import type { Artist, DiscoveryCategory, DiscoveryDepth, DiscoveryReport, DiscoverySession, Track } from '../../types';
import { normalizeArtistName, normalizeText } from '../../utils/normalize';
import { randomId, slugify } from '../../utils/id';
import { isValidVideoId, watchUrl } from '../../utils/sanitize';
import { classifyVideo } from './classify';
import { deduplicate, type DedupMode } from './dedup';
import type { YouTubeClient, YouTubeVideo } from '../youtube/api';

export interface ProgressEvent {
  phase: 'resolve' | 'search' | 'fetch' | 'classify' | 'dedupe' | 'done';
  message: string;
  done?: number;
  total?: number;
}

export type ProgressCallback = (e: ProgressEvent) => void;

export interface DiscoveryOptions {
  depth: DiscoveryDepth;
  categories: DiscoveryCategory[];
  dedup: DedupMode;
  maxPerQuery: number;
  signal?: AbortSignal;
}

const QUERIES: Record<DiscoveryDepth, (artist: string) => string[]> = {
  quick: (a) => [`${a} official songs`, `${a} hits`],
  standard: (a) => [
    `${a} official video`,
    `${a} official audio`,
    `${a} songs`,
    `${a} new songs`,
    `${a} all songs`,
    `${a} duet`,
    `${a} live`,
    `${a} acoustic`,
    `${a} remix`,
    `${a} movie songs`,
  ],
  deep: (a) => [
    `${a} official video`,
    `${a} official audio`,
    `${a} songs`,
    `${a} all songs`,
    `${a} new songs`,
    `${a} latest songs`,
    `${a} duet`,
    `${a} duets`,
    `${a} live`,
    `${a} live performance`,
    `${a} acoustic`,
    `${a} unplugged`,
    `${a} remix`,
    `${a} cover`,
    `${a} movie songs`,
    `${a} film songs`,
    `${a} soundtrack`,
    `${a} collaboration`,
    `${a} featuring ${a}`,
    `${a} feat`,
    `${a} single`,
    `${a} album songs`,
  ],
};

const MIN_RELEVANCE = 0.4;

export class DiscoveryEngine {
  constructor(private client: YouTubeClient) {}

  /** Step 1 — resolve the query to candidate artist identities. */
  async resolveArtists(query: string, onProgress?: ProgressCallback): Promise<Artist[]> {
    onProgress?.({ phase: 'resolve', message: `Finding artists matching “${query}”…` });
    const q = query.trim();
    if (!q) return [];
    const { items } = await this.client.searchVideos(`${q} official channel artist`, 10);
    const channelIds = [...new Set(items.map((v) => v.channelId).filter(Boolean))].slice(0, 10);
    const channels = await this.client.getChannels(channelIds);
    const wanted = normalizeArtistName(q);
    const artists: Artist[] = channels
      .map((c) => ({
        id: c.channelId || slugify(c.title),
        name: c.title,
        normalizedName: normalizeArtistName(c.title),
        channelId: c.channelId,
        thumbnail: c.thumbnail,
        description: c.description?.slice(0, 300),
        country: c.country,
        subscriberCount: c.subscriberCount,
      }))
      .filter((a) => a.normalizedName.includes(wanted) || wanted.includes(a.normalizedName) || normalizeText(a.name) === normalizeText(q));
    // If nothing matches strictly, still return best-effort matches sorted by subscribers.
    const fallback = artists.length
      ? artists
      : channels
          .map((c) => ({
            id: c.channelId || slugify(c.title),
            name: c.title,
            normalizedName: normalizeArtistName(c.title),
            channelId: c.channelId,
            thumbnail: c.thumbnail,
            description: c.description?.slice(0, 300),
            country: c.country,
            subscriberCount: c.subscriberCount,
          }))
          .sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0))
          .slice(0, 5);
    onProgress?.({ phase: 'resolve', message: `Found ${fallback.length} possible artist match(es).` });
    return fallback;
  }

  /** Steps 2–5 — discover tracks for a chosen artist. */
  async discover(artist: Artist, opts: DiscoveryOptions, onProgress?: ProgressCallback): Promise<{ session: DiscoverySession; tracks: Track[] }> {
    const startedAt = Date.now();
    const report: DiscoveryReport = {
      query: artist.name,
      artistId: artist.id,
      candidatesFound: 0,
      accepted: 0,
      duplicatesRemoved: 0,
      excluded: 0,
      exclusionReasons: {},
      startedAt,
      finishedAt: 0,
    };
    const queries = QUERIES[opts.depth](artist.name);
    const seen = new Set<string>();
    const candidates: YouTubeVideo[] = [];

    for (let i = 0; i < queries.length; i++) {
      if (opts.signal?.aborted) break;
      const q = queries[i];
      onProgress?.({ phase: 'search', message: `Searching: ${q}`, done: i, total: queries.length });
      let pageToken: string | undefined;
      const pages = opts.depth === 'quick' ? 1 : opts.depth === 'standard' ? 1 : 2;
      for (let p = 0; p < pages; p++) {
        if (opts.signal?.aborted) break;
        const { items, nextPageToken } = await this.client.searchVideos(q, opts.maxPerQuery, pageToken);
        for (const v of items) {
          if (!seen.has(v.videoId)) {
            seen.add(v.videoId);
            candidates.push(v);
          }
        }
        pageToken = nextPageToken;
        if (!pageToken) break;
      }
    }
    report.candidatesFound = candidates.length;
    onProgress?.({ phase: 'classify', message: `Classifying ${candidates.length} candidate videos…` });

    const tracks: Track[] = [];
    for (const v of candidates) {
      if (!isValidVideoId(v.videoId)) {
        report.excluded++;
        report.exclusionReasons.invalidId = (report.exclusionReasons.invalidId ?? 0) + 1;
        continue;
      }
      const cls = classifyVideo(v, artist.name, artist.channelId);
      if (cls.score < MIN_RELEVANCE) {
        report.excluded++;
        report.exclusionReasons.lowRelevance = (report.exclusionReasons.lowRelevance ?? 0) + 1;
        continue;
      }
      tracks.push({
        id: v.videoId,
        videoId: v.videoId,
        title: v.title,
        normalizedTitle: normalizeText(v.title),
        artist: artist.name,
        channelId: v.channelId,
        channelTitle: v.channelTitle,
        thumbnail: v.thumbnail,
        durationSeconds: v.durationSeconds,
        publishedAt: v.publishedAt,
        viewCount: v.viewCount,
        category: cls.category,
        role: cls.role,
        versionTags: cls.versionTags,
        dedupeKey: '',
        isDuplicate: false,
        source: 'youtube',
        discoveredAt: Date.now(),
      });
    }

    onProgress?.({ phase: 'dedupe', message: 'Removing duplicates…' });
    const dedup = deduplicate(tracks, opts.dedup);
    report.duplicatesRemoved = dedup.removedCount;
    report.accepted = dedup.kept.length;

    // Apply category filter (kept for the session; user can broaden later).
    const allowed = new Set(opts.categories);
    const filtered = dedup.kept.filter((t) => allowed.has(t.category) || allowed.size === 0);
    report.excluded += dedup.kept.length - filtered.length;
    if (dedup.kept.length !== filtered.length) {
      report.exclusionReasons.categoryFiltered = dedup.kept.length - filtered.length;
    }

    report.finishedAt = Date.now();
    const session: DiscoverySession = {
      id: randomId('session'),
      artist,
      status: opts.signal?.aborted ? 'cancelled' : 'completed',
      depth: opts.depth,
      categories: opts.categories,
      tracks: filtered,
      report,
      createdAt: startedAt,
      updatedAt: Date.now(),
    };
    onProgress?.({ phase: 'done', message: `Discovery complete — ${filtered.length} tracks kept.`, done: 1, total: 1 });
    return { session, tracks: [...filtered, ...dedup.duplicates] };
  }

  /** Validate a user-supplied YouTube URL for the "add missing track" feature. */
  async validateVideoUrl(url: string): Promise<YouTubeVideo | null> {
    const { videoIdFromUrl } = await import('../../utils/sanitize');
    const id = videoIdFromUrl(url);
    if (!id) return null;
    const [video] = await this.client.getVideoDetails([id]);
    return video ?? null;
  }
}

export { watchUrl };
