# BARCODE Network Master Source of Truth — 2026-05-27

- **Primary repository:** `6-Bit-01/barcode-network-site`
- **Requested companion repository:** `6-Bit-01/BNL01-Bot`
- **Document scope:** cross-project planning + verified current-state reconciliation
- **Change type:** documentation only (no production code changes)
- **Supersession rule:** this document supersedes `BARCODE_NETWORK_SITE_CHECKPOINT_2026-05-26.md` **only** where later verified PRs (#113–#119) or current source state conflict with that older website checkpoint. Otherwise, the older checkpoint remains valid as historical website context.

---

## 1) Executive State — Where We Are Now

BARCODE Network is currently at a transition point between website queue/control-room hardening and broader cross-system architecture.

- Website queue/control-room first pass is built and hardened.
- Public queue and submission confirmation are hardened.
- Admin queue integrity is hardened.
- Timing, pressure, commercial gate, wheel host flow, duration confidence, and Priority Signal payment-state first passes are complete.
- BNL exists in partial connected form (Discord + website relay surfaces).
- Dossiers, accounts, full mod controls, artist dashboards, archive/station permissions pipeline, and full BNL memory source safety are not complete.
- Immediate direction: establish unified source documentation (this PR), then move into BNL Memory Source Safety as next major implementation phase.

---

## 2) Current Repositories

### A) `6-Bit-01/barcode-network-site` (verified in this workspace)

Current repository responsibilities:
- Public BARCODE site surfaces.
- Public queue entry and submission flow.
- Admin queue control room / show operations UI.
- Stripe Priority Signal flow and payment-state handling.
- Website-side BNL relay/control integration points where implemented in-site.
- Website checkpoint/source docs.

### B) `6-Bit-01/BNL01-Bot` (not available in this workspace)

Status for this checkpoint build:
- The standalone repository `6-Bit-01/BNL01-Bot` was requested but is **not present/accessible** in the current container.
- The specifically requested source file `bnl01_bot.py` is therefore **not directly verifiable here**.
- Any bot-state statements below are limited to already-established project direction and available in-repo references; unresolved bot internals remain explicitly marked for verification.

---

## 3) Website / Queue Timeline (PR #107–#119)

### PR #107 — Admin top bar show data / wheel readiness cleanup
- **Changed:** normalized top-bar show metrics (active/total, phase, runtime, wheel indicators) and wheel-readiness signaling.
- **Solved:** host visibility gaps during live operation.
- **Guardrail:** wheel-related affordances only surface when operationally owed/ready, reducing false-positive host cues.

### PR #108 — Sitewide BARCODE Radio live/intake mode
- **Changed:** sitewide live/intake state propagation and queue-aware routing/callouts.
- **Solved:** mismatch between global site state and active intake/broadcast status.
- **Guardrail:** explicit mode separation (`intake_open` vs `broadcast_live`) prevents mixed messaging.

### PR #109 — Public layout spacing / unified queue gateway
- **Changed:** reduced dead space and unified `/queue` gateway panel behavior.
- **Solved:** fragmented queue entry UX and CTA redundancy.
- **Guardrail:** single clearer queue-entry path lowers wrong-route friction.

### PR #110 — Public submission confirmation hardening
- **Changed:** durable submit-confirmation flow, upload/link reliability behavior, and persisted-state confirmation before success.
- **Solved:** false-positive “success” states and fragile mode-switch behavior.
- **Guardrail:** queue persistence confirmation is required before final success/receipt.

### PR #111 — Queue test suite health / wheel ceremony test fixes
- **Changed:** nondeterministic/stale wheel ceremony tests corrected; queue suite stabilized.
- **Solved:** flaky tests obscuring true queue integrity.
- **Guardrail:** deterministic ceremony semantics in tests protect future queue logic changes.

### PR #112 — Site checkpoint after #111
- **Changed:** website checkpoint document baseline through #111.
- **Solved:** lack of consolidated written state after hardening pass.
- **Guardrail:** documented protected queue rules and operational assumptions for future tasks.

### PR #113 — Public queue copy/button clarity
- **Changed:** copy and button clarity in public queue surfaces.
- **Solved:** user ambiguity during queue navigation/submission.
- **Guardrail:** clearer language reduces mis-submits and path confusion.

### PR #114 — Archive controls + default capacity 44
- **Changed:** archive/admin controls extended; queue/session default capacity set to 44.
- **Solved:** inconsistent operational archive handling and baseline session sizing.
- **Guardrail:** default-capacity convention supports predictable control-room planning.

### PR #115 — Admin queue integrity + PlayerDock transition hardening
- **Changed:** strengthened queue state transitions around resolver/PlayerDock handoff.
- **Solved:** edge-case state drift during host-controlled transitions.
- **Guardrail:** PlayerDock/Now Playing control boundaries and transition integrity explicitly protected.

### PR #116 — Timing / pressure / commercial break / diagnostics
- **Changed:** timing pressure instrumentation, midpoint handling, commercial due diagnostics.
- **Solved:** unclear live pressure and break-eligibility visibility.
- **Guardrail:** commercial due state requires explicit gate logic, not ad-hoc timing feel.

### PR #117 — Wheel host flow and overlay access
- **Changed:** host wheel-flow access and overlay-path reliability updates.
- **Solved:** wheel execution friction and incomplete host-access pathway.
- **Guardrail:** wheel choice confirmation remains host/admin action, not ambient overlay implication.

### PR #118 — Duration accuracy / metadata confidence
- **Changed:** duration estimation semantics tightened and confidence treatment clarified.
- **Solved:** low-confidence metadata overstating runtime certainty.
- **Guardrail:** duration confidence is explicit, preventing false precision in show planning.

### PR #119 — Priority Signal payment state hardening
- **Changed:** paid-state visibility/recovery hardening for Priority Signal lifecycle.
- **Solved:** ambiguous or fragile payment-state interpretation/recovery.
- **Guardrail:** checkout initiation and paid recovery states are separated to avoid priority misclassification.

---

## 4) Protected Queue Rules (active)

- Next In Line is the resolver decision slot.
- PlayerDock/Now Playing is host-controlled.
- Payment must never replace Now Playing directly.
- `checkout_pending` is not paid Priority.
- `paid_needs_attention` requires admin recovery.
- Priority overlays Free/Wheel but does not consume Free/Wheel turns.
- Finish consumes Free/Wheel.
- Remove and Undo Load do not consume Free/Wheel.
- Wheel Spin Owed is not Wheel Chosen.
- Wheel Chosen is only confirmed by host/admin.
- Commercial break target is 10:30 and becomes due only when midpoint and 2-hour gate are both satisfied.
- Animation is never proof of successful submission.
- Queue success requires persisted queue confirmation.
- Finished/removed tracks must not resurrect.
- Active/final track identity must stay unique.

---

## 5) BNL Current State

## Verification boundary

The standalone `6-Bit-01/BNL01-Bot` repo and `bnl01_bot.py` file are not available in this workspace, so the items below are treated as **project-intent/state targets requiring direct bot-repo verification**.

### Expected/known BNL capability areas (to verify against current bot source)
- Slash command surface.
- Guild configuration handling.
- User profile/state handling.
- Daily token usage tracking.
- Dynamic ambient message behavior.
- Active-channel batching behavior.
- Greeting cooldown behavior.
- Passive reactions.
- Website status relay.
- Website control-flag awareness.
- Channel categories/policy handling.
- Memory constants/limits.
- Persona/canon prompt handling.
- Restriction posture: BNL should observe/remember safely and should not operate destructive moderation/control tools.

### Current BNL risks (active planning risks)
- Memory/source bleed.
- Channel context confusion.
- Durable user facts vs recent context conflation.
- Lore invention risk.
- Ambient expansion before memory safety.
- Unclear separation between canon, user memory, show context, and Discord chatter.
- No complete dossier model.
- No controlled memory audit UI.

---

## 6) BNL Memory Source Safety — Next Bot Phase

This is the immediate next major BNL workstream after this source doc.

### Purpose
BNL should only remember/use information based on source type, confidence, scope, and visibility.

### Required memory categories
- Canon memory
- Project/source-doc memory
- User/member memory
- Artist/dossier memory
- Channel-scoped context
- Session/show memory
- Temporary conversation memory
- Restricted/admin memory
- BNL internal operational state

### Required source labels
- `source_doc`
- `github_source`
- `discord_message`
- `admin_note`
- `user_declared`
- `inferred_low_confidence`
- `queue_event`
- `payment_event`
- `show_event`
- `manual_mod_note`

### Required visibility levels
- `public_safe`
- `bnl_safe`
- `admin_only`
- `restricted`
- `do_not_repeat`

### Required confidence levels
- `verified`
- `likely`
- `unverified`
- `stale`
- `contradicted`

### Required rules
- BNL must not treat casual Discord chatter as permanent fact.
- BNL must not use restricted/admin notes in public replies.
- BNL must not invent canon when records are incomplete.
- BNL must distinguish recent conversation from durable memory.
- BNL must support memory check/audit before memory expansion.
- BNL must have scoped forgetting/correction before “living mind” behavior.

---

## 7) Dossiers Plan

Dossiers are structured records, not freeform notes.

### Dossier types
- Artist dossier
- Member/community dossier
- Mod/staff dossier
- BARCODE collaborator dossier
- Character/lore dossier
- Sponsor/ad dossier
- Track/song dossier
- Show/session dossier

### Required eventual dossier fields (by type as appropriate)
- Public display name
- Discord identity
- TikTok handle
- Email/contact (if provided)
- Submitted tracks
- Played/completed/removed/no-show history
- Spotlight history
- Wheel Chosen history
- Priority Signal/payment history (where appropriate)
- Station consideration status
- Permissions/release status
- Admin notes
- BNL-safe memory notes
- Restricted notes

### Visibility model
- Public artist profile fields
- Admin-only fields
- BNL-safe fields
- Restricted fields

### Guardrails
- Do not expose private admin/mod/payment data publicly.
- Do not allow BNL to freely repeat restricted dossier notes.

---

## 8) Mod Controls Plan

Split mod controls into website/admin controls and BNL controls.

### Site/admin controls
- View queue/session
- Mark present/not present
- Remove no-show
- Restore track
- Spotlight
- Add wheel spin owed
- Run wheel flow
- Resolve Paid Needs Attention
- View dossier
- Add admin note
- Flag duplicate/suspicious submission
- View/archive session
- Export session CSV

### BNL-side controls
- `/bnl_status`
- `/bnl_memory_check`
- `/bnl_dossier_check`
- `/bnl_forget` (or scoped memory correction)
- `/bnl_relay_status`
- `/bnl_force_relay`
- Pause/resume ambient
- Show channel policy
- Safe diagnostic check

### Guardrail
BNL should not be given destructive moderation powers yet. BNL observes, summarizes, relays, and remembers safely; mods run show operations.

---

## 9) Accounts / Identity Plan

Accounts are later-phase work, not immediate.

### Account types
- Artist account
- Viewer/supporter account
- Mod/admin account
- System/service account

### Artist account eventual capabilities
- Claim identity
- Connect Discord/TikTok/email
- View submission history
- Manage tracks/files
- View Priority Signal status
- Station consideration visibility
- Permissions/release forms
- Dashboard profile

### Viewer/supporter account possible future capabilities
- Subscriptions
- Perks
- Saved/followed artists
- Voting/reactions
- Community participation

### Mod/admin account capabilities
- Permission-based admin tooling
- Dossier access
- Audit logs

### Guardrail
Do not build accounts before dossier visibility rules and permission model are defined.

---

## 10) BARCODE Radio Archive / Station Plan

Planned archive/station pipeline:
- Archive each show session.
- Maintain completed/removed/spotlight lists.
- Export artist contact rows.
- Mark tracks for station consideration.
- Collect permissions/releases.
- Store approved files.
- Generate station blocks.
- Add ads/commercials/interstitials.
- Evolve toward 24/7 or scheduled BARCODE Radio station operations.

### Dependencies
- Reliable queue archive.
- Dossiers.
- Artist permissions workflow.
- File storage.
- Account identity or contact-record system.

---

## 11) Monetization Plan

### Current
- Priority Signal via Stripe.

### Future artist-side possibilities
- Paid submissions/upgrades.
- Submission bundles.
- Featured review slots (if appropriate).
- Station placement permissions/workflow.
- Mix/master/service pipeline.

### Future viewer-side possibilities
- Supporter subscriptions.
- Member perks.
- Archive access.
- Special events.
- Voting/reaction features.

### Future sponsor-side possibilities
- In-universe fake ad packages.
- Real sponsor placements.
- Episode sponsorships.
- Commercial packages.

### Guardrail
Do not add new monetization products before Priority Signal is proven and dossier/account/permissions foundations are designed.

---

## 12) Immediate Next Timeline

### Phase A — Create master source doc
- This PR (#120).

### Phase B — BNL Memory Source Safety foundation
- Next implementation workstream.
- No ambient expansion yet.
- No autonomous self-editing.
- No new personality expansion before memory source safety is in place.

### Phase C — Dossier data model / visibility rules
- Define schema.
- Define BNL-visible fields.
- Define admin-visible fields.
- Define public-visible fields.

### Phase D — Mod controls around dossiers/memory
- Admin notes.
- Memory correction.
- Safe dossier lookup.
- BNL-safe summaries.

### Phase E — Accounts / identity
- Artist/member account model.
- Authentication approach decision.
- Claim-identity flow.
- Dashboard foundation.

### Phase F — Artist dashboard / submission history
- Submission history.
- Played/removed/spotlight/wheel/priority records.
- Permissions and station-consideration surfaces.

### Phase G — Archive/station pipeline
- Session archive.
- Permission capture.
- Station playlist blocks.

### Phase H — Full rehearsal / production operations
- Public queue.
- Submissions.
- Priority Signal.
- Admin show flow.
- BNL relay.
- Wheel.
- Commercial.
- Archive/export.
- Payment recovery.

---

## 13) Do Not Do Yet

- No broad queue rewrite.
- No duplicate-submission reliability PR unless a new failure is found.
- No BNL living-mind expansion before memory safety.
- No autonomous BNL code editing.
- No account system before dossier visibility rules.
- No new payment products before Priority Signal is proven.
- No broad public UI redesign unless it supports show operation.
- No mixing website, BNL memory, payments, and accounts in one PR.

---

## 14) Source Doc Maintenance Rules

- Update this master doc after major cross-system PRs.
- Site-specific changes may update site checkpoint docs, but this master doc remains the system map.
- BNL changes must reference this doc before memory/personality expansion.
- Every new task should explicitly state which layer it belongs to.
- If a proposed PR duplicates a completed phase, stop and reassess before coding.

---

## Verification Notes for This PR

- Documentation-only change.
- Existing website source was used to reconcile PR #107–#119 timeline and current queue-state guardrails.
- Standalone `6-Bit-01/BNL01-Bot` source (`bnl01_bot.py`) was unavailable in this environment; direct bot-file assertions are deferred and explicitly labeled for follow-up verification.
