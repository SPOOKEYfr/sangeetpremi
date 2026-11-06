/** Settings: appearance, discovery defaults, credentials, data management. */
import { store } from '../../state/store';
import { loadConfig, saveConfig, clearConfig } from '../../services/config';
import { exportLibraryJson, importLibraryJson, wipeAllData } from '../../services/storage/storage';
import { DISCOVERY_CATEGORIES, type DiscoveryCategory } from '../../types';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { icon } from '../../components/icons';
import { isAuthorized, revoke } from '../../services/youtube/oauth';

export async function renderSettings(el: HTMLElement): Promise<void> {
  const s = store.settings;
  const cfg = await loadConfig();
  const authorized = await isAuthorized().catch(() => false);

  el.innerHTML = `
  <div class="fade-in" style="max-width:820px;display:flex;flex-direction:column;gap:22px">
    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:16px">Appearance</h3>
      <label class="label">Theme</label>
      <select id="st-theme" class="select" style="max-width:240px">
        <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark (signature)</option>
        <option value="system" ${s.theme === 'system' ? 'selected' : ''}>System</option>
      </select>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:6px">Discovery defaults</h3>
      <p style="font-size:12.5px;margin:0 0 16px">Used as the starting point for every new discovery.</p>
      <label class="label">Default depth</label>
      <select id="st-depth" class="select" style="max-width:240px;margin-bottom:18px">
        <option value="quick" ${s.defaultDepth === 'quick' ? 'selected' : ''}>Quick (fast, fewer queries)</option>
        <option value="standard" ${s.defaultDepth === 'standard' ? 'selected' : ''}>Standard</option>
        <option value="deep" ${s.defaultDepth === 'deep' ? 'selected' : ''}>Deep (more queries, uses more quota)</option>
      </select>
      <label class="label">Duplicate detection</label>
      <select id="st-dedup" class="select" style="max-width:280px;margin-bottom:18px">
        <option value="strict" ${s.dedupStrictness === 'strict' ? 'selected' : ''}>Strict — collapse all versions of a song</option>
        <option value="balanced" ${s.dedupStrictness === 'balanced' ? 'selected' : ''}>Balanced — keep live/remix/acoustic as separate entries</option>
        <option value="off" ${s.dedupStrictness === 'off' ? 'selected' : ''}>Off</option>
      </select>
      <label class="label">Default categories</label>
      <div id="st-cats" style="display:flex;flex-wrap:wrap;gap:7px"></div>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:6px">YouTube connection</h3>
      <p style="font-size:12.5px;margin:0 0 16px">Credentials are stored only in this browser's local extension storage and are sent exclusively to Google. See <code>docs/SETUP_YOUTUBE_API.md</code>.</p>
      <label class="label">YouTube Data API key</label>
      <input id="st-key" class="input" type="password" style="max-width:420px;margin-bottom:6px" placeholder="${cfg.youtubeApiKey ? '•••• configured ••' : 'Paste your API key'}"/>
      <label class="label" style="margin-top:14px">OAuth client id (for “Create on YouTube”)</label>
      <input id="st-client" class="input" type="password" style="max-width:420px;margin-bottom:6px" placeholder="${cfg.youtubeClientId ? '•••• configured ••' : 'Paste your Chrome-extension OAuth client id'}"/>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="st-save-creds">${icon('check', 14)} Save credentials</button>
        <button class="btn btn-ghost btn-sm" id="st-clear-creds">Clear</button>
        ${authorized ? '<span class="badge teal">YouTube account connected</span> <button class="btn btn-ghost btn-sm" id="st-revoke">Disconnect</button>' : '<span class="badge muted">YouTube account not connected</span>'}
      </div>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:16px">Data &amp; privacy</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="st-export">${icon('download', 14)} Backup library (JSON)</button>
        <button class="btn btn-ghost btn-sm" id="st-import">${icon('plus', 14)} Restore from backup</button>
        <button class="btn btn-danger btn-sm" id="st-wipe">${icon('trash', 14)} Erase all local data</button>
      </div>
      <p style="font-size:12px;color:var(--text-3);margin:14px 0 0">SangeetPremi stores your library only on this device. No analytics, no tracking, no data leaves your browser except requests to YouTube's official API.</p>
    </section>
  </div>`;

  const catWrap = el.querySelector('#st-cats') as HTMLElement;
  const cats = new Set<DiscoveryCategory>(s.defaultCategories);
  for (const c of DISCOVERY_CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${cats.has(c.id) ? ' active' : ''}`;
    b.textContent = c.label;
    b.addEventListener('click', () => {
      if (cats.has(c.id)) cats.delete(c.id);
      else cats.add(c.id);
      b.classList.toggle('active');
    });
    catWrap.appendChild(b);
  }

  el.querySelector('#st-theme')?.addEventListener('change', (e) => store.updateSettings({ theme: (e.target as HTMLSelectElement).value as 'dark' | 'system' }));
  el.querySelector('#st-depth')?.addEventListener('change', (e) => store.updateSettings({ defaultDepth: (e.target as HTMLSelectElement).value as typeof s.defaultDepth }));
  el.querySelector('#st-dedup')?.addEventListener('change', (e) => store.updateSettings({ dedupStrictness: (e.target as HTMLSelectElement).value as typeof s.dedupStrictness }));

  el.querySelector('#st-save-creds')?.addEventListener('click', async () => {
    const key = (el.querySelector('#st-key') as HTMLInputElement).value.trim();
    const client = (el.querySelector('#st-client') as HTMLInputElement).value.trim();
    const current = await loadConfig();
    await saveConfig({
      youtubeApiKey: key || current.youtubeApiKey,
      youtubeClientId: client || current.youtubeClientId,
    });
    store.updateSettings({
      youtubeApiKeyConfigured: !!(key || current.youtubeApiKey),
      youtubeClientIdConfigured: !!(client || current.youtubeClientId),
    });
    toast('Credentials saved locally', 'success');
  });
  el.querySelector('#st-clear-creds')?.addEventListener('click', async () => {
    await clearConfig();
    store.updateSettings({ youtubeApiKeyConfigured: false, youtubeClientIdConfigured: false });
    toast('Credentials cleared', 'info');
    void renderSettings(el);
  });
  el.querySelector('#st-revoke')?.addEventListener('click', async () => {
    await revoke();
    toast('Disconnected from YouTube', 'info');
    void renderSettings(el);
  });
  el.querySelector('#st-export')?.addEventListener('click', async () => {
    const json = await exportLibraryJson();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sangeetpremi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup exported', 'success');
  });
  el.querySelector('#st-import')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        await importLibraryJson(await file.text());
        toast('Backup restored', 'success');
        location.reload();
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    });
    inp.click();
  });
  el.querySelector('#st-wipe')?.addEventListener('click', () => {
    openModal('Erase all local data', '<p>This deletes all saved artists, discoveries, playlists and settings stored by SangeetPremi on this device.</p>', [
      {
        label: 'Erase everything',
        kind: 'danger',
        onClick: async () => {
          // Best-effort remote revocation of the Google grant; local deletion
          // proceeds regardless of the outcome (and never claims revocation happened).
          try { await revoke(); } catch { /* local wipe still guaranteed */ }
          await wipeAllData();
          toast('All local data erased', 'info');
          location.reload();
        },
      },
      { label: 'Cancel', kind: 'ghost', onClick: () => {} },
    ]);
  });

  // persist default categories when the view unloads via any action
  const unsub = store.subscribe(() => {
    /* categories saved on explicit change below */
  });
  void unsub;
  catWrap.addEventListener('click', () => store.updateSettings({ defaultCategories: [...cats] }), true);
}
