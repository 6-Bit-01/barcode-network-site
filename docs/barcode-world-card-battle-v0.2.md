# BARCODE World: stack / resolve card battle v0.2

Status: **UNLISTED OWNER-REVIEW RESEARCH PROTOTYPE**

Owner-review route: `/world/playtest`

This is a bounded Battle Mode proof inside the larger website-based BARCODE
World persistent shared-world MMORPG / sandbox RPG. Cards are the player's
combat language; they are not a literal tabletop game inside the fiction.

## Hard boundary

- Solo, seeded, resettable, noncanonical, and held only in memory.
- The exact card-battle PR branch may render on its unlisted Vercel Preview URL.
- Production and every unrelated preview return an empty, no-store 404 before
  client content is served; the page also retains a `notFound()` fallback.
- The route remains absent from public navigation and the sitemap.
- Public chrome and shared live/BNL polling remain inert on this route.
- There is no API, account, profile, database, inventory, reward, economy,
  progression, queue, BNL, Relay, Journal, Memory, moderation, multiplayer,
  canon, or shared-world dependency.
- State never survives Reset, reload, or navigation.
- This branch does not authorize merge, production deployment, or public
  exposure.

Loose Signal, Fractured Gate, and card battle v0.1 remain historical mechanics
references only. Their tactical grid, persistent card Health, replacement,
Outflank, and 3/6 Command loop do not control v0.2.

## August 17 scene correction

The first v0.2 owner look exposed a presentation regression: the rebuilt rules
were present, but red intent cards had replaced visible enemies, numbered lanes
had no physical meaning, and the upper battle scene from v0.1 had been omitted.
That is incompatible with the controlling premise that cards direct a real
fight rather than becoming a tabletop game inside the fiction.

The corrected surface therefore establishes:

- A persistent battle theater sits at the top of the experience. It shows the
  current location, objective, four physical fronts, hostile occupants, and
  staged Wayfinder actions.
- Lanes are encounter-specific regions of the explored location—not generic
  card slots or square tactical tiles. Breacher Intercept, for example, uses
  West Access, Cargo Divider, Service Relay, and Gate Threshold.
- Hostile bodies remain visible both in the theater and inside their matching
  lane. Enemy cards describe what those hostiles are about to do; the cards do
  not substitute for the enemies themselves.
- Resolve is a staged presentation rather than an immediate result screen.
  First the Wayfinder's staged actions animate and reveal success or failure.
  Then the locked hostiles take their action or visibly lose it because the
  player stopped them. Only after both phases does Pressure settle and the
  interface declare the round resolved.
- The pre-resolution board, rack, and Pressure state remain authoritative while
  the two action phases play. The already-computed deterministic result stays
  buffered in memory so grants, final Pressure, and `ROUND RESOLVED` cannot leak
  before the enemy phase finishes.
- Reduced Motion removes movement but retains occupant, action, roll, outcome,
  and Pressure information.

The front names in this presentation pass identify physical space and connect
the card interface to the fiction. They do not secretly add terrain modifiers;
the visible enemy action, staged move, probability, and consequences remain the
complete mechanical truth for this prototype.

## v0.2 battle loop

The duel uses four fixed lanes and one shared Pressure track from enemy `-5` to
player `+5`.

1. Each side has an 18-card deck. The player begins with six visible cards.
2. Each round grants 10 Reserve, banked to a cap of 20. A scenario may add a
   visible Reserve bonus.
3. The seeded Breacher AI commits exact, locked intent stacks before the player
   acts. It never reads the player's later choices.
4. The player may stage as many affordable cards as desired. There is no
   per-turn card-count cap. A lane accepts a compatible stack of up to three.
5. Compatible sequences compile into named moves: two Attacks become `POWER
   ATTACK`; Defend then Attack becomes `COUNTERATTACK`; Flank then Dread Pulse
   becomes `SURPRISE` and applies Fear; further compatible cards produce deeper
   names and effects.
6. Every staged move exposes a stepped `15–95%` success probability and its
   exact success/failure consequences. Red, yellow, and green describe only
   that immediate roll's odds; they never grade the strategic value of a move.
7. Resolve uses hidden seeded rolls and settles all four lanes. The roll appears
   only in the causal round review.
8. Lane results net onto the shared Pressure track. Reaching `+5` or `-5` ends
   the battle before Break handling.
9. Crossing armed `+3` or `-3` triggers Pressure Break: both racks receive six,
   Charge/Fear clear, and Pressure stays. Break rearms only inside `-2…+2`.

## Card grammar

The player deck currently exercises eight card types.

