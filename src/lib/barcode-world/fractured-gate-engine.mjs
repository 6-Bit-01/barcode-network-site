import {
  BUILDS,
  CARDS as PREPARED_CARDS,
  CORE_RULES,
} from "./constants.mjs";

export const FRACTURED_GATE_SOURCE =
  "BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_REVISED_ENCOUNTER_CHECKPOINT_2026-07-27";

export const RESULT_TYPES = Object.freeze([
  "Fast Secure",
  "Clean Secure",
  "Recovery Secure",
  "Gate Lost",
  "Controlled Retreat",
]);

const CONTEXT_CARDS = Object.freeze({
  "follow-through": {
    id: "follow-through",
    name: "Follow Through",
    kind: "Context Extension",
    cost: 1,
    compatibility: ["answer-commitment"],
    text:
      "Attach after an uninterrupted approach. The linked contact gains +1 Tempo once, then this source-bound card expires.",
    context: true,
  },
});

export const CARDS = Object.freeze({
  ...PREPARED_CARDS,
  ...CONTEXT_CARDS,
});

export const ENEMY_CARDS = Object.freeze({
  "set-guard": {
    id: "set-guard",
    name: "Set Guard",
    cost: 4,
    lane: "Fast",
    tempo: 7,
    text: "Establish physical protection.",
  },
  "impact-counter": {
    id: "impact-counter",
    name: "Impact Counter",
    cost: 4,
    lane: "Standard",
    tempo: 5,
    text: "Declared contact contingency.",
  },
  "driving-ram": {
    id: "driving-ram",
    name: "Driving Ram",
    cost: 8,
    lane: "Standard",
    tempo: 6,
    text: "Advance with Force toward the Gate.",
  },
  "slip-angle": {
    id: "slip-angle",
    name: "Slip Angle",
    cost: 4,
    lane: "Fast",
    tempo: 8,
    text: "Evade laterally while conceding a lane.",
  },
  "anchor-down": {
    id: "anchor-down",
    name: "Anchor Down",
    cost: 5,
    lane: "Fast",
    tempo: 7,
    text: "Prevent displacement without preventing damage.",
  },
  "follow-pressure": {
    id: "follow-pressure",
    name: "Follow Pressure",
    cost: 5,
    lane: "Standard",
    tempo: 5,
    text: "Advance behind an established threat.",
  },
  "breaker-coil": {
    id: "breaker-coil",
    name: "Breaker Coil",
    cost: 2,
    lane: "Standard",
    tempo: 5,
    text: "Increase the force of an Impact Rush.",
  },
  "seize-breach": { id: "seize-breach", name: "Seize Breach", cost: 6, lane: "Standard", tempo: 5 },
  "recover-stance": { id: "recover-stance", name: "Recover Stance", cost: 4, lane: "Slow", tempo: 3 },
  "crushing-return": { id: "crushing-return", name: "Crushing Return", cost: 8, lane: "Slow", tempo: 3 },
  "last-push": { id: "last-push", name: "Last Push", cost: 8, lane: "Standard", tempo: 5 },
  "breacher-withdrawal": { id: "breacher-withdrawal", name: "Controlled Withdrawal", cost: 4, lane: "Fast", tempo: 8 },

  "shield-link": {
    id: "shield-link",
    name: "Shield Link",
    cost: 4,
    lane: "Fast",
    tempo: 7,
    text: "Protect an adjacent or linked ally.",
  },
  "body-block": {
    id: "body-block",
    name: "Body Block",
    cost: 6,
    lane: "Standard",
    tempo: 5,
    text: "Occupy and deny a contact lane.",
  },
  "vault-intercept": {
    id: "vault-intercept",
    name: "Vault Intercept",
    cost: 6,
    lane: "Fast",
    tempo: 7,
    text: "Contest a reachable landing.",
  },
  "brace-line": {
    id: "brace-line",
    name: "Brace Line",
    cost: 5,
    lane: "Standard",
    tempo: 6,
    text: "Hold one line against displacement.",
  },
  "cover-advance": { id: "cover-advance", name: "Cover Advance", cost: 4, lane: "Standard", tempo: 5 },
  "anchor-swap": { id: "anchor-swap", name: "Anchor Swap", cost: 5, lane: "Fast", tempo: 7 },
  "guard-relay": { id: "guard-relay", name: "Guard Relay", cost: 4, lane: "Fast", tempo: 7 },
  "pushback-screen": { id: "pushback-screen", name: "Pushback Screen", cost: 6, lane: "Standard", tempo: 5 },
  "hold-platform": { id: "hold-platform", name: "Hold Platform", cost: 6, lane: "Standard", tempo: 5 },
  "intercept-route": { id: "intercept-route", name: "Intercept Route", cost: 6, lane: "Fast", tempo: 7 },
  "recover-link": { id: "recover-link", name: "Recover Link", cost: 4, lane: "Slow", tempo: 3 },
  "guard-withdrawal": { id: "guard-withdrawal", name: "Controlled Withdrawal", cost: 4, lane: "Fast", tempo: 8 },

  "emergency-reset": {
    id: "emergency-reset",
    name: "Emergency Reset",
    cost: 4,
    lane: "Fast",
    tempo: 6,
    text: "Declared response to exposed hardware.",
  },
  "purge-control": {
    id: "purge-control",
    name: "Purge Control",
    cost: 6,
    lane: "Standard",
    tempo: 5,
    text: "Contest Control at a connected Dependency.",
  },
  "charge-debris": {
    id: "charge-debris",
    name: "Charge Debris",
    cost: 5,
    lane: "Fast",
    tempo: 7,
    text: "Energize the breached Divider conduit.",
  },
  "seal-gap": {
    id: "seal-gap",
    name: "Seal Gap",
    cost: 5,
    lane: "Standard",
    tempo: 5,
    text: "Trigger the service shutter.",
  },
  "lift-recall": {
    id: "lift-recall",
    name: "Lift Recall",
    cost: 5,
    lane: "Fast",
    tempo: 6,
    text: "Begin a legal service-lift return.",
  },
  "static-tax": {
    id: "static-tax",
    name: "Static Tax",
    cost: 4,
    lane: "Fast",
    tempo: 6,
    text: "Delay Gate stabilization.",
  },
  "bollard-override": { id: "bollard-override", name: "Bollard Override", cost: 5, lane: "Fast", tempo: 6 },
  "cut-power": { id: "cut-power", name: "Cut Power", cost: 6, lane: "Standard", tempo: 5 },
  "reconnect-line": { id: "reconnect-line", name: "Reconnect Line", cost: 5, lane: "Slow", tempo: 3 },
  "false-read": { id: "false-read", name: "False Read", cost: 4, lane: "Fast", tempo: 7 },
  "gate-desync": { id: "gate-desync", name: "Gate Desync", cost: 8, lane: "Slow", tempo: 3 },
  "emergency-shutdown": { id: "emergency-shutdown", name: "Emergency Shutdown", cost: 7, lane: "Slow", tempo: 3 },

  cutoff: {
    id: "cutoff",
    name: "Cutoff",
    cost: 5,
    lane: "Fast",
    tempo: 7,
    text: "Occupy a likely destination or route.",
  },
  "needle-volley": { id: "needle-volley", name: "Needle Volley", cost: 6, lane: "Fast", tempo: 7 },
  "feint-route": { id: "feint-route", name: "Feint Route", cost: 4, lane: "Fast", tempo: 8 },
  "pressure-vault-intercept": { id: "pressure-vault-intercept", name: "Vault Intercept", cost: 6, lane: "Fast", tempo: 7 },
  pursuit: { id: "pursuit", name: "Pursuit", cost: 6, lane: "Standard", tempo: 5 },
  "exit-pressure": {
    id: "exit-pressure",
    name: "Exit Pressure",
    cost: 6,
    lane: "Fast",
    tempo: 7,
    text: "Threaten the physical retreat route.",
  },
  "mark-target": { id: "mark-target", name: "Mark Target", cost: 4, lane: "Fast", tempo: 7 },
  "deny-cache": { id: "deny-cache", name: "Deny Cache", cost: 5, lane: "Fast", tempo: 7 },
  "harrier-step": { id: "harrier-step", name: "Harrier Step", cost: 4, lane: "Fast", tempo: 8 },
  "pinning-shot": { id: "pinning-shot", name: "Pinning Shot", cost: 6, lane: "Fast", tempo: 7 },
  "flank-run": { id: "flank-run", name: "Flank Run", cost: 6, lane: "Standard", tempo: 5 },
  withdraw: { id: "withdraw", name: "Withdraw", cost: 4, lane: "Fast", tempo: 8 },
});

const ENEMY_DECKS = Object.freeze({
  breacher: [
    "set-guard",
    "impact-counter",
    "driving-ram",
    "slip-angle",
    "anchor-down",
    "follow-pressure",
    "breaker-coil",
    "seize-breach",
    "recover-stance",
    "crushing-return",
    "last-push",
    "breacher-withdrawal",
  ],
  guard: [
    "shield-link",
    "body-block",
    "vault-intercept",
    "brace-line",
    "cover-advance",
    "anchor-swap",
    "guard-relay",
    "pushback-screen",
    "hold-platform",
    "intercept-route",
    "recover-link",
    "guard-withdrawal",
  ],
  controller: [
    "emergency-reset",
    "purge-control",
    "charge-debris",
    "seal-gap",
    "lift-recall",
    "static-tax",
    "bollard-override",
    "cut-power",
    "reconnect-line",
    "false-read",
    "gate-desync",
    "emergency-shutdown",
  ],
  pressure: [
    "cutoff",
    "needle-volley",
    "feint-route",
    "pressure-vault-intercept",
    "pursuit",
    "exit-pressure",
    "mark-target",
    "deny-cache",
    "harrier-step",
    "pinning-shot",
    "flank-run",
    "withdraw",
  ],
});

