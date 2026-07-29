# BARCODE World Battle Mode: Fractured Gate Director Cut

Status: **PRIVATE, DISPOSABLE OWNER-REVIEW PROTOTYPE**

Route: `/world/playtest` in local development only.

This version is a deliberately unconstrained Battle Mode experiment. It keeps
useful BARCODE World DNA, but it is not the earlier full rules blueprint, a
canonical encounter, or a commitment to final mechanics.

## The experiment

The entire encounter fits into one battle cockpit:

- mission and current objective at the top;
- one dominant continuous isometric board;
- visible enemy intent arrows;
- two wired power Anchors, one volatile Power Cell, and one Gate;
- five reusable tactical cards;
- Command beside those cards; and
- one obvious End Turn button.

There is no sidebar, page-length action menu, build dropdown, battle log, deck
management screen, or required reading panel.

## Mission

`POWER 2 ANCHORS → REACH THE GATE → SURVIVE 1 ENEMY TURN`

The Gate has three integrity locks. RAM removes one whenever its Slow Gate
Smash lands. The player also loses if Signal reaches zero.

The three enemies have visible jobs:

| Enemy | Job |
| --- | --- |
| RAM | Reaches and breaks the Gate |
| WARDEN | Shields RAM and knocks the player off the Gate |
| JAMMER | Drains powered Anchors |

## Direct controls

1. Click a glowing blue diamond to move.
2. Click a card.
3. Click a glowing enemy or Power Cell.
4. On touch screens, select the target again after the preview.
5. Click an adjacent Anchor or Gate to operate it.
6. Click **End Turn** when ready.

Cards show cost, speed, and effect directly:

| Card | Cost | Speed | Effect |
| --- | ---: | --- | --- |
| Quick Shot | 4 | Fast | 2 damage; interrupts slower intent |
| Force Push | 5 | Standard | Push two; walls and arc rails add impact |
| Dash Strike | 6 | Fast | Close distance and deal 2 |
| Guard Pulse | 4 | Fast | Gain 3 Shield for the Enemy Turn |
| Overload | 8 | Slow | Deal 4, or detonate the Power Cell |

The Power Cell is a visible environmental exception: its blast hits every
enemy in radius and cancels those intents even though Overload itself is Slow.

## Current economy

- 16 Command at the start.
- Bank unused Command.
- Gain 16 at the next Player Turn, up to 32.
- No universal action-count cap.
- Each card may be used once per Player Turn.
- One free range-four movement per Player Turn.

These are test values, not final BARCODE World balance.

## Private boundary

- Development-only route.
- Production returns an empty no-store 404 before page output.
- Absent from navigation and sitemap.
- Solo, deterministic, resettable, noncanonical, and memory-only.
- No API, account, profile, inventory, progression, rewards, queue, BNL,
  Journal, Relay, Memory, multiplayer, or shared-world dependency.
- No state survives Reset, reload, or navigation.
- Draft PR and private owner testing are authorized.
- Merge, deployment, and public exposure are not authorized.

## Owner launch

Open Command Prompt on Windows and paste:

```bat
cd /d "%USERPROFILE%\Desktop\BARCODE-World-Test-287"
git pull origin agent/fractured-gate-alternating-turns
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3007
```

Then open:

`http://127.0.0.1:3007/world/playtest`

Leave Command Prompt open while playing. Press `Ctrl+C` afterward.

## Natural owner test

Play without following a technical checklist. The prototype succeeds only if:

- the complete screen fits without page scrolling;
- the objective is clear within ten seconds;
- enemy arrows make the coming danger understandable;
- clicking a card makes legal targets obvious;
- the result of movement, attacks, interrupts, pushes, and objects is visible;
- the turn feels like a tactical choice rather than menu operation; and
- the short battle creates an immediate desire to retry differently.

Useful feedback is simply:

- what was fun;
- what was confusing;
- what felt slow or pointless;
- what looked bad;
- whether the board felt cramped or empty; and
- whether Command and interrupt speed added strategy or noise.

## Verification contract

Before updating the draft PR:

```bash
npm run check
npm run build
```

Focused evidence must include:

- opening mission and one-screen layout;
- free movement and object adjacency;
- card range and Command affordability;
- Fast-versus-Slow interruption;
- Power Cell blast;
- wall/rail push behavior;
- Anchor drain;
- Warden Gate ejection;
- a failed Gate seal and a successful Gate seal;
- deterministic Reset;
- production `/world/playtest` no-store/noindex 404; and
- route absence from navigation and sitemap.

After any separately authorized merge, repeat the production-boundary checks
before considering deployment evidence complete.
