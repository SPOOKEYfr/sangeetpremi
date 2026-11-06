/**
 * Language detection from track titles/descriptions.
 *
 * IMPORTANT: this is a heuristic. Unicode script detection is reliable for
 * non-Latin scripts; Latin-script languages (English/Hindi romanized/etc.)
 * can only be guessed. Results carry a confidence label so the UI can
 * distinguish verified signal from estimation — we never invent metadata.
 */
export interface LanguageGuess {
  code: string;
  label: string;
  confidence: 'script-detected' | 'heuristic' | 'unknown';
}

const SCRIPT_RANGES: { re: RegExp; code: string; label: string }[] = [
  { re: /[\u0900-\u097F]/, code: 'hi', label: 'Hindi' },
  { re: /[\u0980-\u09FF]/, code: 'bn', label: 'Bengali' },
  { re: /[\u0B80-\u0BFF]/, code: 'ta', label: 'Tamil' },
  { re: /[\u0C00-\u0C7F]/, code: 'te', label: 'Telugu' },
  { re: /[\u0C80-\u0CFF]/, code: 'kn', label: 'Kannada' },
  { re: /[\u0D00-\u0D7F]/, code: 'ml', label: 'Malayalam' },
  { re: /[\u0A80-\u0AFF]/, code: 'gu', label: 'Gujarati' },
  { re: /[\u0A00-\u0A7F]/, code: 'pa', label: 'Punjabi' },
  { re: /[\u0B00-\u0B7F]/, code: 'or', label: 'Odia' },
  { re: /[\u0600-\u06FF]/, code: 'ur', label: 'Urdu' },
  { re: /[\u4E00-\u9FFF]/, code: 'zh', label: 'Chinese' },
  { re: /[\u3040-\u309F\u30A0-\u30FF]/, code: 'ja', label: 'Japanese' },
  { re: /[\uAC00-\uD7AF]/, code: 'ko', label: 'Korean' },
  { re: /[\u0400-\u04FF]/, code: 'ru', label: 'Russian' },
  { re: /[\u0590-\u05FF]/, code: 'he', label: 'Hebrew' },
  { re: /[\u0E00-\u0E7F]/, code: 'th', label: 'Thai' },
  { re: /[\u0370-\u03FF]/, code: 'el', label: 'Greek' },
  { re: /[\u0590-\u05FF]/, code: 'he', label: 'Hebrew' },
];

const LATIN_HINTS: { re: RegExp; code: string; label: string }[] = [
  { re: /\b(spanish|español|latino)\b/i, code: 'es', label: 'Spanish' },
  { re: /\b(français|french|francais)\b/i, code: 'fr', label: 'French' },
  { re: /\b(deutsch|german)\b/i, code: 'de', label: 'German' },
  { re: /\b(português|portugues|brazil|brasil)\b/i, code: 'pt', label: 'Portuguese' },
  { re: /\b(italiano|italian)\b/i, code: 'it', label: 'Italian' },
  { re: /\b(türkçe|turkish|turkce)\b/i, code: 'tr', label: 'Turkish' },
  { re: /\b(polski|polish)\b/i, code: 'pl', label: 'Polish' },
  { re: /\b(nederlands|dutch)\b/i, code: 'nl', label: 'Dutch' },
];

export function detectLanguage(text: string): LanguageGuess {
  if (!text) return { code: 'unknown', label: 'Unknown', confidence: 'unknown' };
  for (const s of SCRIPT_RANGES) {
    if (s.re.test(text)) return { code: s.code, label: s.label, confidence: 'script-detected' };
  }
  for (const h of LATIN_HINTS) {
    if (h.re.test(text)) return { code: h.code, label: h.label, confidence: 'heuristic' };
  }
  if (/[a-zA-Z]/.test(text)) return { code: 'en', label: 'English (assumed)', confidence: 'heuristic' };
  return { code: 'unknown', label: 'Unknown', confidence: 'unknown' };
}

/** All distinct languages present in a set of texts. */
export function collectLanguages(texts: string[]): LanguageGuess[] {
  const counts = new Map<string, { guess: LanguageGuess; count: number }>();
  for (const t of texts) {
    const g = detectLanguage(t);
    if (g.code === 'unknown') continue;
    const cur = counts.get(g.code);
    if (cur) cur.count++;
    else counts.set(g.code, { guess: g, count: 1 });
  }
  return [...counts.values()].map((v) => v.guess).sort((a, b) => a.label.localeCompare(b.label));
}
