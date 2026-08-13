# BARCODE World Battle Mode: The Fractured Gate

Status: **HISTORICAL TACTICAL IMPLEMENTATION — SUPERSEDED AS THE ACTIVE PRIVATE ROUTE**

The deterministic and accessibility patterns remain implementation evidence,
but the Fractured Gate rules and interface no longer control Battle Mode. The
active `/world/playtest` target is the four-lane card-battle v0.1 described in
`docs/barcode-world-card-battle-v0.1.md`.

Controlling direction:
`BARCODE_WORLD_BATTLE_MODE_BREACHFLOW_OWNER_LOCK_2026-07-31`

Private development route: `/world/playtest`

This is a bounded, interactive Battle Mode proof inside the larger BARCODE
World persistent shared-world MMORPG / sandbox RPG. It exists so the owner can
judge the encounter in motion. It is not a standalone game, a canonical
encounter, a public preview, or a connection to persistent world systems.

The 2026-07-27 revised encounter checkpoint remains authoritative for the
Fractured Gate's physical location and result truth. Later owner decisions
replace its Command/Pivot/four-enemy combat layer with Breachflow.

## Hard boundary

- Solo, deterministic, resettable, noncanonical, and held only in memory.
- Production middleware returns an empty, no-store 404 before page metadata or
  client-chunk references are emitted; the page retains a `notFound()` fallback.
- The route is absent from public navigation and the sitemap.
- `noindex`, `nofollow`, `noarchive`, and `nocache` metadata remain set.
- Normal public navigation, relay UI, data streams, and footer are suppressed
  on the exact private route only.
- Shared live and BNL providers remain inert on the exact private route.
- No API, account, profile, database, inventory, reward, economy, progression,
  queue, BNL, Relay, Journal, Memory, moderation, multiplayer, or shared-world
  dependency.
- No prototype state survives Reset, reload, or navigation.
- This branch does not authorize merge, deployment, persistence, or public
  exposure.

The prior Loose Signal and Command/Pivot Fractured Gate implementations remain
historical mechanics references only. They do not control this encounter.

## Implemented Breachflow encounter

The animated isometric board uses the checkpointed hidden `13 × 9` tactical
scale and exposes 62 real walkable spaces:

| Lane | Threat or opportunity |
| --- | --- |
| Center | RAM, the Cracked Divider, and the fastest direct route |
| Upper | TRACE, the relay beam, unstable crossing, and optional Field Cache |
| Lower | JAMMER, powered service track, and eastern launch route |
| West | Entry and legitimate Controlled Retreat |
| East | Fractured Gate objective |

The repeated player turn is:

1. Read one visible primary **Commitment** and one visible support action.
2. Spend up to six movement pips before, between, or after actions.
3. Choose at most two actions.
4. Inspect the deterministic Preview and its plan signature.
5. Lock the plan.
6. If the setup earned a Response, choose its explicit sacrifice.
7. Watch `YOU ACT FIRST`, `CONTACT`, and `ENEMY ACTS FIRST` events resolve.
8. Settle the board and continue or receive a result.

The third enemy visibly reports that it has no hidden action. An invalidated
enemy Commitment or support action is not reassigned to another enemy.

Five visible cards have no cost and only vary decisions. Needle Carbine,
Barrier Mesh, Field Rig, and the selected build action remain guaranteed
outside the hand. There is no Command meter, banking, cost arithmetic, Pivot,
or concealed third attack.

## Six ordered builds

Each build turns a different physical enemy behavior into a temporary route.
The route is source-bound, destination-specific, exclusive, one use, and
consumes movement. It never grants a third action.

| Build | Turn-one conversion | Route |
| --- | --- | --- |
| Battle → Exploration | `Anchor` + `Shunt RAM`, then choose `Intercept` | `Ride the Breach` through the destroyed Divider |
| Exploration → Battle | `Prepare Crossing` + `Take Cache` | `Meet at Landing` on the declared upper crossing |
| Battle → Hacking | `Brace Contact` + `Hook Regulator`, then choose `Suppress Stabilize` | maintenance opening through RAM's exposed response |
| Hacking → Battle | `Reverse Track Feed` + `Drive RAM onto Track` | powered track route created by the physical trigger |
| Exploration → Hacking | `Map Relay Angle` + `Redirect Broadcast` | `Follow the Signal` through the hostile relay |
| Hacking → Exploration | `Rewrite Rig Stabilize` + `Intercept RAM` | one-use route through JAMMER's physically vacated geometry |

Hacking → Exploration creates no route unless JAMMER reaches its declared
legal space. No route silently retargets, fabricates geometry, adds damage,
breaks Guard, pins a target, or adds an action.

## Results

All five owner-facing result families are reachable:

- **Fast Secure** — lock through an immediate, costly opening.
- **Clean Secure** — contain the principal system without destroying the Divider.
- **Recovery Secure** — carry the Field Cache and still lock the Gate.
- **Gate Lost** — allow visible pressure to remove all three Gate Stability.
- **Controlled Retreat** — use the West Exit before the player is compromised.

Results report the objective, player, Cache, location, all three enemies,
turning point, and tradeoff. They write no progression, loot, reward, canon, or
shared history.

