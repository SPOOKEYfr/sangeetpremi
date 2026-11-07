/** Playlist builder & manager. */
import { store } from '../../state/store';
import { trackCard } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { icon } from '../../components/icons';
import { escapeHtml, playlistUrl, watchUrl } from '../../utils/sanitize';
import { formatDuration } from '../../utils/normalize';
import { loadConfig } from '../../services/config';
import { YouTubeClient } from '../../services/youtube/api';
import { authorize, getValidToken } from '../../services/youtube/oauth';
import type { Playlist } from '../../types';
import { isVerifiedYouTubeId } from '../discovery/musicbrainzModel';

export function renderPlaylists(el: HTMLElement, params: URLSearchParams): void {
  const playlists = Object.values(store.library?.playlists ?? {}).sort((a, b) => b.updatedAt - a.updatedAt);
  const openId = params.get('id');

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">
      <h2 style="flex:1">Playlists</h2>
      <button class="btn btn-primary" id="pl-new">${icon('plus', 16)} New playlist</button>
    </div>
    <div class="playlists-grid">
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
    const trackCount = p.trackIds?.length ?? p.trackVideoIds?.length ?? 0;
    const b = document.createElement('button');
    b.className = `clay clay-sm pl-item${p.id === openId ? '' : ''}`;
    b.style.cssText = 'padding:14px 16px;text-align:left;border:none;display:flex;justify-content:space-between;align-items:center;gap:8px';
    if (p.id === openId) b.style.outline = '2px solid var(--accent)';
    b.innerHTML = `<span style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</span><span class="badge muted">${trackCount}</span>`;
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
  const playlistTrackIds = p.trackIds?.length ? p.trackIds : (p.trackVideoIds ?? []);
  const tracks = playlistTrackIds
    .map((id) => all.find((t) => t.id === id || t.videoId === id || t.youtubeVideoId === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const missing = playlistTrackIds.length - tracks.length;
  const totalSeconds = tracks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0);
  const totalDuration = formatDuration(totalSeconds);

  const verifiedVideoIds = tracks
    .map((t) => t.youtubeVideoId ?? t.videoId)
    .filter((id): id is string => typeof id === 'string' && isVerifiedYouTubeId(id));
  const unmappedCount = playlistTrackIds.length - verifiedVideoIds.length;

  el.innerHTML = `
  <section class="clay" style="padding:24px 28px">
    <input id="pd-name" class="input" style="font-size:18px;font-weight:700;margin-bottom:10px" value="${escapeHtml(p.name)}" aria-label="Playlist title"/>
    <textarea id="pd-desc" class="textarea" placeholder="Add an optional description…" aria-label="Playlist description">${escapeHtml(p.description ?? '')}</textarea>
    <div style="display:flex;gap:10px;margin:16px 0;flex-wrap:wrap;align-items:center">
      <span class="badge">${playlistTrackIds.length} tracks</span>
      ${totalDuration ? `<span class="badge muted">${totalDuration}</span>` : ''}
      ${p.youtubePlaylistId ? `<span class="badge teal">on YouTube</span>` : ''}
      ${unmappedCount > 0 ? `<span class="badge muted" title="Tracks without verified YouTube stream mapping">${unmappedCount} unmapped</span>` : ''}
      ${missing ? `<span class="badge warm">${missing} not in library</span>` : ''}
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" id="pd-save" title="Save changes">${icon('check', 15)} Save</button>
      <button class="btn btn-ghost btn-sm" id="pd-dup" title="Duplicate playlist">${icon('plus', 15)} Duplicate</button>
      <button class="btn btn-ghost btn-sm" id="pd-export" title="Export as JSON">${icon('download', 15)} Export</button>
      <button class="btn btn-ghost btn-sm" id="pd-del" title="Delete playlist" style="color:var(--danger)">${icon('trash', 15)} Delete</button>
      ${
        verifiedVideoIds.length > 0
          ? `<a class="btn btn-ghost btn-sm" id="pd-play" href="${playlistUrl(verifiedVideoIds)}" target="_blank" rel="noopener" title="Launch instant YouTube queue for mapped tracks">${icon('play', 15)} Play on YouTube (${verifiedVideoIds.length})</a>`
          : `<button class="btn btn-ghost btn-sm" disabled title="No verified YouTube streams mapped for tracks in this playlist" style="opacity:0.6">${icon('play', 15)} No YouTube streams mapped</button>`
      }
      <button class="btn btn-teal btn-sm" id="pd-yt" title="Create private YouTube playlist" ${verifiedVideoIds.length === 0 ? 'disabled' : ''}>${icon('youtube', 15)} Create on YouTube</button>
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
      if (p.trackIds && p.trackIds.length > i) {
        p.trackIds.splice(i, 1);
      } else if (p.trackVideoIds && p.trackVideoIds.length > i) {
        p.trackVideoIds.splice(i, 1);
      }
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
    const trackIds = [...(p.trackIds ?? p.trackVideoIds ?? [])];
    const copy = store.createPlaylist(`${p.name} (copy)`, trackIds, p.description);
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
      tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        durationSeconds: t.durationSeconds,
        youtubeVideoId: t.youtubeVideoId ?? t.videoId,
        youtubeUrl: (t.youtubeVideoId ?? t.videoId) ? watchUrl((t.youtubeVideoId ?? t.videoId)!) : undefined,
      })),
      exportedAt: new Date().toISOString(),
      app: 'SangeetPremi by SPOOKEYfr',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Playlist exported as JSON', 'success');
  });

  el.querySelector('#pd-yt')?.addEventListener('click', async () => {
    const cfg = await loadConfig();
    if (!cfg.youtubeClientId) {
      toast('Add an OAuth Client ID in Settings first to sync with YouTube', 'error');
      return;
    }
    const token = await getValidToken();
    if (!token) {
      const ok = await authorize();
      if (!ok) {
        toast('YouTube authorization failed or was cancelled', 'error');
        return;
      }
    }
    const authedToken = await getValidToken();
    if (!authedToken) {
      toast('Failed to obtain a valid access token', 'error');
      return;
    }
    try {
      toast('Creating private YouTube playlist…', 'info');
      const yt = new YouTubeClient(cfg.youtubeApiKey ?? '');
      const playlistId = await yt.createPlaylist(authedToken, p.name, p.description ?? '');
      if (verifiedVideoIds.length) {
        toast(`Adding ${verifiedVideoIds.length} verified tracks…`, 'info');
        await yt.addVideosToPlaylist(authedToken, playlistId, verifiedVideoIds);
      }
      p.youtubePlaylistId = playlistId;
      store.updatePlaylist(p);
      toast(`Playlist created on YouTube!`, 'success');
      renderDetail(el, p);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  });
}
