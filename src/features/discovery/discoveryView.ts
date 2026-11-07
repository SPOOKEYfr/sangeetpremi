/**
 * Artist discovery view: query → disambiguation → progress → organized
 * results → playlist creation. All network work is async via the engine.
 */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import { loadConfig } from '../../services/config';
import { YouTubeClient } from '../../services/youtube/api';
import { DiscoveryEngine, type ProgressEvent } from '../../services/discovery/engine';
import type { Artist, DiscoveryCategory, DiscoveryDepth, DiscoverySession, Track } from '../../types';
import { DISCOVERY_CATEGORIES } from '../../types';
import { icon } from '../../components/icons';
import { trackCard, trackSkeleton, categoryLabel } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { escapeHtml } from '../../utils/sanitize';
import { playlistUrl } from '../../utils/sanitize';

interface ViewState {
  artists: Artist[];
  selected?: Artist;
  session?: DiscoverySession;
  allTracks: Track[]; // includes duplicates (hidden by default)
  showDuplicates: boolean;
  selectedIds: Set<string>;
  query: string;
  filterCategory: DiscoveryCategory | 'all';
  filterText: string;
  sortKey: 'title' | 'publishedAt' | 'viewCount' | 'duration';
  running: boolean;
}

export async function renderDiscover(el: HTMLElement, params: URLSearchParams): Promise<void> {
  const state: ViewState = {
    artists: [],
    allTracks: [],
    showDuplicates: false,
    selectedIds: new Set(),
    query: params.get('q') ?? '',
    filterCategory: 'all',
    filterText: '',
    sortKey: 'viewCount',
    running: false,
  };

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <section class="clay" style="padding:26px 30px;margin-bottom:22px">
      <h2 style="margin-bottom:6px">Discover an artist</h2>
      <p style="margin:0 0 18px;font-size:13.5px">We'll search YouTube, classify every result and remove duplicates automatically.</p>
      <form id="d-search" style="display:flex;gap:12px;flex-wrap:wrap">
        <input id="d-q" class="input" style="flex:1;min-width:240px;font-size:15px" placeholder="Artist, singer, band…" value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Artist name for discovery"/>
        <select id="d-depth" class="select" style="width:auto" title="Discovery depth" aria-label="Discovery depth">
          <option value="quick">Quick</option>
          <option value="standard" selected>Standard</option>
          <option value="deep">Deep</option>
        </select>
        <button class="btn btn-primary" type="submit" id="d-go">${icon('search', 16)} Discover</button>
      </form>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap;gap:8px">
        <span style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em">Categories to include</span>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" id="d-cats-all" style="padding:4px 10px;font-size:11.5px">Select all</button>
          <button type="button" class="btn btn-ghost btn-sm" id="d-cats-def" style="padding:4px 10px;font-size:11.5px">Reset default</button>
        </div>
      </div>
      <div id="d-categories" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px"></div>
    </section>
    <div id="d-progress"></div>
    <div id="d-artists"></div>
    <div id="d-results"></div>
  </div>`;

  // Category chips
  const catWrap = el.querySelector('#d-categories')!;
  const selectedCats = new Set<DiscoveryCategory>(store.settings.defaultCategories);
  for (const c of DISCOVERY_CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${selectedCats.has(c.id) ? ' active' : ''}`;
    b.textContent = c.label;
    b.title = c.description;
    b.addEventListener('click', () => {
      if (selectedCats.has(c.id)) selectedCats.delete(c.id);
      else selectedCats.add(c.id);
      b.classList.toggle('active');
    });
    catWrap.appendChild(b);
  }

  el.querySelector('#d-cats-all')?.addEventListener('click', () => {
    for (const c of DISCOVERY_CATEGORIES) selectedCats.add(c.id);
    catWrap.querySelectorAll('.chip').forEach((b) => b.classList.add('active'));
  });

  el.querySelector('#d-cats-def')?.addEventListener('click', () => {
    selectedCats.clear();
    for (const c of store.settings.defaultCategories) selectedCats.add(c);
    catWrap.querySelectorAll('.chip').forEach((b) => {
      const label = b.textContent;
      const matched = DISCOVERY_CATEGORIES.find((x) => x.label === label);
      if (matched && selectedCats.has(matched.id)) b.classList.add('active');
      else b.classList.remove('active');
    });
  });

  const depthSel = el.querySelector('#d-depth') as HTMLSelectElement;
  depthSel.value = store.settings.defaultDepth;

  el.querySelector('#d-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (el.querySelector('#d-q') as HTMLInputElement).value.trim();
    if (!q) return;
    void runDiscovery(q);
  });

  async function getClient(): Promise<YouTubeClient> {
    const cfg = await loadConfig();
    if (!cfg.youtubeApiKey) {
      openModal(
        'YouTube API key required',
        `<p>Live discovery uses the official YouTube Data API. Add your API key in <a href="#/settings">Settings</a> first.</p>
         <p style="font-size:12.5px;color:var(--text-3)">See <code>docs/SETUP_YOUTUBE_API.md</code> in the repository for how to get a free key. Your key stays on your device.</p>`,
        [{ label: 'Open Settings', kind: 'primary', onClick: () => navigate('settings') }, { label: 'Close', kind: 'ghost', onClick: () => {} }],
      );
      throw new Error('no-key');
    }
    return new YouTubeClient(cfg.youtubeApiKey);
  }

  async function runDiscovery(query: string): Promise<void> {
    state.query = query;
    state.running = true;
    state.artists = [];
    state.selected = undefined;
    state.session = undefined;
    state.allTracks = [];
    state.selectedIds.clear();
    store.pushHistory(query);
    renderArtists();
    renderResults();
    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    progressEl.innerHTML = `<div class="clay clay-sm" style="padding:20px 24px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-bottom:10px"><span id="d-msg">Starting…</span></div>
      <div class="progress-track"><div class="progress-bar" id="d-bar"></div></div></div>`;
    const onProgress = (ev: ProgressEvent) => {
      const msg = progressEl.querySelector('#d-msg');
      const bar = progressEl.querySelector('#d-bar') as HTMLElement;
      if (msg) msg.textContent = ev.message;
      if (bar) {
        if (ev.total) bar.style.width = `${Math.round(((ev.done ?? 0) / ev.total) * 100)}%`;
        else if (ev.phase === 'done') bar.style.width = '100%';
      }
    };
    try {
      const client = await getClient();
      const engine = new DiscoveryEngine(client);
      state.artists = await engine.resolveArtists(query, onProgress);
      renderArtists();
      if (state.artists.length === 0) {
        toast('No artist matches found. Try a different spelling.', 'error');
        progressEl.innerHTML = '';
        state.running = false;
        return;
      }
      // Auto-pick the best match if unambiguous, otherwise let the user choose.
      if (state.artists.length === 1) {
        await discoverArtist(state.artists[0], engine, onProgress);
      } else {
        onProgress({ phase: 'resolve', message: `Multiple artists match — pick one below.` });
        progressEl.innerHTML = '';
        state.running = false;
      }
    } catch (err) {
      progressEl.innerHTML = '';
      state.running = false;
      if ((err as Error).message !== 'no-key') toast((err as Error).message, 'error');
    }
  }

  async function discoverArtist(artist: Artist, engine?: DiscoveryEngine, onProgress?: (e: ProgressEvent) => void): Promise<void> {
    state.selected = artist;
    state.running = true;
    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    if (!progressEl.innerHTML) {
      progressEl.innerHTML = `<div class="clay clay-sm" style="padding:20px 24px;margin-bottom:22px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-bottom:10px"><span id="d-msg">Starting…</span></div>
        <div class="progress-track"><div class="progress-bar" id="d-bar"></div></div></div>`;
    }
    const progress = (ev: ProgressEvent) => {
      const msg = progressEl.querySelector('#d-msg');
      const bar = progressEl.querySelector('#d-bar') as HTMLElement;
      if (msg) msg.textContent = ev.message;
      if (bar) {
        if (ev.total) bar.style.width = `${Math.round(((ev.done ?? 0) / ev.total) * 100)}%`;
        else if (ev.phase === 'done') bar.style.width = '100%';
      }
      onProgress?.(ev);
    };
    try {
      const client = engine ? undefined : await getClient();
      const eng = engine ?? new DiscoveryEngine(client!);
      const depth = depthSel.value as DiscoveryDepth;
      const { session, tracks } = await eng.discover(
        artist,
        { depth, categories: [...selectedCats], dedup: store.settings.dedupStrictness, maxPerQuery: store.settings.maxResultsPerQuery },
        progress,
      );
      state.session = session;
      state.allTracks = tracks;
      state.selectedIds = new Set(session.tracks.slice(0, 50).map((t) => t.videoId));
      store.saveSession(session);
      store.saveArtist({ ...artist, discoveredAt: Date.now(), favorite: store.library?.artists[artist.id]?.favorite ?? false });
      progressEl.innerHTML = '';
      renderArtists();
      renderResults();
      toast(`Discovery complete — ${session.tracks.length} tracks for ${artist.name}`, 'success');
    } catch (err) {
      progressEl.innerHTML = '';
      toast((err as Error).message, 'error');
    } finally {
      state.running = false;
    }
  }

  function renderArtists(): void {
    const wrap = el.querySelector('#d-artists') as HTMLElement;
    if (!state.artists.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `<section class="clay" style="padding:22px 26px;margin-bottom:22px">
      <h3 style="margin-bottom:4px">${state.artists.length > 1 ? 'Who did you mean?' : 'Artist'}</h3>
      <p style="font-size:12.5px;margin:0 0 16px">Pick the right artist — we never guess silently.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
        ${state.artists.map((a, i) => `
        <button class="clay clay-sm artist-pick" data-i="${i}" style="display:flex;gap:13px;align-items:center;padding:13px;text-align:left;border:none;${state.selected?.id === a.id ? 'outline:2px solid var(--accent)' : ''}">
          ${a.thumbnail ? `<img class="avatar" src="${escapeHtml(a.thumbnail)}" width="46" height="46" alt=""/>` : `<div class="avatar" style="width:46px;height:46px;display:flex;align-items:center;justify-content:center;color:var(--accent)">${icon('music', 20)}</div>`}
          <span style="min-width:0">
            <span style="display:block;font-weight:650;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.name)}</span>
            <span style="color:var(--text-3);font-size:11.5px">${a.country ? escapeHtml(a.country) + ' · ' : ''}${a.subscriberCount ? (a.subscriberCount / 1e6).toFixed(1) + 'M subs' : 'artist'}</span>
          </span>
        </button>`).join('')}
      </div></section>`;
    wrap.querySelectorAll('.artist-pick').forEach((b) =>
      b.addEventListener('click', () => {
        const a = state.artists[Number((b as HTMLElement).dataset.i)];
        if (a) void discoverArtist(a);
      }),
    );
  }

  function visibleTracks(): Track[] {
    let list = state.allTracks.filter((t) => state.showDuplicates || !t.isDuplicate);
    if (state.filterCategory !== 'all') list = list.filter((t) => t.category === state.filterCategory);
    if (state.filterText) {
      const f = state.filterText.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(f) || (t.channelTitle ?? '').toLowerCase().includes(f));
    }
    const k = state.sortKey;
    list = [...list].sort((a, b) => {
      if (k === 'title') return a.title.localeCompare(b.title);
      if (k === 'publishedAt') return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      if (k === 'duration') return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
      return (b.viewCount ?? 0) - (a.viewCount ?? 0);
    });
    return list;
  }

  function renderResults(): void {
    const wrap = el.querySelector('#d-results') as HTMLElement;
    const s = state.session;
    if (!s) {
      if (state.running) {
        wrap.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            <div style="font-size:12.5px;color:var(--text-3);margin-bottom:4px">Discovering tracks and categorizing releases…</div>
            <div id="d-skeletons" style="display:flex;flex-direction:column;gap:10px"></div>
          </div>`;
        const skWrap = wrap.querySelector('#d-skeletons')!;
        for (let i = 0; i < 5; i++) skWrap.appendChild(trackSkeleton());
      } else {
        wrap.innerHTML = '';
      }
      return;
    }
    const tracks = visibleTracks();
    const r = s.report;
    const catCounts = new Map<DiscoveryCategory, number>();
    for (const t of s.tracks) catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1);

    wrap.innerHTML = `
    <section class="clay" style="padding:24px 28px;margin-bottom:22px">
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        ${s.artist.thumbnail ? `<img class="avatar" src="${escapeHtml(s.artist.thumbnail)}" width="64" height="64" alt=""/>` : ''}
        <div style="flex:1;min-width:200px">
          <h2>${escapeHtml(s.artist.name)}</h2>
          <div style="color:var(--text-3);font-size:12.5px;margin-top:4px">${s.artist.country ?? ''} ${s.artist.subscriberCount ? '· ' + (s.artist.subscriberCount / 1e6).toFixed(1) + 'M subscribers' : ''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="d-fav">${icon('heart', 15)} ${store.library?.artists[s.artist.id]?.favorite ? 'Favorited' : 'Favorite'}</button>
        <button class="btn btn-ghost btn-sm" id="d-report">${icon('info', 15)} Report</button>
        <button class="btn btn-teal" id="d-playlist" ${state.selectedIds.size ? '' : 'disabled'}>${icon('list', 15)} New playlist (${state.selectedIds.size})</button>
        <a class="btn btn-ghost" id="d-openyt" href="${playlistUrl([...state.selectedIds])}" target="_blank" rel="noopener">${icon('youtube', 15)} Play on YouTube</a>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px">
        <span class="badge">${r.candidatesFound} candidates</span>
        <span class="badge teal">${r.accepted} kept</span>
        <span class="badge warm">${r.duplicatesRemoved} duplicates</span>
        <span class="badge muted">${r.excluded} excluded</span>
        ${[...catCounts.entries()].map(([c, n]) => `<span class="badge muted">${escapeHtml(categoryLabel(c))}: ${n}</span>`).join('')}
      </div>
    </section>

    <section style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <input id="d-filter" class="input" style="width:230px;padding:9px 14px;font-size:13px" placeholder="Filter results…" value="${escapeHtml(state.filterText)}" aria-label="Filter results"/>
      <select id="d-cat" class="select" style="width:auto;padding:9px 14px;font-size:13px" aria-label="Filter by category">
        <option value="all">All categories</option>
        ${DISCOVERY_CATEGORIES.map((c) => `<option value="${c.id}" ${state.filterCategory === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
      <select id="d-sort" class="select" style="width:auto;padding:9px 14px;font-size:13px" aria-label="Sort tracks">
        <option value="viewCount" ${state.sortKey === 'viewCount' ? 'selected' : ''}>Most popular</option>
        <option value="publishedAt" ${state.sortKey === 'publishedAt' ? 'selected' : ''}>Newest</option>
        <option value="title" ${state.sortKey === 'title' ? 'selected' : ''}>A–Z</option>
        <option value="duration" ${state.sortKey === 'duration' ? 'selected' : ''}>Longest</option>
      </select>
      <button class="chip ${state.showDuplicates ? 'active' : ''}" id="d-dups">Show duplicates (${r.duplicatesRemoved})</button>
      <span style="flex:1"></span>
      <button class="chip" id="d-selall">Select all</button>
      <button class="chip" id="d-selclear">Clear</button>
    </section>

    <section id="d-list" style="display:flex;flex-direction:column;gap:10px"></section>`;

    const listEl = wrap.querySelector('#d-list') as HTMLElement;
    if (!tracks.length) {
      listEl.innerHTML = `<div class="clay clay-sm empty-state" style="padding:34px">
        <div class="glyph">🎧</div>
        <h3>No tracks match these filters</h3>
        <p style="margin-bottom:16px">Try resetting the category filter, clearing your search query, or enabling duplicate entries.</p>
        <button class="btn btn-primary btn-sm" id="d-reset-filters">${icon('refresh', 14)} Reset all filters</button>
      </div>`;
      listEl.querySelector('#d-reset-filters')?.addEventListener('click', () => {
        state.filterText = '';
        state.filterCategory = 'all';
        state.showDuplicates = false;
        renderResults();
      });
    }
    // Render in chunks to keep the UI responsive for large libraries.
    const CHUNK = 40;
    let idx = 0;
    const renderChunk = () => {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < CHUNK && idx < tracks.length; i++, idx++) {
        const t = tracks[idx];
        frag.appendChild(
          trackCard(t, {
            selected: state.selectedIds.has(t.videoId),
            showCheckbox: true,
            onToggle: (id) => {
              if (state.selectedIds.has(id)) state.selectedIds.delete(id);
              else state.selectedIds.add(id);
              renderResults();
            },
          }),
        );
      }
      listEl.appendChild(frag);
      if (idx < tracks.length) requestAnimationFrame(renderChunk);
    };
    renderChunk();

    wrap.querySelector('#d-filter')?.addEventListener('input', (e) => {
      state.filterText = (e.target as HTMLInputElement).value;
      renderResults();
    });
    wrap.querySelector('#d-cat')?.addEventListener('change', (e) => {
      state.filterCategory = (e.target as HTMLSelectElement).value as DiscoveryCategory | 'all';
      renderResults();
    });
    wrap.querySelector('#d-sort')?.addEventListener('change', (e) => {
      state.sortKey = (e.target as HTMLSelectElement).value as ViewState['sortKey'];
      renderResults();
    });
    wrap.querySelector('#d-dups')?.addEventListener('click', () => {
      state.showDuplicates = !state.showDuplicates;
      renderResults();
    });
    wrap.querySelector('#d-selall')?.addEventListener('click', () => {
      for (const t of tracks) state.selectedIds.add(t.videoId);
      renderResults();
    });
    wrap.querySelector('#d-selclear')?.addEventListener('click', () => {
      state.selectedIds.clear();
      renderResults();
    });
    wrap.querySelector('#d-fav')?.addEventListener('click', () => {
      store.toggleFavoriteArtist(s.artist.id);
      renderResults();
    });
    wrap.querySelector('#d-report')?.addEventListener('click', () => {
      const reasons = Object.entries(r.exclusionReasons).map(([k, v]) => `<li>${escapeHtml(k)}: ${v}</li>`).join('');
      openModal(
        'Discovery report',
        `<p>Query: <strong>${escapeHtml(r.query)}</strong></p>
         <ul style="color:var(--text-2);line-height:1.9">
          <li>Candidates found: ${r.candidatesFound}</li>
          <li>Accepted after filtering: ${r.accepted}</li>
          <li>Duplicates removed: ${r.duplicatesRemoved}</li>
          <li>Excluded: ${r.excluded}</li>
         </ul>
         ${reasons ? `<p style="font-size:12.5px;color:var(--text-3)">Exclusion reasons:</p><ul style="font-size:12.5px;color:var(--text-3)">${reasons}</ul>` : ''}
         <p style="font-size:12px;color:var(--text-3)">Duration: ${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s</p>`,
        [{ label: 'Close', kind: 'ghost', onClick: () => {} }],
      );
    });
    wrap.querySelector('#d-playlist')?.addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<label class="label">Playlist name</label><input id="pl-name" class="input" value="${escapeHtml(s.artist.name)} — Collection"/>
        <div style="margin-top:14px"><label class="label">Description</label><textarea id="pl-desc" class="textarea">Discovered with SangeetPremi (created by SPOOKEYfr). ${state.selectedIds.size} tracks.</textarea></div>`;
      openModal('Create playlist', body, [
        {
          label: 'Save locally',
          kind: 'primary',
          onClick: () => {
            const name = (body.querySelector('#pl-name') as HTMLInputElement).value.trim() || `${s.artist.name} — Collection`;
            const desc = (body.querySelector('#pl-desc') as HTMLTextAreaElement).value;
            const p = store.createPlaylist(name, [...state.selectedIds], desc);
            toast(`Playlist “${name}” saved (${p.trackVideoIds.length} tracks)`, 'success');
            navigate('playlists', { id: p.id });
          },
        },
        { label: 'Cancel', kind: 'ghost', onClick: () => {} },
      ]);
    });
  }

  // Deep-link support: ?q=... triggers search, ?session=... loads saved session.
  const sessionId = params.get('session');
  const artistId = params.get('artist');
  if (sessionId && store.library?.sessions[sessionId]) {
    const s = store.library.sessions[sessionId];
    state.session = s;
    state.selected = s.artist;
    state.allTracks = s.tracks;
    state.selectedIds = new Set(s.tracks.map((t) => t.videoId));
    renderResults();
  } else if (artistId && store.library?.artists[artistId]) {
    const a = store.library.artists[artistId];
    const { channelId, discoveredAt, favorite, ...artist } = a;
    state.query = artist.name;
    void runDiscovery(artist.name);
  } else if (state.query) {
    void runDiscovery(state.query);
  }
}
