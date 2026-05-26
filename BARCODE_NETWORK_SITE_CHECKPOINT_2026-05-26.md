# BARCODE Network Site Checkpoint — 2026-05-26

- **Repository:** 6-Bit-01/barcode-network-site
- **Production domain:** https://www.barcode-network.com
- **Scope:** public queue reliability, admin queue polish, sitewide live/intake behavior, submission confirmation hardening, queue test-suite health
- **Status:** Current website checkpoint after PR #111 merge
- **Current mode:** live rehearsal / reliability hardening
- **Relationship to older docs:** website-specific addendum/checkpoint, not a replacement for BNL bot source-of-truth docs

---

## Section 1 — Current high-level state

- The core queue brain from PR #68 remains protected.
- The admin queue dashboard is usable as a live control room.
- Public queue/session targeting is hardened.
- Public submissions now require confirmation in persisted queue state before final success.
- Upload and link submissions are both protected paths.
- Sitewide live/intake mode now points visitors toward the active queue/session when relevant.
- The full queue test suite is now passing after PR #111.
- The site is ready for controlled production smoke testing / live rehearsal, not broad feature expansion.

## Section 2 — Source stack relationship

- This checkpoint updates website checkpoint state after PR #102–#111.
- It does not replace PR #68 queue-engine source of truth.
- It does not replace current BNL bot source-of-truth docs.
- It supersedes older website queue/public-session notes only where those notes conflict with verified PR #102–#111 state.
- Future Codex tasks should treat this document as the latest website-specific checkpoint.

This checkpoint is built on top of:

- PR #67 payment/intake checkpoint
- PR #68 queue-brain checkpoint
- PR #69–#72 public queue UX checkpoint
- PR #100–#101 dashboard/simulation/public hardening checkpoint

## Section 3 — Protected queue rules

- Next In Line is the resolver decision slot, not a passive preview.
- Now Playing / PlayerDock is host-controlled.
- Payment must never directly replace Now Playing.
- Priority overlays Free/Wheel but does not consume Free/Wheel turns.
- Payment Processing / checkout_pending is not Priority.
- Finish consumes Free/Wheel.
- Remove / Undo Load do not consume Free/Wheel.
- Wheel Spin Owed is not Wheel Chosen.
- Wheel Chosen is only confirmed by host/admin action.
- Simulation must not create impossible show states.
- Startup / pre-show state is intentional and should not be simplified away.
- Animation must never be treated as proof of successful submission.

## Section 4 — Recent merged PR stack

### PR #102 — Public Session Identity / Submission Reliability Hardening

- stale `/queue/[sessionId]` protection
- explicit current session ID on public submit
- upload session hardening
- failed submits preserve draft fields
- accepted receipt foundation

### PR #103 — Public HUD Submit Action + Personal Track Clarity

- public fixed HUD Submit Track button
- personal track highlighting
- own-track vs other-track Priority copy
- public minimized state fixes

### PR #104 — Admin Right Rail Offset Cleanup

- fixed Next In Line rail no longer overlaps top command bar

### PR #105 — Wheel Overlay Shortcut

- Live Overlay highlights when wheel spin is actually owed/unlocked
- contextual wheel shortcut added
- reused existing overlay behavior

### PR #106 — Public Queue Entry + Receipt Clarity

- `/queue` primary CTA made obvious
- one-time-per-session entry animation
- repeat visits skip forced animation
- sticky bottom queue CTA
- submission receipt visible outside form/modal

### PR #107 — Admin Top Bar Show Data

- Active / Total in `30/42` style
- Show Phase restored
- Submissions / Runtime / Wheel Spins shown as host-critical stats
- Wheel overlay highlight only when `wheelSpinsOwed > 0`

### PR #108 — Sitewide BARCODE Radio Live/Intake Mode

- `LiveStatusProvider` reads `/api/admin/live` and `/api/queue`
- Header/banner became queue-aware
- `intake_open` vs `broadcast_live` distinction
- site points to active queue/session when relevant
- LiveBanner hidden on queue pages to avoid duplicate CTAs
- public queue session has compact Watch Live link during `broadcast_live`

### PR #109 — Public Layout Spacing + Unified Queue Gateway

- reduced top hero dead space on public pages
- unified `/queue` gateway into one stacked panel
- removed duplicate middle CTA
- fixed `/queue/[sessionId]` Broadcast Queue header flow under fixed HUD
- preserved sticky bottom queue CTA

### PR #110 — Public Submission Confirmation Hardening

