import type { IncomingMessage } from 'node:http';
import type { RouteHandler } from '../../http/router.js';
import type { JobStore } from '../../jobs.js';
import { requireCapability } from '../../jobs.js';
import { err } from '../../http/responses.js';
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

/** POST /v1/discover — contract established; orchestration is Phase C. */
export const createDiscoveryHandler: RouteHandler = (ctx) => {
  const req = validateDiscoverBody(ctx.body);
  void req;
  throw err.notImplemented('Discovery orchestration is Phase C. The request was validated successfully.');
};

/** Ownership check shared by job sub-resources. 401 for missing/malformed capability, 403 for invalid/expired. */
export function requireJobAccess(req: IncomingMessage, jobs: JobStore, id: string): void {
  const cap = requireCapability(req);
  if (!jobs.verify(id, cap)) throw err.forbidden('Invalid, expired or revoked job capability.');
}

/** GET /v1/discover/:id — contract established; capability-protected. */
export function getDiscoveryHandler(jobs: JobStore, req: IncomingMessage): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    throw err.notImplemented('Discovery jobs are Phase C.');
  };
}

/** POST /v1/discover/:id/refresh — capability-protected (prevents unauthorized refresh). */
export function refreshDiscoveryHandler(jobs: JobStore, req: IncomingMessage): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    throw err.notImplemented('Incremental refresh is Phase C.');
  };
}

/** GET /v1/discover/:id/events — SSE contract; capability-protected. */
export function discoveryEventsHandler(jobs: JobStore, req: IncomingMessage): RouteHandler {
  return (ctx) => {
    const id = requireJobId(ctx.params.id);
    requireJobAccess(req, jobs, id);
    throw err.notImplemented('SSE progress stream is Phase C.');
  };
}
