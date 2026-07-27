# BARCODE World Battle Mode: The Fractured Gate

Status: **IMPLEMENTED — PRIVATE OWNER-REVIEW PROTOTYPE**

Controlling checkpoint:
`BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_REVISED_ENCOUNTER_CHECKPOINT_2026-07-27`

Private development route: `/world/playtest`

This is the bounded Battle Mode proof inside the larger BARCODE World
persistent shared-world MMORPG / sandbox RPG. It is not a standalone game, a
canonical encounter, a public preview, or a connection to persistent world
systems.

## Hard boundary

- Solo, deterministic, resettable, noncanonical, and in memory.
- Production middleware returns an empty, no-store 404 before page metadata or
  client-chunk references are emitted; the page also retains a `notFound()`
  fallback.
- The route is absent from public navigation and the sitemap.
- `noindex`, `nofollow`, `noarchive`, and `nocache` metadata remain set.
- Normal public navigation, relay UI, data streams, and footer are suppressed
  on the exact private route only.
- Shared live and BNL providers remain inert on the exact private route.
- No API, account, profile, database, inventory, reward, economy, progression,
  queue, BNL, Relay, Journal, Memory, moderation, multiplayer, or shared-world
  dependency.
- No prototype state survives Reset, reload, or navigation.
- Merge is authorized for this bounded proof. Manual deployment and public
  exposure are not.

The prior Loose Signal and original one-enemy Fractured Gate implementations
remain historical deterministic-mechanics references only. They are not player
evidence and no longer control this encounter.

## Implemented encounter

The board uses the checkpointed hidden `13 × 9` tactical scale and exposes 62
real walkable tiles. The visible location contains the Lower Yard, Upper Walk,
Gate Platform, West Exit, Cracked Divider, powered service track, Gate
Actuator, defensive bollard, service gap and shutter, service lift, optional
Field Cache, and the three-pip Gate objective.

The formation has four independently positioned opponents:

| Enemy | Battlefield responsibility |
| --- | --- |
| Breacher | Physical Gate pressure and major contact |
| Guard | Protection, interception, and lane control |
| Controller | Machinery, closure, reset, and objective delay |
| Pressure | Flanks, Cache denial, and West Exit pressure |

Each enemy owns a fixed 12-card deck, five-card opening hand, position, state,
and legal actions. The solo formation distributes one visible 16-Command squad
allotment among those four actors. It never receives four hidden full pools.

## Revised battle loop

The interaction is:

`Select → choose → target → preview → plan → contest → pass/lock → reveal → watch → settle`

The player and enemy squad alternate legal commitments. The newest action is
Open. Adding a new action makes the previous one Solid. Each allotment permits
one Pivot of the newest Open action; its replacement locks immediately. Two
consecutive passes Lock both plans. Saved Command cannot become an undeclared
post-reveal reaction.

The foundation preserves:

- 16 starting Command, +16 after Settle, and the 32 cap;
- four paid actions at most and one free ordinary Reposition;
- fixed 12-card Prepared decks and validated five-card opening hands;
- draw two, retain seven, and once-per-cycle Refocus for 4 Command;
- half-primary-cost Settle refunds for invalidation before begin;
- no silent retargeting;
- the same deterministic simulator for Preview and resolution;
- Fast → Standard → Slow global presentation;
- prerequisite order inside an actor's linked plan.

### Command and Tempo

Command controls action capacity and banking. Tempo controls when materially
opposed plans develop and intersect. Tempo never becomes Command and never
creates another action.

Normal presentation uses Fast, Standard, and Slow. A linked transition is
shown as Preserved, Broken, or Accelerated. Details expose the bounded
deterministic comparison.

The controlled route proof is:

| Route | Player contact | Enemy contact | Forecast |
| --- | ---: | ---: | --- |
| Clear + Follow Through | 6 | 6 | Likely even |
| Rubble | 4 | 6 | Enemy likely first |
| Powered toward Divider | 7 | 6 | Player likely first |

The preview exposes contact risk, likely timing, location, and the count of
concealed factors. It does not reveal exact enemy cards. The `CLASH`
presentation appears only after reveal produces meaningful opposed contact.

### Skill attribution

