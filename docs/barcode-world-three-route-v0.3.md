# BARCODE World: three-route theater v0.3

Status: **UNLISTED OWNER-REVIEW PLAYABLE PROTOTYPE**

Owner-review route: `/world/playtest`

v0.3 is a focused revision of the first genuinely playable BARCODE World
Battle Mode proof. It preserves the card-driven uncertainty and staged physical
battle established by v0.2, while replacing the four-front stack interface
with a card-first, three-route planning system tied to one readable theater.

The owner-review checkpoint is reconciled with the current `main` tree. Its
focused 24-test prototype contract, full 875-test repository suite, TypeScript
check, focused lint, and production build all pass against that merged state.

## Owner locks — A / A / A

The owner selected all three recommended architecture choices:

1. **Three alternatives become a developing plan.** Select one of up to three
   legal targets, add the action to a sequential plan, then derive the next
   choices from the successfully projected theater state.
2. **Four separate card pools.** Movement, Defense, Offense, and Special each
   retain their own visible availability, draw pile, discard, grants, and
   cycling. Cards are categorized; lanes are not.
3. **Card-first targeting.** Select a reusable card first. The theater and the
   three neutral routes then illuminate only its legal physical targets.

These choices control v0.3. A route is never permanently “Movement,” “Defense,”
or “Offense.” It is simply one concrete option available to the selected card
at that moment.

## v0.2 is frozen as the first playable checkpoint

The v0.2 branch, draft PR, preview, engine, documentation, and tests remain
intact. v0.3 branches from that exact checkpoint; it does not rewrite its
history.

v0.2 proved several requirements worth preserving:

- cards can direct a physical fight rather than represent an in-fiction board
  game;
- visible odds plus explicit success and failure consequences create honest
  uncertainty;
- cards do not need to be replaced merely because they were played;
- replenishment can come from scenarios, outcomes, unlocks, modifiers, Breaks,
  or mixtures of those sources;
- enemies must remain visible as bodies while their cards/intents describe what
  they will do;
- resolution must visibly run player actions, then enemy actions, and only then
  announce the round result.

v0.3 supersedes v0.2 only as the active owner-review decision and presentation
architecture. v0.2 remains the reference for the first playable milestone.

## Core grammar

The central v0.3 expression is:

> **General card + theater target + optional modifier = concrete action**

`Advance` does not become `Advance Cargo Divider` in the permanent collection.
The reusable card remains `Advance`; selecting Cargo Divider in the current
theater creates `Advance → Cargo Divider` for this plan only. The same card can
target Service Ring, Archive Bridge, or another connected position in a
different scenario.

### General cards

The initial pool deliberately uses broad verbs that remain useful across
settings:

| Category | General examples | Purpose |
|---|---|---|
| Movement | Advance, Reposition, Flank, Pursue, Retreat | Change physical position or angle |
| Defense | Guard, Brace, Evade, Protect, Parry | Survive or answer visible intent |
| Offense | Strike, Heavy Strike, Suppress, Counter, Finish | Damage or disrupt a physical enemy |
| Special | Charge, Scan, Stabilize | Prepare, inspect, or recover |

Modifier cards remain inside the applicable category pool. Quickstep modifies
Movement, Reinforce modifies Defense, Overclock modifies Offense, and Cache Tap
can modify a staged action to draw from that action's category on success.

### Context Cards

Rare Context Cards are intentionally different from general cards. They are
temporary opportunities supplied by the physical scene, not permanent level-
specific movement vocabulary.

- `Overload Relay` appears only while the projected Wayfinder occupies a relay.
- `Seal Gate` appears only at physical gate controls.
- `Vent Coolant` appears only at a coolant conduit.

Context Cards live outside the permanent category loadouts, appear in Special
while their source is reachable, disappear when that projected opportunity is
lost, and are consumed if used.

## One readable battle theater

The upper theater is a connected scenario graph rather than four repeated
boxes. Each scenario supplies:

