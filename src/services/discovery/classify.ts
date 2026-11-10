/**
 * Track classification: assigns a DiscoveryCategory + ArtistRole from
 * title/description/channel signals. Pure functions — unit tested.
 * MusicBrainz-first: no viewCount, no relevanceScore with viewCount factor,
 * no inferred category/role from YouTube aggregation.
 */
import type { ArtistRole, DiscoveryCategory, Track } from '../../types';
import { extractVersionTags, normalizeArtistName, normalizeText } from '../../utils/normalize';

/** Does the text mention the artist name (normalized)? */
export function mentionsArtist(text: string, artistName: string): boolean {
  const norm = normalizeText(text);
  const artist = normalizeArtistName(artistName);
  if (!artist) return false;
  return norm.includes(artist);
}

/** MusicBrainz-first: categorize without YouTube viewCount/aggregation. */
export function classifyCategory(input: { title: string; description: string }): DiscoveryCategory {
  const t = `${input.title} ${input.description}`;
  const tags = extractVersionTags(input.title);

  if (tags.includes('instrumental') || /\binstrumental\b/i.test(t)) return 'instrumental';
  if (tags.includes('cover')) return 'cover';
  if (tags.includes('remix')) return 'remix';
  if (tags.includes('unplugged')) return 'unplugged';
  if (tags.includes('acoustic')) return 'acoustic';
  if (tags.includes('live')) return 'live';
  if (/\b(movie|film|soundtrack)\b/i.test(input.title)) return 'soundtrack';
  if (tags.includes('duet')) return 'duet';
  if (/\b(x|&|feat\.?|ft\.?|with)\b\s+[A-Z][\w'’.-]+/i.test(input.title) && !/\b(feat\.?|ft\.?|featuring)\b/i.test(input.title)) return 'collaboration';
  return 'official';
}

/**
 * Determine the artist's role — conservative, no YouTube inference.
 * Per policy: no inferred category/role from YouTube data.
 */
export function classifyRole(input: { title: string; description: string; artistName: string }, channelId?: string, artistChannelId?: string): ArtistRole {
  // Primary only if channel explicitly matches
  if (artistChannelId && channelId && artistChannelId === channelId) return 'primary';
  // Featured if title says "feat"
  if (/feat\.?/i.test(input.title)) return 'featured';
  // Playback if soundtrack and artist mentioned in title
  if (/\b(movie|film|soundtrack)\b/i.test(input.title) && mentionsArtist(input.title, input.artistName)) return 'playback';
  // Primary if artist mentioned in title or description
  if (mentionsArtist(input.title, input.artistName) || mentionsArtist(input.description, input.artistName)) return 'primary';
  return 'other';
}

/** Relevance score 0..1 — no viewCount factor per policy. */
export function relevanceScore(input: { title: string; description: string; channelId?: string; artistName: string }, artistChannelId?: string): number {
  let score = 0;
  const titleMentions = mentionsArtist(input.title, input.artistName);
  const descMentions = mentionsArtist(input.description, input.artistName);
  if (titleMentions) score += 0.5;
  if (descMentions) score += 0.15;
  if (artistChannelId && input.channelId === artistChannelId) score += 0.25;
  // Removed viewCount factor per III.C.6
  if (titleMentions && classifyCategory(input) !== 'other') score += 0.05;
  return Math.min(1, score);
}

/** Convenience: classify a raw video into category/role/versionTags. */
export function classifyVideo(
  video: { videoId?: string; title: string; description: string; artistName?: string },
  artistName: string,
): Pick<Track, 'category' | 'role' | 'versionTags'> & { score: number } {
  const input = { title: video.title, description: video.description, artistName };
  return {
    category: classifyCategory(input),
    role: classifyRole(input),
    versionTags: extractVersionTags(video.title),
    score: relevanceScore(input),
  };
}
