/**
 * Application composition: config + logger + middleware + v1 routes.
 * Backend code is fully independent from browser-extension APIs.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { loadConfig, type BackendConfig } from './config.js';
import { Logger } from './logger.js';
import { Router } from './http/router.js';
import { createApiServer, type AppContext } from './http/server.js';
import { ApiError, err, fail } from './http/responses.js';
import { extractClientIdentity, type ClientIdentity } from './middleware/clientId.js';
import { RateLimitMiddleware } from './middleware/rateLimit.js';
import { corsHeaders, isPreflight } from './middleware/cors.js';
import { NullSecretProvider, type SecretProvider } from './secrets.js';
import { InMemoryQuotaAccountant, type QuotaAccountant } from './quota.js';
import { StubMetadataProvider, StubVideoProvider } from './providers/stubs.js';
import { InMemoryJobStore, type JobStore } from './jobs.js';
import type { MetadataProvider, VideoProvider } from './providers/types.js';
import { healthHandler } from './routes/v1/health.js';
import { resolveArtistHandler } from './routes/v1/artists.js';
import { createDiscoveryHandler, discoveryEventsHandler, getDiscoveryHandler, refreshDiscoveryHandler } from './routes/v1/discover.js';
import { getVideoHandler } from './routes/v1/videos.js';

export interface App {
  server: Server;
  config: BackendConfig;
  logger: Logger;
  rateLimiter: RateLimitMiddleware;
  quota: QuotaAccountant;
  secrets: SecretProvider;
  providers: { metadata: MetadataProvider; video: VideoProvider };
  jobs: JobStore;
  identity: ClientIdentity | null;
}

export function buildApp(overrides: {
  config?: Partial<BackendConfig>;
  secrets?: SecretProvider;
  metadata?: MetadataProvider;
  video?: VideoProvider;
  quota?: QuotaAccountant;
  env?: NodeJS.ProcessEnv;
} = {}): App {
  const config = { ...loadConfig(overrides.env ?? process.env), ...overrides.config };
  const logger = new Logger(config.logLevel);
  const secrets = overrides.secrets ?? new NullSecretProvider();
  const metadata = overrides.metadata ?? new StubMetadataProvider();
  const video = overrides.video ?? new StubVideoProvider();
  const quota = overrides.quota ?? new InMemoryQuotaAccountant();
  const rateLimiter = new RateLimitMiddleware(config.rateLimit);

  const router = new Router();
  router.get('/v1/health', healthHandler);
  router.get('/v1/artists/resolve', resolveArtistHandler(metadata));
  router.post('/v1/discover', createDiscoveryHandler);
  const jobs: JobStore = new InMemoryJobStore();
  router.get('/v1/discover/:id', (ctx) => getDiscoveryHandler(jobs, ctx.req)(ctx));
  router.get('/v1/discover/:id/events', (ctx) => discoveryEventsHandler(jobs, ctx.req)(ctx));
  router.post('/v1/discover/:id/refresh', (ctx) => refreshDiscoveryHandler(jobs, ctx.req)(ctx));
  router.get('/v1/videos/:id', getVideoHandler(video));

  let identity: ClientIdentity | null = null;

  const appCtx: AppContext = {
    logger,
    maxBodyBytes: config.maxBodyBytes,
    ipSalt: config.ipFingerprintSalt,
    // Identity + rate limiting run BEFORE body parsing (cheap, bounded), and
    // also apply to CORS preflights so OPTIONS cannot bypass the IP limit.
    preBody: (req) => {
      identity = extractClientIdentity(req, config.trustedProxies);
      rateLimiter.enforce(identity);
    },
    beforeRoute: () => {},
    enrich: () => {},
  };

  const server = createApiServer(router, appCtx);

  // CORS + preflight handling wrapped around the API server.
  const inner = server.listeners('request')[0] as (req: IncomingMessage, res: ServerResponse) => void;
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    corsHeaders(req, res, config.allowedOrigins);
    if (isPreflight(req)) {
      try {
        appCtx.preBody?.(req); // preflights are rate-limited by IP too
        res.writeHead(204);
      } catch (e) {
        const ae = e instanceof ApiError ? e : err.internal();
        res.writeHead(ae.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(fail(ae.code, ae.message, ae.details)));
      }
      res.end();
      return;
    }
    inner(req, res);
  });

  // 404 for non-API paths is already handled by the router; keep /v1-only scope explicit:
  void fail;

  return { server, config, logger, rateLimiter, quota, secrets, providers: { metadata, video }, jobs, get identity() { return identity; } };
}