- named physical positions and visible connections;
- cover, exits, and interactive scene objects;
- exactly one solid Wayfinder actor;
- a variable number of persistent enemy actors with health and locked intent;
- a projected Wayfinder ghost and route lines while planning;
- action animation and event text during resolution.

The same theater supports a one-on-one duel, a three-enemy gate defense, and a
two-enemy extraction without changing the core card vocabulary. A player can
read where every body is, where each movement goes, which enemy is targeted,
and what source produces a Context Card.

## Planning loop

1. Enemy intent is seeded and locked at the beginning of the planning phase.
2. The player selects any affordable visible card from one of four category
   pools.
3. The engine derives zero to three legal targets from the current projected
   theater.
4. The neutral Route A/B/C panels show target, numeric probability, success,
   failure, and any projected-position prerequisite.
5. Selecting a route spends Reserve and stages that general card. It does not
   automatically draw a replacement.
6. Successful projection updates the next target query. A successful `Advance`
   can therefore open a close-range Strike, a new movement branch, or a scene-
   sourced Context Card.
7. Up to three actions form the plan. Compatible Modifier cards attach to an
   existing step rather than consuming another action slot.
8. Undo returns the exact last card, Reserve, and projection.

Projection explains possibilities; it is not a guarantee. If an earlier move
fails, a later action that required the projected position is invalidated. Its
card and Reserve return instead of silently retargeting or inventing movement.

## Resolution contract

`ACT OUT PLAN` computes a deterministic result but buffers it from the visible
authoritative state.

1. Every Wayfinder step acts in order and reveals success, failure, or causal
   invalidation.
2. Every surviving enemy then performs its previously locked intent.
3. Only after both sides finish does the Settle event apply final Pressure,
   card grants, Break handling, objectives, retreat, or battle outcome.
4. Only then may the UI say `ROUND RESOLVED` or `BATTLE COMPLETE`.

Reduced Motion removes travel and impact movement but retains actor positions,
event order, action title, chance, roll, outcome, health, and Pressure.

## Card availability and replenishment

Each category has a visible available area, draw pile, discard, capacity, and
reshuffle count. Playing a card moves it toward discard only after resolution;
nothing fills its space on placement.

The current engine supports mixtures of:

- category-specific scenario round-start grants;
- success grants from categories actually used successfully;
- Cache Tap / future modifier-card grants;
- empty-pool fallback where a scenario explicitly enables it;
- Pressure Break grants across categories;
- explicit `Cycle · 1R`, which trades Reserve to rotate one general card and is
  not a free placement refill.

The three test scenarios intentionally use different recipes:

| Scenario | Enemies | Automatic | Outcome | Context / other |
|---|---:|---|---|---|
| Sublevel Duel | 1 | None | Used-category success | Empty-pool fallback |
| Fractured Gate | 3 | None | Used-category success | Relay/gate Context Cards, Break mixture |
| Coolant Extraction | 2 | Movement +1 at round start | Used-category success | Coolant Context Card, Break mixture |

These are test recipes, not final balance archetypes.

## Deterministic machine smoke — 2026-08-17

The v0.3 contract test runs 40 policy battles under each scenario (120 total),
with a 40-round safety cap. All 120 terminate and every category is exercised.

| Scenario | Player wins | Enemy wins | Retreats | Unfinished | Average rounds | Context uses |
|---|---:|---:|---:|---:|---:|---:|
| Sublevel Duel | 34 | 1 | 5 | 0 | 6.275 | 0 |
| Fractured Gate | 32 | 0 | 8 | 0 | 5.275 | 36 |
| Coolant Extraction | 31 | 0 | 9 | 0 | 6.025 | 31 |

This is deadlock, determinism, branching, and broad rules smoke only. The
policy is not a human player. These figures are not evidence of balance,
difficulty, comprehension, fun, animation quality, or replay value.

## Owner review path

### First read

