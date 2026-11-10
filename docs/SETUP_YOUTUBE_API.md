# Setting up YouTube Data API credentials for SangeetPremi

## Core discovery is key-free

SangeetPremi's core discovery experience — artist search, disambiguation, discography browsing, library, favorites, and playlists — does **not** require a YouTube Data API key, a Google Cloud project, an OAuth client ID, a Google sign-in, or any YouTube account access.

Discovery queries the public [MusicBrainz](https://musicbrainz.org) catalogue and retrieves cover artwork from [Cover Art Archive](https://coverartarchive.org). Neither service requires credentials.

YouTube credentials are needed only for **optional** YouTube features:

- **Verified YouTube stream links**: recordings with a genuine MusicBrainz YouTube relationship show a "Watch ↗" link (no API key needed to display the link; the link opens YouTube in a new tab).
- **Create playlist on YouTube**: creating a real, private playlist on your YouTube account requires your own OAuth 2.0 client ID.

## Credentials you must supply (optional)

No secrets are shipped in the repository. If you want optional YouTube features, provide your own credentials at runtime via Settings → YouTube connection. They are stored only in your browser's local extension storage (`chrome.storage.local`) and are sent only to Google's own OAuth/API endpoints.

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and create a project (or use an existing one).
2. Enable the **YouTube Data API v3**: *APIs & Services → Library → YouTube Data API v3 → Enable*.

### 2. Create an API key (optional — for verified stream links and playlist sync)

1. *APIs & Services → Credentials → Create Credentials → API key*.
2. Restrict the key: *Edit API key → API restrictions → Restrict key → select "YouTube Data API v3"*.
3. Optionally restrict by HTTP referrer to your extension id (`chrome-extension://<id>/`).
4. In SangeetPremi: **Settings → YouTube connection → YouTube Data API key** → paste the key → *Save credentials*.

Quota: the default daily quota is **10,000 units**. Optional YouTube API usage consumes quota units; SangeetPremi tracks usage locally and stops before exceeding the limit. Core MusicBrainz discovery consumes no YouTube quota.

### 3. Create an OAuth client id (optional — for "Create playlist on YouTube")

1. *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
2. Application type: **Chrome Extension**. Enter your extension's id (from `chrome://extensions` once the unpacked extension is loaded, or the key from the Chrome Web Store after publishing).
3. Redirect handling is managed automatically by `chrome.identity.getRedirectURL()`.
4. Enable the scope `https://www.googleapis.com/auth/youtube` (requested at runtime).
5. In SangeetPremi: **Settings → YouTube connection → OAuth client id** → paste it.

With both configured, the **Create playlist on YouTube** button in the playlist builder creates a real (private) YouTube playlist and adds the selected videos through the official API. If anything is missing or fails, SangeetPremi tells you and offers local save / JSON export / "Play on YouTube" instead — it never pretends a playlist was created when it wasn't.

## Data-flow summary

| Step | Service | Credentials required? |
|---|---|---|
| Artist search & disambiguation | MusicBrainz | No |
| Discography & recordings | MusicBrainz | No |
| Cover artwork | Cover Art Archive | No |
| Verified YouTube link (display) | MusicBrainz relationship → YouTube watch URL | No (link opens YouTube in a new tab) |
| Optional YouTube playlist creation | YouTube Data API + OAuth | Yes — your own API key and/or OAuth client ID |

## Privacy note

Your search queries (artist names) are sent to MusicBrainz as public catalogue queries. Optional YouTube API calls send your key and queries to Google. No information is sent to any SangeetPremi-controlled server. See [`PRIVACY.md`](../PRIVACY.md) for the complete data-flow matrix.
