// @vitest-environment happy-dom
/**
 * Regression tests for stored HTML injection (Phase B.1 review defect A).
 * Malicious artist names / track metadata must never create elements,
 * execute handlers, or inject styles.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { trackCard } from '../src/components/trackCard';
import { renderLibrary } from '../src/features/library/libraryView';
import { store } from '../src/state/store';
import type { Track } from '../src/types';

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(document.domain)</script>',
  '<style>body{background:red}</style>',
  '<svg onload=alert(1)>',
  '" onmouseover="alert(1)',
  'Arijit &amp; <b>Singh</b>',
  "'; DROP TABLE artists; --",
];

function mkTrack(title: string): Track {
  return {
    id: 'vid00000001', videoId: 'vid00000001', title, normalizedTitle: title, artist: title,
    channelTitle: title, thumbnail: `javascript:alert(1)" onerror="alert(2)`, category: 'official',
    role: 'primary', versionTags: [], dedupeKey: '', isDuplicate: false, source: 'youtube', discoveredAt: 0,
  };
}

describe('trackCard XSS safety', () => {
  for (const p of PAYLOADS) {
    it(`track title payload cannot inject: ${p.slice(0, 30)}`, () => {
      const el = trackCard(mkTrack(p));
      const html = el.innerHTML;
      expect(el.querySelector('script')).toBeNull();
      expect(el.querySelector('style')).toBeNull();
      expect(el.querySelector('[onerror]')).toBeNull();
      expect(el.querySelector('[onload]')).toBeNull();
      expect(el.querySelector('[onmouseover]')).toBeNull();
      // text is present as text, not markup
      expect(el.textContent).toContain(p.replace(/<[^>]*>/g, '') .slice(0, 10));
      expect(html).not.toContain('<script');
      // the payload may appear only in escaped form inside an attribute value
      const img = el.querySelector('img');
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(html).toContain('&quot;'); // serialized form escapes quotes, attribute cannot be broken out of
    });
  }
});

describe('libraryView XSS safety (stored artist name)', () => {
  beforeEach(() => {
    store.library = {
      artists: {
        evil: { id: 'evil"><img src=x onerror=alert(1)>', name: '<img src=x onerror=alert(1)>', normalizedName: 'evil', discoveredAt: 1, favorite: true },
      },
      sessions: {}, playlists: {}, favorites: { trackIds: [] }, history: [],
    };
  });

  it('malicious artist name renders as text only', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    renderLibrary(el);
    expect(el.querySelector('img[onerror]')).toBeNull();
    expect(el.querySelectorAll('img').length).toBe(0);
    const chip = el.querySelector('.lib-a');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(chip!.getAttribute('data-id')).toBe('evil"><img src=x onerror=alert(1)>');
  });
});
