# Show repair 1B — broadcast credits and submission counts

Owner: **6 Bit**. This is the second PR in the locked six-PR repair target.

## Problem and resulting behavior

The public queue, Deck and host controls display submitted artist/song labels, while the Wheel, media overlay and some BNL views previously preferred detected labels. Upload detection can be a filename split, and a provider author can be an uploader rather than the creator. This made the same queued track appear under different names. The shared overlay credit resolver now follows the explicit submission, with existing legacy label fallbacks; it never replaces that credit with filename/provider metadata. Provider metadata remains separately available for comparison, and the existing durable artist catalog keeps its provider-identity/provenance contract.

Personal queue counts previously depended on the most recent ten completed tracks and could omit an earlier completed submission. The public submitter response now adds optional full-session `lifecycleCounts` using the existing history outcome/count projection. Counts cover only directly visible submissions, while the existing connected-identity allowance remains cumulative. Removal does not refund one of the three submission slots. The personal bar distinguishes waiting, finished, skipped and removed, and an inactive removed Priority entry cannot appear to hold an active Priority position. Deck personal counts distinguish this show's lifecycle from submissions across shows.

BNL's existing `wheelEligibleArtists` remains a summary by submitted artist label. Its basis is explicit, and `wheel.eligibleEntrants` uses the actual Wheel grouping function on readable eligible tracks. Several artist labels can belong to one submitter entry without merging their creator/catalog identities.

## Impact and compatibility

| Files | Responsibility |
| --- | --- |
| `src/lib/live-overlay-resolver.ts`, `src/lib/live-overlay.ts` | One broadcast-credit resolver for Wheel and media/foreground scenes. |
| `src/lib/queue.ts`, `src/lib/queue-types.ts` | Additive, directly scoped lifecycle-count projection; no stored entry/schema migration. |
| `src/components/PublicQueueSession.tsx`, `src/components/BroadcastDeck.tsx`, `src/components/AdminRadioQueueControl.tsx` | Accurate lifecycle labels and separate source-metadata copy. |
| `src/app/api/bnl/read-model/route.ts` | Submitted broadcast credits, provenance policy, artist-summary basis and actual entrant list. |
| `tests/queue-credits-counts.test.mjs`, `tests/bnl-read-model.test.mjs`, `tests/signal-hold-contract.test.mjs` | Credits, storage preservation, counts beyond ten recent completions, removal/restoration, linked-identity privacy and entrant/artist distinction. |

**Coordinated consumer follow-up:** `BNL01-Bot/bnl01_bot.py:_track_label` still prefers detected labels in its older generic formatter. The planned bot repair PR must prefer submitted broadcast labels there and test a conflicting provider uploader. This site PR alone does not claim all BNL-generated text is repaired. Keep the companion change in the final batch's dependency and acceptance records; do not change durable artist-memory records to make labels identical.

Q03 remains unresolved: the September 11 WittyF0x interruption requires the focused private show-log evidence. Existing Priority interruption/restoration regressions remain the generic contract, not proof of that incident's cause.

## Verification

Run the focused command below plus `npm ci`, `npm run check`, and `npm run build`. Final local results: `npm ci` passed; `npm run check` passed all 1,106 tests with zero TypeScript/ESLint errors (36 existing ESLint warnings); `npm run build` passed. The focused credit/Wheel/read-model run passed 65 tests, and the Priority UI behavior run passed five. Exact tested source/tree are recorded in the draft PR and source pack. All fixtures use isolated in-memory stores; they do not use live submissions or provider requests.

```bash
node --test tests/queue-credits-counts.test.mjs tests/wheel-integrity.test.mjs tests/live-overlay-resolver.test.mjs tests/bnl-read-model.test.mjs tests/queue-public-stats.test.mjs tests/queue-playback.test.mjs
```

## Normal post-merge deployment and combined acceptance

Keep this in review while preparing the agreed batch. When reviewed for production, merge through the normal PR workflow, allow the existing Vercel integration to deploy `main`, and verify the deployment is Ready and serves the merged commit. This site change needs no new environment setting or VPS restart. The coordinated bot formatter change has its own normal bot deployment step. A successful build is not Studio acceptance.

At the planned combined private rehearsal, record the site commit/deployment, bot commit, session ID, track IDs and observation times. Compare one upload with a deliberately conflicting filename and one linked track with conflicting provider metadata across host queue, Wheel, overlay, public queue/Deck and BNL. Verify stored submitted and provider fields remain intact. Submit three controlled tracks, remove one, finish one and leave one active; inspect the lifecycle counts and unchanged three-slot allowance. Confirm an earlier completed submission is still counted after more than ten later completions. Use automated fixtures for that volume if practical. Confirm a two-artist, one-submitter Wheel fixture appears as one entrant with both correct track credits. Private tests stay out of the public archive and public BNL evidence.

## Recovery boundary

6 Bit explicitly requires preservation of memory, queue state, submissions and history. This PR has no migration, backfill, reset or deletion. Rollback restores compatible code only; it must not restore an old database or queue snapshot over current activity. The additive response fields can be ignored by an older client, and the new UI tolerates an older response. A code revert restores the old display/count defects but does not undo an actual removal, submission or payment. Keep evidence of the current state and prefer a focused forward repair if reverting would worsen behavior.
