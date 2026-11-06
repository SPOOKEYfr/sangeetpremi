/** CORS: only configured origins are allowed; extension origins are configured explicitly. */
import type { IncomingMessage, ServerResponse } from 'node:http';

export function corsHeaders(req: IncomingMessage, res: ServerResponse, allowedOrigins: string[]): void {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SangeetPremi-Client-Id');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

export function isPreflight(req: IncomingMessage): boolean {
  return req.method === 'OPTIONS' && !!req.headers.origin;
}
