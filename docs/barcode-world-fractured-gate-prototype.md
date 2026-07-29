# BARCODE World Battle Mode: The Fractured Gate

Status: **IMPLEMENTED — PRIVATE OWNER-REVIEW PROTOTYPE**

Implementation basis:

- `BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_REVISED_ENCOUNTER_CHECKPOINT_2026-07-27`
- owner corrections through 2026-07-28, which supersede the checkpoint's
  opposed-planning loop

Private development route: `/world/playtest`

This is a bounded Battle Mode proof inside BARCODE World. It is not a
standalone game, canonical encounter, public preview, or connection to the
persistent world.

## Hard boundary

- Solo, deterministic, resettable, noncanonical, and in memory.
- Production middleware returns an empty, no-store 404 before page metadata or
  client-chunk references are emitted; the page retains a `notFound()`
  fallback.
- The route is absent from public navigation and the sitemap.
- `noindex`, `nofollow`, `noarchive`, and `nocache` metadata remain set.
- Public site chrome, relay UI, data streams, and shared live providers remain
  inert on this exact route.
- No API, account, profile, database, inventory, reward, progression, queue,
  BNL, Relay, Journal, Memory, moderation, multiplayer, or shared-world
  dependency.
- No prototype state survives Reset, reload, or navigation.
- This branch and draft pull request are authorized. Merge, deployment, and
  public exposure are not.

The Loose Signal harness and the earlier Fractured Gate implementations remain
historical mechanics references only. Their action queue, opposed planning,
Pivot, Lock, global Tempo phases, paid-action cap, and player-facing Settle do
not control this prototype.

## Owner comprehension correction

The first natural owner playtest established that the prototype was somewhat
playable but did not adequately explain:

- what the mission was;
- what the player was doing to selected objects;
- why those objects existed;
- what benefits and disadvantages an interaction created;
- why the enemies were moving; or
- that **Controller** was a hostile systems unit rather than an operable
  controller object.

That is player evidence of a comprehension failure, not a balance finding.
The battle rules remain unchanged. The interface now provides:

- one persistent mission brief with the win condition, loss conditions,
  optional goals, and the immediate next useful step;
- an east-side **MISSION TARGET** badge on the Gate;
- a consistent red enemy outline plus an explicit enemy-role label on every
  hostile piece;
- a purple **YOUR BUILD SOURCE** marker for the selected build's optional
  tactical opportunity;
- selected-focus explanations for **What it is**, **Why it matters**,
  **How to use or answer it**, and **Risk / tradeoff**;
- an explicit warning that Controller is an enemy unit, not a console;
- the complete Actuator → target nearby enemy → Bollard Output interaction
  chain;
- visible action descriptions and separate **AVAILABLE** or **NOT READY**
  reasons before commitment;
- a plain-language consequence on End Turn that enemies act next while held
  Command remains available for legal Responses; and
- a pre-commit statement of the expected effect and what can go wrong.

These additions are implementation responses to the owner finding. They still
require a second natural playtest before comprehension can be claimed.

## What is implemented

The player sees one continuous, angled isometric battlefield. Every visible
walkable surface is filled with edge-sharing diamond floor spaces. The
footprint determines the number of diamonds; neither the rules nor the UI
targets or advertises a fixed count.

The physical location contains:

- the West Exit and broad opening floor;
- central cover and rubble;
- a raised walk with a real broken span;
- a lower service trench and powered track;
- the Cracked Divider;
- the Gate Actuator and defensive bollard;
- the service gap, shutter, and lift relay;
- the optional Field Cache; and
- the three-Stability Fractured Gate.

The four enemies are independently positioned pieces:

| Enemy | Battlefield responsibility |
| --- | --- |
| Breacher | Physical Gate pressure and close contact |
| Guard | Protection, interception, and lane control |
| Controller | Machinery, closure, reset, and objective interruption |
| Pressure | Ranged pressure, flanks, Cache, and exit relationships |

Each enemy retains its own fixed 12-card deck, hand, position, Condition,
Guard, and state. All four share one visible Command pool.

