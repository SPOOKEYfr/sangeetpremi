import { describe, it, expect } from 'vitest';
import { filterByCategory, filterByLanguage, filterByYearRange, searchTracks, sortTracks } from '../src/services/discovery/filters';
import type { Track } from '../src/types';

function track(partial: Partial<Track> & { videoId: string }): Track {
  return {
    id: partial.videoId, title: partial.videoId, normalizedTitle: partial.videoId,
    artist: 'A', category: 'official', role: 'primary', versionTags: [], dedupeKey: '',
    isDuplicate: false, source: 'youtube', discoveredAt: 0, ...partial,
  };
}

const tracks: Track[] = [
  track({ videoId: 'a', title: 'Hindi गाना', category: 'official', publishedAt: '2019-05-01', viewCount: 100 }),
  track({ videoId: 'b', title: 'English Song', category: 'live', publishedAt: '2023-01-15', viewCount: 900 }),
  track({ videoId: 'c', title: 'Old Track', category: 'single', publishedAt: '2008-12-01', viewCount: 500 }),
  track({ videoId: 'd', title: 'No Date', category: 'remix' }),
];

describe('filterByCategory', () => {
  it('filters by category list', () => {
    expect(filterByCategory(tracks, ['live']).map((t) => t.videoId)).toEqual(['b']);
  });
  it('returns all for all/empty', () => {
    expect(filterByCategory(tracks, 'all').length).toBe(4);
    expect(filterByCategory(tracks, []).length).toBe(4);
  });
});

describe('filterByYearRange', () => {
  it('filters inclusive range using verified publishedAt', () => {
    expect(filterByYearRange(tracks, 2010, 2020).map((t) => t.videoId)).toEqual(['a']);
  });
  it('excludes tracks without a date rather than guessing', () => {
    expect(filterByYearRange(tracks, 2000, 2030).map((t) => t.videoId).sort()).toEqual(['a', 'b', 'c']);
  });
  it('no range returns everything', () => {
    expect(filterByYearRange(tracks).length).toBe(4);
  });
});

describe('filterByLanguage', () => {
  it('filters by detected language', () => {
    expect(filterByLanguage(tracks, 'hi').map((t) => t.videoId)).toEqual(['a']);
  });
});

describe('searchTracks / sortTracks', () => {
  it('searches title/artist/channel', () => {
    expect(searchTracks(tracks, 'english').map((t) => t.videoId)).toEqual(['b']);
  });
  it('sorts by view count desc and title asc', () => {
    expect(sortTracks(tracks, 'viewCount').map((t) => t.videoId)).toEqual(['b', 'c', 'a', 'd']);
    expect(sortTracks(tracks, 'title', 'asc').map((t) => t.videoId)[0]).toBe('b'); // "English Song" first
  });
});
