/**
 * Bounded sliding-window rate limiting with an injectable clock.
 *
 * Hardening (Phase B.1):
 * - State is bounded: maxKeys with oldest-key eviction, so random client ids
 *   cannot grow the Map forever.
 * - The injected clock is actually used (testable time).
 * - Two independent limiters: per anonymous client id and per (trusted) IP.
 *   A UUID is an identifier, NOT authentication — rotating UUIDs does not
 *   bypass the IP limit, and IP limits are the server-side backstop.
 */
import { err } from '../http/responses.js';

export interface RateLimiter {
  check(key: string, now?: number): boolean;
  reset(): void;
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
    private maxKeys = 100_000,
    private now: () => number = Date.now,
  ) {}

  check(key: string, now?: number): boolean {
    const t = now ?? this.now();
    const windowStart = t - this.windowMs;
    const existing = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);
    if (existing.length >= this.max) {
      this.hits.set(key, existing);
      return false;
    }
    existing.push(t);
    this.hits.set(key, existing);
    // Bounded state: evict oldest keys when over capacity.
    if (this.hits.size > this.maxKeys) {
      const oldest = [...this.hits.entries()].sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0)).slice(0, this.hits.size - this.maxKeys);
      for (const [k] of oldest) this.hits.delete(k);
    }
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

export interface RateLimitConfig {
  clientMax: number;
  clientWindowMs: number;
  ipMax: number;
  ipWindowMs: number;
}

export class RateLimitMiddleware {
  private byClient: RateLimiter;
  private byIp: RateLimiter;

  constructor(cfg: RateLimitConfig, now: () => number = Date.now) {
    this.byClient = new SlidingWindowRateLimiter(cfg.clientMax, cfg.clientWindowMs, 100_000, now);
    this.byIp = new SlidingWindowRateLimiter(cfg.ipMax, cfg.ipWindowMs, 100_000, now);
  }

  /** Throws RATE_LIMITED when either limit is exceeded. Call BEFORE reading the body. */
  enforce(identity: { clientId?: string; ip: string }, now?: number): void {
    if (identity.clientId && !this.byClient.check(`c:${identity.clientId}`, now)) throw err.rateLimited();
    if (!this.byIp.check(`ip:${identity.ip}`, now)) {
      throw err.rateLimited('Too many requests from this network. Please try again shortly.');
    }
  }

  reset(): void {
    this.byClient.reset();
    this.byIp.reset();
  }
}
