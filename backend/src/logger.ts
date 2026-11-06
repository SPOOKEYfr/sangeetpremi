/**
 * Structured, privacy-conscious logging. JSON lines; never logs request
 * bodies, query strings, headers or client ids. IPs are truncated-hashed.
 */
import { createHmac } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor(private level: LogLevel = 'info', private sink: (line: string) => void = (l) => console.log(l)) {}

  private write(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if (ORDER[level] < ORDER[this.level]) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
    this.sink(line);
  }

  debug(msg: string, f?: Record<string, unknown>): void { this.write('debug', msg, f); }
  info(msg: string, f?: Record<string, unknown>): void { this.write('info', msg, f); }
  warn(msg: string, f?: Record<string, unknown>): void { this.write('warn', msg, f); }
  error(msg: string, f?: Record<string, unknown>): void { this.write('error', msg, f); }

  /**
   * Privacy-safe request field: keyed HMAC (key from server config only) so the
   * fingerprint cannot be brute-forced against a known IP list, unlike an
   * unsalted hash. Raw IPs are never logged.
   */
  static ipFingerprint(ip: string, salt: string): string {
    return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 12);
  }
}
