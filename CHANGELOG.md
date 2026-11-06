# Changelog

All notable changes to SangeetPremi are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.3.3] — 2026-11-06 (Phase C2 — discovery orchestration, jobs, polling, zero-config migration; not deployed)
- **Shared engine**: pure v0.2 engine modules moved to repo-root `shared/` — ONE implementation of classify/dedup/merge/filters/stats/language/normalize used by BOTH the extension and the backend (no duplicated classification logic); old extension paths are re-export shims.
- **Backend discovery orchestrator** (`backend/src/orchestrator.ts`): artist resolution (MusicBrainz → YouTube channel) → uploads enumeration → controlled search fallback per depth → normalize → classify/role → dedup → language/year filters → stats + related artists; multi-artist merge with attribution; partial provider failure degrades with notes instead of failing the job.
- **Async job lifecycle** (`backend/src/jobManager.ts` + routes): `POST /v1/discover` validates and enqueues, returning a random job id + a 256-bit capability shown exactly once (only its SHA-256 hash is stored; sent solely via `Authorization: Bearer`, never in URLs or logs). States queued/running/completed/failed with progress and structured errors; expiry (24h), revocation, bounded concurrency (2), bounded memory (max jobs + progress), periodic sweep. Single-instance in-memory — stated honestly, no multi-instance claims.
- **Polling only** (C2-C): `GET /v1/discover/:id` with capability header; `POST /v1/discover/:id/refresh` re-runs the same params as a NEW job (client-side diff, user-approved adds only — no silent merge). The SSE route remains a deliberate 501.
- **Extension backend client** (`src/services/backend/client.ts`): typed models, centralized base URL defaulting to `http://127.0.0.1:8080` (local dev only — no production endpoint exists or is invented), AbortSignal timeout/cancellation, polling with backoff that stops on finish/navigation, structured errors with user-meaningful QUOTA_EXHAUSTED / network / unavailable messages; capability header-only; no secrets in extension storage; no API keys in the bundle (test-enforced).
- **Zero-config migration (C2-E)**: discovery view is backend-first; the v0.2 direct-API path remains only as a developer fallback key in Settings → "Developer diagnostics" (collapsed `<details>`). Optional YouTube-account OAuth (playlist publishing) kept isolated and documented; no Google login needed to discover or play public videos. Manifest gains `optional_host_permissions` limited to localhost origins.
- **Tests**: backend 87/87 (orchestrator with mock providers, job lifecycle, capability/expiry/revocation, concurrency cap, sweep cleanup, HTTP polling, refresh, partial failure, multi-artist); extension 78/78 (backend client polling/cancel/errors + no-keys-in-bundle guard). tsc + build + package clean both sides; npm audit 0 vulnerabilities.
- Not deployed; no credentials, quota submissions, or purchases. Browser testing NOT performed in sandbox (manual matrix only).

## [0.3.2] — 2026-11-06 (Phase C1 — real provider adapters, mock-tested only)
### Added
- `backend/src/providers/youtube.ts`: YouTubeVideoProvider — channels.list, playlistItems.list
  (paginated uploads enumeration, explicitly not a complete catalogue), search.list fallback,
  videos.list batched metadata; server-side key via SecretProvider with redaction from all errors;
  quota reserved before each call and released on failure; bounded retries/timeouts; provenance
  fields (source, fetchedAt, expiresAt)
- `backend/src/providers/musicbrainz.ts`: MusicBrainzProvider — artist/recording ws/2 endpoints,
  ~1 req/s rate limiter, SangeetPremi User-Agent with owner contact placeholder, bounded retries,
  MBID provenance, no invented metadata
- `backend/src/http/transport.ts`: injectable transport with timeout, bounded body, bounded
  retries, secret redaction
- Atomic quota reserve/release in InMemoryQuotaAccountant (concurrency-safe single instance)
- Provider selection via ENABLE_* env flags; stubs remain default
- 20 mock-transport provider tests (backend total 75/75); no live calls, no credentials

