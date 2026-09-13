# Show repair slice 1A — Wheel integrity

This slice implements W01–W04 from [the locked plan](show-repair-plan-2026-09-13.md). Implementation and local testing do not establish merge or deployment. Consult the associated draft PR for the tested commit, current checks and review status.

## Behavior

- The receiver derives a forward target from its current angle, with four complete clockwise turns plus the landing remainder. A stored per-spin trajectory prevents an effect restart from adding another spin. A receiver that mounts after the result displays the selected landing immediately.
- Newly selected Wheel tracks receive a persisted, increasing `wheelQueueOrderAt`. Waiting winners follow selection order even when submission order differs or the clock repeats/moves backwards. Existing winners without that field retain their previous relative order ahead of newly selected winners. Displacement and active Priority keep their existing precedence; the field does not alter Free ordering or Signal Hold movement back to Free.
- Winner Not Here removes exactly the earliest eligible track represented by the current winning entrant. Queue-lock validation rejects stale eligibility/session state. A private per-spin receipt prevents concurrent or delayed duplicate requests from removing siblings, including across worker reloads. The ordinary Remove lifecycle still records the removal, and the spin remains owed.
- Wheel grouping resolves the transitive closure of the existing identity keys before producing entrants. Each connected entrant appears once, with its tracks in queue order. Private keys are not included in candidate output. Random winner selection has no new recent-winner exclusion or weighting.

## Affected files and consumers

| File | Role |
| --- | --- |
| `src/lib/live-overlay.ts` | Existing Wheel candidate owner and absent-winner action |
| `src/lib/live-overlay-resolver.ts` | Clockwise target geometry; existing segment selection contract retained |
| `src/components/LiveOverlayReceiver.tsx` | Combined Studio source animation and pending-result rendering |
| `src/components/AdminLiveOverlayControl.tsx` | Operator feedback accurately describes one-track removal |
| `src/lib/queue.ts` | Existing serialized queue authority, sorting, normalization and guarded Remove |
| `src/lib/queue-types.ts` | Two optional private persisted fields for ordering and rejection receipts |
| `tests/wheel-integrity.test.mjs` | Behavior and actual receiver-effect regressions |
| `tests/queue-redis-mutation.test.mjs` | Fresh-worker and durable recovery coverage |
| `docs/show-repair-plan-2026-09-13.md` | Locked five-package scope and acceptance criteria |
| `docs/show-repair-wheel-1a-2026-09-13.md` | This implementation and deployment handoff |

The queue's existing state producer supplies order to admin, public, Deck and BNL consumers. No consumer now sorts those waiting tracks independently by submission age as part of this change. Public-track conversion remains an explicit allowlist; new private fields do not enter it. Existing snapshot serialization preserves both fields. Queue lifecycle, privacy and read-model regressions run in the full check.

## Verification

Required local gates:

```bash
npm ci
npm run check
npm run build
```

Focused regression command, usable on the reviewed/merged checkout:

```bash
node --test tests/wheel-integrity.test.mjs tests/queue-redis-mutation.test.mjs tests/queue-playback.test.mjs tests/live-overlay-resolver.test.mjs tests/wheel-overlay-session-lifecycle.test.mjs
```

Regressions cover successive/repeated landings, actual receiver effect restart and result remount, identity bridges, absent winner with three tracks, Signal Hold order, stale/duplicate removal, backwards/equal clocks, legacy entries, Priority displacement and Free alternation. Fresh independent workers and a simulated Redis quota failure confirm ordering and rejection receipts survive the private durable snapshot.

## Normal post-merge deployment

1. Review and merge the scoped PR into `main` after required CI passes.
2. Let the existing Vercel integration deploy that commit. Confirm the production deployment is **Ready** and its source commit matches the merge.
3. Refresh the permanent Studio Wheel/combined source once between shows so it loads the new receiver bundle. Keep the existing source URL and current environment settings.
4. Run the rehearsal below outside a live show and retain the evidence. No bot/VPS deployment is involved in this slice.

## Focused post-deploy rehearsal and evidence

Use an admin rehearsal session and its authorized Studio source; keep test tracks outside public broadcast/archive history. Record the merged commit, Vercel deployment URL, session ID, timestamps, track IDs and a short Studio recording.

1. Create three tracks for one fixture entrant. Launch an owed spin, let the result settle, then use **Winner Not Here**. Exactly one track—the first eligible one in current queue order—must enter Removed. Both siblings must remain eligible, the owed-spin count must be unchanged, and a rapid second click must not remove a sibling. Save the queue/removed counts and track IDs.
2. Create a track early and another later, hold Next with a manually assigned fixture Priority track, then mark the later submission Wheel Chosen before the earlier submission. Record that the waiting Wheel list follows the two win actions. Finish Priority and confirm the first winner is Next; a completed Wheel turn must still yield the owed Free turn before the second winner.
3. Repeat spins without refreshing/remounting the receiver. Record at least three consecutive spins, including a repeated eligible winner if one occurs naturally. Each full visible spin must turn clockwise by at least a complete revolution and end on the announced segment. Refresh while a result is pending and confirm the same landing is displayed. Do not change random selection to force a production winner.
4. Inspect the private queue state after a browser/worker reload: waiting win order must be retained. Check the public projection for absence of fixture/private data and of `wheelQueueOrderAt`/`wheelRejectedSpinKey`. The automated identity-bridge fixture verifies connected entrants without inventing real member identities during rehearsal.
5. End/archive the rehearsal. Preserve its private evidence and confirm it remains outside the public Broadcast Archive.

Real Studio animation remains an operator acceptance check. This slice makes no claim that video buffering/sync, the unresolved WittyF0x incident, inactive commercial playback, or cross-surface credit/count issues are fixed.

## Next checkpoint

Package 1B: Q01 credits and Q02 active/played/removed counts. Q03 still requires the narrow September 11 admin show-log evidence. Then continue packages 2–5 in the locked order. Do not reopen shared-brain repair or alter production gates through this slice.
