# Restore the BARCODE queue portal — September 23, 2026

The owner corrected PR 447: the extra gateway page should be removed, but the digital BARCODE portal is important and must remain when entering the current queue. **Item 3 is paused.** This correction restores that entry experience without resuming pre-show loop work.

## Changes

- `src/components/QueueEntryPortal.tsx` extracts the original ASCII/digital sequence from the pre-447 gateway: glyph streams, rotating rings, CRT scan, six text phases, BARCODE reveal, timing and colors. The queue loads behind a native modal dialog. Enter Now or Escape closes it immediately; otherwise the original six-second sequence completes. Native modal focus keeps underlying controls out of the keyboard path, and cleanup restores scrolling.
- `src/app/queue/[sessionId]/page.tsx` mounts the portal only after the existing access, public sanitization, active-session and canonical-session checks. Radio, Header/Footer, Terminal, `/queue` redirects and direct current-session URLs all arrive at this one destination. The portal adds no queue fetch, mutation, navigation timer or route.
- The existing `barcode-queue-entered:<sessionId>` marker prevents replay after completion/skip in the same browser/session. A new session gets its own intro. Blocked storage uses an in-page completion set. An interrupted/unmounted intro is not marked completed. React Strict Mode cleanup cannot consume the first entry.
- Reduced motion uses the original static final welcome and releases the dialog after two seconds. Existing Priority and Signal Hold `processing`/`cancelled` return URLs bypass the intro, preserving immediate checkout notices.
- `tests/direct-queue-entry.test.mjs` verifies that authorized open/closed/full sessions get both portal and queue, while disabled anonymous, private, archived, missing and stale-session paths retain their access/routing behavior.
- README, capability and direct-entry documentation reflect the owner correction and paused item 3.

## Validation

Required final-tree gates are `npm ci`, `npm run check` and `npm run build`. Local Chromium checks passed using the real portal and public queue components with synthetic read-only API fixtures and external requests blocked: original sequence, six-second completion, Enter Now, Escape, same/new session behavior, all four checkout-return bypasses, two-second reduced motion, keyboard isolation, scroll restoration and unmount cleanup. Desktop, mobile, narrow mobile and a 200%-equivalent CSS viewport passed; desktop/mobile captures were visually inspected. The portal's blocked-storage fallback passed in isolation; this does not certify the existing queue's separate storage handling. There were no API writes or browser page errors. The temporary fixture route was removed before the final check/build.

The owner also authorized the TikTok destination and mobile layout corrections documented in `public-show-mobile-2026-09-23.md`. No access gate, queue API, submission/receipt logic, payment/checkout owner, upload, ordering, playback, BNL or production setting changes are included. No production purchase, new rehearsal, public test or live configuration action is performed.

## Normal post-merge deployment

After owner review and merge, the existing Vercel main workflow deploys this change. No environment variables, migrations or gate changes are required. Record the deployed merge SHA and successful CI/Vercel result. A preview is not production acceptance.

## Focused post-deploy evidence

1. Use an existing active queue and a browser that has not entered that session. Enter from Radio and record the direct `/queue/<id>` URL plus the digital portal. Let the six-second sequence finish; the normal queue should be ready underneath.
2. In another fresh browser context, choose Enter Now; test Escape as well. Both must reveal the queue immediately with scrolling and keyboard controls restored. At mobile width/200% zoom, the portal fills the viewport and Enter Now stays reachable.
3. Reload the same session after finishing/skipping: the completed intro should not repeat. A different existing authorized session uses its own marker. A fresh browser context is sufficient for repeat visual checks; do not clear unrelated browser storage or create a new production session for this test.
4. Enable reduced motion: expect a static welcome and two-second dismissal. Existing checkout return URLs must still reveal their notices immediately, without a portal replay; no new purchase is needed.
5. With no active authorized session, the established Radio/empty-session behavior remains; no portal can grant access. Reuse existing private rehearsal evidence if needed, without changing gates or creating a rehearsal.

Capture the final URL, viewport, animation/skip result and any console error. Item 3 remains paused throughout these checks.
