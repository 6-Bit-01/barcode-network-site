# BARCODE World: three-route theater v0.3

Status: **UNLISTED OWNER-REVIEW PLAYABLE PROTOTYPE**

Owner-review route: `/world/playtest`

v0.3 is a focused revision of the first genuinely playable BARCODE World
Battle Mode proof. It preserves the card-driven uncertainty and staged physical
battle established by v0.2, while replacing the four-front stack interface
with a card-first, three-route planning system tied to one readable theater.

The owner-review checkpoint is reconciled with the current `main` tree. Its
focused 39-test prototype contract, full 890-test repository suite, TypeScript
check, lint with zero errors (39 unrelated existing warnings), and production
build all pass against this checkpoint.

## Health restoration and comprehension correction

Player Condition/Health was part of the established BARCODE World combat
contract before this prototype. It was accidentally omitted when v0.3 was
derived from the stripped card-battle experiment. That omission was a
regression, not an owner-approved design decision. v0.3 now restores the
survival layer explicitly:

- the Wayfinder starts at **12 Health** (`Condition` in the underlying rules);
- Guard absorbs incoming Impact before Health and unused Guard persists between
  rounds;
- reaching 0 Health makes the Wayfinder **Compromised** and ends this simplified
  solo prototype encounter;
- Battle Control remains a separate `-5…+5` tactical track. `+5` wins the
  Sublevel Duel, but is only an advantage in Fractured Gate and Coolant
  Extraction; the meter states the current scenario rule explicitly;
- disruption can change Control without pretending to damage Health;
- `Stabilize` restores 2 Health, clears exposure, and grants 1 Guard, capped at
  the 12-Health maximum;
- low Health is visually urgent but does not secretly change accuracy or
  Command Points.

The theater now keeps one compact Wayfinder status strip above the physical
map. It names the single controlled actor as `YOU · WAYFINDER` and shows
numeric Health, Guard, Power, and position. Every enemy keeps numeric Health,
a Health bar, and its locked intent directly on its theater actor. The removed
duplicate enemy HUD list no longer repeats the same information above the map.

The friend playtest also exposed two other comprehension problems. The visible
round labels are now `BUILD YOUR PLAN → YOUR ACTIONS → ENEMY RESPONSE → ROUND
RESULT`, and the first turn says directly that the player controls one
Wayfinder. Route A/B/C focus now brightens the exact matching theater target;
there are still no permanent straight attack rays.

## Challenge and mission comprehension correction

The first friend/owner playthroughs exposed accidental success rather than a
mere tuning problem. Retreat, complete Control, an environmental payoff, enemy
elimination, and the actual mission objective could all feel like equivalent
ways to make the encounter stop. They are now separate declared outcomes:

- every scenario displays compact `WIN`, `LOSE`, `EXIT`, and `TACTICAL` rules
  above the theater;
- Fractured Gate wins only by sealing the Gate or defeating every hostile;
- Retreat from Fractured Gate is **Withdrawal · Mission Incomplete**, with a
  neutral survivor result rather than a victory;
- reaching the South Lift is an extraction victory only because Coolant
  Extraction explicitly defines that exit as its objective;
- complete `+5` Control wins only where the scenario contract says it does;
- Fractured Gate has a visible 12-round breach deadline, preventing indefinite
  defensive drift;
- Overload Relay is a tactical opening, not an instant mission result. It
  damages and suppresses nearby hostiles, consumes the relay prime, and leaves
  the mission running;
- the Gate Controls are visibly `CONTESTED` while an unsuppressed hostile holds
  their position. `Seal Gate` has no legal route until that position is
  secured;
- scene preparation is a one-round commitment: use general `Scan` or `Charge`
  to mark a relay/coolant object `PRIMED`, protect it against the locked Jam,
  survive the enemy response, then use the temporary Context Card next round;
- the Breacher Runner now rushes and deals arrival Impact, the Ward visibly
  holds/guards the Gate before switching to Lockdown Shot, and the Stalker
  physically hunts or cuts off the Wayfinder before it can Jam nearby scene
  preparation. Those labels are mechanics, not flavor-only text.

