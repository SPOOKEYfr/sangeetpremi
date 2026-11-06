import { describe, it, expect } from 'vitest';
import { detectLanguage, collectLanguages } from '../src/utils/language';

describe('detectLanguage', () => {
  it('detects Devanagari as Hindi (script-verified)', () => {
    const g = detectLanguage('तум 히igraph hi hoICIAL');
    expect(g.code).toBe('hi');
    expect(g.confidence).toBe('script-detected');
  });
  it('detects Tamil script', () => {
    expect(detectLanguage('பாடல் Tamil song').code).toBe('ta');
  });
  it('labels Latin text as heuristic English, never certain', () => {
    const g = detectLanguage('Tum Hi Ho');
    expect(g.code).toBe('en');
    expect(g.confidence).toBe('heuristic');
  });
  it('uses explicit language hints when present', () => {
    expect(detectLanguage('Cancion official spanish').code).toBe('es');
  });
  it('returns unknown for empty text', () => {
    expect(detectLanguage('').confidence).toBe('unknown');
  });
});

describe('collectLanguages', () => {
  it('aggregates distinct languages', () => {
    const langs = collectLanguages(['गाना one', 'Tamil பாட்டு', 'English song']);
    const codes = langs.map((l) => l.code);
    expect(codes).toContain('hi');
    expect(codes).toContain('ta');
    expect(codes).toContain('en');
  });
});
