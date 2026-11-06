/** Regression: manifest version must equal package.json version (single source). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../src/manifest';

describe('version consistency', () => {
  it('manifest version matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect((manifest as { version: string }).version).toBe(pkg.version);
  });
});
