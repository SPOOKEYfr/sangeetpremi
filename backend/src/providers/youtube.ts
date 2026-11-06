/**
 * YouTube Data API v3 provider (server-side key via SecretProvider).
 *
 * Implements only the read operations discovery needs:
 *   channels.list      — channel identification + uploads-playlist id (1 general unit/call)
 *   playlistItems.list — uploads enumeration, paginated (1 general unit/page)
 *   search.list        — controlled fallback (1 call from the search bucket/page)
 *   videos.list        — metadata by ids, batched ≤50 (1 general unit/call)
 *
 * The API key never appears in errors/logs (redacted); it is only sent to
 * googleapis.com. Quota is reserved BEFORE each external call and released
 * if the call fails/was not sent. QuotaExceeded surfaces as a structured error.
 */
import type { ChannelMeta, VideoMeta, VideoProvider } from './types.js';
import type { SecretProvider } from '../secrets.js';
import type { QuotaAccountant } from '../quota.js';
import { QuotaExhausted } from '../quota.js';
import { ProviderHttpError, redactSecrets, requestJson, type Transport, defaultTransport } from '../http/transport.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export class YouTubeProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 502,
  ) {
    super(message);
    this.name = 'YouTubeProviderError';
  }
}

export interface YouTubeProviderOptions {
  secrets: SecretProvider;
  quota: QuotaAccountant;
  transport?: Transport;
  fetchVideoDetailsOnSearch?: boolean; // default true: search returns ids only; we enrich via videos.list
}

export class YouTubeVideoProvider implements VideoProvider {
  readonly name = 'youtube';
  private transport: Transport;
  private apiKey?: string;

  constructor(private opts: YouTubeProviderOptions) {
    this.transport = opts.transport ?? defaultTransport;
    this.apiKey = opts.secrets.has('YOUTUBE_API_KEY') ? opts.secrets.get('YOUTUBE_API_KEY') : undefined; // undefined in dev/test — never logged
  }

  private get key(): string {
    if (!this.apiKey) {
      throw new YouTubeProviderError('YouTube provider is not configured (no server-side API key). Discovery via YouTube is unavailable.', 'PROVIDER_NOT_CONFIGURED', 503);
    }
    return this.apiKey;
  }

  /** GET with quota reserve + release-on-failure (reconcile) + structured, redacted errors. */
  private async apiCharged<T>(method: 'search.list' | 'videos.list' | 'channels.list' | 'playlistItems.list', params: Record<string, string>): Promise<T> {
    const reservation = this.opts.quota.reserve(method);
    try {
      return await this.raw<T>(method, params);
    } catch (e) {
      this.opts.quota.release(reservation); // failed / not sent -> reconcile
      throw e;
    }
  }

  private async raw<T>(method: string, params: Record<string, string>): Promise<T> {
    const endpoint = method.replace('.list', '');
    const url = new URL(`${API_BASE}/${endpoint}`);
    url.searchParams.set('key', this.key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      return (await requestJson(this.transport, 'youtube', url.toString(), { timeoutMs: 10_000, maxRetries: 2, secrets: [this.key] })) as T;
    } catch (e) {
      if (e instanceof ProviderHttpError) {
        if (e.status === 403 && e.reason === 'quotaExceeded') throw new QuotaExhausted('general', 10_000);
        throw new YouTubeProviderError(redactSecrets(e.message, [this.key]), e.reason ?? 'upstreamError', e.status === 400 ? 400 : 502);
      }
      throw new YouTubeProviderError(`YouTube transport failure: ${redactSecrets((e as Error).message, [this.key])}`, 'upstreamUnavailable', 503);
    }
  }

  /** channels.list — identify channels by query; includes uploads playlist id. */
  async resolveChannel(query: string, maxResults = 10): Promise<ChannelMeta[]> {
    const q = query.trim().slice(0, 100);
    if (!q) return [];
    // Two-step: search type=channel to get channel ids (search bucket), then channels.list (general).
    const search = await this.apiCharged<{ items?: { id?: { channelId?: string } }[] }>('search.list', {
      part: 'snippet', type: 'channel', q, maxResults: String(Math.min(maxResults, 25)),
    });
    const ids = [...new Set((search.items ?? []).map((i) => i.id?.channelId).filter((x): x is string => !!x))];
    if (!ids.length) return [];
    const ch = await this.apiCharged<{ items?: Record<string, unknown>[] }>('channels.list', {
      part: 'snippet,contentDetails,statistics', id: ids.join(','),
    });
    const now = Date.now();
    return (ch.items ?? []).map((it) => normalizeChannel(it, now)).filter((c): c is ChannelMeta => !!c);
  }

  /** search.list paginated — controlled fallback discovery. Each page = 1 search-bucket call. */
  async searchVideos(query: string, maxResults = 25, pageToken?: string): Promise<{ items: VideoMeta[]; nextPageToken?: string }> {
    const q = query.trim().slice(0, 200);
    if (!q) return { items: [] };
    const body = await this.apiCharged<{
      items?: { id?: { videoId?: string }; snippet?: Record<string, unknown> }[];
      nextPageToken?: string;
    }>('search.list', {
      part: 'snippet',
      type: 'video',
      q,
      maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
      ...(pageToken ? { pageToken } : {}),
    });
    const ids = (body.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x && VIDEO_ID_RE.test(x));
    const uniqueIds = [...new Set(ids)];
    let details: VideoMeta[] = [];
    if (uniqueIds.length) {
      details = await this.videoDetails(uniqueIds); // 1 general unit, batched
    }
    const byId = new Map(details.map((d) => [d.videoId, d]));
    // Keep search-snippet info for ids without details; normalize everything.
    const items = uniqueIds.map((id) => byId.get(id) ?? normalizeSearchSnippet(body.items?.find((i) => i.id?.videoId === id)?.snippet as Record<string, unknown> | undefined, id));
    return { items, nextPageToken: typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined };
  }

