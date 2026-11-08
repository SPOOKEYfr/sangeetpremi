/**
 * MusicBrainz-First Artist Discovery View.
 * Provides canonical artist search, entity disambiguation, discography &
 * release-group exploration, Cover Art Archive artwork, and honest YouTube
 * playback linking without requiring a Google API key.
 */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import type { Artist, DiscoveryCategory, DiscoverySession, Track } from '../../types';
import { icon } from '../../components/icons';
import { trackCard, trackSkeleton } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { escapeHtml } from '../../utils/sanitize';
import type {
  CanonicalRecording,
  MusicBrainzArtist,
  MusicBrainzReleaseGroup,
  ReleaseType,
} from './musicbrainzModel';
import {
  RELEASE_TYPES,
  canonicalRecordingToTrack,
  mbArtistToAppArtist,
  hasVerifiedRecordingStream,
  applyRecordingRelationshipToTrack,
} from './musicbrainzModel';
import {
  loadArtistDiscography,
  loadReleaseGroupRecordings,
  searchMusicBrainzArtists,
} from './musicbrainzClient';
import { getUiMusicBrainzClient } from '../../services/musicbrainz/bridge';
import { watchUrl } from '../../utils/sanitize';

interface ViewState {
  artists: MusicBrainzArtist[];
  selectedArtist?: MusicBrainzArtist;
  releaseGroups: MusicBrainzReleaseGroup[];
  recordings: CanonicalRecording[];
  allTracks: Track[];
  releaseGroupTracks: Map<string, Track[]>;
  selectedIds: Set<string>;
  query: string;
  selectedReleaseGroupMbid?: string;
  filterReleaseType: ReleaseType | 'all';
  filterText: string;
  sortOrder: 'newest' | 'oldest' | 'title' | 'duration';
  viewMode: 'discography' | 'tracks';
  running: boolean;
}

export interface ReleaseAppearance {
  releaseGroupId: string;
  releaseGroupTitle: string;
  category?: DiscoveryCategory;
  publishedAt?: string;
  durationSeconds?: number;
  thumbnail?: string;
  versionTags: string[];
}

export type DiscoveryAction =
  | { type: 'select_release_group'; releaseGroupId: string }
  | { type: 'select_all_tracks' }
  | { type: 'select_discography' }
  | { type: 'clear_release_focus' };

/**
 * Handles user navigation and focus actions between discography, individual releases, and All Tracks.
 */
export function handleDiscoveryAction(
  state: {
    selectedReleaseGroupMbid?: string;
    viewMode: 'discography' | 'tracks';
  },
  action: DiscoveryAction,
): void {
  switch (action.type) {
    case 'select_release_group':
      state.selectedReleaseGroupMbid = action.releaseGroupId;
      state.viewMode = 'tracks';
      break;
    case 'select_all_tracks':
      state.selectedReleaseGroupMbid = undefined;
      state.viewMode = 'tracks';
      break;
    case 'clear_release_focus':
      state.selectedReleaseGroupMbid = undefined;
      state.viewMode = 'tracks';
      break;
    case 'select_discography':
      state.selectedReleaseGroupMbid = undefined;
      state.viewMode = 'discography';
      break;
  }
}

/**
 * Aggregates release-group recordings into the artist's full track collection.
 * - Deduplicates by canonical recording MBID (one aggregate row per MBID).
 * - Preserves all known release-group associations and titles as provenance in track.metadata.
 * - Merges version tags without dropping legitimate associations.
 */
