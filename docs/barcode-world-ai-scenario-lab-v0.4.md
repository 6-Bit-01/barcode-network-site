# BARCODE World: enemy AI + scenario laboratory v0.4

Status: **UNLISTED OWNER-REVIEW PLAYABLE CHECKPOINT**

Owner-review route: `/world/playtest`

v0.4 extends the frozen v0.3 battle foundation without replacing its visual
language, card-first controls, three neutral routes, or one-Wayfinder theater.
This checkpoint asks two bounded questions before character classes and
loadouts are introduced:

1. Can enemies create readable, consequential pressure from public battle
   state rather than fixed scripts or hidden information?
2. Can one battle grammar support materially different goals without inventing
   a new permanent card vocabulary for every level?

The answer is strong enough to proceed. The AI is deterministic and
role-readable, two new mission recipes run on the same card and theater engine,
and paired simulations now show a clear advantage for intentional play over
blind card selection.

## Frozen foundation

The exact v0.3 checkpoint remains preserved on
`agent/barcode-world-three-route-v0-3` at commit
`b629cf64304bcaf9406dd4f158647ae30b1fdd27`. v0.4 lives on the separate
`agent/barcode-world-ai-scenario-v0-4` branch.

The following v0.3 decisions remain locked:

- one physical theater with one Wayfinder and persistent enemy bodies;
- cards are categorized; Route A/B/C are neutral legal target choices;
- general cards remain reusable across scenarios while rare Context Cards come
  from a physical scene opportunity;
- Command Points bank, card placement shows its exact debit, and no played card
  automatically refills itself;
- resolution remains player actions, enemy response, then Round Result;
- Health, Guard, Control, probability, success, failure, and enemy intent stay
  distinct and visible;
- the established cyan/green/red/violet private-research surface is retained.

## Enemy decision contract

At the start of each planning phase, every living enemy chooses one intent from
the public theater state. Candidate scoring considers:

- graph distance and legal movement through the same theater connections shown
  to the player;
- enemy role, including advance, pursue, guard, pressure, control, disrupt, and
  breach behavior;
- the scenario's declared priority: pursue the Wayfinder, block an extraction
  point, attack a defended object, or disrupt the field;
- visible Health, Guard, prepared objects, exits, defended-object Integrity,
  and current positions;
- coordination with other enemies when their mission does not require a shared
  primary target.

The selected intent carries a human-readable reason and diagnostic score. It is
then locked for the player's planning phase, displayed on the theater actor,
and resolved only after the complete player plan. Planning is pure and
deterministic: identical seed and public state produce identical intents and do
not mutate the battle.

The prototype contains `basic`, `standard`, and `tactical` scoring profiles for
laboratory comparison. Only `standard` is treated as the current checkpoint
baseline. The paired evidence does **not** yet prove a reliable three-step
difficulty ladder, so the selector is intentionally not presented as a finished
player-facing feature.

## Scenario grammar

The existing Duel, Fractured Gate, and Coolant Extraction missions now share a
scenario contract with two new recipes:

| Mission | Goal | Enemy pressure | Distinct state |
|---|---|---|---|
| Sublevel Duel | Defeat the hostile or win declared Control | Direct pursuit and contact attacks | Health + Control |
| Fractured Gate | Seal the secured Gate or defeat all hostiles before round 12 | Rush, Gate hold, and scene disruption | Gate security + preparation |
| Coolant Extraction | Reach a clear South Lift or defeat the pursuit | Pursuit plus exit blocking | Secured extraction |
| Signal Holdout | Survive through round 8 or defeat the assault | Pursuit, Health pressure, and field disruption | Survival deadline |
| Archive Defense | Keep the Archive Core intact through round 7 or defeat the raid | Breachers converge on and assault the Core | Visible object Integrity |

Holdout and Defense use the same broad general cards as every other mission.
`Protect`, for example, targets the Archive Core because a protectable physical
object exists in the current theater; it is not an `Archive Protect` card.
Protection remains active for the complete enemy response. Withdrawal from
either mission is survival with the mission abandoned, never a victory.

