# Show repairs, package 4: duration, titles and played archive

This draft follows the commercial PR 425 source `95e5115ce1971374a61fb871761238544b526594` and contains the existing credits/video/commercial stack. It changes three related show rules in their existing owners. No deployed queue, submission, payment, BNL memory, upload, or show-log record was edited or restored.

## Evidence and behavior

Known overlong uploads were accepted by authoritative intake. `createQueueTrack` now rejects raw upload or provider measurements above 360 seconds before rounding or queue writes; the legacy `addToQueue` intake also rejects known overlong tracks. Provider metadata cannot be bypassed by supplying a shorter measurement. Exactly 360 seconds is allowed; 360.01 seconds is rejected. The public API returns 400 / `track_too_long`. Browser file reads retain fractions, ignore stale selection responses and recheck the selected file before upload. Duplicate-upload matching continues to use normalized duration after the raw limit check.

Missing, invalid, or unavailable duration is still unknown. Supported external sources do not all expose durations, and browser upload metadata is not an independent server inspection of audio bytes. The form, submission reply and host runtime label require a host check before playing an unverified track. A five-minute estimate is never evidence that a submission satisfies the rule. This PR does not add automatic media truncation, remove existing long submissions, refund payments or bypass the resolver. Both free and Priority tracks follow the six-minute rule. Queue Submission Terms version 1.1 records the updated rule for new acceptance; old acceptance records are retained.

The server and admin use `defaultBroadcastShowTitle` with the established Pacific show date: `BARCODE Radio [09-11-2026]`. The admin recalculates the date when creating a show, so an open tab crossing Pacific midnight does not submit yesterday's default. Deliberate custom titles survive. Historical archive titles are not renamed. Empty revision-zero placeholder recognition accepts the old and new default formats.

The existing archive previously shared the all-submission statistics projection with the Deck. `playedAt` is assigned at load, so it is not proof of playback. The new `playedOnly` projection includes a track once when there is a recorded play/resume event in the show log or playback diagnostics, or a recorded natural completion. A partial play later skipped/removed still receives credit. Loading, seeking, manually finishing without a play receipt, waiting, and removal before play do not establish airplay. Legacy records without playback evidence are excluded conservatively; they remain in full history for review. No historical airplay evidence is invented or backfilled.

The archive's page and refresh route request `/api/queue/stats?view=played`. Shows, roster, artist catalog, counts, milestone track labels, search and source digest all derive from the same filtered projection. Ordinary stats, Deck lifecycle counts, personal submission history, BNL chronology and durable artist memory continue to use full records. Private archive preview and its persistence readback use the same projection mode; their saved-track counts still report the complete stored records. Production gates and private-session exclusions remain in place.

## Affected owners and consumers

- `queue-types.ts`, `queue.ts`: intake rule, legal version and existing history projection; no storage migration.
- `pacific-time.ts`, `AdminShowManagement.tsx`: shared title/date helper and legacy-default recognition.
- `RadioQueueForm.tsx`, public queue API, admin runtime labels, current legal document: measurements, useful rejection, unknown-runtime rule and public copy.
- Public Archive page/component/stats API and authenticated preview page/API/readback: matched played catalogs and counts.
- `queue-playback.test.mjs`, `queue-public-stats.test.mjs`: behavioral regressions, including unchanged queue revision/history after rejection and unchanged full projection after archive reads.

## Validation

Initial existing focused checks: 158 passed. New focused queue/history run: 144 passed, including six new regressions. Required npm ci passed; full npm run check passed 1,133 tests with zero TypeScript/ESLint errors and 36 existing warnings; npm run build passed. Eight new regressions cover the reported rules. The first full run caught two provider-display compatibility regressions; those were repaired by retaining raw provider measurements separately and preserving the rounded display fields. Exact published tree is recorded in the PR/source-pack handoff. Hands-on Studio acceptance remains part of the later combined rehearsal.

## Normal post-merge deployment

Release integration update, September 16: PR 423 is in main. PRs 424, 425 and 426 were merged into their preceding feature branches, so their changes reach main through one combined follow-up PR. That candidate retains the latest PR 423 Deck counts correction and Commercial Player 1.0.26 from PR 425. Review the combined diff and require both site and Windows CI jobs to pass before merging the follow-up into main; either squash or merge commits are supported. Let the existing Vercel Production deployment finish and record Ready status plus the resulting main commit. Install Commercial Player 1.0.26 from the passing Windows job for that reviewed source. Refresh the queue/admin/archive tabs so rule version 1.1 and current scripts agree. Do not restore any older production data to deploy or undo this source change.

## Exact focused post-deploy evidence

On the reviewed source run:

```bash
node --test tests/queue-playback.test.mjs tests/queue-public-stats.test.mjs tests/track-duration.test.mjs
```

In an isolated private rehearsal session, submit measured 6:00 and 6:00.01 files: first accepted, second visibly rejected without consuming a submission slot or starting checkout. Check an unavailable-provider runtime shows unverified and obtain actual duration before manual playback. Check free and Priority use the same rule. Rejected upload retries must retain the form and recover with a shorter file.

Create a private show with the automatic title, then a custom title; record Pacific date, session IDs and titles. Confirm an older archived title is unchanged.

Use the private Broadcast Test surface with one waiting track, one loaded-only track, one removed-before-play track, one partial play, and one completed play. Record the session ID, complete saved count/show-log count, play event IDs/timestamps, archive roster and source digest. Partial and completed plays appear once; the three never-played rows and their artist-only catalog entries do not. Refresh the archive and compare its digest to the played-mode readback. The Deck and full history must retain all five records and their real outcomes. Inspect existing public archive output read-only for the same projection behavior; do not turn the rehearsal into a public broadcast to test it.

## Recovery

Revert compatible source or make a focused forward repair. Keep current records, acceptance versions, show events, submission tokens, Priority state, uploads and BNL memory. `catalogScope` and archive filtering are output-only; turning off the filter restores the older display, not older data. If correcting historical evidence is needed, review a specific record and append a provenance-backed correction in a separate task. This PR authorizes no blanket history edits or snapshot restores.
