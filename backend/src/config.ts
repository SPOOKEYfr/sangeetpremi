/**
 * Centralized configuration. Every value comes from the environment with a
 * safe local-development default; invalid values fail fast at startup.
 * No secrets are required in Phase B.
 */
export interface BackendConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  allowedOrigins: string[];
  maxBodyBytes: number;
  rateLimit: {
    clientMax: number;
    clientWindowMs: number;
    ipMax: number;
    ipWindowMs: number;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function intFromEnv(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Config error: ${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const nodeEnvRaw = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    throw new Error(`Config error: NODE_ENV must be development|test|production (got "${nodeEnvRaw}")`);
  }
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Config error: LOG_LEVEL must be debug|info|warn|error (got "${logLevel}")`);
  }
  return {
    port: intFromEnv(env, 'PORT', 8080, 1, 65535),
    host: env.HOST ?? '127.0.0.1',
    nodeEnv: nodeEnvRaw as BackendConfig['nodeEnv'],
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maxBodyBytes: intFromEnv(env, 'MAX_BODY_BYTES', 65536, 1024, 10 * 1024 * 1024),
    rateLimit: {
      clientMax: intFromEnv(env, 'RATE_LIMIT_CLIENT_MAX', 60, 1, 100000),
      clientWindowMs: intFromEnv(env, 'RATE_LIMIT_CLIENT_WINDOW_MS', 60_000, 1000, 86_400_000),
      ipMax: intFromEnv(env, 'RATE_LIMIT_IP_MAX', 120, 1, 100000),
      ipWindowMs: intFromEnv(env, 'RATE_LIMIT_IP_WINDOW_MS', 60_000, 1000, 86_400_000),
    },
    logLevel: logLevel as BackendConfig['logLevel'],
  };
}