## Alternating-turn loop

The normal interaction is:

`Your Turn → immediate board updates → End Turn → adaptive Enemy Turn → Your Turn`

During Your Turn:

1. Select the character, a floor diamond, enemy, or physical object.
2. Reachable diamonds illuminate from the character's current position.
3. Select a destination to preview its connected route, movement cost,
   terrain, and remaining allowance.
4. Execute movement or a legal contextual action immediately.
5. The battlefield updates before the next choice.
6. Continue while movement, Command, cards, sources, and legal state permit.
7. Select **End Turn** and bank the Command that remains.

During the Enemy Turn:

1. The formation evaluates the player's completed turn.
2. A chosen action, actor, target, and path become visible only when that
   action begins.
3. A legal player Response opens when applicable.
4. The action resolves and updates the board.
5. Any number of enemy bodies may act while the shared pool and specific
   legality permit.
6. When the formation banks its remainder, the next Player Turn begins.

There is no permanent enemy route, target arrow, intended card, or destination
forecast. Hacking and other authored reveal effects expose a current
priority read with an explicit warning that the read can change.

## Command

The current test values are:

- start at 16;
- gain 16 at the beginning of later Player Turns;
- bank to a maximum of 32;
- retain Command during the Enemy Turn for legal Responses; and
- use one visible shared pool for the enemy formation.

There is no universal paid-action limit and no one-Main-Action rule. A side
may make as many legal expenditures as its Command, cards, position, source
state, and specific restrictions allow.

Spam prevention is attached to the relevant action:

- weapon heat blocks a second basic attack that turn;
- Guard establishes one state instead of stacking;
- each enemy scan is once per target per turn;
- Refocus is once per turn;
- cards leave the hand when used;
- environmental Output changes or spends its source;
- Field Patch is once per encounter; and
- no repeatable zero-cost operation changes battle state.

This allows the proof to show both an ordinary 16-Command turn and a banked
32-Command combination containing more than four expenditures.

## Movement

Ordinary movement costs no Command. Its allowance is a current tuning value
derived from the ordered build, and may be split around paid actions.

The values are deliberately provisional. They exist to compare pacing and
starting distance; they are not a universal movement rule or a locked balance
decision.

Movement:

- crosses only shared diamond edges or a prepared physical connection;
- may turn naturally through any legal connected route;
- pays extra movement through rubble;
- cannot pass through occupied or blocked spaces;
- shows the whole currently reachable set; and
- enables source-bound route context such as **Follow Through** only when the
  actual approach created it.

## Tempo and Clash

Tempo remains a foundational mechanic. It is not a global phase sequence and
does not limit how many actions a side may buy.

An unopposed action resolves normally. When an action meets a legal Response,
interception, counter, or contested source, that local event compares Fast,
Standard, or Slow:

- the faster effect resolves first;
- equal Tempo resolves simultaneously; and
- the slower effect follows only if it remains legal.

Clear, rubble, and powered approaches can change the local comparison. The
preview reports visible route effects and only the number of concealed enemy
factors. Exact enemy responses stay hidden until commit.

`CLASH` is the focused presentation for meaningful physical opposition. It is
not the whole battle system.

## Cards and sources

Every card identifies its role:

| Role | Use |
| --- | --- |
| Action | Performs its own paid battle action |
| Modifier | Attaches to a compatible action |
| Response | Spends held Command during a legal enemy trigger |
| Context | Exists only because the current battlefield relationship created it |

Selecting an enemy or object shows only currently relevant actions and
compatible cards. There is no permanent row of abstract global action
buttons.

The selected ordered build also names its physical source, required setup,
what the Major discipline reveals or establishes, and what the Minor
discipline enables.

| Ordered build | Physical source-to-effect chain |
| --- | --- |
| Battle / Exploration | Contact breaches the Divider → Exploration recognizes a usable two-way route |
| Exploration / Battle | Exploration prepares the upper span → Battle protects its contested landing |
| Battle / Hacking | Contact exposes the Breacher's regulator → Hacking suppresses its reset |
| Hacking / Battle | Hacking establishes Actuator Control → Battle converts bounded bollard Output |
| Exploration / Hacking | Exploration prepares the service relationship → Hacking suppresses its shutter |
| Hacking / Exploration | Hacking aligns the lift → Exploration identifies and deploys the safe temporary crossing |