Specialized information and actions name their sources:

- `Revealed by` identifies the discipline that noticed the opportunity.
- `Enabled by` identifies the discipline that makes the action legal.
- `Modified by` identifies a card or equipment change.
- `Opposed by` identifies the visible enemy posture or revealed response.

The six ordered builds produce different causal state changes:

| Build | Major condition → Minor payoff |
| --- | --- |
| Battle / Exploration | Physical contact breaks the Divider → its safe opening becomes a route |
| Exploration / Battle | A natural upper relationship is prepared → its landing can be physically protected |
| Battle / Hacking | Force exposes a regulator → its automatic reset can be suppressed |
| Hacking / Battle | Local bollard Control is established → physical access can preserve and weaponize it |
| Exploration / Hacking | A service relationship is prepared → its connected shutter can be suppressed |
| Hacking / Exploration | Lift Control is established → temporary traversable geometry can be created |

These are permissions, positions, Dependencies, and authored state changes—not
six renamed percentage bonuses. Enemy cards can contest the actual source.

## Complete representative encounter

The Battle / Exploration proof has three exchanges:

1. A clear Reposition and Advance enable source-bound **Follow Through**.
   **Answer Commitment** meets the Breacher's Rush at the Divider. Shield Link
   protects against full displacement, the emergent Clash breaches the
   Divider, the Breacher staggers, and Gate Stability remains `3/3`.
2. **Cross Opening** draws **Charge Debris** and a Gate body block. The player
   uses their single Pivot to replace Slow Stabilize with **Angle the
   Contact**; the Guard Pivots to **Brace Line**. Pressure threatens the West
   Exit. Their revealed Gate-access Clash jams the bollard and places the
   player at `(10,5)` without stabilizing the objective.
3. **Guard Gate** establishes before the final Rush. **Objective Brace**
   protects Slow **Stabilize Gate** from Static Tax. The defended Clash stops
   the Breacher, the defensive seal completes, and Results assign **Fast
   Secure** with the damaged Divider, jammed bollard, pressured exit, and
   unrecovered Cache reported as tradeoffs.

All five owner-facing result families are reachable:

- Fast Secure;
- Clean Secure;
- Recovery Secure;
- Gate Lost;
- Controlled Retreat.

The diagnostic `Gate Secure` fallback remains internal for a slow damaged
secure that matches none of the five named cases.

