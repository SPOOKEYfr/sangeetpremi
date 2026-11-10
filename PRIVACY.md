# SangeetPremi — Privacy Policy

**Version:** draft (for publication review)  
**Applies to:** SangeetPremi browser extension (Manifest V3), version 0.1.0  
**Publisher:** [PUBLISHER_NAME_OR_PLACEHOLDER] — see "Publisher confirmation required" below  
**Contact:** [CONTACT_EMAIL_PLACEHOLDER]  
**Legal review:** This document has **not** been reviewed by legal counsel. It describes the product's actual data flows as verified by a release packaging audit. It is not a guarantee of legal compliance.

---

## 1. Overview

SangeetPremi is a browser extension for music discovery and personal playlist management. It helps you search for artists, browse canonical discographies and recordings from the public MusicBrainz catalogue, view Cover Art Archive artwork, save tracks to a local library, organize playlists, and — optionally — create private playlists on YouTube using credentials you supply.

This policy describes what information SangeetPremi handles, where it is stored, and which external services it contacts.

---

## 2. What information SangeetPremi handles

### Information you provide
- **Artist search queries**: When you search for an artist in the Discover view or popup, you type an artist name (for example "Coldplay"). That name is sent to MusicBrainz as a public catalogue search query. See section 4.1.
- **Optional YouTube credentials**: You may optionally enter a YouTube Data API key and/or an OAuth 2.0 client ID in Settings. These are used only for optional YouTube features (see section 4.4 and 4.5). They are never shipped with the extension and are never provided by the publisher.

### Information generated locally
- **Discovery history**: A list of artist names you have searched for.
- **Saved artists**: Artists you mark as favorites.
- **Library tracks**: Canonical recordings you explicitly add to your library, with their MusicBrainz metadata (title, artist, release group, duration, cover-art URL, optional verified YouTube link).
- **Playlists**: Playlists you create, with their track membership.
- **Discovery sessions**: Records of discovery runs (artist, release groups found, recordings, timestamps).
- **Settings**: Your discovery defaults, theme preference, and optional YouTube credentials.

### Information SangeetPremi does NOT collect
- No personal identifiers (name, email, IP address used for identification, device ID).
- No browser history (other than your own search queries entered into the extension).
- No YouTube account data, unless you explicitly complete the optional OAuth flow.
- No audio files, no video content, no listening activity.

---

## 3. Where information is stored

All extension data is stored **locally in your browser** using `chrome.storage.local`. This includes:

- Discovery history, saved artists, library tracks, playlists, favorites, discovery sessions, and settings.
- Optional YouTube API key and OAuth client ID, if you enter them in Settings.
- Optional OAuth access token, if you complete the "Create playlist on YouTube" flow. The token is revocable and is cleared when you clear credentials.

No data is sent to any SangeetPremi-controlled server or database. There is no publisher-operated backend.

You can back up your library to a JSON file (Settings → Backup library) and restore it (Settings → Restore from backup), or erase all local data (Settings → Erase all local data).

---

## 4. External services contacted

SangeetPremi contacts the following external services. No other external hosts are contacted by the extension.

| External service | Purpose | Information transmitted | Personal data? | Required for core discovery? |
|---|---|---|---|---|
| **MusicBrainz** (`https://musicbrainz.org/ws/2`) | Public catalogue search, artist disambiguation, discography and recording metadata, recording-to-YouTube relationship lookup | Artist search query (the name you type); MusicBrainz MBIDs (public identifiers) in request paths; `inc` parameters requesting public metadata (aliases, tags, ratings, artist credits, URL relations, ISRCs) | No — artist names and MBIDs are public catalogue data, not personal data | **Yes** — core discovery is MusicBrainz-first and key-free |
| **Cover Art Archive** (`https://coverartarchive.org`) | Release-group cover artwork thumbnails | Release-group MBID in the image URL path | No — release-group MBIDs are public catalogue identifiers | No — artwork degrades gracefully to a placeholder icon |
| **Google Fonts** (`https://fonts.googleapis.com`, `https://fonts.gstatic.com`) | Loading the Outfit typeface used in the dashboard | Standard HTTP request metadata only (IP address, User-Agent, Referer). No extension data, no user data, no cookies | No extension-specific personal data; standard web-request metadata applies | No — styling only |
| **YouTube Data API v3** (`https://www.googleapis.com/youtube/v3/*`) | Optional: stream-playback resolution and private playlist creation, only when you supply your own API key | Your search queries and the API key you provided, sent to Google's API endpoints | No extension-specific personal data beyond the queries you choose to send | **No** — optional; discovery works without any Google credentials |
| **Google OAuth 2.0** (`https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/revoke`) | Optional: "Create playlist on YouTube" flow, only when you supply your own OAuth client ID and explicitly initiate it | Your OAuth client ID; an access token obtained through your explicit consent; revocation request (best-effort) | The access token grants access to your YouTube account — only if you explicitly opt in | **No** — optional |
| **YouTube website** (`https://www.youtube.com/*`, `https://music.youtube.com/*`) | Content-script "Discover in SangeetPremi" button on channel pages; "Watch ↗" links open verified YouTube videos in a new tab | No automatic extension-to-YouTube requests. The content script reads the channel name from the page URL you are already visiting and, only if you click the button, passes that artist name to the extension dashboard. Watch links are opened by your click. | No | No — optional in-context entry point |