Every exit and objective preview also says that the enemy response still
happens before the round settles. A successful card therefore promises its
immediate effect, not an early victory banner.

## Progressive disclosure and density correction

The prototype preserves every card pool and combat rule while showing only the
control layer needed for the current decision:

- Round, phase, Command Points, and plan count share one compact sticky status
  line. The current Command Point bank is the dominant number in that line.
- Selecting a card previews its exact cost as `− N CP` and shows the current
  bank changing to the projected bank before the card is placed. The same cost
  remains visible on every target choice and on the staged plan step.
- The Control track is a slim positional meter that states whether `+5` is a
  victory or only tactical advantage in the current scenario.
- The three-step projected plan is always available as a compact dock rather
  than a full review panel below every other control.
- Category doors show only category name, ready count, usable count, and an
  active Context count. Draw and discard information moves inside the opened
  category.
- Opening a category still shows every ready card. Mobile keeps two cards per
  row rather than turning every card into a full-width vertical panel.
- Selecting a card condenses the category browser into one selected-card strip
  with `CHANGE CARD`; only then does the Route A/B/C target section appear.
- Choosing a target closes the category and returns the player to the compact
  category overview for the next action.
- During resolution, all planning controls remain hidden so the theater and
  player/enemy action order carry the screen.
- Round review begins with the Health/Control result and any actual grants.
  The complete event recap and deterministic record are collapsed under
  `ROUND DETAILS`.
- Engine source, seed, persistence boundary, and scenario switches remain
  available inside collapsed prototype options instead of occupying the main
  battle surface.
- A compact `SFX ON/OFF` control remains in the sticky status line. Sound
  effects use short interface and battle cues without adding another panel.
- Theater objects carry compact live states such as `UNPRIMED`, `PRIMED`,
  `PROTECTED`, `CONTESTED`, and `SECURED`; blocked Context Cards state the
  missing physical requirement.

This is an information-hierarchy correction, not a mechanical reduction or a
new visual direction. Health, enemy intent, probability, all ready cards,
neutral routes, Context Cards, modifiers, and replenishment rules remain.
The engine's existing `reserve` field is retained for compatibility; the
player-facing name for that same resource is **Command Points**.

## Procedural battle SFX

The owner-review prototype now gives its existing interactions and theater
events a small procedural Web Audio layer:

- category open, card selection, Cycle, Undo, and plan start have quiet UI
  cues;
- placing a card on a target has a distinct commitment / Command Point debit
  hit;
- player success, player failure or invalidation, enemy action or impact,
  Pressure Break, and Round Result each have a recognizable cue family;
- victory, defeat, and withdrawal use distinct final cues, so surviving an
  incomplete mission never receives the victory sound;
- the audio context is created lazily after interaction, uses no downloaded
  audio asset, and fails silently if browser audio is unavailable;
- SFX are on by default for this prototype and can be muted from the sticky
  status line; the mute control is independent from Reduced Motion.

These cues follow the already-buffered resolution event order. They do not
change rolls, timing authority, Health, Control, Command Points, cards,
replenishment, or outcome rules.

## Command Point banking and enemy-pressure correction

The next owner playthrough exposed two misleading behaviors: spent Command
Points appeared to reset to `10`, and enemies declared intents without exerting
enough visible battlefield pressure. The correction makes both systems
legible and consequential without changing the established surface:

- the Wayfinder starts with **10 Command Points**, banks every unspent point,
  gains **+6** at the start of each later round, and cannot exceed **20**;
- the sticky Command Point display always states `+6 NEXT ROUND` and `UNSPENT
  CP BANKS`; the round-advance control repeats the exact `+6 CP` change;
- a selected card still previews its immediate `− N CP` debit and resulting
  bank before placement;
- enemy movement intents draw temporary red dashed paths on the same physical
  theater edges used by actors. They disappear during action playback;
- Runner rushes and Stalker interceptions now carry 2 Impact when they reach
  the Wayfinder. The Stalker must move into range before Jamming a prepared
  object instead of disrupting it remotely;
