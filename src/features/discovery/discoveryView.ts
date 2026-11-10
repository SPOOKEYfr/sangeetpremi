/**
 * MusicBrainz-First Artist Discovery View.
 * Provides canonical artist search, entity disambiguation, discography &
 * release-group exploration, Cover Art Archive artwork, and honest YouTube
 * playback linking without requiring a Google API key.
 */
import { store } from '../../state/store';
import { navigate } from '../../app/router';
import type { Artist, DiscoverySession, Track } from '../../types';
import { icon } from '../../components/icons';
import { trackCard, trackSkeleton } from '../../components/trackCard';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { escapeHtml } from '../../utils/sanitize';
import type {
  CanonicalRecording,
  MusicBrainzArtist,
  MusicBrainzReleaseGroup,
  ReleaseAppearance,
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

export type { ReleaseAppearance };

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
  relationshipPending: Set<string>;
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

export function computeStreamCounts(
  allTracks: Track[],
  pendingSet: Set<string> = new Set(),
): { verified: number; pending: number; unmapped: number } {
  let verified = 0;
  let pending = 0;
  for (const t of allTracks) {
    if (hasVerifiedRecordingStream(t)) {
      verified += 1;
    } else if (pendingSet.has(t.id)) {
      pending += 1;
    }
  }
  const unmapped = Math.max(0, allTracks.length - verified - pending);
  return { verified, pending, unmapped };
}

export function formatTrackCountSummary(params: {
  isFocused: boolean;
  focusedTitle?: string;
  visibleCount: number;
  scopeTotalCount: number;
  hasFilter: boolean;
}): { scopeLabel: string; countLabel: string } {
  const scopeLabel = params.isFocused && params.focusedTitle
    ? `Release: ${params.focusedTitle}`
    : 'All Canonical Tracks';

  let countLabel: string;
  if (params.hasFilter) {
    countLabel = `Showing ${params.visibleCount} of ${params.scopeTotalCount} tracks`;
  } else {
    countLabel = `${params.scopeTotalCount} ${params.scopeTotalCount === 1 ? 'track' : 'tracks'}`;
  }
  return { scopeLabel, countLabel };
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
    relationshipPending: new Set(),
  };

  el.innerHTML = `
  <div class="fade-in" style="max-width:1060px">
    <section class="clay" style="padding:26px 30px;margin-bottom:22px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;flex-wrap:wrap">
        <h2 style="margin:0;min-width:0;flex:1 1 280px">Explore MusicBrainz Catalogue</h2>
        <span class="badge teal" style="font-size:11.5px;flex:none">${icon('shield', 13)} Open Data Commons · Key-Free</span>
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
    state.relationshipPending.clear();
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

      // The artist browse preserves every release appearance for provenance.
      // Counts and per-release lists still use distinct canonical recordings.
      const uniqueRecordings = new Map<string, (typeof entry.recordings)[number]>();
      for (const rec of entry.recordings) {
        if (!uniqueRecordings.has(rec.id)) uniqueRecordings.set(rec.id, rec);
      }
      state.recordings = [...uniqueRecordings.values()];

      state.releaseGroupTracks.clear();
      const seenByReleaseGroup = new Map<string, Set<string>>();
      // Pre-seed releaseGroupTracks for any recordings with a verified releaseGroupMbid
      for (const rec of entry.recordings) {
        if (!rec.releaseGroupMbid) continue;
        let seen = seenByReleaseGroup.get(rec.releaseGroupMbid);
        if (!seen) {
          seen = new Set<string>();
          seenByReleaseGroup.set(rec.releaseGroupMbid, seen);
        }
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        const track = canonicalRecordingToTrack(rec, mbArtist.name);
        const existing = state.releaseGroupTracks.get(rec.releaseGroupMbid) || [];
        existing.push(track);
        state.releaseGroupTracks.set(rec.releaseGroupMbid, existing);
      }

      // Convert every canonical appearance to an application track. The
      // aggregate merges duplicate recording IDs into one card and retains
      // each appearance as release provenance.
      const initialTracks = entry.recordings.map((rec) => canonicalRecordingToTrack(rec, mbArtist.name));
      state.allTracks = aggregateReleaseTracks([], initialTracks);

      // Start with empty selection so user intentionally selects recordings to add to library
      state.selectedIds = new Set();

      // Persist artist in local store
      const appArtist: Artist = mbArtistToAppArtist(mbArtist);
      store.saveArtist({
        ...appArtist,
        discoveredAt: Date.now(),
        favorite: store.library?.artists[appArtist.id]?.favorite ?? false,
      });

      // Construct and persist discovery session for history (without auto-saving unselected tracks to library)
      const now = Date.now();
      const existingSession = store.library?.sessions[`mb-sess-${mbArtist.id.slice(0, 8)}`];
      const session: DiscoverySession = {
        id: `mb-sess-${mbArtist.id.slice(0, 8)}`,
        artist: appArtist,
        status: 'completed',
        depth: 'standard',
        categories: ['album', 'single', 'soundtrack'],
        tracks: existingSession?.tracks ?? [],
        report: {
          query: state.query,
          artistId: appArtist.id,
          candidatesFound: state.recordings.length,
          accepted: existingSession?.tracks?.length ?? 0,
          duplicatesRemoved: 0,
          excluded: 0,
          exclusionReasons: {},
          startedAt: now,
          finishedAt: now,
        },
        createdAt: existingSession?.createdAt ?? now,
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
        <h3 style="margin:0;min-width:0;flex:1 1 auto">${isMultiple ? 'Disambiguate Artist (MusicBrainz)' : 'Selected Artist'}</h3>
        <span class="badge muted" style="flex:none">${state.artists.length} ${state.artists.length === 1 ? 'match' : 'matches'}</span>
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
                <a href="https://musicbrainz.org/artist/${escapeHtml(a.id)}" target="_blank" rel="noopener" class="badge muted" style="font-size:10.5px" title="View on MusicBrainz.org">
                  MBID: ${escapeHtml(a.id.slice(0, 8))}… ↗
                </a>
                <button class="btn btn-ghost btn-sm select-btn" style="padding:5px 12px;font-size:12px;flex:none;white-space:nowrap">
                  ${isSelected ? `${icon('check', 13)} Selected` : 'Explore'}
                </button>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </section>`;

    wrap.querySelectorAll('.disambiguation-card a').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    wrap.querySelectorAll('.disambiguation-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
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

    // Calculate honest stream verification counts for exactly the cards in
    // view. In release focus this is the focused release, never the whole
    // artist aggregation.
    const streamCounts = computeStreamCounts(tracks, state.relationshipPending);
    const verifiedStreamsCount = streamCounts.verified;
    const pendingStreamsCount = streamCounts.pending;
    const unmappedStreamsCount = streamCounts.unmapped;
    const isFav = store.library?.artists[a.id]?.favorite ?? false;

    // Release type counts
    const typeCounts = new Map<ReleaseType, number>();
    for (const rg of state.releaseGroups) {
      typeCounts.set(rg.primaryType, (typeCounts.get(rg.primaryType) ?? 0) + 1);
    }

    const isReleaseFocused = Boolean(state.selectedReleaseGroupMbid);
    const focusedRg = isReleaseFocused
      ? state.releaseGroups.find((g) => g.id === state.selectedReleaseGroupMbid)
      : undefined;
    const focusedTitle = focusedRg?.title ?? '';
    const scopeTotalTracks = isReleaseFocused
      ? (state.releaseGroupTracks.get(state.selectedReleaseGroupMbid!) || []).length
      : state.allTracks.length;
    const hasFilter = Boolean(state.filterText || state.filterReleaseType !== 'all');
    const { scopeLabel, countLabel } = formatTrackCountSummary({
      isFocused: isReleaseFocused,
      focusedTitle,
      visibleCount: tracks.length,
      scopeTotalCount: scopeTotalTracks,
      hasFilter,
    });

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
        <button class="btn btn-primary btn-sm" id="d-add-library" ${state.selectedIds.size ? '' : 'disabled'} title="Add selected recordings to your local library">
          ${icon('library', 15)} Add to library (${state.selectedIds.size})
        </button>
        <button class="btn btn-teal btn-sm" id="d-playlist" ${state.selectedIds.size ? '' : 'disabled'} title="Create a new playlist from selected recordings">
          ${icon('list', 15)} New playlist (${state.selectedIds.size})
        </button>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px">
        <span class="badge">${state.releaseGroups.length} release groups</span>
        <span class="badge teal">${state.allTracks.length} canonical recordings</span>
        <span class="badge muted" id="d-badge-mapped" title="Recordings with verified YouTube stream">${verifiedStreamsCount} streams mapped</span>
        <span class="badge muted" id="d-badge-unmapped" title="Recordings awaiting stream mapping">${unmappedStreamsCount} unmapped</span>
        <span class="badge muted" id="d-badge-pending" title="Recordings currently checking stream verification" style="${pendingStreamsCount > 0 ? '' : 'display:none'}">${pendingStreamsCount} verifying…</span>
        ${[...typeCounts.entries()].map(([type, count]) => `<span class="badge muted">${escapeHtml(type)}: ${count}</span>`).join('')}
      </div>
    </section>

    <section style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <div style="display:flex;gap:6px">
        <button class="btn ${state.viewMode === 'discography' && !state.selectedReleaseGroupMbid ? 'btn-primary' : 'btn-ghost'} btn-sm" id="d-mode-disco">
          ${icon('grid', 14)} Discography (${state.releaseGroups.length})
        </button>
        <button class="btn ${state.viewMode === 'tracks' && !state.selectedReleaseGroupMbid ? 'btn-primary' : 'btn-ghost'} btn-sm" id="d-mode-tracks">
          ${icon('music', 14)} All Tracks (${state.allTracks.length})
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
          ? `<button class="chip active" id="d-clear-rg" title="Clear release group focus">Focused: ${escapeHtml(focusedTitle)} (${hasFilter ? `${tracks.length} of ${scopeTotalTracks}` : scopeTotalTracks} tracks) ✕</button>`
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

    // Add selected recordings to library button (Intentional library action)
    wrap.querySelector('#d-add-library')?.addEventListener('click', () => {
      const selectedTracks = state.allTracks.filter((t) => state.selectedIds.has(t.id));
      if (!selectedTracks.length) return;

      const newTracks = selectedTracks.filter((t) => !store.isInLibrary(t.id));
      const alreadySavedCount = selectedTracks.length - newTracks.length;

      if (newTracks.length > 0) {
        store.addTracksToLibrary(newTracks);
      }

      if (newTracks.length > 0 && alreadySavedCount > 0) {
        toast(`Added ${newTracks.length} ${newTracks.length === 1 ? 'recording' : 'recordings'} to your library (${alreadySavedCount} already saved)`, 'success');
      } else if (newTracks.length > 0 && alreadySavedCount === 0) {
        toast(`Added ${newTracks.length} ${newTracks.length === 1 ? 'recording' : 'recordings'} to your library`, 'success');
      } else {
        toast(`All ${selectedTracks.length} selected recordings are already in your library`, 'info');
      }
    });

    // Create playlist button
    wrap.querySelector('#d-playlist')?.addEventListener('click', () => {
      const selectedTracks = state.allTracks.filter((t) => state.selectedIds.has(t.id));
      if (!selectedTracks.length) return;
      const body = document.createElement('div');
      body.innerHTML = `
        <label class="label">Playlist title</label>
        <input id="np-name" class="input" value="${escapeHtml(a.name)} — Essentials" style="margin-bottom:12px"/>
        <p style="font-size:12.5px;color:var(--text-3);margin:0">Creates a new playlist containing ${selectedTracks.length} recordings. (Playlists are managed separately from your library).</p>`;
      const modal = openModal('Create Playlist', body, [
        {
          label: 'Create',
          kind: 'primary',
          onClick: () => {
            const name = (body.querySelector('#np-name') as HTMLInputElement).value.trim();
            if (!name) return;
            store.upsertTrackRecords(selectedTracks);
            const p = store.createPlaylist(name, selectedTracks.map((t) => t.id));
            modal.close();
            toast(`Created playlist “${name}” with ${p.trackIds.length} tracks`, 'success');
            navigate('playlists', { id: p.id });
          },
        },
        { label: 'Cancel', kind: 'ghost', onClick: () => modal.close() },
      ]);
      (body.querySelector('#np-name') as HTMLInputElement)?.focus();
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
                    <a href="https://musicbrainz.org/release-group/${escapeHtml(rg.id)}" target="_blank" rel="noopener" class="badge muted" style="font-size:9.5px;padding:1px 5px">
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

      contentEl.querySelectorAll('.release-group-card a').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      });

      contentEl.querySelectorAll('.release-group-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('a')) return;
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

    const headerEl = document.createElement('div');
    headerEl.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px';
    headerEl.innerHTML = `
      <div style="font-size:13px;color:var(--text-2);display:flex;gap:8px;align-items:center">
        <span style="font-weight:600;color:var(--text-1)">${escapeHtml(scopeLabel)}</span>
        <span class="badge muted" id="d-track-count-badge" style="font-size:11px">${escapeHtml(countLabel)}</span>
      </div>`;
    contentEl.appendChild(headerEl);

    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    contentEl.appendChild(listEl);

    const updateHeaderStreamCounts = (): void => {
      // Use the same card scope as the initial header so async relationship
      // resolution cannot leave the header counting a different track set.
      const counts = computeStreamCounts(tracks, state.relationshipPending);
      const mappedEl = el.querySelector('#d-badge-mapped');
      const unmappedEl = el.querySelector('#d-badge-unmapped');
      const pendingEl = el.querySelector('#d-badge-pending');

      if (mappedEl) mappedEl.textContent = `${counts.verified} streams mapped`;
      if (unmappedEl) unmappedEl.textContent = `${counts.unmapped} unmapped`;
      if (pendingEl) {
        if (counts.pending > 0) {
          pendingEl.textContent = `${counts.pending} verifying…`;
          (pendingEl as HTMLElement).style.display = '';
        } else {
          // Clear the text as well as hiding the badge so stale pending
          // counts cannot be read from the DOM after resolution.
          pendingEl.textContent = '';
          (pendingEl as HTMLElement).style.display = 'none';
        }
      }
    };

    const resolveTrackRelationship = async (track: Track): Promise<void> => {
      if (hasVerifiedRecordingStream(track) || state.relationshipPending.has(track.id)) return;
      state.relationshipPending.add(track.id);
      updateHeaderStreamCounts();

      // Show temporary verifying status in card if present
      const initialCard = el.querySelector(`.track-card[data-id="${track.id}"]`);
      if (initialCard) {
        const actionContainer = initialCard.querySelector('.track-stream-action');
        if (actionContainer && !hasVerifiedRecordingStream(track)) {
          actionContainer.innerHTML = `<span class="badge muted" style="font-size:10.5px;padding:3px 8px;opacity:0.75">Verifying…</span>`;
        }
      }

      try {
        const client = getUiMusicBrainzClient();
        const rel = await client.getRecordingYouTubeRelationship(track.id);
        applyRecordingRelationshipToTrack(track, rel);

        // Synchronize across both state.allTracks and all state.releaseGroupTracks
        for (const t of state.allTracks) {
          if (t.id === track.id) {
            applyRecordingRelationshipToTrack(t, rel);
          }
        }
        for (const list of state.releaseGroupTracks.values()) {
          for (const t of list) {
            if (t.id === track.id) {
              applyRecordingRelationshipToTrack(t, rel);
            }
          }
        }

        const cardEl = el.querySelector(`.track-card[data-id="${track.id}"]`);
        if (cardEl) {
          const actionContainer = cardEl.querySelector('.track-stream-action');
          if (actionContainer) {
            if (hasVerifiedRecordingStream(track)) {
              const destUrl = track.youtubeUrl ?? (track.youtubeVideoId ? watchUrl(track.youtubeVideoId) : '');
              if (destUrl) {
                actionContainer.innerHTML = `
                  <a class="btn btn-ghost btn-sm yt-stream-btn" href="${escapeHtml(destUrl)}" target="_blank" rel="noopener" title="Stream verified YouTube video in new tab" aria-label="Stream verified video for ${escapeHtml(track.title)} on YouTube">
                    <span style="color:#ff5555;display:flex;align-items:center">${icon('youtube', 15)}</span>
                    <span style="font-size:12px">Watch ↗</span>
                  </a>`;
                actionContainer.querySelectorAll('a').forEach((l) => l.addEventListener('click', (e) => e.stopPropagation()));
              }
            } else {
              actionContainer.innerHTML = `
                <span class="badge muted" title="No verified YouTube stream mapping exists for this canonical recording" style="font-size:10.5px;padding:3px 8px;opacity:0.85">Unmapped</span>`;
            }
          }
        }
      } catch {
        // If lookup fails or network offline, track remains unmapped
        const cardEl = el.querySelector(`.track-card[data-id="${track.id}"]`);
        const actionContainer = cardEl?.querySelector('.track-stream-action');
        if (actionContainer && !hasVerifiedRecordingStream(track)) {
          actionContainer.innerHTML = `
            <span class="badge muted" title="No verified YouTube stream mapping exists for this canonical recording" style="font-size:10.5px;padding:3px 8px;opacity:0.85">Unmapped</span>`;
        }
      } finally {
        state.relationshipPending.delete(track.id);
        updateHeaderStreamCounts();
      }
    };

    // Render tracks in responsive chunks
    const CHUNK = 40;
    let idx = 0;
    const renderChunk = () => {
      const frag = document.createDocumentFragment();
      const rendered: Track[] = [];
      for (let i = 0; i < CHUNK && idx < tracks.length; i++, idx++) {
        const t = tracks[idx];
        frag.appendChild(
          trackCard(t, {
            selected: state.selectedIds.has(t.id),
            showCheckbox: true,
            pendingStream: state.relationshipPending.has(t.id),
            onToggle: (id) => {
              if (state.selectedIds.has(id)) state.selectedIds.delete(id);
              else state.selectedIds.add(id);
              renderResults();
            },
          }),
        );
        rendered.push(t);
      }
      listEl.appendChild(frag);

      // Start lookups only after the cards are in the DOM so the synchronous
      // pending state can paint "Verifying…" on the same card the header
      // counts. Starting inside the loop queried a card still in the fragment.
      for (const t of rendered) {
        if (!t.youtubeVerified) {
          void resolveTrackRelationship(t);
        }
      }
      if (idx < tracks.length) requestAnimationFrame(renderChunk);
    };
    renderChunk();
  }

  // If a query parameter was passed in URL (e.g. from Home or Popup), auto-run discovery immediately!
  if (initialQuery) {
    void runDiscovery(initialQuery);
  }
}
