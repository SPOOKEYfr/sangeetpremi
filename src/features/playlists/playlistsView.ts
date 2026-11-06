/** Playlist builder & manager. */
import { store } from '../../state/store';
import { trackCard } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { icon } from '../../components/icons';
import { escapeHtml, playlistUrl, watchUrl } from '../../utils/sanitize';
import { loadConfig } from '../../services/config';
import { YouTubeClient } from '../../services/youtube/api';
import { authorize, getValidToken } from '../../services/youtube/oauth';
import type { Playlist } from '../../types';

export function renderPlaylists(el: HTMLElement, params: URLSearchParams): void {
  const playlists = Object.values(store.library?.playlists ?? {}).sort((a, b) => b.updatedAt - a.updatedAt);
  const openId = params.get('id');

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">
      <h2 style="flex:1">Playlists</h2>
      <button class="btn btn-primary" id="pl-new">${icon('plus', 16)} New playlist</button>
    </div>
    <div style="display:grid;grid-template-columns:280px 1fr;gap:22px;align-items:start">
      <div id="pl-list" style="display:flex;flex-direction:column;gap:10px"></div>
      <div id="pl-detail"></div>
    </div>
  </div>`;

  const listEl = el.querySelector('#pl-list') as HTMLElement;
  const detailEl = el.querySelector('#pl-detail') as HTMLElement;

  if (!playlists.length) {
    listEl.innerHTML = `<div class="clay clay-sm empty-state" style="padding:30px"><div class="glyph">📀</div><p style="font-size:13px">No playlists yet.<br/>Discover an artist and create one.</p></div>`;
  }

  for (const p of playlists) {
    const b = document.createElement('button');
    b.className = `clay clay-sm pl-item${p.id === openId ? '' : ''}`;
    b.style.cssText = 'padding:14px 16px;text-align:left;border:none;display:flex;justify-content:space-between;align-items:center;gap:8px';
    if (p.id === openId) b.style.outline = '2px solid var(--accent)';
    b.innerHTML = `<span style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</span><span class="badge muted">${p.trackVideoIds.length}</span>`;
    b.addEventListener('click', () => renderPlaylists(el, new URLSearchParams({ id: p.id })));
    listEl.appendChild(b);
  }

  el.querySelector('#pl-new')?.addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `<label class="label">Playlist name</label><input id="np-name" class="input" placeholder="My playlist"/>`;
    openModal('New playlist', body, [
      {
        label: 'Create',
        kind: 'primary',
        onClick: () => {
          const name = (body.querySelector('#np-name') as HTMLInputElement).value.trim();
          if (!name) return;
          const p = store.createPlaylist(name);
          toast(`Playlist “${name}” created`, 'success');
          renderPlaylists(el, new URLSearchParams({ id: p.id }));
        },
      },
      { label: 'Cancel', kind: 'ghost', onClick: () => {} },
    ]);
  });

  const current = openId ? store.library?.playlists[openId] : playlists[0];
  if (current) renderDetail(detailEl, current);
  else detailEl.innerHTML = `<div class="clay clay-sm empty-state" style="padding:40px"><div class="glyph">🎵</div><h3>Select a playlist</h3></div>`;
}

function renderDetail(el: HTMLElement, p: Playlist): void {
  const all = store.allTracks();
  const tracks = p.trackVideoIds.map((id) => all.find((t) => t.videoId === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const missing = p.trackVideoIds.length - tracks.length;

  el.innerHTML = `
  <section class="clay" style="padding:24px 28px">
    <input id="pd-name" class="input" style="font-size:18px;font-weight:700;margin-bottom:10px" value="${escapeHtml(p.name)}"/>
    <textarea id="pd-desc" class="textarea" placeholder="Description…">${escapeHtml(p.description ?? '')}</textarea>
    <div style="display:flex;gap:10px;margin:16px 0;flex-wrap:wrap;align-items:center">
      <span class="badge">${p.trackVideoIds.length} tracks</span>
      ${p.youtubePlaylistId ? `<span class="badge teal">on YouTube</span>` : ''}
      ${missing ? `<span class="badge warm">${missing} not in library</span>` : ''}
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" id="pd-save">${icon('check', 15)} Save</button>
      <button class="btn btn-ghost btn-sm" id="pd-dup">${icon('plus', 15)} Duplicate</button>
      <button class="btn btn-ghost btn-sm" id="pd-export">${icon('download', 15)} Export</button>
      <button class="btn btn-ghost btn-sm" id="pd-del">${icon('trash', 15)} Delete</button>
      <a class="btn btn-ghost btn-sm" id="pd-play" href="${playlistUrl(p.trackVideoIds)}" target="_blank" rel="noopener">${icon('play', 15)} Play on YouTube</a>
      <button class="btn btn-teal btn-sm" id="pd-yt">${icon('youtube', 15)} Create on YouTube</button>
    </div>
    <div id="pd-list" style="display:flex;flex-direction:column;gap:10px"></div>
  </section>`;

  const listEl = el.querySelector('#pd-list') as HTMLElement;
  if (!tracks.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:30px"><div class="glyph">🎧</div><p>This playlist is empty. Add tracks from a discovery session.</p></div>`;
  }
  tracks.forEach((t, i) => {
    const removeBtn = `<button class="btn btn-ghost btn-sm pd-rm" data-i="${i}" title="Remove">${icon('x', 14)}</button>`;
    const card = trackCard(t, { extra: removeBtn });
    listEl.appendChild(card);
  });
  listEl.querySelectorAll('.pd-rm').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number((b as HTMLElement).dataset.i);
      p.trackVideoIds.splice(i, 1);
      store.updatePlaylist(p);
      renderDetail(el, p);
    }),
  );

  el.querySelector('#pd-save')?.addEventListener('click', () => {
    p.name = (el.querySelector('#pd-name') as HTMLInputElement).value.trim() || p.name;
    p.description = (el.querySelector('#pd-desc') as HTMLTextAreaElement).value;
    store.updatePlaylist(p);
    toast('Playlist saved', 'success');
  });
  el.querySelector('#pd-dup')?.addEventListener('click', () => {
    const copy = store.createPlaylist(`${p.name} (copy)`, [...p.trackVideoIds], p.description);
    toast('Playlist duplicated', 'success');
    renderPlaylists(el.parentElement as HTMLElement, new URLSearchParams({ id: copy.id }));
  });
  el.querySelector('#pd-del')?.addEventListener('click', () => {
    openModal('Delete playlist', `<p>Delete “${escapeHtml(p.name)}”? This cannot be undone.</p>`, [
      { label: 'Delete', kind: 'danger', onClick: () => { store.deletePlaylist(p.id); renderPlaylists(el.parentElement as HTMLElement, new URLSearchParams()); } },
      { label: 'Cancel', kind: 'ghost', onClick: () => {} },
    ]);
  });
  el.querySelector('#pd-export')?.addEventListener('click', () => {
    const data = {
      name: p.name,
      description: p.description,
      tracks: p.trackVideoIds.map((id) => ({ videoId: id, url: watchUrl(id) })),
      exportedAt: new Date().toISOString(),
      app: 'SangeetPremi by SPOOKEYfr',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^\w-]+/g, '_')}.sangeetpremi.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Playlist exported as JSON', 'success');
  });
  el.querySelector('#pd-yt')?.addEventListener('click', () => void createOnYouTube(p));
}

async function createOnYouTube(p: Playlist): Promise<void> {
  try {
    const cfg = await loadConfig();
    if (!cfg.youtubeApiKey || !cfg.youtubeClientId) {
      toast('YouTube API key + OAuth client id are required. Configure both in Settings.', 'error');
      return;
    }
    let token = await getValidToken();
    if (!token) token = await authorize();
    if (!token) {
      toast('YouTube authorization was cancelled.', 'error');
      return;
    }
    const client = new YouTubeClient(cfg.youtubeApiKey);
    toast('Creating playlist on YouTube…', 'info');
    const ytId = await client.createPlaylist(token, p.name, p.description ?? '', 'private');
    await client.addVideosToPlaylist(token, ytId, p.trackVideoIds);
    p.youtubePlaylistId = ytId;
    store.updatePlaylist(p);
    toast(`Playlist created on YouTube: https://youtube.com/playlist?list=${ytId}`, 'success');
    window.open(`https://youtube.com/playlist?list=${ytId}`, '_blank', 'noopener');
  } catch (err) {
    toast(`YouTube playlist creation failed: ${(err as Error).message}`, 'error');
  }
}
