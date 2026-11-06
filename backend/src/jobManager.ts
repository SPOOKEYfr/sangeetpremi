/**
 * Discovery job manager (Phase C2). Single-instance, in-memory — this
 * limitation is intentional and documented; no multi-instance safety is
 * claimed. Jobs are owned by 256-bit capabilities (only the SHA-256 hash is
 * stored); job ids are random (never predictable); capabilities are only
 * accepted via the Authorization header, never URLs, and never logged.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashCapability } from './jobs.js';
import { newJobId, type DiscoverParams, type DiscoveryProgress, type DiscoveryResult } from './orchestrator.js';
import type { Logger } from './logger.js';

export type { JobState } from './orchestrator.js';

export interface DiscoveryJob {
  id: string;
  capabilityHash: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  progress: DiscoveryProgress[];
  result?: DiscoveryResult;
  error?: { code: string; message: string };
  params: DiscoverParams;
  createdAt: number;
  expiresAt: number;
  finishedAt?: number;
  revoked: boolean;
}

export interface JobManagerOptions {
  maxConcurrent?: number; // default 2
  maxJobs?: number; // bounded memory: default 200
  ttlMs?: number; // default 24h
  now?: () => number;
  logger?: Logger;
}

export class JobManager {
  private jobs = new Map<string, DiscoveryJob>();
  private running = 0;
  private queue: string[] = [];
  private opts: Required<Omit<JobManagerOptions, 'logger'>> & { logger?: Logger };

  constructor(opts: JobManagerOptions = {}) {
    this.opts = {
      maxConcurrent: opts.maxConcurrent ?? 2,
      maxJobs: opts.maxJobs ?? 200,
      ttlMs: opts.ttlMs ?? 24 * 3600 * 1000,
      now: opts.now ?? Date.now,
      logger: opts.logger,
    };
  }

  /** Create a job and enqueue it. Returns { jobId, capability } — capability shown once. */
  create(params: DiscoverParams): { jobId: string; capability: string } {
    this.sweep();
    if (this.jobs.size >= this.opts.maxJobs) {
      // evict oldest finished job to bound memory
      const oldest = [...this.jobs.values()].filter((j) => j.state === 'completed' || j.state === 'failed').sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.jobs.delete(oldest.id);
    }
    const capability = randomBytes(32).toString('hex');
    const id = newJobId();
    const now = this.opts.now();
    this.jobs.set(id, {
      id, capabilityHash: hashCapability(capability), state: 'queued',
      progress: [], params, createdAt: now, expiresAt: now + this.opts.ttlMs, revoked: false,
    });
    this.queue.push(id);
    this.opts.logger?.info('job_created', { jobId: id });
    return { jobId: id, capability };
  }

  /** Called by the app to run jobs with bounded concurrency. */
  async pump(run: (job: DiscoveryJob, onProgress: (p: DiscoveryProgress) => void) => Promise<DiscoveryResult>): Promise<void> {
    while (this.queue.length && this.running < this.opts.maxConcurrent) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.revoked) continue;
      this.running++;
      job.state = 'running';
      void (async () => {
        try {
          const result = await run(job, (p) => {
            job.progress.push(p);
            if (job.progress.length > 100) job.progress.shift(); // bounded progress memory
          });
          job.result = result;
          job.state = 'completed';
        } catch (e) {
          job.state = 'failed';
          job.error = { code: (e as { code?: string }).code ?? 'DISCOVERY_FAILED', message: (e as Error).message };
        } finally {
          job.finishedAt = this.opts.now();
          this.running--;
        }
      })();
    }
  }

  get(id: string): DiscoveryJob | undefined {
    return this.jobs.get(id);
  }

  /** Capability verification: hash-compare, expiry + revocation checks. */
  verify(id: string, capability: unknown, now?: number): boolean {
    const job = this.jobs.get(id);
    if (!job || job.revoked) return false;
    const t = now ?? this.opts.now();
    if (t > job.expiresAt) return false;
    if (typeof capability !== 'string' || !/^[0-9a-f]{64}$/.test(capability)) return false;
    const h = createHash('sha256').update(capability).digest('hex');
    return timingSafeEqual(Buffer.from(h), Buffer.from(job.capabilityHash));
  }

  revoke(id: string): void {
    const j = this.jobs.get(id);
    if (j) j.revoked = true;
    this.queue = this.queue.filter((q) => q !== id);
  }

  /** Remove expired jobs (cleanup). */
  sweep(): void {
    const now = this.opts.now();
    for (const [id, job] of this.jobs) {
      if (now > job.expiresAt || job.revoked) this.jobs.delete(id);
    }
    this.queue = this.queue.filter((id) => this.jobs.has(id));
  }

  stats(): { total: number; queued: number; running: number; completed: number; failed: number } {
    const s = { total: this.jobs.size, queued: 0, running: 0, completed: 0, failed: 0 };
    for (const j of this.jobs.values()) s[j.state]++;
    return s;
  }
}
