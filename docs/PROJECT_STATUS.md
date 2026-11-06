# SangeetPremi — Project Status

Product: **SangeetPremi** — intelligent artist-based music discovery & playlist
generation browser extension. Created and developed by **SPOOKEYfr**.

## Current phase
**v0.3 — Public release & zero-configuration architecture (Phase A: architecture
proposal complete — see `docs/ARCHITECTURE_V0.3.md`)**. No backend implemented or
deployed yet; no credentials, quota extensions or paid services created (all
require SPOOKEYfr's approval).

## Completed in v0.2
- [x] Playlist builder: HTML5 drag-and-drop reordering with drop indicator + keyboard-accessible ↑/↓ moves, persisted ordering, bulk select/remove, per-playlist search, category filter, 5 sort modes, selection statistics
- [x] Multi-artist discovery (comma-separated queries) with per-track attribution preserved and safe cross-artist dedup (only shared recordings collapse; unrelated same-title songs never merge)
- [x] Language filter (script-verified for non-Latin, labelled "est." for Latin heuristics), release-year range filter (verified from `publishedAt`; undated tracks excluded, never guessed)
- [x] Explainable related-artist suggestions (only channels appearing in discovered collaborations, with a human-readable reason)
- [x] Incremental "Refresh discovery": diffs fresh candidates against the stored session, shows a review panel, merges only approved new tracks; existing tracks/playlists never auto-modified
- [x] Artist comparison view (verified counts vs. clearly-labelled estimates; genre explicitly not estimated)
- [x] 21 new unit tests (56 total, all passing): language, filters, merge/refresh diffing, stats/related artists
- [x] `docs/FIREFOX.md` compatibility evaluation (Chrome build untouched; no untested Firefox build shipped)
- [x] `docs/BROWSER_TESTING.md` — automated-verified vs. manual-unverified test matrix

## Verification status
- TypeScript strict: PASS · Production build: PASS · Unit tests: 56/56 PASS
- **Real-browser testing: NOT performed** (no browser binaries available in the
  dev sandbox; downloads blocked). Manual matrix provided in `docs/BROWSER_TESTING.md`.

## Known bugs
- None known from automated checks. UI behavior in a real browser is unverified (see above).

## Missing credentials
- YouTube Data API key + OAuth client id — user-supplied at runtime (`docs/SETUP_YOUTUBE_API.md`); never committed

## Technical decisions
- v0.2 added zero runtime dependencies; new logic lives in pure, unit-tested modules (`utils/language`, `services/discovery/{filters,merge,stats}`)
- Refresh is diff-then-review: the stored session is immutable until the user approves merges
- Multi-artist merge keeps `track.artist` from the discovering session
- Language detection carries a confidence label; UI never presents heuristics as fact

## v0.3 direction (approved direction, pending implementation)
- Zero-configuration: backend-held YouTube credentials; extension ships with no secrets
- Versioned backend API `/v1/*` + MusicBrainz metadata provider + YouTube video provider
- Centralized caching, rate limiting, quota management, graceful capacity errors
- OAuth only for explicit "Create on YouTube"; verification = launch dependency (>100 users)
- Privacy: anonymous client id only; playlists stay local; PRIVACY.md/TERMS.md in Phase F

## Next implementation tasks
1. Run the manual browser matrix (Chrome + Brave) and record results
2. Firefox build per `docs/FIREFOX.md` once testable with `web-ext`
3. Remaining v0.3 ideas: discovery stats dashboard, backup diffing, playlist sync to YouTube on refresh