const WALKABLE_COORDS = Object.freeze([
  [4, 2], [5, 2], [6, 2], [7, 2],
  [9, 2], [10, 2], [11, 2], [12, 2],
  [4, 3], [5, 3], [6, 3], [7, 3],
  [9, 3], [10, 3], [11, 3], [12, 3],
  [3, 4], [4, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],
  [3, 5], [4, 5], [5, 5], [6, 5], [7, 5],
  [9, 5], [10, 5], [11, 5], [12, 5], [13, 5],
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
  [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
  [9, 7], [10, 7], [11, 7], [12, 7], [13, 7],
  [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8],
]);

const coordKey = (x, y) => `${x},${y}`;
const tileId = (x, y) => `tile-${x}-${y}`;
const coordFromTile = (id) => {
  const match = /^tile-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const WALKABLE = new Set(WALKABLE_COORDS.map(([x, y]) => coordKey(x, y)));

const TERRAIN_BY_COORD = new Map();
for (const [x, y] of [[3, 6], [4, 6], [5, 6]]) {
  TERRAIN_BY_COORD.set(coordKey(x, y), "clear");
}
for (const [x, y] of [[3, 5], [4, 5], [5, 5]]) {
  TERRAIN_BY_COORD.set(coordKey(x, y), "rubble");
}
for (const [x, y] of [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]]) {
  TERRAIN_BY_COORD.set(coordKey(x, y), "powered");
}

function pointToPercent(x, y) {
  return {
    x: 4 + ((x - 1) / 12) * 92,
    y: 7 + ((y - 1) / 8) * 86,
  };
}

export const BOARD_TILES = Object.freeze(
  Object.fromEntries(
    WALKABLE_COORDS.map(([x, y]) => {
      const id = tileId(x, y);
      const point = pointToPercent(x, y);
      const terrain = TERRAIN_BY_COORD.get(coordKey(x, y)) ?? "ordinary";
      return [
        id,
        {
          id,
          x,
          y,
          boardX: point.x,
          boardY: point.y,
          terrain,
          name: `${terrain === "ordinary" ? "Tactical" : titleCase(terrain)} tile ${x},${y}`,
        },
      ];
    }),
  ),
);

function focusAt(id, name, kind, x, y, description, extra = {}) {
  const point = pointToPercent(x, y);
  return {
    id,
    name,
    kind,
    tileId: tileId(x, y),
    x: point.x,
    y: point.y,
    description,
    ...extra,
  };
}

export const BOARD_FOCUSES = Object.freeze({
  player: focusAt(
    "player",
    "Player",
    "player",
    2,
    6,
    "Your one directly controlled character. Solo play has no hidden helper.",
  ),
  "west-exit": focusAt(
    "west-exit",
    "West Exit",
    "exit",
    1,
    6,
    "The physical retreat route. Leaving records every abandoned priority.",
  ),
  "cracked-divider": focusAt(
    "cracked-divider",
    "Cracked Divider",
    "terrain",
    8,
    5,
    "Brittle, load-bearing cover with a powered conduit and an upper lip.",
  ),
  "gate-actuator": focusAt(
    "gate-actuator",
    "Gate Actuator",
    "machinery",
    7,
    7,
    "Physical access controls the defensive bollard and powered track.",
  ),
  "defensive-bollard": focusAt(
    "defensive-bollard",
    "Defensive Bollard",
    "machinery",
    9,
    6,
    "A retractable force redirector connected to the Gate Actuator.",
  ),
  "service-gap": focusAt(
    "service-gap",
    "Service Gap",
    "terrain",
    6,
    7,
    "A narrow obscured relationship with a Controller-linked shutter.",
  ),
  "upper-crossing": focusAt(
    "upper-crossing",
    "Upper Natural Crossing",
    "terrain",
    7,
    3,
    "A broken span with natural handholds and a capacity-one landing.",
  ),
  "lift-relay": focusAt(
    "lift-relay",
    "Lift Relay",
    "machinery",
    5,
    8,
    "A local powered relay that can align a temporary upper bridge.",
  ),
  "field-cache": focusAt(
    "field-cache",
    "Field Cache",
    "cache",
    6,
    2,
    "An optional one-slot Package. It never becomes a persistent reward.",
  ),
  gate: focusAt(
    "gate",
    "Fractured Gate",
    "objective",
    12,
    5,
    "The location objective. Stabilize it before three real impacts complete.",
  ),
  breacher: focusAt(
    "breacher",
    "Breacher",
    "enemy",
    6,
    5,
    "Physical Gate pressure and forceful contact.",
    { actorId: "breacher" },
  ),
  guard: focusAt(
    "guard",
    "Guard",
    "enemy",
    9,
    5,
    "Protection, interception, and Gate-lane denial.",
    { actorId: "guard" },
  ),
  controller: focusAt(
    "controller",
    "Controller",
    "enemy",
    10,
    7,
    "Machinery, closure, reset, and powered-terrain opposition.",
    { actorId: "controller" },
  ),
  pressure: focusAt(
    "pressure",
    "Pressure",
    "enemy",
    9,
    3,
    "Flank, Cache, route, and retreat pressure.",
    { actorId: "pressure" },
  ),
  "breacher-intent": focusAt(
    "breacher-intent",
    "Breacher Intent",
    "intent",
    7,
    5,
    "Driving toward the Gate. Contact and one concealed response may alter the line.",
  ),
  breach: focusAt(
    "breach",
    "Divider Breach",
    "opening",
    8,
    5,
    "Two-way geometry created by breaking the Cracked Divider.",
  ),
  "upper-route": focusAt(
    "upper-route",
    "Prepared Upper Route",
    "opening",
    8,
    3,
    "A prepared natural crossing with a contestable east landing.",
  ),
  "service-route": focusAt(
    "service-route",
    "Prepared Service Route",
    "opening",
    8,
    6,
    "A narrow rear approach whose real shutter can still close.",
  ),
  "service-lift": focusAt(
    "service-lift",
    "Service Lift Bridge",
    "opening",
    8,
    2,
    "Temporary machine-created geometry that returns at Settle.",
  ),
  regulator: focusAt(
    "regulator",
    "Impact Regulator",
    "component",
    6,
    5,
    "Hardware exposed by physical contact and protected by an automatic reset.",
  ),
});

const LANE_ORDER = Object.freeze(["Fast", "Standard", "Slow"]);
const LANE_RANK = Object.freeze({ Fast: 0, Standard: 1, Slow: 2 });
const ACTIVE_ENEMY_STATUSES = new Set(["active", "staggered", "off-balance", "pinned"]);

const ACTIONS = Object.freeze({
  reposition: {
    id: "reposition",
    parent: "Move",
    label: "Reposition",
    description: "Take the one free adjacent ordinary step in this allotment.",
    cost: 0,
    paid: false,
    lane: "Standard",
    tempo: 6,
    range: 1,
    compatibilityKey: "reposition",
  },
  advance: {
    id: "advance",
    parent: "Move",
    label: "Advance",
    description: "Move up to three ordinary tiles. Rubble costs two movement.",
    cost: 4,
    paid: true,
    lane: "Standard",
    tempo: 5,
    range: 3,
    compatibilityKey: "additional-movement",
  },
  attack: {
    id: "attack",
    parent: "Attack",
    label: "Weapon Attack",
    description: "Attack one enemy in legal range without silently retargeting.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "attack",
  },
  guard: {
    id: "guard",
    parent: "Defend",
    label: "Guard",
    description: "Establish 4 Guard before later pressure.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 7,
    compatibilityKey: "guard",
  },
  "guard-gate": {
    id: "guard-gate",
    parent: "Defend",
    label: "Guard Gate",
    description: "Brace the Gate lane before completing slow objective Work.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 7,
    compatibilityKey: "guard",
  },
  "stabilize-gate": {
    id: "stabilize-gate",
    parent: "Use",
    label: "Stabilize Gate",
    description: "Complete one Slow Gate Work and activate the defensive seal.",
    cost: 6,
    paid: true,
    lane: "Slow",
    tempo: 3,
    compatibilityKey: "work-objective",
  },
  "recover-cache": {
    id: "recover-cache",
    parent: "Use",
    label: "Recover Field Cache",
    description: "Take the optional one-slot prototype Package.",
    cost: 4,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "recover-package",
  },
  leave: {
    id: "leave",
    parent: "Leave",
    label: "Leave",
    description: "Use the West Exit and record a Controlled Retreat.",
    cost: 0,
    paid: false,
    lane: "Standard",
    tempo: 6,
    compatibilityKey: "standard-extract",
  },
  "answer-divider": {
    id: "answer-divider",
    parent: "Discipline",
    label: "Answer Commitment",
    description: "Meet the Rush and turn opposed Force into a Divider breach.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "answer-commitment",
    attribution: {
      revealed: "Battle reads the opposing collision vector.",
      enabled: "Exploration identifies the safe line created if the Divider breaks.",
    },
  },
  "cross-breach": {
    id: "cross-breach",
    parent: "Move",
    label: "Cross Opening",
    description: "Use the public Divider breach and its safe upper lip.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "cross-opening",
  },
  "angle-clash": {
    id: "angle-clash",
    parent: "Discipline",
    label: "Angle the Contact",
    description: "Redirect the Gate-lane collision into the defensive bollard.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 6,
    compatibilityKey: "contest",
    attribution: {
      revealed: "Battle reads the Guard's contact vector.",
      enabled: "Exploration recognizes the safe upper lip beside charged debris.",
    },
  },
  "prepare-upper-route": {
    id: "prepare-upper-route",
    parent: "Discipline",
    label: "Prepare Upper Route",
    description: "Establish the natural capacity-one crossing.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "prepare-route",
    attribution: {
      revealed: "Exploration identifies the stable handholds and true landing.",
      enabled: "Battle can protect the landing when an interception arrives.",
    },
  },
  "contest-upper-landing": {
    id: "contest-upper-landing",
    parent: "Discipline",
    label: "Contest Upper Landing",
    description: "Physically protect the prepared landing.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 7,
    compatibilityKey: "contest",
  },
  "cross-upper-route": {
    id: "cross-upper-route",
    parent: "Move",
    label: "Cross Upper Route",
    description: "Cross the prepared natural relationship.",
    cost: 8,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "exploit-route",
  },
  "answer-regulator": {
    id: "answer-regulator",
    parent: "Discipline",
    label: "Expose Impact Regulator",
    description: "Use contact to expose protected Breacher hardware.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "answer-commitment",
    attribution: {
      revealed: "Battle creates a physical vulnerability at contact.",
      enabled: "Hacking identifies the automatic reset that follows.",
    },
  },
  "suppress-regulator": {
    id: "suppress-regulator",
    parent: "Discipline",
    label: "Suppress Reset",
    description: "Delay the Breacher regulator's real automatic reset.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 6,
    compatibilityKey: "suppress-response",
  },
  "establish-bollard-control": {
    id: "establish-bollard-control",
    parent: "Discipline",
    label: "Establish Actuator Control",
    description: "Take bounded local Control of the defensive bollard.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "establish-control",
    attribution: {
      revealed: "Hacking finds the Actuator-linked bollard output.",
      enabled: "Battle identifies the access tile that must be held.",
    },
  },
  "hold-actuator": {
    id: "hold-actuator",
    parent: "Discipline",
    label: "Hold Actuator Access",
    description: "Physically contest the access tile so Control survives.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 7,
    compatibilityKey: "contest",
  },
  "execute-bollard": {
    id: "execute-bollard",
    parent: "Discipline",
    label: "Execute Bollard Output",
    description: "Spend Control to redirect one legal physical commitment.",
    cost: 8,
    paid: true,
    lane: "Standard",
    tempo: 6,
    compatibilityKey: "execute-output",
  },
  "prepare-service-route": {
    id: "prepare-service-route",
    parent: "Discipline",
    label: "Prepare Service Route",
    description: "Establish the obscured relationship to the rear Gate lane.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "prepare-route",
    attribution: {
      revealed: "Exploration finds the real under-walk relationship.",
      enabled: "Hacking identifies the Controller-linked shutter.",
    },
  },
  "suppress-service-closure": {
    id: "suppress-service-closure",
    parent: "Discipline",
    label: "Suppress Closure",
    description: "Delay the real service shutter response.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 6,
    compatibilityKey: "suppress-response",
  },
  "cross-service-route": {
    id: "cross-service-route",
    parent: "Move",
    label: "Cross Service Route",
    description: "Use the preserved rear relationship.",
    cost: 8,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "exploit-route",
  },
  "establish-lift-control": {
    id: "establish-lift-control",
    parent: "Discipline",
    label: "Establish Lift Control",
    description: "Take bounded local Control of the service lift.",
    cost: 7,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "establish-control",
    attribution: {
      revealed: "Hacking identifies the lift Output and return response.",
      enabled: "Exploration reads the safe crossing and reset window.",
    },
  },
  "execute-lift": {
    id: "execute-lift",
    parent: "Discipline",
    label: "Align Service Lift",
    description: "Spend Control to create temporary upper geometry.",
    cost: 8,
    paid: true,
    lane: "Standard",
    tempo: 6,
    compatibilityKey: "execute-output",
  },
  "cross-lift": {
    id: "cross-lift",
    parent: "Move",
    label: "Cross Lift Bridge",
    description: "Cross before the service lift returns at Settle.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "cross-opening",
  },
  "redirect-track": {
    id: "redirect-track",
    parent: "Discipline",
    label: "Redirect Service Track",
    description: "Change the powered track feed toward the Divider.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 5,
    compatibilityKey: "basic-interface",
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function titleCase(value) {
  return String(value)
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getBuild(buildId) {
  return BUILDS.find((build) => build.id === buildId) ?? BUILDS[0];
}

function stableHash(value) {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function enemyActor(id, name, role, x, y) {
  const deck = ENEMY_DECKS[id];
  return {
    id,
    name,
    role,
    position: tileId(x, y),
    condition: id === "breacher" ? 10 : 8,
    guard: id === "guard" ? 6 : 4,
    status: "active",
    deck: [...deck],
    hand: deck.slice(0, 5),
    drawIndex: 5,
    discard: [],
    knownCards: [],
  };
}

function majorLabel(buildId) {
  const build = getBuild(buildId);
  if (build.major === "battle") return "Battle Ready";
  if (build.major === "exploration") return "Route Sense Ready";
  return "Local Control Ready";
}

function makeInitialState(buildId) {
  const build = getBuild(buildId);
  return {
    sourceRevision: FRACTURED_GATE_SOURCE,
    seed: "FG-R1-BE-CLEAR",
    buildId: build.id,
    round: 1,
    phase: "planning",
    priority: "enemy",
    consecutivePasses: 0,
    command: CORE_RULES.commandStart,
    enemyCommand: CORE_RULES.commandStart,
    condition: 12,
    guard: 4,
    position: tileId(2, 6),
    freeRepositionUsed: false,
    planningActionCount: 0,
    playerPivotUsed: false,
    enemyPivotUsed: false,
    refocusUsed: false,
    refocusRecord: null,
    majorState: {
      type: build.major,
      name: majorLabel(build.id),
      status: "ready",
    },
    gate: {
      stability: 3,
      status: "unstable",
      workDelayed: false,
    },
    enemies: {
      breacher: enemyActor("breacher", "Breacher", "Physical Gate pressure", 6, 5),
      guard: enemyActor("guard", "Guard", "Protection and interception", 9, 5),
      controller: enemyActor("controller", "Controller", "Machinery and closure", 10, 7),
      pressure: enemyActor("pressure", "Pressure", "Flank, Cache, and exit pressure", 9, 3),
    },
    divider: {
      integrity: 2,
      status: "cracked",
      conduit: "neutral",
    },
    actuator: {
      controlled: false,
      mode: null,
      accessHeld: false,
      quietRewrite: false,
    },
    bollard: {
      status: "retracted",
    },
    upperRoute: {
      prepared: false,
      protected: false,
      contested: false,
    },
    serviceRoute: {
      prepared: false,
      closureSuppressed: false,
      closing: false,
    },
    lift: {
      deployed: false,
      returning: false,
      resetAfterSettle: false,
    },
    poweredTrack: {
      feed: "neutral",
    },
    cache: {
      status: "available",
    },
    westExit: {
      status: "open",
    },
    deck: [...build.deck],
    hand: build.deck.slice(0, CORE_RULES.openingHand),
    drawIndex: CORE_RULES.openingHand,
    discard: [],
    plan: [],
    enemyPlan: [],
    nextActionSequence: 1,
    nextEnemySequence: 1,
    warning: "",
    planningHistory: [],
    resolution: null,
    settleSummary: null,
    review: [],
    result: null,
    retreated: false,
    flags: {
      turningPoint: null,
      playerGuardedGate: false,
      objectiveBraceUsed: false,
      contextCardUsed: false,
      regulatorExposed: false,
      regulatorResetSuppressed: false,
      sourceAttribution: [],
    },
  };
}

function cardInEnemyHand(state, actorId, cardId) {
  return state.enemies[actorId]?.hand.includes(cardId);
}

function enemyActionDefinition(actionId, actorId, cardId, targetId, extra = {}) {
  const card = cardId ? ENEMY_CARDS[cardId] : null;
  const basics = {
    "impact-rush": {
      label: "Impact Rush",
      cost: 8,
      lane: "Standard",
      tempo: 6,
    },
  };
  const base = basics[actionId] ?? {
    label: card?.name ?? titleCase(actionId),
    cost: card?.cost ?? 0,
    lane: card?.lane ?? "Standard",
    tempo: card?.tempo ?? 5,
  };
  return {
    id: actionId,
    actorId,
    actorName: titleCase(actorId),
    label: base.label,
    cardId,
    cardName: card?.name ?? null,
    targetId,
    cost: base.cost,
    totalCost: base.cost,
    lane: base.lane,
    tempo: base.tempo,
    paid: true,
    concealed: Boolean(extra.concealed),
    modifierCardId: extra.modifierCardId ?? null,
    modifierCardName: extra.modifierCardId
      ? ENEMY_CARDS[extra.modifierCardId]?.name
      : null,
    modifierCost: extra.modifierCardId
      ? ENEMY_CARDS[extra.modifierCardId]?.cost ?? 0
      : 0,
    status: "open",
    ...extra,
  };
}

function enemyAvailableCommand(state) {
  if (state.phase !== "planning") return Math.max(0, state.enemyCommand);
  return Math.max(
    0,
    state.enemyCommand -
      state.enemyPlan.reduce((sum, action) => sum + action.totalCost, 0),
  );
}

function enemyPaidActionCount(state) {
  return state.enemyPlan.length;
}

function solidifyNewest(plan) {
  for (const action of plan) {
    if (action.status === "open") action.status = "solid";
  }
}

function commitEnemyAction(state, action) {
  const next = clone(state);
  if (action.cardId && !cardInEnemyHand(next, action.actorId, action.cardId)) {
    return { state, acted: false };
  }
  if (
    action.modifierCardId &&
    !cardInEnemyHand(next, action.actorId, action.modifierCardId)
  ) {
    return { state, acted: false };
  }
  action.totalCost =
    action.cost +
    (action.modifierCardId
      ? ENEMY_CARDS[action.modifierCardId]?.cost ?? 0
      : 0);
  if (
    action.totalCost > enemyAvailableCommand(next) ||
    enemyPaidActionCount(next) >= CORE_RULES.paidActionCap
  ) {
    return { state, acted: false };
  }
  solidifyNewest(next.enemyPlan);
  action.instanceId = `enemy-${next.nextEnemySequence}`;
  action.sequence = next.nextEnemySequence;
  action.status = "open";
  next.nextEnemySequence += 1;
  next.enemyPlan.push(action);
  next.planningHistory.push({
    side: "enemy",
    type: "commit",
    actorId: action.actorId,
    actionId: action.id,
    targetId: action.targetId,
  });
  next.consecutivePasses = 0;
  next.priority = "player";
  return { state: next, acted: true };
}

function pivotEnemyAction(state, action) {
  const next = clone(state);
  if (next.enemyPivotUsed) return { state, acted: false };
  const index = next.enemyPlan.findIndex((item) => item.status === "open");
  if (index < 0) return { state, acted: false };
  const old = next.enemyPlan[index];
  const oldCost = old.totalCost;
  const availableWithReplacement = enemyAvailableCommand(next) + oldCost;
  action.totalCost =
    action.cost +
    (action.modifierCardId
      ? ENEMY_CARDS[action.modifierCardId]?.cost ?? 0
      : 0);
  if (
    action.totalCost > availableWithReplacement ||
    (action.cardId && !cardInEnemyHand(next, action.actorId, action.cardId))
  ) {
    return { state, acted: false };
  }
  action.instanceId = old.instanceId;
  action.sequence = old.sequence;
  action.status = "solid";
  next.enemyPlan[index] = action;
  next.enemyPivotUsed = true;
  next.planningHistory.push({
    side: "enemy",
    type: "pivot",
    from: old.id,
    actionId: action.id,
    targetId: action.targetId,
  });
  next.consecutivePasses = 0;
  next.priority = "player";
  return { state: next, acted: true };
}

function playerHas(state, actionId) {
  return state.plan.some((action) => action.id === actionId);
}

function enemyHas(state, actionId) {
  return state.enemyPlan.some((action) => action.id === actionId);
}

function hiddenPlayerPlan(state) {
  return state.plan.map((action) => {
    const publicAction = { ...action };
    delete publicAction.cardId;
    delete publicAction.cardName;
    return {
      ...publicAction,
      concealedModifierCount: publicAction.concealed ? 1 : 0,
    };
  });
}

function takeEnemyPriority(state, reason = "response") {
  let next = clone(state);
  next.priority = "enemy";

  const publicPlayerPlan = hiddenPlayerPlan(next);
  const hasPublic = (id) => publicPlayerPlan.some((action) => action.id === id);

  if (next.round === 1 && !enemyHas(next, "impact-rush")) {
    const rush = enemyActionDefinition(
      "impact-rush",
      "breacher",
      "driving-ram",
      "gate",
      {
        concealed: true,
        modifierCardId: "impact-counter",
        posture: "Driving toward Gate",
      },
    );
    return commitEnemyAction(next, rush);
  }

  if (
    next.round === 1 &&
    enemyHas(next, "impact-rush") &&
    !enemyHas(next, "shield-link") &&
    enemyAvailableCommand(next) >= 4
  ) {
    return commitEnemyAction(
      next,
      enemyActionDefinition(
        "shield-link",
        "guard",
        "shield-link",
        "breacher",
        { posture: "Protecting Breacher" },
      ),
    );
  }

  if (next.round === 2) {
    if (hasPublic("cross-breach") && !enemyHas(next, "charge-debris")) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "charge-debris",
          "controller",
          "charge-debris",
          "cracked-divider",
          { posture: "Charging the breached conduit" },
        ),
      );
    }
    if (hasPublic("stabilize-gate") && !enemyHas(next, "body-block")) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "body-block",
          "guard",
          "body-block",
          "gate",
          { posture: "Occupying Gate access" },
        ),
      );
    }
    if (
      hasPublic("angle-clash") &&
      enemyHas(next, "body-block") &&
      !enemyHas(next, "brace-line")
    ) {
      return pivotEnemyAction(
        next,
        enemyActionDefinition(
          "brace-line",
          "guard",
          "brace-line",
          "defensive-bollard",
          { posture: "Establishing a faster hold" },
        ),
      );
    }
    if (
      reason === "player-pass" &&
      !enemyHas(next, "exit-pressure") &&
      enemyAvailableCommand(next) >= 6
    ) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "exit-pressure",
          "pressure",
          "exit-pressure",
          "west-exit",
          { posture: "Threatening retreat" },
        ),
      );
    }
    if (
      !enemyHas(next, "impact-rush") &&
      enemyAvailableCommand(next) >= 8 &&
      cardInEnemyHand(next, "breacher", "follow-pressure")
    ) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "impact-rush",
          "breacher",
          "follow-pressure",
          "gate",
          {
            concealed: true,
            posture: "Following pressure toward the Gate",
          },
        ),
      );
    }
  }

  if (next.round === 3) {
    if (!enemyHas(next, "static-tax")) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "static-tax",
          "controller",
          "static-tax",
          "gate",
          { posture: "Delaying Gate Work" },
        ),
      );
    }
    if (
      !enemyHas(next, "impact-rush") &&
      enemyAvailableCommand(next) >= 10
    ) {
      return commitEnemyAction(
        next,
        enemyActionDefinition(
          "impact-rush",
          "breacher",
          null,
          "gate",
          {
            modifierCardId: "breaker-coil",
            posture: "Driving through the defended Gate lane",
          },
        ),
      );
    }
  }

  if (
    next.round > 3 &&
    !enemyHas(next, "impact-rush") &&
    enemyAvailableCommand(next) >= 8 &&
    ACTIVE_ENEMY_STATUSES.has(next.enemies.breacher.status)
  ) {
    const cardId = cardInEnemyHand(next, "breacher", "last-push")
      ? "last-push"
      : cardInEnemyHand(next, "breacher", "follow-pressure")
        ? "follow-pressure"
        : null;
    return commitEnemyAction(
      next,
      enemyActionDefinition("impact-rush", "breacher", cardId, "gate", {
        concealed: Boolean(cardId),
        posture: "Maintaining visible Gate pressure",
      }),
    );
  }

  const adaptiveResponses = [
    {
      player: "prepare-upper-route",
      enemy: "vault-intercept",
      actor: "guard",
      card: "vault-intercept",
      target: "upper-route",
      posture: "Contesting the east landing",
    },
    {
      player: "answer-regulator",
      enemy: "emergency-reset",
      actor: "controller",
      card: "emergency-reset",
      target: "regulator",
      posture: "Preparing an automatic reset",
    },
    {
      player: "establish-bollard-control",
      enemy: "purge-control",
      actor: "controller",
      card: "purge-control",
      target: "gate-actuator",
      posture: "Contesting Actuator Control",
    },
    {
      player: "prepare-service-route",
      enemy: "seal-gap",
      actor: "controller",
      card: "seal-gap",
      target: "service-gap",
      posture: "Closing the service shutter",
    },
    {
      player: "establish-lift-control",
      enemy: "lift-recall",
      actor: "controller",
      card: "lift-recall",
      target: "service-lift",
      posture: "Preparing lift recall",
    },
  ];
  for (const response of adaptiveResponses) {
    if (
      hasPublic(response.player) &&
      !enemyHas(next, response.enemy) &&
      cardInEnemyHand(next, response.actor, response.card)
    ) {
      const candidate = enemyActionDefinition(
        response.enemy,
        response.actor,
        response.card,
        response.target,
        { posture: response.posture },
      );
      if (candidate.totalCost <= enemyAvailableCommand(next)) {
        return commitEnemyAction(next, candidate);
      }
    }
  }

  next.consecutivePasses += 1;
  next.planningHistory.push({ side: "enemy", type: "pass" });
  next.priority = "player";
  return { state: next, acted: false };
}

