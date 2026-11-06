/** Small id / slug helpers. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}

export function randomId(prefix = 'id'): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${rnd}`;
}

/** Deterministic key from arbitrary string parts. */
export function stableKey(...parts: string[]): string {
  return parts.join('::').toLowerCase();
}
