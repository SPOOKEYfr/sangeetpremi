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
    <div id="p-brand" style="margin-bottom:14px"></div>
    <form id="p-search" style="display:flex;gap:8px" role="search">
      <input id="p-q" class="input" style="flex:1;padding:10px 14px;font-size:13.5px" placeholder="Search artist (MusicBrainz)…" autocomplete="off" aria-label="Search artist on MusicBrainz"/>
      <button class="btn btn-primary btn-sm" style="padding:10px 14px" title="Explore artist" aria-label="Explore artist">${icon('search', 15)}</button>
    </form>
    ${
      recent.length
        ? `<div style="margin-top:14px">
            <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">Recent Searches</div>
            ${recent
              .map(
                (h) =>
                  `<button class="chip p-recent" data-q="${escapeHtml(h.query)}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin-bottom:5px;padding:8px 12px"><span style="flex:none;color:var(--accent-violet)">${icon('clock', 13)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(h.query)}</span></button>`,
              )
              .join('')}
          </div>`
        : `<div style="margin-top:12px;font-size:12px;color:var(--text-3);text-align:center;padding:10px 0">Type any artist above to explore music</div>`
    }
    ${
      playlists.length
        ? `<div style="margin-top:12px">
            <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px">Playlists</div>
            ${playlists
              .map(
                (p) =>
                  `<button class="chip p-pl" data-id="${p.id}" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;margin-bottom:5px;padding:8px 12px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon('list', 13)} ${escapeHtml(p.name)}</span><span class="badge muted" style="flex:none">${p.trackVideoIds.length}</span></button>`,
              )
              .join('')}
          </div>`
        : ''
    }
    <div class="divider" style="margin:14px 0 10px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" id="p-open" style="flex:1" title="Open Dashboard in new tab">${icon('external', 14)} Dashboard</button>
      <button class="btn btn-ghost btn-sm" id="p-side" style="flex:1" title="Open docked side panel">${icon('list', 14)} Side Panel</button>
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
  root.querySelector('#p-brand')?.appendChild(brandHeader(30));
}

boot().catch((e) => {
  document.getElementById('popup-root')!.textContent = `Error: ${e}`;
});
