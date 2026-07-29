# BARCODE World Battle Mode: Fractured Gate — Breachflow

Status: **PRIVATE, DISPOSABLE OWNER-REVIEW PROTOTYPE**

Route: `/world/playtest` in local development only.

Breachflow keeps the one-screen Live Circuit battlefield and replaces its
bookkeeping with a simple player-facing loop. It is a noncanonical experiment,
not a commitment to final combat rules.

## Mission

`REACH THE GATE → START THE LOCK → SURVIVE THE ASSAULT`

The Fractured Gate has three visible locks. RAM removes a lock only when a Gate
Smash actually lands. There is no passive round tax and neither Anchor is
required to win.

The battlefield remains a 154-cell irregular circuit floor with three
cross-connected approaches:

- **Upper catwalk:** high ground, a Field Cache, hard cover, and TRACE
  sightline pressure. The optional Bridge Anchor opens a real shortcut.
- **Relay yard:** racks, rubble, a volatile Power Cell, and a Divider that
  becomes a route for both sides when breached.
- **Service trench:** a longer covered approach. The optional Track Anchor
  turns its circuit rail into a fast route and a SHUNT stun hazard.

## Player-facing turn

The complete visible loop is:

1. Move before, between, or after actions.
2. Use two main actions.
3. Take any earned Context move before it disappears.
4. End the turn.
5. Respond if an enemy Commitment creates an Intercept window.

There is no Command, banking, carryover, income, shopping arithmetic, or
range-counting exercise. Movement is shown as six simple pips, actions as two
lights, and every attack paints its legal targets and exact footprint directly
onto the floor.

Terrain cost, line of sight, enemy planning, collision damage, elevation,
cover, and action timing still resolve deterministically underneath the
surface.

## First build: Battle → Exploration

The hardcoded test build uses this grammar:

`IMPACT CREATES OPENINGS · OPENINGS BECOME ROUTES`

SHUNT is the Battle action. When it displaces an enemy, the vacated cell gains a
short-lived **FOLLOW THROUGH** action. Taking it moves the player into that
space without using movement or a main action.

If SHUNT drives an enemy through the Cracked Divider, the stronger
**RIDE THE BREACH** action appears at the new opening. A generic OVERLOAD can
also destroy the Divider, but it does not create the build-specific payoff.

The opening expires when the player ends the turn. This makes the Major→Minor
chain visible and useful without adding a class panel or another resource.

Only Battle → Exploration is playable in this checkpoint. The other ordered
builds remain future design space and must eventually differ through visible
battlefield verbs and liabilities—not stat bonuses or long descriptions.

## Permanent actions

| Action | Board marking | Purpose |
| --- | --- | --- |
| BITCRUSH | `RNG` | Fast ranged pressure; stronger from high ground |
| SHUNT | `CON` | Contact force; push, collide, breach, stun, or drop |
| SKIP//STEP | `SHI` | Short terrain-ignoring reposition |
| FIREWALL | `SEL` | Brace, absorb damage, and prevent the first push |
| OVERLOAD | `BLA` | Heavy attack or visible system blast |

Action selection paints the relevant line, path, landing cell, push route, or
blast radius. Illegal actions use short causal labels such as `NO LEGAL TARGET`,
`STATIC FIELD BLOCKS SHIFT`, or `TWO ACTIONS SPENT`.

## Enemy turn

Four enemy bodies occupy the field, but the squad resolves only:

- one loud **primary Commitment**; and
- one rotating **support action**.

| Enemy | Battlefield job |
| --- | --- |
| RAM | Advances on the Gate, body-checks blockers, and smashes Gate locks |
| WARDEN | Shields, interposes, pushes, and ejects a Gate holder |
| JAMMER | Hunts powered machinery, blocks Shift/Intercept nearby, and sweeps lanes |
| TRACE | Claims sightlines and punishes exposed routes from high ground |

When no Anchor is powered, JAMMER can project a **Broadcast Sweep** across one
clearly painted lane. Moving out, finding cover, or changing lanes answers it;
the player does not solve a timing equation.

An eligible RAM or WARDEN Commitment opens a full-width Response:

- **INTERCEPT:** stop it and take one hit in the clash.
- **LET IT LAND:** preserve yourself and accept the shown Gate hit or push.

The choice states both consequences before the click. It spends no resource and
does not open a separate minigame.

## Screen contract

- One fixed-height cockpit; no body scroll on the target desktop viewport.
- Board remains the dominant surface.
- Objective, build identity, player health, Gate locks, movement pips, action
  lights, actions, intent lines, and End Turn stay visible.
- Desktop and mobile may pan the battlefield/cards without turning the page
  into a vertical instruction sheet.
- Shape and ownership are not communicated by color alone.
- Reduced-motion and keyboard focus states remain supported.

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

Play without a checklist. The checkpoint succeeds only if:

- movement clearly works before, between, and after actions;
- every action's ownership and targeting shape reads without a paragraph;
- at least two approaches feel strategically different;
- the two Anchors feel useful but optional;
- the primary Commitment and support action both cause visible problems;
- Broadcast Sweep, Intercept, and Let It Land explain their consequences;
- SHUNT naturally produces Follow Through during aggressive play;
- the Divider version feels like a stronger earned route, not a required trick;
- the Gate can be won, lost, abandoned, and reset; and
- a completed battle creates an immediate desire to retry differently.

## Verification contract

Before updating the draft PR:

```bash
npm run check
npm run build
```

Focused evidence must include:

- 1366×768 one-screen render with 154 edge-sharing cells and no body scroll;
- touch/mobile battlefield and action access without body overflow;
- split movement and the two-action limit;
- painted ranged, contact, shift, self, and blast footprints;
- upper, center, and lower route connectivity;
- high-ground, cover, rack, rubble, bridge, and powered-track rules;
- optional and asymmetric Anchor effects;
- one primary plus one support enemy action;
- Broadcast Sweep lane pressure;
- Intercept and Let It Land consequences;
- normal Follow Through and Divider-specific Ride the Breach;
- local Cell blast, Anchor drain, Warden Gate ejection, victory, defeat,
  retreat, and Reset;
- production `/world/playtest` empty no-store/noindex 404; and
- route absence from navigation and sitemap.

After any separately authorized merge, repeat the production-boundary checks
before considering deployment evidence complete.
