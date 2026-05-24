# BARCODE Network Site Current Checkpoint — 2026-05-23 Pacific / 2026-05-24 UTC

**Repository:** `6-Bit-01/barcode-network-site`  
**Checkpoint commit inspected:** `465bc5c3829c7b0844897b4d74499cfc7ec973d9`  
**Latest merged PR observed:** PR #96 — `Update wheel spin fallback audio list with latest uploads`  
**Status:** Current repo-state checkpoint. This supersedes older site queue checkpoints where PR numbering, wheel-overlay status, or next-priority guidance conflicts with this file.

---

## 1. Why this checkpoint exists

The active source docs previously stopped around the PR #72 / planned PR #73 era. GitHub now shows the site has advanced through PR #96.

Future work should not treat `PR #73 — Non-blocking Wheel Spin Animation + Personal Signal Status` as still pending. It has already been merged and later wheel/overlay/audio work has landed.

This checkpoint records the current operating picture so future chats do not keep producing one-off fixes against stale source docs.

---

## 2. Current merged site stack

Treat the current site stack as:

```text
PR #67 — Stripe/intake/payment foundation
PR #68 — queue brain / Next In Line resolver checkpoint
PR #69 — public receiver / session-state UX
PR #70 — admin Resolver Override dropdown
PR #71 — public queue movement animations
PR #72 — public microcopy / quick-submit clarity
PR #73 — wheel spin notification + Personal Signal Status
PR #74 — Submitter Outlook layout
PR #76 — queue timing engine / runtime foundation
PR #77 — duration metadata capture foundation
PR #78 — show runtime projection engine + sponsor break state
PR #79 — artist-facing timing display/admin diagnostics audit plan
PR #80 — square live overlay receiver foundation
PR #81 — commercial/sponsor break 2-hour eligibility gate
PR #82 — wheel ceremony overlay + spin control
PR #83 — wheel ceremony follow-up: labels, spin duration, re-encrypt, audio
PR #90 — wheel ceremony polish: label orientation, spin/audio sync, fadeout, reset
PR #92 — wheel overlay audio levels and label orientation polish
PR #96 — wheel spin fallback audio list updated to latest uploads
```

PRs #84–#95 include upload/delete/revert/supporting asset work around wheel audio files. They should be treated as asset maintenance unless a fresh audit shows functional implications.

---

## 3. Protected queue-brain boundary

PR #68 remains the protected queue-brain checkpoint.

Do **not** reopen or rewrite these mechanics without fresh production or simulation evidence proving a regression:

```text
- Priority overlay resolver
- Free/Wheel alternation
- Finish vs Remove semantics
- Payment Processing staying Free until paid
- Wheel removed from Next In Line restoring owed Wheel
- Pause/Unpause Priority
- Player occupied blocking
- Simulation tools
- Lane/status tags
```

The core model remains:

```text
Next In Line is the queue engine decision slot, not a passive preview.
Now Playing is admin/host controlled.
Priority may affect Next In Line after backend-confirmed payment.
Payment Processing is not Priority.
Wheel Chosen only happens after host/admin confirmation.
Finish consumes a Free/Wheel turn.
Remove does not consume a Free/Wheel turn.
```

---

## 4. Current wheel-counter correction needed

Current code still uses a public `WheelSpinsWaitingPanel` and snapshot-change activity language that says things like:

```text
10K Tap Wheel Unlocked
Host will choose a track.
Wheel Spins Waiting
Wheel spin is waiting.
```

The product correction is:

```text
The counter should simply display how many wheel spins have been unlocked.
```

Use this public-facing model:

```text
Wheel Spins Unlocked: 0
Wheel Spins Unlocked: 1
Wheel Spins Unlocked: 2
```

Do not use:

```text
Wheel Spins Waiting
Wheel Spin Owed
Host will choose a track
Wheel spin is waiting
Your song might be picked
```

Important distinction:

```text
Wheel Spins Unlocked = how many spins the audience/show has earned and not yet used.
Wheel Chosen = a specific track has been selected by the host/admin.
```

---

## 5. Recommended next implementation task

Suggested title:

