# SangeetPremi — official website

Static marketing/product site for SangeetPremi, hosted on **Cloudflare Pages** (free plan).
Created and developed by **SPOOKEYfr**.

## Stack

- Vite 5 + vanilla TypeScript, multi-page (MPA) build → fully static HTML/CSS/JS in `dist/`.
- Zero runtime dependencies; zero third-party scripts, fonts, analytics or trackers.
- No backend, database, auth or secrets.

## Pages

`index.html` (home) · `features.html` · `download.html` (honest "no release yet" state + developer install) · `about.html` · `privacy.html` and `terms.html` (render the repo's actual draft `PRIVACY.md` / `TERMS.md` via `prebuild` sync, with a visible DRAFT banner) · `404.html`.

## Local development / preview

```bash
cd website
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build -> dist/
npm run preview    # serve the production build locally
```

## Cloudflare Pages configuration

- **Root directory:** `website`
- **Build command:** `npm install && npm run build` (or `npm ci && npm run build`)
- **Output directory:** `dist`
- No environment variables required. Nothing is deployed by this repo itself.

`public/_headers` ships security headers (strict CSP, nosniff, frame-ancestors) with the build output.
