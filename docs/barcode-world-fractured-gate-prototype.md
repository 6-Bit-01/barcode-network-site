# BARCODE World Battle Mode: The Fractured Gate

Status: **IMPLEMENTED — PRIVATE OWNER-REVIEW PROTOTYPE**

Controlling checkpoint:
`BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_PREIMPLEMENTATION_CHECKPOINT_2026-07-26`

Route: `/world/playtest` in a local development environment only.

This is a bounded Battle Mode workstream inside the larger BARCODE World
persistent shared-world MMORPG / sandbox RPG. It is not a standalone game,
canon encounter, public preview, or connection to persistent world systems.

## Boundary

- Solo only, deterministic, resettable, noncanonical, and in memory.
- No route link in the public shell or sitemap.
- The private route suppresses the normal public navigation, relay shell, data
  stream, and footer so they cannot obscure or pollute the tactical surface;
  all other routes retain the normal site chrome.
- `noindex`, `nofollow`, `noarchive`, and `nocache` metadata.
- A production build returns `notFound()` before rendering the prototype.
- No API, account, profile, database, inventory, reward, economy, progression,
  queue, BNL, Relay, Journal, Memory, moderation, multiplayer, or shared-world
  dependency.
- Shared live and BNL status providers are inert on this exact route and expose
  fallback-only context, preventing background protected-system requests.
- No merge or deployment is part of this prototype review.

The prior Loose Signal implementation remains in the repository only as a
deterministic-mechanics reference. The Fractured Gate engine and interface do
not extend that old harness or treat it as player evidence.

## Implemented proof

The board presents Entry and West Exit, Lower Yard, Upper Walk, Gate Platform,
Cracked Divider, Gate Actuator, the three-pip Gate objective, Service Gap,
optional Field Cache, one Assault, and its confirmed Impact Rush directly in a
physical tactical location.

The interaction is:

`Select → choose → target → preview → plan → lock → watch → settle`

Board selections expose at most four contextual parents from Attack, Defend,
Discipline, Inspect, Move, Use, and Leave. Movement and targeting happen on the
board. Preview and resolution call the same deterministic simulator, so paths,
ghost positions, projected collision, consequences, risk, and the final
Fast → Standard → Slow packets share one result.

The foundation preserves 16 starting Command, +16 on later planning cycles,
the 32 cap, one free ordinary short Reposition, a four-paid-action hard cap,
two paid actions as normal and four as exceptional, fixed 12-card Prepared
decks, validated five-card openings, draw two, retain seven, and once-per-phase
Refocus for 4 Command replacing up to two cards. Compatible cards are lifted
visually while the full hand remains visible.

Invalidation is checked at action start, declared targets never silently
change, refundable primary costs return at half value during Settle, and a
triggered Contingency spends its reserve. Same seed, initial state, and
submitted plan produce the same signature, packets, and legal final state.

## Six ordered causal opportunities

| Build | Distinct player-caused opportunity |
| --- | --- |
| Battle / Exploration | Answer Impact Rush at the Cracked Divider; the collision breaches it; cross the created Opening. |
| Exploration / Battle | Prepare the Upper Walk relationship; physically contest the threatened landing; exploit the preserved Route. |
| Battle / Hacking | Answer the Rush to expose the protected Impact Regulator; suppress its real automatic reset. |
| Hacking / Battle | Establish defensive-bollard Control at the Actuator; physically hold access; execute the pinning Output. |
| Exploration / Hacking | Prepare the natural Service Gap Route; suppress the real closure mechanism; exploit the preserved relationship. |
| Hacking / Exploration | Establish lift Control; execute machinery that creates temporary geometry; cross before the lift resets at Settle. |

These are different causal interactions and state transitions, not renamed
copies or numerical normalization.

## Results

Fast Secure, Clean Secure, Recovery Secure, Gate Lost, and Controlled Retreat
are all reachable. Each Results view explains objective outcome, enemy state,
player state, Field Cache status, location consequences, principal turning
point, and meaningful tradeoff.

