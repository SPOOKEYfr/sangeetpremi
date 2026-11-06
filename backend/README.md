# SangeetPremi Backend (Phase B foundation)

Zero-dependency Node.js (>=20) HTTP API skeleton for the zero-configuration
SangeetPremi architecture. **No external providers are wired and no secrets are
loaded** — provider stubs return structured `NOT_IMPLEMENTED` errors.

Created and developed by **SPOOKEYfr**.

## Run locally

```bash
cd backend
npm install
npm run build
PORT=8080 npm start          # or: npm run dev (build + run)
```

No environment variables are required for Phase B; safe defaults apply.
See `.env.example` for the full list (never commit real values).

## Test

```bash
npm test          # vitest, 40 tests
npm run typecheck
```

## API (v1)

All responses use the envelope `{ ok: true, data }` / `{ ok: false, error: { code, message, details? } }`.

| Method | Path | Phase B behavior |
|---|---|---|
| GET | `/v1/health` | ✅ implemented (status, version, phase, uptime) |
| GET | `/v1/artists/resolve?q=` | validates `q`, then 501 (provider = Phase C) |
| POST | `/v1/discover` | validates body (`artists` 1–5, `depth`, `categories`, `filters`), then 501 |
| GET | `/v1/discover/:id` | validates id, then 501 |
| GET | `/v1/discover/:id/events` | SSE contract, then 501 |
| POST | `/v1/discover/:id/refresh` | validates id, then 501 |
| GET | `/v1/videos/:id` | validates 11-char video id, then 501 |

## Security protections (implemented)

- Anonymous client id header (`X-SangeetPremi-Client-Id`, UUID) — an identifier
  for rate limiting only, **not authentication**; malformed values rejected
- Per-client and per-IP sliding-window rate limits → `429 RATE_LIMITED`
- Request body size limit → `413 PAYLOAD_TOO_LARGE`; JSON-only → `415`
- Strict input validation on all routes → `400 INVALID_INPUT`
- CORS allowlist via `ALLOWED_ORIGINS`; preflight handled
- Structured JSON logging that never logs bodies/queries/headers; IPs are
  SHA-256-truncated fingerprints
- `SecretProvider` interface with a `NullSecretProvider` default that throws if
  any code tries to read a secret — accidental credential use fails loudly
- Method-specific YouTube quota cost table + in-memory `QuotaAccountant`
  (search bucket 100/day, uploads bucket 100/day, 10,000 general units/day,
  reset midnight Pacific) ready for Phase C/D

## Providers (Phase C1 — real adapters, mock-tested, no live calls in tests)

- `src/providers/youtube.ts` — `YouTubeVideoProvider` (VideoProvider): `channels.list`
  (channel identification + uploads-playlist id), `playlistItems.list` (paginated uploads
  enumeration — **not a complete catalogue**; search remains the controlled fallback),
  `search.list` (fallback), `videos.list` (batched metadata). Server-side key via
  `SecretProvider` only; key is redacted from all errors; quota reserved **before** each
  call and released on failure (atomic in the single-instance design); bounded retries,
  timeouts, defensive normalization, provenance (`source`/`fetchedAt`/`expiresAt`).
- `src/providers/musicbrainz.ts` — `MusicBrainzProvider` (MetadataProvider): `artist/?query=`,
  `recording/?query=arid:`. No API key; descriptive User-Agent with owner contact placeholder;
  ~1 req/s limiter; bounded retries on 503/429; MBIDs preserved; no invented metadata.
- Providers are selected via `ENABLE_YOUTUBE_PROVIDER` / `ENABLE_MUSICBRAINZ_PROVIDER` env
  flags; without the flag (or without the secret) the Phase B stubs are used, so no live
  external call can happen unintentionally.

## Module structure

```
backend/src/
├── index.ts            # entrypoint
├── app.ts              # composition root
├── config.ts           # env config + validation
├── secrets.ts          # SecretProvider iface + Env/Null providers
├── logger.ts           # structured privacy-conscious logging
├── quota.ts            # method-specific quota costs + accountant
├── http/               # zero-dep server, router, envelope
├── middleware/         # clientId, rateLimit, cors, validate
├── providers/          # MetadataProvider / VideoProvider ifaces + stubs
└── routes/v1/          # health, artists, discover, videos
```

## Explicitly NOT done (by design)

No live YouTube/MusicBrainz calls, no real credentials, no deployment, no
database, no quota/verification requests. See `docs/ARCHITECTURE_V0.3.md`.