export function aggregateReleaseTracks(existing: Track[], incoming: Track[]): Track[] {
  const result = [...existing];
  for (const track of incoming) {
    const existingIndex = result.findIndex((t) => t.id === track.id);
    if (existingIndex >= 0) {
      const prev = result[existingIndex];
      const prevReleases: ReleaseAppearance[] =
        Array.isArray(prev.metadata?.releases)
          ? [...prev.metadata.releases]
          : prev.releaseGroupId
            ? [
                {
                  releaseGroupId: prev.releaseGroupId,
                  releaseGroupTitle: prev.channelTitle || '',
                  category: prev.category,
                  publishedAt: prev.publishedAt,
                  durationSeconds: prev.durationSeconds,
                  thumbnail: prev.thumbnail,
                  versionTags: prev.versionTags || [],
                },
              ]
            : [];

      if (track.releaseGroupId && !prevReleases.some((r) => r.releaseGroupId === track.releaseGroupId)) {
        prevReleases.push({
          releaseGroupId: track.releaseGroupId,
          releaseGroupTitle: track.channelTitle || '',
          category: track.category,
          publishedAt: track.publishedAt,
          durationSeconds: track.durationSeconds,
          thumbnail: track.thumbnail,
          versionTags: track.versionTags || [],
        });
      }

      const releaseGroupIds = [
        ...new Set([
          ...(Array.isArray(prev.metadata?.releaseGroupIds)
            ? prev.metadata.releaseGroupIds
            : [prev.releaseGroupId].filter(Boolean)),
          track.releaseGroupId,
        ].filter(Boolean)),
      ];

      const mergedTags = [...new Set([...(prev.versionTags || []), ...(track.versionTags || [])])];

      // In aggregate presentation, composite all associated release titles rather than misleadingly
      // showing only the first-discovered release title as universal
      const compositeChannelTitle = prevReleases
        .map((r) => r.releaseGroupTitle)
        .filter(Boolean)
        .join(', ');

      result[existingIndex] = {
        ...prev,
        channelTitle: compositeChannelTitle || prev.channelTitle,
        versionTags: mergedTags,
        metadata: {
          ...prev.metadata,
          releases: prevReleases,
          releaseGroupIds,
        },
      };
    } else {
      const releaseGroupIds = track.releaseGroupId ? [track.releaseGroupId] : [];
      const releases: ReleaseAppearance[] = track.releaseGroupId
        ? [
            {
              releaseGroupId: track.releaseGroupId,
              releaseGroupTitle: track.channelTitle || '',
              category: track.category,
              publishedAt: track.publishedAt,
              durationSeconds: track.durationSeconds,
              thumbnail: track.thumbnail,
              versionTags: track.versionTags || [],
            },
          ]
        : [];
      result.push({
        ...track,
        metadata: {
          ...track.metadata,
          releases,
          releaseGroupIds,
        },
      });
    }
  }
  return result;
}

/**
 * Filters and sorts visible tracks based on active release focus, release-type filter, search text, and sort order.
 */
export function filterVisibleTracks(
  allTracks: Track[],
  releaseGroupTracks: Map<string, Track[]>,
  selectedReleaseGroupMbid: string | undefined,
  filterReleaseType: ReleaseType | 'all' = 'all',
  filterText: string = '',
  sortOrder: 'newest' | 'oldest' | 'title' | 'duration' = 'newest',
): Track[] {
  let list: Track[];
  if (selectedReleaseGroupMbid) {
    const releaseTracks = releaseGroupTracks.get(selectedReleaseGroupMbid);
    if (releaseTracks) {
      list = releaseTracks;
    } else {
      list = allTracks.filter((t) => t.releaseGroupId === selectedReleaseGroupMbid);
    }
  } else {
    list = allTracks;
  }
  if (filterReleaseType !== 'all') {
    list = list.filter((t) => (t.versionTags || []).includes(filterReleaseType));
  }
  if (filterText) {
    const q = filterText.toLowerCase();
    list = list.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    if (sortOrder === 'title') return a.title.localeCompare(b.title);
    if (sortOrder === 'newest') return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    if (sortOrder === 'oldest') return (a.publishedAt || '').localeCompare(b.publishedAt || '');
    if (sortOrder === 'duration') return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
    return 0;
  });
}

