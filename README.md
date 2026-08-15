# BARCODE Network Site

The production web application for BARCODE Network, BARCODE Radio, the BNL-01 public control plane, the BNL Journal, the public Database, and the internal dossier workflow.

Production: <https://www.barcode-network.com>

## Active system map

| Area | Authoritative implementation |
| --- | --- |
| Public site | Next.js App Router under `src/app/` |
| Shared content and public dossiers | `src/content.ts` |
| Native Radio queue | Redis mutation authority plus private, revisioned Vercel Blob read/recovery snapshots in `src/lib/queue.ts` and `src/lib/queue-durable-snapshot.ts` |
| Queue uploads | Vercel Blob through `/api/queue/upload` |
| Priority payments | Stripe checkout and webhook routes |
| Queue, BNL, Journal, and dossier persistence | Upstash Redis |
| BNL public/admin state | Presence/Relay v2 routes and stores under `src/app/api/bnl/` and `src/lib/` |
| BNL Journal | Public `/journal`, admin `/admin/journal`, Journal API/store modules, and the [authenticated control snapshot](docs/bnl-journal-control-snapshot-v1.md) |
| Internal dossier workflow | Admin dossier routes and `dossier-workflow*` modules |
| Public dossier rendering | Static entries adapted through `dossier-page-view-model.ts` into `DossierPageView.tsx` |

The native queue exists and is tested, but native presentation remains quarantined unless `BARCODE_QUEUE_PRODUCTION_ENABLED` is exactly `true`. Until the owner approves the native cutover, operational Radio submission links and copy continue to point to Auxchord. When enabled, the server-side capability moves the Radio page, Footer, Terminal, and BNL public source context to the native `/queue` route; historical Auxchord records remain intact. Queue-derived BNL context has an additional session-level boundary: only a session explicitly marked `live_broadcast` can opt into `runtime_only`, `recap_approved`, or `public_copy_approved`. New rehearsals and legacy/unknown sessions remain private by default even when the native queue is publicly usable.

Queue acceptance uses 44 show slots by default. A slot remains occupied when a real track moves from queued to Next In Line, loaded/Now Playing, or completed/played; removal frees it, while simulations and failed or rejected attempts never consume one. Queue writes share one serialized, revisioned Redis mutation boundary. Every successful mutation is copied to a private, checksummed Blob revision; public/admin polling reads that durable model without spending Redis commands. Redis quota failures therefore leave the last committed queue visible while mutations fail closed.

`stream-engine/`, `discord-bot/`, and `_archive/` are historical references. They are not production services and do not define current queue contracts.

## Requirements

- Node.js 22 is the development and CI baseline. Next.js requires Node.js 20.9 or newer.
- npm, using the committed root `package-lock.json`.

```bash
nvm use
npm ci
npm run dev
```

The local application runs at <http://localhost:3000>.

## Environment

Do not commit secrets. Configure only the integrations needed for the surface being tested.

| Group | Variables |
| --- | --- |
| Admin access | `ADMIN_PASSWORD`, `JWT_SECRET` |
| Shared Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Dedicated queue Redis | `QUEUE_REDIS_REST_URL`, `QUEUE_REDIS_REST_TOKEN` (recommended; falls back to shared Redis only during migration) |
| Uploads | `BLOB_READ_WRITE_TOKEN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` |
| Queue operations | `QUEUE_API_KEY`, `CRON_SECRET`, `BARCODE_QUEUE_PRODUCTION_ENABLED` |
| Provider metadata | `YOUTUBE_DATA_API_KEY` or `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, optional `SOUNDCLOUD_CLIENT_ID` |
| BNL connection | `BNL_API_KEY`, `BNL_TOKEN`, force-pull and Source File credentials |

YouTube Music watch links use the same YouTube video-ID and Data API path as ordinary YouTube links. Provider metadata is optional and fail-soft: unavailable, slow, malformed, or oversized responses fall back to submitted track details and the queue's internal duration estimate instead of blocking intake. Apple Music is not accepted for BARCODE Radio intake because the host cannot reliably access the full submitted track. Apple Music links used elsewhere for releases, catalogs, dossiers, or historical records are unaffected.

The queue production capability is fail-closed. The only enabled value is the lowercase string `true`; `1`, `yes`, missing, and malformed values remain disabled. See `docs/queue-production-capability.md`. The queue recovery architecture, quota-lock test, deployment order, and evidence checklist are in `docs/queue-disaster-recovery.md`.

## Verification

```bash
npm run check
npm run build
```

`npm run check` runs TypeScript, ESLint, and every tracked Node test file. Focused suites remain available:

```bash
npm run test:shell
npm run test:queue
npm run test:bnl
```

GitHub Actions runs the same check and production build for pull requests and pushes to `main`.

## Deployment

`main` is the stable production branch and is deployed through Vercel. Changes must arrive through a pull request.

Before enabling native queue-derived public truth:

1. Complete the production rehearsal with the capability disabled.
2. Confirm Redis, Blob, Stripe, and provider configuration.
3. Set `BARCODE_QUEUE_PRODUCTION_ENABLED=true` in the intended Vercel environment.
4. Redeploy.
5. Verify `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`. A private/rehearsal session must still report its queue projection unavailable; an explicitly approved live broadcast must expose only its selected sanitized lanes without payment or test-only state.
6. Verify `/radio`, the Footer, and Terminal `RADIO` point to `/queue`, and verify the queue's honest open/closed state.
7. Leave the bot's independent queue-production gate disabled until this site cutover is verified and separately approved.

Rollback by removing the variable or setting it to anything other than exact `true`, then redeploying. Operational submission surfaces return to Auxchord and every queue-derived BNL lane is quarantined regardless of session publication state.

## Change discipline

- Extend the existing queue, relay, Journal, dossier, and identity systems instead of creating parallel replacements.
- Keep payments, queue state, public truth, BNL memory, and admin-only data separated by their existing authority boundaries.
- Do not treat historical prototypes as deployable code.
- Keep feature work separate from broad cosmetic redesigns unless the PR explicitly coordinates both.
