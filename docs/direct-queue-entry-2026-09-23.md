# Direct queue entry — September 23, 2026

Website item **13** removes the extra queue page. The owner correction preserves the original six-second digital portal at the authorized current-session entrance; see `queue-entry-portal-2026-09-23.md`. Item **3 is paused by the owner**. Radio becomes the public starting point, with actual queue status and a direct session link. This continues the authorized 13 + 3 package, but does **not** claim item 3 is complete: the September notes describe the prerecorded submission-screen buildup, not a form loop. Do not resume item 3 or request its assets while it is paused. Preserve the preparation window, music changes, chat/countdown and intro; do not substitute a form redesign or add an earlier hosting segment.

## Changed files and existing owners

| Files | Result |
|---|---|
| `src/app/queue/page.tsx` | Read the current queue once, retain production/admin/current-rehearsal access checks, sanitize ordinary public reads, and redirect directly to the encoded current session URL. Missing, ended or unavailable sessions return to Radio. Disabled anonymous access still returns before reading storage. |
| `src/app/queue/[sessionId]/page.tsx` | Empty/ended session links return to Radio instead of the removed gateway. |
| `src/components/PublicQueueGateway.tsx` | Removed the unused gateway and independent poller. Its digital portal and entry-storage key now belong to the authorized session page. |
| `src/app/radio/page.tsx`, `src/components/RadioQueueEntry.tsx` | The native-mode primary card distinguishes checking, failed read, closed, standby, open, full and live states. Open sessions lead straight to submission/queue; full or closed-intake sessions remain viewable. The schedule, TikTok, Discord, Deck/Archive feature and guide remain available. Auxchord mode retains its established CTA. |
| `src/components/LiveStatusProvider.tsx`, `src/lib/live-status-public.ts` | Reuse the existing queue read and wake event. Track its read outcome for Radio, hide stale entry links after failure, and provide an explicit retry with pending feedback. Private/unknown-purpose sessions never become public Radio links, even when an operator is signed in. No additional polling loop or API is introduced. |
| `tests/direct-queue-entry.test.mjs` | Behavioral redirect, gate, current-session, private-scope, read-failure, state and rendered-link regressions. Existing signed-token tests retain cryptographic coverage. |
| Existing gifted-attribution, playback, public-stats, timing and polling tests | Remove only assertions for the deleted gateway; retain checks on the live queue, form, host, Deck/Archive and polling budgets. |
| `README.md`, `docs/queue-production-capability.md` | Update the current entry contract. |

## Verification

- `npm ci`, `npm run check` and `npm run build` are required before handoff. Final counts and exact tested tree are recorded in the PR.
- Local Chromium checks use the actual Radio page and global provider with synthetic API responses and blocked external requests. Check loading, open, closed-intake, live/open, live/closed, capacity-full, private and no-session states; failure after success hides the old entry link, and explicit retry recovers. Capability-off performs no queue read.
- Desktop 1440×1000, 720×500 (200%-equivalent CSS viewport), 390×844 and 320×700 fit without horizontal overflow. The queue CTA remains within its card with a minimum 44-pixel touch target. No browser page errors.
- Server route tests exercise the production access resolver and rehearsal-session eligibility with fixture token verification; the existing signed-token suite covers real token validation. Direct public and scoped private redirects require exactly one current-snapshot read.
- No production session, live payment or public test is created. Local browser fixtures do not enter the application tree.

## Intentionally untouched

The submission form and receipt, checkout/return URLs, legal acceptance, uploads, Free/Wheel ordering, backend payment confirmation, displacement/restoration, Finish versus Remove, Redis/Blob persistence, queue APIs, Header/Footer/Terminal routing, BNL/Journal/memory and production settings retain their owners and behavior. No new provider, tier, overflow rule or queue mutation is included. The prerecorded submission-screen loop is paused by the owner.

## Normal post-merge deployment

After owner review and merge, the existing Vercel main-branch workflow deploys the merge. No environment changes, migrations or capability toggles are required. Record the deployed merge SHA and successful CI/Vercel result; preview success is separate from production acceptance. This draft does not merge or trigger a production release itself.

## Focused post-deploy evidence

1. Visit Radio on mobile and desktop. For the current state, capture the status card and its destination. During an existing public session, its primary CTA must link directly to `/queue/<current-id>` with no intermediary page. On first entry in that browser/session, the original digital BARCODE portal plays before revealing the queue. With no public session, it should show **Queue closed** and a status-check action, without an active queue link.
2. Open `/queue` from an existing Footer/Terminal/bookmark link. It should resolve immediately to the same current session, including when intake is closed or full; without a current session it returns to Radio’s status. Record the final URL. Existing form, receipt and checkout return pages should remain familiar.
3. Use browser request blocking for `/api/queue` on Radio, then check status/refocus. Capture **Status unavailable** with no stale entry link; unblock and choose **Check queue status** to recover. Do not treat a failed read as a confirmed closed queue.
4. Reuse an already owner-authorized private rehearsal and its signed link if available: Radio must not advertise it publicly, while authorized direct `/queue` entry retains the private session. Do not create a new rehearsal or toggle production gates for this check. Automated tests cover disabled anonymous and stale/invalid rehearsal access.
5. Record viewport, final URL, visible state and any console/request error. No purchase is needed for these entry checks; payment state must still depend on the existing backend confirmation.
