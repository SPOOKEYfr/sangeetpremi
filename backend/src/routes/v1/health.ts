import type { RouteHandler } from '../../http/router.js';
import { ok } from '../../http/responses.js';

export const VERSION = '0.3.0';

/** GET /v1/health — liveness/readiness. Contains no sensitive data. */
export const healthHandler: RouteHandler = () =>
  ok({
    status: 'ok',
    version: VERSION,
    phase: 'B',
    uptimeSeconds: Math.round(process.uptime()),
    providers: { metadata: 'stub', video: 'stub' },
    time: new Date().toISOString(),
  });
