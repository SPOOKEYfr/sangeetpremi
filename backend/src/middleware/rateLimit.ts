/**
 * Rate limiting interfaces + a safe in-memory sliding-window implementation.
 * Two independent limits: per anonymous client id (when present) and per IP.
 * In-memory is correct for a single-instance Phase B deployment; a shared
 * store (e.g. Postgres/Redis) is a Phase D concern for multi-instance.
 */
import { err } from '../http/responses.js';

export interface RateLimiter {
  /** Returns true if the request is allowed, false if it should be rejected. */
  check(key: string, now?: number): boolean;
  reset(): void;
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  check(key: string, now = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    const existing = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (existing.length >= this.max) {
      this.hits.set(key, existing);
      return false;
    }
    existing.push(now);
    this.hits.set(key, existing);
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

  constructor(cfg: RateLimitConfig, now?: () => number) {
    this.byClient = new SlidingWindowRateLimiter(cfg.clientMax, cfg.clientWindowMs);
    this.byIp = new SlidingWindowRateLimiter(cfg.ipMax, cfg.ipWindowMs);
    void now;
  }

  /** Throws RATE_LIMITED when either limit is exceeded. */
  enforce(identity: { clientId?: string; ip: string }): void {
    if (identity.clientId && !this.byClient.check(`c:${identity.clientId}`)) throw err.rateLimited();
    if (!this.byIp.check(`ip:${identity.ip}`)) throw err.rateLimited('Too many requests from this network. Please try again shortly.');
  }

  reset(): void {
    this.byClient.reset();
    this.byIp.reset();
  }
}
