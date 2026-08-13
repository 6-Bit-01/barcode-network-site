# BARCODE World: Outskirts → Loose Signal greybox

Status: **HISTORICAL IMPLEMENTATION — SUPERSEDED AS THE ACTIVE PRIVATE ROUTE**

The reusable deterministic rules in this implementation remain a mechanics
reference. The player-facing `/world/playtest` target is now the bounded
four-lane card-battle prototype described in
`docs/barcode-world-card-battle-v0.1.md`. This older Loose Signal interface is
not being extended and is not player evidence for the card-battle direction.

Source revision: `BARCODE_WORLD_PLAYTEST_READY_VERTICAL_SLICE_SOURCE_PACK_2026-07-26`

This document describes the bounded first-playable browser greybox at
`/world/playtest`. The route is not linked from the public shell or sitemap,
sets no-index metadata, and returns `notFound()` in production. It has no API,
database, BNL, queue, Relay, Journal, account, economy, or persistence
dependency.

## Status language

- **OWNER-APPROVED** — printed as approved or locked in the controlling source.
- **PAPER SIMULATION FINDING** — a source expectation, not an observed result.
- **IMPLEMENTED** — represented by the deterministic engine or UI.
- **VERIFIED** — covered by an automated assertion or browser observation.
- **TEMPORARY IMPLEMENTATION ASSUMPTION** — needed to make the bounded browser
  test executable where the source does not close the rule.
- **UNRESOLVED / EXCLUDED** — deliberately not promoted into a permanent rule.

## Architecture and ownership

The website repository owns this surface. The BNL repository was inspected as
an integration boundary and is not modified or imported.

| Layer | Responsibility |
| --- | --- |
| `constants.mjs` | Six ordered builds, exact costs, fixed 12-card decks, opening order, four exact test loadouts, physical LS-01 relationships, profiles, and paper expectations |
| `engine.mjs` | Pure deterministic in-memory state transitions, planning, ownership, claims, consent, packet resolution, Settle, evidence, and reset |
| `BarcodeWorldGreybox.tsx` | Preparation, Outskirts commitment, physical map, contextual action browser, projection, personal plans, lock/resolve, causal log, Settle choices, and evidence download |
| `page.tsx` | Development-only route and production 404 boundary |
| Node tests | Mechanical, profile, concurrency, ownership, failure, and isolation evidence |

No game result crosses the engine boundary. Evidence export is a user-triggered
download of the current isolated state only.

## Implemented rules

### Preparation and profile state

- **IMPLEMENTED / VERIFIED:** six ordered Major/Minor builds in source order.
- **IMPLEMENTED / VERIFIED:** Command 16 start, +16 at nonterminal Settle, cap
  32, four personal paid-action slots, one ordinary Reposition outside that
  limit, Condition 12, and armor Guard caps.
- **IMPLEMENTED / VERIFIED:** fixed 12-card solo-safe decks, fixed opening five,
  draw two, retain seven, explicit discard, and no party-only card in a default
  solo deck.
- **IMPLEMENTED:** exact test loadouts A–D and active/reserve swap. The
  class-isolation profiles default to Loadout A as printed.
- **IMPLEMENTED / VERIFIED:** solo, mixed duo, mixed trio, duplicate-build,
  duplicate-Major, and rescue fixtures.

### Spatial expedition

- **IMPLEMENTED / VERIFIED:** Outskirts and LS-01 are one connected physical
  expedition, not a detached combat board.
- **IMPLEMENTED:** Frontier Marker, Upper Trace Rail, Entry Shelf, Shutter
  Console, Broken-Lane Lip, Natural Opening / Maintenance Plate, Far Platform,
  release socket, Relay cache, Threshold, enemies, Packages, capacities, and
  approach-specific state.
- **IMPLEMENTED:** ordinary paths, object relationships, and the special
  Opening are visually distinct. Release and cache are objects on Far Platform,
  not walkable positions.
- **IMPLEMENTED / VERIFIED:** blocked Threshold connection, capacity-one
  contention, source-bound plate crossing, shutter access, release access, and
  deterministic reinforcement entry.
