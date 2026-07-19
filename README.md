# BARCODE Network Site

The production web application for BARCODE Network, BARCODE Radio, the BNL-01 public control plane, the BNL Journal, the public Database, and the internal dossier workflow.

Production: <https://www.barcode-network.com>

## Active system map

| Area | Authoritative implementation |
| --- | --- |
| Public site | Next.js App Router under `src/app/` |
| Shared content and public dossiers | `src/content.ts` |
| Native Radio queue | `src/lib/queue.ts`, `/queue`, `/admin/queue`, and show-management routes |
| Queue uploads | Vercel Blob through `/api/queue/upload` |
| Priority payments | Stripe checkout and webhook routes |
| Queue, BNL, Journal, and dossier persistence | Upstash Redis |
| BNL public/admin state | Presence/Relay v2 routes and stores under `src/app/api/bnl/` and `src/lib/` |
| BNL Journal | Public `/journal`, admin `/admin/journal`, and Journal API/store modules |
| Internal dossier workflow | Admin dossier routes and `dossier-workflow*` modules |
| Public dossier rendering | Static entries adapted through `dossier-page-view-model.ts` into `DossierPageView.tsx` |

The native queue exists and is tested, but queue-derived public and BNL truth remains quarantined unless `BARCODE_QUEUE_PRODUCTION_ENABLED` is exactly `true`. Until the owner approves the native cutover, public Radio submission copy continues to point to Auxchord.

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
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Uploads | `BLOB_READ_WRITE_TOKEN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` |
| Queue operations | `QUEUE_API_KEY`, `CRON_SECRET`, `BARCODE_QUEUE_PRODUCTION_ENABLED` |
| Provider metadata | `YOUTUBE_DATA_API_KEY` or `YOUTUBE_API_KEY`, Spotify credentials, `SOUNDCLOUD_CLIENT_ID`, `APPLE_MUSIC_DEVELOPER_TOKEN` |
| BNL connection | `BNL_API_KEY`, `BNL_TOKEN`, force-pull and Source File credentials |

The queue production capability is fail-closed. The only enabled value is the lowercase string `true`; `1`, `yes`, missing, and malformed values remain disabled. See `docs/queue-production-capability.md`.

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
5. Verify `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true` without exposing payment or test-only state.

Rollback by removing the variable or setting it to anything other than exact `true`, then redeploying.

## Change discipline

- Extend the existing queue, relay, Journal, dossier, and identity systems instead of creating parallel replacements.
- Keep payments, queue state, public truth, BNL memory, and admin-only data separated by their existing authority boundaries.
- Do not treat historical prototypes as deployable code.
- Keep feature work separate from broad cosmetic redesigns unless the PR explicitly coordinates both.