Builds without a particular opportunity do not receive a gray class-locked
copy of it.

## Slow Gate Work

**Stabilize Gate** is Slow Work:

1. The player must physically stand beside the Gate.
2. Starting Work costs its printed Command and does not end the battle.
3. The player ends the turn and the formation adapts.
4. Controller can directly interrupt unprotected Work with **Static Tax**.
5. **Objective Brace** protects the first direct interruption.
6. Work completes only after the Enemy Turn ends while the player still has
   legal access and the Gate remains intact.
7. Completion, Gate loss, defeat, or retreat ends the battle immediately.

There is no player-facing Settle screen. Draw, banking, hazards, temporary
geometry reset, and turn transition happen automatically.

## Exact private owner review

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/world/playtest`.

### Natural comprehension retest

Do not use the mechanical proof scripts below at first. Load or Reset the
encounter and play naturally for several turns.

1. Without reading this document, identify the mission, how the battle is won,
   and the two ways it can be lost.
2. Identify the Gate as the required target, the purple marker as an optional
   build opportunity, and every red-outlined piece as an enemy.
3. Select **Controller** and confirm the panel immediately says it is an enemy
   systems operator, not a console, and explains why leaving it active is
   dangerous.
4. Select the Gate, Actuator, Bollard, Divider, Relay, Service Gap, Cache, and
   Exit. Confirm each answers what it is, why it matters, how to use it, and
   the tradeoff even when no action is currently legal.
5. Select at least one legal and one blocked action. Confirm both explain the
   intended effect, while the blocked action separately states what is
   missing.
6. Before pressing **Execute now**, confirm the preview plainly states the
   expected result, cost, remaining resources, and known risk.
7. Before pressing **End Turn**, confirm it is clear that enemies act next and
   that retained Command remains available for legal Responses.

Record anything that still requires guesswork. Do not infer comprehension from
the automated checks.

### Continuous-board and 16-to-32 Command proof

1. Confirm the header says private, solo, noncanonical, and resettable.
2. Confirm the board is one physical field of edge-sharing diamonds, with no
   named-section movement buttons or fixed tile-count label.
3. Select the player. Confirm all currently reachable destinations illuminate
   with their movement cost.
4. Select the accessible floor diamond `6,6`, inspect the connected route, and
   execute. Confirm movement falls while Command remains `16`.
5. Select the player, execute **Establish Guard** for 4, then use the remaining
   movement on another legal diamond. Confirm movement is split around the
   paid action.
6. Reset. End the opening turn without spending. Watch Guard and Breacher act
   from one shared enemy pool. Confirm the next Player Turn begins at `32/32`
   Command.

### More-than-four-action proof

1. Reset and choose **Hacking / Battle**.
2. End the opening turn without spending and wait for Turn 2 at `32/32`.
3. Select and **Scan behavior** on Breacher, Guard, Controller, and Pressure.
   Confirm each 4-Command action resolves immediately and displays a
   skill-revealed current read rather than a locked path.
4. Select the player and execute **Establish Guard**.
5. Use **Refocus** on one card.
6. Confirm six paid expenditures completed, 8 Command remains, and no
   paid-action counter appeared.

### Hidden adaptive action and off-turn Response proof

1. Reset to **Battle / Exploration**.
2. Move to accessible floor diamond `6,6`, then End Turn.
3. On Turn 2, move to accessible floor diamond `10,6`, then End Turn.
4. Confirm no target or path is shown while the formation evaluates.
5. Confirm Pressure's actor, Needle Volley target, and relevant path appear
   only as the action begins.
6. Choose **Fallback Guard** in the Response window.
7. Confirm 4 banked Command is spent and the Local Tempo result reports the
   Fast Response before the Standard incoming effect.

### Local Tempo and build-source proof

1. Reset to **Battle / Hacking**.
2. Approach the Breacher and select **Expose regulator** when contact is
   legal.
3. Attach **Brace Through** and inspect the preview.
4. Confirm the preview names one concealed factor but not **Impact Counter**.
5. Execute. Confirm the response is revealed at commit, the local Tempo order
   is shown, and the meaningful contact produces a `CLASH`.
6. Repeat with clear, rubble, and powered approaches. Confirm their visible
   route causes change the local Tempo comparison without changing Command.
7. Cycle through all six ordered builds and confirm the highlighted build
   source, `Revealed by`, `Enabled by`, setup, and resulting physical state
   differ.

### Slow Work proof

1. Continue until the player is beside the Gate on a later turn and Controller
   has drawn **Static Tax**.
2. Start unprotected **Stabilize Gate**, then End Turn. Confirm the Work status
   remains active until Controller reveals the direct interruption; confirm
   the Gate returns to unstable rather than awarding a result.
3. Reset and repeat with **Objective Brace** attached.
4. Confirm the first Static Tax consumes the protection, the enemy formation
   continues its legal turn, and the Gate stabilizes only after that Enemy
   Turn ends with access intact.
5. Confirm Results report objective truth, player and enemy states, Cache,
   environment, turning point, and tradeoff.
6. Select **Reset Same Initial State** and confirm the original seed, build,
   board, hand, pools, and positions return.

### Input and presentation checks

1. Complete representative movement, action, card, Response, End Turn, Results,
   and Reset interactions using pointer controls.
2. Repeat representative interactions with Tab, Enter, and Space. Confirm every
   focused control has a visible outline.
3. At `390 × 844` CSS pixels, confirm action, card, object, and piece controls
   remain at least `44 × 44` CSS pixels. The board may pan, but diamonds remain
   usable.
4. Enable **Reduce motion**. Confirm animation stops and enemy actions become
   manually stepable without hiding state.
5. Confirm state never depends on color alone: reachable movement costs,
   selected routes, `REVEALED`, `ACTING`, `BUILD SOURCE`, card roles, pips,
   text, borders, and shapes carry the same meaning.

## Automated validation

```bash
node --test tests/barcode-world-fractured-gate.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused suite covers the owner-revised source identity, continuous filled
floor topology, skill-based split movement, 16-to-32 banking, a six-expenditure
turn, hidden adaptive enemy choices, multi-enemy shared Command, off-turn
Responses, causal Tempo order, concealed-response boundaries, explicit card
roles, all six source-to-effect chains, Slow Gate Work, immediate retreat,
deterministic reset, mission/focus/action guidance, Controller identity,
production gating, persistent-system isolation, semantic input, non-color
cues, touch targets, reduced motion, and core text contrast.

