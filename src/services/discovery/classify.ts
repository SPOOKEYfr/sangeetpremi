/**
 * Track classification: assigns a DiscoveryCategory + ArtistRole from
 * title/description/channel signals. Pure functions — unit tested.
 */
import type { ArtistRole, DiscoveryCategory, Track } from '../../types';
import { extractVersionTags, normalizeArtistName, normalizeText } from '../../utils/normalize';

const SOUNDTRACK_RE = /\b(official video|official audio|lyrical video|from the film|from the movie|movie|film|soundtrack|ost)\b|\(from\b[^)]*\)|\bfrom\s+["“][^"”]+["”]\b/i;
const COLLAB_RE = /\b(x|&|feat\.?|ft\.?|with)\b\s+[A-Z][\w'’.-]+/;
const FEATURED_RE = /\b(feat\.?|ft\.?|featuring)\b/i;
const CHANNEL_TOPIC_RE = /\b(topic|vevo)\b/i;

interface ClassifyInput {
  title: string;
  description: string;
  channelTitle?: string;
  artistName: string;
}

/** Does the text mention the artist name (normalized)? */
export function mentionsArtist(text: string, artistName: string): boolean {
  const norm = normalizeText(text);
  const artist = normalizeArtistName(artistName);
  if (!artist) return false;
  return norm.includes(artist);
}

export function classifyCategory(input: ClassifyInput): DiscoveryCategory {
  const t = `${input.title} ${input.description}`;
  const tags = extractVersionTags(input.title);

  if (tags.includes('instrumental') || /\binstrumental\b/i.test(t)) return 'instrumental';
  if (tags.includes('cover')) return 'cover';
  if (tags.includes('remix')) return 'remix';
  if (tags.includes('unplugged')) return 'unplugged';
  if (tags.includes('acoustic')) return 'acoustic';
  if (tags.includes('live')) return 'live';
  if (SOUNDTRACK_RE.test(input.title) || /\b(movie|film|soundtrack)\b/i.test(input.title)) return 'soundtrack';
  if (tags.includes('duet')) return 'duet';
  if (COLLAB_RE.test(input.title) && !FEATURED_RE.test(input.title)) return 'collaboration';
  if (FEATURED_RE.test(input.title)) return 'featured';
  if (/\bsingle\b/i.test(input.title)) return 'single';
  if (/\balbum\b/i.test(input.title)) return 'album';
  return 'official';
}

/**
 * Determine the artist's role in this track.
 * Conservative by design: we never claim "primary" unless the artist is
 * named in the title or the channel matches.
 */
export function classifyRole(input: ClassifyInput, channelId?: string, artistChannelId?: string): ArtistRole {
  if (artistChannelId && channelId && artistChannelId === channelId) return 'primary';
  if (CHANNEL_TOPIC_RE.test(input.channelTitle ?? '')) return 'primary';
  if (FEATURED_RE.test(input.title)) return 'featured';
  if (SOUNDTRACK_RE.test(input.title) && mentionsArtist(input.title, input.artistName)) return 'playback';
  if (mentionsArtist(input.title, input.artistName) || mentionsArtist(input.description, input.artistName)) return 'primary';
  return 'other';
}

/** Relevance score 0..1 — used to rank and to filter weak candidates. */
export function relevanceScore(input: ClassifyInput & { channelId?: string; viewCount?: number }, artistChannelId?: string): number {
  let score = 0;
  const titleMentions = mentionsArtist(input.title, input.artistName);
  const descMentions = mentionsArtist(input.description, input.artistName);
  if (titleMentions) score += 0.5;
  if (descMentions) score += 0.15;
  if (artistChannelId && input.channelId === artistChannelId) score += 0.25;
  else if (CHANNEL_TOPIC_RE.test(input.channelTitle ?? '')) score += 0.2;
  if (input.viewCount && input.viewCount > 100_000) score += 0.1;
  if (titleMentions && classifyCategory(input) !== 'other') score += 0.05;
  return Math.min(1, score);
}

/** Convenience: classify a raw API video into a partial Track. */
export function classifyVideo(
  video: { videoId: string; title: string; description: string; channelId: string; channelTitle: string; thumbnail?: string; publishedAt?: string; durationSeconds?: number; viewCount?: number },
  artistName: string,
  artistChannelId?: string,
): Pick<Track, 'category' | 'role' | 'versionTags'> & { score: number } {
  const input: ClassifyInput & { channelId?: string; viewCount?: number } = {
    title: video.title,
    description: video.description,
    channelTitle: video.channelTitle,
    channelId: video.channelId,
    artistName,
    viewCount: video.viewCount,
  };
  return {
    category: classifyCategory(input),
    role: classifyRole(input, video.channelId, artistChannelId),
    versionTags: extractVersionTags(video.title),
    score: relevanceScore(input, artistChannelId),
  };
}
