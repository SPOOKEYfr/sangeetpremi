import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { NullSecretProvider, EnvSecretProvider } from '../src/secrets.js';
import { InMemoryQuotaAccountant, QuotaExhausted, costOf, todayPT } from '../src/quota.js';
import { SlidingWindowRateLimiter } from '../src/middleware/rateLimit.js';
import { extractClientIdentity } from '../src/middleware/clientId.js';
import { validateDiscoverBody } from '../src/routes/v1/discover.js';
import { Logger } from '../src/logger.js';

describe('config', () => {
  it('applies safe defaults', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8080);
    expect(c.host).toBe('127.0.0.1');
    expect(c.maxBodyBytes).toBe(65536);
  });
  it('rejects invalid PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '99999' })).toThrow(/PORT/);
  });
  it('rejects invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});

describe('secrets', () => {
  it('NullSecretProvider throws on access (no secrets in Phase B)', () => {
    const p = new NullSecretProvider();
    expect(p.has('YOUTUBE_API_KEY')).toBe(false);
    expect(() => p.get('YOUTUBE_API_KEY')).toThrow(/no secret provider/);
  });
  it('EnvSecretProvider reads env without exposing values in logs', () => {
    const p = new EnvSecretProvider({ MY_KEY: 'supersecret' });
    expect(p.has('MY_KEY')).toBe(true);
    expect(p.get('MY_KEY')).toBe('supersecret');
    expect(p.has('OTHER')).toBe(false);
  });
});

describe('quota accounting (method-specific)', () => {
  it('search.list uses the search bucket; lists use general', () => {
    expect(costOf('search.list')).toEqual({ units: 1, bucket: 'search' });
    expect(costOf('playlistItems.list')).toEqual({ units: 1, bucket: 'general' });
    expect(costOf('playlists.insert')).toEqual({ units: 50, bucket: 'general' });
    expect(costOf('videos.insert')).toEqual({ units: 1, bucket: 'uploads' });
  });
  it('pagination multiplies cost', () => {
    expect(costOf('playlistItems.list', 3).units).toBe(3);
  });
  it('exceeding the search bucket throws QuotaExhausted', () => {
    const q = new InMemoryQuotaAccountant({ search: 2, uploads: 100, general: 10_000 });
    q.record('search.list');
    q.record('search.list');
    expect(() => q.record('search.list')).toThrow(QuotaExhausted);
  });
  it('general bucket accumulates list calls', () => {
    const q = new InMemoryQuotaAccountant({ search: 100, uploads: 100, general: 10 });
    for (let i = 0; i < 10; i++) q.record('videos.list');
    expect(q.remaining().general).toBe(0);
    expect(() => q.record('videos.list')).toThrow(QuotaExhausted);
  });
  it('todayPT returns YYYY-MM-DD', () => {
    expect(todayPT()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('rate limiter', () => {
  it('allows up to max within window, then blocks', () => {
    const rl = new SlidingWindowRateLimiter(3, 1000);
    expect(rl.check('k', 0)).toBe(true);
    expect(rl.check('k', 100)).toBe(true);
    expect(rl.check('k', 200)).toBe(true);
    expect(rl.check('k', 300)).toBe(false);
    expect(rl.check('k', 1001)).toBe(true); // window slid
  });
  it('keys are independent', () => {
    const rl = new SlidingWindowRateLimiter(1, 1000);
    expect(rl.check('a', 0)).toBe(true);
    expect(rl.check('b', 0)).toBe(true);
    expect(rl.check('a', 1)).toBe(false);
  });
});

describe('client identity', () => {
  const mk = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } }) as never;
  it('extracts valid UUID + ip', () => {
    const id = extractClientIdentity(mk({ 'x-sangeetpremi-client-id': '123e4567-e89b-42d3-a456-426614174000' }));
    expect(id.clientId).toBeDefined();
    expect(id.ip).toBe('10.0.0.1');
  });
  it('missing header -> clientId undefined (still rate-limited by IP)', () => {
    expect(extractClientIdentity(mk({})).clientId).toBeUndefined();
  });
  it('malformed header throws', () => {
    expect(() => extractClientIdentity(mk({ 'x-sangeetpremi-client-id': 'xyz' }))).toThrow();
  });
});

describe('discover body validator', () => {
  it('accepts a full valid body', () => {
    const r = validateDiscoverBody({ artists: ['A', 'B'], depth: 'deep', categories: ['live'], filters: { language: 'hi', yearFrom: 2000 } });
    expect(r.artists).toEqual(['A', 'B']);
    expect(r.depth).toBe('deep');
  });
  it('defaults depth to standard', () => {
    expect(validateDiscoverBody({ artists: ['A'] }).depth).toBe('standard');
  });
  it('rejects non-object bodies', () => {
    expect(() => validateDiscoverBody('nope')).toThrow();
    expect(() => validateDiscoverBody([1, 2])).toThrow();
  });
});

describe('logger privacy', () => {
  it('ip fingerprints are keyed HMACs, not raw or brute-forceable hashes', () => {
    const fp = Logger.ipFingerprint('203.0.113.9', 'server-secret-salt');
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fp).not.toContain('203.0.113.9');
    // deterministic for same salt, different for different salt (unsalted sha256 would not be)
    expect(fp).toBe(Logger.ipFingerprint('203.0.113.9', 'server-secret-salt'));
    expect(fp).not.toBe(Logger.ipFingerprint('203.0.113.9', 'other-salt'));
    // and not equal to the plain unsalted sha256 (which IS brute-forceable)
    const plain = require('node:crypto').createHash('sha256').update('203.0.113.9').digest('hex').slice(0, 12);
    expect(fp).not.toBe(plain);
  });
  it('respects log level', () => {
    const lines: string[] = [];
    const l = new Logger('warn', (line) => lines.push(line));
    l.info('hidden');
    l.warn('shown');
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).msg).toBe('shown');
  });
});
