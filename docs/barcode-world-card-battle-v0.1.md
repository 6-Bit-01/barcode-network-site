# BARCODE World: four-lane card-battle v0.1

Status: **UNLISTED OWNER-REVIEW RESEARCH PROTOTYPE**

Controlling direction:
`BARCODE_WORLD_CARD_BATTLE_TRANSITION_AND_WORK_HANDOFF_2026-08-12_REV1`

Owner-review route: `/world/playtest`

This is a bounded Battle Mode proof inside the larger website-based BARCODE
World persistent shared-world MMORPG / sandbox RPG. Cards are the player's
control language; the upper scene shows the character and Breacher physically
performing the chosen attacks, blocks, routes, impacts, and Pressure changes.
The characters are not literally playing a tabletop card game.

## Hard boundary

- Solo, deterministic, resettable, noncanonical, and held only in memory.
- The exact card-battle PR branch may render on its unlisted Vercel Preview URL
  for owner review. The real production site and every other production build
  return an empty, no-store 404 before page metadata or client-chunk references
  are emitted; the page retains a `notFound()` fallback.
- The route remains absent from public navigation and the sitemap.
- Public chrome and shared live/BNL polling remain inert on this exact route.
- No API, account, profile, database, inventory, reward, economy, progression,
  queue, BNL, Relay, Journal, Memory, moderation, multiplayer, canon, or
  shared-world dependency.
- No prototype state survives Reset, reload, or navigation.
- The preview is unlinked, noindex, noncanonical, and nonpersistent. It is not
  an access-controlled secret: the repository source and anyone-given-the-URL
  preview remain visible. No merge or production deployment is authorized.

The Loose Signal and Fractured Gate implementations remain historical mechanics
references only. Their tactical tiles, pathing, movement, ranges, collision,
Fast/Standard/Slow timing, 16/32 Command economy, opposed planning, six-build
scope, objectives, equipment, Conditions, Guard, rescue, and party rules are
not part of this prototype.

## Implemented battle loop

The duel uses four fixed lanes and one shared Pressure track from enemy `-5` to
player `+5`.

1. Both sides gain 3 Command, capped at 6. After round one, each draws one card.
2. The Breacher's seeded AI uses only its own hand, zones, Command, and public
   board. It locks exact card-and-lane previews before the player acts.
3. The player may place any affordable cards into open lanes or replace a
   friendly active card. Replaced cards are discarded without destroy effects.
4. Once per battle, Outflank may move a friendly card that survived a prior
   round into an open lane and grant +1 Power for that clash.
5. Resolve calculates all four lanes from the same pre-clash state. Opposed
   cards damage each other; unblocked Power moves Pressure. Damage persists.
6. Destroyed cards and printed effects settle, then the causal round review and
   battle-scene reactions identify what moved Pressure and why.
7. Reaching either end of the track wins. Otherwise, crossing either armed
   `+3` or `-3` Break mark finishes the clash, clears every active card to its
   discard, retains Pressure, and forces both sides to rebuild. Break rearms
   only after Pressure returns to `-2...+2`.

Each side has twelve cards: six exact designs with two copies each. Opening
hands contain five cards, later rounds draw one, hands have no size limit, and
an empty draw pile deterministically reshuffles its discard.

## Card sets

### Battle / Exploration

| Card | Cost | Power | Health | Ability |
|---|---:|---:|---:|---|
| Hold Ground | 1 | 1 | 3 | +1 Power while blocked. |
| Scout Route | 1 | 1 | 2 | Draw one card when destroyed. |
| Intercept | 2 | 2 | 2 | +1 Health when played opposite a previewed enemy. |
| Flank | 2 | 2 | 2 | +1 Power while unblocked. |
| Linebreaker | 3 | 3 | 3 | Shift Pressure +1 when it destroys an enemy card. |
| Last Opening | 3 | 2 | 3 | If behind when played, gain +1 Power and +1 Health. |

### Breacher

| Card | Cost | Power | Health | Ability |
|---|---:|---:|---:|---|
| Rush | 1 | 1 | 1 | +1 Power while unblocked. |
| Brace | 1 | 1 | 3 | +1 Health if opposed when it enters. |
| Bruiser | 2 | 2 | 3 | +1 Power while blocked. |
| Breaker | 2 | 2 | 2 | Deals +1 damage to opposing cards. |
| Enforcer | 3 | 3 | 4 | Reduce the first damage it receives by 1. |
| Last Push | 3 | 3 | 2 | If behind when played, gain +1 Power and +1 Health. |

Every design has two copies. One Bruiser starts active in the documented fixed
lane; the enemy opening hand is drawn from the remaining eleven cards.

## Determinism and AI tuning

