import type { AddressInfo } from 'node:net';
import { buildApp, type App } from '../src/app.js';

export async function startTestApp(overrides: Parameters<typeof buildApp>[0] = {}): Promise<{ app: App; base: string }> {
  const app = buildApp({
    env: { NODE_ENV: 'test' },
    config: { port: 0, host: '127.0.0.1', allowedOrigins: ['chrome-extension://test-ext-id'], rateLimit: { clientMax: 5, clientWindowMs: 60_000, ipMax: 10, ipWindowMs: 60_000 } },
    ...overrides,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}` };
}

export async function stop(app: App): Promise<void> {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
}

export const CLIENT_ID = '123e4567-e89b-42d3-a456-426614174000';
export const CLIENT_HEADERS = { 'X-SangeetPremi-Client-Id': CLIENT_ID, 'Content-Type': 'application/json' };
