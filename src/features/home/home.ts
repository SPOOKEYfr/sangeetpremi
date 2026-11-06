/** Home / Dashboard view. */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import { icon } from '../../components/icons';
import { logoSvg } from '../../components/logo';
import { escapeHtml } from '../../utils/sanitize';

export function renderHome(el: HTMLElement): void {
  const lib = store.library;
  const recent = lib?.history.slice(0, 8) ?? [];
  const favArtists = Object.values(lib?.artists ?? {}).filter((a) => a.favorite).slice(0, 6);
  const sessions = Object.values(lib?.sessions ?? {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const playlists = Object.values(lib?.playlists ?? {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const totalTracks = store.allTracks().length;

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <section class="clay" style="padding:34px 36px;margin-bottom:26px;display:flex;gap:26px;align-items:center">
      <div style="flex:none">${logoSvg(74)}</div>
      <div style="flex:1">
        <h1>Search an artist.<br/><span style="background:linear-gradient(90deg,var(--accent),var(--accent-2));-webkit-background-clip:text;background-clip:text;color:transparent">Discover their music.</span></h1>
        <p style="margin:12px 0 20px;max-width:520px">Type a singer, band or musician — SangeetPremi finds their songs across YouTube and organizes them into a playlist you can enjoy in one place.</p>
        <form id="home-search" style="display:flex;gap:12px;max-width:560px">
          <input id="home-q" class="input" style="flex:1;font-size:16px;padding:15px 20px" placeholder="e.g. Arijit Singh, AR Rahman, The Beatles…" autocomplete="off"/>
          <button class="btn btn-primary" type="submit" style="padding:15px 26px;font-size:15px">${icon('search', 17)} Discover</button>
        </form>
      </div>
    </section>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:26px">
      ${statCard(icon('music', 20), String(totalTracks), 'tracks discovered')}
      ${statCard(icon('sparkles', 20), String(Object.keys(lib?.artists ?? {}).length), 'artists saved')}
      ${statCard(icon('list', 20), String(Object.keys(lib?.playlists ?? {}).length), 'playlists built')}
      ${statCard(icon('heart', 20), String(lib?.favorites.trackIds.length ?? 0), 'favorite tracks')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
      <section class="clay" style="padding:24px">
        <h3 style="margin-bottom:14px">Recent searches</h3>
        ${recent.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${recent.map((h) => `<button class="chip recent-q" data-q="${escapeHtml(h.query)}">${escapeHtml(h.query)}</button>`).join('')}</div>` : empty('No searches yet — try discovering an artist above.')}
      </section>
      <section class="clay" style="padding:24px">
        <h3 style="margin-bottom:14px">Favorite artists</h3>
        ${favArtists.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${favArtists.map((a) => `<button class="chip fav-a" data-id="${escapeHtml(a.id)}">${escapeHtml(a.name)}</button>`).join('')}</div>` : empty('Star an artist on the Discover page to pin them here.')}
      </section>
      <section class="clay" style="padding:24px">
        <h3 style="margin-bottom:14px">Recent discoveries</h3>
        ${sessions.length ? `<div style="display:flex;flex-direction:column;gap:8px">${sessions.map((s) => `<button class="chip recent-s" data-id="${s.id}" style="text-align:left">${icon('music', 14)} ${escapeHtml(s.artist.name)} <span class="badge muted" style="margin-left:6px">${s.tracks.length} tracks</span></button>`).join('')}</div>` : empty('Nothing discovered yet.')}
      </section>
      <section class="clay" style="padding:24px">
        <h3 style="margin-bottom:14px">Recent playlists</h3>
        ${playlists.length ? `<div style="display:flex;flex-direction:column;gap:8px">${playlists.map((p) => `<button class="chip recent-p" data-id="${p.id}" style="text-align:left">${icon('list', 14)} ${escapeHtml(p.name)} <span class="badge muted" style="margin-left:6px">${p.trackVideoIds.length} tracks</span></button>`).join('')}</div>` : empty('Build a playlist from any discovery.')}
      </section>
    </div>
  </div>`;

  el.querySelector('#home-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (el.querySelector('#home-q') as HTMLInputElement).value.trim();
    if (q) navigate('discover', { q });
  });
  el.querySelectorAll('.recent-q').forEach((b) => b.addEventListener('click', () => navigate('discover', { q: (b as HTMLElement).dataset.q ?? '' })));
  el.querySelectorAll('.recent-s').forEach((b) => b.addEventListener('click', () => navigate('discover', { session: (b as HTMLElement).dataset.id ?? '' })));
  el.querySelectorAll('.recent-p').forEach((b) => b.addEventListener('click', () => navigate('playlists', { id: (b as HTMLElement).dataset.id ?? '' })));
  el.querySelectorAll('.fav-a').forEach((b) => b.addEventListener('click', () => navigate('discover', { artist: (b as HTMLElement).dataset.id ?? '' })));
}

function statCard(ic: string, value: string, label: string): string {
  return `<div class="clay clay-sm" style="padding:18px 20px;display:flex;align-items:center;gap:14px">
    <div style="width:42px;height:42px;border-radius:14px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex:none">${ic}</div>
    <div><div style="font-size:22px;font-weight:750;line-height:1.1">${value}</div><div style="color:var(--text-3);font-size:12px">${label}</div></div>
  </div>`;
}

function empty(msg: string): string {
  return `<div style="color:var(--text-3);font-size:13px;padding:6px 2px">${escapeHtml(msg)}</div>`;
}
