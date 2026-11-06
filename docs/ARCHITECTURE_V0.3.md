# SangeetPremi v0.3 — Zero-Configuration Public Architecture (Phase A proposal)

Product creator: **SPOOKEYfr**. Status: **PROPOSED — not implemented, not deployed**.

## 1. Why the change

v0.2 requires each user to paste their own YouTube Data API key. That fails the
public-product requirement (zero configuration) and conflicts with YouTube's
developer policies: each API Client must have exactly one API Project, and API
credentials must never be embedded in distributed/open-source clients or shared
with third parties [^1]. A shared key inside a public extension is exactly the
"embedded in open source project" anti-pattern.

**Direction: SangeetPremi operates as its own properly identified API client.
The backend holds the credentials (server-side env secrets only); the extension
talks to our versioned API and contains no secrets.**

## 2. Current architecture (v0.2, merged)

```
Extension (MV3, TS/Vite/CRXJS, zero runtime deps)
  ├── popup / sidepanel / dashboard / options page
  ├── services/youtube/api.ts      ← direct YouTube Data API calls with USER-SUPPLIED key
  ├── services/youtube/oauth.ts    ← chrome.identity OAuth, user-supplied client id
  ├── services/discovery/*         ← engine, classify, dedup, merge, filters, stats (pure, tested)
  └── state/store.ts               ← chrome.storage.local library
```

## 3. Proposed architecture

```
                 ┌────────────────────────────┐
 Extension ─────▶│  SangeetPremi Backend API  │────▶ YouTube Data API v3 (server key, env secret)
 (no secrets)    │  api.sangeetpremi.app/v1   │────▶ MusicBrainz (artist/release metadata, keyless)
                 │  - auth (anon client id)   │
                 │  - rate limit (per-id+IP)  │
                 │  - cache (Postgres)        │
                 │  - quota manager + queue   │
                 │  - discovery orchestrator  │
                 └────────────┬───────────────┘
                              ▼
                     Postgres (cache, usage, rate limits, jobs)
```

### 3.1 Versioned API contract (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | liveness/readiness |
| GET | `/v1/artists/resolve?q=` | artist disambiguation candidates |
| POST | `/v1/discover` | start discovery job `{artists[], depth, categories, filters}` → `{jobId}` |
| GET | `/v1/discover/{jobId}` | job status + progressive results (SSE or polling) |
| POST | `/v1/discover/{jobId}/refresh` | incremental refresh diff |
| GET | `/v1/videos/{videoId}` | single video metadata (cached) |
| POST | `/v1/feedback` | abuse/error report (optional) |

All responses: `{ok, data}` or `{ok:false, error:{code, message}}` with codes like
`RATE_LIMITED`, `QUOTA_EXHAUSTED`, `UPSTREAM_ERROR`, `INVALID_INPUT`, `NOT_FOUND`.
The extension maps these to honest user messages — never fakes success.

### 3.2 Provider interfaces (extension of v0.2 engine, no rewrite)

```ts
interface MetadataProvider {   // artist/recording/release metadata
  resolveArtist(query: string): Promise<ArtistCandidate[]>;
  recordingsOf(artistId: string): Promise<RecordingMeta[]>;
}
interface VideoProvider {      // playable YouTube resolution — authoritative
  searchVideos(q: string, opts): Promise<YouTubeVideo[]>;
  channelUploads(channelId: string): Promise<YouTubeVideo[]>; // 1-unit playlistItems, NOT 100-unit search
  videoDetails(ids: string[]): Promise<YouTubeVideo[]>;
}
```

Implementations: `MusicBrainzProvider` (CC0-licensed metadata, 1 req/s, no key) +
`YouTubeBackendProvider` (server-side). The v0.2 pure modules (classify, dedup,
merge, filters, stats) are reused unchanged inside the orchestrator.

**Key quota optimization:** once an artist's channel is known, enumerate the
catalogue via the channel's uploads playlist (`playlistItems.list`, **1 unit per
50 videos**) instead of `search.list` (**100 units/call**) — ~100× cheaper and
more complete.

