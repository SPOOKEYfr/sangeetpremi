/**
 * YouTube Data API v3 client.
 *
 * - Uses only the official API; no scraping, no quota bypass.
 * - Tracks quota usage locally (10,000 units/day default) and refuses to
 *   fire requests once the configured budget is exhausted.
 * - Serializes requests through a simple rate limiter to stay well under
 *   per-second limits and to keep the UI responsive.
 * - Never logs or stores the API key; it is only sent to googleapis.com.
 */
import { parseDuration } from '../../utils/normalize';
import { isValidVideoId } from '../../utils/sanitize';
import type { QuotaUsage } from '../../types';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const QUOTA_KEY = 'sangeetpremi.quota';
const DEFAULT_DAILY_LIMIT = 10000;

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  description: string;
  thumbnail?: string;
  subscriberCount?: number;
  country?: string;
}

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message);
    this.name = 'YouTubeApiError';
  }
}

export class QuotaExceededError extends YouTubeApiError {
  constructor(used: number, limit: number) {
    super(`YouTube API daily quota exhausted (${used}/${limit} units used). Try again tomorrow or raise the limit in Settings.`, 429, 'quotaExceeded');
    this.name = 'QuotaExceededError';
  }
}

interface RawSnippet {
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } };
}

export class YouTubeClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  private minIntervalMs: number;

  constructor(
    private apiKey: string,
    private dailyLimit = DEFAULT_DAILY_LIMIT,
    minIntervalMs = 120,
  ) {
    this.minIntervalMs = minIntervalMs;
  }

  hasKey(): boolean {
    return !!this.apiKey;
  }

  /** Serialize + rate-limit every request. */
  private async enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.lastRequestAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return work();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getQuota(): Promise<QuotaUsage> {
    const today = new Date().toISOString().slice(0, 10);
    let usage: QuotaUsage | undefined;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(QUOTA_KEY);
      usage = res[QUOTA_KEY];
    }
    if (!usage || usage.date !== today) return { date: today, used: 0, limit: this.dailyLimit };
    return usage;
  }

  private async addQuota(units: number): Promise<QuotaUsage> {
    const usage = await this.getQuota();
    const next = { ...usage, used: usage.used + units };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [QUOTA_KEY]: next });
    }
    return next;
  }

  private async assertQuota(cost: number): Promise<void> {
    const usage = await this.getQuota();
    if (usage.used + cost > usage.limit) throw new QuotaExceededError(usage.used, usage.limit);
  }

  private async request<T>(path: string, params: Record<string, string>, cost: number): Promise<T> {
    if (!this.apiKey) throw new YouTubeApiError('YouTube API key is not configured. Open Settings and add your key (see docs/SETUP_YOUTUBE_API.md).', 401, 'keyMissing');
    await this.assertQuota(cost);
    return this.enqueue(async () => {
      const url = new URL(`${API_BASE}/${path}`);
      url.searchParams.set('key', this.apiKey);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      let res: Response;
      try {
        res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      } catch (e) {
        await this.addQuota(0);
        throw new YouTubeApiError(`Network error while contacting YouTube API: ${(e as Error).message}`, 0, 'network');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (body as { error?: { message?: string; errors?: { reason?: string }[] } }).error;
        const reason = err?.errors?.[0]?.reason;
        throw new YouTubeApiError(err?.message ?? `YouTube API request failed (HTTP ${res.status})`, res.status, reason);
      }
      await this.addQuota(cost);
      return body as T;
    });
  }

  /** Search videos. cost: 100 units. */
  async searchVideos(query: string, maxResults = 25, pageToken?: string): Promise<{ items: YouTubeVideo[]; nextPageToken?: string }> {
    const body = await this.request<{
      items?: { id?: { videoId?: string }; snippet?: RawSnippet }[]; nextPageToken?: string }>(
      'search',
      {
        part: 'snippet',
        type: 'video',
        maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
        q: query,
        ...(pageToken ? { pageToken } : {}),
        relevanceLanguage: 'en',
        safeSearch: 'none',
      },
      100,
    );
    const items: YouTubeVideo[] = [];
    const ids: string[] = [];
    for (const it of body.items ?? []) {
      const id = it.id?.videoId;
      if (id && isValidVideoId(id)) {
        ids.push(id);
        items.push({
          videoId: id,
          title: it.snippet?.title ?? '',
          description: it.snippet?.description ?? '',
          channelId: it.snippet?.channelId ?? '',
          channelTitle: it.snippet?.channelTitle ?? '',
          thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? '',
          publishedAt: it.snippet?.publishedAt ?? '',
          durationSeconds: 0,
          viewCount: 0,
        });
      }
    }
    // Enrich with contentDetails/statistics (1 unit per 50 ids).
    if (ids.length) {
      const details = await this.getVideoDetails(ids);
      const map = new Map(details.map((d) => [d.videoId, d]));
      for (const item of items) {
        const d = map.get(item.videoId);
        if (d) {
          item.durationSeconds = d.durationSeconds;
          item.viewCount = d.viewCount;
        }
      }
    }
    return { items, nextPageToken: body.nextPageToken };
  }

  /** Video details. cost: 1 unit per 50 ids. */
  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideo[]> {
    const valid = videoIds.filter(isValidVideoId).slice(0, 50);
    if (!valid.length) return [];
    const body = await this.request<{
      items?: { id?: string; snippet?: RawSnippet; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }[];
    }>('videos', { part: 'snippet,contentDetails,statistics', id: valid.join(',') }, 1);
    return (body.items ?? []).map((it) => ({
      videoId: it.id ?? '',
      title: it.snippet?.title ?? '',
      description: it.snippet?.description ?? '',
      channelId: it.snippet?.channelId ?? '',
      channelTitle: it.snippet?.channelTitle ?? '',
      thumbnail: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.medium?.url ?? '',
      publishedAt: it.snippet?.publishedAt ?? '',
      durationSeconds: parseDuration(it.contentDetails?.duration ?? ''),
      viewCount: Number(it.statistics?.viewCount ?? 0),
    }));
  }

  /** Channel info. cost: 1 unit per 50 ids. */
  async getChannels(channelIds: string[]): Promise<YouTubeChannel[]> {
    const valid = channelIds.filter(Boolean).slice(0, 50);
    if (!valid.length) return [];
    const body = await this.request<{
      items?: { id?: string; snippet?: RawSnippet & { country?: string; thumbnails?: { default?: { url?: string }; high?: { url?: string } } }; statistics?: { subscriberCount?: string } }[];
    }>('channels', { part: 'snippet,statistics', id: valid.join(',') }, 1);
    return (body.items ?? []).map((it) => ({
      channelId: it.id ?? '',
      title: it.snippet?.title ?? '',
      description: it.snippet?.description ?? '',
      thumbnail: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.default?.url,
      subscriberCount: it.statistics?.subscriberCount ? Number(it.statistics.subscriberCount) : undefined,
      country: it.snippet?.country,
    }));
  }

  /** Create a playlist (OAuth access token required). cost: 50 units. */
  async createPlaylist(accessToken: string, name: string, description: string, privacy: 'public' | 'unlisted' | 'private' = 'private'): Promise<string> {
    await this.assertQuota(50);
    return this.enqueue(async () => {
      const res = await fetch(`${API_BASE}/playlists?part=snippet,status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippet: { title: name.slice(0, 150), description: description.slice(0, 5000) }, status: { privacyStatus: privacy } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new YouTubeApiError(body?.error?.message ?? `Failed to create playlist (HTTP ${res.status})`, res.status, body?.error?.errors?.[0]?.reason);
      }
      await this.addQuota(50);
      return body.id as string;
    });
  }

  /** Add videos to a playlist (OAuth access token required). cost: 50 units each. */
  async addVideosToPlaylist(accessToken: string, playlistId: string, videoIds: string[]): Promise<void> {
    for (const videoId of videoIds.slice(0, 50)) {
      if (!isValidVideoId(videoId)) continue;
      await this.assertQuota(50);
      await this.enqueue(async () => {
        const res = await fetch(`${API_BASE}/playlistItems?part=snippet`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new YouTubeApiError(body?.error?.message ?? `Failed to add video ${videoId} (HTTP ${res.status})`, res.status, body?.error?.errors?.[0]?.reason);
        }
        await this.addQuota(50);
      });
    }
  }
}
