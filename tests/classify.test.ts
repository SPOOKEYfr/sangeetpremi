import { describe, it, expect } from 'vitest';
import { classifyCategory, classifyRole, mentionsArtist, relevanceScore } from '../src/services/discovery/classify';

describe('classifyCategory', () => {
  const base = { artistName: 'Arijit Singh' };
  it('detects soundtrack songs', () => {
    expect(classifyCategory({ ...base, title: 'Kesariya (Official Video) - from Brahmastra', description: '' })).toBe('soundtrack');
    expect(classifyCategory({ ...base, title: 'Song from the film', description: '' })).toBe('soundtrack');
  });
  it('detects live/remix/acoustic', () => {
    expect(classifyCategory({ ...base, title: 'X Live Performance', description: '' })).toBe('live');
    expect(classifyCategory({ ...base, title: 'X Official Remix', description: '' })).toBe('remix');
    expect(classifyCategory({ ...base, title: 'X Acoustic', description: '' })).toBe('acoustic');
  });
  it('detects featured appearances', () => {
    expect(classifyCategory({ ...base, title: 'Other Artist feat. Arijit Singh', description: '' })).toBe('featured');
  });
  it('defaults to official', () => {
    expect(classifyCategory({ ...base, title: 'Random Song', description: '' })).toBe('official');
  });
});

describe('classifyRole', () => {
  it('primary when channel matches artist channel', () => {
    expect(classifyRole({ title: 'Song', description: '', artistName: 'A' }, 'chan1', 'chan1')).toBe('primary');
  });
  it('featured when title says feat', () => {
    expect(classifyRole({ title: 'X feat. Arijit Singh', description: '', artistName: 'Arijit Singh' }, 'chanX', 'chanA')).toBe('featured');
  });
  it('playback for movie songs naming the artist', () => {
    expect(classifyRole({ title: 'Kesariya (from Brahmastra) Arijit Singh', description: '', artistName: 'Arijit Singh' }, 'chanM', 'chanA')).toBe('playback');
  });
});

describe('mentionsArtist / relevanceScore', () => {
  it('matches normalized names in text', () => {
    expect(mentionsArtist('Song by ARIJIT SINGH official', 'arijit singh')).toBe(true);
    expect(mentionsArtist('Song by someone else', 'arijit singh')).toBe(false);
  });
  it('scores higher when title mentions artist', () => {
    const good = relevanceScore({ title: 'Arijit Singh - Tum Hi Ho', description: '', artistName: 'Arijit Singh' });
    const bad = relevanceScore({ title: 'Random unrelated', description: 'nothing', artistName: 'Arijit Singh' });
    expect(good).toBeGreaterThan(bad);
  });
});
