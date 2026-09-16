# Radio / Archive external-track count correction — September 16, 2026

The September 11 public show retains 50 submissions: 41 explicit Finish outcomes and nine removals. The `playedOnly` Archive filter introduced with the show-repair stack retained only 21 tracks with automatic playback evidence (18 uploads and three YouTube entries). Twenty host-finished external sources (11 Spotify and nine other links) were absent from the roster and artist catalog. PR 432 reused this filtered catalog, displaying 21 tracks and 11 artist credits. The source records were not lost.

## Behavior

- Keep automatic play/resume or natural-end evidence as `broadcastEvidence: playback_recorded`.
- Retain explicit Finish outcomes for the existing external playback provider as `external_host_finished`. These are host-recorded show entries, not invented play receipts or proof of natural completion.
- Continue excluding unplayed waiting, loaded-only, removed, skipped and unknown records. Upload/YouTube/TikTok Finish without playback evidence stays excluded, including the silent A1 rehearsal case. A partial play followed by removal still appears once.
- Use one projection for the Archive roster, artist catalog, links and Radio summary. September 11 reconciles to **41 show tracks / 25 distinct submitted artist-project credits / 14 Wheel spins / 4h 48m**. The additional 20 external tracks are explicitly identified as host-finished.
- Radio feature response is `radio_show_feature_v2` with `tracksInShow`, `artistCredits` and `hostFinishedExternalTracks`; the client and tests update together. Public labels are Show tracks and Artist credits. Archive Finish labels no longer imply full playback.
- Private rehearsals and simulations remain excluded from public views. An authenticated private preview retains its existing scope. Existing production gating, live-to-Archive routing, cache and polling intervals are unchanged.

## Changed owners

`queue.ts` and `queue-types.ts` classify read-only evidence using the existing playback-provider mapping. `radio-show-feature.ts` and `RadioBroadcastFeature.tsx` plus its CSS display the same roster accurately. `BroadcastArchive.tsx` distinguishes host Finish from playback claims. `queue-public-stats.test.mjs` adds provider-boundary and mixed-show regressions. The production capability contract and earlier repair handoff identify this correction.

## Validation

- `npm ci` passed.
- Focused public-history tests: 15 passed.
- `npm run check`: TypeScript and ESLint passed (existing warnings), all 1,154 tests passed.
- `npm run build` passed.
- Regression fixture: 50 submissions, 21 observed-playback tracks, 20 external Finish records, nine unplayed removals, 25 submitted artist-project credits, 14 Wheel spins and a 288-minute duration. Verifies full history/source unchanged, public links and artist catalog restored, no synthetic play events, native silent Finish excluded, private-session isolation and simulation boundary.
- The September 11 public full and filtered histories were each read once for reconciliation. No production data was written. CI and preview results are recorded in the PR.

## Deploy / recovery

Merge through the normal reviewed PR after CI succeeds and let Vercel Production become Ready. Refresh `/radio` and follow Explore the latest show; verify 41 show tracks / 25 artist credits for September 11, and that previously omitted Spotify/external entries appear with Host marked finished. Nine unplayed removals must remain absent. A client left open on the old feature schema may show the unavailable state until refreshed; the existing CDN response cache is bounded to 30 seconds plus 30 seconds stale-while-revalidate.

No queue records, outcomes, timestamps, show logs, payments, Wheel ordering, player transport, BNL persistence, upload retention or external provider integration were changed. No migration, replay, data restore or increased polling is needed. Reverting the source restores the prior display filter only.