## 4. Quota & compliance facts (verified against current docs, Nov 2026)

- YouTube Data API v3 is free. Since the **June 2026 quota model**, each project
  gets per day: **100 `search.list` calls** (search bucket), **100 `videos.insert`
  calls** (upload bucket), and **10,000 units shared by all other methods**
  (general bucket), resetting at midnight **Pacific Time**. Quota cannot be
  purchased; increases only via Google's audit/extension form, no guaranteed
  approval [^2][^3][^5].
- Costs are **method-specific**, not uniform: `videos.list`, `channels.list`,
  `playlists.list`, `playlistItems.list` = **1 unit/call** (batch up to 50 ids);
  `search.list` = 1 call from the search bucket (100/day); writes such as
  `playlists.insert` / `playlistItems.insert` / `videos.update` = **50 units**;
  `captions.insert` = 400. **Every page of pagination is another call**, so
  paging multiplies cost [^5].
- `playlistItems.list` on a channel's uploads playlist is a **cost-efficient
  discovery strategy, not a complete catalogue** (it misses videos where the
  channel is only featured, and anything unlisted/deleted). Search-based
  discovery is preserved as a **controlled fallback** for those cases.
- **Caching** of YouTube data must record provenance (source method, fetchedAt
  timestamp), expiry/refresh policy, and support deletion (user request + cache
  invalidation on takedown signals). This is specified for Phase D.
- The anonymous client UUID is an **identifier for rate limiting/usage
  accounting, not authentication** — it grants no access and is never logged raw.
- OAuth: the `youtube` scope is **sensitive** ⇒ unverified apps show an
  "unverified app" screen and are capped at a **permanent 100-new-user lifetime
  limit per project**; verification requires a verified domain, privacy policy,
  demo video and scope justification (~10 business days). Restricted scopes
  (Drive/Gmail) would additionally need a CASA assessment — we do not use them [^4].
- YouTube API Services Developer Policies: one API Project per API Client;
  credentials must not be shared, distributed, or embedded in open-source
  clients; identity must not be masked [^1]. ⇒ backend-held key is the compliant model.
- API Clients must link YouTube ToS and present their own privacy policy before
  API features are used [^1]. ⇒ Phase F deliverable (PRIVACY.md, TERMS.md).
- Google OAuth: the `youtube` scope is **sensitive** ⇒ unverified apps show an
  "unverified app" screen and are capped at a **permanent 100-user lifetime**
  limit; verification needs a verified domain, privacy policy, demo video and
  scope justification (~10 business days) [^4]. Restricted scopes (Drive/Gmail)
  would additionally need a CASA assessment — we do not use them.

## 5. Quota management service (Phase D design)

- Cache artist resolve + catalogue per artist (TTL 24–72h, refresh on demand).
- Request deduplication: identical in-flight discovery jobs share one execution.
- Per-anonymous-id rate limit (e.g. 10 discoveries/hour) + per-IP limit + global
  concurrency cap (semaphore) + Postgres-backed job queue.
- Usage accounting table (date, endpoint, units) + graceful `QUOTA_EXHAUSTED`
  with a friendly "service at capacity, try later" message.
- Cache-first reads: `videos.list`/`channels.list` results cached by id.

## 6. Hosting comparison

| Option | Cost at launch | Scale path | Secrets | DB | Verdict |
|---|---|---|---|---|---|
| **Fly.io** | ~$5–20/mo (small VM + Postgres + $2 dedicated IPv4 if key IP-restricted) | good | env vars | managed PG | **Recommended** — simple, fixed egress IP option, mature |
| Railway / Render | ~$5–20/mo | good | env vars | managed PG | Fine alternative; slightly pricier at scale |
| Cloudflare Workers + D1/KV | ~$5/mo free tier start | excellent (edge) | env vars | D1 (SQLite) | Good later if we go serverless; harder for job queues |
| Vercel + Neon | ~$0–20/mo | good | env vars | Neon PG | Serverless functions have time limits — poor fit for long discovery jobs |

