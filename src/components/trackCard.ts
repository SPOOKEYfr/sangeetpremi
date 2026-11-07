/** Track card / row renderer shared by discovery, library and playlist views. */
import type { Track } from '../types';
import { DISCOVERY_CATEGORIES } from '../types';
import { formatDuration } from '../utils/normalize';
import { watchUrl } from '../utils/sanitize';
import { escapeHtml } from '../utils/sanitize';
import { icon } from './icons';

export function categoryLabel(c: Track['category']): string {
  return DISCOVERY_CATEGORIES.find((x) => x.id === c)?.label ?? c;
}

export function trackCard(
  t: Track,
  opts: { selected?: boolean; showCheckbox?: boolean; onToggle?: (id: string) => void; extra?: string } = {},
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clay clay-sm track-card fade-in';
  el.dataset.videoId = t.videoId;
  el.setAttribute('role', 'article');
  el.setAttribute('aria-label', `${t.title} by ${t.artist}`);
  el.style.cssText =
    'display:flex;gap:14px;padding:12px;align-items:center;transition:transform .15s, box-shadow .15s;';
  if (opts.selected) el.style.outline = '2px solid var(--accent-violet)';

  const check = opts.showCheckbox
    ? `<button class="track-check" role="checkbox" aria-checked="${opts.selected ? 'true' : 'false'}" aria-label="Select ${escapeHtml(t.title)}" title="Select track" style="width:22px;height:22px;border-radius:8px;border:1.5px solid ${opts.selected ? 'var(--accent-violet)' : 'rgba(255,255,255,.2)'};background:${opts.selected ? 'var(--accent-violet)' : 'transparent'};color:#14121f;display:flex;align-items:center;justify-content:center;flex:none">${opts.selected ? icon('check', 13) : ''}</button>`
    : '';

  el.innerHTML = `
    ${check}
    <div style="position:relative;flex:none">
      <img src="${escapeHtml(t.thumbnail ?? '')}" alt="" width="104" height="58" loading="lazy"
        style="border-radius:12px;object-fit:cover;box-shadow:var(--shadow-raised-sm);background:var(--bg-3)"
        onerror="this.style.visibility='hidden'"/>
      ${t.durationSeconds ? `<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.75);color:#fff;font-size:10.5px;padding:1px 6px;border-radius:6px;font-weight:600">${formatDuration(t.durationSeconds)}</span>` : ''}
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
      <div style="color:var(--text-3);font-size:12px;margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span>${escapeHtml(t.channelTitle ?? t.artist)}</span>
        <span class="badge muted">${escapeHtml(categoryLabel(t.category))}</span>
        ${t.isDuplicate ? '<span class="badge warm">duplicate</span>' : ''}
        ${t.versionTags.map((v) => `<span class="badge teal">${escapeHtml(v)}</span>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:6px;flex:none;align-items:center">
      ${opts.extra ?? ''}
      <a class="btn btn-ghost btn-sm" href="${watchUrl(t.videoId)}" target="_blank" rel="noopener" title="Open on YouTube" aria-label="Open ${escapeHtml(t.title)} on YouTube">${icon('external', 15)}</a>
    </div>`;

  if (opts.showCheckbox) {
    const checkBtn = el.querySelector('.track-check') as HTMLButtonElement | null;
    checkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onToggle?.(t.videoId);
    });
    checkBtn?.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        opts.onToggle?.(t.videoId);
      }
    });
  }

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    opts.onToggle?.(t.videoId);
  });
  return el;
}

/** Animated skeleton row for track lists. */
export function trackSkeleton(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clay clay-sm track-skeleton';
  el.innerHTML = `
    <div class="skeleton sk-thumb"></div>
    <div class="sk-info">
      <div class="skeleton sk-title"></div>
      <div class="skeleton sk-sub"></div>
    </div>
    <div class="skeleton sk-btn"></div>
  `;
  return el;
}