- the Ward builds Guard at the Gate, then converts a fully fortified position
  into a telegraphed Lockdown Shot rather than guarding forever.

The result is a real budget across rounds and an enemy plan that can be read,
anticipated, evaded, or deliberately challenged on the theater.

## Owner correction — category browser and spatial theater

The first v0.3 presentation pass changed more of v0.2's established surface
than intended. This correction keeps the v0.3 rules architecture while
restoring the cyan/green/red/violet private-research visual language, strong
boxed separation between Theater, Cards, Choices, and Plan, and the theater's
position at the top of the page.

The correction also removes temporary straight target rays. Scenario edges are
the only persistent map lines. Selecting a card highlights legal bodies,
objects, or positions with Route A/B/C markers; staged Movement may trace the
physical move it projects, but attacks and defenses do not redraw the theater
as three lines aimed at an enemy.

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

- `Overload Relay` appears only when the authoritative Wayfinder occupies a
  relay whose prime survived an earlier enemy response.
- `Seal Gate` appears at physical Gate Controls, but cannot be targeted while
  an active enemy contests that position.
- `Vent Coolant` appears only at a primed coolant conduit.

Context Cards live outside the permanent category loadouts, appear in Special
while their physical source and prerequisite state are present, disappear when
that opportunity is lost, and are consumed if used. `Scan` and `Charge` remain
general cards: they prepare compatible scene objects without becoming bespoke
movement vocabulary for each level.

## One readable battle theater

The upper theater is a connected scenario graph rather than four repeated
boxes. Each scenario supplies:

- named physical positions and visible connections;
- cover, exits, and interactive scene objects;
- exactly one solid Wayfinder actor;
- a variable number of persistent enemy actors with health and locked intent;
- legal-target rings and Route A/B/C markers without temporary attack rays;
- a projected Wayfinder ghost and staged Movement trace while planning;
- action animation and event text during resolution.

The same theater supports a one-on-one duel, a three-enemy gate defense, and a
two-enemy extraction without changing the core card vocabulary. A player can
read where every body is, where each movement goes, which enemy is targeted,
and what source produces a Context Card.

## Planning loop

1. Enemy intent is seeded and locked at the beginning of the planning phase.
2. The player sees four compact category doors first: Movement, Defense,
   Offense, and Special. Each shows ready, **usable**, and active Context
   counts. Draw and discard counts appear after that category is opened.
3. Opening a category reveals its full available set. Every category starts
   with four general cards visible, and its available capacity is five. Mobile
   keeps two cards per row.
4. The player selects any card marked `USABLE HERE`. Every ready card remains
   visible; a blocked card states `NO LEGAL TARGET HERE`, `OBJECTIVE POSITION
   CONTESTED`, `OBJECT MUST BE PRIMED`, `PLAN FULL`, or the Command Point
   requirement instead of silently disappearing.
5. Selecting a card condenses the library to a selected-card strip. The engine
   derives zero to three legal targets from the current projected theater, and
   only then reveals the Route A/B/C panel.
6. The neutral Route A/B/C panels show target, numeric probability, success,
   failure, and any projected-position prerequisite.
7. Selecting a route spends Command Points and stages that general card. It
   does not automatically draw a replacement.
8. Successful projection updates the next target query. A successful `Advance`
   can therefore open a close-range Strike, a new movement branch, or a legal
   general `Scan`/`Charge` target. Preparation-dependent Context Cards wait
   until that prime survives the enemy response and becomes authoritative.
9. Up to three actions form the plan. Compatible Modifier cards attach to an
   existing step rather than consuming another action slot.
10. Undo returns the exact last card, Command Points, and projection.

Projection explains possibilities; it is not a guarantee. If an earlier move
fails, a later action that required the projected position is invalidated. Its
card and Command Points return instead of silently retargeting or inventing
movement.

## Resolution contract

`ACT OUT PLAN` computes a deterministic result but buffers it from the visible
authoritative state.

1. Every Wayfinder step acts in order and reveals success, failure, or causal
   invalidation.
