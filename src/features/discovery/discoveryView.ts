/**
 * Artist discovery view (v0.2): single & multi-artist discovery,
 * language/year filters, related-artist suggestions, incremental refresh.
 */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import { loadConfig } from '../../services/config';
import { YouTubeClient } from '../../services/youtube/api';
import { DiscoveryEngine, type ProgressEvent } from '../../services/discovery/engine';
import { filterByCategory, filterByLanguage, filterByYearRange, searchTracks, sortTracks } from '../../services/discovery/filters';
import { computeStats, relatedArtists } from '../../services/discovery/stats';
import type { Artist, DiscoveryCategory, DiscoveryDepth, DiscoverySession, Track } from '../../types';
import { DISCOVERY_CATEGORIES } from '../../types';
import { icon } from '../../components/icons';
import { trackCard, categoryLabel } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { escapeHtml, playlistUrl } from '../../utils/sanitize';
import { collectLanguages } from '../../utils/language';

interface ViewState {
  artists: Artist[];
  selected?: Artist;
  session?: DiscoverySession;
  allTracks: Track[];
  showDuplicates: boolean;
  selectedIds: Set<string>;
  query: string;
  filterCategory: DiscoveryCategory | 'all';
  filterText: string;
  filterLang: string;
  yearFrom?: number;
  yearTo?: number;
  sortKey: 'title' | 'publishedAt' | 'viewCount' | 'duration';
  running: boolean;
  refreshResult?: { newTracks: Track[]; stillPresent: number; notRefreshed: number };
}

