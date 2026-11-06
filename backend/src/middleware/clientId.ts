/**
 * Anonymous client id + trusted-proxy-aware client IP resolution.
 *
 * - The X-SangeetPremi-Client-Id header is a random UUID: an IDENTIFIER for
 *   rate limiting only, never authentication.
 * - X-Forwarded-For is only honored when the immediate peer is a configured
 *   trusted proxy (TRUSTED_PROXIES env, comma-separated IPs/CIDRs-lite exact
 *   matches). Otherwise the socket address is used — arbitrary clients can
 *   never spoof their IP.
 */
import type { IncomingMessage } from 'node:http';
import { err } from '../http/responses.js';

export const CLIENT_ID_HEADER = 'x-sangeetpremi-client-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientIdentity {
  clientId?: string;
  ip: string;
}

export function extractClientIdentity(req: IncomingMessage, trustedProxies: string[] = []): ClientIdentity {
  const raw = req.headers[CLIENT_ID_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header !== undefined && !UUID_RE.test(header)) {
    throw err.invalidInput(`${CLIENT_ID_HEADER} must be a UUID when provided`);
  }
  const socketIp = req.socket.remoteAddress ?? 'unknown';
  let ip = socketIp;
  if (trustedProxies.includes(socketIp)) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) ip = first;
  }
  return { clientId: header, ip };
}
