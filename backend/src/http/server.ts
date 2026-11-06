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

export interface AppContext {
  logger: Logger;
  maxBodyBytes: number;
  /** Middleware-style hook run before routing: may throw ApiError. */
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

      const match = router.match(method, path);
      if (!match) {
        if (router.hasPath(path)) throw err.methodNotAllowed();
        throw err.notFound(`No route for ${method} ${path}`);
      }
      const ctx: RouteContext = { params: match.params, query: url.searchParams, body, rawBody };
      appCtx.enrich?.(ctx);
      const result = await match.handler(ctx);
      const payload = result === undefined ? ok({}) : (result as { ok: true }).ok === true ? result : ok(result);
      sendJson(res, 200, payload as ApiResponse<unknown>);
      appCtx.logger.info('request', { method, path, status: 200, durMs: Date.now() - started, ipFp: Logger.ipFingerprint(ip) });
    } catch (e) {
      const ae = e instanceof ApiError ? e : err.internal();
      if (!(e instanceof ApiError)) appCtx.logger.error('unhandled', { method, path, msg: (e as Error).message });
      const status = ae.status;
      sendJson(res, status, fail(ae.code, ae.message, ae.details), { 'Content-Type': 'application/json; charset=utf-8' });
      appCtx.logger.warn('request_error', { method, path, status, code: ae.code, durMs: Date.now() - started, ipFp: Logger.ipFingerprint(ip) });
    }
  });
}
