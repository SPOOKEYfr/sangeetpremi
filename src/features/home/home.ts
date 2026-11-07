/** Home / Dashboard view. */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import { icon } from '../../components/icons';
import { logoSvg } from '../../components/logo';
import { escapeHtml } from '../../utils/sanitize';

const ONBOARDING_SUGGESTIONS = [
  'A.R. Rahman',
  'Arijit Singh',
  'Coldplay',
  'Hans Zimmer',
  'Taylor Swift',
  'Anirudh Ravichander',
];

export function renderHome(el: HTMLElement): void {
  const lib = store.library;
  const recent = lib?.history.slice(0, 8) ?? [];
  const favArtists = Object.values(lib?.artists ?? {}).filter((a) => a.favorite).slice(0, 6);
  const sessions = Object.values(lib?.sessions ?? {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const playlists = Object.values(lib?.playlists ?? {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const totalTracks = store.allTracks().length;
  const isFresh = totalTracks === 0 && recent.length === 0;

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <section class="clay" style="padding:34px 36px;margin-bottom:26px;display:flex;gap:26px;align-items:center;flex-wrap:wrap">
      <div style="flex:none">${logoSvg(74)}</div>
      <div style="flex:1;min-width:280px">
        <h1>Search an artist.<br/><span style="background:linear-gradient(90deg,var(--accent-violet),var(--accent-2));-webkit-background-clip:text;background-clip:text;color:transparent">Discover their music.</span></h1>
        <p style="margin:12px 0 20px;max-width:540px">Type a singer, band or musician — SangeetPremi finds their songs across YouTube and organizes them into a playlist you can enjoy in one place.</p>
        <form id="home-search" style="display:flex;gap:12px;max-width:560px;flex-wrap:wrap">
          <input id="home-q" class="input" style="flex:1;min-width:240px;font-size:15.5px;padding:14px 20px" placeholder="e.g. Arijit Singh, AR Rahman, Coldplay…" autocomplete="off" aria-label="Search artist name"/>
          <button class="btn btn-primary" type="submit" style="padding:14px 24px;font-size:15px">${icon('search', 17)} Discover</button>
        </form>
      </div>
    </section>

    ${
      isFresh
        ? `<section class="clay clay-sm" style="padding:22px 26px;margin-bottom:26px;border-left:4px solid var(--accent-violet)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="color:var(--accent-violet)">${icon('sparkles', 18)}</span>
              <h3 style="font-size:15px">Get started with popular music discovery</h3>
            </div>
            <p style="font-size:13px;margin:0 0 14px">Select any artist to launch your first catalog exploration across official releases, soundtracks, duets, and live shows:</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${ONBOARDING_SUGGESTIONS.map(
                (name) => `<button class="chip onboarding-chip" data-q="${escapeHtml(name)}">${icon('search', 12)} ${escapeHtml(name)}</button>`,
              ).join('')}
            </div>
          </section>`
        : ''
    }

    <div class="stat-grid">
      ${statCard('stat-tracks', icon('music', 20), String(totalTracks), 'tracks discovered')}
      ${statCard('stat-artists', icon('sparkles', 20), String(Object.keys(lib?.artists ?? {}).length), 'artists saved')}
      ${statCard('stat-playlists', icon('list', 20), String(Object.keys(lib?.playlists ?? {}).length), 'playlists built')}
      ${statCard('stat-favs', icon('heart', 20), String(lib?.favorites.trackIds.length ?? 0), 'favorite tracks')}
    </div>

    <div class="card-grid-2">
      <section class="clay" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3>Recent searches</h3>
          ${recent.length ? `<span class="badge muted">${recent.length}</span>` : ''}
        </div>
        ${
          recent.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${recent
                .map((h) => `<button class="chip recent-q" data-q="${escapeHtml(h.query)}">${escapeHtml(h.query)}</button>`)
                .join('')}</div>`
            : empty('No searches yet — enter an artist above to start.')
        }
      </section>

      <section class="clay" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3>Favorite artists</h3>
          ${favArtists.length ? `<span class="badge muted">${favArtists.length}</span>` : ''}
        </div>
        ${
          favArtists.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${favArtists
                .map((a) => `<button class="chip fav-a" data-id="${escapeHtml(a.id)}">★ ${escapeHtml(a.name)}</button>`)
                .join('')}</div>`
            : empty('Star an artist on the Discover page to pin them here.')
        }
      </section>

      <section class="clay" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3>Recent discoveries</h3>
          ${sessions.length ? `<span class="badge muted">${sessions.length}</span>` : ''}
        </div>
        ${
          sessions.length
            ? `<div style="display:flex;flex-direction:column;gap:8px">${sessions
                .map(
                  (s) =>
                    `<button class="chip recent-s" data-id="${s.id}" style="text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 16px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon('music', 14)} ${escapeHtml(s.artist.name)}</span><span class="badge muted" style="flex:none">${s.tracks.length} tracks</span></button>`,
                )
                .join('')}</div>`
            : empty('Nothing discovered yet.')
        }
      </section>

      <section class="clay" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3>Recent playlists</h3>
          ${playlists.length ? `<span class="badge muted">${playlists.length}</span>` : ''}
        </div>
        ${
          playlists.length
            ? `<div style="display:flex;flex-direction:column;gap:8px">${playlists
                .map(
                  (p) =>
                    `<button class="chip recent-p" data-id="${p.id}" style="text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 16px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon('list', 14)} ${escapeHtml(p.name)}</span><span class="badge muted" style="flex:none">${p.trackVideoIds.length} tracks</span></button>`,
                )
                .join('')}</div>`
            : empty('Build a playlist from any discovery session.')
        }
      </section>
    </div>
  </div>`;

  el.querySelector('#home-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (el.querySelector('#home-q') as HTMLInputElement).value.trim();
    if (q) navigate('discover', { q });
  });

  el.querySelectorAll('.onboarding-chip').forEach((b) =>
    b.addEventListener('click', () => navigate('discover', { q: (b as HTMLElement).dataset.q ?? '' })),
  );
  el.querySelectorAll('.recent-q').forEach((b) =>
    b.addEventListener('click', () => navigate('discover', { q: (b as HTMLElement).dataset.q ?? '' })),
  );
  el.querySelectorAll('.recent-s').forEach((b) =>
    b.addEventListener('click', () => navigate('discover', { session: (b as HTMLElement).dataset.id ?? '' })),
  );
  el.querySelectorAll('.recent-p').forEach((b) =>
    b.addEventListener('click', () => navigate('playlists', { id: (b as HTMLElement).dataset.id ?? '' })),
  );
  el.querySelectorAll('.fav-a').forEach((b) =>
    b.addEventListener('click', () => navigate('discover', { artist: (b as HTMLElement).dataset.id ?? '' })),
  );

  // Interactive stat cards
  el.querySelector('#stat-tracks')?.addEventListener('click', () => navigate('library'));
  el.querySelector('#stat-artists')?.addEventListener('click', () => navigate('library'));
  el.querySelector('#stat-playlists')?.addEventListener('click', () => navigate('playlists'));
  el.querySelector('#stat-favs')?.addEventListener('click', () => navigate('library'));
}

function statCard(id: string, ic: string, value: string, label: string): string {
  return `<button id="${id}" class="clay clay-sm" style="padding:18px 20px;display:flex;align-items:center;gap:14px;border:none;text-align:left;width:100%;transition:transform var(--dur-fast),filter var(--dur-fast);cursor:pointer">
    <div style="width:42px;height:42px;border-radius:14px;background:var(--accent-soft);color:var(--accent-violet);display:flex;align-items:center;justify-content:center;flex:none">${ic}</div>
    <div><div style="font-size:22px;font-weight:750;line-height:1.1;color:var(--text-1)">${value}</div><div style="color:var(--text-3);font-size:12px">${label}</div></div>
  </button>`;
}

function empty(msg: string): string {
  return `<div style="color:var(--text-3);font-size:13px;padding:12px 2px">${escapeHtml(msg)}</div>`;
}