## Exact private owner review

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/world/playtest`.

### Baseline readability check

1. Confirm the header says `PRIVATE`, `SOLO`, `RESETTABLE`, `NONCANONICAL`, and
   `IN MEMORY`.
2. Confirm Turn 01, six movement pips, two open action slots, Player Condition
   12 / Protection 6, and Gate Stability 3/3.
3. Confirm RAM's Commitment, JAMMER's support action, and TRACE's explicit “no
   hidden third action” state are all visible before planning.
4. Confirm RAM, TRACE, JAMMER, the Divider, crossing, powered track, relay,
   Cache, Gate, and West Exit are recognizable without selecting them.
5. Select the player, choose **Move**, and verify every legal destination is
   marked `FREE` with its movement-pip cost. Queue one move, then confirm
   movement can be split around the two action slots.
6. Select an action, inspect `CONFIRMED PREVIEW` and its signature, optionally
   attach a compatible no-cost card, and add it. The hand must never gate the
   selected build action.
7. Lock a plan and confirm the locked signature matches Preview. With Reduce
   motion off, events auto-advance; with it on, **Resolve Next Event** advances
   them manually.

### Primary Battle → Exploration path

1. Leave the default build selected. Move to the center contact line at `(5,6)`.
2. Select the Cracked Divider and add **Anchor**.
3. Select RAM and add **Shunt RAM**. Lock the plan.
4. At the earned Response choose **Intercept**. Confirm the player takes the
   declared hit, RAM is staggered, the Divider becomes breached, the Gate
   remains 3/3, and **Ride the Breach** appears as a real one-use route.
5. Settle Turn 01. Select **Ride the Breach** and add the route movement.
6. Select the player and add **Guard Position**. Select the Gate and add **Lock
   Now**. Lock, resolve, and settle.
7. Confirm **Fast Secure** names RAM's redirected charge as the turning point
   and the destroyed Divider / unrecovered Cache as the tradeoff.
8. Select **Reset Same Initial State** and confirm the same seed, opening hand,
   enemy plan, board state, and Preview signature return.

### Five connected build paths

Reset before changing the ordered build.

1. **Exploration → Battle:** move to `(5,3)`, add **Prepare Crossing** and
   **Take Cache**, resolve and settle; use **Meet at Landing**, then **Guard
   Position** + **Lock Now**. Confirm **Recovery Secure** and a carried Cache.
2. **Battle → Hacking:** move to `(5,6)`, add **Brace Contact** and **Hook
   Regulator**, choose **Suppress Stabilize**, resolve and settle; use the
   maintenance route, then **Guard Position** + **Lock Now**. Confirm **Clean
   Secure** and that only RAM's displayed Stabilize response was suppressed.
3. **Hacking → Battle:** move to `(6,7)`, add **Reverse Track Feed** and **Drive
   RAM onto Track**, resolve and settle; use the track route, then **Guard
   Position** + **Lock Now**. Confirm **Clean Secure** and RAM displaced west by
   JAMMER's own powered support.
4. **Exploration → Hacking:** move to `(5,3)`, add **Map Relay Angle** and
   **Redirect Broadcast**, resolve and settle; use **Follow the Signal**, then
   **Guard Position** + **Lock Now**. Confirm **Fast Secure**, one accepted RAM
   Gate hit, and all three enemies still operational.
5. **Hacking → Exploration:** move to `(7,7)`, add **Rewrite Rig Stabilize** and
   **Intercept RAM**, resolve and settle; use the rig route, then **Guard
   Position** + **Lock Now**. Confirm **Fast Secure**, JAMMER physically moved,
   and the temporary geometry disappeared after use.

### Failure, input, and presentation checks

1. Reset and lock three empty plans, settling each turn. Confirm RAM's visible
   Gate pressure reaches 0/3 and produces **Gate Lost**.
2. Reset, select the West Exit, add **Leave**, and lock. Confirm **Controlled
   Retreat** reports an unsolved Gate.
3. Complete the primary path once with pointer controls and once with Tab,
   Enter, and Space. Every focused control must have a visible outline.
4. At `390 × 844` CSS pixels, confirm controls remain at least `44 × 44` CSS
   pixels. The board may pan horizontally, but tiles must retain their hit area.
5. Enable **Reduce motion**. Board cues remain visible, animation ceases, and
   resolution becomes manually advanceable without hiding state.
6. Confirm state never depends on color alone: `FREE`, `TARGET`, `BUILD SOURCE`,
   `CONFIRMED`, timing labels, pips, icons, borders, shapes, and text all carry
   meaning.

## Automated validation

```bash
node --test tests/barcode-world-fractured-gate.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused suite covers the owner-locked source identity, 62 tactical spaces,
six build openings, three-enemy action honesty, split six-pip movement, two
actions, bounded context choices, Preview/locked signature parity, earned
Responses, six different physical routes, rig-move legality,
Fast/Clean/Recovery secure results, Gate Lost, Controlled Retreat, optional
no-cost cards, deterministic deck cycling, invalidation/no-retargeting, exact
reset, production gating, isolation from persistent systems, semantic input,
non-color cues, touch targets, reduced motion, and core text contrast.

These are implementation checks, not player evidence. They do not establish
comprehension, balance, fun, accessibility, or replay value.

## Post-merge deployment and focused evidence

No merge or manual deployment is authorized or initiated by this branch. If a
future owner decision merges it and normal `main` automation deploys the site:

1. Request `<production-origin>/world/playtest` and verify an HTTP 404 with
   `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.
2. Inspect production global navigation and `/sitemap.xml`; neither may contain
   `/world/playtest`.
3. Inspect returned production HTML and discoverable route metadata; verify no
   Fractured Gate title, description, board content, or client-chunk reference
   is exposed.
4. Confirm normal public routes still render their existing chrome, live
   providers, and behavior.
5. In an authorized local development environment, run the exact Battle →
   Exploration path and all five connected build paths. Record the Turn 01
   Preview and locked signatures, each generated route and turning point, Gate
   Stability after every Settle, final result/tradeoff, and exact Reset state.
6. Run Gate Lost and Controlled Retreat and capture their result explanations.
7. Label all captures **implementation evidence**. Keep future moderated
   comprehension, balance, fun, accessibility, and replay observations
   separate; do not expose the prototype publicly without a new owner decision.