export function createFracturedGateState(buildId = "battle-exploration") {
  const initial = makeInitialState(buildId);
  return takeEnemyPriority(initial, "opening").state;
}

export function resetFracturedGate(state) {
  return createFracturedGateState(state.buildId);
}

export function changeFracturedGateBuild(state, buildId) {
  if (!BUILDS.some((build) => build.id === buildId)) return state;
  return createFracturedGateState(buildId);
}

export function availableCommand(state) {
  if (state.phase !== "planning") return Math.max(0, state.command);
  return Math.max(
    0,
    state.command -
      state.plan.reduce((sum, action) => sum + action.totalCost, 0),
  );
}

export function availableEnemyCommand(state) {
  return enemyAvailableCommand(state);
}

export function paidActionCount(state) {
  return (
    state.planningActionCount +
    state.plan.filter((action) => action.paid).length
  );
}

function withWarning(state, warning) {
  const next = clone(state);
  next.warning = warning;
  return next;
}

function activeEnemyPositions(state) {
  return new Set(
    Object.values(state.enemies)
      .filter((enemy) => ACTIVE_ENEMY_STATUSES.has(enemy.status))
      .map((enemy) => enemy.position),
  );
}

function isBlocked(state, id, view = null) {
  if (!BOARD_TILES[id]) return true;
  if (
    state.divider.status !== "breached" &&
    [tileId(8, 5), tileId(8, 6)].includes(id)
  ) {
    return true;
  }
  const occupants = activeEnemyPositions(state);
  if (view?.position === id) return false;
  return occupants.has(id);
}

function ordinaryNeighbors(state, id, view = null) {
  const point = coordFromTile(id);
  if (!point) return [];
  const [x, y] = point;
  const results = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    const nextId = tileId(nx, ny);
    if (!WALKABLE.has(coordKey(nx, ny)) || isBlocked(state, nextId, view)) {
      continue;
    }
    if (dx !== 0 && dy !== 0) {
      const sideA = tileId(x + dx, y);
      const sideB = tileId(x, y + dy);
      if (isBlocked(state, sideA, view) || isBlocked(state, sideB, view)) {
        continue;
      }
    }
    results.push(nextId);
  }
  return results;
}

function terrainCost(id) {
  const point = coordFromTile(id);
  if (!point) return 99;
  return TERRAIN_BY_COORD.get(coordKey(point[0], point[1])) === "rubble"
    ? 2
    : 1;
}

function reachablePaths(state, from, budget, view = null) {
  const best = new Map([[from, { cost: 0, path: [from] }]]);
  const queue = [from];
  while (queue.length) {
    queue.sort((left, right) => best.get(left).cost - best.get(right).cost);
    const current = queue.shift();
    const currentData = best.get(current);
    for (const next of ordinaryNeighbors(state, current, view)) {
      const cost = currentData.cost + terrainCost(next);
      if (cost > budget || (best.has(next) && best.get(next).cost <= cost)) {
        continue;
      }
      best.set(next, { cost, path: [...currentData.path, next] });
      queue.push(next);
    }
  }
  best.delete(from);
  return best;
}

function planningView(state) {
  const view = {
    position: state.position,
    freeRepositionUsed: state.freeRepositionUsed,
    dividerOpen: state.divider.status === "breached",
    upperPrepared: state.upperRoute.prepared,
    servicePrepared: state.serviceRoute.prepared,
    liftDeployed: state.lift.deployed,
    regulatorExposed: state.flags.regulatorExposed,
    controlMode: state.actuator.controlled ? state.actuator.mode : null,
    pathHistory: [],
  };
  for (const action of state.plan) {
    if (action.path?.length) {
      view.pathHistory.push(...action.path.slice(1));
      view.position = action.path.at(-1);
    }
    switch (action.id) {
      case "reposition":
        view.freeRepositionUsed = true;
        break;
      case "answer-divider":
        view.dividerOpen = true;
        break;
      case "cross-breach":
        view.position = tileId(10, 5);
        break;
      case "cross-upper-route":
        view.position = tileId(9, 3);
        break;
      case "cross-service-route":
        view.position = tileId(10, 6);
        break;
      case "cross-lift":
        view.position = tileId(9, 2);
        break;
      case "leave":
        view.position = tileId(1, 6);
        break;
      case "answer-regulator":
        view.regulatorExposed = true;
        break;
      case "prepare-upper-route":
        view.upperPrepared = true;
        break;
      case "prepare-service-route":
        view.servicePrepared = true;
        break;
      case "establish-bollard-control":
        view.controlMode = "bollard";
        break;
      case "establish-lift-control":
        view.controlMode = "lift";
        break;
      case "execute-lift":
        view.liftDeployed = true;
        break;
      default:
        break;
    }
  }
  return view;
}