### What is NOT transmitted
- No information is sent to any SangeetPremi-controlled server. The User-Agent string sent to MusicBrainz references `https://sangeetpremi.org`, but the extension does not make any request to that domain.
- No telemetry, analytics, behavioral tracking, or external logging beacons exist in the extension.
- No crash reports, no usage metrics, no advertising identifiers.

---

## 5. YouTube and your account

### Core discovery does not require YouTube
The core discovery experience (artist search, disambiguation, discography browsing, library, favorites, playlists) works without a Google Cloud project, a YouTube API key, an OAuth client ID, a Google sign-in, or any YouTube account access. MusicBrainz-based discovery is fully independent of YouTube OAuth.

### Optional YouTube features
Two optional YouTube features require credentials that **you** must supply:

1. **YouTube Data API v3** (API key): enables verified YouTube stream links for recordings and optional playlist sync. Enter your own key in Settings → YouTube connection.
2. **Create playlist on YouTube** (OAuth client ID): enables creating a real, private YouTube playlist from your library. Enter your own client ID in Settings → YouTube connection and explicitly authorize the flow.

Credentials are stored only in your browser's `chrome.storage.local`. They are sent only to Google's own OAuth/API endpoints, never to any third party, and never to SangeetPremi-controlled infrastructure.

---

## 6. Children

SangeetPremi is not directed at children under 13. The extension does not knowingly collect personal information from children.

---

## 7. Data retention and deletion

Data persists in your browser until you remove it:

- To remove a track from your library: Library view → Remove from Library. Membership is removed; canonical records referenced by favorites or playlists are retained so those references remain resolvable. Unreferenced records are cleaned up automatically.
- To remove a favorite: Library view → Favorites → remove the heart.
- To delete a playlist: Playlists view → Delete.
- To erase all local extension data: Settings → Erase all local data.
- To remove the extension and its data: uninstall SangeetPremi in `chrome://extensions`. Chrome clears `chrome.storage.local` on uninstall.

---

## 8. Third-party terms

- MusicBrainz data is provided under the Open Data Commons Attribution License; see https://musicbrainz.org/doc/Licensing/.
- Cover Art Archive artwork is provided by the Internet Archive / MusicBrainz Cover Art Archive.
- Optional YouTube features are subject to the YouTube API Services Terms of Service and Google's policies.
- SangeetPremi is an independent open-source project and is not affiliated with, sponsored by, or endorsed by Google LLC, YouTube, or MetaBrainz / MusicBrainz.

---

## 9. Publisher confirmation required

The following items must be completed by the publisher before this policy is published:

- [ ] Replace `[PUBLISHER_NAME_OR_PLACEHOLDER]` with the actual publisher name or legal entity.
- [ ] Replace `[CONTACT_EMAIL_PLACEHOLDER]` with a valid contact email or privacy contact method.
- [ ] Confirm the policy URL that will be registered with the Chrome Web Store (a privacy policy URL is required for extensions that handle user data or use certain permissions).
- [ ] Confirm whether any additional data is collected by the build toolchain, hosting, or website associated with the extension (this policy covers the extension client only).
- [ ] Obtain legal review. This document is **not** legal advice and is **not** guaranteed to satisfy any jurisdiction's privacy-law requirements.

---
