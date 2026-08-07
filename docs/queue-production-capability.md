# BARCODE queue production capability

`BARCODE_QUEUE_PRODUCTION_ENABLED` is a server-only production capability for allowing BARCODE Radio queue sessions and tracks to feed public and BNL-facing signals.

## Default-off behavior

The capability is disabled unless the environment variable value is exactly `true`. Unset, empty, `TRUE`, `1`, `yes`, or any other value is treated as disabled.

While disabled, test queue sessions and tracks do not affect global live status, public queue CTAs derived from live status, public show mode, BNL read-model queue projections, queue-derived artists, queue-derived operator lanes, dossier recommendations, Source File evidence, public authoring suggestions, or memory-like evidence.

Operational Radio submission surfaces also remain on the established Auxchord route while disabled. This includes the Radio page, Footer resource and description, Terminal `RADIO` response, and the BARCODE Radio sentence in BNL's public source context. Historical Auxchord database records and dossiers are canon records, not operational routing, and are unchanged by the capability.

## Authorized testing that remains available

Queue testing and admin workflows may continue in their existing authorized surfaces. The gate only blocks promotion of queue data into public/BNL truth surfaces. It does not change queue mechanics, playback, submissions, provider integrations, admin controls, uploads, priority lanes, scheduling, simulations, payments, or routes.

## Blocked from public and BNL consumption

When disabled, the global live-status provider does not poll `/api/queue`, cached queue snapshots are cleared, and `/api/bnl/read-model` returns an explicit unavailable queue contract with `capabilities.queueProduction=false` instead of live sessions, queue tracks, now-playing, up-next, queue counts, queue-derived artists, recap candidates, queue-derived copy candidates, or queue-derived dossier suggestions. Queue-lane recommendation ingest such as `queue_context` is rejected before it can create approved BNL/Source File evidence.

Manual and scheduled TikTok live status remains independent. A legitimate manual or scheduled live state may still produce broadcast-live public show mode.

## Native submission presentation

When the capability is enabled, one server-side presentation contract moves the operational Radio submission surfaces to `/queue`, changes the link from external to internal, and uses native-queue wording. The contract does not expose the environment variable to client code and does not change queue/session storage, ordering, Wheel or Priority behavior, playback, payment handling, uploads, provider resolution, or BNL write authority.

The native form accepts supported SoundCloud, Spotify, YouTube, and TikTok links plus direct MP3/WAV uploads. New Apple Music queue submissions are rejected because BARCODE Radio cannot reliably access the full track; release, catalog, dossier, historical, and archived Apple Music links elsewhere remain unaffected. Amazon Music, Suno, and Bandcamp continue through the form's existing external-link path.

## Vercel rollout procedure

1. Leave production disabled until the owner explicitly declares the queue ready for production use.
2. In Vercel, add `BARCODE_QUEUE_PRODUCTION_ENABLED` to the intended environment only.
3. Set the value to exactly `true` when the owner approves production queue signals.
4. Redeploy the site so server-only code reads the new environment value.
5. Confirm `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`.
6. Confirm `/radio`, the Footer, and Terminal `RADIO` route submission to `/queue` as internal links.
7. Confirm `/queue` shows an honest closed/waiting state when no session is open and the active session when one is open.
8. Keep the bot's separate queue-production gate disabled until the site cutover is verified and the owner explicitly approves sanitized bot context.

## Rollback

Unset `BARCODE_QUEUE_PRODUCTION_ENABLED` or set it to anything other than exact `true`, then redeploy. The default-off behavior resumes, operational submission links return to Auxchord, and queue testing data is quarantined from public and BNL signals. The bot's separate queue-production gate must remain disabled during rollback.
