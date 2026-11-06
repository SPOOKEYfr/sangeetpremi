/**
 * Discovery job ownership (Phase B.1 design, enforced contracts — the full
 * orchestrator is Phase C).
 *
 * Jobs are owned by a cryptographically secure capability token
 * (32 random bytes, hex). Only the SHA-256 hash of the capability is stored,
 * so leaked logs/db rows do not leak access. The anonymous client UUID is NOT
 * authentication and grants nothing by itself. Capabilities expire
 * (default 24h) and can be revoked; revoked/expired/unknown capabilities get
 * the same 404-style response so job existence is not leaked.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { err } from './http/responses.js';

export interface JobRecord {
  id: string;
  capabilityHash: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

export interface JobStore {
  create(id: string, ttlMs: number, now?: number): string; // returns the raw capability (shown once)
  verify(id: string, capability: unknown, now?: number): boolean;
  revoke(id: string): void;
}

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, JobRecord>();

  constructor(private now: () => number = Date.now) {}

  create(id: string, ttlMs: number, now?: number): string {
    const t = now ?? this.now();
    const capability = randomBytes(32).toString('hex');
    this.jobs.set(id, {
      id,
      capabilityHash: hashCapability(capability),
      createdAt: t,
      expiresAt: t + ttlMs,
      revoked: false,
    });
    return capability;
  }

  verify(id: string, capability: unknown, now?: number): boolean {
    const job = this.jobs.get(id);
    if (!job || job.revoked) return false;
    const t = now ?? this.now();
    if (t > job.expiresAt) return false;
    if (typeof capability !== 'string' || capability.length === 0) return false;
    const h = hashCapability(capability);
    return timingSafeEqual(Buffer.from(h), Buffer.from(job.capabilityHash));
  }

  revoke(id: string): void {
    const job = this.jobs.get(id);
    if (job) job.revoked = true;
  }
}

export function hashCapability(capability: string): string {
  return createHash('sha256').update(capability).digest('hex');
}

/** Extract the bearer capability from a request; missing/malformed -> 401. */
export function requireCapability(req: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header || !header.startsWith('Bearer ')) throw err.unauthorized('Missing job capability (Authorization: Bearer <capability>).');
  const cap = header.slice(7).trim();
  if (!/^[0-9a-f]{64}$/.test(cap)) throw err.unauthorized('Malformed job capability.');
  return cap;
}
