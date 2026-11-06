# SangeetPremi — Project Status

Product: **SangeetPremi** — intelligent artist-based music discovery & playlist
generation browser extension. Created and developed by **SPOOKEYfr**.

## Current phase
**v0.3 — Phase C1 (real provider adapters) IMPLEMENTED and mock-tested.** Phase C2 (orchestration) NOT started.
See `backend/README.md` and `docs/ARCHITECTURE_V0.3.md` §11. Nothing deployed;
no credentials, quota extensions, OAuth verification or paid services created
(all require SPOOKEYfr's approval).

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

## Completed in v0.3 Phase B
- [x] `backend/` zero-runtime-dependency Node API skeleton (node:http only)
- [x] Versioned `/v1` routes: health (live), artists/resolve, discover (+/:id, /events, /refresh), videos/:id (validated contracts → structured 501)
- [x] Consistent `{ok,data}` / `{ok:false,error:{code,message}}` envelope
- [x] Env config validation; SecretProvider iface with throwing NullSecretProvider (no secrets exist)
- [x] Anonymous client UUID (identifier, not auth); per-client + per-IP sliding-window rate limits (429)
- [x] Body size limit (413), JSON-only (415), CORS allowlist + preflight, strict input validation (400)
- [x] Structured logging: JSON lines, hashed IP fingerprints, never logs bodies/queries/headers
- [x] MetadataProvider/VideoProvider interfaces + NOT_IMPLEMENTED stubs (no live external calls)
- [x] Method-specific YouTube quota table + in-memory QuotaAccountant (search/uploads/general buckets, PT reset)
- [x] 40 backend tests passing; backend tsc clean; live local run verified; extension still 56/56 + build green

## Completed in v0.3 Phase B.1 (remediation of independent review)
- [x] Stored XSS: libraryView artist chips now built with safe DOM helper (`utils/dom.ts` h());
      unescaped artist.country / compareView row values / modal title escaped; 8 XSS regression
      tests (img onerror, script, style, svg onload, quote-breakout, entities) — 64/64 extension tests pass
- [x] wipeAllData removes ALL owned keys incl. `sangeetpremi.oauthToken` (OWNED_STORAGE_KEYS);
      Settings wipe does best-effort remote revoke first, local deletion guaranteed; regression test
- [x] Inline `onerror` handlers removed from trackCard/trackListEditor (MV3 CSP blocks them);
      proper error listeners added
- [x] Quota model corrected to June 2026 buckets (search 100 calls/day, uploads 100/day,
      10k general units, writes 50, PT midnight reset) in extension api.ts + backend quota.ts;
      pagination charged per call; docs/capacity estimates revised
- [x] Backend hardening: rate limit BEFORE body parsing; bounded limiter state (maxKeys eviction);
      injected clock used; UUID rotation cannot bypass IP limit; preflight rate-limited;
      trusted-proxy-only X-Forwarded-For; keyed-HMAC IP fingerprints (salt from env only);
      413 still delivered properly
- [x] Errors: malformed percent-encoding → 400 INVALID_INPUT; QuotaExhausted → 503 QUOTA_EXHAUSTED
      structured; no stack traces in envelopes
- [x] Job ownership: 256-bit capability tokens (only SHA-256 hash stored), expiry + revocation,
      401/403 on job/events/refresh; tests for unauthorized/invalid/expired
- [x] Packaging fixed + verified (archive at repo root, no self-inclusion, manifest present,
      version matches); manifest version sourced from package.json; version-consistency test
- [x] PRIVACY.md / TERMS.md drafts (YouTube ToS link, retention, OAuth disconnect, placeholders marked)

## Completed in v0.3 Phase C1
- [x] `YouTubeVideoProvider` behind VideoProvider: channels.list, playlistItems.list (paginated),
      search.list (fallback), videos.list; injectable transport; quota reserve-before/release-on-failure;
      redaction of key from errors; structured provider errors; provenance + 24h expiry on records
- [x] `MusicBrainzProvider` behind MetadataProvider: artist + recording endpoints, 1 req/s limiter,
      descriptive UA with contact placeholder, bounded retries, MBID provenance, no invented metadata
- [x] Atomic quota reservation (reserve/release) preventing concurrent overspend; PT-day buckets
- [x] Configurable provider availability via env flags; stubs remain default (no live calls without config)
- [x] 20 new mock-transport provider tests; backend total 75/75 passing; tsc + build clean
- [x] Extension untouched: 67/67 tests, tsc + build green

## Next implementation tasks
0. (Requires approval) Phase C: wire real providers server-side behind /v1 — NOT started
1. Run the manual browser matrix (Chrome + Brave) and record results
2. Firefox build per `docs/FIREFOX.md` once testable with `web-ext`
3. Remaining v0.3 ideas: discovery stats dashboard, backup diffing, playlist sync to YouTube on refresh
