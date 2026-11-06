/** Hand-rolled input validators (no validation dependency). All external input is validated. */
import { err } from '../http/responses.js';

export function requireString(v: unknown, name: string, min = 1, max = 200): string {
  if (typeof v !== 'string') throw err.invalidInput(`"${name}" must be a string`);
  const t = v.trim();
  if (t.length < min) throw err.invalidInput(`"${name}" must be at least ${min} character(s)`);
  if (t.length > max) throw err.invalidInput(`"${name}" must be at most ${max} characters`);
  return t;
}

export function requireEnum<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw err.invalidInput(`"${name}" must be one of: ${allowed.join(', ')}`, { received: v });
  }
  return v as T;
}

export function requireStringArray(v: unknown, name: string, minLen: number, maxLen: number, itemMax = 100): string[] {
  if (!Array.isArray(v)) throw err.invalidInput(`"${name}" must be an array of strings`);
  if (v.length < minLen) throw err.invalidInput(`"${name}" must contain at least ${minLen} item(s)`);
  if (v.length > maxLen) throw err.invalidInput(`"${name}" must contain at most ${maxLen} items`);
  return v.map((item, i) => requireString(item, `${name}[${i}]`, 1, itemMax));
}

export function requireInt(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw err.invalidInput(`"${name}" must be an integer between ${min} and ${max}`);
  }
  return v;
}

export function optionalInt(v: unknown, name: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  return requireInt(v, name, min, max);
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export function requireVideoId(v: unknown, name = 'id'): string {
  const s = requireString(v, name, 11, 11);
  if (!VIDEO_ID_RE.test(s)) throw err.invalidInput(`"${name}" must be a valid 11-character YouTube video id`);
  return s;
}