  /** playlistItems.list paginated — uploads enumeration (1 general unit/page). Not a complete catalogue. */
  async channelUploads(channelId: string, maxItems = 200): Promise<VideoMeta[]> {
    if (!channelId) return [];
    const channels = await this.apiCharged<{ items?: Record<string, unknown>[] }>('channels.list', {
      part: 'contentDetails', id: channelId,
    });
    const uploadsId = extractUploadsPlaylist(channels.items?.[0]);
    if (!uploadsId) return []; // no uploads playlist — caller falls back to search
    const out: VideoMeta[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    const maxPages = Math.ceil(Math.min(maxItems, 2000) / 50); // pagination safeguard
    for (let page = 0; page < maxPages; page++) {
      const body = await this.apiCharged<{
        items?: { snippet?: { resourceId?: { videoId?: string } } }[];
        nextPageToken?: string;
      }>('playlistItems.list', {
        part: 'snippet', playlistId: uploadsId, maxResults: '50', ...(pageToken ? { pageToken } : {}),
      });
      for (const it of body.items ?? []) {
        const vid = it.snippet?.resourceId?.videoId;
        if (vid && VIDEO_ID_RE.test(vid) && !seen.has(vid)) {
          seen.add(vid);
          out.push(normalizeSearchSnippet(it.snippet, vid));
        }
      }
      pageToken = body.nextPageToken;
      if (!pageToken || out.length >= maxItems) break;
    }
    // Enrich with statistics/duration via videos.list in batches of 50 (1 unit
    // per batch). Overlay details onto snippet items; keep the snippet item
    // when no detail record comes back (never drop discovered ids).
    const detailsById = new Map<string, VideoMeta>();
    for (let i = 0; i < out.length; i += 50) {
      for (const d of await this.videoDetails(out.slice(i, i + 50).map((v) => v.videoId))) {
        detailsById.set(d.videoId, d);
      }
    }
    return out.map((v) => detailsById.get(v.videoId) ?? v);
  }

  /** videos.list — metadata for up to 50 ids per call (1 general unit/call). */
  async videoDetails(videoIds: string[]): Promise<VideoMeta[]> {
    const valid = [...new Set(videoIds.filter((v) => VIDEO_ID_RE.test(v)))].slice(0, 50);
    if (!valid.length) return [];
    const body = await this.apiCharged<{ items?: Record<string, unknown>[] }>('videos.list', {
      part: 'snippet,contentDetails,statistics', id: valid.join(','),
    });
    const now = Date.now();
    return (body.items ?? []).map((it) => normalizeVideo(it, now)).filter((v): v is VideoMeta => !!v);
  }
}

// ---------- normalization (defensive: never trust API shape) ----------

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : typeof v === 'number' ? v : undefined;
}
function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

function normalizeChannel(it: Record<string, unknown>, now: number): ChannelMeta | null {
  const id = str(it.id);
  const snippet = (it.snippet ?? {}) as Record<string, unknown>;
  const contentDetails = (it.contentDetails ?? {}) as Record<string, unknown>;
  const related = (contentDetails.relatedPlaylists ?? {}) as Record<string, unknown>;
  const stats = (it.statistics ?? {}) as Record<string, unknown>;
  const thumbs = (snippet.thumbnails ?? {}) as Record<string, { url?: string }>;
  if (!id) return null;
  return {
    channelId: id,
    title: str(snippet.title) ?? '',
    description: str(snippet.description),
    country: str(snippet.country),
    uploadsPlaylistId: str(related.uploads),
    subscriberCount: num(stats.subscriberCount),
    thumbnail: thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url,
    source: 'youtube',
    fetchedAt: now,
    expiresAt: now + 24 * 3600 * 1000, // 24h cache policy for channel metadata
  };
}

function extractUploadsPlaylist(it: Record<string, unknown> | undefined): string | undefined {
  const cd = (it?.contentDetails ?? {}) as Record<string, unknown>;
  const related = (cd.relatedPlaylists ?? {}) as Record<string, unknown>;
  return str(related.uploads);
}

function normalizeSearchSnippet(snippet: Record<string, unknown> | undefined, videoId: string): VideoMeta {
  const s = snippet ?? {};
  const thumbs = (s.thumbnails ?? {}) as Record<string, { url?: string }>;
  return {
    videoId,
    title: str(s.title) ?? '',
    channelId: str(s.channelId),
    channelTitle: str(s.channelTitle),
    publishedAt: str(s.publishedAt),
    thumbnail: thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url,
    source: 'youtube',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + 24 * 3600 * 1000,
  };
}

function normalizeVideo(it: Record<string, unknown>, now: number): VideoMeta | null {
  const id = str(it.id);
  if (!id || !VIDEO_ID_RE.test(id)) return null;
  const snippet = (it.snippet ?? {}) as Record<string, unknown>;
  const cd = (it.contentDetails ?? {}) as Record<string, unknown>;
  const stats = (it.statistics ?? {}) as Record<string, unknown>;
  const thumbs = (snippet.thumbnails ?? {}) as Record<string, { url?: string }>;
  return {
    videoId: id,
    title: str(snippet.title) ?? '',
    channelId: str(snippet.channelId),
    channelTitle: str(snippet.channelTitle),
    publishedAt: str(snippet.publishedAt),
    durationSeconds: parseIsoDuration(str(cd.duration)),
    viewCount: num(stats.viewCount),
    thumbnail: thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url,
    source: 'youtube',
    fetchedAt: now,
    expiresAt: now + 24 * 3600 * 1000,
  };
}
