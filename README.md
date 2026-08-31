# BARCODE Network Site

The production web application for BARCODE Network, BARCODE Radio, the BNL-01 public control plane, the BNL Journal, the public Database, and the internal dossier workflow.

Production: <https://www.barcode-network.com>

## Active system map

| Area | Authoritative implementation |
| --- | --- |
| Public site | Next.js App Router under `src/app/` |
| Shared content and public dossiers | `src/content.ts` |
| Native Radio queue | Redis mutation authority plus private, revisioned Vercel Blob read/recovery snapshots in `src/lib/queue.ts` and `src/lib/queue-durable-snapshot.ts` |
| Broadcast companion and public history | Live `/radio/deck`, separate post-show `/radio/archive`, and the sanitized queue history projection served by `/api/queue/stats` |
| Queue uploads | Vercel Blob through `/api/queue/upload` |
| Priority payments | Stripe checkout and webhook routes |
| Queue, BNL, Journal, and dossier persistence | Upstash Redis |
| BNL public/admin state | Presence/Relay v2 routes and stores under `src/app/api/bnl/` and `src/lib/` |
| BNL Journal | Public `/journal`, admin `/admin/journal`, Journal API/store modules, and the [authenticated control snapshot](docs/bnl-journal-control-snapshot-v1.md) |
| Internal dossier workflow | Admin dossier routes and `dossier-workflow*` modules |
| Public dossier rendering | Static entries adapted through `dossier-page-view-model.ts` into `DossierPageView.tsx` |

The native queue exists and is tested, but native presentation remains quarantined unless `BARCODE_QUEUE_PRODUCTION_ENABLED` is exactly `true`. Until the owner approves the native cutover, operational Radio submission links and copy continue to point to Auxchord. When enabled, the server-side capability moves the Radio page, Footer, Terminal, and BNL public source context to the native `/queue` route; historical Auxchord records remain intact. Each session then has one plain BNL queue-access choice: no access, private read-only access, or public read-only access. Private access uses the existing BNL service credential and is restricted to owner/admin test operators; regular members are not BNL testers. Public access is available only to live broadcasts and may support public BNL output. Both readable modes use the same sanitized operational queue contract, exclude payment and sensitive fields, and never grant BNL mutation or playback authority. The only durable-memory exception is the separate versioned `sections.artistMemory` catalog described below; no other queue section gains memory, dossier, Source File, relationship, or canon authority. Legacy stored publication values are normalized into those three meanings and are not separate admin options.

That capability also seals direct native entry points: while disabled, anonymous queue pages return to Radio, legacy `/obs` is unavailable, and queue read/write, upload-token, Priority checkout-initiation, and Signal Hold checkout-initiation APIs fail closed. Admin access and a signed capability for the exact current rehearsal remain available; Stripe webhook reconciliation remains active so rollback cannot strand an already-started payment.

Queue acceptance uses 44 show slots by default. A slot remains occupied when a real track moves from queued to Next In Line, loaded/Now Playing, or completed/played; removal frees it, while simulations and failed or rejected attempts never consume one. Queue writes share one serialized, revisioned Redis mutation boundary. Every successful mutation is copied to a private, checksummed Blob revision; public/admin polling reads that durable model without spending Redis commands. Redis quota failures therefore leave the last committed queue visible while mutations fail closed.

The Broadcast Deck is the live show companion and links to, but does not embed, the separate Broadcast Archive. Its full-show activity route retains public-safe submissions, playback movement and outcomes, removals and returns, Wheel unlocks and ceremony changes, Signal Hold movement, broadcast state, and sponsor-break transitions; visitors can filter and reorder the complete retained log without changing queue state. The active queue and its accepted-submission receipt are the only public Deck entry points; the initial queue gateway, Radio hub, Broadcast Archive, and sitemap do not advertise it. Deck copy directs unfinished submissions back to the queue and frames the Deck as the watch-along for people who are done submitting or are only watching. A track may expose an `Open music` action only when it carries a validated external HTTP(S) link. Uploaded tracks may still appear as non-clickable show metadata, but their file URLs and file player never enter the Deck. Public Archive history begins on 2026-08-24 and is rebuilt only from archived sessions explicitly marked `live_broadcast`; active shows remain on the Deck, and older shows are not automatically imported. Rehearsals, simulations, private upload URLs, payment state, moderation data, private contact details, and browser tokens remain outside the public projection. Submitted TikTok handles are attribution for who submitted a track, not verified identity or artist ownership.