2. Every surviving enemy then performs its previously locked intent.
3. Only after both sides finish does the Round Result apply final Health,
   Control, card grants, Break handling, objectives, retreat, or battle
   outcome.
4. Only then may the UI say `ROUND RESOLVED` or `BATTLE COMPLETE`.

Result order is explicit: Health 0 is defeat; scenario-authorized elimination
or objective completion is victory; a physical exit uses that scenario's
declared extraction/withdrawal result; Control only ends scenarios that grant
it terminal authority; then any displayed mission deadline applies. A player
cannot win Fractured Gate by retreating, reaching +5 Control, or merely firing
the relay.

Reduced Motion removes travel and impact movement but retains actor positions,
event order, action title, chance, roll, outcome, Health, Guard, and Control.

## Card availability and replenishment

Each category has a visible overview plus a tap-open card drawer, draw pile,
discard, capacity, and reshuffle count. The opening state exposes four cards in
every category instead of two token choices. Playing a card moves it toward
discard only after resolution; nothing fills its space on placement.

The current engine supports mixtures of:

- category-specific scenario round-start grants;
- success grants from categories actually used successfully;
- Cache Tap / future modifier-card grants;
- empty-pool fallback where a scenario explicitly enables it;
- Pressure Break grants across categories;
- explicit `Cycle · −1 CP`, which trades one Command Point to rotate one
  general card and is not a free placement refill.

The three test scenarios intentionally use different recipes:

| Scenario | Enemies | Automatic | Outcome | Context / other |
|---|---:|---|---|---|
| Sublevel Duel | 1 | None | Used-category success | Empty-pool fallback |
| Fractured Gate | 3 | None | Used-category success | Relay/gate Context Cards, Break mixture |
| Coolant Extraction | 2 | Movement +1 at round start | Used-category success | Coolant Context Card, Break mixture |

These are test recipes, not final balance archetypes.

## Deterministic machine smoke — 2026-08-18

The v0.3 contract test runs 40 policy battles under each scenario (120 total),
with a 40-round safety cap. All 120 terminate and every category is exercised.

| Scenario | Player wins | Enemy wins | Retreats | Unfinished | Average rounds | Context uses |
|---|---:|---:|---:|---:|---:|---:|
| Sublevel Duel | 39 | 0 | 1 | 0 | 4.550 | 0 |
| Fractured Gate | 16 | 18 | 6 | 0 | 10.525 | 49 |
| Coolant Extraction | 40 | 0 | 0 | 0 | 6.025 | 32 |

This is deadlock, determinism, branching, and broad rules smoke only. The
policy is not a human player. These figures are not evidence of balance,
difficulty, comprehension, fun, animation quality, or replay value.

A separate 120-battle Fractured Gate challenge audit produced 46 victories,
47 defeats, 27 withdrawals, and no unfinished battles at a 40-round harness
cap (10.492 average rounds, 140 Context uses). Of those defeats, 46 reached the
declared breach deadline and one lost through enemy Control pressure. The
important regression signals are that the policy no longer converts retreat,
`+5` Control, or Overload Relay into free wins, and that deliberate play can
now produce wins, losses, or withdrawals in meaningful proportions.

## Owner review path

### First read

1. Confirm the theater reads as one connected physical space with one solid
   Wayfinder and the scenario's actual enemies—not one Wayfinder per box.
   Confirm the Wayfinder begins at `12/12 HEALTH`, every enemy has numeric
   Health, and each enemy's intent is readable before planning. Confirm a
   moving enemy also shows its destination on a red dashed physical path.
2. Confirm the opening surface shows four compact categories and no empty Route
   panel. Open Movement and confirm at least four available cards are visible.
   Select `Advance`. Confirm the library condenses, Routes A–C appear, and
   connected theater positions gain matching target markers without drawing
   three attack rays.
3. Open Defense, Offense, and Special. Confirm each has several choices and
   that changing card category changes legal targets without changing what the
   three lanes mean.
4. Stage a movement. Confirm the projected Wayfinder moves and the next card's
   targets derive from that projected position.