function routeKind(path) {
  const terrain = new Set(
    (path ?? [])
      .map(coordFromTile)
      .filter(Boolean)
      .map(([x, y]) => TERRAIN_BY_COORD.get(coordKey(x, y)) ?? "ordinary"),
  );
  if (terrain.has("rubble")) return "rubble";
  if (terrain.has("powered")) return "powered";
  if (terrain.has("clear")) return "clear";
  return "ordinary";
}

export function tempoComparisonForRoute(route, poweredFeed = "toward-divider") {
  const enemy = 6;
  if (route === "rubble") {
    return {
      route,
      player: 4,
      enemy,
      outcome: "enemy_first",
      link: "Broken",
      reason: "Rubble breaks the movement-to-contact link.",
    };
  }
  if (route === "powered" && poweredFeed === "toward-divider") {
    return {
      route,
      player: 7,
      enemy,
      outcome: "player_first",
      link: "Accelerated",
      reason: "The powered service track carries momentum toward contact.",
    };
  }
  return {
    route,
    player: 6,
    enemy,
    outcome: "simultaneous",
    link: "Preserved",
    reason: "The clear approach preserves Follow Through.",
  };
}

function latestApproach(state) {
  const paths = state.plan
    .filter((action) => ["reposition", "advance"].includes(action.id))
    .flatMap((action) => action.path ?? []);
  return routeKind(paths);
}

function contextCardsForAction(state, actionId) {
  if (
    actionId === "answer-divider" &&
    latestApproach(state) === "clear" &&
    !state.flags.contextCardUsed &&
    !state.plan.some((action) => action.cardId === "follow-through")
  ) {
    return ["follow-through"];
  }
  return [];
}

export function getAvailableContextCards(state, actionId = null) {
  return actionId ? contextCardsForAction(state, actionId) : [];
}

function legalMovementTargets(state, actionId) {
  const view = planningView(state);
  const range = actionId === "reposition" ? 1 : ACTIONS[actionId].range;
  return [...reachablePaths(state, view.position, range, view).keys()];
}

function legalTargetsForAction(state, actionId) {
  if (["reposition", "advance"].includes(actionId)) {
    return legalMovementTargets(state, actionId);
  }
  switch (actionId) {
    case "attack":
      return Object.values(state.enemies)
        .filter((enemy) => ACTIVE_ENEMY_STATUSES.has(enemy.status))
        .map((enemy) => enemy.id);
    case "guard":
      return ["player"];
    case "guard-gate":
      return ["gate"];
    case "stabilize-gate":
      return ["gate"];
    case "recover-cache":
      return ["field-cache"];
    case "leave":
      return ["west-exit"];
    case "answer-divider":
      return ["cracked-divider"];
    case "cross-breach":
      return [tileId(10, 5)];
    case "angle-clash":
      return ["defensive-bollard"];
    case "prepare-upper-route":
    case "contest-upper-landing":
      return ["upper-crossing"];
    case "cross-upper-route":
      return [tileId(9, 3)];
    case "answer-regulator":
    case "suppress-regulator":
      return ["breacher"];
    case "establish-bollard-control":
    case "hold-actuator":
    case "redirect-track":
      return ["gate-actuator"];
    case "execute-bollard":
      return ["defensive-bollard"];
    case "prepare-service-route":
    case "suppress-service-closure":
      return ["service-gap"];
    case "cross-service-route":
      return [tileId(10, 6)];
    case "establish-lift-control":
      return ["lift-relay"];
    case "execute-lift":
      return ["service-lift"];
    case "cross-lift":
      return [tileId(9, 2)];
    default:
      return [];
  }
}

function actionPath(state, actionId, targetId) {
  if (!["reposition", "advance"].includes(actionId)) return null;
  const view = planningView(state);
  const range = actionId === "reposition" ? 1 : ACTIONS[actionId].range;
  return reachablePaths(state, view.position, range, view).get(targetId)?.path ?? null;
}

function cardReserved(state, cardId) {
  return state.plan.some((action) => action.cardId === cardId);
}

function validateAction(state, actionId, targetId, cardId = null, replacing = false) {
  const action = ACTIONS[actionId];
  if (!action) return "Unknown action.";
  if (state.phase !== "planning") return "Actions are available only during Planning.";
  if (state.priority !== "player") return "The enemy squad currently has priority.";
  if (state.hand.length > CORE_RULES.retainLimit) {
    return `Retain ${CORE_RULES.retainLimit} cards before planning.`;
  }
  const build = getBuild(state.buildId);
  const view = planningView(state);
  if (!targetId || !legalTargetsForAction(state, actionId).includes(targetId)) {
    return "Choose a highlighted legal target directly on the board.";
  }
  const replaced = replacing
    ? state.plan.find((candidate) => candidate.status === "open")
    : null;
  const effectivePaid = paidActionCount(state) - (replaced?.paid ? 1 : 0);
  if (action.paid && effectivePaid >= CORE_RULES.paidActionCap) {
    return "Four paid actions is the hard cap.";
  }
  if (actionId === "reposition" && view.freeRepositionUsed) {
    return "The one free ordinary Reposition is already committed.";
  }
  if (actionId === "stabilize-gate") {
    const [x, y] = coordFromTile(view.position) ?? [];
    if (!x || Math.abs(x - 12) + Math.abs(y - 5) > 2) {
      return "Reach Gate Platform before stabilizing the Gate.";
    }
    if (state.gate.status === "failed") return "The Gate has already failed.";
  }
  if (actionId === "recover-cache" && view.position !== tileId(6, 2)) {
    return "Reach the Upper Walk Field Cache before recovering it.";
  }
  if (actionId === "leave" && view.position !== tileId(2, 6)) {
    return "Return adjacent to West Exit before leaving.";
  }
  if (actionId === "attack") {
    const enemy = state.enemies[targetId];
    const [playerX, playerY] = coordFromTile(view.position) ?? [];
    const [enemyX, enemyY] = coordFromTile(enemy?.position) ?? [];
    if (
      playerX == null ||
      enemyX == null ||
      Math.max(Math.abs(playerX - enemyX), Math.abs(playerY - enemyY)) > 2
    ) {
      return "Move within two tactical tiles before declaring this attack.";
    }
  }
  const buildRules = {
    "answer-divider": "battle-exploration",
    "angle-clash": "battle-exploration",
    "prepare-upper-route": "exploration-battle",
    "contest-upper-landing": "exploration-battle",
    "answer-regulator": "battle-hacking",
    "suppress-regulator": "battle-hacking",
    "establish-bollard-control": "hacking-battle",
    "hold-actuator": "hacking-battle",
    "execute-bollard": "hacking-battle",
    "prepare-service-route": "exploration-hacking",
    "suppress-service-closure": "exploration-hacking",
    "establish-lift-control": "hacking-exploration",
    "execute-lift": "hacking-exploration",
  };
  if (buildRules[actionId] && build.id !== buildRules[actionId]) {
    return `${ACTIONS[actionId].label} is not enabled by this ordered build.`;
  }
  if (
    ["answer-divider", "answer-regulator"].includes(actionId) &&
    !ACTIVE_ENEMY_STATUSES.has(state.enemies.breacher.status)
  ) {
    return "The Breacher no longer presents this hostile Commitment.";
  }
  if (["answer-divider", "answer-regulator"].includes(actionId)) {
    const [playerX, playerY] = coordFromTile(view.position) ?? [];
    const [breacherX, breacherY] =
      coordFromTile(state.enemies.breacher.position) ?? [];
    if (
      playerX == null ||
      breacherX == null ||
      Math.max(
        Math.abs(playerX - breacherX),
        Math.abs(playerY - breacherY),
      ) > 2
    ) {
      return "Approach within two tactical tiles before answering the Commitment.";
    }
  }
  if (actionId === "cross-breach" && !view.dividerOpen) {
    return "The Divider breach does not exist.";
  }
  if (actionId === "angle-clash" && !view.dividerOpen) {
    return "The safe collision line requires the Divider breach.";
  }
  if (actionId === "angle-clash" && view.position !== tileId(10, 5)) {
    return "Cross the Divider opening before angling contact at Gate access.";
  }
  if (
    actionId === "prepare-upper-route" &&
    ![tileId(6, 3), tileId(7, 3)].includes(view.position)
  ) {
    return "Reach the west Upper Walk before preparing its crossing.";
  }
  if (actionId === "contest-upper-landing" && !view.upperPrepared) {
    return "Prepare the Upper Route before protecting its landing.";
  }
  if (actionId === "cross-upper-route" && !view.upperPrepared) {
    return "No prepared Upper Route exists.";
  }
  if (actionId === "suppress-regulator" && !view.regulatorExposed) {
    return "Expose the regulator before suppressing its reset.";
  }
  if (
    ["establish-bollard-control", "hold-actuator", "redirect-track"].includes(actionId) &&
    view.position !== tileId(7, 7)
  ) {
    return "Physical Gate Actuator access is required.";
  }
  if (actionId === "hold-actuator" && view.controlMode !== "bollard") {
    return "Establish Bollard Control before holding access.";
  }
  if (
    actionId === "execute-bollard" &&
    (!state.actuator.controlled || state.actuator.mode !== "bollard")
  ) {
    return "Persistent Bollard Control is required.";
  }
  if (actionId === "suppress-service-closure" && !view.servicePrepared) {
    return "Prepare the Service Route before suppressing closure.";
  }
  if (actionId === "cross-service-route" && !view.servicePrepared) {
    return "No prepared Service Route exists.";
  }
  if (
    actionId === "establish-lift-control" &&
    view.position !== tileId(5, 8)
  ) {
    return "Physical Lift Relay access is required.";
  }
  if (
    actionId === "execute-lift" &&
    (!state.actuator.controlled || state.actuator.mode !== "lift")
  ) {
    return "Persistent Lift Control is required.";
  }
  if (actionId === "cross-lift" && !view.liftDeployed) {
    return "Align the Service Lift before crossing.";
  }
  if (cardId) {
    const card = CARDS[cardId];
    const contextAvailable = contextCardsForAction(state, actionId).includes(cardId);
    if (
      !card ||
      ((!state.hand.includes(cardId) || cardReserved(state, cardId)) &&
        !contextAvailable)
    ) {
      return "That card is not available.";
    }
    const compatible =
      card.compatibility.includes(action.compatibilityKey) ||
      (cardId === "fallback-guard" && action.paid);
    if (!compatible) return "That card is not compatible with this action.";
  }
  const cardCost = cardId ? CARDS[cardId].cost : 0;
  const availableWithReplacement =
    availableCommand(state) + (replaced?.totalCost ?? 0);
  if (availableWithReplacement < action.cost + cardCost) {
    return "Not enough Command remains for this commitment.";
  }
  return null;
}

function targetPositionForFocus(focusId) {
  if (BOARD_TILES[focusId]) return focusId;
  return BOARD_FOCUSES[focusId]?.tileId ?? null;
}

function makeChoice(state, actionId, targets = legalTargetsForAction(state, actionId)) {
  const definition = ACTIONS[actionId];
  const firstTarget = targets[0] ?? null;
  const error = firstTarget
    ? validateAction(state, actionId, firstTarget)
    : "No legal target is currently available.";
  return {
    ...definition,
    legalTargets: targets,
    legal: !error,
    reason: error,
  };
}

function inspectChoice() {
  return {
    id: "inspect",
    parent: "Inspect",
    label: "Inspect",
    description: "Open concise visible details for this board element.",
    cost: 0,
    paid: false,
    lane: "Now",
    tempo: null,
    legalTargets: [],
    legal: true,
    reason: null,
    immediate: true,
  };
}

function movementChoices(state, focusId) {
  const target = targetPositionForFocus(focusId);
  if (!target) return [];
  const choices = [];
  for (const actionId of ["reposition", "advance"]) {
    const legalTargets = legalMovementTargets(state, actionId);
    if (legalTargets.includes(target)) {
      choices.push(makeChoice(state, actionId, [target]));
    }
  }
  if (focusId === "breach" && planningView(state).dividerOpen) {
    choices.push(makeChoice(state, "cross-breach"));
  }
  if (focusId === "upper-route" && planningView(state).upperPrepared) {
    choices.push(makeChoice(state, "cross-upper-route"));
  }
  if (focusId === "service-route" && planningView(state).servicePrepared) {
    choices.push(makeChoice(state, "cross-service-route"));
  }
  if (focusId === "service-lift" && planningView(state).liftDeployed) {
    choices.push(makeChoice(state, "cross-lift"));
  }
  return choices;
}

function disciplineChoices(state, focusId) {
  const view = planningView(state);
  const ids = [];
  if (["breacher-intent", "cracked-divider"].includes(focusId)) {
    if (state.buildId === "battle-exploration") ids.push("answer-divider");
    if (state.buildId === "battle-hacking") ids.push("answer-regulator");
  }
  if (["defensive-bollard", "guard"].includes(focusId)) {
    if (state.buildId === "battle-exploration" && view.dividerOpen) {
      ids.push("angle-clash");
    }
    if (state.buildId === "hacking-battle" && state.actuator.controlled) {
      ids.push("execute-bollard");
    }
  }
  if (["upper-crossing", "upper-route"].includes(focusId)) {
    if (state.buildId === "exploration-battle") {
      ids.push(view.upperPrepared ? "contest-upper-landing" : "prepare-upper-route");
    }
  }
  if (["breacher", "regulator"].includes(focusId)) {
    if (state.buildId === "battle-hacking") {
      ids.push(view.regulatorExposed ? "suppress-regulator" : "answer-regulator");
    }
  }
  if (focusId === "gate-actuator") {
    if (state.buildId === "hacking-battle") {
      ids.push(
        view.controlMode === "bollard"
          ? "hold-actuator"
          : "establish-bollard-control",
      );
    }
    if (getBuild(state.buildId).major === "hacking") ids.push("redirect-track");
  }
  if (["service-gap", "service-route"].includes(focusId)) {
    if (state.buildId === "exploration-hacking") {
      ids.push(
        view.servicePrepared
          ? "suppress-service-closure"
          : "prepare-service-route",
      );
    }
  }
  if (["lift-relay", "service-lift"].includes(focusId)) {
    if (state.buildId === "hacking-exploration") {
      ids.push(
        view.controlMode === "lift"
          ? "execute-lift"
          : "establish-lift-control",
      );
    }
  }
  return [...new Set(ids)].map((id) => makeChoice(state, id));
}