Coolant Extraction also now requires the exit to be clear after the enemy
response. Merely stepping onto the South Lift while the Spine Breaker controls
it cannot accidentally end the mission.

## Exhaustion safety

Card scarcity remains authored rather than an automatic per-placement refill.
If a category has no ready card but still contains draw or discard inventory,
the player can recover one card into that empty category for free. If no legal,
affordable card or recovery exists anywhere, the only newly exposed control is
`YIELD INITIATIVE`. Yielding costs 1 Control, exposes the Wayfinder, permits the
enemy response, and advances the round. This is an explicit penalty state, not
a hidden refill or a simulation softlock.

## Paired simulation evidence

The checkpoint laboratory ran 60 identical seeds per policy for every mission
against the `standard` AI: **900 complete battles** total. `Deliberate` scores
the visible objective and danger; `random` selects a random legal card/target;
`first-legal` always takes the first available legal choice. Each battle could
run for at most 40 rounds.

| Mission | Policy | Player wins | Enemy wins | Withdrawals | Avg. rounds | Meaningful enemy actions |
|---|---:|---:|---:|---:|---:|---:|
| Sublevel Duel | Deliberate | 60 | 0 | 0 | 4.42 | 64.8% |
| Sublevel Duel | Random | 48 | 0 | 12 | 5.75 | 84.6% |
| Sublevel Duel | First legal | 37 | 0 | 23 | 4.82 | 81.5% |
| Fractured Gate | Deliberate | 16 | 35 | 9 | 10.58 | 74.4% |
| Fractured Gate | Random | 0 | 24 | 36 | 8.58 | 78.4% |
| Fractured Gate | First legal | 0 | 8 | 52 | 3.98 | 77.9% |
| Coolant Extraction | Deliberate | 25 | 35 | 0 | 10.60 | 92.6% |
| Coolant Extraction | Random | 1 | 59 | 0 | 8.23 | 93.5% |
| Coolant Extraction | First legal | 0 | 60 | 0 | 6.67 | 91.9% |
| Signal Holdout | Deliberate | 56 | 4 | 0 | 7.67 | 84.0% |
| Signal Holdout | Random | 27 | 29 | 4 | 6.10 | 88.5% |
| Signal Holdout | First legal | 22 | 38 | 0 | 5.65 | 85.9% |
| Archive Defense | Deliberate | 30 | 30 | 0 | 6.32 | 72.9% |
| Archive Defense | Random | 0 | 51 | 9 | 3.88 | 97.3% |
| Archive Defense | First legal | 0 | 57 | 3 | 4.03 | 91.7% |

Laboratory gates:

- **0 first-round victories** across all 900 battles;
- **0 stalled battles** and **0 unfinished battles**;
- deliberate play beat random play in all five missions by 20.0 to 50.0
  percentage points;
- Archive Defense produced the clearest intentionality test: deliberate play
  won 50%, while random and first-legal play won 0%;
- successful enemy actions changed Health, Control, position, or Integrity in
  64.8% to 97.3% of cases rather than merely displaying flavor intent.

A second paired matrix ran 40 seeds through all three AI profiles and all three
policies. It also produced zero first-round wins and zero stalls. Basic,
standard, and tactical frequently selected the same best action, which is why
difficulty remains an internal research axis rather than a claimed finished
feature.

## Verification contract

Focused regressions cover:

- deterministic public-state intent planning;
- role-readable enemy choices and scenario priorities;
- secured extraction after enemy response;
- Holdout victory only after the final enemy response;
- defended-object Integrity and full-response protection;
- category recovery and forced initiative yield;
- zero-stall, zero-first-round-win laboratory gates;
- intentional play outperforming blind policies in the two new mission types;
- all five scenarios terminating while exercising every card category.

Repository verification remains:

```bash
npm run check
npm run build
```

## Decision after v0.4

Enemy behavior and mission grammar now have enough evidence to stop being the
largest unknown. The next bounded checkpoint should add a small set of
character/loadout identities against these same missions, measuring whether
each changes decision shape rather than merely increasing numbers. Party play,
multiplayer, progression economy, and broad visual redesign remain out of
scope until that test is complete.
