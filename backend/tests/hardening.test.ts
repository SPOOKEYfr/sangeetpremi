/** Phase B.1 hardening regression tests for every reproduced review defect. */
import { describe, it, expect, afterEach } from 'vitest';
import { startTestApp, stop, CLIENT_HEADERS, CLIENT_ID } from './helpers.js';
import type { App } from '../src/app.js';
import { SlidingWindowRateLimiter } from '../src/middleware/rateLimit.js';
import { extractClientIdentity } from '../src/middleware/clientId.js';
import { InMemoryJobStore, hashCapability } from '../src/jobs.js';

let app: App | undefined;
afterEach(async () => { if (app) await stop(app); app = undefined; });

describe('rate limiting hardening', () => {
  it('UUID rotation does NOT bypass the per-IP limit', async () => {
    const s = await startTestApp(); app = s.app; // ipMax = 10 in test config
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` } });
      expect(res.status).toBe(200);
    }
    const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': '99999999-9999-4999-8999-999999999999' } });
    expect(res.status).toBe(429); // new UUID, same IP -> still blocked
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('rate limit is enforced BEFORE body parsing (429 wins over 413)', async () => {
    const s = await startTestApp(); app = s.app;
    for (let i = 0; i < 10; i++) await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': CLIENT_ID } });
    // 11th request: rate-limited, and body is huge — must get 429, not 413
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: 'x'.repeat(200_000) });
    expect(res.status).toBe(429);
  });

  it('CORS preflight is also rate-limited by IP', async () => {
    const s = await startTestApp(); app = s.app;
    for (let i = 0; i < 10; i++) {
      await fetch(`${s.base}/v1/discover`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://test-ext-id', 'Access-Control-Request-Method': 'POST' } });
    }
    const res = await fetch(`${s.base}/v1/discover`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://test-ext-id', 'Access-Control-Request-Method': 'POST' } });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('oversized body still gets a proper 413 response (socket not destroyed)', async () => {
    const s = await startTestApp({ config: { maxBodyBytes: 1024, port: 0, host: '127.0.0.1', allowedOrigins: [], rateLimit: { clientMax: 1000, clientWindowMs: 60000, ipMax: 1000, ipWindowMs: 60000 } } as never }); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['A'.repeat(5000)] }) });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('SlidingWindowRateLimiter unit behavior', () => {
  it('uses the injected clock', () => {
    let t = 1000;
    const rl = new SlidingWindowRateLimiter(2, 500, 100, () => t);
    expect(rl.check('k')).toBe(true);
    expect(rl.check('k')).toBe(true);
    expect(rl.check('k')).toBe(false);
    t = 1501; // window slid past
    expect(rl.check('k')).toBe(true);
  });
  it('state is bounded: evicts oldest keys beyond maxKeys', () => {
    const rl = new SlidingWindowRateLimiter(1, 10_000, 5, () => 0);
    for (let i = 0; i < 50; i++) rl.check(`key-${i}`);
    // internal map must not exceed maxKeys
    expect((rl as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(5);
  });
});

describe('trusted proxy policy', () => {
  const mk = (headers: Record<string, string>, remote = '10.0.0.1') => ({ headers, socket: { remoteAddress: remote } }) as never;
  it('X-Forwarded-For is IGNORED from untrusted clients', () => {
    const id = extractClientIdentity(mk({ 'x-forwarded-for': '1.2.3.4' }, '203.0.113.7'), []);
    expect(id.ip).toBe('203.0.113.7');
  });
  it('X-Forwarded-For is honored only from a trusted proxy', () => {
    const id = extractClientIdentity(mk({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, '10.0.0.1'), ['10.0.0.1']);
    expect(id.ip).toBe('1.2.3.4');
  });
});

describe('error handling', () => {
  it('malformed percent-encoding in path -> 400 INVALID_INPUT (not 500)', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/videos/%E0%A4%A`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(JSON.stringify(body)).not.toContain('at '); // no stack trace leaked
  });
  it('error envelope never contains stack traces', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: '{bad' });
    const text = await res.text();
    expect(text).not.toMatch(/\\n\\s+at\\s/);
  });
});

describe('job ownership (capability tokens)', () => {
  it('missing capability -> 401 UNAUTHORIZED', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover/abcdef12`);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });
  it('malformed capability -> 401', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover/abcdef12`, { headers: { Authorization: 'Bearer xyz' } });
    expect(res.status).toBe(401);
  });
  it('wrong capability -> 403; valid capability passes ownership then 501', async () => {
    const s = await startTestApp(); app = s.app;
    const jobs = app.jobs;
    const cap = jobs.create('abcdef12', 60_000);
    const wrong = await fetch(`${s.base}/v1/discover/abcdef12`, { headers: { Authorization: `Bearer ${'0'.repeat(64)}` } });
    expect(wrong.status).toBe(403);
    const okRes = await fetch(`${s.base}/v1/discover/abcdef12`, { headers: { Authorization: `Bearer ${cap}` } });
    expect(okRes.status).toBe(501); // passed ownership, orchestration is Phase C
    const ev = await fetch(`${s.base}/v1/discover/abcdef12/events`, { headers: { Authorization: `Bearer ${cap}` } });
    expect(ev.status).toBe(501);
    const rf = await fetch(`${s.base}/v1/discover/abcdef12/refresh`, { method: 'POST', headers: { ...CLIENT_HEADERS, Authorization: `Bearer ${cap}` }, body: '{}' });
    expect(rf.status).toBe(501);
  });
  it('expired and revoked capabilities are rejected', () => {
    let t = 1000;
    const jobs = new InMemoryJobStore(() => t);
    const cap = jobs.create('job1', 500, t);
    expect(jobs.verify('job1', cap, t + 100)).toBe(true);
    expect(jobs.verify('job1', cap, t + 600)).toBe(false); // expired
    const cap2 = jobs.create('job2', 10_000, t);
    jobs.revoke('job2');
    expect(jobs.verify('job2', cap2, t + 100)).toBe(false); // revoked
  });
  it('only the hash of the capability is stored', () => {
    const jobs = new InMemoryJobStore();
    const cap = jobs.create('jobx', 60_000);
    const stored = (jobs as unknown as { jobs: Map<string, { capabilityHash: string }> }).jobs.get('jobx')!;
    expect(stored.capabilityHash).toBe(hashCapability(cap));
    expect(stored.capabilityHash).not.toBe(cap);
  });
});
