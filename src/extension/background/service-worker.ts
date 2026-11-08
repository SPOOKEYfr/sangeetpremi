/**
 * SangeetPremi background service worker (MV3).
 *
 * This is the only context that owns the MusicBrainz client. Dashboard,
 * popup and side-panel requests are routed here through the message handler,
 * so they share one rate-limit scheduler. The worker also opens the dashboard
 * on install/update and exposes a message for opening the dashboard tab.
 */
import { registerMusicBrainzBackgroundHandler } from '../../services/musicbrainz/background';

registerMusicBrainzBackgroundHandler();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/app/dashboard.html#/about') });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'sangeetpremi:open-dashboard') {
    const q = typeof msg.query === 'string' ? `?q=${encodeURIComponent(msg.query)}` : '';
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/app/dashboard.html#/discover${q}`) });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
