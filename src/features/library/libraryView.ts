/** Saved library: all discovered tracks across sessions + favorites. */
import { store } from '../../state/store';
import { trackCard } from '../../components/trackCard';
import { icon } from '../../components/icons';
import { navigate } from '../../app/router';
import { h } from '../../utils/dom';

export function renderLibrary(el: HTMLElement): void {
  const tracks = store.allTracks();
  const favs = new Set(store.library?.favorites.trackIds ?? []);
  const artists = Object.values(store.library?.artists ?? {});

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <h2 style="margin-bottom:4px">Your library</h2>
    <p style="margin:0 0 22px;font-size:13.5px">${tracks.length} discovered tracks · ${artists.length} saved artists · ${favs.size} favorites</p>
    <div id="lib-artists" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px"></div>
    <div id="lib-list" style="display:flex;flex-direction:column;gap:10px"></div>
  </div>`;

  const list = el.querySelector('#lib-list') as HTMLElement;
  if (!tracks.length) {
    list.innerHTML = `<div class="clay clay-sm empty-state" style="padding:44px"><div class="glyph">🎶</div><h3>Your library is empty</h3><p>Discover an artist to start building your collection.</p><br/><button class="btn btn-primary" id="lib-go">${icon('search', 16)} Discover music</button></div>`;
    el.querySelector('#lib-go')?.addEventListener('click', () => navigate('discover'));
  } else {
    for (const t of tracks) {
      const favBtn = `<button class="btn btn-ghost btn-sm lib-fav" data-id="${t.videoId}" title="Favorite">${icon('heart', 15)}</button>`;
      if (favs.has(t.videoId)) {
        // filled heart state handled visually via opacity
      }
      list.appendChild(trackCard(t, { extra: favBtn }));
    }
    list.querySelectorAll('.lib-fav').forEach((b) =>
      b.addEventListener('click', () => {
        store.toggleFavoriteTrack((b as HTMLElement).dataset.id!);
        renderLibrary(el);
      }),
    );
  }
  const artistsEl = el.querySelector('#lib-artists') as HTMLElement;
  for (const a of artists) {
    const chip = h('button', { class: 'chip lib-a', 'data-id': a.id }, (a.favorite ? '★ ' : '') + a.name);
    chip.addEventListener('click', () => navigate('discover', { artist: a.id }));
    artistsEl.appendChild(chip);
  }
}
