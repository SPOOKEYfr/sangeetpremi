import { describe, it, expect, afterEach } from 'vitest';
import { startTestApp, stop, type CLIENT_HEADERS } from './helpers.js';
import type { App } from '../src/app.js';

let app: App | undefined;
afterEach(async () => { if (app) await stop(app); app = undefined; });

describe('GET /v1/health', () => {
  it('returns ok envelope with version and phase', async () => {
    const started = await startTestApp();
    app = started.app;
    const res = await fetch(`${started.base}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.phase).toBe('B');
    expect(body.data.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('unknown route returns structured NOT_FOUND', async () => {
    const started = await startTestApp();
    app = started.app;
    const res = await fetch(`${started.base}/v1/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('wrong method on existing path returns METHOD_NOT_ALLOWED', async () => {
    const started = await startTestApp();
    app = started.app;
    const res = await fetch(`${started.base}/v1/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });
});
