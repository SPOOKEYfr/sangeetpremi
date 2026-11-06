# SangeetPremi

**Search an artist. Discover their music. Enjoy everything in one place.**

SangeetPremi is an intelligent music discovery and playlist generation browser
extension. Type a singer, band or musician — SangeetPremi finds their songs
across YouTube (official releases, soundtracks, collaborations, duets, live,
acoustic, remixes…), classifies them, removes duplicates, and turns them into
an organized playlist.

Created and developed by **SPOOKEYfr**.

## Features

- 🎤 **Artist discovery engine** — disambiguation, relevance scoring, 14 categories, role detection (primary / featured / playback singer / …)
- 🧹 **Smart duplicate detection** — strict / balanced / off modes, duplicates reviewable and restorable
- 📀 **Playlist builder** — select, sort, save, duplicate, export (JSON), play on YouTube, or create a real YouTube playlist via OAuth
- 👥 **Multi-artist discovery** — comma-separated artists, combined collections with correct attribution
- 🔍 **Smart filters** — category, language (heuristics labelled), release-year range (verified)
- ♻️ **Incremental refresh** — revisit an artist, review new tracks, merge without touching existing playlists
- ⚖️ **Artist comparison** — verified vs. estimated stats side by side
- 🖱️ **Pro drag-and-drop playlist builder** — reorder, bulk edit, search, sort, stats
- 🗂️ **Persistent library** — saved artists, discovery history, favorites (stored locally, exportable)
- 🧱 **Claymorphism UI** — premium dark design across popup, side panel and full dashboard
- 🔒 **Privacy-first** — no tracking, no secrets in code, credentials stay on-device; YouTube access only via the official Data API v3 with quota tracking

## Install (developer / unpacked)

Requirements: Node.js 18+.

```bash
git clone https://github.com/SPOOKEYfr/sangeetpremi.git
cd sangeetpremi
npm install
npm run build          # outputs the loadable extension to dist/
```

Then load it in a Chromium browser:

1. Open `chrome://extensions` (Chrome/Brave/Edge)
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder

The extension icon opens the popup; the full dashboard is available via the
options page or `src/app/dashboard.html` inside the extension.

## Configure YouTube access

Live discovery needs a YouTube Data API key (free; see
[`docs/SETUP_YOUTUBE_API.md`](docs/SETUP_YOUTUBE_API.md)). Add it in the
extension under **Settings → YouTube connection**. Without a key, the app
clearly explains what's missing instead of failing silently.

## Develop

```bash
npm run dev        # Vite dev server (dashboard HMR)
npm run build      # type-check + production build to dist/
npm test           # unit tests (Vitest)
npm run package    # build + zip dist/ for store submission
```

## Project structure

```
sangeetpremi/
├── src/
│   ├── app/            # dashboard shell + hash router
│   ├── components/     # logo, icons, track cards, modal, toast
│   ├── features/       # home, discovery, library, playlists, compare, settings, about
│   ├── services/       # youtube (api, oauth), discovery (engine, classify, dedup), storage, config
│   ├── state/          # observable store
│   ├── styles/         # claymorphism design system
│   ├── types/          # shared data models
│   ├── utils/          # normalize, sanitize, id helpers
│   └── extension/      # popup, sidepanel, background worker, content script
├── backend/            # zero-dependency Node.js API skeleton (Phase B, v0.3 — not deployed)
│   └── see backend/README.md
├── public/icons/       # generated brand icons
├── tests/              # Vitest unit tests
├── docs/               # setup guides + PROJECT_STATUS.md
└── scripts/            # packaging
```

## Testing

```bash
npm test
```

Covers normalization, deduplication, classification, URL sanitization and
backup/restore. Status and roadmap: [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Privacy & licensing

- All data stays in `chrome.storage.local` unless you export it.
- Music metadata comes from the official YouTube Data API v3; SangeetPremi
  never downloads or redistributes audio.
- Licensed under **GPL-3.0** (see `LICENSE`).
