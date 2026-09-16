# Video start timer repair — 2026-09-16

## Problem and evidence

During the private operator rehearsal, C1 YouTube loaded in the host but the
overlay showed `VIDEO PLAYBACK UNAVAILABLE — HOST USING EXTERNAL SOURCE` and
`YOUTUBE PLAYER UNAVAILABLE`. The host remained on `Preparing overlay… both
players will start together.` A later overlay diagnostic showed HTTP 200 and
`connected`, a loaded YouTube API, no YouTube iframe, and no current YouTube sync.
That connection label covers the show snapshot, not successful video playback.

Both start gates saved bare `setTimeout` and `clearTimeout` references as instance
properties and invoked them as methods of the gate. Window methods require a
valid global receiver; an arbitrary gate instance fails the
[Web IDL operation receiver check](https://webidl.spec.whatwg.org/#es-operations).
The [HTML timer methods](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)
operate on that global's timer map. Node timers and the existing arrow-function
test doubles did not enforce this browser rule.

The host also entered `armed` before registering its timer. If registration
threw, its existing publication error handler no longer recognized the request
as waiting, so it neither cancelled the hold nor displayed the retry message.
The hold suppresses regular sync heartbeats. The YouTube overlay's catch handler
marks the player unavailable and removes its iframe. This explains a concrete
path to the reported symptoms; the later missing sync alone does not establish
that no sync was ever published.

## Change

- `src/lib/video-start-gate.ts`: bind scheduling and cancellation to `globalThis`
  for both gates. Mark the host armed only after timer registration succeeds,
  preserving the existing failure/retry handler.
- `tests/video-start-buffering.test.mjs`: add receiver-sensitive timer doubles
  for the default constructor path, host/overlay start and cancellation, the
  production receiver callbacks for both providers, and host scheduling failure
  followed by retry for both providers.
- This document records the evidence, scope, validation, and deployment check.

Five new regressions failed against the original helper, including the exact
YouTube fallback and the stuck host hold; all five pass with the repair. The
focused suite passes all 18 tests. These are Node tests that model the Window
receiver contract, not a real-browser end-to-end playback result. The managed
browser rejected navigation to the local test page under its URL security
policy, so no browser runtime reproduction is claimed.

Local validation on Node 24.19.0:

- `npm ci`: passed.
- `npm run check`: TypeScript, ESLint, and all 1,143 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

The repository's CI uses Node 22; its result is reported on the pull request.

## Scope and deployment check

The three-second server deadline, stable player identity, overlay mute behavior,
provider URLs, queue rules, privacy gates, payments, stored show state, and BNL
memory are unchanged. This repair does not require an environment change,
database migration, VPS restart, or Windows helper update.

After the site deployment, refresh the host page and each open permanent overlay
source so all players load the updated helper. Keep the private rehearsal and
the existing C1 track; do not Finish, Remove, reset the queue, or restore a
database/snapshot for this repair. Retry C1 Play and confirm that preparation
ends after approximately three seconds, the host and overlay both show video,
and the overlay remains muted. Then resume the existing pause/resume, seek,
cancelled-start, and TikTok acceptance checks. Earlier passed rehearsal checks
remain passed; video acceptance stays pending until the operator retest.
