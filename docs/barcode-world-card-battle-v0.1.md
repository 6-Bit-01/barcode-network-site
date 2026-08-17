# BARCODE World: four-lane card-battle v0.1

> Historical checkpoint. The active owner-review contract is
> `docs/barcode-world-three-route-v0.3.md`.

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

## Owner play evidence — 2026-08-14

The first owner play established three useful player-facing results:

- The card-battle concept feels substantially better than the superseded
  tactical prototype and showed a credible fun concept.
- The presentation looked good on mobile, which validates the prototype's
  basic mobile direction.
- The four-lane structure itself was appealing enough to continue testing.

The same play exposed two blocking clarity failures:

- **Strategic legibility failed.** Lane placement felt random because the
  benefit or disadvantage of each available lane was not clear before the
  owner committed a card. That prevented deliberate strategy and a sense of
  control.
- **Causal resolution failed.** The Breacher's actions and the result of each
  clash were not clear after Resolve. The visible experience was primarily the
  Pressure meter moving without a readable explanation of what caused it.

The first clarity pass made the locked plan and exact resolution inspectable.
The next owner reviews established the correct hierarchy and then exposed a new
problem: the card-first revision still used too many words.

The controlling concise-surface contract is:

- The four lanes remain above the hand and embed Breacher intent. There is no
  separate enemy-plan wall.
- The board and hand carry no permanent instructional paragraphs. Idle lanes
  remain quiet.
- The board uses one `BREACHER INTENT` heading with a separate `LOCKED` state.
- Each card shows cost, Power, Health, state, and one compact
  `trigger → effect` rules line. There is no separate visible `TRADEOFF` row.
  Exact printed semantics remain available to assistive technology.
- Selection adds one short banner and one shared legend:
  `PRESSURE THIS RESOLVE · NOT CARD VALUE`.
- Each candidate lane shows the signed Pressure movement that the complete
  Resolve will actually produce, its actor, gradient endpoints, one compact
  immediate outcome, and no more than two exceptional chips such as `LATER`,
  `REPLACES`, `LEAVES`, `BREAK`, or `WIN`.
- Outflank-source and replacement consequences take priority inside that
  two-chip budget. A projected Scout draw reads `LATER · DRAW 1`; after Resolve,
  the compact recap states the completed event as `DREW 1`.
- Exact candidate semantics remain in an accessible name or description and
  collapsed details. They are not repeated as visible prose across four lanes.
- The visible round recap uses one compact line per lane plus signed Pressure
  sources and net movement. Full event prose remains under `Round details`.
- The reference quality is Inscryption's player-facing economy: readable cards
  and simple play on the surface, with deterministic complexity underneath.
  This is an experience principle, not approval to copy unrelated mechanics.

Concise does not mean vague. The selected-placement signal uses the candidate
result's exact `pressureDelta`: the actual before-to-after movement produced by
resolving the complete staged plan. It is not a comparison with resolving no
new play. A placement that improves a bad position can still point toward the
Breacher if the full Resolve moves Pressure that way. Later and conditional
value remains separate from this Resolve's Pressure movement. Color carries no
meaning by itself, and no card or lane is graded as good, bad, or best.

This is bounded owner evidence for another clarity pass, not approval of the
current rules or balance. It does not establish durable fun, comprehension,
replay value, or final mobile accessibility. No rule changes, balance changes,
or unique lane properties have been approved or added. The next review must
test whether compact card cues, quiet lanes, candidate-only signals, and the
focused causal recap make the rules legible without becoming instructions or
solving strategy.

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

1. Confirm the compact boundary badges say `UNLISTED` and `IN MEMORY`, and the
   exact seed remains available under `OPTIONS`.
2. Confirm the upper scene depicts the Wayfinder and Breacher confronting each
   other rather than sitting at a card table.
3. Confirm the four-lane board appears above `YOUR HAND`. Its only plan heading
   is `BREACHER INTENT` with a visible `LOCKED` state. Each lane embeds the
   Breacher card that will act there and uses only `NEXT`, `ACTIVE`, or `OPEN`
   for its compact lane state; there is no separate enemy-plan wall or permanent
   board/hand instruction paragraph.
4. Before selecting a card or Outflank destination, confirm lanes remain quiet:
   cards and locked intent are visible, but candidate signals and forecast prose
   are absent.