- **UNRESOLVED / EXCLUDED:** the optional Hanging Panel variant is not required
  by the base class-comparison seed and is not added to this first-playable
  state. The view deliberately does not decide top-down 2D versus isometric
  2.5D.

### Planning, projection, and ownership

- **IMPLEMENTED / VERIFIED:** focus-bound Context Cards, discipline actions,
  core actions, prepared cards, and equipment are grouped under at most four
  immediate roots. Legal variants remain visible inside those roots.
- **IMPLEMENTED:** actor, target, timing, Tempo, Command, slot use,
  requirements, access, claims, invalidators, Guard, Condition, Force,
  movement, Work, Control, Route, Package, Integrity, objective, extraction,
  uncertainty, and alternatives are projected before queueing.
- **IMPLEMENTED / VERIFIED:** actions, cards, equipment, Command, Major state,
  Routes, Control, Packages, locks, and plans remain character-owned.
- **IMPLEMENTED / VERIFIED:** ally effects require recipient consent.
  Equal-time Primary claims block resolution; `If Available` and `Yielded`
  remain explicit.
- **IMPLEMENTED / VERIFIED:** Command reservations, modifier costs, separate
  Contingency reserve, invalidation-before-begin refunds, triggered reserve
  spend, overflow, and retain-limit lock blocking.

### Discipline engines and LS-01

- **IMPLEMENTED / VERIFIED:** Battle Answer creates owner-tied Battle
  Advantage and Convert spends it for Drive, Pin, or controlled disarm.
- **IMPLEMENTED / VERIFIED:** Exploration Prepare creates an owner Route with
  one Exploit and one authorized Follow passage; Exploit and Follow consume
  only their printed ownership.
- **IMPLEMENTED / VERIFIED:** Hacking Establish creates character-owned
  Temporary Control; Hold Open, Expose Cache, and Blind Repeater are bounded,
  mutually exclusive Outputs that spend it.
- **IMPLEMENTED / VERIFIED:** Battle responses inherit the Commitment packet;
  Fast, Standard, and Slow packets resolve in Tempo order with explicit
  start-legality, response, protection, damage, movement, completion, and
  state-change layers.
- **IMPLEMENTED / VERIFIED:** Skimmer A crossing pressure, Skimmer B
  marker/access selector, Skimmer C reinforcement/Razor selector, shutter
  Reseal, jam sacrifice, release Work, cache recovery, and full-entered-threat
  clear.
- **IMPLEMENTED / VERIFIED:** Maintenance Plate universal crossing, same-cycle
  Expose Cache → Recover causal dependency, source-owned Package pickup, two
  exposed Package slots, drop on Compromised, two-Settle rescue window,
  Stabilize, Standard Extract, and deterministic reset.

### Prepared cards and equipment

- **IMPLEMENTED:** exact deck order, printed form, compatibility, Command cost,
  reservation model, single-card attachment limit, commit, and discard.
- **IMPLEMENTED / VERIFIED in LS-01:** Fallback Guard, Controlled Withdrawal,
  Field Patch, Brace Through, Hold the Edge state, Safe Landing, Route
  Capacity, Backtrack Marker, Clean Buffer, Delay Stack, Emergency Disconnect,
  Trace Echo, Covering Step, Objective Brace eligibility, Last Exit,
  Recovery Mesh, Insulated Shell, Brace Frame Force resistance, Anchor Lock,
  Protected Access state, reserve swap, Needle attack, and Traversal Line
  ordinary path/clearance.
- **SOURCE-BOUND / NOT TRIGGERED IN LS-01:** Destination Claim, Broken Map,
  Chained Output, Pass the Opening, Hand Signal, and Linked Effort have no
  authored base-seed trigger, alternate destination, chainable Output, or
  party-deck substitution in this profile. They are not used as balance
  evidence.
- **UNRESOLVED / EXCLUDED FROM BALANCE EVIDENCE:** optional weapon-technique
  vector/cone choices that the base class-isolation profiles do not exercise
  are represented for inspection but are not treated as validated balance
  outcomes.

## Source conflicts and temporary assumptions

