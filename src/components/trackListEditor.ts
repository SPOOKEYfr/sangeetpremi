/**
 * Editable, reorderable track list used by the playlist builder.
 *
 * - HTML5 drag-and-drop reordering with a clear drop indicator
 * - Keyboard-accessible reordering (↑/↓ buttons on each row, focusable)
 * - Checkboxes + bulk selection handled by the parent via callbacks
 * - Removal is explicit (per-row ✕ or "remove selected") — drag never deletes
 * - Order changes are reported upward and persisted by the store
 */
import type { Track } from '../types';
import { formatDuration } from '../utils/normalize';
import { watchUrl, escapeHtml } from '../utils/sanitize';
import { icon } from './icons';
import { categoryLabel } from './trackCard';

export interface EditorCallbacks {
  onOrderChange: (videoIds: string[]) => void;
  onRemove: (videoId: string) => void;
  onToggleSelect: (videoId: string) => void;
  onOpen?: (videoId: string) => void;
}

export class TrackListEditor {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private tracks: Track[] = [];
  private selected = new Set<string>();
  private dragIndex = -1;
  private dropIndex = -1;
  private cb: EditorCallbacks;

  constructor(cb: EditorCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    this.root.appendChild(this.listEl);
  }

  setTracks(tracks: Track[], selected?: Set<string>): void {
    this.tracks = tracks;
    if (selected) this.selected = new Set(selected);
    this.render();
  }

  getSelected(): Set<string> {
    return new Set(this.selected);
  }

  setSelectedAll(): void {
    this.selected = new Set(this.tracks.map((t) => t.videoId));
    this.render();
  }

  clearSelected(): void {
    this.selected.clear();
    this.render();
  }

  private render(): void {
    this.listEl.innerHTML = '';
    if (!this.tracks.length) {
      this.listEl.innerHTML = `<div class="clay-inset empty-state" style="padding:30px"><div class="glyph">🎧</div><p>No tracks here.</p></div>`;
      return;
    }
    this.tracks.forEach((t, i) => this.listEl.appendChild(this.renderRow(t, i)));
  }

  private renderRow(t: Track, i: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'clay clay-sm fade-in track-row';
    row.dataset.videoId = t.videoId;
    row.dataset.index = String(i);
    row.draggable = true;
    row.style.cssText = 'display:flex;gap:12px;align-items:center;padding:10px 12px;position:relative;transition:transform .12s, box-shadow .12s, outline .12s';
    if (this.selected.has(t.videoId)) row.style.outline = '2px solid var(--accent)';
    if (i === this.dropIndex && this.dragIndex !== -1 && this.dragIndex !== i) {
      row.style.boxShadow = '0 -3px 0 0 var(--accent-2), var(--shadow-raised-sm)';
    }

    const checked = this.selected.has(t.videoId);
    row.innerHTML = `
      <button class="row-check" title="Select" aria-label="Select track" style="width:22px;height:22px;border-radius:8px;border:1.5px solid ${checked ? 'var(--accent)' : 'rgba(255,255,255,.2)'};background:${checked ? 'var(--accent)' : 'transparent'};color:#14121f;display:flex;align-items:center;justify-content:center;flex:none">${checked ? icon('check', 13) : ''}</button>
      <button class="row-drag" title="Drag to reorder" aria-label="Drag to reorder" style="cursor:grab;background:none;border:none;color:var(--text-3);padding:4px;flex:none">${icon('drag', 16)}</button>
      <div style="position:relative;flex:none">
        <img src="${escapeHtml(t.thumbnail ?? '')}" alt="" width="96" height="54" loading="lazy" style="border-radius:12px;object-fit:cover;background:var(--bg-3);box-shadow:var(--shadow-raised-sm)" onerror="this.style.visibility='hidden'"/>
        ${t.durationSeconds ? `<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.75);color:#fff;font-size:10px;padding:1px 6px;border-radius:6px">${formatDuration(t.durationSeconds)}</span>` : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
        <div style="color:var(--text-3);font-size:11.5px;margin-top:2px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span>${escapeHtml(t.channelTitle ?? t.artist)}</span>
          <span class="badge muted">${escapeHtml(categoryLabel(t.category))}</span>
          ${t.artist ? `<span class="badge teal">${escapeHtml(t.artist)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex:none;align-items:center">
        <button class="btn btn-ghost btn-sm row-up" title="Move up (keyboard accessible)" aria-label="Move up" ${i === 0 ? 'disabled' : ''} style="padding:6px 8px">↑</button>
        <button class="btn btn-ghost btn-sm row-down" title="Move down (keyboard accessible)" aria-label="Move down" ${i === this.tracks.length - 1 ? 'disabled' : ''} style="padding:6px 8px">↓</button>
        <a class="btn btn-ghost btn-sm" href="${watchUrl(t.videoId)}" target="_blank" rel="noopener" title="Open on YouTube" aria-label="Open on YouTube">${icon('external', 14)}</a>
        <button class="btn btn-ghost btn-sm row-rm" title="Remove from playlist" aria-label="Remove from playlist" style="padding:6px 8px">${icon('x', 14)}</button>
      </div>`;

    row.querySelector('.row-check')!.addEventListener('click', () => {
      this.cb.onToggleSelect(t.videoId);
    });
    row.querySelector('.row-rm')!.addEventListener('click', () => this.cb.onRemove(t.videoId));
    row.querySelector('.row-up')!.addEventListener('click', () => this.move(i, i - 1));
    row.querySelector('.row-down')!.addEventListener('click', () => this.move(i, i + 1));

    // --- drag & drop ---
    row.addEventListener('dragstart', (e) => {
      this.dragIndex = i;
      row.style.opacity = '0.45';
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', t.videoId);
    });
    row.addEventListener('dragend', () => {
      this.dragIndex = -1;
      this.dropIndex = -1;
      row.style.opacity = '1';
      this.render();
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      if (this.dropIndex !== i) {
        this.dropIndex = i;
        this.render();
        // restore drag styling on the dragged row after re-render
        const dragged = this.listEl.querySelector(`[data-index="${this.dragIndex}"]`);
        if (dragged) (dragged as HTMLElement).style.opacity = '0.45';
      }
    });
    row.addEventListener('dragleave', () => {
      if (this.dropIndex === i) this.dropIndex = -1;
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.dragIndex >= 0 && this.dragIndex !== i) this.move(this.dragIndex, i);
      this.dragIndex = -1;
      this.dropIndex = -1;
    });
    return row;
  }

  /** Move track from index `from` to index `to` and notify. */
  private move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return;
    const next = [...this.tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.tracks = next;
    this.cb.onOrderChange(next.map((t) => t.videoId));
    this.render();
  }
}
