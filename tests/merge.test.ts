import { describe, it, expect } from 'vitest';
import { mergeSessions, diffRefresh } from '../src/services/discovery/merge';
import { computeStats, relatedArtists } from '../src/services/discovery/stats';
import type { Artist, DiscoverySession, Track } from '../src/types';

function mkTrack(videoId: string, artist: string, extra: Partial<Track> = {}): Track {
  return {
    id: videoId, videoId, title: `Song ${videoId}`, normalizedTitle: videoId, artist,
    category: 'official', role: 'primary', versionTags: [], dedupeKey: '', isDuplicate: false,
    source: 'youtube', discoveredAt: 0, ...extra,
  };
}

function mkSession(artistName: string, tracks: Track[]): DiscoverySession {
  const artist: Artist = { id: artistName, name: artistName, normalizedName: artistName.toLowerCase() };
  return {
    id: `s-${artistName}`, artist, status: 'completed', depth: 'standard', categories: [],
    tracks, report: { query: artistName, candidatesFound: tracks.length, accepted: tracks.length, duplicatesRemoved: 0, excluded: 0, exclusionReasons: {}, startedAt: 0, finishedAt: 0 },
    createdAt: 0, updatedAt: 0,
  };
}

describe('mergeSessions (multi-artist)', () => {
  it('preserves per-track artist attribution', () => {
    const s1 = mkSession('Artist A', [mkTrack('a1', 'Artist A'), mkTrack('a2', 'Artist A')]);
    const s2 = mkSession('Artist B', [mkTrack('b1', 'Artist B')]);
    const merged = mergeSessions([s1, s2]);
    expect(merged.tracks.length).toBe(3);
    expect(merged.perArtistCounts).toEqual({ 'Artist A': 2, 'Artist B': 1 });
    const b1 = merged.tracks.find((t) => t.videoId === 'b1');
    expect(b1?.artist).toBe('Artist B'); // not reassigned
  });
  it('collapses cross-artist duplicates of the same shared recording', () => {
    const t1 = mkTrack('x1', 'Artist A', { title: 'Duet Song (Official)', viewCount: 10, category: 'duet' });
    const t2 = mkTrack('x2', 'Artist B', { title: 'Duet Song', viewCount: 999, category: 'duet' });
    const merged = mergeSessions([mkSession('Artist A', [t1]), mkSession('Artist B', [t2])]);
    expect(merged.tracks.length).toBe(1);
    expect(merged.tracks[0].videoId).toBe('x2'); // higher views kept
    expect(merged.duplicates.length).toBe(1);
  });
  it('never merges different artists\' unrelated songs that share a title', () => {
    const t1 = mkTrack('x1', 'Artist A', { title: 'Hello', category: 'official' });
    const t2 = mkTrack('x2', 'Artist B', { title: 'Hello', category: 'official' });
    const merged = mergeSessions([mkSession('Artist A', [t1]), mkSession('Artist B', [t2])]);
    expect(merged.tracks.length).toBe(2);
    expect(merged.duplicates.length).toBe(0);
  });
});

describe('diffRefresh (incremental discovery)', () => {
  it('returns only genuinely new tracks', () => {
    const existing = [mkTrack('a', 'A'), mkTrack('b', 'A')];
    const fresh = [mkTrack('a', 'A'), mkTrack('b', 'A'), mkTrack('c', 'A'), mkTrack('d', 'A', { isDuplicate: true })];
    const diff = diffRefresh(existing, fresh);
    expect(diff.newTracks.map((t) => t.videoId)).toEqual(['c']);
    expect(diff.stillPresent).toBe(2);
    expect(diff.notRefreshed).toBe(0);
  });
  it('never removes existing tracks', () => {
    const existing = [mkTrack('a', 'A'), mkTrack('gone', 'A')];
    const fresh = [mkTrack('a', 'A')];
    const diff = diffRefresh(existing, fresh);
    expect(diff.notRefreshed).toBe(1);
    expect(diff.newTracks.length).toBe(0);
  });
});

describe('stats + related artists', () => {
  it('computes verified stats from tracks', () => {
    const s = mkSession('A', [
      mkTrack('a', 'A', { category: 'official', publishedAt: '2015-03-01' }),
      mkTrack('b', 'A', { category: 'live', publishedAt: '2021-07-01' }),
      mkTrack('c', 'A', { category: 'collaboration', channelTitle: 'Other Channel', channelId: 'oc1', publishedAt: '2019-01-01' }),
    ]);
    const stats = computeStats(s);
    expect(stats.totalTracks).toBe(3);
    expect(stats.categoryCounts.official).toBe(1);
    expect(stats.yearRange).toEqual({ min: 2015, max: 2021, verified: true });
    expect(stats.collaborations[0]).toEqual({ channelTitle: 'Other Channel', count: 1 });
  });
  it('suggests only artists with an explainable reason', () => {
    const s = mkSession('A', [
      mkTrack('a', 'A'),
      mkTrack('b', 'A', { category: 'duet', channelTitle: 'Singer B', channelId: 'cb' }),
      mkTrack('c', 'A', { category: 'featured', channelTitle: 'Singer B', channelId: 'cb' }),
      mkTrack('d', 'A', { category: 'official', channelTitle: 'A Official', channelId: 'self' }),
    ]);
    s.artist.channelId = 'self';
    const rel = relatedArtists(s);
    expect(rel.length).toBe(1);
    expect(rel[0].name).toBe('Singer B');
    expect(rel[0].reason).toContain('2 discovered');
  });
});
