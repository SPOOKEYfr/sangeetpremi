/**
 * MusicBrainz metadata provider (no API key; open licensed data).
 *
 * - Uses the official ws/2 web service with fmt=json.
 * - Sends a descriptive User-Agent identifying SangeetPremi + a contact
 *   placeholder for SPOOKEYfr (MusicBrainz requires this).
 * - Enforces ~1 request/second (MusicBrainz rate limit) via a simple limiter.
 * - Bounded retries with backoff on 503/429/network/timeout.
 * - Normalizes into internal types, preserving MBIDs as provenance.
 * - Never invents roles or missing metadata; coverage is NOT claimed complete.
 */
import type { ArtistCandidate, MetadataProvider, RecordingMeta } from './types.js';
import { ProviderHttpError, requestJson, type Transport, defaultTransport } from '../http/transport.js';

const API_BASE = 'https://musicbrainz.org/ws/2';
export const USER_AGENT = 'SangeetPremi/0.3.1 (https://github.com/SPOOKEYfr/sangeetpremi; contact: SPOOKEYfr — TODO owner to add contact)';

export interface MusicBrainzOptions {
  transport?: Transport;
  minIntervalMs?: number; // default 1000 (≈1 req/s)
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class MusicBrainzProvider implements MetadataProvider {
  readonly name = 'musicbrainz';
  private transport: Transport;
  private minIntervalMs: number;
  private lastRequestAt = -1;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(opts: MusicBrainzOptions = {}) {
    this.transport = opts.transport ?? defaultTransport;
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Rate limit: ~1 request per second. */
  private async throttle(): Promise<void> {
    if (this.lastRequestAt === -1) { this.lastRequestAt = this.now(); return; } // first request never waits
    const elapsed = this.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) await this.sleep(this.minIntervalMs - elapsed);
    this.lastRequestAt = this.now();
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.throttle();
    const url = new URL(`${API_BASE}${path}`);
    url.searchParams.set('fmt', 'json');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      return (await requestJson(this.transport, 'musicbrainz', url.toString(), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs: 10_000,
        maxRetries: 2, // bounded; 503/429 are retryable server-side
      })) as T;
    } catch (e) {
      if (e instanceof ProviderHttpError) {
        throw new ProviderHttpError(`musicbrainz: ${e.message}`, e.status, false, 'musicbrainz', e.reason);
      }
      throw new ProviderHttpError(`musicbrainz: ${(e as Error).message}`, 0, false, 'musicbrainz');
    }
  }

  /** artist/?query=... — artist identification candidates. */
  async resolveArtist(query: string): Promise<ArtistCandidate[]> {
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    const body = await this.get<{ artists?: Record<string, unknown>[] }>('/artist/', {
      query: `artist:"${q.replace(/"/g, '')}"`,
      limit: '10',
    });
    const now = Date.now();
    return (body.artists ?? []).map((a) => normalizeArtist(a, now)).filter((a): a is ArtistCandidate => !!a);
  }

  /** recording/?query=arid:<mbid> — recordings of an artist (bounded). */
  async recordingsOf(artistId: string): Promise<RecordingMeta[]> {
    if (!/^[0-9a-f-]{36}$/i.test(artistId)) return []; // MBID format guard
    const body = await this.get<{ recordings?: Record<string, unknown>[] }>('/recording/', {
      query: `arid:"${artistId}"`,
      limit: '100',
    });
    const now = Date.now();
    const seen = new Set<string>();
    const out: RecordingMeta[] = [];
    for (const r of body.recordings ?? []) {
      const n = normalizeRecording(r, artistId, now);
      if (n && !seen.has(n.id)) {
        seen.add(n.id);
        out.push(n);
      }
    }
    return out;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function normalizeArtist(a: Record<string, unknown>, now: number): ArtistCandidate | null {
  const id = str(a.id);
  if (!id) return null;
  const area = (a.area ?? {}) as Record<string, unknown>;
  return {
    id, // MusicBrainz MBID preserved as provenance
    name: str(a.name) ?? str(a['sort-name']) ?? '',
    country: str(area.iso_3166_1) ?? str(a.country),
    description: typeof a.disambiguation === 'string' ? a.disambiguation : undefined,
    source: 'musicbrainz',
    fetchedAt: now,
    expiresAt: now + 72 * 3600 * 1000, // 72h metadata cache policy
  };
}

function normalizeRecording(r: Record<string, unknown>, artistId: string, now: number): RecordingMeta | null {
  const id = str(r.id);
  if (!id) return null;
  const releases = Array.isArray(r.releases) ? (r.releases as Record<string, unknown>[]) : [];
  const firstRelease = releases[0] ?? {};
  const rg = (firstRelease['release-group'] ?? {}) as Record<string, unknown>;
  const date = str(firstRelease.date) ?? str(r.date);
  const year = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined;
  return {
    id, // MBID preserved
    title: str(r.title) ?? '',
    artistId,
    releaseGroup: str(rg.title),
    year, // only when present in source data — never invented
    source: 'musicbrainz',
    fetchedAt: now,
    expiresAt: now + 72 * 3600 * 1000,
  };
}
