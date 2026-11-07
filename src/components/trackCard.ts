/**
 * Canonical Track Card & Row renderer.
 * Designed for MusicBrainz canonical recordings, Cover Art Archive artwork,
 * release type tags, and honest YouTube playback status.
 */
import type { Track } from '../types';
import { formatDuration } from '../utils/normalize';
import { escapeHtml, watchUrl } from '../utils/sanitize';
import { icon } from './icons';
import { hasVerifiedRecordingStream, isVerifiedYouTubeId } from '../features/discovery/musicbrainzModel';

export { isVerifiedYouTubeId, hasVerifiedRecordingStream };

export interface TrackCardOptions {
  selected?: boolean;
  showCheckbox?: boolean;
  onToggle?: (id: string) => void;
  extra?: string;
  verifiedStream?: boolean;
}

/** Generates HTML string representation for a canonical track card. */
export function trackCardHtml(t: Track, opts: TrackCardOptions = {}): string {
  const check = opts.showCheckbox
    ? `<button class="track-check" role="checkbox" aria-checked="${opts.selected ? 'true' : 'false'}" aria-label="Select ${escapeHtml(t.title)}" title="Select track" style="width:22px;height:22px;border-radius:8px;border:1.5px solid ${opts.selected ? 'var(--accent-violet)' : 'rgba(255,255,255,.2)'};background:${opts.selected ? 'var(--accent-violet)' : 'transparent'};color:#14121f;display:flex;align-items:center;justify-content:center;flex:none">${opts.selected ? icon('check', 13) : ''}</button>`
    : '';

  // A valid YouTube video ID is NOT proof of a verified recording relationship.
  // Only display "Watch on YouTube" when a genuine verified relationship exists.
  const isStreamVerified = opts.verifiedStream ?? hasVerifiedRecordingStream(t);
  const ytVideoId = t.youtubeVideoId ?? t.videoId;

  // Album artwork thumbnail with vinyl/disc fallback SVG on error
  const thumbHtml = t.thumbnail
    ? `<img src="${escapeHtml(t.thumbnail)}" alt="" width="54" height="54" loading="lazy"
        style="border-radius:10px;object-fit:cover;box-shadow:var(--shadow-raised-sm);background:var(--bg-3);flex:none"
        onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'album-art-fallback\\' style=\\'width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg-3),var(--bg-2));color:var(--accent-violet)\\'>${icon('disc', 22)}</div>'"/>`
    : `<div class="album-art-fallback" style="width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg-3),var(--bg-2));color:var(--accent-violet);flex:none">${icon('disc', 22)}</div>`;

  // Canonical tags (e.g. 'Album', '2000', 'Single') - filter out internal verified-stream marker
  const tags = (t.versionTags && t.versionTags.length ? t.versionTags : (t.category ? [t.category] : []))
    .filter((tag) => Boolean(tag) && tag !== 'verified-stream');
  const tagsHtml = tags
    .map((tag) => `<span class="badge muted" style="font-size:11px">${escapeHtml(tag)}</span>`)
    .join('');

  // YouTube navigation controls: Honest "Unmapped" state with NO search fallback
  let streamActionHtml: string;
  if (isStreamVerified && ytVideoId) {
    streamActionHtml = `
      <a class="btn btn-ghost btn-sm yt-stream-btn" href="${escapeHtml(t.youtubeUrl ?? watchUrl(ytVideoId))}" target="_blank" rel="noopener" title="Stream verified YouTube video in new tab" aria-label="Stream verified video for ${escapeHtml(t.title)} on YouTube">
        <span style="color:#ff5555;display:flex;align-items:center">${icon('youtube', 15)}</span>
        <span style="font-size:12px">Watch ↗</span>
      </a>`;
  } else {
    // Honest unavailable state with NO search fallback
    streamActionHtml = `
      <span class="badge muted" title="No verified YouTube stream mapping exists for this canonical recording" style="font-size:10.5px;padding:3px 8px;opacity:0.85">Unmapped</span>`;
  }

  return `
    ${check}
    <div style="position:relative;flex:none;width:54px;height:54px;display:flex;align-items:center;justify-content:center">
      ${thumbHtml}
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
      <div style="color:var(--text-3);font-size:12px;margin-top:2px;display:flex;gap:7px;align-items:center;flex-wrap:wrap">
        <span style="color:var(--text-2);font-weight:500">${escapeHtml(t.artist)}</span>
        ${t.channelTitle ? `<span style="color:var(--text-3)">· ${escapeHtml(t.channelTitle)}</span>` : ''}
        ${tagsHtml}
        ${t.durationSeconds ? `<span style="color:var(--text-3)">· ${formatDuration(t.durationSeconds)}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex:none;align-items:center">
      ${opts.extra ?? ''}
      ${streamActionHtml}
    </div>`;
}

export function trackCard(t: Track, opts: TrackCardOptions = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clay clay-sm track-card fade-in';
  el.dataset.id = t.id;
  el.dataset.videoId = t.youtubeVideoId ?? t.videoId ?? t.id;
  el.setAttribute('role', 'article');
  el.setAttribute('aria-label', `${t.title} by ${t.artist}`);
  el.style.cssText =
    'display:flex;gap:14px;padding:12px 14px;align-items:center;transition:transform .15s, box-shadow .15s;';
  if (opts.selected) el.style.outline = '2px solid var(--accent-violet)';

  el.innerHTML = trackCardHtml(t, opts);

  if (opts.showCheckbox) {
    const checkBtn = el.querySelector('.track-check') as HTMLButtonElement | null;
    checkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onToggle?.(t.id);
    });
    checkBtn?.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        opts.onToggle?.(t.id);
      }
    });
  }

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    opts.onToggle?.(t.id);
  });

  return el;
}

/** Animated skeleton row for track lists matching square album art. */
export function trackSkeleton(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clay clay-sm track-skeleton';
  el.innerHTML = `
    <div class="skeleton sk-thumb" style="width:54px;height:54px;border-radius:10px;flex:none"></div>
    <div class="sk-info">
      <div class="skeleton sk-title" style="width:50%;height:14px"></div>
      <div class="skeleton sk-sub" style="width:30%;height:12px"></div>
    </div>
    <div class="skeleton sk-btn" style="width:72px;height:30px;border-radius:8px;flex:none"></div>
  `;
  return el;
}
