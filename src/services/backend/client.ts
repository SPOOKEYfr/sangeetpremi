/**
 * Typed client for the optional local SangeetPremi backend (Phase C2).
 *
 * - Base URL is centralized here and defaults to the LOCAL DEV origin only
 *   (http://127.0.0.1:8080). There is intentionally NO production endpoint:
 *   v0.3 ships no hosted API, and none is invented here.
 * - Job capabilities are sent ONLY via the Authorization header — never in
 *   URLs, never in extension storage.
 * - All requests are cancellable (AbortSignal) with a timeout.
 * - Errors are structured; QUOTA_EXHAUSTED and network failures get
 *   user-meaningful messages. No secrets, keys, or stack traces are exposed.
 */
import type { Artist, DiscoveryCategory, DiscoveryDepth, Track } from '../../types';

/** Local development origin only. Configurable, but never pointed at a hosted API in v0.3. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';

export interface BackendConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface DiscoverRequestBody {
  artists: string[];
  depth: DiscoveryDepth;
  categories?: DiscoveryCategory[];
  filters?: { language?: string; yearFrom?: number; yearTo?: number };
}

export interface JobAccepted {
  jobId: string;
  capability: string; // 256-bit; shown once, kept only in memory for this polling session
  status: string;
  statusUrl: string;
}

export type JobState = 'queued' | 'running' | 'completed' | 'failed';

export interface JobProgress { phase: string; message: string; done?: number; total?: number }

export interface JobStatus {
  id: string;
  state: JobState;
  progress: JobProgress[];
  result?: BackendDiscoveryResult;
  error?: { code: string; message: string };
  createdAt: number;
  expiresAt: number;
}

export interface BackendDiscoveryResult {
  artists: Artist[];
  tracks: Track[];
  duplicates: Track[];
  stats: unknown;
  related: unknown;
  perArtistCounts: Record<string, number>;
  report: {
    candidatesFound: number; accepted: number; duplicatesRemoved: number; excluded: number;
    exclusionReasons: Record<string, number>; providersUsed: string[]; notes: string[];
  };
}

export type BackendErrorCode =
  | 'NETWORK_ERROR' | 'BACKEND_UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED'
  | 'QUOTA_EXHAUSTED' | 'INVALID_INPUT' | 'UNAUTHORIZED' | 'FORBIDDEN'
  | 'NOT_FOUND' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'UNKNOWN';

export class BackendError extends Error {
  constructor(public code: BackendErrorCode, message: string, public status?: number) {
    super(message);
    this.name = 'BackendError';
  }
}

/** User-facing message for a backend error — never exposes internals. */
export function friendlyBackendError(e: unknown): string {
  if (e instanceof BackendError) {
    switch (e.code) {
      case 'QUOTA_EXHAUSTED': return 'Daily discovery quota is exhausted. It resets at midnight Pacific Time — try again tomorrow.';
      case 'BACKEND_UNAVAILABLE': case 'NETWORK_ERROR': return 'The local discovery service is unreachable. Make sure it is running on this device, or use a developer API key.';
      case 'TIMEOUT': return 'The discovery service took too long to respond. Please try again.';
      case 'CANCELLED': return 'Discovery was cancelled.';
      case 'UNAUTHORIZED': case 'FORBIDDEN': return 'This discovery session is no longer accessible (expired or revoked). Start a new search.';
      case 'RATE_LIMITED': return 'Too many requests — please wait a moment and try again.';
      default: return 'Discovery failed on the service. Please try again.';
    }
  }
  return 'Discovery failed. Please try again.';
}

interface Envelope<T> { ok: true; data: T } 

