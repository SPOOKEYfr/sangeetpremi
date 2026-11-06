# SangeetPremi — Project Status

Product: **SangeetPremi** — intelligent artist-based music discovery & playlist
generation browser extension. Created and developed by **SPOOKEYfr**.

## Current phase
**Phase 3/4 complete (MVP functional)** — foundation, premium UI, discovery
engine and playlist system are implemented and tested. Working toward Phase 5
(advanced features) and Phase 6 (release hardening).

## Completed features
- [x] Manifest V3 extension scaffold (popup, side panel, background worker, content script, dashboard/options page)
- [x] Claymorphism dark design system (tokens, primitives, components) + generated brand icons
- [x] Dashboard with hash routing: Home, Discover, Library, Playlists, Settings, About
- [x] Artist disambiguation (never silently picks the wrong artist)
- [x] YouTube Data API v3 client: search, video/channel details, quota tracking, rate limiting, error handling
- [x] Discovery engine with Quick/Standard/Deep depths, progress events, discovery report
- [x] Classification into 14 categories + artist role detection (primary/featured/playback/…)
- [x] Smart deduplication (strict/balanced/off) with restorable duplicates
- [x] Playlist builder: create/rename/duplicate/delete, reorder-ready track list, local save, JSON export, "Play on YouTube", optional OAuth "Create on YouTube"
- [x] Persistent library (artists, sessions, playlists, favorites, history) in chrome.storage.local
- [x] Settings: theme, defaults, categories, credentials (runtime-only), backup/restore, data wipe
- [x] About page crediting SPOOKEYfr
- [x] Unit tests (35) for normalize/dedup/classify/sanitize/storage
- [x] Production build + packaging script

## In progress
- [ ] Manual in-browser verification in Chrome/Brave (load unpacked from `dist/`)

## Known bugs
- None known. (Automated tests cover engine logic; UI verified by build only so far.)

## Missing credentials
- YouTube Data API key — **user-supplied at runtime** (see `docs/SETUP_YOUTUBE_API.md`); never committed
- OAuth client id for "Create on YouTube" — **user-supplied at runtime**

## Technical decisions
- Vite + @crxjs/vite-plugin, TypeScript strict, zero runtime dependencies (lightweight extension)
- All YouTube access via official API only; no scraping, no audio extraction, quota-aware client
- State: tiny observable store over chrome.storage.local; in-memory fallback for dev/tests
- Discovery pipeline is pure/async and unit-tested independent of the network
- Firefox: architecture isolates `chrome.*` behind service modules; not yet packaged for Firefox

## Next implementation tasks
1. In-browser smoke test + fix any MV3 runtime issues
2. Drag-and-drop reordering in playlist builder
3. Multi-artist discovery, artist comparison, stats dashboard
4. Language/genre/year filters, smart suggestions, playlist refresh
5. Firefox packaging (webextensions polyfill) when MV3 support is confirmed