| ID | Status | Treatment |
| --- | --- | --- |
| `LS-FULL-CLEAR-VS-DUO-EXPECTED` | **SOURCE CONFLICT** | LS-01 §12 says every entered Skimmer must be neutralized before release validation. The mixed-duo paper result says all three remain active. The detailed deterministic encounter rule controls; active entered threats block validation. |
| `DISCIPLINE-TIMING-OMISSION` | **TEMPORARY IMPLEMENTATION ASSUMPTION** | The controlling pack omits standalone lane/Tempo for discipline actions while REV7 labels its table provisional. Printed REV7 values are used where present; Battle responses inherit their Commitment; LS Opening transit uses Standard / 5. |
| `LS-PROFILE-SCRIPT-OMISSION` | **SOURCE LIMIT** | The paper matrix prints final totals and state timing but not a complete lock-ready action/card/target script for every result. The UI compares observed runs to those totals; automated six-build evidence uses a declared conservative core baseline and does not masquerade as the missing canonical plan. |
| `OUTSKIRTS-COORDINATES` | **TEMPORARY PRESENTATION ASSUMPTION** | Exact Outskirts coordinates are absent. A neutral relationship diagram is used without choosing the final camera. |
| `OPTIONAL-PANEL-BASE-SEED` | **UNRESOLVED / EXCLUDED** | Hanging Panel is explicitly optional and not required in the base class-comparison seed. No Force vector or cover placement choice is invented. |

The paper mixed-duo two-cycle result and other fast LS paper results cannot
simultaneously satisfy the detailed full-entered-threat-clear rule. Those
paper totals remain visible as **PAPER SIMULATION FINDINGS**, not silently
rewritten acceptance criteria.

## Local playtest

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000/world/playtest` in a development environment.

Focused evidence path:

1. In Preparation, select a deterministic profile. Confirm build order,
   Loadout A, opening five, priorities, and the paper expectation.
2. Enter Outskirts. Inspect each approach. Verify Major-specific information,
   select one result, and confirm every continuing seat.
3. Commit the approach. Select map nodes and compare ordinary paths, the
   special Opening, object links, occupancy, enemies, objectives, Packages,
   and the closed Threshold.
4. Select a focus. Open each of the four action roots and inspect variants.
   Select a variant and verify the complete projection before adding it.
5. Build each personal plan separately. Test card attachment, a consent
   request, a Primary/If Available claim, four paid slots, and ordinary
   Reposition.
6. Lock every seat and resolve. Expand the causal log and verify packet order,
   start legality, responses, protection, damage, movement, completion, and
   state changes.
7. Settle. Verify refunds, card discard/draw, retain-seven gate, Command
   income/cap, Reseal, reinforcement, rescue clock, and release validation.
8. Complete LS-01 only after the shutter is open and every entered Skimmer is
   neutralized. Inspect Packages, infrastructure, characters, and the paper
   comparison.
9. Confirm Protect Packages is unavailable before a later physical Safe Node.
   Record Continue, Retreat, or extraction evidence.
10. Download isolated evidence JSON if desired, then Reset. Verify the selected
    profile returns to its exact starting state.

## Automated validation

```bash
node --test tests/barcode-world-engine.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused suite covers:

- all six ordered solo builds completing a deterministic conservative baseline;
- Battle, Exploration, and Hacking Major state creation and spend;
- all supported local duo/trio/duplicate/rescue fixtures entering and resolving
  deterministic concurrency;
- four-root action presentation;
- Command banking/cap, retain limit, and paid slots;
- consent and exclusive-claim conflicts;
- same-packet movement capacity;
- Fallback Guard refund/reserve accounting;
- full-clear release validation;
- same-cycle Expose Cache → Recover;
- rescue, extraction, personal Package ownership, and reset;
- production 404, no public link/sitemap entry, no persistence, and no
  BNL/queue/live-system import.

## Post-merge deployment and focused verification

This draft must not be deployed as part of the bounded implementation. If a
future owner-approved merge is followed by deployment, keep
`/world/playtest` production-inaccessible unless a separate explicit decision
changes that gate.

Post-deploy evidence:

1. Request `/world/playtest` on production and capture the 404 response.
2. Confirm the public header and sitemap contain no `/world/playtest` entry.
3. Confirm existing homepage, queue, BNL, Journal, and admin health checks are
   unchanged.
4. Run the greybox only in an approved nonproduction development environment
   and repeat the focused evidence path above.
