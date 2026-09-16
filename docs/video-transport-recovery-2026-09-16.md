# Video transport recovery after the show-repair rehearsal

## Evidence and scope

The owner reports C1 (`PWYFa2OCWj0`) plays in Command Deck while the combined
overlay shows the generic unavailable fallback, even after timer repair #428.
This is a **scoped recovery**, not a claim that the remaining exception has been
reproduced or that live playback has passed.

The comparison covers these actual repository versions:

- `21710ef` / #342: August 20 working checkpoint identified in the earlier review.
- `89e79e3` / #419: owner-confirmed playback after the Studio source cutover;
  preserves the same loaded track's iframe through heartbeat gaps.
- `03c482c5829e518e6ffd02891ae060ee36b09b4d` / #420: subsequent timing restoration.
- `4c664aaf74441b2bda83372055185e1d83b6c141` / #427: integrated video #424 and
  other show repairs.
- `97e9f0bc526e7dd770ef52dfdcd859c9f2cb7113` / #428: timer binding repair, merged
  and deployed, with the overlay failure still reported.

The provider mount, API loader, iframe options, nine-second readiness watchdog,
and same-video failure latch were already present in the earlier working code.
The video repair introduced host paused pre-publication, acknowledgement-driven
three-second starts, receiver preparation/cue/seek/pause commands, and buffering
handling. The generic fallback discards the distinction between startup timeout,
construction exceptions, command exceptions, and provider rejection. A successful
snapshot request therefore cannot establish working provider playback.

## Recovery behavior

Restore the two host provider components and two receiver transport paths from
#420. Keep #419's stable iframe retention and #420's provider timing thresholds.
Remove the client start gates and their tests; replace scheduled-start acceptance
assertions with actual recovered host, receiver, and provider-lifecycle callback
tests. The three-second preparation and associated buffering changes are deferred
until separately reproduced and accepted. Existing server support for optional
start fields stays compatible with already open clients; no storage is rewritten.

For YouTube, retain bounded local failure phases (`api_load`, `player_create`,
`ready_timeout`, `sync_command`, `provider_error`) and provider error codes in DOM
diagnostics, with a specific fallback label. Do not claim an external host source
was selected when the code only observed a player failure. No raw exceptions,
tokens, URLs, or remote telemetry are added.

The footer previously formatted `scene.updatedAt`, explaining the reported
10:39 PM while the actual local time was 12:17. A small isolated clock now uses
the browser's current local time and updates once per second. It adds no API or
Redis requests and cannot recreate the video player on each tick.

## Boundaries

Queue and Wheel repairs, credits/counts, commercial handling, private rehearsal
visibility, archives, BNL, service deployment, data, and backups are unchanged.
No polling interval or Redis read/write path is added. Keep C1 loaded; do not
finish, remove, reset, archive, or recreate the rehearsal for this recovery.

## Validation and remaining acceptance

`tests/video-transport-recovery.test.mjs` exercises the actual production host
state callback and the receiver initialization/readiness/sync/cleanup callbacks
using in-memory provider events. It also verifies distinct failure phases and
the network-free clock. Existing storage tests retain the one-write sync contract
and backward compatibility. These tests do not run the remote YouTube decoder or
certify TikTok Studio behavior.

Validation completed: `npm ci` passed; `npm run check` passed type checking,
lint (zero errors, 36 existing warnings), and all **1,130 tests**;
`npm run build` and `git diff --check` passed. No live Redis calls were used
for the historical comparison or these in-memory callback checks.

After merge and deployment, reopen one host and one combined overlay with fresh
code and resume the existing C1 once. Confirm visible muted overlay video follows
the host, then pause both and close clients when finished to avoid idle polling.
If it fails, the new fallback distinguishes the failure stage directly; retain
that stage and code instead of repeating uninformative Redis fetches. Continue
Short/TikTok and the remaining rehearsal only after C1 passes. This recovery
does not erase any previous passed queue tests.
