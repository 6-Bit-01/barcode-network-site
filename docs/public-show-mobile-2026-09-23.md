# Public show links and mobile layout — September 23, 2026

The owner added two requirements to the portal correction: the TikTok button should open the regular profile between broadcasts, and the public show journey must work on phones. Item 3, the prerecorded pre-show submission-screen loop, remains paused. The website's existing submission confirmation animation is a separate mobile layout fix.

## TikTok destination

`RadioTikTokLink` reuses `LiveStatusProvider` and the existing queue read. Radio, the live Deck feature on Radio, and the public queue use the same link. Offline, pre-show, private/test, ended, disabled, missing and failed-read states show **Visit TikTok** and open `https://www.tiktok.com/@six.bit`. A current public `live_broadcast` with a started broadcast shows **Watch LIVE on TikTok** and opens the configured stream URL (default `https://www.tiktok.com/@six.bit/live`). Full or closed intake does not end a running show. A schedule window alone is not proof that the broadcast is live. No TikTok polling, new API or queue mutation is added; existing global manual/scheduled status behavior is unchanged.

## Reproduced mobile defects and corrections

| Files | Correction |
|---|---|
| `src/components/PublicQueueSession.tsx` | The fixed personal status panel covered the queue heading; receiver styles were not scoped to the separately constructed portal markup. Both existing panels now share a measured, scrollable stack below the site header. Content reserves its actual height and track anchors account for it. Minimize/Expand releases space, the site menu remains above the stack, and controls use 44-pixel mobile targets. Long public names wrap. |
| `src/components/BroadcastArchive.tsx` | A long unbroken artist name expanded the entire grid beyond the phone viewport, clipping the selector, show record and roster. Names now wrap within the grid. Mobile search and selectors use 16-pixel text and reachable control heights. |
| `src/components/BroadcastDeck.tsx` | The welcome dialog was positioned against the animated page container, so its entry button could sit below the visible screen. It now mounts at the document root, with a viewport-bounded scrolling panel. Long public names wrap. |
| `src/components/Header.tsx` | The mobile navigation button has a 44-pixel target; the expanded menu scrolls within short/landscape viewports. Destinations are unchanged. |
| `src/components/RadioQueueForm.tsx` | The existing confirmation animation's stacked desktop metadata and large stage exceeded phone height. Its compact layout retains the status, artwork/packet, progress and destination card; short viewports can scroll. Form fields use 16-pixel text on phones, and buttons retain reachable touch targets. Submission, receipt, payment and timing logic are unchanged. |
| `src/app/radio/page.tsx`, `src/components/RadioBroadcastFeature.tsx`, `src/components/RadioTikTokLink.tsx`, `src/components/LiveStatusProvider.tsx`, `src/lib/live-status-public.ts` | Shared truthful profile/live destination described above. |
| `tests/direct-queue-entry.test.mjs`, `tests/global-identity-shell.test.mjs`, `tests/queue-playback.test.mjs` | Public/private/current-session and rendered TikTok destination regressions; existing navigation/TikTok source contracts updated for the client link. |

The original digital queue entry portal is preserved separately in `queue-entry-portal-2026-09-23.md`.

## Validation and limits

The required `npm ci`, `npm run check`, and `npm run build` gates passed. Browser checks passed with real components, synthetic public queue/Archive data, and blocked external requests at 320×568 and 390×844 phones, 844×390 landscape, a 720×500 viewport equivalent to 200% desktop zoom, and 1440×1000 desktop. They exercised the queue panels, menu, intake fields, Deck welcome, show/artist Archive selection, long unbroken names, submission animation and TikTok transitions. Clipping checks covered containers as well as document overflow: the original Archive bug was hidden by the outer overflow rule. No browser page errors or unexpected console errors occurred; fixture-only anonymous-auth/BNL warnings were expected.

This is local Chromium layout and behavior evidence, not physical iOS/Android acceptance. No real submission, purchase, playback, public test session, gate change or production configuration is needed. Remove temporary fixture routes and exports before the final check/build.

## Normal post-merge deployment

After owner review and merge, the existing Vercel main workflow deploys the changes. No environment changes or migrations are required. Record the deployed merge SHA and successful CI/Vercel result. A preview remains separate from production acceptance.

## Focused post-deploy evidence

1. On a phone, open Radio between broadcasts: **Visit TikTok** must open the `@six.bit` profile. During an already running real public broadcast, verify **Watch LIVE on TikTok** opens the live URL. Opening intake or a private rehearsal must not activate this button. Record the label, destination and current show state; do not start a show just to test it.
2. Enter the current authorized queue in a fresh browser context. Record the restored portal, six-second completion and Enter Now behavior. Afterward, confirm the queue heading is fully visible below the status panels, Minimize/Expand works, and the mobile menu's last link remains reachable in landscape.
3. Open intake, focus a field, scroll to its controls, and collapse it without submitting. Check that the keyboard does not make the form or close control unreachable. During the next ordinary authorized submission, observe the complete confirmation animation and receipt; no extra test submission is required.
4. Open the Deck for the first time in another browser context: its welcome and entry button must be reachable in portrait and landscape. In the Archive, select shows and artists with longer names: selectors, cards and roster must fit without a missing right half. Capture screenshots at the affected viewport plus any console error.

The queue API, access/privacy gates, backend payment confirmation, order, uploads, provider rules, persistent stores and BNL authority are unchanged. Item 3 remains paused.