## [0.3.1] — 2026-11-06 (Phase B.1 — security remediation, not deployed)
### Fixed
- Stored HTML injection via artist names (libraryView) and other unescaped metadata; safe DOM
  helper added; XSS regression tests with malicious payloads
- wipeAllData() now removes every owned key including the OAuth token; remote revoke is
  best-effort and separate from guaranteed local deletion
- Inline onerror image handlers replaced with CSP-safe error listeners
- YouTube quota accounting corrected to the June 2026 bucket model (search/uploads/general),
  per-page charging, Pacific-time reset, in extension and backend
- Backend rate limiting: enforced before body parsing, bounded state, injected clock, IP limit
  cannot be bypassed by UUID rotation, preflights limited, trusted-proxy-only X-Forwarded-For,
  keyed-HMAC IP fingerprints
- Structured errors: 400 for malformed percent-encoding, 503 QUOTA_EXHAUSTED, no stack traces
- Discovery job ownership via expiring, revocable 256-bit capability tokens (hash-only storage)
- Packaging script fixed and verified (no self-inclusion, correct output path, version check)
- Manifest version now sourced from package.json with a consistency test
- Added draft PRIVACY.md and TERMS.md (marked for owner/legal review)

## [0.3.0] — 2026-11-06 (Phase B — backend foundation, not deployed)
### Added
- `backend/`: zero-runtime-dependency Node.js API skeleton (node:http, TypeScript strict)
- `/v1` versioned API: health (live) + validated contracts for artists/resolve, discover, discover/:id, discover/:id/events, discover/:id/refresh, videos/:id
- Consistent success/error envelope; strict input validation; body size limit; JSON-only; CORS allowlist
- Anonymous client UUID handling (rate-limit identifier, not authentication); per-client + per-IP rate limiting
- SecretProvider interface with throwing null default — no secrets exist or are committed
- Method-specific YouTube quota cost table + in-memory quota accountant (search/uploads/general buckets, Pacific-time reset)
- MetadataProvider / VideoProvider interfaces with NOT_IMPLEMENTED stubs — no live external calls
- Structured privacy-conscious logging (hashed IPs; never logs bodies/queries/headers)
- 40 backend unit/integration tests (all passing); backend README with local run instructions
- docs/ARCHITECTURE_V0.3.md updated with verified quota model (June 2026 buckets) and policy clarifications

## [0.2.0] — 2026-11-06
### Added
- Playlist builder: drag-and-drop reordering (with keyboard-accessible move buttons), persisted ordering, bulk select/remove, in-playlist search, category filter, extra sort modes, selection statistics
- Multi-artist discovery (comma-separated artists) with attribution-safe cross-artist deduplication
- Language and release-year filters on discovery results (heuristics labelled as estimates; undated tracks never guessed)
- Explainable related-artist suggestions derived from discovered collaborations
- Incremental "Refresh discovery" with review panel — existing collections are never silently overwritten
- Artist comparison view (verified vs. estimated statistics clearly distinguished)
- Firefox compatibility evaluation (`docs/FIREFOX.md`) and browser testing matrix (`docs/BROWSER_TESTING.md`)
- 21 new unit tests (56 total)

## [0.1.0] — 2026-11-06
### Added
- Initial MV3 extension: popup, side panel, background worker, content script, full dashboard
- Claymorphism design system and generated brand icons
- Artist discovery engine (YouTube Data API v3) with disambiguation, classification, dedup, progress + report
- Playlist builder with local save, export, play-on-YouTube and optional OAuth playlist creation
- Persistent local library, favorites, history, backup/restore
- Settings with runtime credential configuration (no hardcoded secrets)
- 35 unit tests; production build + packaging script
- Documentation: README, setup guide, project status

[0.3.2]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.3.2
[0.3.1]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.3.1
[0.3.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.3.0
[0.2.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.2.0
[0.1.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.1.0
