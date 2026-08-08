# BARCODE queue production capability

`BARCODE_QUEUE_PRODUCTION_ENABLED` is the server-only capability for native BARCODE Radio participation and the outer boundary for queue-derived public/BNL signals. It is necessary but no longer sufficient for BNL queue projection: each queue session also carries explicit purpose and BNL-publication provenance.

## Default-off behavior

The capability is disabled unless the environment variable value is exactly `true`. Unset, empty, `TRUE`, `1`, `yes`, or any other value is treated as disabled.

While disabled, queue sessions and tracks do not affect global live status, public queue CTAs derived from live status, public show mode, BNL read-model queue projections, queue-derived artists, queue-derived operator lanes, dossier recommendations, Source File evidence, public authoring suggestions, or memory-like evidence. No session-level approval can bypass this outer capability.

Operational Radio submission surfaces also remain on the established Auxchord route while disabled. This includes the Radio page, Footer resource and description, Terminal `RADIO` response, and the BARCODE Radio sentence in BNL's public source context. Historical Auxchord database records and dossiers are canon records, not operational routing, and are unchanged by the capability.

## Authorized testing that remains available

Queue testing and admin workflows may continue in their existing authorized surfaces. The gate only blocks promotion of queue data into public/BNL truth surfaces. It does not change queue mechanics, playback, submissions, provider integrations, admin controls, uploads, priority lanes, scheduling, simulations, payments, or routes.

## Blocked from public and BNL consumption

When disabled, the global live-status provider does not poll `/api/queue`, cached queue snapshots are cleared, and `/api/bnl/read-model` returns an explicit unavailable queue contract with `capabilities.queueProduction=false` instead of live sessions, queue tracks, now-playing, up-next, queue counts, queue-derived artists, recap candidates, queue-derived copy candidates, or queue-derived dossier suggestions. Queue-lane recommendation ingest such as `queue_context` is rejected before it can create approved BNL/Source File evidence.

Manual and scheduled TikTok live status remains independent. A legitimate manual or scheduled live state may still produce broadcast-live public show mode.

## Native submission presentation

When the capability is enabled, one server-side presentation contract moves the operational Radio submission surfaces to `/queue`, changes the link from external to internal, and uses native-queue wording. The contract does not expose the environment variable to client code and does not change queue/session storage, ordering, Wheel or Priority behavior, playback, payment handling, uploads, provider resolution, or BNL write authority.

The native form accepts supported SoundCloud, Spotify, YouTube, and TikTok links plus direct MP3/WAV uploads. New Apple Music queue submissions are rejected because BARCODE Radio cannot reliably access the full track; release, catalog, dossier, historical, and archived Apple Music links elsewhere remain unaffected. Amazon Music, Suno, and Bandcamp continue through the form's existing external-link path.

## Atomic acceptance and 44-slot contract

The default session capacity is 44 accepted show slots. The accepted count is the unique set of non-simulation tracks in queued/playing, Next In Line, loaded/Now Playing, and completed/played state. Removed tracks, simulation tracks, rejected duplicates, rejected limit/cooldown attempts, and submissions that did not persist are excluded. Playing or finishing a track does not free its show slot; removing one does.

Capacity closure is distinct from a manual close, ended broadcast, or archive. Reaching capacity closes intake with `submissionClosureReason=capacity` while the active session remains open for show operations. Removing a counted track reopens only a capacity-closed session. A manually closed, ended, or archived session stays closed after removal. Public status and admin/session summaries expose both `activeCount` for current queue depth and `acceptedCount` for capacity, plus the closure reason.

Every persisted queue change—submission, admin action, session/settings update, upload cleanup metadata, Priority checkout/payment transition, and legacy queue helper—uses the same serialized mutation boundary. Redis-backed mutations acquire a bounded lease and commit the complete state with a fencing token and monotonic revision; in-process mutations use the same contract. Provider metadata lookup happens before admission enters the critical section, then the current session, capacity, duplicate identity, artist limit, and cooldown are re-read and revalidated inside it. Concurrent workers therefore cannot both claim the final slot or overwrite one another.

Public and admin snapshot reads are non-persistent: polling may derive the current display state, but it does not write the queue or advance its revision. Apple Music host rejection, including terminal-dot host variants such as `music.apple.com.`, occurs before any queue snapshot read.

## Session provenance and BNL publication

Native queue visibility, payment, playback, and operator controls remain independent from BNL publication. Every session has:

- `purpose`: `rehearsal`, `live_broadcast`, `simulation`, `internal_test`, or the normalized safe legacy value `unknown`;
- `bnlPublicationStatus`: `private`, `runtime_only`, `recap_approved`, or `public_copy_approved`;
- `provenanceRevision`: `0` for normalized legacy state, `1` at explicit session creation, then incremented by each explicit admin change;
- `provenanceUpdatedAt`: the timestamp of the latest explicit admin provenance action, or `null` for legacy/unknown state.

New sessions default to `rehearsal` + `private`. Stored sessions without provenance normalize to `unknown` + `private`. Rehearsal, simulation, internal-test, and unknown sessions are quarantined from every queue-derived BNL lane regardless of native queue visibility or any malformed stored publication value.

Only `live_broadcast` sessions can use the publication levels:

| BNL publication status | Sanitized runtime context | Completed recap candidates | Generic queue public-copy candidates |
| --- | --- | --- | --- |
| `private` | No | No | No |
| `runtime_only` | Yes | No | No |
| `recap_approved` | Yes | Yes | No |
| `public_copy_approved` | Yes | Yes | Yes |

Broadcast Memory and dossier-seed lanes remain empty and independently controlled at every level. Session approval never enables bot memory, bot queue observation, Source File creation, dossier publication, payment identity, Discord identity linking, queue mutation, or any bot/public gate. Public dossier summaries in the read model remain an independent website source and are not evidence that an unpublished queue session was projected.

Admin Show Management records the purpose and BNL publication level at creation and permits an explicit later change, including for an archive. Reading or archiving a session does not upgrade it. Existing rehearsal rows are not silently approved or rewritten into broadcast provenance.

## Vercel rollout procedure

1. Leave production disabled until the owner explicitly declares the queue ready for production use.
2. In Vercel, add `BARCODE_QUEUE_PRODUCTION_ENABLED` to the intended environment only.
3. Set the value to exactly `true` when the owner approves production queue signals.
4. Redeploy the site so server-only code reads the new environment value.
5. Confirm `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`.
6. Confirm a rehearsal/private session reports queue projection unavailable with no queue-derived artist, runtime, recap, or public-copy lane items while `/queue` remains usable.
7. If the owner explicitly approves a live-broadcast publication level, confirm `/api/bnl/read-model` exposes only the mapped sanitized lanes.
8. Confirm `/radio`, the Footer, and Terminal `RADIO` route submission to `/queue` as internal links.
9. Confirm `/queue` shows an honest closed/waiting state when no session is open and the active session when one is open.
10. Keep the bot's separate queue-production gate disabled until the site cutover is verified and the owner explicitly approves sanitized bot context.

## Rollback

Unset `BARCODE_QUEUE_PRODUCTION_ENABLED` or set it to anything other than exact `true`, then redeploy. The default-off behavior resumes, operational submission links return to Auxchord, and queue testing data is quarantined from public and BNL signals. The bot's separate queue-production gate must remain disabled during rollback.