export function getContextActionGroups(state, focusId) {
  const groups = [];
  const movement = movementChoices(state, focusId);
  if (movement.length) groups.push({ parent: "Move", choices: movement });

  if (Object.keys(state.enemies).includes(focusId)) {
    groups.push({ parent: "Attack", choices: [makeChoice(state, "attack", [focusId])] });
  }
  if (focusId === "player") {
    groups.push({ parent: "Defend", choices: [makeChoice(state, "guard")] });
  }
  if (
    ["gate", "breacher-intent"].includes(focusId) &&
    planningView(state).position === tileId(10, 5)
  ) {
    groups.push({ parent: "Defend", choices: [makeChoice(state, "guard-gate")] });
  }

  const disciplines = disciplineChoices(state, focusId);
  if (disciplines.length) {
    groups.push({ parent: "Discipline", choices: disciplines });
  }

  if (focusId === "gate") {
    groups.push({ parent: "Use", choices: [makeChoice(state, "stabilize-gate")] });
  }
  if (focusId === "field-cache") {
    groups.push({ parent: "Use", choices: [makeChoice(state, "recover-cache")] });
  }
  if (focusId === "west-exit") {
    groups.push({ parent: "Leave", choices: [makeChoice(state, "leave")] });
  }

  groups.push({ parent: "Inspect", choices: [inspectChoice()] });
  return groups.slice(0, CORE_RULES.normalImmediateChoices);
}

export function getCompatibleCards(state, actionId) {
  const action = ACTIONS[actionId];
  if (!action) return [];
  const prepared = state.hand
    .filter((cardId) => !cardReserved(state, cardId))
    .filter((cardId) => {
      const card = CARDS[cardId];
      return (
        card.compatibility.includes(action.compatibilityKey) ||
        (cardId === "fallback-guard" && action.paid)
      );
    });
  return [...prepared, ...contextCardsForAction(state, actionId)];
}

function makePlannedAction(state, actionId, targetId, cardId = null) {
  const definition = ACTIONS[actionId];
  const card = cardId ? CARDS[cardId] : null;
  const path = actionPath(state, actionId, targetId);
  const concealed =
    Boolean(cardId) &&
    ["Modifier", "Contingency", "Context Extension", "Preparation"].includes(
      card?.kind,
    );
  return {
    ...definition,
    targetId,
    targetName:
      BOARD_FOCUSES[targetId]?.name ??
      BOARD_TILES[targetId]?.name ??
      titleCase(targetId),
    path,
    route: path ? routeKind(path) : null,
    cardId,
    cardName: card?.name ?? null,
    cardCost: card?.cost ?? 0,
    contextCard: Boolean(card?.context),
    concealed,
    totalCost: definition.cost + (card?.cost ?? 0),
    instanceId: `plan-${state.nextActionSequence}`,
    sequence: state.nextActionSequence,
    status: "open",
  };
}

export function previewAction(
  state,
  actionId,
  targetId,
  cardId = null,
  replacing = false,
) {
  const error = validateAction(state, actionId, targetId, cardId, replacing);
  if (error) return { legal: false, error };
  const next = clone(state);
  const action = makePlannedAction(next, actionId, targetId, cardId);
  if (replacing) {
    const index = next.plan.findIndex((item) => item.status === "open");
    if (index < 0) return { legal: false, error: "No Open action can be changed." };
    action.instanceId = next.plan[index].instanceId;
    action.sequence = next.plan[index].sequence;
    action.status = "solid";
    next.plan[index] = action;
  } else {
    solidifyNewest(next.plan);
    next.plan.push(action);
  }
  return {
    legal: true,
    action,
    projection: projectPlan(next),
  };
}

export function queueAction(state, actionId, targetId, cardId = null) {
  const error = validateAction(state, actionId, targetId, cardId);
  if (error) return withWarning(state, error);
  let next = clone(state);
  const action = makePlannedAction(next, actionId, targetId, cardId);
  solidifyNewest(next.plan);
  next.plan.push(action);
  next.nextActionSequence += 1;
  if (actionId === "reposition") next.freeRepositionUsed = true;
  next.consecutivePasses = 0;
  next.planningHistory.push({
    side: "player",
    type: "commit",
    actionId,
    targetId,
    concealedModifier: Boolean(action.concealed),
  });
  next.warning = "";
  next = takeEnemyPriority(next, "player-commit").state;
  return maybeLockAfterPasses(next);
}

export function pivotOpenAction(state, actionId, targetId, cardId = null) {
  if (state.playerPivotUsed) {
    return withWarning(state, "This allotment's one Pivot is already spent.");
  }
  const index = state.plan.findIndex((action) => action.status === "open");
  if (index < 0) {
    return withWarning(state, "No newest Open action can be changed.");
  }
  const error = validateAction(state, actionId, targetId, cardId, true);
  if (error) return withWarning(state, error);
  let next = clone(state);
  const prior = next.plan[index];
  const replacement = makePlannedAction(next, actionId, targetId, cardId);
  replacement.instanceId = prior.instanceId;
  replacement.sequence = prior.sequence;
  replacement.status = "solid";
  next.plan[index] = replacement;
  next.playerPivotUsed = true;
  next.consecutivePasses = 0;
  next.planningHistory.push({
    side: "player",
    type: "pivot",
    from: prior.id,
    actionId,
    targetId,
    concealedModifier: Boolean(replacement.concealed),
  });
  next.warning = "";
  next = takeEnemyPriority(next, "player-pivot").state;
  return maybeLockAfterPasses(next);
}

export function removePlanAction(state, instanceId) {
  if (state.phase !== "planning") return state;
  const action = state.plan.find((candidate) => candidate.instanceId === instanceId);
  if (!action || action.status !== "open") {
    return withWarning(
      state,
      "Earlier solid commitments cannot be erased. Change only the newest Open action.",
    );
  }
  return withWarning(
    state,
    "Use Change Newest so the replacement spends the bounded Pivot immediately.",
  );
}

export function reorderPlanAction(state) {
  return withWarning(
    state,
    "Committed actions keep their causal order; earlier commitments cannot be reordered.",
  );
}

export function refocusCards(state, cardIds) {
  if (state.phase !== "planning" || state.priority !== "player") return state;
  const unique = [...new Set(cardIds)];
  if (state.refocusUsed) {
    return withWarning(state, "Refocus is available once per planning cycle.");
  }
  if (unique.length < 1 || unique.length > 2) {
    return withWarning(state, "Choose one or two cards to Refocus.");
  }
  if (paidActionCount(state) >= CORE_RULES.paidActionCap) {
    return withWarning(state, "Refocus would exceed the four-paid-action cap.");
  }
  if (availableCommand(state) < 4) {
    return withWarning(state, "Refocus requires 4 Command.");
  }
  if (
    unique.some(
      (cardId) =>
        !state.hand.includes(cardId) || cardReserved(state, cardId),
    )
  ) {
    return withWarning(state, "Only uncommitted Prepared Cards can be Refocused.");
  }
  let next = clone(state);
  const drawn = [];
  for (const cardId of unique) {
    next.hand.splice(next.hand.indexOf(cardId), 1);
    next.discard.push(cardId);
  }
  while (drawn.length < unique.length && next.drawIndex < next.deck.length) {
    const cardId = next.deck[next.drawIndex];
    next.drawIndex += 1;
    next.hand.push(cardId);
    drawn.push(cardId);
  }
  next.command -= 4;
  next.planningActionCount += 1;
  next.refocusUsed = true;
  next.refocusRecord = { discarded: unique, drawn, cost: 4 };
  next.planningHistory.push({ side: "player", type: "refocus", count: unique.length });
  next.consecutivePasses = 0;
  next = takeEnemyPriority(next, "player-refocus").state;
  return maybeLockAfterPasses(next);
}

export function discardToRetain(state, cardId) {
  if (state.phase !== "planning" || state.hand.length <= CORE_RULES.retainLimit) {
    return state;
  }
  if (!state.hand.includes(cardId) || cardReserved(state, cardId)) return state;
  const next = clone(state);
  next.hand.splice(next.hand.indexOf(cardId), 1);
  next.discard.push(cardId);
  return next;
}

function dynamicSnapshot(state) {
  return clone({
    buildId: state.buildId,
    position: state.position,
    condition: state.condition,
    guard: state.guard,
    majorState: state.majorState,
    gate: state.gate,
    enemies: state.enemies,
    divider: state.divider,
    actuator: state.actuator,
    bollard: state.bollard,
    upperRoute: state.upperRoute,
    serviceRoute: state.serviceRoute,
    lift: state.lift,
    poweredTrack: state.poweredTrack,
    cache: state.cache,
    westExit: state.westExit,
    retreated: state.retreated,
    flags: state.flags,
  });
}

function applySnapshot(state, snapshot) {
  const next = clone(state);
  for (const [key, value] of Object.entries(snapshot)) {
    next[key] = clone(value);
  }
  return next;
}

function createPackets() {
  return Object.fromEntries(
    LANE_ORDER.map((lane) => [
      lane,
      {
        lane,
        events: [],
        snapshot: null,
      },
    ]),
  );
}

function logEvent(
  packets,
  lane,
  action,
  title,
  detail,
  outcome = "resolved",
  extra = {},
) {
  packets[lane].events.push({
    actionId: action?.id ?? "system",
    instanceId: action?.instanceId ?? `system-${packets[lane].events.length}`,
    actorId: action?.actorId ?? "system",
    title,
    detail,
    outcome,
    ...extra,
  });
}

function invalidate(sim, packets, lane, action, reason) {
  const refundable = action.contextCard
    ? action.cost
    : action.totalCost;
  sim.refunds += Math.floor(refundable / 2);
  logEvent(
    packets,
    lane,
    action,
    `${action.label} invalidated`,
    `${reason} No retarget occurred.`,
    "invalidated_before_begin",
  );
}

function impactActor(actor, impact) {
  const absorbed = Math.min(actor.guard, impact);
  actor.guard -= absorbed;
  actor.condition = Math.max(0, actor.condition - (impact - absorbed));
  if (actor.condition === 0) actor.status = "disabled";
}

function applyPlayerMovement(sim, packets, action) {
  const destination = action.path?.at(-1);
  if (!destination) {
    invalidate(sim, packets, "Standard", action, "The declared path was unavailable.");
    return;
  }
  sim.position = destination;
  sim.movementPath.push(...action.path.slice(1));
  if (action.cardId === "covering-step") sim.guard += 2;
  logEvent(
    packets,
    "Standard",
    action,
    action.label,
    `Player moved to tile ${coordFromTile(destination).join(",")}. ${titleCase(action.route)} route.`,
  );
}

function applyCycleOneClash(sim, packets, playerAction, enemyAction) {
  const route = latestApproach(sim._state);
  const comparison = tempoComparisonForRoute(
    route,
    sim.poweredTrack.feed,
  );
  const hasFollow = playerAction.cardId === "follow-through";
  const effective =
    hasFollow || route !== "clear"
      ? comparison
      : {
          ...comparison,
          player: 5,
          outcome: "enemy_first",
          link: "Unlinked",
          reason: "No Follow Through modifier was attached.",
        };
  if (effective.outcome === "enemy_first") {
    sim.enemies.breacher.guard += 3;
  }
  sim.divider.integrity = 0;
  sim.divider.status = "breached";
  sim.enemies.breacher.guard = 0;
  sim.enemies.breacher.condition = Math.max(1, sim.enemies.breacher.condition - 4);
  sim.enemies.breacher.status = "staggered";
  sim.guard = 0;
  sim.condition = Math.max(1, sim.condition - 1);
  sim.flags.turningPoint = "divider";
  sim.flags.contextCardUsed ||= hasFollow;
  sim.majorState = {
    type: "battle",
    name: "Battle Advantage",
    status: "active",
  };
  logEvent(
    packets,
    "Standard",
    playerAction,
    "CLASH · Divider contact",
    `The plans met ${effective.outcome === "simultaneous" ? "simultaneously" : effective.outcome === "player_first" ? "with the player ahead" : "with the Breacher ahead"}. Opposed Force broke the Divider; Shield Link prevented full displacement; Impact Counter damaged the player.`,
    "simultaneous_contact",
    {
      clash: true,
      contact: {
        risk: "high",
        timing: effective.outcome,
        location: "Cracked Divider",
        playerTempo: effective.player,
        enemyTempo: effective.enemy,
        link: effective.link,
        reason: effective.reason,
      },
    },
  );
  sim.handled.add(playerAction.instanceId);
  sim.handled.add(enemyAction.instanceId);
}

function applyGateLaneClash(sim, packets, playerAction, enemyAction) {
  sim.position = tileId(10, 5);
  sim.bollard.status = "jammed";
  sim.enemies.guard.condition = Math.max(1, sim.enemies.guard.condition - 3);
  sim.enemies.guard.guard = Math.max(0, sim.enemies.guard.guard - 3);
  sim.flags.turningPoint = "bollard";
  logEvent(
    packets,
    "Standard",
    playerAction,
    "CLASH · Gate access",
    "Angle the Contact and Brace Line reached the bollard together. The Guard held its edge, the bollard jammed open, and the player gained the Gate-adjacent tile.",
    "simultaneous_contact",
    {
      clash: true,
      contact: {
        risk: "high",
        timing: "simultaneous",
        location: "Defensive Bollard",
        playerTempo: 6,
        enemyTempo: 6,
        link: "Preserved",
      },
    },
  );
  sim.handled.add(playerAction.instanceId);
  sim.handled.add(enemyAction.instanceId);
}

