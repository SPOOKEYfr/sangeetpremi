# Browser validation — SangeetPremi v0.2

## Verified in this development environment (automated)

- `npx tsc --noEmit` — strict TypeScript, zero errors
- `npm run build` — production build succeeds; `dist/manifest.json` is valid MV3 JSON
- `npx vitest run` — 56/56 unit tests pass (normalize, dedup, classify, sanitize, storage, language, filters, merge/refresh/stats)
- Static serving smoke test: `manifest.json`, popup, side panel, dashboard, icons all return HTTP 200 from `dist/`; dashboard entry script resolves

## NOT verified here — no graphical browser exists in this sandbox

A real Chrome/Brave/Firefox was **not** available (no browser binaries; the
sandbox network blocks browser downloads, e.g. Playwright's CDN). The
following are therefore **unverified** and must be run manually:

### Manual test matrix (Chrome & Brave)

1. `npm run build` → `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`
2. Toolbar icon → popup renders (brand, search, recents) — submit a query opens the dashboard tab
3. Dashboard: navigate Home / Discover / Library / Playlists / Compare / Settings / About — no console errors
4. Side panel: right-click icon → "Open side panel" → dashboard renders inside panel
5. Settings → paste a YouTube API key → save → Discover an artist → results render, progress bar animates, report modal works
6. Create playlist → drag rows to reorder → order persists after reload
7. Restart the browser → library/playlists persist (chrome.storage.local)
8. Reload the extension (`chrome://extensions` → ↻) → state persists
9. On a YouTube channel page → "Discover in SangeetPremi" button appears and opens the dashboard
10. Remove the API key → Discover shows the "API key required" modal, not a crash
11. With OAuth client id set → "Create on YouTube" → Google consent → playlist appears on YouTube (verify on youtube.com)
12. Quota: exhaust daily quota (or set a tiny limit) → clear quota error toast, no crash

Record results (pass/fail + browser version) in `docs/PROJECT_STATUS.md`.
