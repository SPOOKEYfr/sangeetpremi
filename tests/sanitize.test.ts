import { describe, it, expect } from 'vitest';
import { escapeHtml, isValidVideoId, videoIdFromUrl, watchUrl, playlistUrl } from '../src/utils/sanitize';

describe('escapeHtml', () => {
  it('escapes dangerous chars', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });
});

describe('video id validation', () => {
  it('accepts valid ids', () => {
    expect(isValidVideoId('dQw4w9WgXcQ')).toBe(true);
  });
  it('rejects invalid ids', () => {
    expect(isValidVideoId('short')).toBe(false);
    expect(isValidVideoId('dQw4w9WgXc!')).toBe(false);
    expect(isValidVideoId('')).toBe(false);
  });
});

describe('videoIdFromUrl', () => {
  it('parses watch urls', () => {
    expect(videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });
  it('parses share urls', () => {
    expect(videoIdFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('accepts bare ids', () => {
    expect(videoIdFromUrl('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('rejects non-youtube urls', () => {
    expect(videoIdFromUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoIdFromUrl('not a url')).toBeNull();
  });
});

describe('url builders', () => {
  it('watchUrl', () => {
    expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
  it('playlistUrl caps at 50', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `ididididid${String(i).padStart(2, '0')}`.slice(0, 11));
    const url = playlistUrl(ids);
    expect(url).toContain('video_ids=');
    expect(url.startsWith('https://www.youtube.com/watch?v=')).toBe(true);
  });
});
