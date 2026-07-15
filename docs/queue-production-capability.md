# BARCODE queue production capability

`BARCODE_QUEUE_PRODUCTION_ENABLED` is a server-only production capability for allowing BARCODE Radio queue sessions and tracks to feed public and BNL-facing signals.

## Default-off behavior

The capability is disabled unless the environment variable value is exactly `true`. Unset, empty, `TRUE`, `1`, `yes`, or any other value is treated as disabled.

While disabled, test queue sessions and tracks do not affect global live status, public queue CTAs derived from live status, public show mode, BNL read-model queue projections, queue-derived artists, queue-derived operator lanes, dossier recommendations, Source File evidence, public authoring suggestions, or memory-like evidence.

## Authorized testing that remains available

Queue testing and admin workflows may continue in their existing authorized surfaces. The gate only blocks promotion of queue data into public/BNL truth surfaces. It does not change queue mechanics, playback, submissions, provider integrations, admin controls, uploads, priority lanes, scheduling, simulations, payments, or routes.

## Blocked from public and BNL consumption

When disabled, the global live-status provider does not poll `/api/queue`, cached queue snapshots are cleared, and `/api/bnl/read-model` returns an explicit unavailable queue contract with `capabilities.queueProduction=false` instead of live sessions, queue tracks, now-playing, up-next, queue counts, queue-derived artists, recap candidates, queue-derived copy candidates, or queue-derived dossier suggestions. Queue-lane recommendation ingest such as `queue_context` is rejected before it can create approved BNL/Source File evidence.

Manual and scheduled TikTok live status remains independent. A legitimate manual or scheduled live state may still produce broadcast-live public show mode.

## Vercel rollout procedure

1. Leave production disabled until the owner explicitly declares the queue ready for production use.
2. In Vercel, add `BARCODE_QUEUE_PRODUCTION_ENABLED` to the intended environment only.
3. Set the value to exactly `true` when the owner approves production queue signals.
4. Redeploy the site so server-only code reads the new environment value.
5. Confirm `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`.

## Rollback

Unset `BARCODE_QUEUE_PRODUCTION_ENABLED` or set it to anything other than exact `true`, then redeploy. The default-off behavior resumes and queue testing data is quarantined from public and BNL signals.
