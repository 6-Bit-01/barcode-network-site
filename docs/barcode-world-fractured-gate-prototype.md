# BARCODE World Battle Mode: Fractured Gate — Live Circuit

Status: **PRIVATE, DISPOSABLE OWNER-REVIEW PROTOTYPE**

Route: `/world/playtest` in local development only.

Live Circuit is the unconstrained Battle Mode experiment. It keeps BARCODE
World's Command, Tempo, builds-as-tactical-expression, and cyber-industrial
identity, but it is not a canonical encounter or a commitment to final rules.

## The encounter

The mission remains:

`POWER 2 ANCHORS → REACH THE GATE → SURVIVE 1 ENEMY TURN`

The board is now a 154-cell irregular battlefield instead of a small collection
of widely separated diamonds. Every edge-sharing cell is drawn in one
continuous SVG mesh, with terrain and live circuit lines integrated into the
floor.

Three routes cross-connect:

- **Upper catwalk:** high ground, a Field Cache, hardlight bridge access, and
  TRACE sightline pressure.
- **Relay yard:** cover racks, rubble, a volatile Power Cell, and a Cracked
  Divider that can become a breach for both sides.
- **Service trench:** a longer low route with a strike track that becomes a
  movement lane and push hazard after its Anchor is powered.

The two Anchors are not interchangeable switches:

- Anchor I opens the missing hardlight bridge on the upper approach.
- Anchor II powers the lower track, reducing movement cost and turning SHUNT
  collisions on the track into arc stuns.

## Tactical language

Terrain communicates advantages directly on the board:

| Terrain | Consequence |
| --- | --- |
| High catwalk | +1 ranged reach and +1 BITCRUSH damage downhill |
| Light/heavy cover | Reduces incoming ranged damage by 1/2 |
| Server racks | Block movement and line of sight |
| Rubble | Costs 2 movement and slows local Tempo |
| Powered track | Costs 0.5 movement, boosts local Tempo, and enables arc stuns |
| Cracked Divider | Blocks the center until breached; the breach helps both sides |
| Power Cell | Local radius-two blast; damages only units actually nearby |

Enemy intent arrows remain visible, but every enemy now has a spatial job:

| Enemy | Job |
| --- | --- |
| RAM | Charges the Gate, body-checks nearby players, and destroys Gate locks |
| WARDEN | Interposes, shields RAM, bashes, and ejects an exposed Gate holder |
| JAMMER | Moves into a real line-of-sight tether, drains Anchors, and taxes cards nearby |
| TRACE | Repositions to high sightlines and punishes exposed lanes |

Enemies physically move, occupy routes, and update their plans after the
player changes the battlefield. They cannot overlap actors or attack through
blocked sightlines.

## Direct controls

1. Click a glowing blue cell to move.
2. Click a card.
3. Click a glowing target. On touch, tap the target again after preview.
4. Click an adjacent Anchor, Cache, Exit, or Gate to operate it.
5. Read intent arrows on the battlefield, then click **End Turn**.

There is no sidebar, page-length action menu, build dropdown, or battle log.
The objective, board, five cards, Command, and End Turn control occupy one
fixed-height cockpit.

| Card | Cost | Tempo | Effect |
| --- | ---: | --- | --- |
| BITCRUSH | 4 | Fast | 2 damage, +1 downhill; interrupts slower intent |
| SHUNT | 5 | Standard | 1 damage and push 2; collisions, ledges, and live track add impact |
| SKIP//STEP | 3 | Fast | Shift up to 3 cells without spending ordinary movement |
| FIREWALL | 4 | Fast | +4 Shield and prevent the first displacement |
| OVERLOAD | 8 | Slow | 4 damage, breach the Divider, or rupture the local Power Cell |

## Current economy

- 16 Command at the start.
- Bank unused Command and gain 16 next turn, capped at 32.
- No universal action-count cap.
- Each card may be used once per Player Turn.
- One skill-derived range-five movement per Player Turn.
- Command, cards, position, terrain, sight, and current object state determine
  what a turn can contain.
- Tempo is compared only when an action meets a current enemy intent.

These remain test values.

## Private boundary

- Development-only route.
- Production returns an empty no-store/noindex 404 before page output.
- Absent from navigation and sitemap.
- Solo, deterministic, resettable, noncanonical, and memory-only.
- No API, account, profile, inventory, progression, rewards, queue, BNL,
  Journal, Relay, Memory, multiplayer, or shared-world dependency.
- No state survives Reset, reload, or navigation.
- Draft PR and private owner testing are authorized.
- Merge, deployment, and public exposure are not authorized.

## Owner launch

Open Command Prompt on Windows and paste the entire block:

```bat
cd /d "%USERPROFILE%\Desktop\BARCODE-World-Test-287"
git fetch origin
git switch agent/fractured-gate-alternating-turns
git pull --ff-only origin agent/fractured-gate-alternating-turns
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3007
```

Then open `http://127.0.0.1:3007/world/playtest`.

Leave Command Prompt open while playing. Press `Ctrl+C` afterward.

## Natural owner test

Play without a technical checklist. The experiment succeeds only if:

- the complete desktop cockpit fits without page scrolling;
- the dense grid reads as one battlefield rather than scattered diamonds;
- the opening presents at least three credible routes;
- high ground, cover, rubble, sight blockers, hazards, and powered routes cause
  different decisions;
- the enemies visibly create problems instead of taking decorative walks;
- both Anchors change the map in distinct ways;
- movement, cards, pushes, interrupts, and object consequences are obvious;
- taking a safe route has a cost, and taking a fast route has a risk; and
- a completed battle creates an immediate desire to retry differently.

## Verification contract

Before updating the draft PR:

```bash
npm run check
npm run build
```

Focused evidence must include:

- 1366×768 one-screen render with 154 edge-sharing cells and no body scroll;
- touch/mobile horizontal board access without body overflow;
- upper, center, and lower route connectivity;
- high-ground, cover, rack, rubble, bridge, and powered-track rules;
- four distinct enemy behaviors and physical movement;
- Command banking, Jammer taxation, and local Tempo;
- local Cell blast and two-way Divider breach;
- Anchor drain, Warden Gate ejection, victory, defeat, retreat, and Reset;
- production `/world/playtest` empty no-store/noindex 404; and
- route absence from navigation and sitemap.

After any separately authorized merge, repeat the production-boundary checks
before considering deployment evidence complete.