5. In Fractured Gate, confirm the theater states `WIN`, `LOSE`, `EXIT`, and
   `TACTICAL`, the status line shows `ROUND 1/12`, and the Control meter says
   `+5 = ADVANTAGE · NOT VICTORY`.
6. Reach or scan the Service Relay. Confirm it begins `UNPRIMED`; use general
   `Scan` or `Charge` to prime it and `Protect` to answer the Stalker's locked
   Jam. `Overload Relay` must remain absent from that projected plan, then
   appear as a temporary Context Card next round only if the prime survived.
   It must not appear in Sublevel Duel or the permanent Special draw pile.
7. Use Overload Relay and confirm it damages/suppresses nearby enemies but says
   `MISSION CONTINUES`. Reach Gate Controls while the Ward is active and
   confirm `CONTESTED` plus `OBJECTIVE POSITION CONTESTED`; suppress or defeat
   the holder before `Seal Gate` becomes targetable.
8. Retreat from Fractured Gate and confirm the final result and sound are
   `WITHDRAWAL · MISSION INCOMPLETE`, not victory. In Coolant Extraction,
   reaching South Lift must instead produce the scenario-authorized extraction
   victory.
9. Attach a Modifier to a compatible planned step. Confirm odds/consequences
   update on that step rather than creating a scenario-specific base card.
10. Play a card and confirm no automatic replacement appears. Then trigger at
    least one success grant, round-start Movement grant, Context Card, Cache Tap,
    Cycle, and Pressure Break.
11. Spend Command Points, finish the round, and confirm the remaining bank is
    preserved. Start the next round and confirm it gains exactly `+6`, caps at
    `20`, and never silently resets to `10`.
12. Resolve a three-step plan. Confirm player steps act first. Confirm enemies
   respond second. Health, Control, grants, `ROUND RESOLVED`, and the final
   review must not appear until the Round Result.
13. Force an early movement failure with a later position-dependent step.
   Confirm the later step says `INVALIDATED` and returns its card/Command
   Points rather than teleporting or retargeting.
14. Switch among the one-, two-, and three-enemy scenarios. Confirm the same
    card grammar still makes physical sense.
15. Replay Same State with the same choices and confirm exact results. New
    Shuffle must change the derived seed and category availability.

### Mobile and accessibility

1. At `390 × 844`, confirm the connected theater fits without horizontal page
   scrolling, actor labels remain attributable to bodies, category doors stay
   in a two-column grid, and an opened category keeps two cards per row.
2. Complete a round with keyboard only. Card, route, theater target, plan,
   scenario, and review controls must have visible focus and useful names.
3. Confirm every actionable route exposes a percentage plus exact SUCCESS and
   FAILURE text. Red/amber/green may indicate odds only; no color means good,
   bad, or best.
4. Suppress color and verify labels, borders, actor names, numeric Health bars, route
   letters, and event order retain meaning.
5. Enable both the in-prototype Reduce Motion option and the OS preference.
   Confirm event order and all state changes remain readable.
6. Toggle SFX off and confirm planning plus a complete round remain playable
   without audio. Toggle it back on, then confirm card placement, player
   outcome, enemy response, and Round Result have distinct short cues with no
   hover noise or looping audio.

## Automated validation

```bash
node --test tests/barcode-world-three-route.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run typecheck
npm run lint
npm run build
```

The focused suite covers Health/Guard/Control separation, Guard persistence,
Compromised at zero Health, healing limits, reusable category pools, neutral three-choice lanes,
card-first targeting, physical target binding, Context Card visibility,
one-round scene preparation, objective protection/disruption, contested Gate
security, scenario-specific Control and exit outcomes, breach timeout, enemy
role counterplay, non-terminal relay payoff, modifiers, projected
prerequisites, causal invalidation, exact undo, no placement refill, multiple
grant sources, explicit cycling, deterministic replay, player/enemy/settle
ordering, variable enemy counts, simulation challenge bounds, distinct final
SFX, production isolation, and accessibility primitives.

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