function applyDefendedGateClash(sim, packets, enemyAction) {
  const absorbed = Math.min(sim.guard, 5);
  sim.guard -= absorbed;
  sim.condition = Math.max(1, sim.condition - Math.max(0, 5 - absorbed));
  sim.enemies.breacher.condition = Math.max(1, sim.enemies.breacher.condition - 2);
  sim.enemies.breacher.status = "off-balance";
  logEvent(
    packets,
    "Standard",
    enemyAction,
    "CLASH · Defended Gate lane",
    "Guard Gate and Objective Brace held the player in place. The Breacher spent its Force against the defense and never reached the Gate.",
    "simultaneous_contact",
    {
      clash: true,
      contact: {
        risk: "high",
        timing: "player_guard_first",
        location: "Gate lane",
        playerTempo: 7,
        enemyTempo: 5,
        link: "Guard established",
      },
    },
  );
  sim.handled.add(enemyAction.instanceId);
}

function applyPlayerAction(sim, packets, action) {
  if (sim.handled.has(action.instanceId)) return;
  switch (action.id) {
    case "reposition":
    case "advance":
      applyPlayerMovement(sim, packets, action);
      return;
    case "guard":
      sim.guard += 4;
      logEvent(packets, "Fast", action, "Guard established", "Player gained 4 Guard.");
      return;
    case "guard-gate":
      sim.guard += 4;
      sim.flags.playerGuardedGate = true;
      logEvent(
        packets,
        "Fast",
        action,
        "Gate lane guarded",
        "The player's defense will establish before Standard contact.",
      );
      return;
    case "attack": {
      const enemy = sim.enemies[action.targetId];
      if (!enemy || !ACTIVE_ENEMY_STATUSES.has(enemy.status)) {
        invalidate(sim, packets, action.lane, action, "The declared enemy was no longer legal.");
        return;
      }
      impactActor(enemy, 5);
      logEvent(
        packets,
        action.lane,
        action,
        "Weapon Attack",
        `${enemy.name} now has ${enemy.condition} Condition and ${enemy.guard} Guard.`,
      );
      return;
    }
    case "answer-divider":
      return;
    case "cross-breach":
      if (sim.divider.status !== "breached") {
        invalidate(sim, packets, action.lane, action, "The Divider breach never opened.");
        return;
      }
      sim.position = tileId(10, 5);
      sim.movementPath.push(tileId(7, 5), tileId(9, 5), tileId(10, 5));
      logEvent(
        packets,
        "Standard",
        action,
        "Divider opening crossed",
        sim.divider.conduit === "charged"
          ? "The skill-revealed upper lip avoided the charged center and reached Gate access."
          : "The player used the public breach to reach Gate access.",
      );
      return;
    case "angle-clash":
      return;
    case "prepare-upper-route":
      sim.upperRoute.prepared = true;
      sim.majorState = { type: "exploration", name: "Prepared Upper Route", status: "active" };
      sim.flags.turningPoint = "upper-route";
      logEvent(packets, action.lane, action, "Upper Route prepared", "The capacity-one natural crossing is now public and contestable.");
      return;
    case "contest-upper-landing":
      if (!sim.upperRoute.prepared) {
        invalidate(sim, packets, action.lane, action, "No Upper Route landing existed.");
        return;
      }
      sim.upperRoute.protected = true;
      logEvent(packets, action.lane, action, "Upper landing contested", "The player protected the landing without erasing the interceptor.");
      return;
    case "cross-upper-route":
      if (!sim.upperRoute.prepared) {
        invalidate(sim, packets, action.lane, action, "The Upper Route was unavailable.");
        return;
      }
      sim.position = tileId(9, 3);
      sim.upperRoute.prepared = false;
      logEvent(packets, action.lane, action, "Upper Route crossed", "The player reached the east Upper Walk.");
      return;
    case "answer-regulator":
      sim.flags.regulatorExposed = true;
      sim.enemies.breacher.status = "staggered";
      sim.enemies.breacher.guard = 0;
      sim.majorState = { type: "battle", name: "Exposed Regulator", status: "active" };
      sim.flags.turningPoint = "regulator";
      logEvent(packets, action.lane, action, "Impact regulator exposed", "Physical contact created a real Hacking opportunity.");
      return;
    case "suppress-regulator":
      if (!sim.flags.regulatorExposed) {
        invalidate(sim, packets, action.lane, action, "The regulator was never exposed.");
        return;
      }
      sim.flags.regulatorResetSuppressed = true;
      logEvent(packets, action.lane, action, "Regulator reset suppressed", "The Breacher's automatic recovery was delayed.");
      return;
    case "establish-bollard-control":
      sim.actuator.controlled = true;
      sim.actuator.mode = "bollard";
      sim.actuator.quietRewrite = action.cardId === "quiet-rewrite";
      sim.majorState = { type: "hacking", name: "Bollard Control", status: "active" };
      sim.flags.turningPoint = "actuator";
      logEvent(packets, action.lane, action, "Actuator Control established", "The bollard Output is available, but physical access remains exposed.");
      return;
    case "hold-actuator":
      if (!sim.actuator.controlled) {
        invalidate(sim, packets, action.lane, action, "Actuator Control was already lost.");
        return;
      }
      sim.actuator.accessHeld = true;
      logEvent(packets, action.lane, action, "Actuator access held", "Battle converted local Control into a defended physical position.");
      return;
    case "execute-bollard":
      if (!sim.actuator.controlled || sim.actuator.mode !== "bollard") {
        invalidate(sim, packets, action.lane, action, "Bollard Control was unavailable.");
        return;
      }
      sim.bollard.status = "extended";
      sim.enemies.breacher.status = "pinned";
      sim.actuator.controlled = false;
      sim.majorState.status = "spent";
      logEvent(packets, action.lane, action, "Bollard Output executed", "The authored machinery pinned the Breacher's physical line.");
      return;
    case "prepare-service-route":
      sim.serviceRoute.prepared = true;
      sim.majorState = { type: "exploration", name: "Prepared Service Route", status: "active" };
      sim.flags.turningPoint = "service-route";
      logEvent(packets, action.lane, action, "Service Route prepared", "The obscured relationship is real; its shutter remains connected.");
      return;
    case "suppress-service-closure":
      if (!sim.serviceRoute.prepared) {
        invalidate(sim, packets, action.lane, action, "No service relationship existed.");
        return;
      }
      sim.serviceRoute.closureSuppressed = true;
      sim.serviceRoute.closing = false;
      logEvent(packets, action.lane, action, "Service shutter suppressed", "The route remains open beyond its first closure response.");
      return;
    case "cross-service-route":
      if (!sim.serviceRoute.prepared) {
        invalidate(sim, packets, action.lane, action, "The Service Route was unavailable.");
        return;
      }
      sim.position = tileId(10, 6);
      logEvent(packets, action.lane, action, "Service Route crossed", "The player reached the rear Gate lane.");
      return;
    case "establish-lift-control":
      sim.actuator.controlled = true;
      sim.actuator.mode = "lift";
      sim.actuator.quietRewrite = action.cardId === "quiet-rewrite";
      sim.majorState = { type: "hacking", name: "Lift Control", status: "active" };
      sim.flags.turningPoint = "lift";
      logEvent(packets, action.lane, action, "Lift Control established", "A later Output can create temporary upper geometry.");
      return;
    case "execute-lift":
      if (!sim.actuator.controlled || sim.actuator.mode !== "lift") {
        invalidate(sim, packets, action.lane, action, "Lift Control was unavailable.");
        return;
      }
      sim.lift.deployed = true;
      sim.lift.resetAfterSettle = true;
      sim.actuator.controlled = false;
      sim.majorState.status = "spent";
      logEvent(packets, action.lane, action, "Service Lift aligned", "A temporary capacity-one bridge now spans the Upper Walk gap.");
      return;
    case "cross-lift":
      if (!sim.lift.deployed) {
        invalidate(sim, packets, action.lane, action, "The lift never aligned.");
        return;
      }
      sim.position = tileId(9, 2);
      logEvent(packets, action.lane, action, "Lift bridge crossed", "The player crossed before the authored Settle reset.");
      return;
    case "redirect-track":
      sim.poweredTrack.feed = "toward-divider";
      logEvent(packets, action.lane, action, "Service track redirected", "The physical feed now accelerates one compatible approach toward the Divider.");
      return;
    case "recover-cache":
      if (sim.position !== tileId(6, 2) || sim.cache.status !== "available") {
        invalidate(sim, packets, action.lane, action, "The Field Cache was no longer reachable.");
        return;
      }
      sim.cache.status = "carried";
      sim.flags.turningPoint = "cache";
      logEvent(packets, action.lane, action, "Field Cache recovered", "The Package is carried only inside this resettable proof.");
      return;
    case "leave":
      if (sim.position !== tileId(2, 6) || sim.westExit.status === "blocked") {
        invalidate(sim, packets, action.lane, action, "The physical West Exit was unavailable.");
        return;
      }
      sim.position = tileId(1, 6);
      sim.retreated = true;
      sim.flags.turningPoint = "retreat";
      logEvent(packets, action.lane, action, "Controlled Retreat", "The player left before becoming unable to withdraw.");
      return;
    case "stabilize-gate":
      if (
        ![tileId(10, 5), tileId(11, 5), tileId(10, 6)].includes(sim.position) ||
        sim.gate.status === "failed"
      ) {
        invalidate(sim, packets, action.lane, action, "Gate access was lost before Work began.");
        return;
      }
      if (sim.gate.workDelayed && action.cardId !== "objective-brace") {
        invalidate(sim, packets, action.lane, action, "Static Tax interrupted unprotected Gate Work.");
        return;
      }
      sim.gate.status = "stabilized";
      sim.flags.objectiveBraceUsed = action.cardId === "objective-brace";
      for (const enemy of Object.values(sim.enemies)) {
        if (ACTIVE_ENEMY_STATUSES.has(enemy.status)) {
          enemy.status = enemy.id === "breacher" ? "driven" : "withdrew";
        }
      }
      sim.flags.turningPoint ??= "stabilize";
      logEvent(packets, "Slow", action, "Gate stabilized", "The defensive seal activated after faster commitments resolved.");
      return;
    default:
      invalidate(sim, packets, action.lane, action, "No deterministic resolver exists.");
  }
}

function applyEnemyAction(sim, packets, action) {
  if (sim.handled.has(action.instanceId)) return;
  switch (action.id) {
    case "shield-link":
      sim.enemies.breacher.guard += 3;
      logEvent(packets, "Fast", action, "Guard linked to Breacher", "Shield Link established before contact.");
      return;
    case "charge-debris":
      if (sim.divider.status !== "breached") {
        logEvent(packets, "Fast", action, "Charge Debris invalidated", "No breached conduit existed.", "invalidated_before_begin");
        return;
      }
      sim.divider.conduit = "charged";
      logEvent(packets, "Fast", action, "Divider conduit charged", "The lower breach became dangerous and slower.");
      return;
    case "body-block":
      sim.enemies.guard.position = tileId(10, 5);
      logEvent(packets, "Standard", action, "Guard occupied Gate access", "The broad body block threatened to invalidate Gate Work.");
      return;
    case "brace-line":
      return;
    case "exit-pressure":
      sim.westExit.status = "threatened";
      sim.enemies.pressure.position = tileId(4, 3);
      logEvent(packets, "Fast", action, "West Exit threatened", "Pressure committed away from the Gate lane to endanger retreat.");
      return;
    case "static-tax":
      sim.gate.workDelayed = true;
      logEvent(packets, "Fast", action, "Static Tax attached", "Gate stabilization will resolve slower and needs protection.");
      return;
    case "impact-rush":
      if (!ACTIVE_ENEMY_STATUSES.has(sim.enemies.breacher.status)) {
        logEvent(packets, "Standard", action, "Impact Rush canceled", "The Breacher was no longer able to commit.", "canceled");
        return;
      }
      if (sim.flags.playerGuardedGate && sim.position === tileId(10, 5)) {
        applyDefendedGateClash(sim, packets, action);
        return;
      }
      sim.gate.stability = Math.max(0, sim.gate.stability - 1);
      if (sim.gate.stability === 0) sim.gate.status = "failed";
      logEvent(
        packets,
        "Standard",
        action,
        "Impact Rush connected",
        sim.gate.status === "failed"
          ? "The final Stability pip was removed. The Gate is lost."
          : `Gate Stability fell to ${sim.gate.stability} of 3.`,
      );
      return;
    case "emergency-reset":
      if (sim.flags.regulatorExposed && !sim.flags.regulatorResetSuppressed) {
        sim.flags.regulatorExposed = false;
        sim.enemies.breacher.status = "active";
        logEvent(packets, "Fast", action, "Regulator reset", "The exposed hardware resealed.");
      } else {
        logEvent(packets, "Fast", action, "Emergency Reset held", "The declared trigger did not remain legal.", "not_triggered");
      }
      return;
    case "purge-control":
      if (sim.actuator.controlled && !sim.actuator.accessHeld) {
        sim.actuator.controlled = false;
        sim.majorState.status = "lost";
        logEvent(packets, action.lane, action, "Actuator Control purged", "The player did not physically hold access.");
      } else {
        logEvent(packets, action.lane, action, "Purge contested", "Physical access prevented the immediate purge.", "blocked");
      }
      return;
    case "seal-gap":
      if (sim.serviceRoute.prepared && !sim.serviceRoute.closureSuppressed) {
        sim.serviceRoute.closing = true;
        logEvent(packets, action.lane, action, "Service shutter closing", "The prepared relationship will close unless suppressed.");
      } else {
        logEvent(packets, action.lane, action, "Seal Gap held", "No legal unsuppressed Route existed.", "not_triggered");
      }
      return;
    case "lift-recall":
      if (sim.lift.deployed) {
        sim.lift.returning = true;
        logEvent(packets, action.lane, action, "Lift recall started", "The bridge will return at Settle.");
      } else {
        logEvent(packets, action.lane, action, "Lift Recall reserved", "The lift Output has not yet occurred.", "not_triggered");
      }
      return;
    case "vault-intercept":
      sim.upperRoute.contested = true;
      logEvent(packets, action.lane, action, "Upper landing intercepted", "The route remains real, but its east landing is contested.");
      return;
    default:
      logEvent(packets, action.lane, action, action.label, `${action.actorName} completed its legal commitment.`);
  }
}

