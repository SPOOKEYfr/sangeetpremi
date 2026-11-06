/**
 * Zero-dependency HTTP server on node:http.
 * - Enforces a request body size limit (abuse protection)
 * - Parses JSON bodies only
 * - Maps everything to the consistent API envelope
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Router, type RouteContext } from './router.js';
import { ApiError, err, fail, ok, type ApiResponse } from './responses.js';
import { Logger } from '../logger.js';
import { QuotaExhausted } from '../quota.js';

export interface AppContext {
  logger: Logger;
  maxBodyBytes: number;
  ipSalt: string;
  /** Runs BEFORE the body is read (rate limiting must not wait for body parsing). May throw ApiError. */
  preBody?: (req: IncomingMessage) => void;
  /** Runs after body parsing, before routing. May throw ApiError. */
  beforeRoute?: (req: IncomingMessage, body: Buffer) => void;
  /** Hook to enrich the route context (client id, ip) — set by app.ts. */
  enrich?: (ctx: RouteContext) => void;
}

function sendJson(res: ServerResponse, status: number, payload: ApiResponse<unknown>, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes && !rejected) {
        rejected = true;
        reject(err.payloadTooLarge(`Request body exceeds ${maxBytes} bytes`));
        return; // keep draining so the error response can be delivered
      }
      if (!rejected) chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(err.internal('Failed to read request body')));
  });
}

export function createApiServer(router: Router, appCtx: AppContext): Server {
  return createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const ip = req.socket.remoteAddress ?? 'unknown';
    try {
      // Cheap protections first: identity + rate limits BEFORE any body processing.
      appCtx.preBody?.(req);
      let rawBody: Buffer = Buffer.alloc(0);
      let body: unknown;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const ct = req.headers['content-type'] ?? '';
        if (!ct.includes('application/json')) throw err.unsupportedMedia();
        rawBody = Buffer.from(await readBody(req, appCtx.maxBodyBytes));
        if (rawBody.length > 0) {
          try {
            body = JSON.parse(rawBody.toString('utf8'));
          } catch {
            throw err.invalidInput('Request body is not valid JSON');
          }
        }
      }
      appCtx.beforeRoute?.(req, rawBody);

      let match: ReturnType<Router['match']>;
      try {
        match = router.match(method, path);
      } catch {
        throw err.invalidInput('Malformed percent-encoding in request path');
      }
      if (!match) {
        if (router.hasPath(path)) throw err.methodNotAllowed();
        throw err.notFound(`No route for ${method} ${path}`);
      }
      const ctx: RouteContext = { params: match.params, query: url.searchParams, body, rawBody, req };
      appCtx.enrich?.(ctx);
      const result = await match.handler(ctx);
      const payload = result === undefined ? ok({}) : (result as { ok: true }).ok === true ? result : ok(result);
      sendJson(res, 200, payload as ApiResponse<unknown>);
      appCtx.logger.info('request', { method, path, status: 200, durMs: Date.now() - started, ipFp: Logger.ipFingerprint(ip, appCtx.ipSalt) });
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        // Structured, honest capacity error — never a fake success, never a raw 500.
        const payload = fail('QUOTA_EXHAUSTED', `YouTube API ${e.bucket} quota exhausted for today (limit ${e.limit}). Resets at midnight Pacific Time.`, { bucket: e.bucket });
        sendJson(res, 503, payload);
        appCtx.logger.warn('quota_exhausted', { method, path, bucket: e.bucket });
        return;
      }
      const ae = e instanceof ApiError ? e : err.internal();
      if (!(e instanceof ApiError)) appCtx.logger.error('unhandled', { method, path, msg: (e as Error).message });
      const status = ae.status;
      sendJson(res, status, fail(ae.code, ae.message, ae.details), { 'Content-Type': 'application/json; charset=utf-8' });
      appCtx.logger.warn('request_error', { method, path, status, code: ae.code, durMs: Date.now() - started, ipFp: Logger.ipFingerprint(ip, appCtx.ipSalt) });
    }
  });
}