1. Confirm the theater reads as one connected physical space with one solid
   Wayfinder and the scenario's actual enemies—not one Wayfinder per box.
2. Select `Advance`. Confirm Routes A–C name connected theater positions and
   matching lines/markers appear above.
3. Select Defense, Offense, and Special cards. Confirm those categories change
   legal choices without changing what the three lanes mean.
4. Stage a movement. Confirm the projected Wayfinder moves and the next card's
   targets derive from that projected position.
5. In Fractured Gate, reach Service Relay by projection. Confirm `Overload
   Relay` appears as a temporary Context Card; it must not appear in Sublevel
   Duel or in the permanent Special draw pile.
6. Attach a Modifier to a compatible planned step. Confirm odds/consequences
   update on that step rather than creating a scenario-specific base card.
7. Play a card and confirm no automatic replacement appears. Then trigger at
   least one success grant, round-start Movement grant, Context Card, Cache Tap,
   Cycle, and Pressure Break.
8. Resolve a three-step plan. Confirm player steps act first. Confirm enemies
   act second. Pressure, grants, `ROUND RESOLVED`, and the final review must not
   appear until Settle.
9. Force an early movement failure with a later position-dependent step.
   Confirm the later step says `INVALIDATED` and returns its card/Reserve rather
   than teleporting or retargeting.
10. Switch among the one-, two-, and three-enemy scenarios. Confirm the same
    card grammar still makes physical sense.
11. Replay Same State with the same choices and confirm exact results. New
    Shuffle must change the derived seed and category availability.

### Mobile and accessibility

1. At `390 × 844`, confirm the connected theater fits without horizontal page
   scrolling and actor labels remain attributable to bodies.
2. Complete a round with keyboard only. Card, route, theater target, plan,
   scenario, and review controls must have visible focus and useful names.
3. Confirm every actionable route exposes a percentage plus exact SUCCESS and
   FAILURE text. Red/amber/green may indicate odds only; no color means good,
   bad, or best.
4. Suppress color and verify labels, borders, actor names, health pips, route
   letters, and event order retain meaning.
5. Enable both the in-prototype Reduce Motion option and the OS preference.
   Confirm event order and all state changes remain readable.

## Automated validation

```bash
node --test tests/barcode-world-three-route.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run typecheck
npm run lint
npm run build
```

The focused suite covers reusable category pools, neutral three-choice lanes,
card-first targeting, physical target binding, Context Card visibility,
modifiers, projected prerequisites, causal invalidation, exact undo, no
placement refill, multiple grant sources, explicit cycling, deterministic
replay, player/enemy/settle ordering, variable enemy counts, simulation
termination, production isolation, and accessibility primitives.

## Hard boundary

- Solo, seeded, resettable, noncanonical, and held only in memory.
- Only the exact v0.3 preview branch may serve `/world/playtest` on Vercel
  Preview. Production and unrelated previews return a no-store 404.
- The route remains absent from public navigation and the sitemap.
- Shared BNL/live providers and public chrome remain inert on the route.
- No API, account, persistence, inventory, reward, economy, progression,
  multiplayer, moderation, queue, canon, or shared-world dependency is added.
- This checkpoint does not authorize merge, production deployment, or public
  exposure.

## Post-merge deployment and evidence (future only)

If and only if the owner later authorizes merge, deploy through the repository's
normal production pipeline. After deployment, verify and record:

1. Production `/world/playtest` still returns the intended 404 with
   `Cache-Control: private, no-store, max-age=0` and the noindex header.
2. No public navigation, sitemap, BNL, live-provider, queue, or production API
   surface references the prototype.
3. On an authorized preview, complete the first-read and mobile/accessibility
   paths above and capture evidence of: one Wayfinder; 1/2/3 enemy scenarios;
   card-first route highlighting; a Context Card appearing and disappearing;
   a failed prerequisite invalidating a later step; and the full
   player → enemy → settle timeline before `ROUND RESOLVED`.
