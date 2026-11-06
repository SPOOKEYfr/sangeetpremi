# Changelog

All notable changes to SangeetPremi are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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

[0.3.1]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.3.1
[0.3.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.3.0
[0.2.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.2.0
[0.1.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.1.0
