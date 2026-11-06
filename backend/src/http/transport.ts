/**
 * Injectable HTTP transport with timeout, bounded body reads and bounded
 * retries. Zero runtime dependencies — the default transport wraps global
 * fetch; tests inject a mock. Error messages are redacted so API keys can
 * never leak into logs or error envelopes.
 */
export interface TransportResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type Transport = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<TransportResponse>;

export const defaultTransport: Transport = async (url, init) => {
  const res = await fetch(url, init as RequestInit);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json() as Promise<unknown>,
    text: () => res.text(),
  };
};

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
    public provider: string,
    public reason?: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

/** Redact any credential-looking query param (e.g. API keys) from strings. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('[REDACTED]');
  }
  return out;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number; // bounded retries for retryable failures only
  maxBodyBytes?: number;
  secrets?: string[]; // values to redact from any error text
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Perform a request with timeout + bounded retry on retryable statuses/network errors. Never retries 403 quotaExceeded. */
export async function requestJson(
  transport: Transport,
  provider: string,
  url: string,
  opts: RequestOptions = {},
): Promise<unknown> {
  const { timeoutMs = 10_000, maxRetries = 2, maxBodyBytes = 2_000_000, secrets = [], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await transport(url, { headers: opts.headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const safeBody = redactSecrets(bodyText.slice(0, 500), secrets);
        let reason: string | undefined;
        try {
          const parsed = JSON.parse(bodyText) as { error?: { errors?: { reason?: string }[] } };
          reason = parsed.error?.errors?.[0]?.reason;
        } catch { /* not json */ }
        // 403 quotaExceeded is NOT retryable — surface immediately.
        if (res.status === 403 && reason === 'quotaExceeded') {
          throw new ProviderHttpError(`${provider}: quota exhausted (quotaExceeded)`, 403, false, provider, reason);
        }
        const retryable = RETRYABLE.has(res.status);
        if (!retryable || attempt === maxRetries) {
          throw new ProviderHttpError(`${provider}: HTTP ${res.status}${reason ? ` (${reason})` : ''}: ${safeBody}`, res.status, false, provider, reason);
        }
        lastErr = new ProviderHttpError(`${provider}: HTTP ${res.status} retryable`, res.status, true, provider, reason);
      } else {
        const text = await res.text();
        if (text.length > maxBodyBytes) throw new ProviderHttpError(`${provider}: response exceeds ${maxBodyBytes} bytes`, 200, false, provider);
        try {
          return JSON.parse(text);
        } catch {
          throw new ProviderHttpError(`${provider}: response is not valid JSON`, 200, false, provider);
        }
      }
    } catch (e) {
      if (e instanceof ProviderHttpError) {
        if (!e.retryable || attempt === maxRetries) throw e;
        lastErr = e;
      } else {
        // network failure / timeout (AbortError) — retryable, bounded
        if (attempt === maxRetries) {
          throw new ProviderHttpError(`${provider}: network/timeout after ${attempt + 1} attempts: ${redactSecrets((e as Error).message, secrets)}`, 0, false, provider);
        }
        lastErr = e;
      }
    }
    await sleep(250 * (attempt + 1)); // bounded linear backoff
  }
  throw lastErr instanceof Error ? lastErr : new ProviderHttpError(`${provider}: unknown transport error`, 0, false, provider);
}