Public live-broadcast sessions at or after the same 2026-08-24 coverage boundary also feed one structured `queue_artist_memory_v1` catalog. A new accepted track is provisional; a recorded playback start or played outcome promotes it to confirmed, while an unplayed removal stays provisional and retains its removal outcome. New public intake collects submitted song and artist labels but does not ask for or accept a submitted album/project label; provider-detected album metadata and historical stored submitted album values remain compatible with the catalog. Exactly one semantic provider artist ID may own the primary grouping; YouTube channel IDs and SoundCloud uploader IDs remain provider-account provenance, not inferred artist identities. When submitted and provider labels disagree in compatible historical records, both are retained with a conflict marker and the provider label is preferred for display without erasing the submission. Fallback grouping uses the submitted TikTok attribution plus artist-name key, never a Discord account. Uploads may contribute submitted public labels but never a file URL, filename, media type, size, or detected file metadata. The catalog explicitly authorizes only these public music/show facts for BNL durable memory and never authorizes automatic dossiers, Source Files, relationships, or canon identity.

The BNL archive and artist-memory sections retain their schema, source, policy,
and coverage metadata even when unavailable. Unavailable envelopes report a
reason and use `null` source revision, digest, and build time rather than
presenting an empty or freshly generated projection as durable truth. A
temporary queue/projection read failure degrades only those queue-owned lanes,
returns them with `available=false`, and is never cached; it does not fabricate
history or catalog freshness.

Authenticated operators can verify the same queue-to-companion pipeline at Admin → Queue Control → Private Broadcast Test. Rehearsal, simulation, internal-test, and legacy/unknown sessions remain public-dark: they cannot trigger public `Live Now` or appear in the public Deck or Archive. A current rehearsal session issues an admin-only, signed private queue link. Anyone the operator sends that link to can enter the real rehearsal queue, see its truthful Open/Closed state, submit links or uploads while submissions are open, and use enabled checkout features; the link grants no admin or BNL authority and stops working when that rehearsal ends. Simulation and internal-test intake remain admin-only. The private test surface selects one persisted session, reuses the production Deck and Archive components, and exposes a fresh queue-store revision/count/digest readback. Simulation tracks remain capacity-exempt but participate in rehearsal/test timing so the private run behaves like a real show. After the operator ends and archives the test session, its show and artist records become available only in that authenticated Archive Preview.

`stream-engine/`, `discord-bot/`, and `_archive/` are historical references. They are not production services and do not define current queue contracts.

Archived public show milestones retain stable track links, play/submission order, lifecycle outcomes, and bounded operational details so authorized BNL consumers can reconstruct the same public-safe show sequence after the live snapshot expires.

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
| Dedicated queue Redis | `QUEUE_REDIS_REST_URL`, `QUEUE_REDIS_REST_TOKEN` (required in Vercel Production; non-production migration workflows may fall back to shared Redis) |
| Uploads | `BLOB_READ_WRITE_TOKEN` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` |
| Queue operations | `QUEUE_API_KEY`, `CRON_SECRET`, `BARCODE_QUEUE_PRODUCTION_ENABLED` |
| Provider metadata | `YOUTUBE_DATA_API_KEY` or `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, optional `SOUNDCLOUD_CLIENT_ID` |
| BNL connection | `BNL_API_KEY`, `BNL_TOKEN`, force-pull and Source File credentials |

YouTube Music watch links use the same YouTube video-ID and Data API path as ordinary YouTube links. Provider metadata is optional and fail-soft: unavailable, slow, malformed, or oversized responses fall back to submitted track details and the queue's internal duration estimate instead of blocking intake. Apple Music is not accepted for BARCODE Radio intake because the host cannot reliably access the full submitted track. Apple Music links used elsewhere for releases, catalogs, dossiers, or historical records are unaffected.

The queue production capability is fail-closed. The only enabled value is the lowercase string `true`; `1`, `yes`, missing, and malformed values remain disabled. See `docs/queue-production-capability.md`. The queue recovery architecture, quota-lock test, deployment order, and evidence checklist are in `docs/queue-disaster-recovery.md`.

## Verification

The current unlisted BARCODE World owner-review checkpoint is the
[enemy AI + scenario laboratory v0.4](docs/barcode-world-ai-scenario-lab-v0.4.md).
It remains branch-preview-only and does not alter the production site.

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
5. Verify `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`. A rehearsal with Private BNL access must remain unavailable anonymously while the authenticated BNL service receives only its sanitized private lane; an explicitly approved live broadcast may expose only its selected sanitized public lanes without payment or test-only state.
6. Verify `/radio`, the Footer, and Terminal `RADIO` point to `/queue`, and verify the queue's honest open/closed state.
7. Leave the bot's independent queue-production gate disabled until this site cutover is verified and separately approved.

Rollback by removing the variable or setting it to anything other than exact `true`, then redeploying. Operational submission surfaces return to Auxchord and every queue-derived BNL lane is quarantined regardless of session publication state.

## Change discipline

- Extend the existing queue, relay, Journal, dossier, and identity systems instead of creating parallel replacements.
- Keep payments, queue state, public truth, BNL memory, and admin-only data separated by their existing authority boundaries.
- Do not treat historical prototypes as deployable code.
- Keep feature work separate from broad cosmetic redesigns unless the PR explicitly coordinates both.