The engine uses a declared seed and separate deterministic random streams for
player shuffle, enemy shuffle, enemy AI ties, and discard reshuffles. Replay
Same State recreates the identical opening. New Shuffle advances to a visibly
different seed without writing it anywhere.

The Breacher scores only legal affordable plays. Its bounded prototype weights
favor contesting an occupied player lane, then open-lane Pressure, printed
stats, and efficient Command use; seeded tie-breaking chooses among equal
scores. At neutral Pressure it commits at most one card, while behind it may
commit two and while ahead it banks Command. It may replace its own card when
that legal play scores higher. Exact weights and placement limits live beside
the engine and are test/tuning values, not final game law.

The checked-in machine artifact runs 1,000 fixed-seed battles with a simple,
declared deterministic player policy. It is a reproducibility and gross
deadlock/snowball smoke check only. It is not comprehension, accessibility,
balance, fun, or desire-to-replay evidence.

## Exact owner review

Open the current PR preview directly:

<https://barcode-network-site-cpps-git-agent-barc-521e00-6-bits-projects.vercel.app/world/playtest>

The same review can also be run locally.

Requirements: Node 20.9 or newer and npm.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/world/playtest`.

### First-read check

1. Confirm the page says `UNLISTED PREVIEW`, `SOLO`, `RESETTABLE`, `NONCANONICAL`, and
   `IN MEMORY`, and shows the exact seed.
2. Confirm the upper scene depicts the Wayfinder and Breacher confronting each
   other rather than sitting at a card table.
3. Confirm one Bruiser begins active, both sides gained 3 Command, the Breacher
   preview is already locked, its remaining bank reflects any preview spend,
   and the four lanes are readable without opening instructions.
4. Confirm every hand card shows cost, Power, Health, and one short ability.
5. Select a card, then a legal lane. Verify the matching upper-scene actor and
   stance appear. Repeat while Command allows.
6. Resolve. Verify opposed cards visibly clash, unblocked cards visibly press,
   damage remains on survivors, and the Pressure movement names its causal lane.
7. Continue until a Break. Verify the complete clash is reported, all active
   cards withdraw, Pressure remains, and the next round starts on an empty board.
8. Use Outflank on a card that survived a prior round. Verify it moves to an
   open lane, the angle changes, and its temporary +1 Power is named in review.
9. Complete a battle and inspect Results. Replay Same State and verify the seed,
   deck order, enemy decisions, and opening return exactly. Try New Shuffle and
   verify a new seed and opening.

### Input and accessibility check

1. Complete one round with pointer controls and one with Tab plus Enter/Space.
2. At `390 x 844` CSS pixels, repeat card selection, lane placement, Outflank,
   Resolve, review, and replay with touch-equivalent controls.
3. Confirm visible focus never disappears and state uses text labels, borders,
   shapes, and icons in addition to color.
4. Enable Reduce motion. Confirm animation stops while stance, lane, clash,
   Pressure, destruction, and Break causes remain readable.

## Automated validation

```bash
node --test tests/barcode-world-card-battle.test.mjs \
  tests/barcode-world-boundary.test.mjs
npm run check
npm run build
```

The focused suites cover exact decks and zones, seeded shuffles and reshuffles,
opening/draw rules, Command banking, legal placements and replacement,
on-entry abilities, simultaneous damage, persistent Health, Pressure and
Linebreaker effects, victory-before-Break, Break clearing/rearming, Outflank,
legal locked hand-blind enemy previews, exact replay, causal scene cues,
production isolation, semantic controls, focus, touch targets, non-color cues,
reduced motion, and protected-system boundaries.

These are implementation checks, not player evidence. They do not establish
comprehension, balance, fun, accessibility, or replay value.

## Post-merge deployment and focused evidence

No merge or manual deployment is authorized or initiated by this branch. If a
future owner decision merges it and normal `main` automation deploys the site:

1. Request `<production-origin>/world/playtest`; verify an empty HTTP 404 with
   `Cache-Control: no-store, max-age=0` and the full `X-Robots-Tag` boundary.
2. Confirm production navigation and `/sitemap.xml` contain no playtest link or
   card-prototype content, title, metadata, or client-chunk reference.
3. Confirm ordinary homepage, queue, BNL, Journal, Database, Radio, and admin
   routes retain their existing chrome and behavior.
4. In an authorized local development environment, run the exact first-read,
   battle, replay, pointer, keyboard, touch-equivalent, and reduced-motion paths
   above against the merged commit.
5. Record the seed, decisive causal review, Break behavior, final result, and
   same-state replay equality as implementation evidence. Keep owner
   comprehension, balance, fun, and desire-to-replay evidence separate.