These are implementation checks, not player evidence. They do not establish
comprehension, balance, fun, accessibility, or replay value.

## Post-merge deployment and focused evidence

No merge or manual deployment is authorized or initiated by this draft. If a
future authorized merge causes normal `main` automation to deploy:

1. Request `<production-origin>/world/playtest` and verify an HTTP 404 with
   no-store and robot-exclusion headers.
2. Inspect production navigation and `/sitemap.xml`; verify neither contains
   `/world/playtest`.
3. Inspect returned production HTML and discoverable route metadata; verify no
   Fractured Gate title, board content, client chunk reference, or public link
   is exposed.
4. Confirm normal public routes still render their existing site chrome and
   live-provider behavior.
5. In an authorized local development environment, record the exact focused
   evidence above:
   - movement spent without Command;
   - `16 → 32` banking;
   - six paid expenditures with 8 Command remaining;
   - hidden intent becoming visible only at action start;
   - one off-turn Response and its local Tempo order;
   - multiple enemy bodies spending one shared pool;
   - unprotected versus Objective-Braced Slow Gate Work; and
   - Reset reproducing the same initial state.
6. Label all captures **implementation evidence**. Keep future moderated
   comprehension, balance, fun, accessibility, and replay observations
   separate. Do not expose or promote the private prototype without a new
   owner decision.