function revealCommittedCards(state, packets, revealSecrets) {
  for (const action of state.plan) {
    if (!action.cardId) continue;
    logEvent(
      packets,
      "Fast",
      action,
      revealSecrets ? `${action.cardName} revealed` : "Player modifier committed",
      revealSecrets
        ? `${action.cardName} modifies ${action.label}.`
        : "One concealed player modifier may change the commitment.",
      "revealed",
    );
  }
  for (const action of state.enemyPlan) {
    if (!action.cardId && !action.modifierCardId) continue;
    const names = [action.cardName, action.modifierCardName].filter(Boolean);
    logEvent(
      packets,
      "Fast",
      action,
      revealSecrets ? `${names.join(" + ")} revealed` : "Enemy commitment prepared",
      revealSecrets
        ? `${action.actorName} committed ${names.join(" and ")} before Lock.`
        : `${action.actorName} has ${names.length} concealed factor${names.length === 1 ? "" : "s"}.`,
      "revealed",
    );
  }
}

function compareEntries(left, right) {
  const laneDelta = LANE_RANK[left.lane] - LANE_RANK[right.lane];
  if (laneDelta !== 0) return laneDelta;
  const tempoDelta = right.tempo - left.tempo;
  if (tempoDelta !== 0) return tempoDelta;
  if (left.side !== right.side) return left.side === "player" ? -1 : 1;
  return left.sequence - right.sequence;
}

function resolutionChainKey(entry) {
  return entry.side === "player" ? "player" : `enemy:${entry.actorId}`;
}

function withEffectiveResolutionLanes(entries) {
  const previousRank = new Map();
  return [...entries]
    .sort((left, right) => left.sequence - right.sequence)
    .map((entry) => {
      const chain = resolutionChainKey(entry);
      const effectiveRank = Math.max(
        LANE_RANK[entry.lane],
        previousRank.get(chain) ?? LANE_RANK.Fast,
      );
      previousRank.set(chain, effectiveRank);
      return {
        ...entry,
        baseLane: entry.lane,
        lane: LANE_ORDER[effectiveRank],
      };
    });
}

function nextRunnableEntries(pending) {
  return pending.filter(
    (candidate) =>
      !pending.some(
        (other) =>
          resolutionChainKey(other) === resolutionChainKey(candidate) &&
          other.sequence < candidate.sequence,
      ),
  );
}

function simulateCycle(state, revealSecrets = false) {
  const sim = dynamicSnapshot(state);
  sim._state = state;
  sim.movementPath = [state.position];
  sim.refunds = 0;
  sim.handled = new Set();
  const packets = createPackets();
  revealCommittedCards(state, packets, revealSecrets);

  const playerDivider = state.plan.find((action) => action.id === "answer-divider");
  const enemyRush = state.enemyPlan.find((action) => action.id === "impact-rush");
  const playerAngle = state.plan.find((action) => action.id === "angle-clash");
  const enemyBrace = state.enemyPlan.find((action) => action.id === "brace-line");

  const entries = withEffectiveResolutionLanes([
    ...state.plan.map((action) => ({ ...action, side: "player" })),
    ...state.enemyPlan.map((action) => ({ ...action, side: "enemy" })),
  ]);

  for (const lane of LANE_ORDER) {
    const pending = entries.filter((candidate) => candidate.lane === lane);
    while (pending.length) {
      const runnable = nextRunnableEntries(pending);
      const paired = [];
      const dividerPlayer = pending.find(
        (entry) => entry.instanceId === playerDivider?.instanceId,
      );
      const dividerEnemy = pending.find(
        (entry) => entry.instanceId === enemyRush?.instanceId,
      );
      if (
        dividerPlayer &&
        dividerEnemy &&
        runnable.includes(dividerPlayer) &&
        runnable.includes(dividerEnemy)
      ) {
        paired.push({
          type: "divider",
          entries: [dividerPlayer, dividerEnemy],
          lane,
          tempo: Math.max(dividerPlayer.tempo, dividerEnemy.tempo),
          side: "player",
          sequence: Math.min(dividerPlayer.sequence, dividerEnemy.sequence),
        });
      }
      const gatePlayer = pending.find(
        (entry) => entry.instanceId === playerAngle?.instanceId,
      );
      const gateEnemy = pending.find(
        (entry) => entry.instanceId === enemyBrace?.instanceId,
      );
      if (
        gatePlayer &&
        gateEnemy &&
        runnable.includes(gatePlayer) &&
        runnable.includes(gateEnemy)
      ) {
        paired.push({
          type: "gate",
          entries: [gatePlayer, gateEnemy],
          lane,
          tempo: Math.max(gatePlayer.tempo, gateEnemy.tempo),
          side: "player",
          sequence: Math.min(gatePlayer.sequence, gateEnemy.sequence),
        });
      }

      const waitingForPair = new Set(
        [
          dividerPlayer && dividerEnemy ? dividerPlayer.instanceId : null,
          dividerPlayer && dividerEnemy ? dividerEnemy.instanceId : null,
          gatePlayer && gateEnemy ? gatePlayer.instanceId : null,
          gatePlayer && gateEnemy ? gateEnemy.instanceId : null,
        ].filter(Boolean),
      );
      const candidates = [
        ...runnable.filter((entry) => !waitingForPair.has(entry.instanceId)),
        ...paired,
      ].sort(compareEntries);
      const nextEntry = candidates[0];
      if (!nextEntry) {
        throw new Error(`Resolution dependency deadlock in ${lane}.`);
      }

      if (nextEntry.type === "divider") {
        applyCycleOneClash(
          sim,
          packets,
          nextEntry.entries[0],
          nextEntry.entries[1],
        );
        for (const pairedEntry of nextEntry.entries) {
          pending.splice(pending.indexOf(pairedEntry), 1);
        }
        continue;
      }
      if (nextEntry.type === "gate") {
        applyGateLaneClash(
          sim,
          packets,
          nextEntry.entries[0],
          nextEntry.entries[1],
        );
        for (const pairedEntry of nextEntry.entries) {
          pending.splice(pending.indexOf(pairedEntry), 1);
        }
        continue;
      }

      if (nextEntry.side === "player") applyPlayerAction(sim, packets, nextEntry);
      else applyEnemyAction(sim, packets, nextEntry);
      pending.splice(pending.indexOf(nextEntry), 1);
    }
    if (lane === "Slow") {
      if (sim.serviceRoute.closing && !sim.serviceRoute.closureSuppressed) {
        sim.serviceRoute.prepared = false;
        sim.serviceRoute.closing = false;
        logEvent(packets, "Slow", null, "Service Route closed", "The unsuppressed shutter removed the prepared relationship.");
      }
      if (
        sim.flags.regulatorExposed &&
        !sim.flags.regulatorResetSuppressed &&
        !state.enemyPlan.some((action) => action.id === "emergency-reset")
      ) {
        sim.flags.regulatorExposed = false;
        sim.enemies.breacher.status = "active";
        logEvent(packets, "Slow", null, "Regulator automatically reset", "The exposed hardware resealed at the end of the cycle.");
      }
      if (
        sim.actuator.controlled &&
        !sim.actuator.quietRewrite &&
        !sim.actuator.accessHeld
      ) {
        sim.actuator.controlled = false;
        sim.majorState.status = "lost";
        logEvent(packets, "Slow", null, "Actuator lockout responded", "Unprotected local Control was lost.");
      }
    }
    const snapshot = clone({
      ...sim,
      _state: undefined,
      handled: undefined,
      movementPath: sim.movementPath,
      refunds: sim.refunds,
    });
    delete snapshot._state;
    delete snapshot.handled;
    packets[lane].snapshot = snapshot;
  }

  const finalSnapshot = clone(sim);
  delete finalSnapshot._state;
  delete finalSnapshot.movementPath;
  delete finalSnapshot.refunds;
  delete finalSnapshot.handled;
  return {
    packets: LANE_ORDER.map((lane) => packets[lane]),
    finalSnapshot,
    movementPath: sim.movementPath,
    refunds: sim.refunds,
  };
}

function contactForecast(state) {
  if (
    playerHas(state, "answer-divider") &&
    enemyHas(state, "impact-rush")
  ) {
    const route = latestApproach(state);
    const attached = state.plan.find((action) => action.id === "answer-divider")?.cardId;
    const comparison =
      attached === "follow-through"
        ? tempoComparisonForRoute(route, state.poweredTrack.feed)
        : {
            ...tempoComparisonForRoute(route, state.poweredTrack.feed),
            player: route === "rubble" ? 4 : 5,
            outcome: "enemy_first",
            link: route === "rubble" ? "Broken" : "Unlinked",
          };
    return {
      risk: "HIGH",
      timing:
        comparison.outcome === "simultaneous"
          ? "Likely even"
          : comparison.outcome === "player_first"
            ? "You likely act first"
            : "Enemy likely acts first",
      location: "Cracked Divider",
      unknown: state.enemyPlan.filter((action) => action.concealed).length,
      link: comparison.link,
      reason: comparison.reason,
      details: `Player ${comparison.player} · Enemy ${comparison.enemy}`,
    };
  }
  if (playerHas(state, "angle-clash") && enemyHas(state, "brace-line")) {
    return {
      risk: "HIGH",
      timing: "Likely even",
      location: "Defensive Bollard",
      unknown: 1,
      link: "Preserved",
      reason: "The safe upper lip preserves the redirected contact line.",
      details: "Player 6 · Enemy 6",
    };
  }
  if (playerHas(state, "guard-gate") && enemyHas(state, "impact-rush")) {
    return {
      risk: "HIGH",
      timing: "Your Guard establishes first",
      location: "Gate lane",
      unknown: state.enemyPlan.filter((action) => action.modifierCardId).length,
      link: "Guard established",
      reason: "Fast Guard precedes the Standard Rush; Stabilize remains Slow.",
      details: "Guard 7 · Rush 5 · Work 3",
    };
  }
  if (state.plan.some((action) => action.id.includes("upper"))) {
    return {
      risk: "MEDIUM–HIGH",
      timing: "Interception possible",
      location: "East Upper Landing",
      unknown: 1,
      link: "Route dependent",
      reason: "Pressure or Guard may contest the capacity-one landing.",
      details: "Open Details after reveal",
    };
  }
  return null;
}

function skillAttribution(state) {
  const lastSpecial = [...state.plan]
    .reverse()
    .find((action) => ACTIONS[action.id]?.attribution);
  if (!lastSpecial) return null;
  return {
    action: lastSpecial.label,
    build: getBuild(state.buildId).name,
    revealed: ACTIONS[lastSpecial.id].attribution.revealed,
    enabled: ACTIONS[lastSpecial.id].attribution.enabled,
    modified: lastSpecial.cardName ?? null,
    opposed:
      state.enemyPlan.at(-1)?.posture ??
      state.enemyPlan.at(-1)?.label ??
      null,
  };
}

function expectedConsequences(state, simulation) {
  const material = [];
  if (simulation.movementPath.length > 1) {
    const destination = BOARD_TILES[simulation.movementPath.at(-1)];
    material.push(
      `Your declared movement reaches ${destination?.name ?? "the selected tile"} if its prerequisites remain legal.`,
    );
  }
  const publicConsequences = {
    "answer-divider":
      "Opposed contact may turn the Cracked Divider into a public opening.",
    "cross-breach":
      "The selected upper lip can preserve the crossing if the breach remains open.",
    "angle-clash":
      "The redirected contact can jam the defensive bollard and contest Gate access.",
    "prepare-upper-route":
      "A natural capacity-one Upper Route will become visible and contestable.",
    "contest-upper-landing":
      "The prepared landing will gain physical protection.",
    "answer-regulator":
      "Physical contact can expose a real regulator and its automatic response.",
    "suppress-regulator":
      "A still-exposed regulator will have its reset delayed.",
    "establish-bollard-control":
      "Local bollard Control will become available while its access remains exposed.",
    "hold-actuator":
      "Physical access can protect existing local Control.",
    "execute-bollard":
      "Existing bollard Control can become one authored physical output.",
    "prepare-service-route":
      "The obscured rear relationship will become real and its shutter can respond.",
    "suppress-service-closure":
      "A prepared service shutter will have its closure delayed.",
    "establish-lift-control":
      "Local lift Control will expose a later temporary-geometry output.",
    "execute-lift":
      "Existing lift Control can create a capacity-one bridge until Settle.",
    "guard-gate":
      "Fast Guard will establish before later Gate pressure.",
    "stabilize-gate":
      "Gate Work resolves Slow and succeeds only if access and protection survive.",
  };
  for (const action of state.plan) {
    const consequence = publicConsequences[action.id];
    if (consequence && !material.includes(consequence)) material.push(consequence);
  }
  if (state.enemyPlan.length) {
    material.push(
      `${state.enemyPlan.length} enemy commitment${state.enemyPlan.length === 1 ? "" : "s"} may interleave; concealed cards remain unrevealed until Lock.`,
    );
  }
  return material.slice(0, 5);
}