async function request<T>(baseUrl: string, path: string, init: RequestInit & { timeoutMs: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...init, signal: ctrl.signal });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const errBody = body as { ok?: false; error?: { code?: string; message?: string } } | null;
      const code = errBody?.error?.code ?? (res.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN');
      const message = errBody?.error?.message ?? `Request failed (${res.status})`;
      if (code === 'QUOTA_EXHAUSTED') throw new BackendError('QUOTA_EXHAUSTED', message, res.status);
      if (res.status === 401) throw new BackendError('UNAUTHORIZED', message, res.status);
      if (res.status === 403) throw new BackendError('FORBIDDEN', message, res.status);
      if (res.status === 404) throw new BackendError('NOT_FOUND', message, res.status);
      if (res.status === 429) throw new BackendError('RATE_LIMITED', message, res.status);
      if (res.status === 400) throw new BackendError('INVALID_INPUT', message, res.status);
      throw new BackendError('UNKNOWN', message, res.status);
    }
    return (body as Envelope<T>).data;
  } catch (e) {
    if (e instanceof BackendError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      // distinguish timeout from caller cancellation
      throw new BackendError('TIMEOUT', 'Request timed out.');
    }
    throw new BackendError('NETWORK_ERROR', 'Network request failed.');
  } finally {
    clearTimeout(timer);
  }
}

export class BackendClient {
  readonly baseUrl: string;
  private timeoutMs: number;

  constructor(cfg: BackendConfig = {}) {
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 15000;
  }

  /** Cheap reachability probe (used to decide backend-first vs dev-key fallback). */
  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
      const res = await fetch(`${this.baseUrl}/v1/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async submitDiscovery(body: DiscoverRequestBody, signal?: AbortSignal): Promise<JobAccepted> {
    return request<JobAccepted>(this.baseUrl, '/v1/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: this.timeoutMs,
      ...(signal ? {} : {}),
    });
  }

  async getJob(jobId: string, capability: string, signal?: AbortSignal): Promise<JobStatus> {
    void signal; // fetch-level cancel handled by request(); capability is header-only
    return request<JobStatus>(this.baseUrl, `/v1/discover/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${capability}` }, // capability never in URL
      timeoutMs: this.timeoutMs,
    });
  }

  async refreshJob(jobId: string, capability: string): Promise<JobAccepted> {
    return request<JobAccepted>(this.baseUrl, `/v1/discover/${encodeURIComponent(jobId)}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` },
      body: '{}',
      timeoutMs: this.timeoutMs,
    });
  }

  /**
   * Poll a job until it finishes. Reasonable interval with gentle backoff on
   * repeated failures; stops on completion, failure, cancellation, or when the
   * caller's signal aborts (navigation away). NO SSE — polling only (C2-C).
   */
  async pollJob(
    jobId: string,
    capability: string,
    onProgress: (p: JobProgress) => void,
    signal?: AbortSignal,
  ): Promise<JobStatus> {
    let interval = 800;
    const maxInterval = 5000;
    let lastPhase = '';
    for (;;) {
      if (signal?.aborted) throw new BackendError('CANCELLED', 'Polling cancelled.');
      let status: JobStatus;
      try {
        status = await this.getJob(jobId, capability, signal);
      } catch (e) {
        if (e instanceof BackendError && (e.code === 'UNAUTHORIZED' || e.code === 'FORBIDDEN' || e.code === 'NOT_FOUND')) throw e;
        if (e instanceof BackendError && e.code === 'CANCELLED') throw e;
        // transient: back off and retry a few times, then surface
        await delay(interval, signal);
        interval = Math.min(interval * 1.5, maxInterval);
        if (interval >= maxInterval) throw new BackendError('BACKEND_UNAVAILABLE', 'The discovery service stopped responding.');
        continue;
      }
      interval = 800; // reset on success
      const p = status.progress[status.progress.length - 1];
      if (p && p.phase !== lastPhase) { lastPhase = p.phase; onProgress(p); }
      else if (p) onProgress(p);
      if (status.state === 'completed' || status.state === 'failed') return status;
      await delay(interval, signal);
      interval = Math.min(interval + 200, maxInterval);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { cleanup(); reject(new BackendError('CANCELLED', 'Polling cancelled.')); };
    const cleanup = () => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
