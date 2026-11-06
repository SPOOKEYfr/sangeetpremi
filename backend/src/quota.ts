/**
 * Method-specific YouTube Data API quota accounting.
 *
 * As of the June 2026 quota model, each project gets per day:
 *   - 100 search.list calls (1 unit each, from the search bucket)
 *   - 100 videos.insert calls (video-upload bucket)
 *   - 10,000 units shared by ALL other methods
 * List/read methods cost 1 unit per call (batched up to 50 ids); common write
 * methods (playlists.insert, playlistItems.insert, videos.update, ...) cost
 * 50 units. Pagination multiplies cost: every extra page is another call.
 * Quotas reset at midnight Pacific Time. (Source: Google quota documentation,
 * verified Nov 2026.)
 */
export type QuotaBucket = 'search' | 'uploads' | 'general';

export const QUOTA_COSTS: Record<string, { units: number; bucket: QuotaBucket }> = {
  'search.list': { units: 1, bucket: 'search' }, // 100 calls/day bucket; 1 unit counted against search bucket
  'videos.list': { units: 1, bucket: 'general' },
  'channels.list': { units: 1, bucket: 'general' },
  'playlists.list': { units: 1, bucket: 'general' },
  'playlistItems.list': { units: 1, bucket: 'general' },
  'activities.list': { units: 1, bucket: 'general' },
  'playlists.insert': { units: 50, bucket: 'general' },
  'playlistItems.insert': { units: 50, bucket: 'general' },
  'videos.update': { units: 50, bucket: 'general' },
  'videos.insert': { units: 1, bucket: 'uploads' }, // 100 calls/day bucket
  'captions.insert': { units: 400, bucket: 'general' },
};

export const DEFAULT_LIMITS = { search: 100, uploads: 100, general: 10_000 };

export function costOf(method: string, pages = 1): { units: number; bucket: QuotaBucket } {
  const c = QUOTA_COSTS[method];
  if (!c) return { units: 1, bucket: 'general' }; // unknown methods conservatively count 1 general unit
  return { units: c.units * Math.max(1, pages), bucket: c.bucket };
}

export interface QuotaUsage {
  date: string; // YYYY-MM-DD in America/Los_Angeles (quota reset timezone)
  search: number;
  uploads: number;
  general: number;
}

export interface QuotaReservation {
  method: string;
  bucket: QuotaBucket;
  units: number;
}

export interface QuotaAccountant {
  usage(date?: string): QuotaUsage;
  /** Record a call. Throws QuotaExhausted when the relevant bucket would exceed its limit. */
  record(method: string, pages?: number): QuotaUsage;
  /**
   * Atomically reserve quota BEFORE an external request. In the supported
   * single-instance design this synchronous reservation prevents concurrent
   * requests from overspending the same in-memory bucket. Throws QuotaExhausted.
   */
  reserve(method: string, pages?: number): QuotaReservation;
  /** Release a reservation when the request failed or was never sent (reconcile). */
  release(res: QuotaReservation): void;
  remaining(): { search: number; uploads: number; general: number };
}

export class QuotaExhausted extends Error {
  constructor(public bucket: QuotaBucket, public limit: number) {
    super(`YouTube API ${bucket} quota exhausted for today (limit ${limit}).`);
    this.name = 'QuotaExhausted';
  }
}

/** In-memory accountant for a single day; persistent accounting is a Phase D concern. */
export class InMemoryQuotaAccountant implements QuotaAccountant {
  private current: QuotaUsage;
  private limits: typeof DEFAULT_LIMITS;

  constructor(limits: typeof DEFAULT_LIMITS = DEFAULT_LIMITS, date?: string) {
    this.limits = limits;
    this.current = { date: date ?? todayPT(), search: 0, uploads: 0, general: 0 };
  }

  usage(date?: string): QuotaUsage {
    const today = date ?? todayPT();
    if (today !== this.current.date) {
      this.current = { date: today, search: 0, uploads: 0, general: 0 };
    }
    return { ...this.current };
  }

  record(method: string, pages = 1): QuotaUsage {
    return this.reserve(method, pages) && this.usage();
  }

  reserve(method: string, pages = 1): QuotaReservation {
    const { units, bucket } = costOf(method, pages);
    const u = this.usage();
    const next = { ...u, [bucket]: u[bucket] + units };
    if (next[bucket] > this.limits[bucket]) throw new QuotaExhausted(bucket, this.limits[bucket]);
    this.current = next; // synchronous => atomic within the single-instance design
    return { method, bucket, units };
  }

  release(res: QuotaReservation): void {
    const u = this.usage();
    this.current = { ...u, [res.bucket]: Math.max(0, u[res.bucket] - res.units) };
  }

  remaining(): { search: number; uploads: number; general: number } {
    const u = this.usage();
    return {
      search: Math.max(0, this.limits.search - u.search),
      uploads: Math.max(0, this.limits.uploads - u.uploads),
      general: Math.max(0, this.limits.general - u.general),
    };
  }
}

/** Quota resets at midnight Pacific Time. */
export function todayPT(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
