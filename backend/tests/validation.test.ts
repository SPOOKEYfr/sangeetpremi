import { describe, it, expect, afterEach } from 'vitest';
import { startTestApp, stop, CLIENT_HEADERS } from './helpers.js';
import type { App } from '../src/app.js';

let app: App | undefined;
afterEach(async () => { if (app) await stop(app); app = undefined; });

describe('POST /v1/discover validation (contract; orchestration is Phase C)', () => {
  it('valid body is accepted and enqueues a job (proves validation passed)', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, {
      method: 'POST', headers: CLIENT_HEADERS,
      body: JSON.stringify({ artists: ['Arijit Singh'], depth: 'standard', categories: ['song', 'live'], filters: { yearFrom: 2010, yearTo: 2024 } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.jobId).toMatch(/^[0-9a-f]{24}$/);
    expect(body.data.capability).toMatch(/^[0-9a-f]{64}$/); // 256-bit, shown once
    expect(body.data.status).toBe('queued');
  });

  it('missing artists -> INVALID_INPUT 400', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ depth: 'quick' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('too many artists -> INVALID_INPUT', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['a', 'b', 'c', 'd', 'e', 'f'] }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('bad depth enum -> INVALID_INPUT with details', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['A'], depth: 'ludicrous' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.details).toBeDefined();
  });

  it('inverted year range -> INVALID_INPUT', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: JSON.stringify({ artists: ['A'], filters: { yearFrom: 2024, yearTo: 2010 } }) });
    expect(res.status).toBe(400);
  });

  it('malformed JSON -> INVALID_INPUT', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: CLIENT_HEADERS, body: '{not json' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('non-JSON content type -> UNSUPPORTED_MEDIA_TYPE', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/discover`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' });
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('GET /v1/videos/:id validation', () => {
  it('invalid video id -> 400', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/videos/short`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });
  it('valid id -> 501 stub', async () => {
    const s = await startTestApp(); app = s.app;
    const res = await fetch(`${s.base}/v1/videos/dQw4w9WgXcQ`);
    expect(res.status).toBe(501);
    expect((await res.json()).error.code).toBe('NOT_IMPLEMENTED');
  });
});

describe('GET /v1/artists/resolve validation', () => {
  it('missing q -> 400; present q -> 501 stub', async () => {
    const s = await startTestApp(); app = s.app;
    const bad = await fetch(`${s.base}/v1/artists/resolve`);
    expect(bad.status).toBe(400);
    const good = await fetch(`${s.base}/v1/artists/resolve?q=Arijit%20Singh`);
    expect(good.status).toBe(501);
  });
});
