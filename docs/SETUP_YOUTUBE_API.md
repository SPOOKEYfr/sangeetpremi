# Setting up YouTube Data API credentials for SangeetPremi

SangeetPremi talks to YouTube **only** through the official YouTube Data API v3.
No secrets are shipped in the repository — you provide your own credentials at
runtime, and they are stored only in your browser's local extension storage.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and create a project (or use an existing one).
2. Enable the **YouTube Data API v3**: *APIs & Services → Library → YouTube Data API v3 → Enable*.

## 2. Create an API key (required for discovery)

1. *APIs & Services → Credentials → Create Credentials → API key*.
2. Restrict the key: *Edit API key → API restrictions → Restrict key → select "YouTube Data API v3"*.
3. Optionally restrict by HTTP referrer to your extension id (`chrome-extension://<id>/`).
4. In SangeetPremi: **Settings → YouTube connection → YouTube Data API key** → paste the key → *Save credentials*.

Quota: the default daily quota is **10,000 units**. A search costs 100 units,
so one Standard discovery (~10 searches) costs ~1,000 units. SangeetPremi
tracks usage locally and stops before exceeding the limit. You can request a
quota increase in Cloud Console if needed.

## 3. Create an OAuth client id (optional — for "Create on YouTube")

1. *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
2. Application type: **Chrome Extension**. Enter your extension's id
   (from `chrome://extensions` once the unpacked extension is loaded, or the
   key from the Chrome Web Store after publishing).
3. Add `https://<extension-id>.chromiumapp.org/oauth2` style redirect handling
   is handled automatically by `chrome.identity.getRedirectURL()`.
4. Enable the scope `https://www.googleapis.com/auth/youtube` (requested at runtime).
5. In SangeetPremi: **Settings → YouTube connection → OAuth client id** → paste it.

With both configured, the **Create on YouTube** button in the playlist builder
creates a real (private) YouTube playlist and adds the selected videos through
the official API. If anything is missing or fails, SangeetPremi tells you and
offers local save / JSON export / "Play on YouTube" instead — it never pretends
a playlist was created when it wasn't.
