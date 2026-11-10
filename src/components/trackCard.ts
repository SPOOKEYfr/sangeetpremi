/**
 * Canonical Track Card & Row renderer.
 * Designed for MusicBrainz canonical recordings, Cover Art Archive artwork,
 * release type tags, and honest YouTube playback status.
 */
import type { Track } from '../types';
import { formatDuration } from '../utils/normalize';
import { escapeHtml, watchUrl } from '../utils/sanitize';
import { icon } from './icons';
import {
  hasVerifiedRecordingStream,
  isVerifiedYouTubeId,
  type ReleaseAppearance,
} from '../features/discovery/musicbrainzModel';

export { isVerifiedYouTubeId, hasVerifiedRecordingStream };

export interface TrackCardOptions {
  selected?: boolean;
  showCheckbox?: boolean;
  onToggle?: (id: string) => void;
  extra?: string;
  verifiedStream?: boolean;
  /** True while an async MusicBrainz relationship lookup is in flight. */
  pendingStream?: boolean;
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

  // Album artwork thumbnail with clean fallback (NO inline onerror to comply with MV3 CSP)
  const thumbHtml = t.thumbnail
    ? `<img src="${escapeHtml(t.thumbnail)}" alt="" width="54" height="54" loading="lazy" class="track-thumb-img" style="border-radius:10px;object-fit:cover;box-shadow:var(--shadow-raised-sm);background:var(--bg-3);flex:none"/>`
    : `<div class="album-art-fallback" style="width:54px;height:54px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg-3),var(--bg-2));color:var(--accent-violet);flex:none">${icon('disc', 22)}</div>`;

  // Release appearances provenance
  const releases: ReleaseAppearance[] = Array.isArray(t.metadata?.releases) ? t.metadata.releases : [];
  const hasMultipleReleases = releases.length > 1;

  // Canonical tags (e.g. 'Album', '2000', 'Single') - filter out internal verified-stream marker
  const tags = (t.versionTags && t.versionTags.length ? t.versionTags : (t.category ? [t.category] : []))
    .filter((tag) => Boolean(tag) && tag !== 'verified-stream');
  const tagsHtml = tags
    .map((tag) => `<span class="badge muted" style="font-size:11px">${escapeHtml(tag)}</span>`)
    .join('');

  // Multi-release provenance toggle
  const multiReleaseToggleHtml = hasMultipleReleases
    ? `<button type="button" class="badge release-provenance-toggle" aria-expanded="false" aria-controls="provenance-${escapeHtml(t.id)}" title="Click to view all ${releases.length} release appearances" style="cursor:pointer;border:1px solid rgba(124,92,252,0.4);background:rgba(124,92,252,0.12);color:var(--text-1);font-size:11px;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:12px">${icon('layers', 12)}<span>${releases.length} releases</span><span class="provenance-chevron" style="font-size:9px">▼</span></button>`
    : '';

  // YouTube navigation controls: Honest "Unmapped" state with NO search fallback
  let streamActionHtml: string;
  if (isStreamVerified && (t.youtubeUrl || ytVideoId)) {
    const destinationUrl = t.youtubeUrl ?? watchUrl(ytVideoId!);
    streamActionHtml = `
      <a class="btn btn-ghost btn-sm yt-stream-btn" href="${escapeHtml(destinationUrl)}" target="_blank" rel="noopener" title="Stream verified YouTube video in new tab" aria-label="Stream verified video for ${escapeHtml(t.title)} on YouTube">
        <span style="color:#ff5555;display:flex;align-items:center">${icon('youtube', 15)}</span>
        <span style="font-size:12px">Watch ↗</span>
      </a>`;
  } else if (opts.pendingStream) {
    // The header counts this card as pending, so the card must say the same.
    streamActionHtml = `
      <span class="badge muted" style="font-size:10.5px;padding:3px 8px;opacity:0.75">Verifying…</span>`;
  } else {
    // Honest unavailable state with NO search fallback
    streamActionHtml = `
      <span class="badge muted" title="No verified YouTube stream mapping exists for this canonical recording" style="font-size:10.5px;padding:3px 8px;opacity:0.85">Unmapped</span>`;
  }

