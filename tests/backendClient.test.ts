/**
 * Phase C2-H extension tests for the typed backend client: polling lifecycle,
 * capability sent via Authorization header only (never URLs/storage), timeout,
 * cancellation, structured errors, QUOTA_EXHAUSTED + network messaging, and a
 * guard that no API keys/secrets appear in the built bundle.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BackendClient, BackendError, friendlyBackendError, DEFAULT_BASE_URL } from '../src/services/backend/client';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('BackendClient (C2-D/C2-H)', () => {
  it('default base URL is the local dev origin only — no production endpoint', () => {
    expect(DEFAULT_BASE_URL).toBe('http://127.0.0.1:8080');
    expect(new BackendClient().baseUrl).toBe('http://127.0.0.1:8080');
  });

  it('submitDiscovery posts the body and returns jobId + 256-bit capability', async () => {
    const fetchMock = mockFetch(async (url, init) => {
      expect(url).toBe('http://127.0.0.1:8080/v1/discover');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.artists).toEqual(['Test Artist']);
      return json({ ok: true, data: { jobId: 'abc123', capability: 'a'.repeat(64), status: 'queued', statusUrl: '/v1/discover/abc123' } });
    });
    const c = new BackendClient();
    const acc = await c.submitDiscovery({ artists: ['Test Artist'], depth: 'standard' });
    expect(acc.jobId).toBe('abc123');
    expect(acc.capability).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getJob sends capability ONLY via Authorization header — never in the URL', async () => {
    const fetchMock = mockFetch(async (url, init) => {
      expect(url).toBe('http://127.0.0.1:8080/v1/discover/job1');
      expect(url).not.toContain('capability');
      expect(url).not.toContain('a'.repeat(64));
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${'a'.repeat(64)}`);
      return json({ ok: true, data: { id: 'job1', state: 'completed', progress: [], result: { tracks: [], artists: [] }, createdAt: 1, expiresAt: 2 } });
    });
    const c = new BackendClient();
    const st = await c.getJob('job1', 'a'.repeat(64));
    expect(st.state).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pollJob polls with backoff and stops when completed, reporting progress', async () => {
    const states = ['queued', 'running', 'completed'];
    let i = 0;
    mockFetch(async () => json({ ok: true, data: { id: 'j', state: states[Math.min(i++, 2)], progress: [{ phase: 'classify', message: 'Classifying…' }], createdAt: 1, expiresAt: 2, result: i >= 3 ? { tracks: [1], artists: [] } : undefined } }));
    const c = new BackendClient();
    const seen: string[] = [];
    const st = await c.pollJob('j', 'b'.repeat(64), (p) => seen.push(p.phase));
    expect(st.state).toBe('completed');
    expect(seen).toContain('classify');
  });

  it('pollJob stops on failure state with structured error', async () => {
    mockFetch(async () => json({ ok: true, data: { id: 'j', state: 'failed', progress: [], error: { code: 'DISCOVERY_FAILED', message: 'boom' }, createdAt: 1, expiresAt: 2 } }));
    const c = new BackendClient();
    const st = await c.pollJob('j', 'b'.repeat(64), () => {});
    expect(st.state).toBe('failed');
    expect(st.error?.code).toBe('DISCOVERY_FAILED');
  });

  it('pollJob aborts when the caller signal fires (navigation away)', async () => {
    mockFetch(async () => json({ ok: true, data: { id: 'j', state: 'running', progress: [], createdAt: 1, expiresAt: 2 } }));
    const c = new BackendClient();
    const ctrl = new AbortController();
    const p = c.pollJob('j', 'b'.repeat(64), () => {}, ctrl.signal);
    setTimeout(() => ctrl.abort(), 50);
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('QUOTA_EXHAUSTED (503) maps to a structured, user-meaningful message', async () => {
    mockFetch(async () => json({ ok: false, error: { code: 'QUOTA_EXHAUSTED', message: 'quota exhausted' } }, 503));
    const c = new BackendClient();
    await expect(c.getJob('j', 'b'.repeat(64))).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(friendlyBackendError(new BackendError('QUOTA_EXHAUSTED', 'x'))).toContain('midnight Pacific');
  });

  it('network failure maps to NETWORK_ERROR with friendly messaging', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    const c = new BackendClient();
    await expect(c.getJob('j', 'b'.repeat(64))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(friendlyBackendError(new BackendError('NETWORK_ERROR', 'x'))).toContain('unreachable');
  });

  it('isAvailable returns false when the backend is down', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    expect(await new BackendClient().isAvailable()).toBe(false);
  });

  it('401/403 on polling surface as UNAUTHORIZED/FORBIDDEN (expired or revoked job)', async () => {
    mockFetch(async () => json({ ok: false, error: { code: 'FORBIDDEN', message: 'invalid' } }, 403));
    const c = new BackendClient();
    await expect(c.getJob('j', 'b'.repeat(64))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(friendlyBackendError(new BackendError('FORBIDDEN', 'x'))).toContain('expired or revoked');
  });
});

describe('no API keys or secrets in the built bundle (C2-H)', () => {
  it('dist bundle contains no credential-looking strings', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const distDir = join(__dirname, '..', 'dist');
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
    walk(distDir);
    const banned = [/AIza[0-9A-Za-z_-]{35}/, /"youtubeApiKey"\s*:\s*"[^"]+"/, /client_secret/i];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const b of banned) expect(content).not.toMatch(b);
    }
  });
});