export async function renderDiscover(el: HTMLElement, params: URLSearchParams): Promise<void> {
  const initialQuery = params.get('q') ?? '';

  const state: ViewState = {
    artists: [],
    selectedArtist: undefined,
    releaseGroups: [],
    recordings: [],
    allTracks: [],
    releaseGroupTracks: new Map(),
    selectedIds: new Set(),
    query: initialQuery,
    selectedReleaseGroupMbid: undefined,
    filterReleaseType: 'all',
    filterText: '',
    sortOrder: 'newest',
    viewMode: 'discography',
    running: false,
  };

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <section class="clay" style="padding:26px 30px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;flex-wrap:wrap">
        <h2>Explore MusicBrainz Catalogue</h2>
        <span class="badge teal" style="font-size:11.5px">${icon('shield', 13)} Open Data Commons · Key-Free</span>
      </div>
      <p style="margin:0 0 18px;font-size:13.5px;color:var(--text-2);max-width:760px">
        Search any musician, band, or composer. Explore canonical discographies, release groups, and recordings from MusicBrainz with Cover Art Archive artwork — no Google API key required.
      </p>
      <form id="d-search" style="display:flex;gap:12px;flex-wrap:wrap">
        <input id="d-q" class="input" style="flex:1;min-width:260px;font-size:15px" placeholder="Artist, band, or composer name (e.g. Coldplay, A.R. Rahman, Nirvana)…" value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Artist name for MusicBrainz discovery"/>
        <button class="btn btn-primary" type="submit" id="d-go">${icon('search', 16)} Search Artist</button>
      </form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap;gap:8px">
        <span style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em">Release types to explore</span>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" id="d-types-all" style="padding:4px 10px;font-size:11.5px">Select all</button>
          <button type="button" class="btn btn-ghost btn-sm" id="d-types-def" style="padding:4px 10px;font-size:11.5px">Reset defaults</button>
        </div>
      </div>
      <div id="d-release-types" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px"></div>
    </section>

    <div id="d-progress"></div>
    <div id="d-disambiguation"></div>
    <div id="d-results"></div>
  </div>`;

  // Release type filter chips
  const typesWrap = el.querySelector('#d-release-types')!;
  const selectedTypes = new Set<ReleaseType>(['Album', 'Single', 'EP', 'Soundtrack']);
  for (const rt of RELEASE_TYPES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${selectedTypes.has(rt.id) ? ' active' : ''}`;
    b.textContent = rt.label;
    b.title = rt.description;
    b.addEventListener('click', () => {
      if (selectedTypes.has(rt.id)) selectedTypes.delete(rt.id);
      else selectedTypes.add(rt.id);
      b.classList.toggle('active');
      renderResults();
    });
    typesWrap.appendChild(b);
  }

  el.querySelector('#d-types-all')?.addEventListener('click', () => {
    for (const rt of RELEASE_TYPES) selectedTypes.add(rt.id);
    typesWrap.querySelectorAll('.chip').forEach((b) => b.classList.add('active'));
    renderResults();
  });

  el.querySelector('#d-types-def')?.addEventListener('click', () => {
    selectedTypes.clear();
    ['Album', 'Single', 'EP', 'Soundtrack'].forEach((id) => selectedTypes.add(id as ReleaseType));
    typesWrap.querySelectorAll('.chip').forEach((b) => {
      const label = b.textContent;
      const matched = RELEASE_TYPES.find((x) => x.label === label);
      if (matched && selectedTypes.has(matched.id)) b.classList.add('active');
      else b.classList.remove('active');
    });
    renderResults();
  });

  el.querySelector('#d-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (el.querySelector('#d-q') as HTMLInputElement).value.trim();
    if (!q) return;
    void runDiscovery(q);
  });

  async function runDiscovery(query: string): Promise<void> {
    state.query = query;
    state.running = true;
    state.artists = [];
    state.selectedArtist = undefined;
    state.releaseGroups = [];
    state.recordings = [];
    state.allTracks = [];
    state.releaseGroupTracks.clear();
    state.selectedIds.clear();
    state.selectedReleaseGroupMbid = undefined;
    store.pushHistory(query);

    renderDisambiguation();
    renderResults();

    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    progressEl.innerHTML = `<div class="clay clay-sm" style="padding:18px 24px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-bottom:10px">
        <span id="d-msg">Querying MusicBrainz open catalogue for “${escapeHtml(query)}”…</span>
      </div>
      <div class="progress-track"><div class="progress-bar" id="d-bar" style="width:50%"></div></div>
    </div>`;

    try {
      const candidates = await searchMusicBrainzArtists(query);
      state.artists = candidates;
      progressEl.innerHTML = '';

      if (candidates.length === 0) {
        toast('No MusicBrainz artist matches found. Try a different name.', 'error');
        state.running = false;
        return;
      }

      // If unambiguous (single high-confidence match), auto-load discography
      if (candidates.length === 1) {
        await selectArtist(candidates[0]);
      } else {
        renderDisambiguation();
        state.running = false;
      }
    } catch (err) {
      progressEl.innerHTML = '';
      state.running = false;
      toast((err as Error).message, 'error');
    }
  }

  async function selectArtist(mbArtist: MusicBrainzArtist): Promise<void> {
    state.selectedArtist = mbArtist;
    state.running = true;
    renderDisambiguation();

    const progressEl = el.querySelector('#d-progress') as HTMLElement;
    progressEl.innerHTML = `<div class="clay clay-sm" style="padding:18px 24px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-2);margin-bottom:10px">
        <span>Loading canonical discography and Cover Art Archive for <strong>${escapeHtml(mbArtist.name)}</strong>…</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width:80%"></div></div>
    </div>`;

    try {
      const entry = await loadArtistDiscography(mbArtist.id);
      state.releaseGroups = entry.releaseGroups;
      state.recordings = entry.recordings;

      state.releaseGroupTracks.clear();
      // Pre-seed releaseGroupTracks for any recordings with a verified releaseGroupMbid
      for (const rec of entry.recordings) {
        if (!rec.releaseGroupMbid) continue;
        const track = canonicalRecordingToTrack(rec, mbArtist.name);
        const existing = state.releaseGroupTracks.get(rec.releaseGroupMbid) || [];
        existing.push(track);
        state.releaseGroupTracks.set(rec.releaseGroupMbid, existing);
      }

      // Convert canonical recordings to application tracks with release provenance
      const initialTracks = entry.recordings.map((rec) => canonicalRecordingToTrack(rec, mbArtist.name));
      state.allTracks = aggregateReleaseTracks([], initialTracks);

      // Select tracks by canonical recording MBID
      state.selectedIds = new Set(
        state.allTracks
          .slice(0, 30)
          .map((t) => t.id),
      );

      // Persist artist in local store
      const appArtist: Artist = mbArtistToAppArtist(mbArtist);
      store.saveArtist({
        ...appArtist,
        discoveredAt: Date.now(),
        favorite: store.library?.artists[appArtist.id]?.favorite ?? false,
      });

      // Construct and persist discovery session
      const now = Date.now();
      const session: DiscoverySession = {
        id: `mb-sess-${mbArtist.id.slice(0, 8)}`,
        artist: appArtist,
        status: 'completed',
        depth: 'standard',
        categories: ['album', 'single', 'soundtrack'],
        tracks: state.allTracks,
        report: {
          query: state.query,
          artistId: appArtist.id,
          candidatesFound: state.recordings.length,
          accepted: state.recordings.length,
          duplicatesRemoved: 0,
          excluded: 0,
          exclusionReasons: {},
          startedAt: now,
          finishedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      };
      store.saveSession(session);

      progressEl.innerHTML = '';
      renderDisambiguation();
      renderResults();
      toast(`Loaded ${state.releaseGroups.length} release groups & ${state.recordings.length} recordings for ${mbArtist.name}`, 'success');
    } catch (err) {
      progressEl.innerHTML = '';
      toast((err as Error).message, 'error');
    } finally {
      state.running = false;
    }
  }

  function renderDisambiguation(): void {
    const wrap = el.querySelector('#d-disambiguation') as HTMLElement;
    if (!state.artists.length) {
      wrap.innerHTML = '';
      return;
    }

    const isMultiple = state.artists.length > 1;

    wrap.innerHTML = `
    <section class="clay" style="padding:22px 26px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0">${isMultiple ? 'Disambiguate Artist (MusicBrainz)' : 'Selected Artist'}</h3>
        <span class="badge muted">${state.artists.length} ${state.artists.length === 1 ? 'match' : 'matches'}</span>
      </div>
      <p style="font-size:12.5px;color:var(--text-3);margin:0 0 16px">
        ${isMultiple ? 'Multiple distinct artists share this name. Pick the exact musical identity you want to explore:' : 'Canonical entity resolved from MusicBrainz:'}
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${state.artists
          .map((a) => {
            const isSelected = state.selectedArtist?.id === a.id;
            const lifespan = a.lifeSpan?.begin ? `${a.lifeSpan.begin}${a.lifeSpan.ended ? `–${a.lifeSpan.end ?? ''}` : '–present'}` : '';
            return `
            <div class="clay clay-sm disambiguation-card" data-id="${escapeHtml(a.id)}" style="${isSelected ? 'outline:2px solid var(--accent-violet);background:var(--bg-3)' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <span style="font-weight:700;font-size:15px;color:var(--text-1)">${escapeHtml(a.name)}</span>
                <div style="display:flex;gap:4px;align-items:center">
                  ${a.isCuratedPreview ? '<span class="badge warm" style="font-size:10px">Preview Data</span>' : '<span class="badge teal" style="font-size:10px">Live</span>'}
                  ${a.type ? `<span class="badge muted" style="font-size:11px">${escapeHtml(a.type)}</span>` : ''}
                </div>
              </div>
              ${
                a.disambiguation
                  ? `<div style="font-size:12.5px;color:var(--accent-violet);line-height:1.4">${escapeHtml(a.disambiguation)}</div>`
                  : ''
              }
              <div style="font-size:11.5px;color:var(--text-3);display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">
                ${a.area ? `<span>${escapeHtml(a.area)}</span>` : ''}
                ${a.country ? `<span>(${escapeHtml(a.country)})</span>` : ''}
                ${lifespan ? `<span>· ${lifespan}</span>` : ''}
              </div>
              ${
                a.tags && a.tags.length
                  ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
                      ${a.tags.slice(0, 3).map((t) => `<span class="badge" style="font-size:10px;padding:1px 6px">${escapeHtml(t)}</span>`).join('')}
                    </div>`
                  : ''
              }
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                <a href="https://musicbrainz.org/artist/${escapeHtml(a.id)}" target="_blank" rel="noopener" class="badge muted" style="font-size:10.5px" title="View on MusicBrainz.org" onclick="event.stopPropagation()">
                  MBID: ${escapeHtml(a.id.slice(0, 8))}… ↗
                </a>
                <button class="btn btn-ghost btn-sm select-btn" style="padding:4px 10px;font-size:11.5px">
                  ${isSelected ? `${icon('check', 13)} Selected` : 'Explore'}
                </button>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </section>`;

    wrap.querySelectorAll('.disambiguation-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.id;
        const matched = state.artists.find((a) => a.id === id);
        if (matched) void selectArtist(matched);
      });
    });
  }

  function visibleReleaseGroups(): MusicBrainzReleaseGroup[] {
    let rgs = state.releaseGroups;
    if (state.filterReleaseType !== 'all') {
      rgs = rgs.filter((rg) => rg.primaryType === state.filterReleaseType);
    }
    if (state.filterText) {
      const q = state.filterText.toLowerCase();
      rgs = rgs.filter((rg) => rg.title.toLowerCase().includes(q));
    }
    return [...rgs].sort((a, b) => {
      if (state.sortOrder === 'newest') return (b.firstReleaseDate || '').localeCompare(a.firstReleaseDate || '');
      if (state.sortOrder === 'oldest') return (a.firstReleaseDate || '').localeCompare(b.firstReleaseDate || '');
      if (state.sortOrder === 'title') return a.title.localeCompare(b.title);
      return 0;
    });
  }

  function visibleTracks(): Track[] {
    return filterVisibleTracks(
      state.allTracks,
      state.releaseGroupTracks,
      state.selectedReleaseGroupMbid,
      state.filterReleaseType,
      state.filterText,
      state.sortOrder,
    );
  }

  async function selectReleaseGroup(rgId: string): Promise<void> {
    if (state.selectedReleaseGroupMbid === rgId) {
      handleDiscoveryAction(state, { type: 'select_discography' });
      renderResults();
      return;
    }

    handleDiscoveryAction(state, { type: 'select_release_group', releaseGroupId: rgId });

    const rg = state.releaseGroups.find((g) => g.id === rgId);
    const rgTitle = rg?.title ?? 'Release';

    if (!state.releaseGroupTracks.has(rgId)) {
      const contentEl = el.querySelector('#d-content');
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="clay clay-sm" style="padding:28px;text-align:center">
            <div class="progress-bar" style="width:60%;margin:0 auto 12px"></div>
            <p style="margin:0;font-size:13px;color:var(--text-2)">Loading recordings for <strong>${escapeHtml(rgTitle)}</strong> via MusicBrainz…</p>
          </div>`;
      }

      try {
        const recs = await loadReleaseGroupRecordings(
          rgId,
          rg?.title,
          rg?.primaryType,
          state.selectedArtist?.name,
        );
        const tracks: Track[] = recs.map((r) =>
          canonicalRecordingToTrack(r, state.selectedArtist?.name || ''),
        );
        state.releaseGroupTracks.set(rgId, tracks);

        // Aggregate into allTracks preserving one row per recording MBID and provenance
        state.allTracks = aggregateReleaseTracks(state.allTracks, tracks);
      } catch (err) {
        state.releaseGroupTracks.set(rgId, []);
        toast(`Failed to load recordings for ${rgTitle}: ${(err as Error).message}`, 'error');
      }
    }

    renderResults();
  }

  function renderResults(): void {
    const wrap = el.querySelector('#d-results') as HTMLElement;
    const a = state.selectedArtist;

    if (!a) {
      if (state.running) {
        wrap.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            <div style="font-size:12.5px;color:var(--text-3);margin-bottom:4px">Loading discography and canonical recordings…</div>
            <div id="d-skeletons" style="display:flex;flex-direction:column;gap:10px"></div>
          </div>`;
        const skWrap = wrap.querySelector('#d-skeletons')!;
        for (let i = 0; i < 4; i++) skWrap.appendChild(trackSkeleton());
      } else {
        wrap.innerHTML = '';
      }
      return;
    }

    const rgs = visibleReleaseGroups();
    const tracks = visibleTracks();

    // Calculate honest stream verification counts based on genuine relationship proof
    const verifiedStreamsCount = state.allTracks.filter((t) => hasVerifiedRecordingStream(t)).length;
    const unmappedStreamsCount = state.allTracks.length - verifiedStreamsCount;
    const isFav = store.library?.artists[a.id]?.favorite ?? false;

    // Release type counts
    const typeCounts = new Map<ReleaseType, number>();
    for (const rg of state.releaseGroups) {
      typeCounts.set(rg.primaryType, (typeCounts.get(rg.primaryType) ?? 0) + 1);
    }

    wrap.innerHTML = `
    <section class="clay" style="padding:24px 28px;margin-bottom:22px">
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h2 style="margin:0">${escapeHtml(a.name)}</h2>
            ${a.isCuratedPreview ? '<span class="badge warm" title="Curated offline catalogue entry for demonstration">Preview / Demo Data</span>' : '<span class="badge teal">Live MusicBrainz</span>'}
            <a href="https://musicbrainz.org/artist/${escapeHtml(a.id)}" target="_blank" rel="noopener" class="badge muted" title="Verified MusicBrainz Entity">
              MBID: ${escapeHtml(a.id.slice(0, 8))}… ↗
            </a>
          </div>
          ${
            a.disambiguation
              ? `<div style="color:var(--accent-violet);font-size:13px;margin-top:4px">${escapeHtml(a.disambiguation)}</div>`
              : ''
          }
          <div style="color:var(--text-3);font-size:12.5px;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
            ${a.area ? `<span>Origin: ${escapeHtml(a.area)}</span>` : ''}
            ${a.country ? `<span>(${escapeHtml(a.country)})</span>` : ''}
            ${a.lifeSpan?.begin ? `<span>Active: ${escapeHtml(a.lifeSpan.begin)}–present</span>` : ''}
          </div>
          ${
            a.isCuratedPreview
              ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;display:flex;align-items:center;gap:6px">
                  <span style="color:#f0c9a8">ℹ</span> <span>Curated preview entry (offline sandbox dataset). Live MusicBrainz queries require external network connectivity.</span>
                </div>`
              : ''
          }
        </div>

        <button class="btn btn-ghost btn-sm" id="d-fav">${icon('heart', 15)} ${isFav ? 'Favorited' : 'Favorite'}</button>
        <button class="btn btn-teal btn-sm" id="d-playlist" ${state.selectedIds.size ? '' : 'disabled'}>
          ${icon('list', 15)} New playlist (${state.selectedIds.size})
        </button>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px">
        <span class="badge">${state.releaseGroups.length} release groups</span>
        <span class="badge teal">${state.allTracks.length} canonical recordings</span>
        <span class="badge muted" title="Recordings with verified YouTube stream">${verifiedStreamsCount} streams mapped</span>
        <span class="badge muted" title="Recordings awaiting stream mapping">${unmappedStreamsCount} unmapped</span>
        ${[...typeCounts.entries()].map(([type, count]) => `<span class="badge muted">${escapeHtml(type)}: ${count}</span>`).join('')}
      </div>
    </section>

    <section style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <div style="display:flex;gap:6px">
        <button class="btn ${state.viewMode === 'discography' && !state.selectedReleaseGroupMbid ? 'btn-primary' : 'btn-ghost'} btn-sm" id="d-mode-disco">
          ${icon('grid', 14)} Discography (${state.releaseGroups.length})
        </button>
        <button class="btn ${state.viewMode === 'tracks' && !state.selectedReleaseGroupMbid ? 'btn-primary' : 'btn-ghost'} btn-sm" id="d-mode-tracks">
          ${icon('music', 14)} All Tracks (${state.selectedReleaseGroupMbid ? state.allTracks.length : tracks.length})
        </button>
      </div>

      <input id="d-filter" class="input" style="width:220px;padding:8px 14px;font-size:13px" placeholder="Filter title…" value="${escapeHtml(state.filterText)}" aria-label="Filter title"/>
      
      <select id="d-type" class="select" style="width:auto;padding:8px 14px;font-size:13px" aria-label="Filter by release type">
        <option value="all" ${state.filterReleaseType === 'all' ? 'selected' : ''}>All release types</option>
        ${RELEASE_TYPES.map((rt) => `<option value="${rt.id}" ${state.filterReleaseType === rt.id ? 'selected' : ''}>${rt.label}</option>`).join('')}
      </select>

      <select id="d-sort" class="select" style="width:auto;padding:8px 14px;font-size:13px" aria-label="Sort order">
        <option value="newest" ${state.sortOrder === 'newest' ? 'selected' : ''}>Release date (Newest)</option>
        <option value="oldest" ${state.sortOrder === 'oldest' ? 'selected' : ''}>Release date (Oldest)</option>
        <option value="title" ${state.sortOrder === 'title' ? 'selected' : ''}>Title (A–Z)</option>
        <option value="duration" ${state.sortOrder === 'duration' ? 'selected' : ''}>Duration (Longest)</option>
      </select>

      ${
        state.selectedReleaseGroupMbid
          ? `<button class="chip active" id="d-clear-rg" title="Clear release group focus">Focused: ${escapeHtml(state.releaseGroups.find((g) => g.id === state.selectedReleaseGroupMbid)?.title ?? '')} (${tracks.length}) ✕</button>`
          : ''
      }

      <span style="flex:1"></span>
      <button class="chip" id="d-selall">Select all</button>
      <button class="chip" id="d-selclear">Clear</button>
    </section>

    <div id="d-content"></div>`;

    // Hook up view mode toggles
    wrap.querySelector('#d-mode-disco')?.addEventListener('click', () => {
      handleDiscoveryAction(state, { type: 'select_discography' });
      renderResults();
    });
    wrap.querySelector('#d-mode-tracks')?.addEventListener('click', () => {
      handleDiscoveryAction(state, { type: 'select_all_tracks' });
      renderResults();
    });

    // Favorite artist button
    wrap.querySelector('#d-fav')?.addEventListener('click', () => {
      store.toggleFavoriteArtist(a.id);
      renderResults();
      toast(store.library?.artists[a.id]?.favorite ? `★ Added ${a.name} to favorites` : `Removed ${a.name} from favorites`, 'info');
    });

    // Clear release group focus
    wrap.querySelector('#d-clear-rg')?.addEventListener('click', () => {
      handleDiscoveryAction(state, { type: 'clear_release_focus' });
      renderResults();
    });

    // Create playlist button
    wrap.querySelector('#d-playlist')?.addEventListener('click', () => {
      const selectedTracks = state.allTracks.filter((t) => state.selectedIds.has(t.id));
      if (!selectedTracks.length) return;
      const body = document.createElement('div');
      body.innerHTML = `
        <label class="label">Playlist title</label>
        <input id="np-name" class="input" value="${escapeHtml(a.name)} — Essentials" style="margin-bottom:12px"/>
        <p style="font-size:12.5px;color:var(--text-3);margin:0">Includes ${selectedTracks.length} canonical tracks in your local library.</p>`;
      const modal = openModal('Create Playlist', body, [
        {
          label: 'Create',
          kind: 'primary',
          onClick: () => {
            const name = (body.querySelector('#np-name') as HTMLInputElement).value.trim();
            if (!name) return;
            // Ensure session with all tracks is saved so store.allTracks() resolves them
            const appArtist: Artist = mbArtistToAppArtist(a);
            const now = Date.now();
            store.saveSession({
              id: `mb-sess-${a.id.slice(0, 8)}`,
              artist: appArtist,
              status: 'completed',
              depth: 'standard',
              categories: ['album', 'single', 'soundtrack'],
              tracks: state.allTracks,
              report: {
                query: state.query,
                artistId: appArtist.id,
                candidatesFound: state.recordings.length,
                accepted: state.recordings.length,
                duplicatesRemoved: 0,
                excluded: 0,
                exclusionReasons: {},
                startedAt: now,
                finishedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            });
            const p = store.createPlaylist(name, selectedTracks.map((t) => t.id));
            modal.close();
            toast(`Created playlist “${name}” with ${p.trackIds.length} tracks`, 'success');
            navigate('playlists', { id: p.id });
          },
        },
        { label: 'Cancel', kind: 'ghost', onClick: () => modal.close() },
      ]);
    });

    // Filters and sort listeners
    wrap.querySelector('#d-filter')?.addEventListener('input', (e) => {
      state.filterText = (e.target as HTMLInputElement).value;
      renderResults();
    });
    wrap.querySelector('#d-type')?.addEventListener('change', (e) => {
      state.filterReleaseType = (e.target as HTMLSelectElement).value as any;
      renderResults();
    });
    wrap.querySelector('#d-sort')?.addEventListener('change', (e) => {
      state.sortOrder = (e.target as HTMLSelectElement).value as any;
      renderResults();
    });
    wrap.querySelector('#d-selall')?.addEventListener('click', () => {
      tracks.forEach((t) => state.selectedIds.add(t.id));
      renderResults();
    });
    wrap.querySelector('#d-selclear')?.addEventListener('click', () => {
      state.selectedIds.clear();
      renderResults();
    });

    const contentEl = wrap.querySelector('#d-content') as HTMLElement;

    // RENDER DISCOGRAPHY GRID
    if (state.viewMode === 'discography') {
      if (!rgs.length) {
        contentEl.innerHTML = `
          <div class="clay clay-sm empty-state" style="padding:34px">
            <div class="glyph">💿</div>
            <h3>No release groups match these filters</h3>
            <p>Try resetting the release type or clearing your title search.</p>
          </div>`;
        return;
      }

      contentEl.innerHTML = `
        <div class="discography-grid">
          ${rgs
            .map((rg) => {
              const year = rg.firstReleaseDate ? rg.firstReleaseDate.slice(0, 4) : '';
              const isSelected = state.selectedReleaseGroupMbid === rg.id;
              return `
              <div class="clay clay-sm release-group-card ${isSelected ? 'active' : ''}" data-rg="${escapeHtml(rg.id)}">
                <div style="position:relative;width:100%;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--bg-3);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-raised-sm)">
                  ${
                    rg.coverArtUrl
                      ? `<img src="${escapeHtml(rg.coverArtUrl)}" alt="${escapeHtml(rg.title)}" width="220" height="220" loading="lazy" class="rg-art-img" style="width:100%;height:100%;object-fit:cover"/>`
                      : `<div class="rg-art-fallback" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--accent-violet)">${icon('disc', 48)}</div>`
                  }
                  <span class="badge" style="position:absolute;top:8px;left:8px;font-size:10px;padding:2px 8px;background:rgba(20,18,31,0.85);backdrop-filter:blur(4px)">
                    ${escapeHtml(rg.primaryType)}
                  </span>
                  ${year ? `<span class="badge muted" style="position:absolute;bottom:8px;right:8px;font-size:10px;padding:2px 7px;background:rgba(0,0,0,0.8);backdrop-filter:blur(4px)">${escapeHtml(year)}</span>` : ''}
                </div>
                <div>
                  <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(rg.title)}">
                    ${escapeHtml(rg.title)}
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:11.5px;color:var(--text-3)">
                    <span>${rg.trackCount ? `${rg.trackCount} tracks` : 'Release'}</span>
                    <a href="https://musicbrainz.org/release-group/${escapeHtml(rg.id)}" target="_blank" rel="noopener" class="badge muted" style="font-size:9.5px;padding:1px 5px" onclick="event.stopPropagation()">
                      MBID ↗
                    </a>
                  </div>
                </div>
              </div>`;
            })
            .join('')}
        </div>`;

      // Event-based image error handler for release group artwork (MV3 CSP compliant)
      contentEl.querySelectorAll('.rg-art-img').forEach((img) => {
        img.addEventListener('error', () => {
          const fallback = document.createElement('div');
          fallback.className = 'rg-art-fallback';
          fallback.style.cssText =
            'display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--accent-violet)';
          fallback.innerHTML = icon('disc', 48);
          img.replaceWith(fallback);
        });
      });

      contentEl.querySelectorAll('.release-group-card').forEach((card) => {
        card.addEventListener('click', () => {
          const rgId = (card as HTMLElement).dataset.rg;
          if (rgId) void selectReleaseGroup(rgId);
        });
      });
      return;
    }

    // RENDER TRACKS LIST
    if (!tracks.length) {
      const isReleaseFocused = Boolean(state.selectedReleaseGroupMbid);
      contentEl.innerHTML = `
        <div class="clay clay-sm empty-state" style="padding:34px">
          <div class="glyph">🎧</div>
          <h3>${isReleaseFocused ? 'No recordings found for this release' : 'No canonical recordings match these filters'}</h3>
          <p>${isReleaseFocused ? 'This release group does not have indexed recordings in MusicBrainz.' : 'Try resetting the release type or clearing your title search.'}</p>
        </div>`;
      return;
    }

    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    contentEl.appendChild(listEl);

    const relationshipPending = new Set<string>();

    const resolveTrackRelationship = async (track: Track): Promise<void> => {
      if (track.youtubeVerified || relationshipPending.has(track.id)) return;
      relationshipPending.add(track.id);

      try {
        const client = getUiMusicBrainzClient();
        const rel = await client.getRecordingYouTubeRelationship(track.id);
        applyRecordingRelationshipToTrack(track, rel);

        if (hasVerifiedRecordingStream(track)) {
          const cardEl = el.querySelector(`.track-card[data-id="${track.id}"]`);
          if (cardEl) {
            const actionContainer = cardEl.querySelector('.track-stream-action');
            const destUrl = track.youtubeUrl ?? (track.youtubeVideoId ? watchUrl(track.youtubeVideoId) : '');
            if (actionContainer && destUrl) {
              actionContainer.innerHTML = `
                <a class="btn btn-ghost btn-sm yt-stream-btn" href="${escapeHtml(destUrl)}" target="_blank" rel="noopener" title="Stream verified YouTube video in new tab" aria-label="Stream verified video for ${escapeHtml(track.title)} on YouTube">
                  <span style="color:#ff5555;display:flex;align-items:center">${icon('youtube', 15)}</span>
                  <span style="font-size:12px">Watch ↗</span>
                </a>`;
            }
          }
        }
      } catch {
        // If lookup fails or network offline, track remains unmapped
      } finally {
        relationshipPending.delete(track.id);
      }
    };

    // Render tracks in responsive chunks
    const CHUNK = 40;
    let idx = 0;
    const renderChunk = () => {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < CHUNK && idx < tracks.length; i++, idx++) {
        const t = tracks[idx];
        frag.appendChild(
          trackCard(t, {
            selected: state.selectedIds.has(t.id),
            showCheckbox: true,
            onToggle: (id) => {
              if (state.selectedIds.has(id)) state.selectedIds.delete(id);
              else state.selectedIds.add(id);
              renderResults();
            },
          }),
        );
        if (!t.youtubeVerified) {
          void resolveTrackRelationship(t);
        }
      }
      listEl.appendChild(frag);
      if (idx < tracks.length) requestAnimationFrame(renderChunk);
    };
    renderChunk();
  }

  // If a query parameter was passed in URL (e.g. from Home or Popup), auto-run discovery immediately!
  if (initialQuery) {
    void runDiscovery(initialQuery);
  }
}