```text
PR #97 — Replace Wheel Spins Waiting with Wheel Spins Unlocked counter
```

Scope:

```text
- Change the public panel/component name and copy from waiting/owed language to unlocked-counter language.
- Keep using `snapshot.session.wheelSpinsOwed` as the source of truth unless a later audit renames the backend field.
- Display `Wheel Spins Unlocked: X` or equivalent compact card copy.
- Keep pulse/visual treatment if useful, but do not explain or promise host selection.
- Keep Wheel Chosen copy reserved only for confirmed host/admin selection.
```

Guardrails:

```text
- No queue resolver changes.
- No Priority changes.
- No payment changes.
- No wheel ceremony spin math changes.
- No winner-confirmation changes.
- No admin workflow changes unless required only to align copy.
- No broad redesign.
```

Primary file likely involved:

```text
src/components/PublicQueueSession.tsx
```

Known current anchors:

```text
- `processSnapshotChanges()` currently pushes `10K Tap Wheel Unlocked` with detail `Host will choose a track.`
- JSX currently renders `<WheelSpinsWaitingPanel snapshot={snapshot} pulse={wheelUnlockPulse} />`
- Component currently named `WheelSpinsWaitingPanel`
- Component currently uses aria-label `Wheel Spins Waiting`
```

Acceptance checks:

```text
1. With 0 unlocked spins, public UI shows a simple zero-state counter.
2. With 1 unlocked spin, public UI shows `Wheel Spins Unlocked: 1` or equivalent.
3. With 2+ unlocked spins, public UI shows the correct count and pluralization if used.
4. Unlocking a spin may pulse/toast, but must not say the host will choose a track.
5. Wheel Chosen language appears only when a track actually becomes Wheel Chosen.
6. Typecheck passes.
7. Queue/payment/resolver tests are not changed unless existing tests require copy updates.
```

---

## 6. Current launch lane

The active launch lane is:

```text
1. Correct Wheel Spins Unlocked copy/counter.
2. Run a full show rehearsal with simulation and, where appropriate, production-only payment verification.
3. Turn rehearsal failures into focused fix PRs only.
4. Prepare show-day runbook for admin controls, Priority Signal, wheel spin procedure, sponsor break, and session end.
```

Do not start next with:

```text
- PayPal/Venmo
- full accounts/chat
- broad wait-prediction promises
- BNL living-mind expansion
- major queue-brain rewrites
- additional wheel spectacle before the rehearsal proves the workflow
```

---

## 7. Open PR cleanup needed

Open site PRs observed during this checkpoint should be classified before any merge:

```text
#57 — Add sponsors active site toggle
#36 — Clarify BNL-01 admin relay actions and status sources
#33 — Add admin RBAC & audit logging
#32 — Add BNL relay UI, hook and types
```

Do not merge stale PRs directly. Classify each as:

```text
obsolete
superseded
still valuable but needs rebase
fresh issue only
```

BNL bot also has an open PR:

```text
6-Bit-01/BNL01-Bot #128 — Add route ownership and loop-guard to prevent repeated replies
```

Do not merge it without a fresh BNL audit because direct-session behavior is protected.

---

## 8. BNL workstream remains paused behind memory safety

For the BNL bot, the next serious engineering priority remains:

```text
Memory Source Safety
```

Do not expand ambient/living-mind/relay personality before source-safe memory exists.

Required guardrails for future BNL memory work:

```text
- Preserve direct payload/session timing.
- Preserve #welcome.
- Preserve #episode-tracker.
- Preserve website relay API contract.
- Preserve control flags and force-pull plumbing.
- Preserve Gemini fallback/model routing.
- Block sealed_test, internal_controlled, protected_system, reference_canon, ai_image_tool, and unknown from reusable memory.
- Allow public_home/public_context only through source-aware filtering.
- Treat public_selective carefully.
- Fix /bnl_memory_check so it reports source risk honestly.
```

---

## 9. Current operating sentence

```text
The BARCODE Radio website is now in launch-stabilization mode, not random feature-expansion mode. Protect the queue brain, fix the wheel counter language, rehearse the full show workflow, then only patch real rehearsal failures.
```
