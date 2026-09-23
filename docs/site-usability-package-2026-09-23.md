# Website usability package — September 23, 2026

This draft groups original website items **2, 4, 5 and 6**: action feedback, the mobile Broadcast Archive selector, Host dashboard zoom, and gifted-skip attribution. Queue gateway removal and the submission-screen loop remain the following package (items **13 and 3**).

## Existing owners and behavior

| Files | Change |
|---|---|
| `src/lib/client-action.ts`, `src/components/useClientAction.ts` | Synchronous, in-page duplicate-click lock with pending/result feedback and elapsed time. A request lasting at least 1.5 seconds logs `barcode_slow_action` with a fixed action name, duration and outcome; no names, keys, URLs, payment data or request bodies. No mutation retry, timeout or new queue owner. |
| `src/components/AdminRadioQueueControl.tsx` | Locks queue actions by track or session and the complete player/end-session/settings operation. Shows pending/result feedback in the live toolbar, disables affected controls, and reports clipboard failures. Measures actual toolbar/player height, constrains each panel to a scrollable portion of the viewport, places the mobile Next In Line rail before lanes, and releases space when minimized. Hidden player controls are inert. |
| `src/components/PublicQueueSession.tsx`, `src/components/RadioQueueForm.tsx` | Locks checkout before its first await, releases pending state on failed/aborted requests, keeps checkout errors in the dialog, removes the 1.2-second delay before resuming Priority checkout, and prevents a second final submission during an active submit. Existing ownership tokens, terms, payment requests and server confirmation stay authoritative. |
| `src/components/BroadcastArchive.tsx` | Mobile show picker and sorting precede the selected show. URL selection and Back/Forward remain authoritative, including a selected show outside search results. Refresh gives pending/result feedback, retains the last good state on failure, and distinguishes Ballad refresh failure from successfully refreshed show history. |
| `src/components/AdminRadioQueueControl.tsx`, `src/lib/foreground-overlay-resolver.ts` | Larger confirmed gift banners and a current-session confirmed-gift list that survives track completion/removal. Pending gifts explicitly say payment pending and skip inactive. Confirmed current-track gifts remain in the normal foreground action rotation; the separate purchase popup still expires after exactly three seconds. Wheel, sponsor and system scenes keep their existing override behavior. |
| `tests/client-action.test.mjs`, `tests/foreground-overlay-functional.test.mjs`, `tests/queue-playback.test.mjs` | Duplicate/failure/retry/timing regressions; current-gift lifetime and privacy cases; retire obsolete fixed-offset assertions while retaining track-card checks. |

## Scope boundaries

No API, schema, Stripe/webhook, resolver ordering, Redis, production gate, navigation, BNL, memory, Journal or publishing authority changes. No gateway redesign, paid overflow, song replacement, casting or broader submission-loop redesign. Gift credit uses the existing confirmed public-name helper; payment identity never supplies a display name. No new persisted gift feed is introduced.

## Verification

- `npm ci` completed without dependency changes.
- `npm run build` passes; the temporary test route is absent from the production route list.
- `npm run check`: type checking, lint and **1,233 tests** pass on local Node 24.19.0. Repository CI remains the Node 22 gate.
- Local browser checks use real components and synthetic API responses; all external requests are blocked. Temporary fixture routes are removed before the final build/tree.
- Host viewports: 1440×900, 720×450 (equivalent CSS viewport for a 1440×900 window at 200% zoom), 390×844 and 768×500. No horizontal document overflow or toolbar/player overlap; Finish remains reachable by scrolling its panel. Minimizing the player releases space.
- Delayed Host duplicate clicks send one request, show immediate pending state and confirmed completion; server errors remain visible and controls unlock. Confirmed gifts remain after Finish.
- Archive: mobile picker above details, direct older-show selection, Back/Forward, selection outside a search and no-match search.
- Priority and Signal Hold: intercepted network aborts preserve one request per duplicate click, immediate loading, visible failure, and restored retry/cancel controls.

These are local implementation receipts, not a claim of production or natural-show acceptance.

## Normal post-merge deployment and focused evidence

After owner review and merge, use the existing Vercel deployment workflow. No environment variables, migrations or gate changes are required. Record the deployed commit and successful build/CI result. This draft does not merge or deploy itself.

1. Open the public Archive at mobile width and 200% browser zoom. Select an older show, use Back/Forward, search for a different show, and refresh. Capture the picker above the selected record and any partial Ballad-refresh warning.
2. In an owner-authorized private test session, open Host at 100% and 200% zoom with long track/gift names and a loaded player. Expand/minimize panels, reach Next In Line and Finish/Remove, and capture viewport sizes with no control overlap.
3. Throttle one harmless test-session action and double-click once. Record one POST, immediate pending feedback, confirmed success (or a clear failure), restored controls, and the content-free slow-action timing. Do not retry an ambiguous mutation until the refreshed queue confirms its state.
4. With an owner-authorized test checkout or intercepted browser response, verify Priority and Signal Hold errors release pending state and retain checkout ownership. A checkout URL or pending status must never activate Priority/protection; only the existing verified payment owner does so.
5. Verify pending gift wording, a confirmed gift on its card/player/current-session list, persistence after Finish, and ordinary foreground rotation while that track is current. The purchase popup must end after three seconds; no pending/refunded/test gift appears publicly, and Wheel/sponsor/system scenes resume normally.

Use existing private evidence where available. This handoff does not authorize new production purchases, rehearsal, public tests, publication or gate activation.
