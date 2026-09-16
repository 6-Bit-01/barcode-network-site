# Show repair 2 — video preparation and buffering

Owner: **6 Bit**. Issue: V01. Review base: credits/counts PR #423, commit `9b6707baf3c26bdc72b2e63c9d28f9433a7b32ab`. This is the next scoped draft in the agreed repair batch. Shared-brain repair remains paused.

## Evidence and behavior

The host YouTube handler recorded state 3 as a stall but left the shared clock playing. The TikTok host ignored state 3. Receivers could repeatedly bypass their correction cooldown for the same seek packet or a paused packet, and a delayed TikTok play callback could run after a newer pause. These code paths explain specific ways buffering could cause chopping and timing errors; they do not prove every reported video failure has one cause.

The historical July 11 player (`7f71f80364940c57dce495c4bbbc8b9bc2be1ce3`) contains the remembered server-scheduled TikTok start. This change adapts that mechanism to the current stable YouTube and TikTok players. It does not replace the current media lifecycle with the old implementation.

The current host now publishes a paused, observed position when ready, allowing the overlay to initialize before Play. A new play or resume from a deliberate pause holds the host and requests a common start three seconds after server receipt. The existing authenticated sync write returns the stamped start token and deadline. Both players use that server clock; the held position does not advance during preparation. Ordinary heartbeats retain their compact acknowledgement, one-second cadence, and existing single Redis write. Preparation is transient state in the existing player-sync record.

Repeated polls prepare one start once. Cancel start, track cleanup, stop/error and newer pause state invalidate pending timers. Failed acknowledgements leave the host paused with a retry message, and sync requests have a timeout. Actual buffering freezes the shared playback clock; recovery resumes from observed media time. A fresh manual seek may override the cooldown once, while repeated polls and buffering heartbeats cannot repeatedly force that seek. Existing asymmetric drift thresholds, muted overlays, stable media identities, provider origins and queue playback ownership remain in place.

The provider references confirm that state 3 means buffering in both players. YouTube's cue operation alone loads a thumbnail; seeking requests the media. References: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [TikTok Embed Player](https://developers.tiktok.com/docs/en/embed-player).

## Impact

| Files | Responsibility |
| --- | --- |
| `src/components/AdminRadioQueueControl.tsx` | Host preparation, observed clocks, buffering, serialized sync publication, cancellation and retry UI. |
| `src/components/LiveOverlayReceiver.tsx` | One preparation per start token, server deadline, buffered drift handling, stale delayed-play guards. |
| `src/lib/video-start-gate.ts` | Small timer/cancellation helpers shared by the existing players; no new player or service. |
| `src/lib/live-overlay-resolver.ts`, `src/lib/live-overlay.ts` | Optional scheduled-start fields, bounded server stamping and preserved stored normalization. |
| `src/app/api/admin/overlay/live/route.ts` | Scheduled acknowledgement through the existing authenticated write, without snapshot rebuilding. |
| `tests/video-start-buffering.test.mjs`, `tests/live-overlay-write-budget.test.mjs`, `tests/live-overlay-resolver.test.mjs`, `tests/queue-playback.test.mjs` | Production callback, clock, cancellation, repeat-poll, storage and compatibility regressions. |

## Verification

Focused verification exercises the production callbacks with provider events and fake timers, plus the actual sync storage and route paths. It covers both providers, time-zero observation, buffering/resume, a forged frame source, delayed acknowledgements, a paused host, repeated seek packets and common-start projection. Existing queue lifecycle tests verify that a stall/error does not advance or finish a track.

```bash
node --test tests/video-start-buffering.test.mjs tests/live-overlay-resolver.test.mjs tests/live-overlay-write-budget.test.mjs tests/queue-playback-lifecycle.test.mjs tests/queue-playback.test.mjs
```

Final local validation: `npm ci` passed; `npm run check` passed all **1,119 tests**, with zero TypeScript/ESLint errors and 36 existing ESLint warnings; `npm run build` passed. The focused playback run passed 34 tests before the final release-buffer edge-case assertions were added; those assertions passed in the final full suite. Exact source hashes are recorded in the PR and source pack.

## Normal post-merge deployment and combined acceptance

Keep this draft queued for the agreed combined rehearsal. Merge dependencies in order through the normal PR workflow when reviewed for deployment; allow the existing Vercel integration to deploy `main`, then verify Ready status and the served commit. Refresh the host and Studio browser sources together so their player protocol versions match. No new environment variables, database migration, helper installation or bot restart are required for this PR.

For the later private rehearsal, record the deployment commit, Studio/browser versions, session/track IDs and timestamps. Keep the private rehearsal out of public archive and BNL publication. Test:

1. A cold first YouTube video, a normal second video, a Short, a TikTok post, and A → B → A. Confirm the paused overlay initializes, Play gives the preparation delay, both begin at the held media position, and polling does not reload the iframe.
2. Pause/resume, forward/backward seek, Cancel start, rapid track replacement during preparation, and a late/failed sync response. No cancelled or previous track may start afterward.
3. A controlled network stall. Capture host lifecycle diagnostics and overlay drift/correction attributes. The clock must pause during buffering; recovery must not create a repeated seek loop or advance the queue.
4. Compare a distinctive cut or beat with the original video's timing at the beginning and later in playback. Record observed drift and any repeated correction timestamps. Provider failures and autoplay blocks must remain visible.

The delay provides a preparation window, not proof that an arbitrary network or provider has buffered enough. There is no overlay-to-host readiness acknowledgement in this existing protocol. Actual Studio playback, cold loading, autoplay behavior and acceptable drift remain hands-on acceptance items; automated checks do not certify them.

## Recovery without data reversion

This PR does not migrate or rewrite memory, submissions, queue entries, payment records or show history. Revert the scoped code commit, or make a focused forward repair, and deploy through the normal integration. Reload host and overlay together after a code rollback. Old clients ignore optional start fields; a new host talking to an older server pauses with a missing-acknowledgement error rather than assuming a scheduled start succeeded.

Never restore an older Redis/Blob snapshot or BNL memory backup over current activity for this code repair. Existing operational queue mutations and newly recorded playback evidence remain current. The paused shared-brain repair and production capability gates are unchanged.