Recommendation: **Fly.io (or Railway) + managed Postgres**, single region first.
No paid resource will be created without SPOOKEYfr's authorization.

### Operating cost estimates (rough, monthly)

| Users | Assumed activity | YouTube quota need | Infra cost |
|---|---|---|---|
| 100 | 2 discoveries/user/day, ~60% cache hits | ~80k units/day → **quota extension required (audit)** | $5–20 |
| 1,000 | same | ~800k–2M units/day → **large extension; shift to uploads-playlist enumeration to cut 100×** | $20–60 |
| 10,000 | same | multi-million units/day; likely needs strong caching + possibly reduced depth defaults | $100–300 |

Launch dependency: **quota extension request + OAuth verification** must be
approved before public release beyond ~100 OAuth users.

## 7. Extension changes (Phase E)

- New `services/backend/client.ts` calling `/v1/*`; discovery view calls backend
  instead of `YouTubeClient`.
- `services/config.ts` credentials UI becomes **developer-only** (hidden behind
  a dev flag), documented as such. Ordinary users never see it.
- Anonymous client id: random UUID in chrome.storage.local, sent as header;
  no account, no personal data.
- User OAuth (Create-on-YouTube) stays opt-in, minimal scope `youtube`, with
  disconnect in Settings.

## 8. Privacy design

- Collected: anonymous client id, query strings + timestamps (for abuse
  control), usage counters. **No names, emails, Google account data, playlists.**
- Playlists/library remain in `chrome.storage.local` only.
- Retention: discovery cache 24–72h; usage logs 30 days; deletable on request.
- Deliverables in Phase F: `PRIVACY.md`, `TERMS.md` (incl. YouTube ToS link per policy).

## 9. Migration plan from v0.2

1. Phase B: backend skeleton (health, validation, rate limit, secret mgmt) — no YouTube yet.
2. Phase C: move resolve/discover behind `/v1`, reusing v0.2 engine modules server-side.
3. Phase D: caching + quota manager + queue + graceful failures.
4. Phase E: extension switches to backend client; dev-only key path retained.
5. Phase F: privacy/terms/compliance checklists, deployment docs, browser matrix.

Existing v0.2 features (popup, side panel, dashboard, playlist builder with DnD,
multi-artist, refresh, compare, local library) are preserved — only the transport
layer changes.

## 10. Honest status ledger

| Item | Status |
|---|---|
| v0.2 extension | implemented, merged, unit-tested (56 tests) |
| Backend | **not implemented** |
| Local mock backend | **not implemented** |
| Deployed infrastructure | **none — nothing deployed, no paid services** |
| Real Google credentials on backend | **none** |
| Quota extension / OAuth verification | **not requested — requires SPOOKEYfr approval** |

[^1]: https://developers.google.com/youtube/terms/developer-policies
[^2]: https://outlierkit.com/resources/youtube-search-api/
[^3]: https://embedsocial.com/blog/youtube-api-key/
[^4]: https://support.google.com/cloud/answer/9110914
[^5]: https://developers.google.com/youtube/v3/getting-started (quota section) and Google Quota Calculator, verified Nov 2026

## 11. Phase B implementation notes (implemented, locally tested — NOT deployed)

The backend skeleton lives in `backend/` (zero runtime dependencies, Node >= 20,
`node:http` only): versioned `/v1` router, `GET /v1/health`, strict input
validation, consistent error envelope, env config validation, `SecretProvider`
interface with a throwing null default, anonymous client-id handling (identifier
only), per-client + per-IP sliding-window rate limits, body size limit, CORS
allowlist, structured privacy-conscious logging (hashed IPs, no bodies), provider
interfaces with NOT_IMPLEMENTED stubs, and a method-specific quota accountant.
40 backend tests pass; `tsc` clean; live local run verified (health 200,
validated discover 501, oversized body 413). Extension v0.2 untouched (56/56
tests still pass). Nothing deployed; no credentials exist anywhere.
