/**
 * SangeetPremi background service worker (MV3).
 * Kept intentionally minimal: opens the dashboard on install/update and
 * exposes a single message for opening the dashboard tab from any surface.
 */
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
  }
  return true;
});
