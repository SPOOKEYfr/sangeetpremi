/**
 * Application composition: config + logger + middleware + v1 routes.
 * Backend code is fully independent from browser-extension APIs.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { loadConfig, type BackendConfig } from './config.js';
import { Logger } from './logger.js';
import { Router } from './http/router.js';
import { createApiServer, type AppContext } from './http/server.js';
import { fail } from './http/responses.js';
import { extractClientIdentity, type ClientIdentity } from './middleware/clientId.js';
import { RateLimitMiddleware } from './middleware/rateLimit.js';
import { corsHeaders, isPreflight } from './middleware/cors.js';
import { NullSecretProvider, type SecretProvider } from './secrets.js';
import { InMemoryQuotaAccountant, type QuotaAccountant } from './quota.js';
import { StubMetadataProvider, StubVideoProvider } from './providers/stubs.js';
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
  router.get('/v1/discover/:id', getDiscoveryHandler);
  router.get('/v1/discover/:id/events', discoveryEventsHandler);
  router.post('/v1/discover/:id/refresh', refreshDiscoveryHandler);
  router.get('/v1/videos/:id', getVideoHandler(video));

  let identity: ClientIdentity | null = null;

  const appCtx: AppContext = {
    logger,
    maxBodyBytes: config.maxBodyBytes,
    beforeRoute: (req, _body) => {
      identity = extractClientIdentity(req);
      rateLimiter.enforce(identity);
    },
    enrich: () => {},
  };

  const server = createApiServer(router, appCtx);

  // CORS + preflight handling wrapped around the API server.
  const inner = server.listeners('request')[0] as (req: IncomingMessage, res: ServerResponse) => void;
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    corsHeaders(req, res, config.allowedOrigins);
    if (isPreflight(req)) {
      res.writeHead(204);
      res.end();
      return;
    }
    inner(req, res);
  });

  // 404 for non-API paths is already handled by the router; keep /v1-only scope explicit:
  void fail;

  return { server, config, logger, rateLimiter, quota, secrets, providers: { metadata, video }, get identity() { return identity; } };
}