function importantRisk(state, finalSnapshot) {
  const contact = contactForecast(state);
  if (contact) {
    return `${contact.risk} contact risk at ${contact.location}. ${contact.unknown} concealed factor${contact.unknown === 1 ? "" : "s"} may alter exact contact.`;
  }
  if (finalSnapshot.gate.stability < state.gate.stability) {
    return "An unopposed Gate-impact commitment removes one visible Stability pip.";
  }
  if (playerHas(state, "prepare-service-route")) {
    return "The enemy formation remains active while the route is established.";
  }
  if (playerHas(state, "execute-lift")) {
    return "The lift returns at Settle and may isolate the player.";
  }
  return "No hidden random roll: material uncertainty comes from labeled concealed commitments.";
}

export function projectPlan(state) {
  const simulation = simulateCycle(state, false);
  const signature = stableHash({
    source: state.sourceRevision,
    seed: state.seed,
    round: state.round,
    initial: dynamicSnapshot(state),
    playerPlan: state.plan.map((action) => ({
      id: action.id,
      targetId: action.targetId,
      cardId: action.cardId,
      totalCost: action.totalCost,
      sequence: action.sequence,
      status: action.status,
    })),
    enemyPlan: state.enemyPlan.map((action) => ({
      id: action.id,
      actorId: action.actorId,
      targetId: action.targetId,
      cardId: action.cardId,
      modifierCardId: action.modifierCardId,
      totalCost: action.totalCost,
      sequence: action.sequence,
      status: action.status,
    })),
  });
  return {
    signature,
    packets: simulation.packets,
    finalSnapshot: simulation.finalSnapshot,
    movementPath: simulation.movementPath,
    ghostPosition:
      simulation.movementPath.at(-1) ?? simulation.finalSnapshot.position,
    expected: expectedConsequences(state, simulation),
    risk: importantRisk(state, simulation.finalSnapshot),
    refunds: simulation.refunds,
    contact: contactForecast(state),
    attribution: skillAttribution(state),
  };
}

function planLockError(state) {
  if (state.phase !== "planning") return "The current phase cannot be locked.";
  if (!state.plan.length && !state.refocusRecord) {
    return "Commit at least one player action before passing to Lock.";
  }
  if (state.hand.length > CORE_RULES.retainLimit) {
    return `Discard to retain ${CORE_RULES.retainLimit} cards before Lock.`;
  }
  if (paidActionCount(state) > CORE_RULES.paidActionCap) {
    return "The player plan exceeds four paid actions.";
  }
  if (enemyPaidActionCount(state) > CORE_RULES.paidActionCap) {
    return "The squad plan exceeds four paid actions.";
  }
  if (availableCommand(state) < 0 || enemyAvailableCommand(state) < 0) {
    return "A plan exceeds its visible Command allotment.";
  }
  return null;
}

function lockResolvedPlans(state) {
  const error = planLockError(state);
  if (error) return withWarning(state, error);
  const fullSimulation = simulateCycle(state, true);
  const projection = projectPlan(state);
  const next = clone(state);
  next.command = availableCommand(next);
  next.enemyCommand = enemyAvailableCommand(next);
  next.phase = "resolution";
  next.priority = "locked";
  next.warning = "";
  next.resolution = {
    signature: projection.signature,
    visibleLaneIndex: -1,
    packets: fullSimulation.packets,
    finalSnapshot: fullSimulation.finalSnapshot,
    movementPath: fullSimulation.movementPath,
    refunds: fullSimulation.refunds,
    expected: projection.expected,
    risk: projection.risk,
    contact: projection.contact,
  };
  return next;
}

function maybeLockAfterPasses(state) {
  return state.consecutivePasses >= 2 ? lockResolvedPlans(state) : state;
}

export function passPriority(state) {
  if (state.phase !== "planning" || state.priority !== "player") return state;
  let next = clone(state);
  next.consecutivePasses += 1;
  next.planningHistory.push({ side: "player", type: "pass" });
  if (next.consecutivePasses >= 2) return lockResolvedPlans(next);
  next = takeEnemyPriority(next, "player-pass").state;
  return maybeLockAfterPasses(next);
}

export function lockPlan(state) {
  return passPriority(state);
}

export function advanceResolution(state) {
  if (state.phase !== "resolution" || !state.resolution) return state;
  const next = clone(state);
  if (next.resolution.visibleLaneIndex < LANE_ORDER.length - 1) {
    next.resolution.visibleLaneIndex += 1;
    return next;
  }
  const applied = applySnapshot(next, next.resolution.finalSnapshot);
  applied.phase = "settle";
  applied.review = next.resolution.packets.flatMap((packet) =>
    packet.events.map((event) => ({ lane: packet.lane, ...event })),
  );

  const committedPlayerCards = next.plan
    .filter((action) => action.cardId && !action.contextCard)
    .map((action) => action.cardId);
  applied.hand = applied.hand.filter(
    (cardId) => !committedPlayerCards.includes(cardId),
  );
  applied.discard.push(...committedPlayerCards);

  for (const action of next.enemyPlan) {
    for (const cardId of [action.cardId, action.modifierCardId].filter(Boolean)) {
      const actor = applied.enemies[action.actorId];
      const index = actor.hand.indexOf(cardId);
      if (index >= 0) actor.hand.splice(index, 1);
      actor.discard.push(cardId);
      if (!actor.knownCards.includes(cardId)) actor.knownCards.push(cardId);
    }
  }

  applied.settleSummary = {
    gateStability: applied.gate.stability,
    gateStatus: applied.gate.status,
    playerPosition: BOARD_TILES[applied.position]?.name ?? applied.position,
    enemyStates: Object.values(applied.enemies).map(
      (enemy) => `${enemy.name}: ${titleCase(enemy.status)}`,
    ),
    dividerStatus: applied.divider.status,
    cacheStatus: applied.cache.status,
    exitStatus: applied.westExit.status,
    commandCarried: applied.command,
    enemyCommandCarried: applied.enemyCommand,
    refunds: next.resolution.refunds,
    draw: [],
  };
  return applied;
}

function pendingResultType(state) {
  if (state.retreated) return "Controlled Retreat";
  if (state.gate.status === "failed" || state.condition === 0) return "Gate Lost";
  if (state.gate.status !== "stabilized") return null;
  if (state.cache.status === "carried") return "Recovery Secure";
  const platformEnemies = Object.values(state.enemies).filter(
    (enemy) =>
      ACTIVE_ENEMY_STATUSES.has(enemy.status) &&
      [tileId(9, 5), tileId(10, 5), tileId(10, 6), tileId(10, 7)].includes(
        enemy.position,
      ),
  );
  if (
    state.divider.status !== "breached" &&
    platformEnemies.length === 0 &&
    state.condition > 0
  ) {
    return "Clean Secure";
  }
  if (state.round <= 3) return "Fast Secure";
  return "Gate Secure";
}

function turningPointText(state, resultType) {
  if (resultType === "Controlled Retreat") {
    return "The player used the physical West Exit before retreat became impossible.";
  }
  if (resultType === "Gate Lost") {
    return "Completed Gate impacts reached zero Stability before Stabilize finished.";
  }
  if (resultType === "Recovery Secure") {
    return "The player accepted optional Cache pressure and still completed the Gate objective.";
  }
  const points = {
    divider: "The first meaningful Clash broke the Divider and created the route used to reach the Gate.",
    bollard: "The second contact was redirected into the defensive bollard, winning Gate position.",
    regulator: "Physical contact exposed hardware before Hacking suppressed its recovery.",
    actuator: "Local Control became useful only because physical access survived.",
    "upper-route": "The prepared natural crossing created a different objective approach.",
    "service-route": "The real service relationship survived its connected shutter response.",
    lift: "The lift Output created temporary geometry across the Upper Walk gap.",
    cache: "The optional recovery decision changed the battle's priority order.",
    stabilize: "Protected Slow Work activated the defensive seal.",
  };
  return points[state.flags.turningPoint] ?? "The player protected the objective long enough to complete Stabilize.";
}

function tradeoffText(state, resultType) {
  if (resultType === "Controlled Retreat") {
    return "The character remains safe, but the Gate, formation, and Cache remain unresolved.";
  }
  if (resultType === "Gate Lost") {
    return "Enemy damage or defeat cannot overwrite the failed location objective.";
  }
  if (resultType === "Recovery Secure") {
    return "The Cache was recovered, but optional pressure exposed other priorities.";
  }
  const costs = [];
  if (state.divider.status === "breached") costs.push("Divider destroyed");
  if (state.bollard.status === "jammed") costs.push("bollard jammed");
  if (state.cache.status !== "carried") costs.push("Field Cache left");
  if (state.westExit.status !== "open") costs.push("retreat route pressured");
  return costs.length
    ? costs.join("; ")
    : "Infrastructure was preserved, but the optional Field Cache was left behind.";
}

function buildResult(state, resultType) {
  return {
    type: resultType,
    diagnostic: resultType === "Gate Secure",
    objective:
      state.gate.status === "stabilized"
        ? `Gate stabilized with ${state.gate.stability}/3 Stability`
        : state.gate.status === "failed"
          ? "Gate failed at 0/3 Stability"
          : `Gate unresolved · ${state.gate.stability}/3 Stability`,
    enemies: Object.values(state.enemies).map(
      (enemy) =>
        `${enemy.name}: ${titleCase(enemy.status)} · ${enemy.condition} Condition · ${enemy.guard} Guard`,
    ),
    player: state.retreated
      ? "Extracted safely"
      : state.condition === 0
        ? "Compromised"
        : `Safe · ${state.condition} Condition · ${state.guard} Guard`,
    cache:
      state.cache.status === "carried"
        ? "Recovered · prototype-only"
        : "Not recovered",
    location:
      `Divider ${state.divider.status}; conduit ${state.divider.conduit}; bollard ${state.bollard.status}; Actuator ${state.actuator.controlled ? "controlled" : "idle"}; lift ${state.lift.deployed ? "aligned" : "parked"}; West Exit ${state.westExit.status}.`,
    turningPoint: turningPointText(state, resultType),
    tradeoff: tradeoffText(state, resultType),
    reason:
      resultType === "Gate Secure"
        ? "Diagnostic fallback: secured after cycle 3 without Clean or Recovery conditions."
        : `Assigned by result precedence: ${resultType}.`,
  };
}

function drawCardsForActor(actor) {
  const drawn = [];
  while (drawn.length < 2 && actor.drawIndex < actor.deck.length) {
    const cardId = actor.deck[actor.drawIndex];
    actor.drawIndex += 1;
    actor.hand.push(cardId);
    drawn.push(cardId);
  }
  while (actor.hand.length > 7) {
    actor.discard.push(actor.hand.pop());
  }
  return drawn;
}

export function settleRound(state) {
  if (state.phase !== "settle") return state;
  const next = clone(state);
  if (next.lift.resetAfterSettle) {
    next.lift.deployed = false;
    next.lift.returning = false;
    next.lift.resetAfterSettle = false;
    next.review.push({
      lane: "Settle",
      actionId: "lift-reset",
      instanceId: "lift-reset",
      title: "Service Lift returned",
      detail: "Temporary geometry closed; the player remains at the last legal landing.",
      outcome: "resolved",
    });
  }
  const resultType = pendingResultType(next);
  if (resultType) {
    next.phase = "result";
    next.result = buildResult(next, resultType);
    return next;
  }

  const drawn = [];
  for (
    let count = 0;
    count < CORE_RULES.drawPerSettle && next.drawIndex < next.deck.length;
    count += 1
  ) {
    const cardId = next.deck[next.drawIndex];
    next.drawIndex += 1;
    next.hand.push(cardId);
    drawn.push(cardId);
  }
  for (const actor of Object.values(next.enemies)) drawCardsForActor(actor);

  next.command = Math.min(
    CORE_RULES.commandCap,
    next.command + (next.resolution?.refunds ?? 0) + CORE_RULES.commandIncome,
  );
  next.enemyCommand = Math.min(
    CORE_RULES.commandCap,
    next.enemyCommand + CORE_RULES.commandIncome,
  );
  next.round += 1;
  next.phase = "planning";
  next.priority = next.round === 3 ? "enemy" : "player";
  next.consecutivePasses = 0;
  next.plan = [];
  next.enemyPlan = [];
  next.resolution = null;
  next.freeRepositionUsed = false;
  next.planningActionCount = 0;
  next.playerPivotUsed = false;
  next.enemyPivotUsed = false;
  next.refocusUsed = false;
  next.refocusRecord = null;
  next.warning = "";
  next.gate.workDelayed = false;
  next.flags.playerGuardedGate = false;
  next.flags.objectiveBraceUsed = false;
  next.flags.sourceAttribution = [];
  if (
    next.enemies.breacher.status === "staggered" &&
    !next.flags.regulatorResetSuppressed
  ) {
    next.enemies.breacher.status = "active";
  }
  next.settleSummary.draw = drawn;
  if (next.priority === "enemy") {
    return takeEnemyPriority(next, "round-opening").state;
  }
  return next;
}

export function displaySnapshot(state) {
  if (
    state.phase === "resolution" &&
    state.resolution?.visibleLaneIndex >= 0
  ) {
    return state.resolution.packets[state.resolution.visibleLaneIndex].snapshot;
  }
  return dynamicSnapshot(state);
}

export function getPositionCoordinates(positionId) {
  const tile = BOARD_TILES[positionId];
  if (!tile) return pointToPercent(2, 6);
  return { x: tile.boardX, y: tile.boardY };
}

export function getActionDefinition(actionId) {
  return ACTIONS[actionId] ?? null;
}

export {
  ACTIONS as FRACTURED_GATE_ACTIONS,
  BUILDS,
  CORE_RULES,
  ENEMY_DECKS,
};