5. Confirm each card shows cost, Power, Health, state, and one compact
   `trigger → effect` line. There is no visible `TRADEOFF` row. Its accessible
   name or description retains the exact printed ability.
6. Select a card. Confirm one short selection banner and one shared
   `PRESSURE THIS RESOLVE · NOT CARD VALUE` legend appear. They are not
   repeated inside each lane.
7. Confirm each legal candidate lane shows the full Resolve's actual signed
   Pressure movement as `+N · YOU`, `-N · BREACHER`, or `0 · EVEN`, with its
   marker on the `-5...+5` red-yellow-green scale and labeled actor endpoints.
   It also gives one compact lane outcome; no lane shows a result paragraph or
   a comparison against resolving with no new play.
8. Find a draw, replacement, Outflank, Break, or other exceptional case. Confirm
   it adds no more than two short chips, with later or conditional value separate
   from this Resolve's Pressure. Confirm `LEAVES` and `REPLACES` survive that cap
   ahead of lower-priority chips, a projected Scout draw says `LATER · DRAW 1`,
   and its resolved compact recap says `DREW 1`. Full candidate semantics remain
   available through an accessible description or collapsed details.
9. Place the card and repeat while Command allows. Confirm idle lanes become
   quiet again and the same four lanes remain above the hand without inventing
   unique lane bonuses.
10. Activate `RESOLVE`. Confirm its accessible name still says all four lanes
   resolve, focus moves to the round review, and the presentation makes clear
   that all four lanes resolved simultaneously.
11. In the compact round review, account for every signed lane or card-effect
   contribution and the net before-to-after value. Confirm the visible recap is
   one compact line per lane and full event prose stays collapsed under
   `Round details` until requested.
12. Continue until a Break. Verify the round review explains that the clash
   completed, all active cards withdrew, Pressure remained, and the next round
   starts on an empty board.
13. Use Outflank on a card that survived a prior round. Verify it moves to an
   open lane, the angle changes, and its temporary +1 Power is named in review.
14. Complete a battle and inspect Results. Replay Same State and verify the seed,
   deck order, enemy decisions, and opening return exactly. Try New Shuffle and
   verify a new seed and opening.

### Input and accessibility check

1. Complete one round with pointer controls and one with Tab plus Enter/Space.
2. At `390 x 844` CSS pixels, repeat card selection, lane placement, Outflank,
   `RESOLVE`, focused review, and replay with touch-equivalent
   controls. Confirm the board-before-hand order, embedded locked intent,
   compact card cues, selection-only signals, and causal summary are readable
   without precision taps or losing the active lane context.
3. After Resolve, confirm focus and the viewport arrive at the round review
   rather than leaving the explanation above or below the visible mobile area.
   Confirm `Round details` can be expanded and collapsed by keyboard and touch.
4. Confirm visible focus never disappears and state uses actor names, signed
   values, endpoint labels, short exceptional chips, borders, shapes, and icons
   in addition to the red-yellow-green scale. Confirm the same placement meaning
   and actual Resolve movement remain available when color cannot be perceived.
5. Confirm compact visible cues do not remove exact semantics: card and candidate
   descriptions expose full rules, collapsed details work by keyboard and touch,
   and essential information is never available only through hover.
6. With a screen reader, confirm the Pressure control exposes meter semantics,
   current value, minimum, maximum, and its described Break/side meaning. Confirm
   the focused round summary announces once rather than each lane competing in
   separate live regions.
7. Enable Reduce motion and also test the operating-system reduced-motion
   preference. Confirm animation and smooth focus scrolling stop while stance,
   lane, clash, Pressure, destruction, Break, compact round result, and signed
   Pressure explanation remain complete and readable.

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
legal locked hand-blind enemy previews, card-first printed truth, board-before-
hand order, embedded intent, candidate-only placement signals, exact resolver
reuse, actual candidate `pressureDelta`, the full `-5...+5` signal scale,
concise visible-copy structure, accessible exact semantics, bounded and
priority-ordered exception chips, separated later/conditional value, projected
versus resolved Scout wording, compact causal recap, collapsed resolution
detail, exact replay, causal scene cues, production
isolation, semantic controls, focus, touch targets, non-color cues, reduced
motion, and protected-system boundaries.

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
