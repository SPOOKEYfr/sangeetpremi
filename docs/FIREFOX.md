# Firefox compatibility evaluation (v0.2)

Status: **evaluated, not yet shipped**. The Chrome/Brave MV3 build is the
reference and must not regress.

## API differences

| Area | Chrome (MV3) | Firefox (MV3) | Impact |
|---|---|---|---|
| `chrome.storage.local` | callback/promise | `browser.storage.local` promise | Low — our storage/config modules already isolate `chrome.storage` behind one guard; a `browser` fallback is a 5-line change |
| `chrome.sidePanel` | supported | **not supported** (Firefox has `browser.sidebarAction`) | Medium — side panel must fall back to a regular tab/options page |
| `chrome.identity.launchWebAuthFlow` | supported | supported via `browser.identity` | Low |
| `chrome.runtime.onInstalled`, tabs, messages | supported | supported | None |
| Manifest | `manifest_version: 3`, `background.service_worker` | `background.scripts` (event page) preferred; `service_worker` supported in recent Firefox but `side_panel` key is ignored | Medium — needs a Firefox-specific manifest overlay |
| `options_page` | supported | `options_ui` | Low |

## Recommended approach when implementing

1. Keep `src/manifest.ts` as the Chrome manifest.
2. Add `src/manifest.firefox.ts` (no `side_panel`, `background.scripts`, `options_ui`, `browser_specific_settings.gecko` with a fixed addon id for OAuth redirect stability).
3. Add a build script `scripts/build-firefox.mjs` that builds with the Firefox manifest and outputs `dist-firefox/`.
4. Add `src/services/browser.ts`: `export const api = (globalThis as any).chrome ?? (globalThis as any).browser;` and route storage/config/oauth through it.
5. Replace the side panel entry with a dashboard tab on Firefox.
6. Test with `web-ext run` in Firefox Nightly/Developer Edition — **required before claiming support**, per project policy.

## Not done in v0.2

No Firefox build is shipped because it cannot be properly tested in the current
environment (see docs/BROWSER_TESTING.md). Shipping an untested Firefox build
would risk exactly the breakage this evaluation is meant to avoid.
