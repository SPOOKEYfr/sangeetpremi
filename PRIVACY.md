# SangeetPremi — Privacy Policy (DRAFT)

> **DRAFT — requires review by SPOOKEYfr (and legal counsel where appropriate)
> before publication.** Contact/support details below are placeholders to be
> filled in by the owner. No compliance approval is claimed.

**Created and developed by SPOOKEYfr.**

## What we collect

- **Anonymous client identifier.** A random UUID generated on your device,
  stored only in your browser's local extension storage and sent with backend
  requests solely for rate limiting and abuse prevention. It is an identifier,
  **not** an account and **not** authentication; it is linked to no name, email
  or Google account.
- **Discovery queries and usage counters.** Artist names you search and
  aggregate API-usage numbers, stored server-side to operate the service, prevent
  abuse and manage YouTube API quota. Query logs are retained for **30 days**.
- **Cached YouTube metadata** (video/channel titles, thumbnails, statistics)
  with provenance timestamps and expiry (24–72 h), refreshed on demand and
  deletable as described below.

## What we do NOT collect

- No names, email addresses, Google account details, or YouTube account data
  unless you explicitly connect YouTube (see below).
- No playlists or library content ever leaves your device: playlists, favorites
  and history live only in `chrome.storage.local`.
- No analytics, advertising, tracking pixels, or third-party trackers.

## YouTube data (via the official YouTube Data API v3)

SangeetPremi reads public YouTube metadata (search results, video/channel
details, thumbnails) through Google's official API under SangeetPremi's own API
credentials. We do not download, store or redistribute audio or video content.
YouTube data is used only to provide discovery results and is handled per
Google's API Services User Data Policy. By using SangeetPremi you agree to
YouTube's Terms of Service: https://www.youtube.com/t/terms

**Optional YouTube connection.** Only if you explicitly choose "Create on
YouTube" do we request OAuth authorization, limited to the minimum scope needed
(`https://www.googleapis.com/auth/youtube`) to create a playlist and add videos
on your behalf. You can disconnect at any time in Settings → YouTube
connection → Disconnect, which revokes the grant (best-effort network call) and
always deletes the local token. Deleting the local token does not by itself
revoke Google's server-side authorization — use Disconnect, or revoke access at
https://myaccount.google.com/permissions

## Metadata from other sources

Artist and release metadata may come from MusicBrainz (open, appropriately
licensed data). MusicBrainz metadata is never represented as YouTube video
coverage; YouTube remains the authoritative source for playable videos.

## Retention and deletion

- Cached YouTube metadata: 24–72 hours, then expired/refreshed.
- Server query/usage logs: 30 days.
- Local extension data: until you erase it (Settings → Data & privacy → Erase
  all local data) or uninstall the extension.
- To request deletion of server-side data, contact: **[SPOOKEYfr — contact
  placeholder to be filled in by the owner]**.

## Security

No API credentials are shipped in the extension or stored in the browser.
Backend secrets live only in server-side environment configuration. All
traffic is TLS-encrypted. Logs never contain request bodies, tokens, or raw IPs
(IPs are stored only as keyed-HMAC fingerprints).

## Changes

This policy may change; the current version is always in the repository.
