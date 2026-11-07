import { describe, it, expect } from 'vitest';
import { deduplicate, dedupeKeyOf } from '../src/services/discovery/dedup';
import type { Track } from '../src/types';

function track(videoId: string, title: string, viewCount = 0): Track {
  return {
    id: videoId, videoId, title, normalizedTitle: title.toLowerCase(), artist: 'Arijit Singh',
    category: 'official', role: 'primary', versionTags: [], dedupeKey: '', isDuplicate: false,
    youtubeVerified: false,
    lastUpdated: Date.now(),
    source: 'youtube', discoveredAt: 0, viewCount,
  };
}

describe('dedupeKeyOf', () => {
  it('same song different upload noise -> same key in balanced mode', () => {
    expect(dedupeKeyOf('Tum Hi Ho (Official Video)', 'Arijit Singh'))
      .toBe(dedupeKeyOf('Tum Hi Ho Song | Full Audio', 'arijit singh'));
  });
  it('live version gets a different key in balanced mode', () => {
    expect(dedupeKeyOf('Tum Hi Ho', 'Arijit Singh')).not.toBe(dedupeKeyOf('Tum Hi Ho (Live)', 'Arijit Singh'));
  });
  it('strict mode collapses versions', () => {
    expect(dedupeKeyOf('Tum Hi Ho', 'Arijit Singh', false)).toBe(dedupeKeyOf('Tum Hi Ho (Live)', 'Arijit Singh', false));
  });
});

describe('deduplicate', () => {
  it('keeps the most-viewed upload as representative', () => {
    const a = track('a', 'Tum Hi Ho (Official Video)', 100);
    const b = track('b', 'Tum Hi Ho Song', 5000);
    const res = deduplicate([a, b], 'balanced');
    expect(res.kept.map((t) => t.videoId)).toEqual(['b']);
    expect(res.duplicates.map((t) => t.videoId)).toEqual(['a']);
    expect(res.duplicates[0].canonicalId).toBe('b');
    expect(res.removedCount).toBe(1);
  });
  it('keeps alternate versions separate in balanced mode', () => {
    const res = deduplicate([track('a', 'Song'), track('b', 'Song (Live)')], 'balanced');
    expect(res.kept.length).toBe(2);
    expect(res.removedCount).toBe(0);
  });
  it('collapses alternate versions in strict mode', () => {
    const res = deduplicate([track('a', 'Song', 10), track('b', 'Song (Live)', 999)], 'strict');
    expect(res.kept.length).toBe(1);
    expect(res.kept[0].videoId).toBe('b');
  });
  it('off mode keeps everything', () => {
    const res = deduplicate([track('a', 'Song'), track('b', 'Song')], 'off');
    expect(res.kept.length).toBe(2);
  });
});
