/**
 * SangeetPremi — Manifest V3 definition.
 * Created and developed by SPOOKEYfr.
 *
 * Permissions are kept minimal:
 * - storage:        local library, playlists, settings (chrome.storage.local)
 * - sidePanel:      larger discovery experience in Chrome's side panel
 * - scripting:      used only to open the dashboard tab on install/update
 * - identity:       optional OAuth flow for YouTube playlist creation
 * - host permissions limited to YouTube API + YouTube site (discovery source)
 */
import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'SangeetPremi',
  version: '0.1.0',
  description:
    'Search an artist. Discover their music. Enjoy everything in one place. Intelligent YouTube music discovery and playlist generation.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'SangeetPremi — Music Discovery',
    default_popup: 'src/extension/popup/popup.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  side_panel: {
    default_path: 'src/extension/sidepanel/sidepanel.html',
  },
  background: {
    service_worker: 'src/extension/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*', 'https://music.youtube.com/*'],
      js: ['src/extension/content/youtube.ts'],
      run_at: 'document_idle',
    },
  ],
  options_page: 'src/app/dashboard.html',
  permissions: ['storage', 'sidePanel', 'identity'],
  host_permissions: [
    'https://www.googleapis.com/*',
    'https://youtube.googleapis.com/*',
    'https://www.youtube.com/*',
    'https://music.youtube.com/*',
  ],
  web_accessible_resources: [
    {
      resources: ['icons/*', 'assets/*'],
      matches: ['https://www.youtube.com/*', 'https://music.youtube.com/*'],
    },
  ],
});
