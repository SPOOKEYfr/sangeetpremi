/** Saved library: all discovered tracks across sessions + favorites. */
import { store } from '../../state/store';
import { trackCard } from '../../components/trackCard';
import { icon } from '../../components/icons';
import { navigate } from '../../app/router';
import { escapeHtml } from '../../utils/sanitize';
import { formatDuration } from '../../utils/normalize';

interface LibraryViewState {
  search: string;
  tab: 'all' | 'favorites';
  artistId?: string;
}

const state: LibraryViewState = {
  search: '',
  tab: 'all',
  artistId: undefined,
};

export function renderLibrary(el: HTMLElement): void {
  const allTracks = store.allTracks();
  const favs = new Set(store.library?.favorites.trackIds ?? []);
  const artists = Object.values(store.library?.artists ?? {});

  // Compute total duration of all tracks
  const totalSeconds = allTracks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0);
  const totalFormatted = formatDuration(totalSeconds);

  // Filter tracks
  let filtered = allTracks;
  if (state.tab === 'favorites') {
    filtered = filtered.filter((t) => favs.has(t.id) || (t.videoId ? favs.has(t.videoId) : false));
  }
  if (state.artistId) {
    const artist = artists.find((a) => a.id === state.artistId);
    if (artist) {
      filtered = filtered.filter(
        (t) => t.artist.toLowerCase().includes(artist.name.toLowerCase()),
      );
    }
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    filtered = filtered.filter((t) => t.title.toLowerCase().includes(q) || (t.channelTitle ?? t.artist).toLowerCase().includes(q));
  }

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="margin-bottom:4px">Your library</h2>
        <p style="margin:0;font-size:13.5px">${allTracks.length} canonical tracks · ${artists.length} saved artists · ${favs.size} favorites${totalFormatted ? ` · ${totalFormatted} audio` : ''}</p>
      </div>
      <button class="btn btn-primary btn-sm" id="lib-discover">${icon('search', 15)} Discover more</button>
    </div>

    ${
      artists.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;align-items:center">
            <span style="font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-right:2px">Artists:</span>
            <button class="chip ${!state.artistId ? 'active' : ''}" id="lib-a-all">All Artists</button>
            ${artists
              .map(
                (a) =>
                  `<button class="chip lib-a-filter ${state.artistId === a.id ? 'active' : ''}" data-id="${escapeHtml(a.id)}">${a.favorite ? '★ ' : ''}${escapeHtml(a.name)}</button>`,
              )
              .join('')}
          </div>`
        : ''
    }

    <div style="display:flex;gap:10px;margin-bottom:18px;align-items:center;flex-wrap:wrap">
      <button class="chip ${state.tab === 'all' ? 'active' : ''}" id="lib-tab-all">All Tracks (${allTracks.length})</button>
      <button class="chip ${state.tab === 'favorites' ? 'active' : ''}" id="lib-tab-fav">Favorites (${favs.size})</button>
      <span style="flex:1"></span>
      <input id="lib-search" class="input" style="width:240px;padding:9px 14px;font-size:13px" placeholder="Search saved tracks…" value="${escapeHtml(state.search)}" aria-label="Search saved tracks"/>
    </div>

    <div id="lib-list" style="display:flex;flex-direction:column;gap:10px"></div>
  </div>`;

  el.querySelector('#lib-discover')?.addEventListener('click', () => navigate('discover'));

  el.querySelector('#lib-tab-all')?.addEventListener('click', () => {
    state.tab = 'all';
    renderLibrary(el);
  });
  el.querySelector('#lib-tab-fav')?.addEventListener('click', () => {
    state.tab = 'favorites';
    renderLibrary(el);
  });

  el.querySelector('#lib-a-all')?.addEventListener('click', () => {
    state.artistId = undefined;
    renderLibrary(el);
  });
  el.querySelectorAll('.lib-a-filter').forEach((b) =>
    b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.id;
      state.artistId = state.artistId === id ? undefined : id;
      renderLibrary(el);
    }),
  );

  el.querySelector('#lib-search')?.addEventListener('input', (e) => {
    state.search = (e.target as HTMLInputElement).value;
    renderLibrary(el);
  });

  const list = el.querySelector('#lib-list') as HTMLElement;
  if (!allTracks.length) {
    list.innerHTML = `<div class="clay clay-sm empty-state" style="padding:48px 30px">
      <div class="glyph">🎶</div>
      <h3>Your library is empty</h3>
      <p style="margin-bottom:18px">Discover an artist to start building your personal music collection.</p>
      <button class="btn btn-primary" id="lib-go">${icon('search', 16)} Discover music</button>
    </div>`;
    el.querySelector('#lib-go')?.addEventListener('click', () => navigate('discover'));
    return;
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="clay clay-sm empty-state" style="padding:36px 20px">
      <div class="glyph">🔍</div>
      <h3>No saved tracks match your filter</h3>
      <p style="margin-bottom:16px">Try clearing your search text or switching tabs.</p>
      <button class="btn btn-ghost btn-sm" id="lib-clear-filter">${icon('refresh', 14)} Clear filter</button>
    </div>`;
    list.querySelector('#lib-clear-filter')?.addEventListener('click', () => {
      state.search = '';
      state.tab = 'all';
      state.artistId = undefined;
      renderLibrary(el);
    });
    return;
  }

  for (const t of filtered) {
    const isFav = favs.has(t.id) || (t.videoId ? favs.has(t.videoId) : false);
    const favBtn = `<button class="btn btn-ghost btn-sm lib-fav" data-id="${escapeHtml(t.id)}" title="${isFav ? 'Remove favorite' : 'Add favorite'}" aria-label="${isFav ? 'Remove favorite' : 'Add favorite'}" style="color:${isFav ? 'var(--danger)' : 'var(--text-3)'}">${icon('heart', 15)}</button>`;
    list.appendChild(trackCard(t, { extra: favBtn }));
  }

  list.querySelectorAll('.lib-fav').forEach((b) =>
    b.addEventListener('click', () => {
      store.toggleFavoriteTrack((b as HTMLElement).dataset.id!);
      renderLibrary(el);
    }),
  );
}