export async function renderDiscover(el: HTMLElement, params: URLSearchParams): Promise<void> {
  const state: ViewState = {
    artists: [], allTracks: [], showDuplicates: false, selectedIds: new Set(),
    query: params.get('q') ?? '', filterCategory: 'all', filterText: '', filterLang: 'all',
    sortKey: 'viewCount', running: false,
  };

  el.innerHTML = `
  <div class="fade-in" style="max-width:1100px">
    <section class="clay" style="padding:26px 30px;margin-bottom:22px">
      <h2 style="margin-bottom:6px">Discover music</h2>
      <p style="margin:0 0 18px;font-size:13.5px">Search one artist — or several at once, separated by commas. We classify every result and remove duplicates automatically.</p>
      <form id="d-search" style="display:flex;gap:12px;flex-wrap:wrap">
        <input id="d-q" class="input" style="flex:1;min-width:240px;font-size:15px" placeholder="e.g. Arijit Singh, Shreya Ghoshal" value="${escapeHtml(state.query)}" autocomplete="off"/>
        <select id="d-depth" class="select" style="width:auto" title="Discovery depth">
          <option value="quick">Quick</option>
          <option value="standard" selected>Standard</option>
          <option value="deep">Deep</option>
        </select>
        <button class="btn btn-primary" type="submit" id="d-go">${icon('search', 16)} Discover</button>
      </form>
      <div id="d-categories" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:16px"></div>
    </section>
    <div id="d-progress"></div>
    <div id="d-artists"></div>
    <div id="d-results"></div>
  </div>`;

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
  const depthSel = el.querySelector('#d-depth') as HTMLSelectElement;
  depthSel.value = store.settings.defaultDepth;

  el.querySelector('#d-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (el.querySelector('#d-q') as HTMLInputElement).value.trim();
    if (q) void runDiscovery(q);
  });

  async function getClient(): Promise<YouTubeClient> {
    const cfg = await loadConfig();
    if (!cfg.youtubeApiKey) {
      openModal('YouTube API key required',
        `<p>Live discovery uses the official YouTube Data API. Add your API key in <a href="#/settings">Settings</a> first.</p>
         <p style="font-size:12.5px;color:var(--text-3)">See <code>docs/SETUP_YOUTUBE_API.md</code>. Your key stays on your device.</p>`,
        [{ label: 'Open Settings', kind: 'primary', onClick: () => navigate('settings') }, { label: 'Close', kind: 'ghost', onClick: () => {} }]);
      throw new Error('no-key');
    }
    return new YouTubeClient(cfg.youtubeApiKey);
  }

  function progressShell(): HTMLElement {
    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    progressEl.innerHTML = `<div class="clay clay-sm" style="padding:20px 24px;margin-bottom:22px">
      <div style="font-size:13px;color:var(--text-2);margin-bottom:10px" id="d-msg">Starting…</div>
      <div class="progress-track"><div class="progress-bar" id="d-bar"></div></div></div>`;
    return progressEl;
  }
  function makeProgress(progressEl: HTMLElement): (ev: ProgressEvent) => void {
    return (ev) => {
      const msg = progressEl.querySelector('#d-msg');
      const bar = progressEl.querySelector('#d-bar') as HTMLElement;
      if (msg) msg.textContent = ev.message;
      if (bar) {
        if (ev.total) bar.style.width = `${Math.round(((ev.done ?? 0) / ev.total) * 100)}%`;
        else if (ev.phase === 'done') bar.style.width = '100%';
      }
    };
  }

  async function runDiscovery(query: string): Promise<void> {
    state.query = query;
    state.running = true;
    state.artists = []; state.selected = undefined; state.session = undefined;
    state.allTracks = []; state.selectedIds.clear(); state.refreshResult = undefined;
    store.pushHistory(query);
    renderArtists(); renderResults();
    const progressEl = progressShell();
    const onProgress = makeProgress(progressEl);
    try {
      const client = await getClient();
      const engine = new DiscoveryEngine(client);
      const queries = query.split(',').map((s) => s.trim()).filter(Boolean);
      const depth = depthSel.value as DiscoveryDepth;
      const opts = { depth, categories: [...selectedCats], dedup: store.settings.dedupStrictness, maxPerQuery: store.settings.maxResultsPerQuery };

      if (queries.length > 1) {
        // ---- multi-artist discovery ----
        onProgress({ phase: 'resolve', message: `Discovering ${queries.length} artists…` });
        const { artists, sessions, merged } = await engine.discoverMany(queries, opts, onProgress);
        if (!sessions.length) {
          toast('No artist matches found. Try different spellings.', 'error');
          progressEl.innerHTML = ''; state.running = false; return;
        }
        const combined: DiscoverySession = {
          id: sessions.map((s) => s.id).join('+'),
          artist: { id: 'multi', name: artists.map((a) => a.name).join(' + '), normalizedName: 'multi' },
          status: 'completed', depth, categories: [...selectedCats],
          tracks: merged.tracks,
          report: {
            query, candidatesFound: sessions.reduce((s, x) => s + x.report.candidatesFound, 0),
            accepted: merged.tracks.length, duplicatesRemoved: merged.duplicates.length,
            excluded: sessions.reduce((s, x) => s + x.report.excluded, 0),
            exclusionReasons: {}, startedAt: Date.now(), finishedAt: Date.now(),
          },
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        for (const s of sessions) store.saveSession(s);
        for (const a of artists) store.saveArtist({ ...a, discoveredAt: Date.now(), favorite: store.library?.artists[a.id]?.favorite ?? false });
        state.session = combined;
        state.allTracks = [...merged.tracks, ...merged.duplicates];
        state.selectedIds = new Set(merged.tracks.slice(0, 50).map((t) => t.videoId));
        store.saveSession(combined);
        progressEl.innerHTML = '';
        renderResults();
        toast(`Discovered ${merged.tracks.length} tracks across ${artists.length} artists`, 'success');
      } else {
        // ---- single artist with disambiguation ----
        state.artists = await engine.resolveArtists(query, onProgress);
        renderArtists();
        if (!state.artists.length) {
          toast('No artist matches found. Try a different spelling.', 'error');
          progressEl.innerHTML = ''; state.running = false; return;
        }
        if (state.artists.length === 1) {
          await discoverArtist(state.artists[0], engine, onProgress);
        } else {
          onProgress({ phase: 'resolve', message: 'Multiple artists match — pick one below.' });
          progressEl.innerHTML = ''; state.running = false;
        }
      }
    } catch (err) {
      progressEl.innerHTML = ''; state.running = false;
      if ((err as Error).message !== 'no-key') toast((err as Error).message, 'error');
    }
  }

  async function discoverArtist(artist: Artist, engine?: DiscoveryEngine, onProgress?: (e: ProgressEvent) => void): Promise<void> {
    state.selected = artist; state.running = true;
    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    if (!progressEl.innerHTML) progressShell();
    const progress = (ev: ProgressEvent) => {
      const pEl = el.querySelector('#d-progress') as HTMLElement;
      makeProgress(pEl)(ev);
      onProgress?.(ev);
    };
    try {
      const client = engine ? undefined : await getClient();
      const eng = engine ?? new DiscoveryEngine(client!);
      const depth = depthSel.value as DiscoveryDepth;
      const { session, tracks } = await eng.discover(artist, { depth, categories: [...selectedCats], dedup: store.settings.dedupStrictness, maxPerQuery: store.settings.maxResultsPerQuery }, progress);
      state.session = session; state.allTracks = tracks;
      state.selectedIds = new Set(session.tracks.slice(0, 50).map((t) => t.videoId));
      store.saveSession(session);
      store.saveArtist({ ...artist, discoveredAt: Date.now(), favorite: store.library?.artists[artist.id]?.favorite ?? false });
      (el.querySelector('#d-progress') as HTMLElement).innerHTML = '';
      renderArtists(); renderResults();
      toast(`Discovery complete — ${session.tracks.length} tracks for ${artist.name}`, 'success');
    } catch (err) {
      (el.querySelector('#d-progress') as HTMLElement).innerHTML = '';
      toast((err as Error).message, 'error');
    } finally {
      state.running = false;
    }
  }

  async function refreshDiscovery(): Promise<void> {
    if (!state.session || state.running) return;
    state.running = true;
    const progressEl = progressShell();
    const onProgress = makeProgress(progressEl);
    try {
      const client = await getClient();
      const engine = new DiscoveryEngine(client);
      const depth = depthSel.value as DiscoveryDepth;
      const { diff } = await engine.refresh(state.session, { depth, categories: [...selectedCats], dedup: store.settings.dedupStrictness, maxPerQuery: store.settings.maxResultsPerQuery }, onProgress);
      progressEl.innerHTML = '';
      state.refreshResult = { newTracks: diff.newTracks, stillPresent: diff.stillPresent, notRefreshed: diff.notRefreshed };
      renderResults();
      if (!diff.newTracks.length) toast('No new tracks found — collection is up to date.', 'info');
      else toast(`Found ${diff.newTracks.length} new track${diff.newTracks.length > 1 ? 's' : ''} — review below.`, 'success');
    } catch (err) {
      progressEl.innerHTML = '';
      toast((err as Error).message, 'error');
    } finally {
      state.running = false;
    }
  }

  function renderArtists(): void {
    const wrap = el.querySelector('#d-artists') as HTMLElement;
    if (!state.artists.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<section class="clay" style="padding:22px 26px;margin-bottom:22px">
      <h3 style="margin-bottom:4px">${state.artists.length > 1 ? 'Who did you mean?' : 'Artist'}</h3>
      <p style="font-size:12.5px;margin:0 0 16px">Pick the right artist — we never guess silently.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
        ${state.artists.map((a, i) => `
        <button class="clay clay-sm artist-pick" data-i="${i}" style="display:flex;gap:13px;align-items:center;padding:13px;text-align:left;border:none;cursor:pointer;${state.selected?.id === a.id ? 'outline:2px solid var(--accent)' : ''}">
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
    list = filterByCategory(list, state.filterCategory);
    list = filterByLanguage(list, state.filterLang);
    list = filterByYearRange(list, state.yearFrom, state.yearTo);
    list = searchTracks(list, state.filterText);
    return sortTracks(list, state.sortKey);
  }

  function renderResults(): void {
    const wrap = el.querySelector('#d-results') as HTMLElement;
    const s = state.session;
    if (!s) { wrap.innerHTML = ''; return; }
    const tracks = visibleTracks();
    const r = s.report;
    const catCounts = new Map<DiscoveryCategory, number>();
    for (const t of s.tracks) catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1);
    const langs = collectLanguages(s.tracks.map((t) => t.title));
    const stats = computeStats(s);
    const related = relatedArtists(s);
    const years = s.tracks.map((t) => t.publishedAt?.slice(0, 4)).filter((y): y is string => !!y).sort();
    const minYear = years[0] ? Number(years[0]) : undefined;
    const maxYear = years.length ? Number(years[years.length - 1]) : undefined;

    wrap.innerHTML = `
    <section class="clay" style="padding:24px 28px;margin-bottom:22px">
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        ${s.artist.thumbnail ? `<img class="avatar" src="${escapeHtml(s.artist.thumbnail)}" width="64" height="64" alt=""/>` : ''}
        <div style="flex:1;min-width:200px">
          <h2>${escapeHtml(s.artist.name)}</h2>
          <div style="color:var(--text-3);font-size:12.5px;margin-top:4px">${escapeHtml(s.artist.country ?? '')} ${s.artist.subscriberCount ? '· ' + (s.artist.subscriberCount / 1e6).toFixed(1) + 'M subscribers' : ''} ${stats.yearRange.min ? `· ${stats.yearRange.min}–${stats.yearRange.max}` : ''}</div>
        </div>
        ${s.artist.id !== 'multi' ? `<button class="btn btn-ghost btn-sm" id="d-fav">${icon('heart', 15)} ${store.library?.artists[s.artist.id]?.favorite ? 'Favorited' : 'Favorite'}</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="d-refresh" ${state.running ? 'disabled' : ''}>${icon('sparkles', 15)} Refresh discovery</button>
        <button class="btn btn-ghost btn-sm" id="d-report">${icon('info', 15)} Report</button>
        <button class="btn btn-teal" id="d-playlist" ${state.selectedIds.size ? '' : 'disabled'}>${icon('list', 15)} New playlist (${state.selectedIds.size})</button>
        <a class="btn btn-ghost" href="${playlistUrl([...state.selectedIds])}" target="_blank" rel="noopener">${icon('youtube', 15)} Play on YouTube</a>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px">
        <span class="badge">${r.candidatesFound} candidates</span>
        <span class="badge teal">${r.accepted} kept</span>
        <span class="badge warm">${r.duplicatesRemoved} duplicates</span>
        <span class="badge muted">${r.excluded} excluded</span>
        ${[...catCounts.entries()].map(([c, n]) => `<span class="badge muted">${escapeHtml(categoryLabel(c))}: ${n}</span>`).join('')}
      </div>
      ${related.length ? `<div style="margin-top:16px">
        <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Related artists (from discovered collaborations)</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${related.map((ra) => `<button class="chip rel-artist" data-q="${escapeHtml(ra.name)}" title="${escapeHtml(ra.reason)}">${escapeHtml(ra.name)} <span class="badge muted">${ra.sharedTracks}</span></button>`).join('')}
        </div>
      </div>` : ''}
    </section>

    ${state.refreshResult ? `
    <section class="clay" style="padding:20px 26px;margin-bottom:22px;border-left:4px solid var(--accent-2)">
      <h3 style="margin-bottom:6px">Refresh results</h3>
      <p style="font-size:13px;margin:0 0 12px">${state.refreshResult.newTracks.length} new · ${state.refreshResult.stillPresent} re-confirmed · ${state.refreshResult.notRefreshed} existing tracks untouched. Nothing was changed automatically.</p>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary btn-sm" id="d-merge-new" ${state.refreshResult.newTracks.length ? '' : 'disabled'}>Add ${state.refreshResult.newTracks.length} new tracks to this collection</button>
        <button class="btn btn-ghost btn-sm" id="d-dismiss-refresh">Dismiss</button>
      </div>
    </section>` : ''}

    <section style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <input id="d-filter" class="input" style="width:200px;padding:9px 14px;font-size:13px" placeholder="Filter results…" value="${escapeHtml(state.filterText)}"/>
      <select id="d-cat" class="select" style="width:auto;padding:9px 14px;font-size:13px">
        <option value="all">All categories</option>
        ${DISCOVERY_CATEGORIES.map((c) => `<option value="${c.id}" ${state.filterCategory === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
      <select id="d-lang" class="select" style="width:auto;padding:9px 14px;font-size:13px" title="Language filter (heuristic for Latin scripts)">
        <option value="all">All languages</option>
        ${langs.map((l) => `<option value="${l.code}" ${state.filterLang === l.code ? 'selected' : ''}>${escapeHtml(l.label)}${l.confidence === 'heuristic' ? ' (est.)' : ''}</option>`).join('')}
      </select>
      ${minYear ? `<select id="d-yfrom" class="select" style="width:auto;padding:9px 14px;font-size:13px" title="From year (verified from upload date)">
        <option value="">From year</option>
        ${Array.from({ length: maxYear! - minYear + 1 }, (_, i) => minYear! + i).map((y) => `<option value="${y}" ${state.yearFrom === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <select id="d-yto" class="select" style="width:auto;padding:9px 14px;font-size:13px" title="To year (verified from upload date)">
        <option value="">To year</option>
        ${Array.from({ length: maxYear! - minYear + 1 }, (_, i) => minYear! + i).map((y) => `<option value="${y}" ${state.yearTo === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>` : ''}
      <select id="d-sort" class="select" style="width:auto;padding:9px 14px;font-size:13px">
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
      listEl.innerHTML = `<div class="clay clay-sm empty-state" style="padding:34px"><div class="glyph">🎧</div><h3>No tracks match these filters</h3><p>Try clearing a filter or enabling duplicates.</p></div>`;
    }
    const CHUNK = 40;
    let idx = 0;
    const renderChunk = () => {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < CHUNK && idx < tracks.length; i++, idx++) {
        const t = tracks[idx];
        frag.appendChild(trackCard(t, {
          selected: state.selectedIds.has(t.videoId), showCheckbox: true,
          onToggle: (id) => {
            if (state.selectedIds.has(id)) state.selectedIds.delete(id);
            else state.selectedIds.add(id);
            renderResults();
          },
        }));
      }
      listEl.appendChild(frag);
      if (idx < tracks.length) requestAnimationFrame(renderChunk);
    };
    renderChunk();

    wrap.querySelector('#d-filter')?.addEventListener('input', (e) => { state.filterText = (e.target as HTMLInputElement).value; renderResults(); });
    wrap.querySelector('#d-cat')?.addEventListener('change', (e) => { state.filterCategory = (e.target as HTMLSelectElement).value as DiscoveryCategory | 'all'; renderResults(); });
    wrap.querySelector('#d-lang')?.addEventListener('change', (e) => { state.filterLang = (e.target as HTMLSelectElement).value; renderResults(); });
    wrap.querySelector('#d-yfrom')?.addEventListener('change', (e) => { state.yearFrom = (e.target as HTMLSelectElement).value ? Number((e.target as HTMLSelectElement).value) : undefined; renderResults(); });
    wrap.querySelector('#d-yto')?.addEventListener('change', (e) => { state.yearTo = (e.target as HTMLSelectElement).value ? Number((e.target as HTMLSelectElement).value) : undefined; renderResults(); });
    wrap.querySelector('#d-sort')?.addEventListener('change', (e) => { state.sortKey = (e.target as HTMLSelectElement).value as ViewState['sortKey']; renderResults(); });
    wrap.querySelector('#d-dups')?.addEventListener('click', () => { state.showDuplicates = !state.showDuplicates; renderResults(); });
    wrap.querySelector('#d-selall')?.addEventListener('click', () => { for (const t of tracks) state.selectedIds.add(t.videoId); renderResults(); });
    wrap.querySelector('#d-selclear')?.addEventListener('click', () => { state.selectedIds.clear(); renderResults(); });
    wrap.querySelectorAll('.rel-artist').forEach((b) => b.addEventListener('click', () => {
      const q = (b as HTMLElement).dataset.q!;
      (el.querySelector('#d-q') as HTMLInputElement).value = q;
      void runDiscovery(q);
    }));
    wrap.querySelector('#d-refresh')?.addEventListener('click', () => void refreshDiscovery());
    wrap.querySelector('#d-dismiss-refresh')?.addEventListener('click', () => { state.refreshResult = undefined; renderResults(); });
    wrap.querySelector('#d-merge-new')?.addEventListener('click', () => {
      // Merge ONLY the reviewed new tracks — existing session tracks and any
      // user playlists built from them are never modified.
      if (!state.session || !state.refreshResult) return;
      const existingIds = new Set(state.session.tracks.map((t) => t.videoId));
      const toAdd = state.refreshResult.newTracks.filter((t) => !existingIds.has(t.videoId));
      state.session.tracks = [...state.session.tracks, ...toAdd];
      state.session.report.accepted += toAdd.length;
      state.session.updatedAt = Date.now();
      store.saveSession(state.session);
      state.allTracks = [...state.allTracks, ...toAdd];
      for (const t of toAdd) state.selectedIds.add(t.videoId);
      state.refreshResult = undefined;
      renderResults();
      toast(`Added ${toAdd.length} new tracks. Existing collection preserved.`, 'success');
    });
    wrap.querySelector('#d-fav')?.addEventListener('click', () => { store.toggleFavoriteArtist(s.artist.id); renderResults(); });
    wrap.querySelector('#d-report')?.addEventListener('click', () => {
      const reasons = Object.entries(r.exclusionReasons).map(([k, v]) => `<li>${escapeHtml(k)}: ${v}</li>`).join('');
      openModal('Discovery report',
        `<p>Query: <strong>${escapeHtml(r.query)}</strong></p>
         <ul style="color:var(--text-2);line-height:1.9">
          <li>Candidates found: ${r.candidatesFound}</li><li>Accepted after filtering: ${r.accepted}</li>
          <li>Duplicates removed: ${r.duplicatesRemoved}</li><li>Excluded: ${r.excluded}</li></ul>
         ${reasons ? `<p style="font-size:12.5px;color:var(--text-3)">Exclusion reasons:</p><ul style="font-size:12.5px;color:var(--text-3)">${reasons}</ul>` : ''}
         <p style="font-size:12px;color:var(--text-3)">Duration: ${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s</p>`,
        [{ label: 'Close', kind: 'ghost', onClick: () => {} }]);
    });
    wrap.querySelector('#d-playlist')?.addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<label class="label">Playlist name</label><input id="pl-name" class="input" value="${escapeHtml(s.artist.name)} — Collection"/>
        <div style="margin-top:14px"><label class="label">Description</label><textarea id="pl-desc" class="textarea">Discovered with SangeetPremi (created by SPOOKEYfr). ${state.selectedIds.size} tracks.</textarea></div>`;
      openModal('Create playlist', body, [
        {
          label: 'Save locally', kind: 'primary',
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

  const sessionId = params.get('session');
  const artistId = params.get('artist');
  if (sessionId && store.library?.sessions[sessionId]) {
    const s = store.library.sessions[sessionId];
    state.session = s; state.selected = s.artist; state.allTracks = s.tracks;
    state.selectedIds = new Set(s.tracks.map((t) => t.videoId));
    renderResults();
  } else if (artistId && store.library?.artists[artistId]) {
    const a = store.library.artists[artistId];
    state.query = a.name;
    void runDiscovery(a.name);
  } else if (state.query) {
    void runDiscovery(state.query);
  }
}
