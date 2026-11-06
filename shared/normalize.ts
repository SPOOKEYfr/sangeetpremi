/**
 * Text normalization helpers used by search, dedup and classification.
 * Pure functions — unit tested in tests/normalize.test.ts
 */

const DIACRITICS = /[\u0300-\u036f]/g;

export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(DIACRITICS, '');
}

const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'official', 'video', 'audio', 'lyric', 'lyrics',
  'full', 'hd', 'hq', '4k', 'new', 'latest', 'song',
]);

/**
 * Normalize a title/artist for comparison: lowercase, strip diacritics,
 * remove punctuation, collapse whitespace, drop common noise words.
 */
export function normalizeText(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w))
    .join(' ');
}

/** Normalize an artist name for identity comparison. */
export function normalizeArtistName(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERSION_PATTERNS: { tag: string; re: RegExp }[] = [
  { tag: 'live', re: /\b(live|live at|live from|concert|tour)\b/i },
  { tag: 'acoustic', re: /\b(acoustic|unplugged)\b/i },
  { tag: 'unplugged', re: /\bunplugged\b/i },
  { tag: 'remix', re: /\b(remix|rework|edit|bootleg)\b/i },
  { tag: 'cover', re: /\b(cover|tribute)\b/i },
  { tag: 'instrumental', re: /\b(instrumental|karaoke|minus one|bgm)\b/i },
  { tag: 'extended', re: /\b(extended|full version|long version)\b/i },
  { tag: 'radio edit', re: /\bradio edit\b/i },
  { tag: 'remaster', re: /\b(remaster|remastered)\b/i },
  { tag: 'slowed', re: /\b(slowed|reverb|sped up|nightcore)\b/i },
  { tag: 'duet', re: /\b(duet|with)\b/i },
  { tag: 'unofficial', re: /\b(unofficial|fan made|lofi)\b/i },
];

/** Extract version tags (live, remix, acoustic…) from a raw title. */
export function extractVersionTags(title: string): string[] {
  const tags = new Set<string>();
  for (const { tag, re } of VERSION_PATTERNS) {
    if (re.test(title)) tags.add(tag);
  }
  return [...tags];
}

/** Strip bracketed/parenthesized segments and version tags to get a base title. */
export function baseTitle(title: string): string {
  let t = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ');
  for (const { re } of VERSION_PATTERNS) t = t.replace(re, ' ');
  return normalizeText(t);
}

/** Parse ISO-8601 duration (PT1H2M3S) to seconds. */
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (Number(d ?? 0) * 86400) + (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0);
}

/** Seconds -> "m:ss" or "h:mm:ss". */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
