/**
 * Artist comparison (v0.2): side-by-side catalogue stats for two saved
 * artists. Counts are verified (derived from stored discovery sessions);
 * language info is labelled as estimated where heuristic.
 */
import { store } from '../../state/store';
import { computeStats } from '../../services/discovery/stats';
import { DISCOVERY_CATEGORIES, type Artist, type DiscoverySession } from '../../types';
import { icon } from '../../components/icons';
import { escapeHtml } from '../../utils/sanitize';
import { navigate } from '../../app/router';

export function renderCompare(el: HTMLElement): void {
  const artists = Object.values(store.library?.artists ?? {}).sort((a, b) => b.discoveredAt - a.discoveredAt);
  const sessions = Object.values(store.library?.sessions ?? {});

  const sessionFor = (artistId: string): DiscoverySession | undefined =>
    sessions.find((s) => s.artist.id === artistId && s.artist.id !== 'multi');

  el.innerHTML = `
  <div class="fade-in" style="max-width:1100px">
    <h2 style="margin-bottom:4px">Compare artists</h2>
    <p style="margin:0 0 22px;font-size:13.5px">Verified counts come from your stored discovery sessions. Language rows marked “est.” are heuristic.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
      ${[0, 1].map((i) => `
      <div class="clay clay-sm" style="padding:16px 18px">
        <label class="label">Artist ${i + 1}</label>
        <select class="select comp-pick" data-i="${i}" style="font-size:14px">
          <option value="">— choose an artist —</option>
          ${artists.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>`).join('')}
    </div>
    <div id="comp-result"></div>
  </div>`;

  const picks = el.querySelectorAll('.comp-pick') as NodeListOf<HTMLSelectElement>;
  const render = () => {
    const [aId, bId] = [...picks].map((p) => p.value);
    const out = el.querySelector('#comp-result') as HTMLElement;
    if (!aId || !bId) {
      out.innerHTML = `<div class="clay clay-sm empty-state" style="padding:36px"><div class="glyph">⚖️</div><h3>Pick two artists to compare</h3><p>Statistics are computed from your saved discoveries.</p></div>`;
      return;
    }
    if (aId === bId) {
      out.innerHTML = `<div class="clay clay-sm empty-state" style="padding:30px"><p>Pick two different artists.</p></div>`;
      return;
    }
    const a = store.library!.artists[aId] as Artist & { discoveredAt: number };
    const b = store.library!.artists[bId] as Artist & { discoveredAt: number };
    const sa = sessionFor(aId);
    const sb = sessionFor(bId);
    const statsA = sa ? computeStats(sa) : null;
    const statsB = sb ? computeStats(sb) : null;

    const row = (label: string, va: string, vb: string, verified: boolean) => `
      <div style="display:grid;grid-template-columns:180px 1fr 1fr;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.05);align-items:center">
        <div style="color:var(--text-2);font-size:13px">${label}${verified ? '' : ' <span class="badge warm" style="font-size:9.5px">est.</span>'}</div>
        <div style="font-weight:600;font-size:13.5px">${va}</div>
        <div style="font-weight:600;font-size:13.5px">${vb}</div>
      </div>`;

    const catRows = DISCOVERY_CATEGORIES.map((c) =>
      row(c.label, String(statsA?.categoryCounts[c.id] ?? (sa ? 0 : '—')), String(statsB?.categoryCounts[c.id] ?? (sb ? 0 : '—')), true),
    ).join('');

    const langStr = (s: typeof statsA) =>
      s && s.languages.length ? s.languages.map((l) => `${escapeHtml(l.label)}${l.confidence === 'heuristic' ? ' (est.)' : ''}`).join(', ') : '—';

    out.innerHTML = `
    <section class="clay" style="padding:24px 28px">
      <div style="display:grid;grid-template-columns:180px 1fr 1fr;gap:10px;padding-bottom:14px;border-bottom:2px solid rgba(255,255,255,.08);margin-bottom:6px">
        <div></div>
        <div style="display:flex;gap:12px;align-items:center">
          ${a.thumbnail ? `<img class="avatar" src="${escapeHtml(a.thumbnail)}" width="44" height="44" alt=""/>` : ''}
          <div><div style="font-weight:700">${escapeHtml(a.name)}</div><div style="font-size:11.5px;color:var(--text-3)">${a.country ?? ''}</div>
          <button class="chip comp-go" data-id="${escapeHtml(a.id)}" style="margin-top:6px">${icon('search', 12)} Discover</button></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          ${b.thumbnail ? `<img class="avatar" src="${escapeHtml(b.thumbnail)}" width="44" height="44" alt=""/>` : ''}
          <div><div style="font-weight:700">${escapeHtml(b.name)}</div><div style="font-size:11.5px;color:var(--text-3)">${b.country ?? ''}</div>
          <button class="chip comp-go" data-id="${escapeHtml(b.id)}" style="margin-top:6px">${icon('search', 12)} Discover</button></div>
        </div>
      </div>
      ${row('Tracks discovered (verified)', String(statsA?.totalTracks ?? 'no session'), String(statsB?.totalTracks ?? 'no session'), true)}
      ${row('Release period (verified)', statsA?.yearRange.min ? `${statsA.yearRange.min}–${statsA.yearRange.max}` : '—', statsB?.yearRange.min ? `${statsB.yearRange.min}–${statsB.yearRange.max}` : '—', true)}
      ${row('Languages', langStr(statsA), langStr(statsB), false)}
      ${row('Top collaboration channels', statsA?.collaborations[0]?.channelTitle ?? '—', statsB?.collaborations[0]?.channelTitle ?? '—', true)}
      <div style="margin-top:14px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">Category breakdown (verified)</div>
      ${catRows}
      <p style="font-size:11.5px;color:var(--text-3);margin:14px 0 0">“Verified” = counted from API-backed discovery sessions stored locally. “est.” = heuristic language guess from titles. Genre is not reliably available from YouTube metadata and is therefore not estimated.</p>
    </section>`;
    out.querySelectorAll('.comp-go').forEach((b) => b.addEventListener('click', () => navigate('discover', { artist: (b as HTMLElement).dataset.id ?? '' })));
  };
  picks.forEach((p) => p.addEventListener('change', render));
  render();
}
