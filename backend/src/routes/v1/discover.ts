import type { IncomingMessage } from 'node:http';
import type { RouteHandler } from '../../http/router.js';
import { requireCapability } from '../../jobs.js';
import { JobManager, type DiscoveryJob } from '../../jobManager.js';
import type { DiscoverParams } from '../../orchestrator.js';
import type { DiscoveryCategory } from '../../../../shared/types.js';
import { err, ok } from '../../http/responses.js';
import { optionalInt, requireEnum, requireString, requireStringArray } from '../../middleware/validate.js';

const DEPTHS = ['quick', 'standard', 'deep'] as const;
export type DiscoveryDepth = (typeof DEPTHS)[number];

export interface DiscoverRequest {
  artists: string[];
  depth: DiscoveryDepth;
  categories?: string[];
  filters?: { language?: string; yearFrom?: number; yearTo?: number };
}

/** Validate the POST /v1/discover body. Throws INVALID_INPUT on bad input. */
export function validateDiscoverBody(body: unknown): DiscoverRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw err.invalidInput('Body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  const artists = requireStringArray(b.artists, 'artists', 1, 5, 100);
  const depth = requireEnum(b.depth ?? 'standard', 'depth', DEPTHS);
  let categories: string[] | undefined;
  if (b.categories !== undefined) categories = requireStringArray(b.categories, 'categories', 1, 20, 40);
  let filters: DiscoverRequest['filters'];
  if (b.filters !== undefined) {
    if (typeof b.filters !== 'object' || b.filters === null) throw err.invalidInput('"filters" must be an object');
    const f = b.filters as Record<string, unknown>;
    filters = {};
    if (f.language !== undefined) filters.language = requireString(f.language, 'filters.language', 2, 8);
    const yf = optionalInt(f.yearFrom, 'filters.yearFrom', 1900, 2100);
    const yt = optionalInt(f.yearTo, 'filters.yearTo', 1900, 2100);
    if (yf !== undefined) filters.yearFrom = yf;
    if (yt !== undefined) filters.yearTo = yt;
    if (filters.yearFrom !== undefined && filters.yearTo !== undefined && filters.yearFrom > filters.yearTo) {
      throw err.invalidInput('filters.yearFrom must be <= filters.yearTo');
    }
  }
  return { artists, depth, categories, filters };
}

const JOB_ID_RE = /^[a-z0-9-]{8,64}$/i;
export function requireJobId(v: unknown): string {
  const s = requireString(v, 'id', 8, 64);
  if (!JOB_ID_RE.test(s)) throw err.invalidInput('"id" must be a valid job id');
  return s;
}

interface Verifier { verify(id: string, capability: unknown, now?: number): boolean }

/** Ownership check shared by job sub-resources. 401 for missing/malformed capability, 403 for invalid/expired. */
export function requireJobAccess(req: IncomingMessage, jobs: Verifier, id: string): void {
  const cap = requireCapability(req);
  if (!jobs.verify(id, cap)) throw err.forbidden('Invalid, expired or revoked job capability.');
}

/** POST /v1/discover — validates input, enqueues an async job, returns job id + one-time capability. */
export function createDiscoveryHandler(jobs: JobManager, runJob: () => void): RouteHandler {
  return (ctx) => {
    const req = validateDiscoverBody(ctx.body);
    const params: DiscoverParams = {
      artists: req.artists,
      depth: req.depth,
      categories: (req.categories ?? ['song', 'live', 'remix', 'duet']) as DiscoveryCategory[],
      filters: req.filters,
    };
    const { jobId, capability } = jobs.create(params);
    runJob(); // pump the queue
    return ok({
      jobId,
      capability, // shown once, in the response body only — never logged, never in a URL
      status: 'queued',
      statusUrl: `/v1/discover/${jobId}`,
    });
  };
}

function publicJob(job: DiscoveryJob) {
  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    result: job.state === 'completed' ? job.result : undefined,
    error: job.state === 'failed' ? job.error : undefined,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  };
}

/** GET /v1/discover/:id — polling endpoint (Phase C2-C: no SSE). Capability via Authorization header only. */
export function getDiscoveryHandler(jobs: JobManager, req: IncomingMessage): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    const job = jobs.get(id);
    if (!job) throw err.forbidden('Invalid, expired or revoked job capability.');
    return ok(publicJob(job));
  };
}

/** POST /v1/discover/:id/refresh — re-runs the same params as a NEW job (client merges; no silent merge server-side). */
export function refreshDiscoveryHandler(jobs: JobManager, req: IncomingMessage, runJob: () => void): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    const prev = jobs.get(id);
    if (!prev) throw err.forbidden('Invalid, expired or revoked job capability.');
    const { jobId, capability } = jobs.create(prev.params);
    runJob();
    return ok({ jobId, capability, status: 'queued', refreshedFrom: id, statusUrl: `/v1/discover/${jobId}` });
  };
}

/** GET /v1/discover/:id/events — SSE intentionally NOT implemented in v0.3; polling via GET /v1/discover/:id is the contract. */
export function discoveryEventsHandler(jobs: JobManager, req: IncomingMessage): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    throw err.notImplemented('SSE is not supported in v0.3; poll GET /v1/discover/:id instead.');
  };
}