## Exact private owner review

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/world/playtest`.

### Primary Battle / Exploration path

1. Confirm the header says private, solo, noncanonical, and in-memory; Command
   is 16; the Gate has three filled pips; the opening hand is Fallback Guard,
   Objective Brace, Brace Through, Hold the Edge, and Safe Landing.
2. Select **YOU** on the board, choose **MOVE**, then **Reposition**. Select the
   dashed **Lower Yard Cover** target on the board. Confirm the ghost/path
   Preview and add it to the plan.
3. Select **Impact Rush**, choose **DISCIPLINE**, then
   **Answer Rush at Divider**. Select **Cracked Divider** on the board, attach
   the highlighted **Brace Through** card, inspect the projected collision and
   one important risk, then add it.
4. Select the newly projected **Projected Breach**, choose **MOVE**, then
   **Cross Created Opening**. Select **Gate Platform** on the board and add it.
5. Confirm the plan is one readable chain, contains two paid actions plus the
   free Reposition, and leaves 1 Command. Lock it.
6. Watch Fast, Standard, and Slow become visible in order. Do not infer
   skipped work from an empty lane. At Settle, open Review and verify the
   causal log and signature, then select **SETTLE**.
7. In round 2, select the Gate, choose **USE**, then **Stabilize Gate**. Target
   the Gate, optionally attach Objective Brace, add, lock, watch, and settle.
   Verify the complete **Fast Secure** Results explanation.
8. Select **RESET SAME INITIAL STATE**. Confirm the same build, seed-derived
   signature for the repeated opening plan, starting Command, Gate pips,
   positions, intent, and opening hand return.

### Six-build differentiation

Changing the ordered build resets the same encounter. Exercise these opening
proofs:

1. **Battle / Exploration:** Lower Yard Cover Reposition → Answer Rush at
   Divider + Brace Through → Cross Created Opening.
2. **Exploration / Battle:** Upper Walk Reposition → Prepare Upper Route +
   Destination Claim → Contest Threatened Landing. On a later cycle, exploit
   the preserved Upper Route.
3. **Battle / Hacking:** Lower Yard Cover Reposition → Expose Impact Regulator
   + Brace Through → Suppress Regulator Reset.
4. **Hacking / Battle:** Actuator Reposition → Control Defensive Bollard +
   Quiet Rewrite → Hold Actuator Access. On a later cycle, execute the Bollard
   Output.
5. **Exploration / Hacking:** Prepare Service Route + Destination Claim →
   Suppress Automatic Closure. On a later cycle, exploit the preserved Service
   Route.
6. **Hacking / Exploration:** Actuator Reposition → Control Service Lift +
   Quiet Rewrite. On the next cycle, execute the Lift Output, then select the
   projected Service Lift and cross it with Safe Landing. Verify the lift
   resets after Settle while the player remains at Gate Platform.

### Input and presentation checks

1. Pointer: complete the primary path using only visible board and panel
   controls.
2. Keyboard: reload, press Tab from the first control through board objects,
   context parents, targets, plan, and hand; confirm every focused control has
   a visible amber outline; activate representative controls with Enter and
   Space.
3. Touch equivalent: test at 390 × 844 CSS pixels; tap the player, Impact Rush,
   Cracked Divider target, Gate target, parent actions, cards, Lock, resolution,
   Settle, Review, and Reset without hover. Confirm controls remain at least
   44 × 44 CSS pixels and the board remains the dominant interaction surface.
4. Motion: enable **Reduce motion** and confirm path/target/collision/card
   animations stop while resolution remains readable and manually advanceable.
5. Readability: inspect desktop and narrow layouts at 100% zoom. Confirm labels
   do not depend on color alone: TARGET, CONFIRMED, COMPATIBLE, lane names,
   pips, focus outlines, text, borders, and shapes carry the state.

## Automated validation

```bash
node --test tests/barcode-world-fractured-gate.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused tests cover deterministic repeatability, all six legal and distinct
causal opportunities, Preview/resolution parity, Fast → Standard → Slow order,
Command and action limits, Refocus, exact opening hands, compatible cards,
invalidation/refunds/no-retargeting, all five Results, reset, production
gating, absence of persistence/live-system imports, non-color cues, focus
styles, touch target rules, reduced motion, and core text contrast.

These are implementation checks, not player evidence. Passing them does not
establish comprehension, balance, fun, accessibility, or replay value.

## Post-merge deployment and focused verification

This draft must not be merged or deployed as part of this work gate. If the
owner later authorizes a merge and a separate deployment:

1. Keep `/world/playtest` production-inaccessible unless another explicit
   owner decision changes the gate.
2. Verify production returns 404 for `/world/playtest`, the route is absent
   from global navigation and sitemap, and no Fractured Gate client bundle or
   metadata is publicly discoverable.
3. Run the exact private owner-review path above in the authorized development
   environment.
4. Capture implementation evidence separately from any later moderated player
   evidence; do not promote automated or owner-review observations into claims
   of comprehension, balance, fun, accessibility, or replay value.
