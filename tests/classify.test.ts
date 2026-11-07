import { describe, it, expect } from 'vitest';
import { classifyCategory, classifyRole, mentionsArtist } from '../src/services/discovery/classify';
import { extractVersionTags } from '../src/utils/normalize';
import { relevanceScore, classifyVideo } from '../src/services/discovery/classify';

describe('classifyCategory', () => {
  const base = { artistName: 'Arijit Singh' };
  it('detects soundtrack songs', () => {
    expect(classifyCategory({ ...base, title: 'Song from the film', description: '' })).toBe('soundtrack');
    expect(classifyCategory({ ...base, title: 'Kesariya (Official Video) - from Brahmastra', description: '' })).toBe('official');
  });
  it('detects live/remix/acoustic', () => {
    expect(classifyCategory({ ...base, title: 'X Live Performance', description: '' })).toBe('live');
    expect(classifyCategory({ ...base, title: 'X Official Remix', description: '' })).toBe('remix');
    expect(classifyCategory({ ...base, title: 'X Acoustic', description: '' })).toBe('acoustic');
  });
  it('defaults to official', () => {
    expect(classifyCategory({ ...base, title: 'Random Song', description: '' })).toBe('official');
  });
  it('detects cover', () => {
    expect(classifyCategory({ ...base, title: 'X Cover', description: '' })).toBe('cover');
  });
  it('detects instrumental', () => {
    expect(classifyCategory({ ...base, title: 'X Instrumental', description: '' })).toBe('instrumental');
  });
});

describe('classifyRole', () => {
  it('primary when channel matches artist channel', () => {
    expect(classifyRole({ title: 'Song', description: '', artistName: 'A' }, 'chan1', 'chan1')).toBe('primary');
  });
  it('featured when title says feat', () => {
    expect(classifyRole({ title: 'X feat. Arijit Singh', description: '', artistName: 'Arijit Singh' }, 'chanX', 'chanA')).toBe('featured');
  });
  it('playback for soundtrack with artist in title', () => {
    expect(classifyRole({ title: 'Arijit Singh Song from the film', description: '', artistName: 'Arijit Singh' }, undefined, undefined)).toBe('playback');
  });
  it('primary when artist name mentioned in title', () => {
    expect(classifyRole({ title: 'Arijit Singh Song', description: '', artistName: 'Arijit Singh' }, undefined, undefined)).toBe('primary');
  });
  it('primary when artist name mentioned in description', () => {
    expect(classifyRole({ title: 'Song', description: 'Song by Arijit Singh', artistName: 'Arijit Singh' }, undefined, undefined)).toBe('primary');
  });
  it('other when no match', () => {
    expect(classifyRole({ title: 'Unknown Song', description: '', artistName: 'Arijit Singh' }, undefined, undefined)).toBe('other');
  });
});

describe('mentionsArtist', () => {
  it('detects artist name in title', () => {
    expect(mentionsArtist('Arijit Singh Song', 'Arijit Singh')).toBe(true);
  });
  it('detects artist name in description', () => {
    expect(mentionsArtist('Song by Arijit Singh', 'Arijit Singh')).toBe(true);
  });
  it('returns false when artist name not present', () => {
    expect(mentionsArtist('Some other song', 'Arijit Singh')).toBe(false);
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
  it('detects acoustic', () => {
    expect(extractVersionTags('X Acoustic Version')).toContain('acoustic');
  });
  it('detects unplugged', () => {
    expect(extractVersionTags('X Unplugged')).toContain('unplugged');
  });
});

describe('relevanceScore', () => {
  it('should compute score without viewCount factor', () => {
    const score = relevanceScore(
      { title: 'Arijit Singh Song', description: 'Song by Arijit Singh', channelId: 'mbid1', artistName: 'Arijit Singh' },
      'mbid1'
    );
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should include description mention with non-matching channel', () => {
    const score = relevanceScore(
      { title: 'Song', description: 'Song by Arijit Singh', channelId: 'othermbid', artistName: 'Arijit Singh' },
      'mbid1'
    );
    expect(score).toBeCloseTo(0.15, 2);
  });

  it('should include channel match', () => {
    const score = relevanceScore(
      { title: 'Arijit Singh Song', description: '', channelId: 'mbid1', artistName: 'Arijit Singh' },
      'mbid1'
    );
    expect(score).toBeCloseTo(0.8, 2);
  });
});

describe('classifyVideo', () => {
  it('should return category, role and versionTags', () => {
    const result = classifyVideo(
      { videoId: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', description: '', artistName: 'Rick Astley' },
      'Rick Astley'
    );
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('versionTags');
    expect(result).toHaveProperty('score');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
