# SangeetPremi — Terms of Service

**Version:** draft (for publication review)  
**Applies to:** SangeetPremi browser extension (Manifest V3), version 0.1.0  
**Publisher:** [PUBLISHER_NAME_OR_PLACEHOLDER] — see "Publisher confirmation required" below  
**Contact:** [CONTACT_EMAIL_PLACEHOLDER]  
**Legal review:** This document has **not** been reviewed by legal counsel. It describes the product as-is and is not a guarantee of legal compliance or enforceability.

---

## 1. Acceptance of terms

By installing or using the SangeetPremi browser extension ("the extension"), you agree to these terms. If you do not agree, do not install or use the extension.

---

## 2. Description of the service

SangeetPremi is an open-source browser extension that enables music discovery and local playlist management. It queries the public MusicBrainz catalogue for artist and discography information, retrieves cover artwork from Cover Art Archive, saves tracks and playlists locally in your browser, and offers optional integration with YouTube using credentials you supply.

---

## 3. License

The extension is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [`LICENSE`](LICENSE) file in the repository for the full license text. The source code is publicly available; you may redistribute and modify it in accordance with GPL-3.0.

---

## 4. Your use of the extension

### Eligibility
You must be of an age to form a binding contract in your jurisdiction, or have parental or guardian consent. The extension is not directed at children under 13.

### Your responsibilities
- You are responsible for any Google Cloud project, YouTube Data API key, and OAuth 2.0 client ID you choose to configure. SangeetPremi does not provide these credentials.
- You are responsible for complying with YouTube's API Services Terms of Service and Google's policies when using optional YouTube features.
- You are responsible for the artist search queries you enter and any content you save to your local library or playlists.

### Prohibited use
You may not use the extension to:
- Scrape, download, or redistribute audio or video files;
- Circumvent YouTube or any other service's technical protections;
- Automate access to MusicBrainz in a manner that violates MusicBrainz's rate-limiting or API terms;
- Transmit malicious code or attempt to exploit the extension.

---

## 5. Optional YouTube features

Two optional features require credentials that **you** must obtain and supply:

1. **YouTube Data API v3** (your own API key) — for verified stream links and optional playlist sync.
2. **Create playlist on YouTube** (your own OAuth 2.0 client ID) — for creating private playlists on your YouTube account.

SangeetPremi never ships API keys or OAuth secrets. Credentials you enter are stored only in your browser's `chrome.storage.local` and are sent only to Google's OAuth/API endpoints. SangeetPremi does not access your YouTube account without your explicit initiation of the OAuth flow.

Core discovery works without any Google credentials or YouTube account.

---

## 6. Data and privacy

Your library, playlists, favorites, discovery history, sessions, and settings are stored locally in your browser (`chrome.storage.local`). The extension contacts MusicBrainz, Cover Art Archive, Google Fonts, and — only if you configure optional credentials — Google YouTube and OAuth endpoints.

See the separate Privacy Policy (`PRIVACY.md`) for the full data-flow description.

---

## 7. No warranty

The extension is provided **as is** and **as available**, without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, title, or non-infringement. The publisher does not warrant that the extension will be error-free, uninterrupted, secure, or that results from MusicBrainz or YouTube will be accurate or complete.

---

## 8. Limitation of liability

To the fullest extent permitted by law, the publisher and contributors are not liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, use, goodwill, or profits, arising out of or related to your use or inability to use the extension, even if advised of the possibility of such damages.

---

## 9. Third-party services

The extension relies on third-party services:
- **MusicBrainz** — public catalogue data, subject to MusicBrainz's terms and rate-limit policy.
- **Cover Art Archive** — artwork, subject to Cover Art Archive / Internet Archive terms.
- **Google Fonts** — typeface loading, subject to Google's terms.
- **YouTube Data API / OAuth** — optional, subject to Google's API Services Terms of Service.

The publisher is not affiliated with, sponsored by, or endorsed by Google LLC, YouTube, or MetaBrainz / MusicBrainz. The publisher is not responsible for third-party services' availability, terms, or content.

---

## 10. Changes to these terms

The publisher may update these terms from time to time. Continued use of the extension after changes are made constitutes acceptance of the revised terms.

---

## 11. Termination

You may stop using the extension at any time by uninstalling it from your browser. Uninstalling clears locally stored extension data in accordance with your browser's behavior.

---

## 12. Publisher confirmation required

The following items must be completed by the publisher before these terms are published:

- [ ] Replace `[PUBLISHER_NAME_OR_PLACEHOLDER]` with the actual publisher name or legal entity.
- [ ] Replace `[CONTACT_EMAIL_PLACEHOLDER]` with a valid contact email.
- [ ] Confirm the governing law / jurisdiction applicable to the extension (not provided here; placeholder intentionally omitted).
- [ ] Obtain legal review. This document is **not** legal advice and is **not** guaranteed to be legally compliant or enforceable in any jurisdiction.

---