- upload file retained when switching Upload → Link → Upload
- selected file summary and Remove file action
- final success/receipt waits for refreshed queue confirmation
- backend refuses `201` if track cannot be confirmed persisted
- Priority checkout does not start until track exists in queue
- draft fields and selected file preserved on failure

### PR #111 — Queue Test Suite Health / Wheel Ceremony Test Fixes

- fixed stale/nondeterministic wheel ceremony tests
- tests now use grouped wheel candidate semantics
- re-encrypt/spin remain visual-only
- stale confirm rejects without mutating queue
- no production code changed
- `npm run test:queue` passes fully

## Section 5 — Current public queue behavior

- User clicks `/queue` link.
- If active session exists, `/queue` clearly shows Open Current Queue.
- First session entry may play animation once.
- Repeat visit to same session skips forced animation.
- User can submit link or upload.
- Upload file remains retained if switching modes.
- Submit success only occurs after the track is confirmed in queue state.
- Receipt appears after confirmed acceptance.
- User’s own tracks are highlighted.
- Priority button distinguishes own track vs someone else’s track.
- Watch Live appears during `broadcast_live`.

## Section 6 — Current admin behavior

- `/admin/queue` is the control room.
- fixed/minimizable top command bar
- fixed/minimizable right Next In Line rail
- PlayerDock remains the only Now Playing/player surface
- active queue lanes stacked Priority / Wheel / Free
- tabs: Active Queue, Completed Tracks, Removed, Spotlight
- Live Overlay / Wheel shortcut highlighted only when `wheelSpinsOwed > 0`
- top bar shows Show Phase, Submissions, Active / Total, Runtime, Wheel Spins if any
- simulation creation requires submissions open
- Clear Simulation Tracks remains available as cleanup

## Section 7 — Current test/check status

- `npx tsc --noEmit` has passed in recent PRs.
- Targeted eslint passed on changed files in recent PRs.
- `npm run test:queue` now passes fully after PR #111.
- The previous two wheel ceremony failures were classified as mixed stale-test/nondeterministic setup and corrected in tests only.

## Section 8 — Production smoke test checklist

### Public `/queue`

- Open `/queue`.
- Confirm clear Open Current Queue CTA.
- Confirm sticky bottom CTA.
- Enter current session.
- Repeat visit skips animation.

### Public link submission

- Submit a normal link.
- Confirm no final success until track appears in queue.
- Refresh and confirm track remains.

### Public upload submission

- Select MP3/WAV.
- Switch Upload → Link → Upload.
- Confirm retained file summary remains.
- Submit upload.
- Confirm track appears in queue.
- Refresh and confirm track remains.

### Failure behavior

- Duplicate submission gives clear duplicate message.
- Failed submission keeps draft fields.
- Upload failure keeps draft and selected file.

### Priority

- Priority checkout only starts after queue confirms track exists.
- Payment Processing remains non-Priority until webhook/backend confirmation.

### Admin

- Top bar/right rail fixed and not overlapping.
- Active / Total looks correct.
- Show Phase visible.
- Wheel overlay shortcut appears only when `wheelSpinsOwed > 0`.
- Finish/Remove behavior still works.
- Simulation only creates tracks while submissions are open.

## Section 9 — Known remaining work / next priorities

### Immediate

- controlled production smoke test / live rehearsal
- fix production issues found during rehearsal

### Next possible site work after rehearsal

- minor UI polish only if it does not touch queue logic
- optional Stripe minimum-price guard
- optional wait prediction/duration metadata audit later
- optional PDF/project-source copy generated from this checkpoint after merge

### BNL workstream

- BNL Memory Source Safety remains the next major bot-side priority when site rehearsal is stable.
- Do not start BNL ambient/living-mind expansion before memory source safety.

### Do not start next with

- PayPal/Venmo
- broad queue brain rewrite
- full platform/accounts system
- BNL ambient expansion
- relay personality expansion
- new monetization products

## Section 10 — Guardrails for future Codex tasks

- Audit current repo first.
- Do not assume a feature is missing because it is not visible.
- Preserve PR #68 queue brain.
- Preserve PR #102–#111 reliability changes.
- Do not let animation imply success unless backend/queue state confirms it.
- Keep upload/link submit reliability protected.
- Do not mix admin dashboard, public submission, payment, and BNL bot changes in one PR.
- Any queue logic change must run `npm run test:queue`.
- Any public submission change must test link and upload.
- If a future PDF/project-source doc is generated, it should be generated from this markdown checkpoint, not separately authored.
