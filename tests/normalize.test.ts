import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeArtistName, extractVersionTags, baseTitle, parseDuration, formatDuration } from '../src/utils/normalize';

describe('normalizeText', () => {
  it('strips punctuation, case and noise words', () => {
    expect(normalizeText('Official Video: Tum Hi Ho (Song)')).toBe('tum hi ho');
  });
  it('handles diacritics', () => {
    expect(normalizeText('Amélie')).toBe('amelie');
  });
});

describe('normalizeArtistName', () => {
  it('normalizes case and spaces', () => {
    expect(normalizeArtistName('  Arijit   Singh ')).toBe('arijit singh');
  });
});

describe('extractVersionTags', () => {
  it('detects live and remix', () => {
    expect(extractVersionTags('Tum Hi Ho (Live at Wembley)')).toContain('live');
    expect(extractVersionTags('Tum Hi Ho Official Remix')).toContain('remix');
  });
  it('returns empty for plain titles', () => {
    expect(extractVersionTags('Tum Hi Ho')).toEqual([]);
  });
});

describe('baseTitle', () => {
  it('removes bracketed segments and version tags', () => {
    expect(baseTitle('Kesariya (Official Video) [4K]')).toBe('kesariya');
    expect(baseTitle('Tum Hi Ho - Acoustic')).toBe('tum hi ho');
  });
});

describe('durations', () => {
  it('parses ISO-8601', () => {
    expect(parseDuration('PT4M32S')).toBe(272);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('garbage')).toBe(0);
  });
  it('formats seconds', () => {
    expect(formatDuration(272)).toBe('4:32');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(undefined)).toBe('');
  });
});
