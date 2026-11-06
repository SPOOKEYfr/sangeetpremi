import { describe, it, expect, afterEach } from 'vitest';
import { startTestApp, stop, CLIENT_HEADERS, CLIENT_ID } from './helpers.js';
import type { App } from '../src/app.js';

let app: App | undefined;
afterEach(async () => { if (app) await stop(app); app = undefined; });

describe('anonymous client id', () => {
  it('accepts a well-formed UUID header', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': CLIENT_ID } });
    expect(res.status).toBe(200);
  });
  it('rejects a malformed client id header', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': 'not-a-uuid' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });
});

describe('rate limiting', () => {
  it('per-client limit returns RATE_LIMITED 429 after clientMax requests', async () => {
    const s = await startTestApp(); app = s.app;
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': CLIENT_ID } });
      last = res.status;
      expect(last).toBe(200);
    }
    const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': CLIENT_ID } });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });
  it('a different client id is not affected by another client\'s limit', async () => {
    const s = await startTestApp(); app = s.app;
    for (let i = 0; i < 6; i++) await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': CLIENT_ID } });
    const res = await fetch(`${s.base}/v1/health`, { headers: { 'X-SangeetPremi-Client-Id': '223e4567-e89b-42d3-a456-426614174999' } });
    expect(res.status).toBe(200);
  });
});

describe('request size limit', () => {
  it('oversized body -> PAYLOAD_TOO_LARGE 413', async () => {
    const s = await startTestApp({ config: { maxBodyBytes: 1024, port: 0, host: '127.0.0.1', allowedOrigins: [], rateLimit: { clientMax: 100, clientWindowMs: 60000, ipMax: 100, ipWindowMs: 60000 } } as never }); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['A'.repeat(5000)] }) });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allowed origin gets ACAO header; unknown origin does not', async () => {
    const s = await startTestApp(); app = s.app;
    const okRes = await fetch(`${s.base}/v1/health`, { headers: { Origin: 'chrome-extension://test-ext-id' } });
    expect(okRes.headers.get('access-control-allow-origin')).toBe('chrome-extension://test-ext-id');
    const badRes = await fetch(`${s.base}/v1/health`, { headers: { Origin: 'https://evil.example' } });
    expect(badRes.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('preflight OPTIONS returns 204', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://test-ext-id', 'Access-Control-Request-Method': 'POST' } });
    expect(res.status).toBe(204);
  });
});