| Type | Example | Surface role |
|---|---|---|
| Attack | Jab / Heavy Strike | Direct Pressure with different cost/odds |
| Defend | Guard | Block and counter enemy Attacks |
| Maneuver | Flank | Exploit defended/open lanes and begin Surprise |
| Modifier | Overclock / Dread Pulse / Cache Tap | Attach power, Fear, or draw effects |
| Preparation | Charge | Set up a later action or combine immediately |
| Reaction | Parry | Counter a locked enemy Attack |
| Finisher | Breakpoint | Spend or produce Fear for high Pressure |
| Recovery | Recompile | Trade tempo for a successful draw grant |

`Cache Tap` is a true draw Modifier. It attaches to compatible Attack, Defend,
Maneuver, and deeper three-card sequences. Its cards are granted only if the
compiled move succeeds. This proves that replenishment can come from build
choices rather than only from encounter timing.

## Replenishment is composable

Six is the rack capacity, not a universal refill rhythm. Replenishment is built
from independent sources that a scenario may use alone or in combination:

- automatic round-start draws;
- successful-contest and successful-combo outcome grants;
- one-time condition or Pressure unlocks;
- Modifier, Recovery, and future equipment/build effects;
- empty-rack scenario fallback;
- Pressure Break refill;
- scenario Reserve bonuses, which change play capacity without changing rack
  size.

The Options drawer exposes four owner-test recipes:

| Scenario | Automatic | Outcome | Unlock | Bonus | Card effects |
|---|---:|---:|---:|---:|---:|
| Breacher Intercept | — | Contest +1, combo +1 | — | — | Yes |
| Signal Surge | Round start +2 | — | — | +2 Reserve | Yes |
| Fractured Cache | — | — | Fear +2, Pressure +2 | — | Yes |
| Cascade Protocol | Round start +1 | Contest +1 | Fear +2 | +1 Reserve | Yes |

These are tuning recipes, not final encounter archetypes. The engine stores
source-specific requested and actual draw counts in each round review so later
balance work can distinguish where card flow came from.

## Determinism and uncertainty

Shuffle domains, enemy planning ties, discard reshuffles, and contest rolls are
seeded. Same seed, same scenario, and same choices reproduce the same battle.
New Shuffle advances to a different derived seed. Probability remains genuine
at the player-facing level because the roll is hidden until Resolve; preview
shows the chance and both branches, not the result.

Determinism is a replay and test guarantee, not an instruction to expose or let
players manipulate the random stream.

## Interface contract

- The upper battle theater remains visible before and after Resolve. It names
  the location and objective, shows actual hostile occupants in all occupied
  fronts, and runs `PLAYER → ENEMY → RESOLVE` before scrolling to the review.
- Every numbered lane also has a concise encounter-specific front name and
  spatial role. The same names appear in the theater, lane controls, and review.
- Enemy silhouettes and actor labels are distinct from enemy action cards.
- The four lanes remain above the six-slot rack on desktop and mobile.
- Each lane embeds locked enemy intent, the current/projected player stack, its
  compiled move name, one probability bar, and explicit success/failure text.
- A selected card previews only legal lane connections; illegal lanes provide
  a concise reason to assistive technology and visible text.
- Card faces show type, cost, name, and one short effect line. Deeper causal
  prose lives in the collapsed event log.
- The source strip names the active scenario recipe. Options can switch recipes
  and reset the in-memory battle.
- The post-Resolve view shows one compact result per lane, exact chance and
  revealed roll, net Pressure, granted cards, and source chips.
- Pointer, keyboard, visible focus, meter semantics, reduced motion, forced
  colors, horizontal touch scrolling, safe-area controls, and 44px-class action
  targets remain part of the contract.

## Machine smoke — 2026-08-17

The checked-in v0.2 artifact runs 250 deterministic policy battles under each
recipe (1,000 total). Every run ended before the 40-round cap and exercised
named multi-card moves.

| Scenario | Player | Enemy | Unfinished | Avg rounds | Avg cards granted |
|---|---:|---:|---:|---:|---:|
| Breacher Intercept | 171 | 79 | 0 | 3.284 | 6.656 |
| Signal Surge | 198 | 52 | 0 | 3.404 | 5.204 |
| Fractured Cache | 123 | 127 | 0 | 3.460 | 5.176 |
| Cascade Protocol | 194 | 56 | 0 | 3.188 | 6.536 |

The deterministic player policy optimizes immediate expected lane value. These
figures are deadlock, rules, and gross tuning smoke only. They are not player
comprehension, accessibility, balance, fun, or replay evidence. In particular,
Signal Surge and Cascade Protocol are intentionally generous test recipes and
need owner play before any balance conclusion.

