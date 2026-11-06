# Changelog

All notable changes to SangeetPremi are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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

[0.2.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.2.0
[0.1.0]: https://github.com/SPOOKEYfr/sangeetpremi/releases/tag/v0.1.0
