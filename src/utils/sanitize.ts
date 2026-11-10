/**
 * Output sanitization. The app renders data from external APIs, so all
 * dynamic strings are either rendered via textContent (preferred) or passed
 * through escapeHtml when innerHTML is unavoidable.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const URL_RE = /^https?:\/\/(www\.|music\.)?youtube\.com\/watch\?|https?:\/\/youtu\.be\//i;

/** Validate a YouTube video id (11 chars, URL-safe alphabet). */
export function isValidVideoId(id: string): boolean {
  return VIDEO_ID_RE.test(id);
}

/** Extract a video id from a YouTube watch/share URL, or return null. */
export function videoIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  if (!URL_RE.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith('youtu.be')) {
      const id = u.pathname.slice(1).split('/')[0];
      return isValidVideoId(id) ? id : null;
    }
    const id = u.searchParams.get('v');
    return id && isValidVideoId(id) ? id : null;
  } catch {
    return null;
  }
}

/** Build the canonical watch URL for a video id. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Build a URL that opens a list of videos as a temporary playlist. */
export function playlistUrl(videoIds: string[]): string {
  if (videoIds.length === 0) return 'https://www.youtube.com/';
  const first = encodeURIComponent(videoIds[0]);
  if (videoIds.length === 1) {
    return watchUrl(videoIds[0]);
  }
  const rest = videoIds.slice(1, 49).map((id) => `&video_ids=${encodeURIComponent(id)}`).join('');
  return `https://www.youtube.com/watch?v=${first}&listType=user_uploads${rest}`;
}