## Exact owner review

Open the current PR preview directly:

<https://barcode-network-site-cpps-git-agent-barc-521e00-6-bits-projects.vercel.app/world/playtest>

### First read and mobile path

1. At `390 × 844`, confirm the upper battle theater identifies a physical
   location and shows all four fronts in a two-by-two field without horizontal
   scrolling.
2. Confirm every occupied front shows a visible hostile body and actor name;
   its action card is supporting intent, not the only representation of an
   enemy.
3. Confirm the matching lane controls appear above the six-slot rack and use
   the same front names. The sticky Resolve rail must not cover card content.
4. Confirm each lane shows the locked enemy move before any player choice.
5. Select several different card types. Confirm legal lanes light up, projected
   stack names change, and incompatible sequences do not silently place.
6. Confirm every projected move shows a numeric percentage plus exact SUCCESS
   and FAIL consequences. Confirm red/yellow/green never says good, bad, or best.
7. Place one card and verify its rack slot remains empty. No replacement should
   appear simply because a card was played.
8. Build `Jab → Jab` and verify `POWER ATTACK`. Build `Flank → Dread Pulse` and
   verify `SURPRISE` with Fear. Attach `Cache Tap` to a compatible move and
   verify its success branch says `DRAW 2`.
9. Resolve. Confirm the interface returns to the upper theater first. It must
   show the Wayfinder actions and their success/failure before advancing to the
   locked enemy response. Pressure, grants, and `ROUND RESOLVED` must remain at
   their pre-resolution state until both phases finish. Then account for every
   lane's odds, revealed roll, Pressure contribution, and net movement in the
   causal review.
10. In Options, play at least two rounds under each feed recipe. Verify Signal
   Surge deals automatically, Breacher Intercept rewards results, Fractured
   Cache releases unlocks, and Cascade Protocol mixes sources.
11. Reach a Pressure Break. Verify Pressure stays, both racks receive six, and
   Charge/Fear clear.
12. Replay Same State and repeat the same choices. Verify intents, rolls, draws,
    and results match. New Shuffle must change the derived seed/opening.

### Accessibility path

1. Complete one round with Tab and Enter/Space only.
2. Confirm every interactive card and lane has visible focus and a useful name.
3. With color suppressed, confirm percentages, SUCCESS/FAIL labels, actor names,
   borders, and source chips preserve the full meaning.
4. Confirm Pressure and probability expose meter roles and current/min/max.
5. Enable Reduce Motion and the operating-system reduced-motion preference;
   verify battle movement, smooth scrolling, and transitions stop without
   hiding occupants, actions, rolls, outcomes, or Pressure.
6. Expand the event log by keyboard and confirm it explains the same result as
   the compact visible recap.

## Automated validation

```bash
node --test tests/barcode-world-card-battle.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

Focused tests cover deck composition, all eight card types, compatible and
incompatible stacks, named transformations, Reserve, six-card capacity, no
placement refill, each isolated feed source, mixed sources, draw Modifier
success/failure, unlocks, automatic next-round deals, hidden seeded rolls,
visible probabilities, Break, endpoint precedence, enemy intent isolation,
undo, replay, simulations, production isolation, concise surface structure,
responsive ordering, accessibility primitives, and protected-system boundaries.
The boundary suite also checks the upper theater, encounter-specific front
names, visible hostile actors, buffered `PLAYER → ENEMY → RESOLVE` sequencing,
animation cues, and reduced-motion fallback.

## Post-merge deployment and focused evidence

No merge or manual deployment is authorized by this branch. If a future owner
decision merges it and normal `main` automation deploys the site:

1. Request `<production-origin>/world/playtest`; verify an empty HTTP 404 with
   `Cache-Control: no-store, max-age=0` and the full `X-Robots-Tag` boundary.
2. Confirm production navigation and `/sitemap.xml` contain no playtest link,
   card-prototype title, metadata, or client-chunk reference.
3. Confirm homepage, Queue, BNL, Journal, Database, Radio, and admin routes keep
   their existing chrome, polling, and behavior.
4. Run `npm run check` and `npm run build` from the exact merged commit.
5. In authorized local development, execute the mobile, keyboard, reduced-
   motion, scenario-feed, Break, and same-seed replay paths above.
6. Record the scenario ID, seed, staged sequences, visible odds, revealed rolls,
   draw-source chips, decisive Pressure review, and replay equality as focused
   evidence. Keep balance/fun conclusions separate.