  let drawerHtml = '';
  if (hasMultipleReleases) {
    const appearanceRows = releases.map((app) => {
      const year = app.publishedAt ? app.publishedAt.slice(0, 4) : '';
      const thumb = app.thumbnail
        ? `<img src="${escapeHtml(app.thumbnail)}" alt="" width="38" height="38" loading="lazy" class="track-thumb-img" style="border-radius:8px;object-fit:cover;box-shadow:var(--shadow-raised-sm);background:var(--bg-3);flex:none"/>`
        : `<div class="album-art-fallback" style="width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg-3),var(--bg-2));color:var(--accent-violet);flex:none">${icon('disc', 16)}</div>`;
      const dateBadge = year
        ? `<span class="badge muted" style="font-size:10px;padding:1px 6px">${escapeHtml(year)}</span>`
        : `<span class="badge muted" style="font-size:10px;padding:1px 6px;opacity:0.7">Date unindexed</span>`;
      const appTags = (app.versionTags || [])
        .filter((tag: string) => Boolean(tag) && tag !== 'verified-stream')
        .map((tag: string) => `<span class="badge muted" style="font-size:10px;padding:1px 6px">${escapeHtml(tag)}</span>`)
        .join('');
      const duration = app.durationSeconds
        ? `<span style="color:var(--text-3);font-size:11px">· ${formatDuration(app.durationSeconds)}</span>`
        : '';
      const trackNum = app.trackNumber
        ? `<span style="color:var(--text-3);font-size:11px">Track ${app.trackNumber}</span>`
        : '';

      return `
        <div class="release-appearance-item" style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05)">
          ${thumb}
          <div style="flex:1;min-width:0;font-size:12px">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(app.releaseGroupTitle)}">${escapeHtml(app.releaseGroupTitle)}</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap">
              ${dateBadge}
              ${appTags}
              ${trackNum}
              ${duration}
            </div>
          </div>
          <a class="badge muted release-link" href="https://musicbrainz.org/release-group/${escapeHtml(app.releaseGroupId)}" target="_blank" rel="noopener" style="font-size:10px;padding:2px 7px;text-decoration:none" title="View release on MusicBrainz">Release ↗</a>
        </div>`;
    }).join('');

    drawerHtml = `
      <div class="release-provenance-drawer" id="provenance-${escapeHtml(t.id)}" role="region" aria-label="Release appearances for ${escapeHtml(t.title)}" style="display:none;width:100%;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);flex-direction:column;gap:8px" tabindex="-1">
        <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Release Appearances (${releases.length})</div>
        ${appearanceRows}
      </div>`;
  }

  return `
    <div class="track-card-main" style="display:flex;gap:14px;align-items:center;width:100%">
      ${check}
      <div style="position:relative;flex:none;width:54px;height:54px;display:flex;align-items:center;justify-content:center">
        ${thumbHtml}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
        <div style="color:var(--text-3);font-size:12px;margin-top:2px;display:flex;gap:7px;align-items:center;flex-wrap:wrap">
          <span style="color:var(--text-2);font-weight:500">${escapeHtml(t.artist)}</span>
          ${hasMultipleReleases ? multiReleaseToggleHtml : (t.channelTitle ? `<span style="color:var(--text-3)">· ${escapeHtml(t.channelTitle)}</span>` : '')}
          ${tagsHtml}
          ${t.durationSeconds ? `<span style="color:var(--text-3)">· ${formatDuration(t.durationSeconds)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex:none;align-items:center">
        ${opts.extra ?? ''}
        <div class="track-stream-action" style="display:flex;align-items:center">
          ${streamActionHtml}
        </div>
      </div>
    </div>
    ${drawerHtml}`;
}

export function trackCard(t: Track, opts: TrackCardOptions = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clay clay-sm track-card fade-in';
  el.dataset.id = t.id;
  el.dataset.videoId = t.youtubeVideoId ?? t.videoId ?? t.id;
  el.setAttribute('role', 'article');
  el.setAttribute('aria-label', `${t.title} by ${t.artist}`);
  el.style.cssText =
    'display:flex;flex-direction:column;gap:0;padding:12px 14px;align-items:stretch;transition:transform .15s, box-shadow .15s;';
  if (opts.selected) el.style.outline = '2px solid var(--accent-violet)';

  el.innerHTML = trackCardHtml(t, opts);

  // Wire up release provenance toggle if drawer exists
  const toggleBtn = el.querySelector('.release-provenance-toggle') as HTMLButtonElement | null;
  const drawer = el.querySelector('.release-provenance-drawer') as HTMLElement | null;
  if (toggleBtn && drawer) {
    const toggleDrawer = (open?: boolean) => {
      const isCurrentlyOpen = drawer.style.display !== 'none';
      const shouldOpen = open ?? !isCurrentlyOpen;
      drawer.style.display = shouldOpen ? 'flex' : 'none';
      toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      const arrow = toggleBtn.querySelector('.provenance-chevron');
      if (arrow) arrow.textContent = shouldOpen ? '▲' : '▼';
      if (!shouldOpen && document.activeElement && drawer.contains(document.activeElement)) {
        toggleBtn.focus();
      }
    };

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });

    toggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.style.display !== 'none') {
        e.preventDefault();
        e.stopPropagation();
        toggleDrawer(false);
      }
    });

    drawer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        toggleDrawer(false);
      }
    });
  }

  // Proper event-based image error handler for main and appearance thumbs (MV3 CSP compliant)
  el.querySelectorAll('.track-thumb-img').forEach((imgNode) => {
    const img = imgNode as HTMLImageElement;
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'album-art-fallback';
      const w = parseInt(img.getAttribute('width') || '54', 10);
      const isSmall = w < 45;
      fallback.style.cssText =
        `width:${w}px;height:${w}px;border-radius:${isSmall ? '8px' : '10px'};display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg-3),var(--bg-2));color:var(--accent-violet);flex:none`;
      fallback.innerHTML = icon('disc', isSmall ? 16 : 22);
      img.replaceWith(fallback);
    });
  });

  // Stop propagation on any links within card
  el.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

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
    if ((e.target as HTMLElement).closest('a,button,.release-provenance-drawer')) return;
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
