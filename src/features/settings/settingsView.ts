/** Settings: appearance, discovery defaults, credentials, data management. */
import { store } from '../../state/store';
import { loadConfig, saveConfig, clearConfig } from '../../services/config';
import { exportLibraryJson, importLibraryJson, wipeAllData } from '../../services/storage/storage';
import { DISCOVERY_CATEGORIES, DEFAULT_SETTINGS, type DiscoveryCategory } from '../../types';
import { toast } from '../../components/toast';
import { openModal } from '../../components/modal';
import { icon } from '../../components/icons';
import { isAuthorized, revoke } from '../../services/youtube/oauth';

export async function renderSettings(el: HTMLElement): Promise<void> {
  const s = store.settings;
  const cfg = await loadConfig();
  const authorized = await isAuthorized().catch(() => false);
  const hasKey = !!cfg.youtubeApiKey;
  const hasClient = !!cfg.youtubeClientId;

  el.innerHTML = `
  <div class="fade-in" style="max-width:820px;display:flex;flex-direction:column;gap:22px">
    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:16px">Appearance</h3>
      <label class="label" for="st-theme">Theme</label>
      <select id="st-theme" class="select" style="max-width:240px">
        <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark (signature claymorphism)</option>
        <option value="system" ${s.theme === 'system' ? 'selected' : ''}>System preference</option>
      </select>
    </section>

    <section class="clay" style="padding:26px 30px">
      <h3 style="margin-bottom:6px">Discovery defaults</h3>
      <p style="font-size:12.5px;margin:0 0 16px">Used as the starting baseline for every new artist discovery session.</p>
      
      <label class="label" for="st-depth">Default depth</label>
      <select id="st-depth" class="select" style="max-width:280px;margin-bottom:18px">
        <option value="quick" ${s.defaultDepth === 'quick' ? 'selected' : ''}>Quick (fewer searches, saves quota)</option>
        <option value="standard" ${s.defaultDepth === 'standard' ? 'selected' : ''}>Standard (recommended balance)</option>
        <option value="deep" ${s.defaultDepth === 'deep' ? 'selected' : ''}>Deep (exhaustive catalog exploration)</option>
      </select>

      <label class="label" for="st-dedup">Duplicate detection</label>
      <select id="st-dedup" class="select" style="max-width:320px;margin-bottom:18px">
        <option value="strict" ${s.dedupStrictness === 'strict' ? 'selected' : ''}>Strict — collapse all versions to one representative</option>
        <option value="balanced" ${s.dedupStrictness === 'balanced' ? 'selected' : ''}>Balanced — preserve distinct live/remix/acoustic renditions</option>
        <option value="off" ${s.dedupStrictness === 'off' ? 'selected' : ''}>Off — retain all discovered uploads</option>
      </select>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <label class="label" style="margin:0">Default categories</label>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" id="st-cats-all" style="padding:4px 10px;font-size:11.5px">Select all</button>
          <button type="button" class="btn btn-ghost btn-sm" id="st-cats-reset" style="padding:4px 10px;font-size:11.5px">Reset defaults</button>
        </div>
      </div>
      <div id="st-cats" style="display:flex;flex-wrap:wrap;gap:7px"></div>
    </section>

    <section class="clay" style="padding:26px 30px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0">YouTube connection (Optional)</h3>
        <span class="badge ${hasKey ? 'teal' : 'muted'}">${hasKey ? 'Configured' : 'Optional · Not configured'}</span>
      </div>
      <p style="font-size:12.5px;margin:0 0 16px">Credentials are stored only in this browser's local extension storage and are sent exclusively to Google. See <code>docs/SETUP_YOUTUBE_API.md</code>.</p>
      
      <div style="background:var(--surface-inset);border-radius:var(--r-sm);padding:14px 16px;margin-bottom:18px;border:1px solid rgba(255,255,255,0.04);display:flex;gap:12px;align-items:flex-start">
        <span style="color:var(--accent-2);flex:none;margin-top:2px">${icon('shield', 18)}</span>
        <div style="font-size:12px;color:var(--text-2);line-height:1.55">
          <strong style="color:var(--text-1)">Open Discovery is Key-Free:</strong> SangeetPremi explores artist discographies, release groups, and canonical recordings via the open MusicBrainz commons with zero Google API quota consumed. A YouTube Data API key is completely optional, used only if you wish to link playback or create private playlists on YouTube.
        </div>
      </div>

      <label class="label" for="st-key">YouTube Data API key (optional — for stream playback &amp; playlist sync)</label>
      <div style="display:flex;gap:8px;max-width:480px;margin-bottom:14px">
        <input id="st-key" class="input" type="password" style="flex:1" placeholder="${hasKey ? '•••• configured in local storage ••' : 'Optional — paste your YouTube API key'}" autocomplete="off"/>
        <button class="btn btn-ghost btn-sm" id="st-key-toggle" type="button" title="Toggle visibility" aria-label="Toggle API key visibility">${icon('eye', 15)}</button>
      </div>

      <label class="label" for="st-client">OAuth client ID (optional — for “Create on YouTube”)</label>
      <div style="display:flex;gap:8px;max-width:480px;margin-bottom:6px">
        <input id="st-client" class="input" type="password" style="flex:1" placeholder="${hasClient ? '•••• configured in local storage ••' : 'Paste your Chrome OAuth client ID'}" autocomplete="off"/>
        <button class="btn btn-ghost btn-sm" id="st-client-toggle" type="button" title="Toggle visibility" aria-label="Toggle client ID visibility">${icon('eye', 15)}</button>
      </div>

      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary btn-sm" id="st-save-creds">${icon('check', 14)} Save credentials</button>
        <button class="btn btn-ghost btn-sm" id="st-clear-creds">Clear</button>
        <span style="flex:1"></span>
        ${
          authorized
            ? '<span class="badge teal">YouTube account connected</span> <button class="btn btn-ghost btn-sm" id="st-revoke">Disconnect</button>'
            : '<span class="badge muted">YouTube account not connected</span>'
        }
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

  // Default categories chips
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

  el.querySelector('#st-cats-all')?.addEventListener('click', () => {
    for (const c of DISCOVERY_CATEGORIES) cats.add(c.id);
    catWrap.querySelectorAll('.chip').forEach((b) => b.classList.add('active'));
    store.updateSettings({ defaultCategories: [...cats] });
  });

  el.querySelector('#st-cats-reset')?.addEventListener('click', () => {
    cats.clear();
    for (const c of DEFAULT_SETTINGS.defaultCategories) cats.add(c);
    catWrap.querySelectorAll('.chip').forEach((b) => {
      const matched = DISCOVERY_CATEGORIES.find((x) => x.label === b.textContent);
      if (matched && cats.has(matched.id)) b.classList.add('active');
      else b.classList.remove('active');
    });
    store.updateSettings({ defaultCategories: [...cats] });
  });

  // Password visibility toggles
  const keyInput = el.querySelector('#st-key') as HTMLInputElement;
  const keyToggle = el.querySelector('#st-key-toggle') as HTMLButtonElement;
  keyToggle?.addEventListener('click', () => {
    const isPass = keyInput.type === 'password';
    keyInput.type = isPass ? 'text' : 'password';
    keyToggle.innerHTML = icon(isPass ? 'eyeOff' : 'eye', 15);
  });

  const clientInput = el.querySelector('#st-client') as HTMLInputElement;
  const clientToggle = el.querySelector('#st-client-toggle') as HTMLButtonElement;
  clientToggle?.addEventListener('click', () => {
    const isPass = clientInput.type === 'password';
    clientInput.type = isPass ? 'text' : 'password';
    clientToggle.innerHTML = icon(isPass ? 'eyeOff' : 'eye', 15);
  });

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
    void renderSettings(el);
  });

  el.querySelector('#st-clear-creds')?.addEventListener('click', () => {
    const modal = openModal('Clear credentials', '<p>Remove your saved YouTube API key and OAuth Client ID from local storage?</p>', [
      {
        label: 'Clear credentials',
        kind: 'danger',
        onClick: async () => {
          await clearConfig();
          store.updateSettings({ youtubeApiKeyConfigured: false, youtubeClientIdConfigured: false });
          modal.close();
          toast('Credentials cleared', 'info');
          void renderSettings(el);
        },
      },
      { label: 'Cancel', kind: 'ghost', onClick: () => modal.close() },
    ]);
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
    const modal = openModal('Erase all local data', '<p>This deletes all saved artists, discoveries, playlists and settings stored by SangeetPremi on this device.</p>', [
      {
        label: 'Erase everything',
        kind: 'danger',
        onClick: async () => {
          await wipeAllData();
          modal.close();
          toast('All local data erased', 'info');
          location.reload();
        },
      },
      { label: 'Cancel', kind: 'ghost', onClick: () => modal.close() },
    ]);
  });

  catWrap.addEventListener('click', () => store.updateSettings({ defaultCategories: [...cats] }), true);
}
