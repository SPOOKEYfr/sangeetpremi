/** Extension popup: quick artist search + recent activity + shortcuts. */
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/components.css';
import { store } from '../../state/store';
import { brandHeader } from '../../components/logo';
import { icon } from '../../components/icons';
import { escapeHtml } from '../../utils/sanitize';

async function boot(): Promise<void> {
  await store.init();
  const root = document.getElementById('popup-root')!;
  const recent = store.library?.history.slice(0, 5) ?? [];
  const playlists = Object.values(store.library?.playlists ?? {}).slice(0, 3);

  root.innerHTML = `
  <div style="padding:18px 18px 14px">
    <div style="margin-bottom:14px">${''}</div>
    <form id="p-search" style="display:flex;gap:8px">
      <input id="p-q" class="input" style="flex:1;padding:10px 14px;font-size:13.5px" placeholder="Search an artist…" autocomplete="off"/>
      <button class="btn btn-primary btn-sm" style="padding:10px 14px" title="Discover">${icon('search', 15)}</button>
    </form>
    ${recent.length ? `<div style="margin-top:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">Recent</div>
      ${recent.map((h) => `<button class="chip p-recent" data-q="${escapeHtml(h.query)}" style="display:block;width:100%;text-align:left;margin-bottom:5px">${icon('clock', 13)} ${escapeHtml(h.query)}</button>`).join('')}
    </div>` : ''}
    ${playlists.length ? `<div style="margin-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">Playlists</div>
      ${playlists.map((p) => `<button class="chip p-pl" data-id="${p.id}" style="display:block;width:100%;text-align:left;margin-bottom:5px">${icon('list', 13)} ${escapeHtml(p.name)} <span class="badge muted">${p.trackVideoIds.length}</span></button>`).join('')}
    </div>` : ''}
    <div class="divider" style="margin:14px 0 10px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" id="p-open" style="flex:1">${icon('external', 14)} Dashboard</button>
      <button class="btn btn-ghost btn-sm" id="p-side" style="flex:1" title="Open side panel">${icon('list', 14)} Panel</button>
    </div>
    <div style="text-align:center;margin-top:10px;font-size:10.5px;color:var(--text-3)">Created &amp; developed by <strong>SPOOKEYfr</strong></div>
  </div>`;

  root.querySelector('#p-search')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (root.querySelector('#p-q') as HTMLInputElement).value.trim();
    if (!q) return;
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/dashboard.html#/discover?q=${encodeURIComponent(q)}`) });
    window.close();
  });
  root.querySelectorAll('.p-recent').forEach((b) =>
    b.addEventListener('click', () => {
      const q = (b as HTMLElement).dataset.q!;
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/dashboard.html#/discover?q=${encodeURIComponent(q)}`) });
      window.close();
    }),
  );
  root.querySelectorAll('.p-pl').forEach((b) =>
    b.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/dashboard.html#/playlists?id=${(b as HTMLElement).dataset.id}`) });
      window.close();
    }),
  );
  root.querySelector('#p-open')!.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/app/dashboard.html') });
    window.close();
  });
  root.querySelector('#p-side')!.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
    } catch {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/extension/sidepanel/sidepanel.html') });
    }
    window.close();
  });

  // brand header
  const brandSlot = root.querySelector('div');
  brandSlot?.appendChild(brandHeader(30));
}

boot().catch((e) => {
  document.getElementById('popup-root')!.textContent = `Error: ${e}`;
});