## Exact private owner review

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/world/playtest`.

### Primary Battle / Exploration path

1. Confirm the header says private, solo, noncanonical, and in-memory. Confirm
   Player Command `16`, Enemy Squad Command `4` after its opening commitment,
   Gate Stability `3/3`, four enemy pieces, and five Prepared cards.
2. On the clear Lower Yard lane, select tile `(3,6)`, choose **Move →
   Reposition**, select the highlighted tile again, confirm the textual
   `CONFIRMED` cue, inspect Preview, and add it.
3. Select clear tile `(5,6)`, choose **Move → Advance**, select the tile again,
   and add it. Confirm the earlier Reposition is now a Solid commitment.
4. Select **Cracked Divider**, choose **Discipline → Answer Commitment**, and
   select the Divider as the target. Attach the source-bound **Follow Through**
   card. Confirm the forecast says high contact risk, likely even, Cracked
   Divider, one concealed factor, and `Player 6 · Enemy 6`; it must not name
   the enemy's exact cards.
5. Add the action and confirm 4 Player Command remains. Select **Pass / Lock**.
   After reveal, verify Fast Shield Link precedes movement and the actual
   `CLASH · Divider contact`. Settle and verify Gate Stability is still `3/3`.
6. Select the projected breach, choose **Move → Cross Opening**, and target
   tile `(10,5)`. Then select the Gate, choose **Use → Stabilize Gate**, target
   the Gate, and add it.
7. In Plan, choose **Change Newest**. Select **Defensive Bollard**, choose
   **Discipline → Angle the Contact**, retarget the bollard, and confirm. Verify
   the earlier Cross is still Solid, both Pivot labels read spent, and the
   enemy's broad posture changes without revealing its card.
8. Pass once to let Pressure commit, then pass again to Lock. Verify Charge
   Debris and West Exit pressure resolve Fast; Cross Opening then
   `CLASH · Gate access` resolve Standard. Settle and confirm charged conduit,
   jammed bollard, threatened West Exit, player at `(10,5)`, and Gate `3/3`.
9. Discard to retain seven. Select the Gate, plan **Defend → Guard Gate**, then
   **Use → Stabilize Gate** with **Objective Brace**. Pass to Lock. Verify Fast
   Guard and Static Tax, the Standard defended Gate Clash, and Slow Gate
   stabilization.
10. Confirm **Fast Secure** explains the objective, all four enemies, player
    state, Cache, location consequences, principal turning point, tradeoff, and
    title reason.
11. Select **Reset Same Initial State**. Rebuild the opening plan and confirm
    the starting state and deterministic plan signature return exactly.

### Connected owner checks

1. Compare the clear lane with rubble `(3–5,5)` and the powered lane
   `(3–7,7)`. Confirm the forecast changes timing without changing available
   Command.
2. Change each ordered build and confirm specialized text names `Revealed by`
   and `Enabled by`; builds without that opportunity do not receive a gray
   class-locked substitute.
3. Let three unopposed Gate impacts complete and verify **Gate Lost** at `0/3`.
4. Use **Leave** beside the West Exit and verify **Controlled Retreat** does not
   pretend the Gate or formation was solved.
5. Exercise Hacking / Exploration's lift. Confirm Output creates a capacity-one
   bridge, crossing moves to the legal landing, and the lift returns at Settle
   even if that exchange ends the battle.
6. Repeat the same submitted plan and initial seed. Confirm Preview signature,
   resolution packets, and material final state match.

### Input and presentation checks

1. Complete the primary path with pointer controls only.
2. Reload and complete representative selection, targeting, card, Pivot,
   Pass/Lock, manual resolution, Settle, Review, and Reset interactions using
   Tab, Enter, and Space. Confirm every focused control has a visible outline.
3. At `390 × 844` CSS pixels, confirm tile, focus, card, and action controls
   remain at least `44 × 44` CSS pixels and the board remains usable.
4. Enable **Reduce motion**. Confirm target, path, Clash, and card animations
   stop and resolution becomes manually advanceable without hiding state.
5. Confirm state never depends on color alone: `TARGET`, `CONFIRMED`,
   `COMPATIBLE`, `NEWEST`, `SOLID COMMITMENT`, Pivot state, lane names, pips,
   borders, shapes, and text all carry meaning.

## Automated validation

```bash
node --test tests/barcode-world-fractured-gate.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused suite covers the revised source identity, 62 tactical tiles, six
player decks, four enemy decks, shared squad action economy, spatial legality,
controlled Tempo routes, source-bound context cards, concealed-information
boundaries, Preview/lock signature parity, deterministic resolution,
opposed planning and both Pivots, the complete three-cycle battle, Command
banking and caps, Refocus, invalidation/refunds/no-retargeting, all six ordered
build state changes, all five Results, lift reset, reset/replay, production
gating, isolation from persistent systems, input semantics, non-color cues,
touch targets, reduced motion, and core text contrast.

These are implementation checks—not player evidence. They do not establish
comprehension, balance, fun, accessibility, or replay value.

## Post-merge deployment and focused evidence

No manual deployment is authorized or initiated for this proof. If normal
`main` automation produces a deployment after the authorized merge, the
prototype must remain inaccessible:

1. Request `<production-origin>/world/playtest` and verify an HTTP 404.
2. Inspect the production global navigation and `/sitemap.xml`; verify neither
   contains `/world/playtest`.
3. Inspect returned production HTML and discoverable route metadata; verify no
   Fractured Gate title, description, board content, or public link is exposed.
4. Confirm normal public routes still render their existing site chrome and
   providers.
5. In an authorized local development environment, run the exact primary path
   above and record:
   - the cycle-one Preview and locked signatures;
   - the three resolution logs;
   - Gate Stability after each Settle;
   - the final Results explanation;
   - Reset producing the same initial state.
6. Label these captures **implementation evidence**. Keep any future moderated
   comprehension, balance, fun, accessibility, or replay observations separate
   and do not promote this private prototype publicly without a new owner
   decision.
