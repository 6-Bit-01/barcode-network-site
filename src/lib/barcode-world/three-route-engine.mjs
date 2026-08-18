export const THREE_ROUTE_SOURCE =
  "BARCODE_WORLD_ENEMY_AI_SCENARIO_LAB_V0.4_2026-08-18";

export const THREE_ROUTE_AI_DIFFICULTIES = Object.freeze([
  "basic",
  "standard",
  "tactical",
]);

export const THREE_ROUTE_PLAYER_POLICIES = Object.freeze([
  "deliberate",
  "objective",
  "aggressive",
  "defensive",
  "random",
  "first-legal",
]);

export const CARD_CATEGORIES = Object.freeze([
  "movement",
  "defense",
  "offense",
  "special",
]);

export const THREE_ROUTE_RULES = Object.freeze({
  choiceLanes: 3,
  maxPlanSteps: 3,
  categoryCapacity: 5,
  openingPerCategory: 4,
  reserveStart: 10,
  reservePerRound: 6,
  reserveCap: 20,
  conditionStart: 12,
  conditionMax: 12,
  guardCap: 8,
  enemyGuardCap: 3,
  pressureMin: -5,
  pressureMax: 5,
  playerBreak: 3,
  enemyBreak: -3,
  breakRearmMin: -2,
  breakRearmMax: 2,
  chanceMin: 15,
  chanceMax: 95,
  chanceStep: 5,
});

function card({
  id,
  name,
  category,
  cost,
  effect,
  targetRule,
  baseChance,
  impact = 0,
  guard = 0,
  power = 0,
  range = 0,
  move = false,
  status = null,
  kind = "action",
  compatibleCategories = [],
  chanceModifier = 0,
  impactModifier = 0,
  guardModifier = 0,
  drawOnSuccess = 0,
  restore = 0,
  contextFeature = null,
  control = 0,
  requiresPreparation = false,
  requiresSecuredZone = false,
}) {
  return Object.freeze({
    id,
    name,
    category,
    cost,
    effect,
    targetRule,
    baseChance,
    impact,
    guard,
    power,
    range,
    move,
    status,
    kind,
    compatibleCategories: Object.freeze([...compatibleCategories]),
    chanceModifier,
    impactModifier,
    guardModifier,
    drawOnSuccess,
    restore,
    contextFeature,
    control,
    requiresPreparation,
    requiresSecuredZone,
  });
}

export const GENERAL_CARD_DEFINITIONS = Object.freeze({
  advance: card({
    id: "advance",
    name: "Advance",
    category: "movement",
    cost: 2,
    effect: "Move to one connected position.",
    targetRule: "adjacent-zone",
    baseChance: 90,
    move: true,
  }),
  reposition: card({
    id: "reposition",
    name: "Reposition",
    category: "movement",
    cost: 2,
    effect: "Move and gain 1 Guard.",
    targetRule: "adjacent-zone",
    baseChance: 95,
    guard: 1,
    move: true,
  }),
  flank: card({
    id: "flank",
    name: "Flank",
    category: "movement",
    cost: 3,
    effect: "Move and open a better attack angle.",
    targetRule: "flank-zone",
    baseChance: 75,
    move: true,
    status: "flanking",
  }),
  pursue: card({
    id: "pursue",
    name: "Pursue",
    category: "movement",
    cost: 3,
    effect: "Close on a visible enemy.",
    targetRule: "enemy-range",
    baseChance: 75,
    impact: 1,
    range: 2,
    move: true,
  }),
  retreat: card({
    id: "retreat",
    name: "Retreat",
    category: "movement",
    cost: 2,
    effect: "Move toward a physical exit.",
    targetRule: "retreat-zone",
    baseChance: 90,
    move: true,
  }),
  quickstep: card({
    id: "quickstep",
    name: "Quickstep",
    category: "movement",
    cost: 1,
    effect: "Attach: +15% to a Movement action.",
    targetRule: "planned-action",
    baseChance: 100,
    kind: "modifier",
    compatibleCategories: ["movement"],
    chanceModifier: 15,
  }),
  guard: card({
    id: "guard",
    name: "Guard",
    category: "defense",
    cost: 2,
    effect: "Gain 2 Guard against the enemy response.",
    targetRule: "self",
    baseChance: 95,
    guard: 2,
  }),
  brace: card({
    id: "brace",
    name: "Brace",
    category: "defense",
    cost: 3,
    effect: "Gain 3 Guard without moving.",
    targetRule: "self",
    baseChance: 85,
    guard: 3,
  }),
  evade: card({
    id: "evade",
    name: "Evade",
    category: "defense",
    cost: 2,
    effect: "Move away from pressure and gain 1 Guard.",
    targetRule: "adjacent-zone",
    baseChance: 85,
    guard: 1,
    move: true,
  }),
  protect: card({
    id: "protect",
    name: "Protect",
    category: "defense",
    cost: 3,
    effect: "Guard yourself or a nearby objective.",
    targetRule: "defense-target",
    baseChance: 90,
    guard: 2,
  }),
  parry: card({
    id: "parry",
    name: "Parry",
    category: "defense",
    cost: 3,
    effect: "Answer a nearby enemy attack.",
    targetRule: "enemy-intent",
    baseChance: 80,
    impact: 1,
    guard: 1,
    range: 1,
  }),
  reinforce: card({
    id: "reinforce",
    name: "Reinforce",
    category: "defense",
    cost: 1,
    effect: "Attach: +1 Guard to a Defense action.",
    targetRule: "planned-action",
    baseChance: 100,
    kind: "modifier",
    compatibleCategories: ["defense"],
    guardModifier: 1,
    chanceModifier: 5,
  }),
  strike: card({
    id: "strike",
    name: "Strike",
    category: "offense",
    cost: 2,
    effect: "Deal 1 damage at contact.",
    targetRule: "enemy-contact",
    baseChance: 75,
    impact: 1,
  }),
  "heavy-strike": card({
    id: "heavy-strike",
    name: "Heavy Strike",
    category: "offense",
    cost: 4,
    effect: "Deal 2 damage at lower odds.",
    targetRule: "enemy-contact",
    baseChance: 60,
    impact: 2,
  }),
  suppress: card({
    id: "suppress",
    name: "Suppress",
    category: "offense",
    cost: 3,
    effect: "Pressure a nearby enemy and weaken its intent.",
    targetRule: "enemy-range",
    baseChance: 75,
    impact: 1,
    range: 1,
    status: "suppressed",
  }),
  counter: card({
    id: "counter",
    name: "Counter",
    category: "offense",
    cost: 3,
    effect: "Punish a nearby committed attack.",
    targetRule: "enemy-intent",
    baseChance: 80,
    impact: 1,
    range: 1,
  }),
  finish: card({
    id: "finish",
    name: "Finish",
    category: "offense",
    cost: 4,
    effect: "Deal 2 damage to a weakened enemy.",
    targetRule: "weakened-enemy",
    baseChance: 70,
    impact: 2,
  }),
  overclock: card({
    id: "overclock",
    name: "Overclock",
    category: "offense",
    cost: 1,
    effect: "Attach: +1 damage and -10% to an Offense action.",
    targetRule: "planned-action",
    baseChance: 100,
    kind: "modifier",
    compatibleCategories: ["offense"],
    chanceModifier: -10,
    impactModifier: 1,
  }),
  charge: card({
    id: "charge",
    name: "Charge",
    category: "special",
    cost: 2,
    effect: "Store 1 Power, or prime a scene object for a later Context action.",
    targetRule: "charge-target",
    baseChance: 95,
    power: 1,
  }),
  scan: card({
    id: "scan",
    name: "Scan",
    category: "special",
    cost: 1,
    effect: "Expose an enemy or nearby object.",
    targetRule: "scan-target",
    baseChance: 95,
    status: "scanned",
    range: 2,
  }),
  stabilize: card({
    id: "stabilize",
    name: "Stabilize",
    category: "special",
    cost: 2,
    effect: "Restore 2 Health, clear exposure, and gain 1 Guard.",
    targetRule: "self",
    baseChance: 90,
    guard: 1,
    restore: 2,
    status: "stabilized",
  }),
  "cache-tap": card({
    id: "cache-tap",
    name: "Cache Tap",
    category: "special",
    cost: 1,
    effect: "Attach: success draws from that action category.",
    targetRule: "planned-action",
    baseChance: 100,
    kind: "modifier",
    compatibleCategories: ["movement", "defense", "offense", "special"],
    drawOnSuccess: 1,
  }),
});

export const CONTEXT_CARD_DEFINITIONS = Object.freeze({
  "overload-relay": card({
    id: "overload-relay",
    name: "Overload Relay",
    category: "special",
    cost: 3,
    effect: "Context: discharge a primed Service Relay into nearby hostiles.",
    targetRule: "context-feature",
    baseChance: 65,
    impact: 2,
    status: "area-suppress",
    kind: "context",
    contextFeature: "relay",
    control: 1,
    requiresPreparation: true,
  }),
  "seal-gate": card({
    id: "seal-gate",
    name: "Seal Gate",
    category: "special",
    cost: 3,
    effect: "Context: seal the Gate after its position is secured.",
    targetRule: "context-feature",
    baseChance: 70,
    impact: 1,
    status: "objective",
    kind: "context",
    contextFeature: "gate",
    control: 1,
    requiresSecuredZone: true,
  }),
  "vent-coolant": card({
    id: "vent-coolant",
    name: "Vent Coolant",
    category: "special",
    cost: 3,
    effect: "Context: vent a primed coolant conduit into nearby pursuers.",
    targetRule: "context-feature",
    baseChance: 70,
    impact: 1,
    status: "area-suppress",
    kind: "context",
    contextFeature: "coolant",
    control: 1,
    requiresPreparation: true,
  }),
});

export const CATEGORY_LOADOUTS = Object.freeze({
  movement: Object.freeze([
    "advance",
    "advance",
    "reposition",
    "flank",
    "pursue",
    "retreat",
    "quickstep",
  ]),
  defense: Object.freeze([
    "guard",
    "guard",
    "brace",
    "evade",
    "protect",
    "parry",
    "reinforce",
  ]),
  offense: Object.freeze([
    "strike",
    "strike",
    "heavy-strike",
    "suppress",
    "counter",
    "finish",
    "overclock",
  ]),
  special: Object.freeze([
    "charge",
    "charge",
    "scan",
    "scan",
    "stabilize",
    "cache-tap",
  ]),
});

const CATEGORY_CORE_CARD = Object.freeze({
  movement: "advance",
  defense: "guard",
  offense: "strike",
  special: "charge",
});

function zone(id, name, x, y, extra = {}) {
  return Object.freeze({ id, name, x, y, ...extra });
}

function enemy(id, name, role, positionId, hp, extra = {}) {
  return Object.freeze({
    id,
    name,
    role,
    positionId,
    hp,
    maxHp: hp,
    guard: 0,
    scanned: false,
    suppressed: false,
    ...extra,
  });
}

function scenario({
  id,
  name,
  shortName,
  location,
  objective,
  zones,
  edges,
  objects,
  exits,
  playerStart,
  enemies,
  contextCardIds,
  objectiveGoal = 0,
  defendedObjectId = null,
  enemyPlan = {},
  mission = {},
  feed,
}) {
  return Object.freeze({
    id,
    name,
    shortName,
    location,
    objective,
    zones: Object.freeze(zones),
    edges: Object.freeze(edges.map((entry) => Object.freeze(entry))),
    objects: Object.freeze(objects.map((entry) => Object.freeze(entry))),
    exits: Object.freeze(exits),
    playerStart,
    enemies: Object.freeze(enemies),
    contextCardIds: Object.freeze(contextCardIds),
    objectiveGoal,
    defendedObjectId,
    enemyPlan: Object.freeze({
      primaryTarget: enemyPlan.primaryTarget ?? "player",
      aggression: enemyPlan.aggression ?? 1,
      objectiveWeight: enemyPlan.objectiveWeight ?? 1,
      fieldDisruption: enemyPlan.fieldDisruption ?? false,
    }),
    mission: Object.freeze({
      win: mission.win ?? objective,
      lose: mission.lose ?? "HEALTH 0 OR CONTROL -5",
      exit: mission.exit ?? "WITHDRAWAL · MISSION INCOMPLETE",
      tactical: mission.tactical ?? "CONTROL CREATES ADVANTAGE",
      eliminationVictory: mission.eliminationVictory ?? true,
      objectiveVictory: mission.objectiveVictory ?? objectiveGoal > 0,
      controlVictory: mission.controlVictory ?? false,
      controlDefeat: mission.controlDefeat ?? true,
      roundLimit: mission.roundLimit ?? null,
      timeoutResult: mission.timeoutResult ?? "MISSION WINDOW CLOSED",
      timeoutWinner: mission.timeoutWinner ?? "enemy",
      timeoutOutcome: mission.timeoutOutcome ?? "timeout",
      exitOutcome: mission.exitOutcome ?? "withdrawal",
      exitRequiresSecured: mission.exitRequiresSecured ?? false,
      objectiveResult: mission.objectiveResult ?? "OBJECTIVE COMPLETE",
      enemyObjectiveResult:
        mission.enemyObjectiveResult ?? "PROTECTED OBJECT DESTROYED",
    }),
    feed: Object.freeze({
      roundStart: Object.freeze({ ...(feed.roundStart ?? {}) }),
      drawUsedCategoryOnSuccess: feed.drawUsedCategoryOnSuccess ?? 0,
      emptyPoolFallback: feed.emptyPoolFallback ?? 0,
      breakDrawPerCategory: feed.breakDrawPerCategory ?? 1,
    }),
  });
}

export const THREE_ROUTE_SCENARIOS = Object.freeze([
  scenario({
    id: "sublevel-duel-v0.3",
    name: "Sublevel Duel",
    shortName: "1 VS 1 · EARNED FEED",
    location: "SUBLEVEL RING",
    objective: "DEFEAT THE DUELIST OR FORCE A CONTROL BREAK",
    zones: [
      zone("west-hatch", "West Hatch", 10, 55, { exit: true, cover: true }),
      zone("service-ring", "Service Ring", 35, 68),
      zone("upper-walk", "Upper Walk", 38, 25, { cover: true }),
      zone("center-mark", "Center Mark", 62, 49),
      zone("east-lock", "East Lock", 88, 38, { cover: true }),
    ],
    edges: [
      ["west-hatch", "service-ring"],
      ["west-hatch", "upper-walk"],
      ["service-ring", "center-mark"],
      ["upper-walk", "center-mark"],
      ["upper-walk", "east-lock"],
      ["center-mark", "east-lock"],
    ],
    objects: [],
    exits: ["west-hatch"],
    playerStart: "west-hatch",
    enemies: [
      enemy("duelist", "Breacher Duelist", "PRESSURE / COUNTER", "east-lock", 4),
    ],
    contextCardIds: [],
    mission: {
      win: "DEFEAT DUELIST OR REACH CONTROL +5",
      exit: "WITHDRAWAL · DUEL CONCEDED",
      tactical: "CONTROL +5 BREAKS THE DUELIST",
      controlVictory: true,
    },
    feed: {
      drawUsedCategoryOnSuccess: 1,
      emptyPoolFallback: 1,
    },
  }),
  scenario({
    id: "fractured-gate-routes-v0.3",
    name: "Fractured Gate",
    shortName: "1 VS 3 · CONTEXT FEED",
    location: "FRACTURED GATE",
    objective: "SEAL THE GATE OR DEFEAT THE BREACHER CELL",
    zones: [
      zone("west-access", "West Access", 10, 68, { exit: true }),
      zone("cargo-divider", "Cargo Divider", 34, 42, { cover: true }),
      zone("service-relay", "Service Relay", 51, 76, { feature: "relay" }),
      zone("gate-threshold", "Gate Threshold", 76, 49, { feature: "gate" }),
      zone("upper-gantry", "Upper Gantry", 59, 21, { cover: true }),
    ],
    edges: [
      ["west-access", "cargo-divider"],
      ["west-access", "service-relay"],
      ["cargo-divider", "service-relay"],
      ["cargo-divider", "upper-gantry"],
      ["service-relay", "gate-threshold"],
      ["upper-gantry", "gate-threshold"],
    ],
    objects: [
      { id: "relay-object", name: "Service Relay", zoneId: "service-relay", feature: "relay" },
      { id: "gate-object", name: "Gate Controls", zoneId: "gate-threshold", feature: "gate" },
    ],
    exits: ["west-access"],
    playerStart: "west-access",
    enemies: [
      enemy("runner", "Breacher Runner", "ADVANCE", "cargo-divider", 2),
      enemy("ward", "Breacher Ward", "GUARD", "gate-threshold", 3),
      enemy("stalker", "Breacher Stalker", "CONTROL", "upper-gantry", 2),
    ],
    contextCardIds: ["overload-relay", "seal-gate"],
    objectiveGoal: 1,
    mission: {
      win: "SEAL GATE OR DEFEAT ALL HOSTILES",
      lose: "HEALTH 0 · CONTROL -5 · BREACH OPENS AFTER ROUND 12",
      exit: "WITHDRAWAL · MISSION INCOMPLETE",
      tactical: "PRIME RELAY · PROTECT IT · OVERLOAD · SECURE GATE",
      controlVictory: false,
      roundLimit: 12,
      timeoutResult: "BREACH OPENED",
      objectiveResult: "GATE SEALED",
    },
    feed: {
      drawUsedCategoryOnSuccess: 1,
      emptyPoolFallback: 1,
      breakDrawPerCategory: 1,
    },
  }),
  scenario({
    id: "coolant-extraction-v0.3",
    name: "Coolant Extraction",
    shortName: "1 VS 2 · MIXED FEED",
    location: "COOLANT SPINE",
    objective: "REACH THE SOUTH LIFT OR DEFEAT THE PURSUIT",
    zones: [
      zone("north-vault", "North Vault", 16, 24, { cover: true }),
      zone("archive-bridge", "Archive Bridge", 38, 45),
      zone("coolant-conduit", "Coolant Conduit", 58, 70, { feature: "coolant" }),
      zone("service-crossing", "Service Crossing", 64, 28, { cover: true }),
      zone("south-lift", "South Lift", 88, 62, { exit: true }),
    ],
    edges: [
      ["north-vault", "archive-bridge"],
      ["archive-bridge", "coolant-conduit"],
      ["archive-bridge", "service-crossing"],
      ["coolant-conduit", "service-crossing"],
      ["coolant-conduit", "south-lift"],
      ["service-crossing", "south-lift"],
    ],
    objects: [
      { id: "coolant-object", name: "Coolant Conduit", zoneId: "coolant-conduit", feature: "coolant" },
    ],
    exits: ["south-lift"],
    playerStart: "north-vault",
    enemies: [
      enemy("hunter", "Signal Hunter", "PURSUE", "service-crossing", 3),
      enemy("breaker", "Spine Breaker", "DISRUPT", "south-lift", 3),
    ],
    contextCardIds: ["vent-coolant"],
    enemyPlan: {
      primaryTarget: "block-exit",
      aggression: 1,
    },
    mission: {
      win: "REACH SOUTH LIFT OR DEFEAT ALL HOSTILES",
      exit: "SOUTH LIFT · EXTRACTION VICTORY",
      tactical: "PRIME COOLANT FOR AN OPTIONAL ADVANTAGE",
      controlVictory: false,
      exitOutcome: "victory",
      exitRequiresSecured: true,
    },
    feed: {
      roundStart: { movement: 1 },
      drawUsedCategoryOnSuccess: 1,
      emptyPoolFallback: 1,
      breakDrawPerCategory: 1,
    },
  }),
  scenario({
    id: "signal-holdout-v0.4",
    name: "Signal Holdout",
    shortName: "1 VS 3 · SURVIVE 8 ROUNDS",
    location: "SIGNAL SPAN",
    objective: "SURVIVE THE EIGHT-ROUND SIGNAL WINDOW OR DEFEAT THE ASSAULT",
    zones: [
      zone("west-ramp", "West Ramp", 10, 64, { exit: true, cover: true }),
      zone("lower-span", "Lower Span", 34, 75),
      zone("uplink-deck", "Uplink Deck", 48, 48, { feature: "uplink" }),
      zone("upper-span", "Upper Span", 37, 20, { cover: true }),
      zone("east-ramp", "East Ramp", 77, 66),
      zone("signal-tower", "Signal Tower", 82, 24, { cover: true }),
    ],
    edges: [
      ["west-ramp", "lower-span"],
      ["west-ramp", "upper-span"],
      ["lower-span", "uplink-deck"],
      ["upper-span", "uplink-deck"],
      ["uplink-deck", "east-ramp"],
      ["uplink-deck", "signal-tower"],
      ["east-ramp", "signal-tower"],
    ],
    objects: [
      { id: "uplink-object", name: "Signal Uplink", zoneId: "uplink-deck", feature: "uplink" },
    ],
    exits: ["west-ramp"],
    playerStart: "uplink-deck",
    enemies: [
      enemy("holdout-breacher", "Span Breacher", "ADVANCE / PRESSURE", "east-ramp", 3),
      enemy("holdout-harrier", "Signal Harrier", "PURSUE / PRESSURE", "signal-tower", 2),
      enemy("holdout-controller", "Uplink Controller", "CONTROL / DISRUPT", "lower-span", 3),
    ],
    contextCardIds: [],
    enemyPlan: {
      primaryTarget: "player",
      aggression: 1.15,
      fieldDisruption: true,
    },
    mission: {
      win: "SURVIVE ROUND 8 OR DEFEAT ALL HOSTILES",
      lose: "HEALTH 0 · CONTROL -5",
      exit: "WITHDRAWAL · SIGNAL WINDOW ABANDONED",
      tactical: "REPOSITION · GUARD · BREAK ENEMY TEMPO",
      controlVictory: false,
      roundLimit: 8,
      timeoutWinner: "player",
      timeoutOutcome: "holdout",
      timeoutResult: "SIGNAL WINDOW SURVIVED",
    },
    feed: {
      roundStart: { defense: 1 },
      drawUsedCategoryOnSuccess: 1,
      emptyPoolFallback: 1,
      breakDrawPerCategory: 1,
    },
  }),
  scenario({
    id: "archive-defense-v0.4",
    name: "Archive Defense",
    shortName: "1 VS 3 · DEFEND 7 ROUNDS",
    location: "ARCHIVE SWITCHYARD",
    objective: "KEEP THE ARCHIVE CORE INTACT THROUGH ROUND 7 OR DEFEAT THE RAID",
    zones: [
      zone("evac-hatch", "Evac Hatch", 8, 58, { exit: true }),
      zone("west-stack", "West Stack", 31, 72, { cover: true }),
      zone("archive-core-zone", "Archive Core", 51, 48, { feature: "archive" }),
      zone("upper-index", "Upper Index", 34, 21, { cover: true }),
      zone("east-stack", "East Stack", 75, 70),
      zone("breach-door", "Breach Door", 87, 28),
    ],
    edges: [
      ["evac-hatch", "west-stack"],
      ["evac-hatch", "upper-index"],
      ["west-stack", "archive-core-zone"],
      ["upper-index", "archive-core-zone"],
      ["archive-core-zone", "east-stack"],
      ["archive-core-zone", "breach-door"],
      ["east-stack", "breach-door"],
    ],
    objects: [
      {
        id: "archive-core-object",
        name: "Archive Core",
        zoneId: "archive-core-zone",
        feature: "archive",
        integrity: 6,
        maxIntegrity: 6,
      },
    ],
    exits: ["evac-hatch"],
    playerStart: "west-stack",
    enemies: [
      enemy("archive-breacher", "Archive Breacher", "ADVANCE / BREACH", "breach-door", 3),
      enemy("archive-ward", "Raid Ward", "GUARD / BREACH", "east-stack", 3),
      enemy("archive-jammer", "Index Jammer", "CONTROL / DISRUPT", "upper-index", 2),
    ],
    contextCardIds: [],
    defendedObjectId: "archive-core-object",
    enemyPlan: {
      primaryTarget: "defended-object",
      aggression: 1,
      objectiveWeight: 1.35,
    },
    mission: {
      win: "ARCHIVE CORE SURVIVES ROUND 7 OR ALL HOSTILES FALL",
      lose: "HEALTH 0 · CONTROL -5 · ARCHIVE INTEGRITY 0",
      exit: "WITHDRAWAL · ARCHIVE ABANDONED",
      tactical: "INTERCEPT RAIDERS · PROTECT THE CORE · MANAGE BOTH HEALTH TRACKS",
      controlVictory: false,
      roundLimit: 7,
      timeoutWinner: "player",
      timeoutOutcome: "defense",
      timeoutResult: "ARCHIVE CORE HELD",
      enemyObjectiveResult: "ARCHIVE CORE DESTROYED",
    },
    feed: {
      roundStart: { defense: 1 },
      drawUsedCategoryOnSuccess: 1,
      emptyPoolFallback: 1,
      breakDrawPerCategory: 1,
    },
  }),
]);

export const DEFAULT_THREE_ROUTE_SCENARIO_ID = "fractured-gate-routes-v0.3";
export const THREE_ROUTE_SCENARIO = THREE_ROUTE_SCENARIOS.find(
  (entry) => entry.id === DEFAULT_THREE_ROUTE_SCENARIO_ID,
) ?? THREE_ROUTE_SCENARIOS[0];

export function getThreeRouteScenario(
  scenarioId = DEFAULT_THREE_ROUTE_SCENARIO_ID,
) {
  return (
    THREE_ROUTE_SCENARIOS.find((entry) => entry.id === scenarioId) ??
    THREE_ROUTE_SCENARIO
  );
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function chanceStep(value) {
  const stepped =
    Math.round(value / THREE_ROUTE_RULES.chanceStep) *
    THREE_ROUTE_RULES.chanceStep;
  return clamp(
    stepped,
    THREE_ROUTE_RULES.chanceMin,
    THREE_ROUTE_RULES.chanceMax,
  );
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(seed) {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

export function deterministicThreeRouteShuffle(items, seed) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(
      deterministicUnit(seed + ":" + index) * (index + 1),
    );
    [output[index], output[pick]] = [output[pick], output[index]];
  }
  return output;
}

export function deterministicThreeRouteRoll(
  seed,
  round,
  phase,
  index,
) {
  return (
    Math.floor(
      deterministicUnit(
        seed + ":round:" + round + ":" + phase + ":" + index,
      ) * 100,
    ) + 1
  );
}

function instantiateCard(definition, copy, context = false) {
  return {
    ...definition,
    designId: definition.id,
    id:
      (context ? "context" : definition.category) +
      "-" +
      definition.id +
      "-" +
      copy,
    copy,
    context,
  };
}

function createCategoryPool(category, seed) {
  const counts = new Map();
  const cards = CATEGORY_LOADOUTS[category].map((designId) => {
    const copy = (counts.get(designId) ?? 0) + 1;
    counts.set(designId, copy);
    return instantiateCard(GENERAL_CARD_DEFINITIONS[designId], copy);
  });
  const coreIndex = cards.findIndex(
    (entry) => entry.designId === CATEGORY_CORE_CARD[category],
  );
  const core = cards.splice(coreIndex, 1)[0];
  const shuffled = deterministicThreeRouteShuffle(
    cards,
    seed + ":pool:" + category,
  );
  const opening = [core];
  const remaining = [...shuffled];
  while (
    opening.length < THREE_ROUTE_RULES.openingPerCategory &&
    remaining.length > 0
  ) {
    const uniqueIndex = remaining.findIndex(
      (entry) => !opening.some((ready) => ready.designId === entry.designId),
    );
    const [next] = remaining.splice(uniqueIndex >= 0 ? uniqueIndex : 0, 1);
    opening.push(next);
  }
  return {
    category,
    available: opening,
    drawPile: remaining,
    discard: [],
    reshuffles: 0,
  };
}

function zoneById(scenarioValue, zoneId) {
  return scenarioValue.zones.find((entry) => entry.id === zoneId) ?? null;
}

export function connectedZoneIds(scenarioValue, zoneId) {
  return scenarioValue.edges.flatMap(([left, right]) => {
    if (left === zoneId) return [right];
    if (right === zoneId) return [left];
    return [];
  });
}

export function graphDistance(scenarioValue, startId, destinationId) {
  if (startId === destinationId) return 0;
  const visited = new Set([startId]);
  const queue = [{ id: startId, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of connectedZoneIds(scenarioValue, current.id)) {
      if (visited.has(next)) continue;
      if (next === destinationId) return current.distance + 1;
      visited.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

function nextStepToward(scenarioValue, startId, destinationId) {
  return connectedZoneIds(scenarioValue, startId)
    .map((zoneId) => ({
      zoneId,
      distance: graphDistance(scenarioValue, zoneId, destinationId),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.zoneId.localeCompare(right.zoneId),
    )[0]?.zoneId ?? startId;
}

function cloneSnapshot(snapshot) {
  return structuredClone(snapshot);
}

function snapshotFromState(state) {
  return {
    playerPositionId: state.player.positionId,
    playerCondition: state.player.condition,
    playerMaxCondition: state.player.maxCondition,
    playerGuard: state.player.guard,
    playerPower: state.player.power,
    playerExposed: state.player.exposed,
    flankBonus: state.player.flankBonus,
    enemies: structuredClone(state.enemies),
    objectiveProgress: state.objectiveProgress,
    objectIntegrity: { ...state.objectIntegrity },
    protectedObjectId: state.protectedObjectId,
    preparedObjectIds: [...state.preparedObjectIds],
    pressure: state.pressure,
    exitCompleted: false,
  };
}

function contextInstance(definition) {
  return instantiateCard(definition, 1, true);
}

function contextCardIsVisible(state, definition, snapshot) {
  if (state.usedContextCardIds.includes(definition.id)) return false;
  if (
    state.player.plan.some(
      (step) => step.card.designId === definition.id,
    )
  ) {
    return false;
  }
  const currentZone = zoneById(state.scenario, snapshot.playerPositionId);
  if (currentZone?.feature !== definition.contextFeature) return false;
  const objectValue = state.scenario.objects.find(
    (entry) =>
      entry.zoneId === currentZone.id &&
      entry.feature === definition.contextFeature,
  );
  if (!objectValue) return false;
  return (
    !definition.requiresPreparation ||
    state.preparedObjectIds.includes(objectValue.id)
  );
}

export function getVisibleCategoryCards(state, category) {
  const pool = state.player.pools[category];
  const cards = [...pool.available];
  if (category !== "special") return cards;
  const snapshot = projectPlannedTheater(state);
  for (const contextId of state.scenario.contextCardIds) {
    const definition = CONTEXT_CARD_DEFINITIONS[contextId];
    if (
      definition &&
      contextCardIsVisible(state, definition, snapshot)
    ) {
      cards.push(contextInstance(definition));
    }
  }
  return cards;
}

function getVisibleCard(state, cardId) {
  for (const category of CARD_CATEGORIES) {
    const found = getVisibleCategoryCards(state, category).find(
      (entry) => entry.id === cardId,
    );
    if (found) return found;
  }
  return null;
}

function targetFromZone(state, zoneId) {
  const targetZone = zoneById(state.scenario, zoneId);
  return targetZone
    ? {
        kind: "zone",
        id: targetZone.id,
        name: targetZone.name,
        zoneId: targetZone.id,
      }
    : null;
}

function targetFromEnemy(enemyValue) {
  return {
    kind: "enemy",
    id: enemyValue.id,
    name: enemyValue.name,
    zoneId: enemyValue.positionId,
  };
}

function targetFromObject(objectValue) {
  return {
    kind: "object",
    id: objectValue.id,
    name: objectValue.name,
    zoneId: objectValue.zoneId,
    feature: objectValue.feature,
  };
}

function aliveEnemies(snapshot) {
  return snapshot.enemies.filter((entry) => entry.hp > 0);
}

function contextTargetIsReady(cardValue, objectValue, snapshot) {
  if (
    cardValue.requiresPreparation &&
    !snapshot.preparedObjectIds.includes(objectValue.id)
  ) {
    return false;
  }
  if (
    cardValue.requiresSecuredZone &&
    aliveEnemies(snapshot).some(
      (enemyValue) =>
        enemyValue.positionId === objectValue.zoneId &&
        !enemyValue.suppressed,
    )
  ) {
    return false;
  }
  return true;
}

function objectCanBePrepared(state, objectValue) {
  return state.scenario.contextCardIds.some((contextId) => {
    const definition = CONTEXT_CARD_DEFINITIONS[contextId];
    return (
      definition?.requiresPreparation === true &&
      definition.contextFeature === objectValue.feature
    );
  });
}

function exitIsSecured(state, snapshot, zoneId) {
  if (!state.scenario.mission.exitRequiresSecured) return true;
  return !aliveEnemies(snapshot).some(
    (enemyValue) =>
      enemyValue.positionId === zoneId && !enemyValue.suppressed,
  );
}

function targetsForCard(state, cardValue, snapshot) {
  const scenarioValue = state.scenario;
  const currentPosition = snapshot.playerPositionId;
  const neighbors = connectedZoneIds(scenarioValue, currentPosition);
  const enemies = aliveEnemies(snapshot);
  if (cardValue.kind === "modifier") {
    return state.player.plan
      .filter(
        (step) =>
          cardValue.compatibleCategories.includes(step.card.category) &&
          !step.modifiers.some(
            (modifier) => modifier.designId === cardValue.designId,
          ),
      )
      .map((step) => ({
        kind: "plan",
        id: step.id,
        name: "STEP " + step.order + " · " + step.actionName,
        zoneId: step.target.zoneId,
      }));
  }
  if (cardValue.targetRule === "self") {
    return [
      {
        kind: "self",
        id: "wayfinder",
        name: "Wayfinder",
        zoneId: currentPosition,
      },
    ];
  }
  if (cardValue.targetRule === "charge-target") {
    return [
      {
        kind: "self",
        id: "wayfinder",
        name: "Wayfinder",
        zoneId: currentPosition,
      },
      ...scenarioValue.objects
        .filter(
          (objectValue) =>
            objectValue.zoneId === currentPosition &&
            objectCanBePrepared(state, objectValue),
        )
        .map(targetFromObject),
    ];
  }
  if (
    cardValue.targetRule === "adjacent-zone" ||
    cardValue.targetRule === "flank-zone"
  ) {
    let candidateIds = neighbors;
    if (cardValue.targetRule === "flank-zone") {
      candidateIds = candidateIds.filter((zoneId) =>
        enemies.some(
          (enemyValue) =>
            graphDistance(
              scenarioValue,
              zoneId,
              enemyValue.positionId,
            ) <= 1,
        ),
      );
    }
    return candidateIds
      .map((zoneId) => targetFromZone(state, zoneId))
      .filter(Boolean);
  }
  if (cardValue.targetRule === "retreat-zone") {
    const currentExitDistance = Math.min(
      ...scenarioValue.exits.map((exitId) =>
        graphDistance(scenarioValue, currentPosition, exitId),
      ),
    );
    return neighbors
      .filter((zoneId) => {
        const distance = Math.min(
          ...scenarioValue.exits.map((exitId) =>
            graphDistance(scenarioValue, zoneId, exitId),
          ),
        );
        return distance < currentExitDistance || scenarioValue.exits.includes(zoneId);
      })
      .map((zoneId) => targetFromZone(state, zoneId))
      .filter(Boolean);
  }
  if (
    cardValue.targetRule === "enemy-contact" ||
    cardValue.targetRule === "enemy-range" ||
    cardValue.targetRule === "enemy-intent" ||
    cardValue.targetRule === "weakened-enemy"
  ) {
    return enemies
      .filter((enemyValue) => {
        const distance = graphDistance(
          scenarioValue,
          currentPosition,
          enemyValue.positionId,
        );
        if (cardValue.targetRule === "enemy-contact") return distance === 0;
        if (cardValue.targetRule === "weakened-enemy") {
          return distance === 0 && enemyValue.hp <= 1;
        }
        if (cardValue.targetRule === "enemy-intent") {
          const intent = state.enemyIntents.find(
            (entry) => entry.actorId === enemyValue.id,
          );
          return (
            distance <= cardValue.range &&
            ["attack", "advance"].includes(intent?.kind)
          );
        }
        return distance <= cardValue.range;
      })
      .map(targetFromEnemy);
  }
  if (cardValue.targetRule === "defense-target") {
    const output = [
      {
        kind: "self",
        id: "wayfinder",
        name: "Wayfinder",
        zoneId: currentPosition,
      },
    ];
    for (const objectValue of scenarioValue.objects) {
      const threatened = state.enemyIntents.some(
        (intent) =>
          ["disrupt", "objective"].includes(intent.kind) &&
          intent.targetId === objectValue.id,
      );
      if (
        objectValue.zoneId === currentPosition &&
        (threatened ||
          objectValue.id === state.scenario.defendedObjectId ||
          snapshot.preparedObjectIds.includes(objectValue.id))
      ) {
        output.push(targetFromObject(objectValue));
      }
    }
    return output;
  }
  if (cardValue.targetRule === "scan-target") {
    return [
      ...enemies
        .filter(
          (enemyValue) =>
            graphDistance(
              scenarioValue,
              currentPosition,
              enemyValue.positionId,
            ) <= cardValue.range,
        )
        .map(targetFromEnemy),
      ...scenarioValue.objects
        .filter(
          (objectValue) =>
            objectCanBePrepared(state, objectValue) &&
            graphDistance(
              scenarioValue,
              currentPosition,
              objectValue.zoneId,
            ) <= 1,
        )
        .map(targetFromObject),
    ];
  }
  if (cardValue.targetRule === "context-feature") {
    return scenarioValue.objects
      .filter(
        (objectValue) =>
          objectValue.zoneId === currentPosition &&
          objectValue.feature === cardValue.contextFeature &&
          contextTargetIsReady(cardValue, objectValue, snapshot),
      )
      .map(targetFromObject);
  }
  return [];
}

function modifierTotals(modifiers) {
  return modifiers.reduce(
    (totals, modifier) => ({
      chance: totals.chance + modifier.chanceModifier,
      impact: totals.impact + modifier.impactModifier,
      guard: totals.guard + modifier.guardModifier,
      draw: totals.draw + modifier.drawOnSuccess,
    }),
    { chance: 0, impact: 0, guard: 0, draw: 0 },
  );
}

function forecastAction(state, cardValue, target, snapshot, modifiers = []) {
  const totals = modifierTotals(modifiers);
  let chance = cardValue.baseChance + totals.chance;
  const targetEnemy =
    target.kind === "enemy"
      ? snapshot.enemies.find((entry) => entry.id === target.id)
      : null;
  if (targetEnemy?.scanned) chance += 10;
  if (
    targetEnemy &&
    snapshot.flankBonus &&
    graphDistance(
      state.scenario,
      snapshot.playerPositionId,
      targetEnemy.positionId,
    ) <= 1
  ) {
    chance += 15;
  }
  if (targetEnemy?.guard > 0) chance -= targetEnemy.guard * 5;
  if (snapshot.playerExposed) chance -= 5;
  if (
    cardValue.kind === "context" &&
    snapshot.pressure >= THREE_ROUTE_RULES.playerBreak
  ) {
    chance += 10;
  }
  if (
    cardValue.move &&
    aliveEnemies(snapshot).some(
      (entry) =>
        graphDistance(state.scenario, target.zoneId, entry.positionId) === 0,
    )
  ) {
    chance -= 10;
  }
  chance = chanceStep(chance);
  const impact =
    cardValue.impact +
    totals.impact +
    (cardValue.category === "offense" ? snapshot.playerPower : 0);
  const requestedGuard = cardValue.guard + totals.guard;
  const guard = Math.min(
    requestedGuard,
    Math.max(0, THREE_ROUTE_RULES.guardCap - snapshot.playerGuard),
  );
  const restore = Math.min(
    cardValue.restore ?? 0,
    Math.max(0, snapshot.playerMaxCondition - snapshot.playerCondition),
  );
  const control =
    cardValue.control ||
    (cardValue.category === "offense" ||
    ["parry", "pursue"].includes(cardValue.designId)
      ? 1
      : 0);
  let successLabel = "ACTION COMPLETES";
  let failureLabel = "ACTION FAILS · WAYFINDER EXPOSED";
  if (cardValue.move) {
    const reachesExit = state.scenario.exits.includes(target.zoneId);
    const completesExit =
      reachesExit &&
      (cardValue.designId === "retreat" ||
        state.scenario.mission.exitOutcome === "victory") &&
      exitIsSecured(state, snapshot, target.zoneId);
    successLabel = completesExit
      ? "REACH " +
        target.name.toUpperCase() +
        " · AFTER ENEMY RESPONSE: " +
        state.scenario.mission.exit.toUpperCase()
      : reachesExit && state.scenario.mission.exitRequiresSecured
        ? "MOVE TO " +
          target.name.toUpperCase() +
          " · EXTRACTION REQUIRES THE EXIT TO BE CLEAR AFTER ENEMY RESPONSE"
        : "MOVE TO " + target.name.toUpperCase();
    failureLabel = "HOLD POSITION · WAYFINDER EXPOSED";
  }
  if (
    cardValue.category === "offense" ||
    ["parry", "pursue"].includes(cardValue.designId)
  ) {
    const absorbed = targetEnemy
      ? Math.min(impact, targetEnemy.guard)
      : 0;
    const healthDamage = targetEnemy
      ? Math.max(0, impact - absorbed)
      : impact;
    const healthAfter = targetEnemy
      ? Math.max(0, targetEnemy.hp - healthDamage)
      : null;
    successLabel =
      (cardValue.designId === "pursue"
        ? "MOVE TO " + target.name.toUpperCase() + " · "
        : "") +
      impact +
      " IMPACT" +
      (targetEnemy
        ? " · " + targetEnemy.name.toUpperCase() + " " + targetEnemy.hp + "→" + healthAfter + " HP"
        : "") +
      " · +" +
      control +
      " CONTROL" +
      (guard > 0 ? " · GAIN " + guard + " GUARD" : "") +
      (cardValue.status === "suppressed"
        ? " · SUPPRESS INTENT (-25%)"
        : "");
    failureLabel = "NO DAMAGE · WAYFINDER EXPOSED";
  }
  if (cardValue.move && cardValue.designId !== "pursue" && guard > 0) {
    successLabel += " · GAIN " + guard + " GUARD";
  }
  if (cardValue.designId === "flank") {
    successLabel += " · NEXT NEARBY ATTACK +15%";
  }
  if (
    cardValue.category === "defense" &&
    !cardValue.move &&
    cardValue.designId !== "parry" &&
    guard > 0
  ) {
    successLabel = "GAIN " + guard + " GUARD";
    failureLabel = "GAIN 1 GUARD";
  }
  if (cardValue.designId === "charge") {
    successLabel =
      target.kind === "object"
        ? "PRIME " + target.name.toUpperCase() + " · PROTECT BEFORE ENEMY RESPONSE"
        : "STORE 1 POWER";
  }
  if (cardValue.designId === "scan") {
    successLabel =
      target.kind === "object"
        ? "PRIME " + target.name.toUpperCase() + " · PROTECT BEFORE ENEMY RESPONSE"
        : "TARGET EXPOSED · +10% AGAINST IT";
  }
  if (cardValue.designId === "protect" && target.kind === "object") {
    successLabel =
      "PROTECT " +
      target.name.toUpperCase() +
      " THROUGH ENEMY RESPONSE · GAIN " +
      guard +
      " GUARD";
  }
  if (cardValue.category === "defense") {
    failureLabel = cardValue.move
      ? "HOLD POSITION · GAIN 1 GUARD · WAYFINDER EXPOSED"
      : cardValue.designId === "parry"
        ? "NO DAMAGE · GAIN 1 GUARD · WAYFINDER EXPOSED"
        : target.kind === "object"
          ? "OBJECT NOT PROTECTED · GAIN 1 GUARD · WAYFINDER EXPOSED"
          : "GAIN 1 GUARD · WAYFINDER EXPOSED";
  }
  if (cardValue.designId === "stabilize") {
    successLabel =
      "RESTORE " + restore + " HEALTH · GAIN " + guard + " GUARD";
  }
  if (cardValue.kind === "context") {
    if (cardValue.status === "objective") {
      successLabel =
        state.scenario.mission.objectiveResult.toUpperCase() +
        " · SURVIVE ENEMY RESPONSE";
    } else {
      const affected = aliveEnemies(snapshot)
        .filter(
          (enemyValue) =>
            graphDistance(
              state.scenario,
              target.zoneId,
              enemyValue.positionId,
            ) <= 1,
        )
        .map((enemyValue) => {
          const absorbed = Math.min(cardValue.impact, enemyValue.guard);
          const healthDamage = Math.max(0, cardValue.impact - absorbed);
          return (
            enemyValue.name.toUpperCase() +
            " " +
            enemyValue.hp +
            "→" +
            Math.max(0, enemyValue.hp - healthDamage) +
            " HP"
          );
        });
      successLabel =
        (affected.length > 0 ? affected.join(" · ") : "NO HOSTILES IN RANGE") +
        " · +" +
        control +
        " CONTROL · MISSION CONTINUES";
    }
    failureLabel = "CONTEXT ACTION LOST · WAYFINDER EXPOSED";
  }
  return {
    chance,
    impact,
    guard,
    restore,
    control,
    drawOnSuccess: totals.draw,
    successLabel,
    failureLabel,
  };
}

function applySuccessfulAction(state, snapshot, step) {
  const output = cloneSnapshot(snapshot);
  const cardValue = step.card;
  const target = step.target;
  if (cardValue.move) {
    if (target.kind === "enemy") {
      const enemyValue = output.enemies.find(
        (entry) => entry.id === target.id,
      );
      if (enemyValue) output.playerPositionId = enemyValue.positionId;
    } else {
      output.playerPositionId = target.zoneId;
    }
    if (
      state.scenario.exits.includes(output.playerPositionId) &&
      (cardValue.designId === "retreat" ||
        state.scenario.mission.exitOutcome === "victory") &&
      exitIsSecured(state, output, output.playerPositionId)
    ) {
      output.exitCompleted = true;
    }
  }
  output.playerGuard = clamp(
    output.playerGuard + step.forecast.guard,
    0,
    THREE_ROUTE_RULES.guardCap,
  );
  output.playerCondition = clamp(
    output.playerCondition + step.forecast.restore,
    0,
    output.playerMaxCondition,
  );
  if (cardValue.designId === "charge") {
    if (target.kind === "object") {
      if (!output.preparedObjectIds.includes(target.id)) {
        output.preparedObjectIds.push(target.id);
      }
    } else {
      output.playerPower += cardValue.power;
    }
  }
  if (cardValue.designId === "stabilize") output.playerExposed = false;
  if (cardValue.designId === "flank") output.flankBonus = true;
  if (
    cardValue.category === "offense" ||
    ["parry", "pursue"].includes(cardValue.designId)
  ) {
    const targetEnemy = output.enemies.find(
      (entry) => entry.id === target.id,
    );
    if (targetEnemy) {
      let damage = step.forecast.impact;
      if (targetEnemy.guard > 0) {
        const absorbed = Math.min(damage, targetEnemy.guard);
        targetEnemy.guard -= absorbed;
        damage -= absorbed;
      }
      targetEnemy.hp = Math.max(0, targetEnemy.hp - damage);
      if (cardValue.status === "suppressed") targetEnemy.suppressed = true;
      output.pressure += step.forecast.control;
    }
    output.playerPower = 0;
    output.flankBonus = false;
  }
  if (cardValue.designId === "scan") {
    if (target.kind === "enemy") {
      const targetEnemy = output.enemies.find(
        (entry) => entry.id === target.id,
      );
      if (targetEnemy) targetEnemy.scanned = true;
    } else if (!output.preparedObjectIds.includes(target.id)) {
      output.preparedObjectIds.push(target.id);
    }
  }
  if (cardValue.designId === "protect" && target.kind === "object") {
    output.protectedObjectId = target.id;
  }
  if (cardValue.status === "area-suppress") {
    for (const enemyValue of output.enemies) {
      if (
        enemyValue.hp > 0 &&
        graphDistance(
          state.scenario,
          target.zoneId,
          enemyValue.positionId,
        ) <= 1
      ) {
        const absorbed = Math.min(cardValue.impact, enemyValue.guard);
        enemyValue.guard -= absorbed;
        enemyValue.hp = Math.max(
          0,
          enemyValue.hp - Math.max(0, cardValue.impact - absorbed),
        );
        enemyValue.suppressed = true;
      }
    }
    output.pressure += step.forecast.control;
    output.preparedObjectIds = output.preparedObjectIds.filter(
      (objectId) => objectId !== target.id,
    );
  }
  if (cardValue.status === "objective") {
    output.objectiveProgress += cardValue.impact;
    output.pressure += step.forecast.control;
  }
  return output;
}

function refreshPlan(state) {
  let projected = snapshotFromState(state);
  state.player.plan = state.player.plan.map((step, index) => {
    const expectedStartId = projected.playerPositionId;
    const forecast = forecastAction(
      state,
      step.card,
      step.target,
      projected,
      step.modifiers,
    );
    const refreshed = {
      ...step,
      order: index + 1,
      actionName:
        step.card.name +
        (step.target.kind === "self" ? "" : " → " + step.target.name),
      expectedStartId,
      forecast,
    };
    projected = applySuccessfulAction(state, projected, refreshed);
    return refreshed;
  });
  return state;
}

export function projectPlannedTheater(state) {
  let projected = snapshotFromState(state);
  for (const step of state.player.plan) {
    projected = applySuccessfulAction(state, projected, step);
  }
  return projected;
}

function routeChoiceId(cardId, targetId) {
  return cardId + "::" + targetId;
}

function routeTargetPriority(cardValue, target) {
  if (
    target.kind === "object" &&
    (["scan", "charge", "protect"].includes(cardValue.designId) ||
      cardValue.kind === "context")
  ) {
    return 0;
  }
  if (target.kind === "self") return 1;
  return 2;
}

export function getThreeRouteChoices(state, cardId) {
  if (state.phase !== "planning") return [];
  const cardValue = getVisibleCard(state, cardId);
  if (!cardValue || cardValue.cost > state.player.reserve) return [];
  if (
    cardValue.kind !== "modifier" &&
    state.player.plan.length >= THREE_ROUTE_RULES.maxPlanSteps
  ) {
    return [];
  }
  const snapshot = projectPlannedTheater(state);
  const targets = targetsForCard(state, cardValue, snapshot)
    .sort(
      (left, right) =>
        routeTargetPriority(cardValue, left) -
          routeTargetPriority(cardValue, right) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, THREE_ROUTE_RULES.choiceLanes);
  return targets.map((target, lane) => {
    if (cardValue.kind === "modifier") {
      const step = state.player.plan.find((entry) => entry.id === target.id);
      const forecast = forecastAction(
        state,
        step.card,
        step.target,
        snapshotFromState(state),
        [...step.modifiers, cardValue],
      );
      return {
        id: routeChoiceId(cardId, target.id),
        lane,
        card: cardValue,
        target,
        actionName: cardValue.name + " → " + target.name,
        expectedStartId: step.expectedStartId,
        forecast,
        modifier: true,
        prerequisiteLabel: "ATTACH TO AN EXISTING PLAN STEP",
      };
    }
    const forecast = forecastAction(
      state,
      cardValue,
      target,
      snapshot,
    );
    return {
      id: routeChoiceId(cardId, target.id),
      lane,
      card: cardValue,
      target,
      actionName:
        cardValue.name +
        (target.kind === "self" ? "" : " → " + target.name),
      expectedStartId: snapshot.playerPositionId,
      forecast,
      modifier: false,
      prerequisiteLabel:
        snapshot.playerPositionId === state.player.positionId
          ? null
          : "REQUIRES " +
            zoneById(state.scenario, snapshot.playerPositionId).name.toUpperCase(),
    };
  });
}

export function hasPlayableThreeRouteAction(state) {
  if (state.phase !== "planning") return false;
  if (
    CARD_CATEGORIES.some((category) => {
      const pool = state.player.pools[category];
      return (
        pool.available.length === 0 &&
        (pool.drawPile.length > 0 || pool.discard.length > 0)
      );
    })
  ) {
    return true;
  }
  return CARD_CATEGORIES.some((category) =>
    getVisibleCategoryCards(state, category).some(
      (cardValue) => getThreeRouteChoices(state, cardValue.id).length > 0,
    ),
  );
}

function takeGeneralCard(state, cardValue) {
  const pool = state.player.pools[cardValue.category];
  const index = pool.available.findIndex(
    (entry) => entry.id === cardValue.id,
  );
  if (index < 0) return false;
  cardValue.originPoolIndex = index;
  pool.available.splice(index, 1);
  return true;
}

function returnCardToPool(state, cardValue) {
  if (cardValue.context) return;
  const pool = state.player.pools[cardValue.category];
  if (!pool.available.some((entry) => entry.id === cardValue.id)) {
    const index = clamp(
      cardValue.originPoolIndex ?? pool.available.length,
      0,
      pool.available.length,
    );
    delete cardValue.originPoolIndex;
    pool.available.splice(index, 0, cardValue);
  }
}

function discardCard(state, cardValue) {
  if (cardValue.context) {
    if (!state.usedContextCardIds.includes(cardValue.designId)) {
      state.usedContextCardIds.push(cardValue.designId);
    }
    return;
  }
  state.player.pools[cardValue.category].discard.push(cardValue);
}

export function chooseThreeRoute(state, cardId, choiceId) {
  const choices = getThreeRouteChoices(state, cardId);
  const choice = choices.find((entry) => entry.id === choiceId);
  if (!choice) {
    return {
      ...structuredClone(state),
      notice: "That card has no legal target in the projected theater.",
    };
  }
  const draft = structuredClone(state);
  const cardValue = getVisibleCard(draft, cardId);
  if (!cardValue || draft.player.reserve < cardValue.cost) return draft;
  if (!cardValue.context && !takeGeneralCard(draft, cardValue)) return draft;
  draft.player.reserve -= cardValue.cost;
  if (cardValue.kind === "modifier") {
    const step = draft.player.plan.find(
      (entry) => entry.id === choice.target.id,
    );
    if (!step) return draft;
    step.modifiers.push(cardValue);
    draft.pendingActions.push({
      kind: "modifier",
      stepId: step.id,
      card: cardValue,
      reserve: cardValue.cost,
    });
    refreshPlan(draft);
    draft.notice =
      cardValue.name + " attached to " + step.actionName + ".";
    return draft;
  }
  const stepId =
    "plan-" + draft.round + "-" + (draft.playerActionSequence + 1);
  draft.playerActionSequence += 1;
  draft.player.plan.push({
    id: stepId,
    order: draft.player.plan.length + 1,
    card: cardValue,
    target: choice.target,
    actionName: choice.actionName,
    expectedStartId: choice.expectedStartId,
    forecast: choice.forecast,
    modifiers: [],
  });
  draft.pendingActions.push({
    kind: "step",
    stepId,
    card: cardValue,
    reserve: cardValue.cost,
  });
  refreshPlan(draft);
  draft.notice =
    choice.actionName +
    " added. Choose another card or resolve the plan.";
  return draft;
}

export function undoThreeRouteChoice(state) {
  const draft = structuredClone(state);
  if (draft.phase !== "planning" || draft.pendingActions.length === 0) {
    draft.notice = "There is no staged choice to undo.";
    return draft;
  }
  const action = draft.pendingActions.pop();
  draft.player.reserve = Math.min(
    THREE_ROUTE_RULES.reserveCap,
    draft.player.reserve + action.reserve,
  );
  if (action.kind === "modifier") {
    const step = draft.player.plan.find(
      (entry) => entry.id === action.stepId,
    );
    if (step) {
      const index = step.modifiers.findIndex(
        (entry) => entry.id === action.card.id,
      );
      if (index >= 0) step.modifiers.splice(index, 1);
    }
    returnCardToPool(draft, action.card);
  } else {
    const index = draft.player.plan.findIndex(
      (entry) => entry.id === action.stepId,
    );
    if (index >= 0) {
      const [step] = draft.player.plan.splice(index, 1);
      returnCardToPool(draft, step.card);
      for (const modifier of step.modifiers) {
        draft.player.reserve = Math.min(
          THREE_ROUTE_RULES.reserveCap,
          draft.player.reserve + modifier.cost,
        );
        returnCardToPool(draft, modifier);
      }
    }
  }
  refreshPlan(draft);
  draft.notice = "The last staged choice returned to its category pool.";
  return draft;
}

export function cycleThreeRouteCategory(state, category) {
  const draft = structuredClone(state);
  if (
    draft.phase !== "planning" ||
    !CARD_CATEGORIES.includes(category)
  ) {
    return draft;
  }
  const pool = draft.player.pools[category];
  const cardValue = pool.available.shift();
  if (!cardValue) {
    const grants = [];
    drawFromCategory(
      draft,
      category,
      1,
      "TACTICAL RECOVERY",
      grants,
    );
    draft.notice =
      grants[0]?.actual > 0
        ? category.toUpperCase() + " recovered one card."
        : category.toUpperCase() + " has no card available to cycle.";
    return draft;
  }
  if (draft.player.reserve < 1) {
    pool.available.unshift(cardValue);
    draft.notice = "Cycling a category requires 1 Reserve.";
    return draft;
  }
  draft.player.reserve -= 1;
  pool.discard.push(cardValue);
  const grants = [];
  drawFromCategory(draft, category, 1, "CATEGORY CYCLE", grants);
  draft.notice =
    grants[0]?.actual > 0
      ? cardValue.name +
        " cycled from " +
        category.toUpperCase() +
        " for 1 Reserve."
      : cardValue.name +
        " was discarded, but " +
        category.toUpperCase() +
        " had no replacement.";
  return draft;
}

const AI_DIFFICULTY_CONFIG = Object.freeze({
  basic: Object.freeze({ noise: 18, coordinationPenalty: 2, roleFit: 0.75 }),
  standard: Object.freeze({ noise: 5, coordinationPenalty: 10, roleFit: 1 }),
  tactical: Object.freeze({ noise: 0, coordinationPenalty: 18, roleFit: 1.2 }),
});

function enemyHasRole(enemyValue, role) {
  return enemyValue.role.toUpperCase().includes(role);
}

function enemyIntentCandidate({
  enemyValue,
  kind,
  name,
  targetId,
  destinationId,
  chance,
  impact,
  pressure,
  score,
  reason,
}) {
  return {
    id: [kind, targetId, destinationId, name].join(":"),
    actorId: enemyValue.id,
    kind,
    name,
    targetId,
    destinationId,
    chance,
    impact,
    pressure,
    score,
    reason,
  };
}

function enemyIntentCandidates(state, enemyValue) {
  const candidates = [];
  const scenarioValue = state.scenario;
  const distanceToPlayer = graphDistance(
    scenarioValue,
    enemyValue.positionId,
    state.player.positionId,
  );
  const guardedObject = scenarioValue.objects.find(
    (objectValue) => objectValue.zoneId === enemyValue.positionId,
  );
  const defendedObject = scenarioValue.objects.find(
    (objectValue) => objectValue.id === scenarioValue.defendedObjectId,
  );
  const preparedObjects = scenarioValue.objects
    .filter((objectValue) => state.preparedObjectIds.includes(objectValue.id))
    .sort(
      (left, right) =>
        graphDistance(scenarioValue, enemyValue.positionId, left.zoneId) -
          graphDistance(scenarioValue, enemyValue.positionId, right.zoneId) ||
        left.id.localeCompare(right.id),
    );
  const aggressiveRole =
    enemyHasRole(enemyValue, "ADVANCE") ||
    enemyHasRole(enemyValue, "PURSUE") ||
    enemyHasRole(enemyValue, "PRESSURE") ||
    enemyHasRole(enemyValue, "BREACH");
  const controlRole =
    enemyHasRole(enemyValue, "CONTROL") ||
    enemyHasRole(enemyValue, "DISRUPT");
  const guardRole = enemyHasRole(enemyValue, "GUARD");
  const roleFit = AI_DIFFICULTY_CONFIG[state.enemyDifficulty]?.roleFit ?? 1;

  if (distanceToPlayer === 0) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "attack",
        name: enemyHasRole(enemyValue, "COUNTER") ? "Countercut" : "Close Strike",
        targetId: "wayfinder",
        destinationId: enemyValue.positionId,
        chance: enemyHasRole(enemyValue, "PRESSURE") ? 80 : 70,
        impact: enemyValue.maxHp >= 4 ? 3 : 2,
        pressure: 1,
        score:
          72 * scenarioValue.enemyPlan.aggression +
          (aggressiveRole ? 16 * roleFit : 0) +
          (state.player.condition <= 4 ? 12 : 0),
        reason: "Wayfinder is in contact; convert position into Health and Control pressure.",
      }),
    );
  } else {
    const destinationId = nextStepToward(
      scenarioValue,
      enemyValue.positionId,
      state.player.positionId,
    );
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "advance",
        name: aggressiveRole ? "Rush" : "Hunt",
        targetId: "wayfinder",
        destinationId,
        chance: 85,
        impact: guardRole ? 0 : 2,
        pressure: 1,
        score:
          42 * scenarioValue.enemyPlan.aggression +
          (aggressiveRole ? 20 * roleFit : 0) +
          Math.max(0, 5 - distanceToPlayer) * 3,
        reason: "Close a visible route toward the Wayfinder.",
      }),
    );
  }

  if (guardRole && guardedObject && enemyValue.guard < THREE_ROUTE_RULES.enemyGuardCap) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "guard",
        name: "Hold " + guardedObject.name,
        targetId: guardedObject.id,
        destinationId: enemyValue.positionId,
        chance: 85,
        impact: 0,
        pressure: 0,
        score:
          56 +
          20 * roleFit +
          (guardedObject.id === scenarioValue.defendedObjectId ? 16 : 0),
        reason: "Fortify a physical objective position before committing elsewhere.",
      }),
    );
  }

  if (guardRole && guardedObject && enemyValue.guard >= THREE_ROUTE_RULES.enemyGuardCap) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "attack",
        name: "Lockdown Shot",
        targetId: "wayfinder",
        destinationId: enemyValue.positionId,
        chance: 70,
        impact: 1,
        pressure: 1,
        score: 65 + 12 * roleFit,
        reason: "The held position is fully guarded; project pressure from it.",
      }),
    );
  }

  if (
    scenarioValue.enemyPlan.primaryTarget === "block-exit" &&
    (controlRole || guardRole)
  ) {
    const exitId = [...scenarioValue.exits].sort(
      (left, right) =>
        graphDistance(scenarioValue, enemyValue.positionId, left) -
          graphDistance(scenarioValue, enemyValue.positionId, right) ||
        left.localeCompare(right),
    )[0];
    const distanceToExit = graphDistance(
      scenarioValue,
      enemyValue.positionId,
      exitId,
    );
    if (distanceToExit === 0) {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "guard",
          name: "Lock Extraction",
          targetId: exitId,
          destinationId: enemyValue.positionId,
          chance: 90,
          impact: 0,
          pressure: 1,
          score: 94 + 16 * roleFit,
          reason: "Hold the visible extraction point and force the Wayfinder to clear it.",
        }),
      );
    } else {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "advance",
          name: "Cut Off Extraction",
          targetId: exitId,
          destinationId: nextStepToward(
            scenarioValue,
            enemyValue.positionId,
            exitId,
          ),
          chance: 85,
          impact: 0,
          pressure: 1,
          score: 68 + 14 * roleFit,
          reason: "Move toward the visible extraction point to deny a free escape.",
        }),
      );
    }
  }

  if (controlRole && preparedObjects.length > 0) {
    const preparedObject = preparedObjects[0];
    const preparedDistance = graphDistance(
      scenarioValue,
      enemyValue.positionId,
      preparedObject.zoneId,
    );
    if (preparedDistance <= 1) {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "disrupt",
          name: "Jam " + preparedObject.name,
          targetId: preparedObject.id,
          destinationId: enemyValue.positionId,
          chance: enemyHasRole(enemyValue, "CONTROL") ? 85 : 80,
          impact: 0,
          pressure: 1,
          score: 86 + 24 * roleFit,
          reason: "A visible scene preparation is within disruption range.",
        }),
      );
    } else {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "advance",
          name: "Cut Off " + preparedObject.name,
          targetId: preparedObject.id,
          destinationId: nextStepToward(
            scenarioValue,
            enemyValue.positionId,
            preparedObject.zoneId,
          ),
          chance: 85,
          impact: 0,
          pressure: 1,
          score: 64 + 18 * roleFit,
          reason: "Move toward a visible prepared scene object to threaten its setup.",
        }),
      );
    }
  }

  if (
    controlRole &&
    preparedObjects.length === 0 &&
    scenarioValue.enemyPlan.fieldDisruption
  ) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "disrupt",
        name: "Signal Interference",
        targetId: "field",
        destinationId: enemyValue.positionId,
        chance: 80,
        impact: 0,
        pressure: 1,
        score: 74 + 18 * roleFit,
        reason: "Apply visible Control pressure while no prepared scene object is available.",
      }),
    );
  }

  if (defendedObject && (state.objectIntegrity[defendedObject.id] ?? 0) > 0) {
    const distanceToObject = graphDistance(
      scenarioValue,
      enemyValue.positionId,
      defendedObject.zoneId,
    );
    const objectiveRoleBonus = enemyHasRole(enemyValue, "BREACH")
      ? 26 * roleFit
      : guardRole
        ? 10 * roleFit
        : 0;
    if (distanceToObject === 0) {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "objective",
          name: "Breach " + defendedObject.name,
          targetId: defendedObject.id,
          destinationId: enemyValue.positionId,
          chance: enemyHasRole(enemyValue, "BREACH") ? 85 : 75,
          impact: 1,
          pressure: 1,
          score:
            78 * scenarioValue.enemyPlan.objectiveWeight +
            objectiveRoleBonus,
          reason: "The defended object is in reach; damage its visible Integrity track.",
        }),
      );
    } else {
      candidates.push(
        enemyIntentCandidate({
          enemyValue,
          kind: "advance",
          name: "Breach Route",
          targetId: defendedObject.id,
          destinationId: nextStepToward(
            scenarioValue,
            enemyValue.positionId,
            defendedObject.zoneId,
          ),
          chance: 85,
          impact: 0,
          pressure: 1,
          score:
            52 * scenarioValue.enemyPlan.objectiveWeight +
            objectiveRoleBonus +
            Math.max(0, 4 - distanceToObject) * 3,
          reason: "Advance along a public route toward the defended object.",
        }),
      );
    }
  }

  if (enemyValue.hp <= 1 && enemyValue.guard < THREE_ROUTE_RULES.enemyGuardCap) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "guard",
        name: "Emergency Brace",
        targetId: enemyValue.id,
        destinationId: enemyValue.positionId,
        chance: 90,
        impact: 0,
        pressure: 0,
        score: 48 + (guardRole ? 18 * roleFit : 0),
        reason: "Low Health makes preserving this role a credible option.",
      }),
    );
  }

  if (candidates.length === 0) {
    candidates.push(
      enemyIntentCandidate({
        enemyValue,
        kind: "guard",
        name: "Hold Position",
        targetId: enemyValue.id,
        destinationId: enemyValue.positionId,
        chance: 90,
        impact: 0,
        pressure: 0,
        score: 1,
        reason: "No higher-priority legal action is available.",
      }),
    );
  }
  return candidates;
}

export function planThreeRouteEnemyIntents(
  state,
  { difficulty = state.enemyDifficulty ?? "standard" } = {},
) {
  const normalizedDifficulty = THREE_ROUTE_AI_DIFFICULTIES.includes(difficulty)
    ? difficulty
    : "standard";
  const config = AI_DIFFICULTY_CONFIG[normalizedDifficulty];
  const reservedDestinations = new Map();
  const reservedTargets = new Map();
  return state.enemies
    .filter((entry) => entry.hp > 0)
    .map((enemyValue, index) => {
      const candidates = enemyIntentCandidates(
        { ...state, enemyDifficulty: normalizedDifficulty },
        enemyValue,
      );
      const ranked = candidates
        .map((candidate) => {
          const destinationCount = reservedDestinations.get(candidate.destinationId) ?? 0;
          const targetCount = reservedTargets.get(candidate.targetId) ?? 0;
          const sharedPriorityTarget =
            candidate.targetId === "wayfinder" ||
            candidate.targetId === state.scenario.defendedObjectId;
          const coordinationPenalty = sharedPriorityTarget
            ? 0
            : config.coordinationPenalty * destinationCount +
              config.coordinationPenalty * 0.5 * targetCount;
          const noise =
            (deterministicUnit(
              state.seed +
                ":ai:" +
                normalizedDifficulty +
                ":" +
                state.round +
                ":" +
                enemyValue.id +
                ":" +
                candidate.id,
            ) -
              0.5) *
            config.noise;
          return {
            ...candidate,
            score: candidate.score - coordinationPenalty + noise,
          };
        })
        .sort(
          (left, right) =>
            right.score - left.score || left.id.localeCompare(right.id),
        );
      const selected = ranked[0];
      reservedDestinations.set(
        selected.destinationId,
        (reservedDestinations.get(selected.destinationId) ?? 0) + 1,
      );
      reservedTargets.set(
        selected.targetId,
        (reservedTargets.get(selected.targetId) ?? 0) + 1,
      );
      return {
        ...selected,
        score: Math.round(selected.score * 10) / 10,
        candidateCount: candidates.length,
        difficulty: normalizedDifficulty,
        order: index,
      };
    });
}

function eventSnapshot(snapshot) {
  return {
    playerPositionId: snapshot.playerPositionId,
    playerCondition: snapshot.playerCondition,
    playerMaxCondition: snapshot.playerMaxCondition,
    playerGuard: snapshot.playerGuard,
    playerPower: snapshot.playerPower,
    playerExposed: snapshot.playerExposed,
    enemies: structuredClone(snapshot.enemies),
    objectiveProgress: snapshot.objectiveProgress,
    objectIntegrity: { ...snapshot.objectIntegrity },
    protectedObjectId: snapshot.protectedObjectId,
    preparedObjectIds: [...snapshot.preparedObjectIds],
    pressure: snapshot.pressure,
  };
}

function makeEvent({
  state,
  phase,
  index,
  title,
  detail,
  actorId,
  targetId,
  success,
  chance,
  roll,
  before,
  after,
  sceneCue,
}) {
  return {
    id:
      "event-" +
      state.round +
      "-" +
      phase +
      "-" +
      index,
    round: state.round,
    phase,
    index,
    title,
    detail,
    actorId,
    targetId,
    success,
    chance,
    roll,
    before: eventSnapshot(before),
    after: eventSnapshot(after),
    sceneCue,
  };
}

function refillDiscard(state, category) {
  const pool = state.player.pools[category];
  if (pool.drawPile.length > 0 || pool.discard.length === 0) return;
  pool.reshuffles += 1;
  pool.drawPile = deterministicThreeRouteShuffle(
    pool.discard,
    state.seed +
      ":reshuffle:" +
      category +
      ":" +
      pool.reshuffles,
  );
  pool.discard = [];
}

function drawFromCategory(state, category, count, label, grants) {
  const pool = state.player.pools[category];
  let actual = 0;
  while (
    actual < count &&
    pool.available.length < THREE_ROUTE_RULES.categoryCapacity
  ) {
    refillDiscard(state, category);
    const next = pool.drawPile.shift();
    if (!next) break;
    pool.available.push(next);
    actual += 1;
  }
  if (count > 0) {
    grants.push({ category, label, requested: count, actual });
  }
  return actual;
}

function restoreInvalidStep(state, step) {
  const cards = [step.card, ...step.modifiers];
  for (const cardValue of cards) {
    state.player.reserve = Math.min(
      THREE_ROUTE_RULES.reserveCap,
      state.player.reserve + cardValue.cost,
    );
    returnCardToPool(state, cardValue);
  }
}

function invalidStepReason(state, snapshot, step) {
  if (snapshot.playerPositionId !== step.expectedStartId) {
    return "Its required position was never reached. Cards and Command Points returned.";
  }
  const remainsLegal = targetsForCard(state, step.card, snapshot).some(
    (target) =>
      target.kind === step.target.kind &&
      target.id === step.target.id,
  );
  if (remainsLegal) return null;
  if (step.card.requiresSecuredZone) {
    return "The position was not secured after earlier actions resolved. Cards and Command Points returned.";
  }
  if (step.card.requiresPreparation) {
    return "The scene object was no longer primed. Cards and Command Points returned.";
  }
  if (step.target.kind === "enemy") {
    return "The target was no longer available after earlier actions resolved. Cards and Command Points returned.";
  }
  return "The action was no longer physically legal. Cards and Command Points returned.";
}

function applyFailedPlayerAction(snapshot, step) {
  const output = cloneSnapshot(snapshot);
  output.playerExposed = true;
  if (step.card.requiresPreparation && step.target.kind === "object") {
    output.preparedObjectIds = output.preparedObjectIds.filter(
      (objectId) => objectId !== step.target.id,
    );
  }
  if (step.card.category === "defense") {
    output.playerGuard = clamp(
      output.playerGuard + 1,
      0,
      THREE_ROUTE_RULES.guardCap,
    );
  }
  return output;
}

function applyEnemyImpact(output, enemyValue, impact, pressure) {
  const absorbed = Math.min(impact, output.playerGuard);
  output.playerGuard -= absorbed;
  const remaining = impact - absorbed;
  const healthLost = Math.min(remaining, output.playerCondition);
  output.playerCondition = Math.max(0, output.playerCondition - remaining);
  if (healthLost > 0) output.pressure -= pressure;
  if (healthLost === 0) {
    return "Guard absorbed all " + impact + " Impact from " + enemyValue.name + ".";
  }
  if (absorbed > 0) {
    return (
      absorbed +
      " Guard absorbed. " +
      healthLost +
      " Health lost" +
      (pressure > 0 ? " · Control -" + pressure : "") +
      "."
    );
  }
  return (
    enemyValue.name +
    " dealt " +
    healthLost +
    " Health damage" +
    (pressure > 0 ? " · Control -" + pressure : "") +
    "."
  );
}

function resolveEnemyIntent(state, snapshot, intent, index) {
  const before = cloneSnapshot(snapshot);
  const output = cloneSnapshot(snapshot);
  const enemyValue = output.enemies.find(
    (entry) => entry.id === intent.actorId,
  );
  if (!enemyValue || enemyValue.hp <= 0) {
    return {
      snapshot: output,
      event: makeEvent({
        state,
        phase: "enemy",
        index,
        title: "ENEMY STOPPED",
        detail: "The locked intent was lost because its actor was defeated.",
        actorId: intent.actorId,
        targetId: intent.targetId,
        success: false,
        chance: intent.chance,
        roll: null,
        before,
        after: output,
        sceneCue: "enemy-stopped",
      }),
    };
  }
  let chance = intent.chance;
  if (enemyValue.suppressed) chance -= 25;
  chance = chanceStep(chance);
  const roll = deterministicThreeRouteRoll(
    state.seed,
    state.round,
    "enemy",
    index,
  );
  const success = roll <= chance;
  let detail = intent.name + " failed.";
  let cue = "enemy-stopped";
  if (success && intent.kind === "advance") {
    enemyValue.positionId = intent.destinationId;
    const reachedWayfinder =
      enemyValue.positionId === output.playerPositionId &&
      intent.impact > 0;
    detail = reachedWayfinder
      ? enemyValue.name +
        " reached " +
        zoneById(state.scenario, intent.destinationId).name +
        ". " +
        applyEnemyImpact(output, enemyValue, intent.impact, intent.pressure)
      : enemyValue.name +
        " advanced to " +
        zoneById(state.scenario, intent.destinationId).name +
        ".";
    if (reachedWayfinder) output.playerExposed = true;
    cue = reachedWayfinder ? "enemy-hit" : "enemy-advance";
  } else if (success && intent.kind === "guard") {
    const beforeGuard = enemyValue.guard;
    enemyValue.guard = Math.min(
      THREE_ROUTE_RULES.enemyGuardCap,
      enemyValue.guard + 1,
    );
    output.pressure -= intent.pressure;
    detail =
      enemyValue.guard > beforeGuard
        ? enemyValue.name + " gained 1 Guard"
        : enemyValue.name + " held a fully guarded position";
    if (intent.pressure > 0) {
      detail += " · Control -" + intent.pressure;
    }
    detail += ".";
    cue = "enemy-guard";
  } else if (success && intent.kind === "attack") {
    detail = applyEnemyImpact(
      output,
      enemyValue,
      intent.impact,
      intent.pressure,
    );
    output.playerExposed = true;
    cue = "enemy-hit";
  } else if (success && intent.kind === "objective") {
    const targetObject = state.scenario.objects.find(
      (objectValue) => objectValue.id === intent.targetId,
    );
    if (!targetObject || output.objectIntegrity[targetObject.id] === undefined) {
      detail = enemyValue.name + " found no legal objective to damage.";
      cue = "enemy-stopped";
    } else if (output.protectedObjectId === targetObject.id) {
      detail =
        targetObject.name +
        " was protected. " +
        enemyValue.name +
        " dealt no Integrity damage.";
      cue = "enemy-stopped";
    } else {
      const beforeIntegrity = output.objectIntegrity[targetObject.id];
      output.objectIntegrity[targetObject.id] = Math.max(
        0,
        beforeIntegrity - intent.impact,
      );
      output.pressure -= intent.pressure;
      detail =
        enemyValue.name +
        " breached " +
        targetObject.name +
        " · Integrity " +
        beforeIntegrity +
        " → " +
        output.objectIntegrity[targetObject.id] +
        (intent.pressure > 0 ? " · Control -" + intent.pressure : "") +
        ".";
      cue = "enemy-hit";
    }
  } else if (success && intent.kind === "disrupt") {
    const targetObject = state.scenario.objects.find(
      (objectValue) => objectValue.id === intent.targetId,
    );
    if (targetObject && output.protectedObjectId === targetObject.id) {
      detail =
        targetObject.name +
        " was protected. " +
        enemyValue.name +
        " failed to break its prepared state.";
      cue = "enemy-stopped";
    } else {
      const wasPrepared =
        targetObject &&
        output.preparedObjectIds.includes(targetObject.id);
      if (targetObject) {
        output.preparedObjectIds = output.preparedObjectIds.filter(
          (objectId) => objectId !== targetObject.id,
        );
      }
      output.pressure -= intent.pressure;
      detail =
        enemyValue.name +
        (wasPrepared
          ? " destroyed the " + targetObject.name + " prime"
          : " disrupted the field") +
        " · Control -" +
        intent.pressure +
        ".";
      output.playerExposed = true;
      cue = "enemy-hit";
    }
  }
  enemyValue.suppressed = false;
  return {
    snapshot: output,
    event: makeEvent({
      state,
      phase: "enemy",
      index,
      title: enemyValue.name.toUpperCase() + " · " + intent.name.toUpperCase(),
      detail,
      actorId: enemyValue.id,
      targetId: intent.targetId,
      success,
      chance,
      roll,
      before,
      after: output,
      sceneCue: cue,
    }),
  };
}

export function resolveThreeRouteRound(state) {
  const forcedYield =
    state.phase === "planning" &&
    state.player.plan.length === 0 &&
    !hasPlayableThreeRouteAction(state);
  if (
    state.phase !== "planning" ||
    (state.player.plan.length === 0 && !forcedYield)
  ) {
    return {
      ...structuredClone(state),
      notice: "Stage at least one action before resolving.",
    };
  }
  const draft = structuredClone(state);
  const conditionBefore = draft.player.condition;
  const pressureBefore = draft.pressure;
  const events = [];
  const grants = [];
  const successfulCategories = [];
  let snapshot = snapshotFromState(draft);
  let modifierDraws = [];
  if (forcedYield) {
    const before = cloneSnapshot(snapshot);
    snapshot.playerExposed = true;
    snapshot.pressure -= 1;
    events.push(
      makeEvent({
        state: draft,
        phase: "player",
        index: 0,
        title: "YIELD INITIATIVE · FORCED",
        detail:
          "No affordable legal card remained. The Wayfinder yielded initiative · Control -1.",
        actorId: "wayfinder",
        targetId: "wayfinder",
        success: false,
        chance: null,
        roll: null,
        before,
        after: snapshot,
        sceneCue: "player-failed",
      }),
    );
  }
  for (let index = 0; index < draft.player.plan.length; index += 1) {
    const step = draft.player.plan[index];
    const before = cloneSnapshot(snapshot);
    const invalidReason = invalidStepReason(draft, snapshot, step);
    if (invalidReason) {
      restoreInvalidStep(draft, step);
      events.push(
        makeEvent({
          state: draft,
          phase: "player",
          index,
          title: step.actionName.toUpperCase() + " · INVALIDATED",
          detail: invalidReason,
          actorId: "wayfinder",
          targetId: step.target.id,
          success: false,
          chance: step.forecast.chance,
          roll: null,
          before,
          after: snapshot,
          sceneCue: "player-invalidated",
        }),
      );
      continue;
    }
    const liveForecast = forecastAction(
      draft,
      step.card,
      step.target,
      snapshot,
      step.modifiers,
    );
    const roll = deterministicThreeRouteRoll(
      draft.seed,
      draft.round,
      "player",
      index,
    );
    const success = roll <= liveForecast.chance;
    const liveStep = { ...step, forecast: liveForecast };
    snapshot = success
      ? applySuccessfulAction(draft, snapshot, liveStep)
      : applyFailedPlayerAction(snapshot, liveStep);
    if (success) {
      successfulCategories.push(step.card.category);
      if (liveForecast.drawOnSuccess > 0) {
        modifierDraws.push({
          category: step.card.category,
          count: liveForecast.drawOnSuccess,
        });
      }
    }
    discardCard(draft, step.card);
    for (const modifier of step.modifiers) discardCard(draft, modifier);
    events.push(
      makeEvent({
        state: draft,
        phase: "player",
        index,
        title:
          step.actionName.toUpperCase() +
          (success ? " · SUCCESS" : " · FAILED"),
        detail:
          "Rolled " +
          roll +
          " against " +
          liveForecast.chance +
          "%. " +
          (success
            ? liveForecast.successLabel
            : liveForecast.failureLabel),
        actorId: "wayfinder",
        targetId: step.target.id,
        success,
        chance: liveForecast.chance,
        roll,
        before,
        after: snapshot,
        sceneCue: success ? "player-success" : "player-failed",
      }),
    );
  }
  for (let index = 0; index < draft.enemyIntents.length; index += 1) {
    const resolved = resolveEnemyIntent(
      draft,
      snapshot,
      draft.enemyIntents[index],
      index,
    );
    snapshot = resolved.snapshot;
    events.push(resolved.event);
    if (
      snapshot.playerCondition <= 0 ||
      (draft.scenario.defendedObjectId &&
        (snapshot.objectIntegrity[draft.scenario.defendedObjectId] ?? 0) <= 0)
    ) {
      break;
    }
  }
  draft.player.positionId = snapshot.playerPositionId;
  draft.player.condition = snapshot.playerCondition;
  draft.player.maxCondition = snapshot.playerMaxCondition;
  draft.player.guard = snapshot.playerGuard;
  draft.player.power = snapshot.playerPower;
  draft.player.exposed = snapshot.playerExposed;
  draft.player.flankBonus = snapshot.flankBonus;
  draft.enemies = snapshot.enemies;
  draft.objectiveProgress = snapshot.objectiveProgress;
  draft.objectIntegrity = snapshot.objectIntegrity;
  draft.protectedObjectId = snapshot.protectedObjectId;
  draft.preparedObjectIds = snapshot.preparedObjectIds;
  draft.pressure = clamp(
    snapshot.pressure,
    THREE_ROUTE_RULES.pressureMin,
    THREE_ROUTE_RULES.pressureMax,
  );
  const uniqueSuccessfulCategories = [
    ...new Set(successfulCategories),
  ].slice(0, 2);
  for (const category of uniqueSuccessfulCategories) {
    drawFromCategory(
      draft,
      category,
      draft.scenario.feed.drawUsedCategoryOnSuccess,
      "SUCCESS · " + category.toUpperCase(),
      grants,
    );
  }
  for (const entry of modifierDraws) {
    drawFromCategory(
      draft,
      entry.category,
      entry.count,
      "CACHE TAP",
      grants,
    );
  }
  const visibleTotal = CARD_CATEGORIES.reduce(
    (sum, category) =>
      sum + draft.player.pools[category].available.length,
    0,
  );
  if (visibleTotal === 0 && draft.scenario.feed.emptyPoolFallback > 0) {
    for (const category of CARD_CATEGORIES) {
      if (
        drawFromCategory(
          draft,
          category,
          draft.scenario.feed.emptyPoolFallback,
          "EMPTY POOL FALLBACK",
          grants,
        ) > 0
      ) {
        break;
      }
    }
  }
  let breakTriggered = false;
  if (
    draft.breakArmed &&
    (draft.pressure >= THREE_ROUTE_RULES.playerBreak ||
      draft.pressure <= THREE_ROUTE_RULES.enemyBreak)
  ) {
    breakTriggered = true;
    draft.breakArmed = false;
    for (const category of CARD_CATEGORIES) {
      drawFromCategory(
        draft,
        category,
        draft.scenario.feed.breakDrawPerCategory,
        "PRESSURE BREAK",
        grants,
      );
    }
  }
  if (
    !draft.breakArmed &&
    draft.pressure >= THREE_ROUTE_RULES.breakRearmMin &&
    draft.pressure <= THREE_ROUTE_RULES.breakRearmMax
  ) {
    draft.breakArmed = true;
  }
  let result = null;
  if (draft.player.condition <= 0) {
    result = {
      winner: "enemy",
      outcome: "compromised",
      title: "DEFEAT · WAYFINDER COMPROMISED",
      reason: "Wayfinder Health reached zero. The Wayfinder was Compromised.",
    };
  } else if (
    draft.scenario.defendedObjectId &&
    (draft.objectIntegrity[draft.scenario.defendedObjectId] ?? 0) <= 0
  ) {
    result = {
      winner: "enemy",
      outcome: "objective",
      title:
        "DEFEAT · " +
        draft.scenario.mission.enemyObjectiveResult.toUpperCase(),
      reason:
        draft.scenario.mission.enemyObjectiveResult +
        ". Its Integrity reached zero during the enemy response.",
    };
  } else if (
    draft.scenario.mission.eliminationVictory &&
    draft.enemies.every((entry) => entry.hp <= 0)
  ) {
    result = {
      winner: "player",
      outcome: "victory",
      title: "VICTORY · HOSTILES DEFEATED",
      reason: "Every hostile actor was defeated.",
    };
  } else if (
    draft.scenario.mission.objectiveVictory &&
    draft.scenario.objectiveGoal > 0 &&
    draft.objectiveProgress >= draft.scenario.objectiveGoal
  ) {
    result = {
      winner: "player",
      outcome: "objective",
      title:
        "VICTORY · " +
        draft.scenario.mission.objectiveResult.toUpperCase(),
      reason:
        draft.scenario.mission.objectiveResult +
        ". The physical battle objective was completed.",
    };
  } else if (
    snapshot.exitCompleted ||
    (draft.scenario.mission.exitOutcome === "victory" &&
      draft.scenario.exits.includes(snapshot.playerPositionId) &&
      exitIsSecured(draft, snapshot, snapshot.playerPositionId))
  ) {
    result =
      draft.scenario.mission.exitOutcome === "victory"
        ? {
            winner: "player",
            outcome: "extraction",
            title: "VICTORY · EXTRACTION COMPLETE",
            reason: "The Wayfinder reached the mission extraction point.",
          }
        : {
            winner: null,
            outcome: "withdrawal",
            title: "WITHDRAWAL · MISSION INCOMPLETE",
            reason:
              "The Wayfinder survived by withdrawing, but the mission objective was not completed.",
          };
  } else if (
    draft.scenario.mission.controlVictory &&
    draft.pressure >= THREE_ROUTE_RULES.pressureMax
  ) {
    result = {
      winner: "player",
      outcome: "pressure",
      title: "VICTORY · COMPLETE CONTROL",
      reason: "The Wayfinder secured complete battle control.",
    };
  } else if (
    draft.scenario.mission.controlDefeat &&
    draft.pressure <= THREE_ROUTE_RULES.pressureMin
  ) {
    result = {
      winner: "enemy",
      outcome: "pressure",
      title: "DEFEAT · CONTROL LOST",
      reason: "The hostile formation secured complete battle control.",
    };
  } else if (
    draft.scenario.mission.roundLimit !== null &&
    draft.round >= draft.scenario.mission.roundLimit
  ) {
    const timeoutWinner = draft.scenario.mission.timeoutWinner;
    result = {
      winner: timeoutWinner,
      outcome: draft.scenario.mission.timeoutOutcome,
      title:
        (timeoutWinner === "player"
          ? "VICTORY · "
          : timeoutWinner === "enemy"
            ? "DEFEAT · "
            : "BATTLE ENDED · ") +
        draft.scenario.mission.timeoutResult.toUpperCase(),
      reason:
        draft.scenario.mission.timeoutResult +
        " at the end of round " +
        draft.scenario.mission.roundLimit +
        (timeoutWinner === "player"
          ? ". The required defense window was completed."
          : ". The mission objective was not completed in time."),
    };
  }
  const settleBefore = cloneSnapshot(snapshot);
  const settleAfter = cloneSnapshot(snapshot);
  settleAfter.pressure = draft.pressure;
  events.push(
    makeEvent({
      state: draft,
      phase: "settle",
      index: 0,
      title: result ? "BATTLE SETTLED" : "ROUND SETTLED",
      detail:
        "Health " +
        conditionBefore +
        " → " +
        draft.player.condition +
        " · Control " +
        pressureBefore +
        " → " +
        draft.pressure +
        ". " +
        grants.reduce((sum, entry) => sum + entry.actual, 0) +
        " cards granted.",
      actorId: "system",
      targetId: null,
      success: true,
      chance: null,
      roll: null,
      before: settleBefore,
      after: settleAfter,
      sceneCue: result
        ? result.winner === "player"
          ? "battle-victory"
          : result.winner === "enemy"
            ? "battle-defeat"
            : "battle-withdrawal"
        : breakTriggered
          ? "pressure-break"
          : "settle",
    }),
  );
  draft.currentReview = {
    round: draft.round,
    conditionBefore,
    conditionAfter: draft.player.condition,
    conditionDelta: draft.player.condition - conditionBefore,
    pressureBefore,
    pressureAfter: draft.pressure,
    pressureDelta: draft.pressure - pressureBefore,
    breakTriggered,
    events,
    grants,
    result,
  };
  draft.history.push(draft.currentReview);
  draft.player.plan = [];
  draft.pendingActions = [];
  draft.result = result;
  draft.phase = result ? "result" : "round-review";
  draft.notice = result ? result.reason : "Round settled. Review the causal sequence.";
  return draft;
}

export function startNextThreeRouteRound(state) {
  if (state.phase !== "round-review") return structuredClone(state);
  const draft = structuredClone(state);
  draft.round += 1;
  draft.phase = "planning";
  draft.currentReview = null;
  draft.player.reserve = Math.min(
    THREE_ROUTE_RULES.reserveCap,
    draft.player.reserve + THREE_ROUTE_RULES.reservePerRound,
  );
  draft.player.exposed = false;
  draft.player.flankBonus = false;
  draft.protectedObjectId = null;
  const grants = [];
  for (const category of CARD_CATEGORIES) {
    drawFromCategory(
      draft,
      category,
      draft.scenario.feed.roundStart[category] ?? 0,
      "ROUND START",
      grants,
    );
  }
  draft.currentRoundGrant = grants;
  draft.enemyIntents = planThreeRouteEnemyIntents(draft);
  draft.notice =
    "+" +
    THREE_ROUTE_RULES.reservePerRound +
    " Command Points banked · " +
    draft.player.reserve +
    "/" +
    THREE_ROUTE_RULES.reserveCap +
    ". " +
    (grants.reduce((sum, entry) => sum + entry.actual, 0) > 0
      ? "Round-start category grants applied."
      : "No automatic card grant in this scenario.");
  return draft;
}

export function createThreeRouteState(
  seed = "barcode-world-three-route",
  scenarioId = DEFAULT_THREE_ROUTE_SCENARIO_ID,
  { enemyDifficulty = "standard" } = {},
) {
  const scenarioValue = getThreeRouteScenario(scenarioId);
  const state = {
    version: "0.4",
    source: THREE_ROUTE_SOURCE,
    baseSeed: seed,
    seed,
    shuffleIndex: 0,
    scenarioId: scenarioValue.id,
    scenario: scenarioValue,
    enemyDifficulty: THREE_ROUTE_AI_DIFFICULTIES.includes(enemyDifficulty)
      ? enemyDifficulty
      : "standard",
    round: 1,
    phase: "planning",
    pressure: 0,
    breakArmed: true,
    result: null,
    notice: "Choose a card. Its legal theater targets will become the three route choices.",
    player: {
      positionId: scenarioValue.playerStart,
      condition: THREE_ROUTE_RULES.conditionStart,
      maxCondition: THREE_ROUTE_RULES.conditionMax,
      guard: 0,
      power: 0,
      exposed: false,
      flankBonus: false,
      reserve: THREE_ROUTE_RULES.reserveStart,
      pools: Object.fromEntries(
        CARD_CATEGORIES.map((category) => [
          category,
          createCategoryPool(category, seed + ":" + scenarioValue.id),
        ]),
      ),
      plan: [],
    },
    enemies: scenarioValue.enemies.map((entry) => structuredClone(entry)),
    enemyIntents: [],
    objectiveProgress: 0,
    objectIntegrity: Object.fromEntries(
      scenarioValue.objects
        .filter((entry) => Number.isFinite(entry.integrity))
        .map((entry) => [entry.id, entry.integrity]),
    ),
    protectedObjectId: null,
    preparedObjectIds: [],
    usedContextCardIds: [],
    pendingActions: [],
    currentReview: null,
    currentRoundGrant: [],
    history: [],
    playerActionSequence: 0,
  };
  state.enemyIntents = planThreeRouteEnemyIntents(state);
  return state;
}

export function replaySameThreeRouteState(state) {
  return createThreeRouteState(state.baseSeed, state.scenarioId, {
    enemyDifficulty: state.enemyDifficulty,
  });
}

export function replayNewThreeRouteShuffle(state) {
  const shuffleIndex = state.shuffleIndex + 1;
  const next = createThreeRouteState(
    state.baseSeed + ":shuffle:" + shuffleIndex,
    state.scenarioId,
    { enemyDifficulty: state.enemyDifficulty },
  );
  next.baseSeed = state.baseSeed;
  next.shuffleIndex = shuffleIndex;
  return next;
}

function routeScore(state, choice, policy = "deliberate") {
  const chance = choice.forecast.chance / 100;
  const cardValue = choice.card;
  let score =
    chance *
    (choice.forecast.impact * 5 +
      choice.forecast.guard * 2 +
      choice.forecast.drawOnSuccess * 3);
  if (cardValue.kind === "context") score += 12;
  if (cardValue.kind === "modifier") score += 2;
  if (
    ["scan", "charge"].includes(cardValue.designId) &&
    choice.target.kind === "object" &&
    state.scenario.contextCardIds.some(
      (contextId) =>
        CONTEXT_CARD_DEFINITIONS[contextId]?.contextFeature ===
        choice.target.feature,
    ) &&
    !state.preparedObjectIds.includes(choice.target.id)
  ) {
    score += 10;
  }
  if (
    cardValue.designId === "protect" &&
    choice.target.kind === "object" &&
    state.enemyIntents.some(
      (intent) =>
        ["disrupt", "objective"].includes(intent.kind) &&
        intent.targetId === choice.target.id,
    )
  ) {
    score += state.scenario.defendedObjectId === choice.target.id ? 20 : 9;
  }
  if (cardValue.category === "movement" && choice.target.kind === "zone") {
    const projected = projectPlannedTheater(state);
    const before = Math.min(
      ...aliveEnemies(projected).map((entry) =>
        graphDistance(
          state.scenario,
          projected.playerPositionId,
          entry.positionId,
        ),
      ),
    );
    const after = Math.min(
      ...aliveEnemies(projected).map((entry) =>
        graphDistance(
          state.scenario,
          choice.target.zoneId,
          entry.positionId,
        ),
      ),
    );
    if (after < before) score += 4;
  }
  if (cardValue.designId === "guard" && state.enemyIntents.some((entry) => entry.kind === "attack")) {
    score += 4;
  }
  if (
    state.scenario.defendedObjectId &&
    choice.target.kind === "zone"
  ) {
    const defendedObject = state.scenario.objects.find(
      (entry) => entry.id === state.scenario.defendedObjectId,
    );
    if (defendedObject) {
      const projected = projectPlannedTheater(state);
      const before = graphDistance(
        state.scenario,
        projected.playerPositionId,
        defendedObject.zoneId,
      );
      const after = graphDistance(
        state.scenario,
        choice.target.zoneId,
        defendedObject.zoneId,
      );
      if (after < before) score += 8;
    }
  }
  if (
    cardValue.designId === "retreat" &&
    state.scenario.mission.exitOutcome === "victory"
  ) {
    score += 8;
  } else if (cardValue.designId === "retreat" && state.pressure > -3) {
    score -= 8;
  }
  if (policy === "objective") {
    if (cardValue.kind === "context") score += 18;
    if (choice.target.id === state.scenario.defendedObjectId) score += 18;
    if (
      cardValue.move &&
      state.scenario.mission.exitOutcome === "victory"
    ) {
      score += 14;
    }
    if (["scan", "charge", "protect"].includes(cardValue.designId)) score += 5;
  } else if (policy === "aggressive") {
    score += choice.forecast.impact * 8 + choice.forecast.control * 4;
    if (cardValue.category === "offense") score += 8;
    if (cardValue.category === "defense") score -= 3;
  } else if (policy === "defensive") {
    score += choice.forecast.guard * 7 + choice.forecast.restore * 8;
    if (["guard", "brace", "protect", "stabilize", "evade"].includes(cardValue.designId)) {
      score += 8;
    }
    if (state.player.condition <= 5 && cardValue.designId === "stabilize") score += 20;
  }
  return score;
}

function chooseSimulationAction(state, policy = "deliberate") {
  const choices = [];
  for (const category of CARD_CATEGORIES) {
    for (const cardValue of getVisibleCategoryCards(state, category)) {
      for (const choice of getThreeRouteChoices(state, cardValue.id)) {
        choices.push({
          cardId: cardValue.id,
          choice,
          score: routeScore(state, choice, policy),
        });
      }
    }
  }
  if (choices.length === 0) return null;
  if (policy === "first-legal") return choices[0];
  if (policy === "random") {
    const index = Math.floor(
      deterministicUnit(
        state.seed +
          ":player-policy:random:" +
          state.round +
          ":" +
          state.pendingActions.length,
      ) * choices.length,
    );
    return choices[index];
  }
  return choices.sort(
    (left, right) =>
      right.score - left.score ||
      left.choice.actionName.localeCompare(right.choice.actionName) ||
      left.choice.id.localeCompare(right.choice.id),
  )[0] ?? null;
}

function cycleSimulationCategory(state) {
  const ranked = CARD_CATEGORIES.map((category) => {
    const legal = getVisibleCategoryCards(state, category).reduce(
      (sum, cardValue) =>
        sum + getThreeRouteChoices(state, cardValue.id).length,
      0,
    );
    return {
      category,
      legal,
      available: state.player.pools[category].available.length,
    };
  }).sort(
    (left, right) =>
      left.legal - right.legal ||
      right.available - left.available ||
      left.category.localeCompare(right.category),
  );
  const candidate =
    ranked.find(
      (entry) =>
        entry.available === 0 &&
        (state.player.pools[entry.category].drawPile.length > 0 ||
          state.player.pools[entry.category].discard.length > 0),
    ) ?? ranked.find((entry) => entry.available > 0);
  if (!candidate) return state;
  if (candidate.available > 0 && state.player.reserve < 1) return state;
  return cycleThreeRouteCategory(state, candidate.category);
}

function enemyEventWasMeaningful(event) {
  if (!event.success) return false;
  if (event.before.playerCondition !== event.after.playerCondition) return true;
  if (event.before.pressure !== event.after.pressure) return true;
  if (event.before.playerPositionId !== event.after.playerPositionId) return true;
  if (
    JSON.stringify(event.before.objectIntegrity) !==
    JSON.stringify(event.after.objectIntegrity)
  ) {
    return true;
  }
  if (
    JSON.stringify(event.before.preparedObjectIds) !==
    JSON.stringify(event.after.preparedObjectIds)
  ) {
    return true;
  }
  const beforeActor = event.before.enemies.find((entry) => entry.id === event.actorId);
  const afterActor = event.after.enemies.find((entry) => entry.id === event.actorId);
  return Boolean(
    beforeActor &&
      afterActor &&
      (beforeActor.positionId !== afterActor.positionId ||
        beforeActor.guard !== afterActor.guard),
  );
}

export function runThreeRouteSimulation({
  battles = 100,
  seedPrefix = "three-route-simulation",
  maxRounds = 30,
  scenarioId = DEFAULT_THREE_ROUTE_SCENARIO_ID,
  policy = "deliberate",
  enemyDifficulty = "standard",
} = {}) {
  const normalizedPolicy = THREE_ROUTE_PLAYER_POLICIES.includes(policy)
    ? policy
    : "deliberate";
  const normalizedDifficulty = THREE_ROUTE_AI_DIFFICULTIES.includes(enemyDifficulty)
    ? enemyDifficulty
    : "standard";
  const summary = {
    version: "0.4",
    scenarioId,
    policy: normalizedPolicy,
    enemyDifficulty: normalizedDifficulty,
    battles,
    maxRounds,
    playerWins: 0,
    enemyWins: 0,
    retreats: 0,
    unfinished: 0,
    rounds: [],
    actions: 0,
    commandPointsSpent: 0,
    contextCardsUsed: 0,
    firstRoundWins: 0,
    stalledBattles: 0,
    invalidatedActions: 0,
    enemyIntents: 0,
    enemySuccesses: 0,
    meaningfulEnemyActions: 0,
    playerHealthLost: 0,
    objectIntegrityLost: 0,
    enemyIntentKinds: {},
    outcomeCounts: {},
    categoryUses: Object.fromEntries(
      CARD_CATEGORIES.map((category) => [category, 0]),
    ),
  };
  for (let battle = 0; battle < battles; battle += 1) {
    let state = createThreeRouteState(
      seedPrefix + ":" + battle,
      scenarioId,
      { enemyDifficulty: normalizedDifficulty },
    );
    let stalled = false;
    while (state.phase !== "result" && state.round <= maxRounds) {
      while (
        state.phase === "planning" &&
        state.player.plan.length < THREE_ROUTE_RULES.maxPlanSteps
      ) {
        let pick = chooseSimulationAction(state, normalizedPolicy);
        if (!pick && state.player.plan.length === 0) {
          let cycleAttempts = 0;
          while (
            !pick &&
            cycleAttempts < CARD_CATEGORIES.length * 2
          ) {
            const beforeCycle = JSON.stringify(
              CARD_CATEGORIES.map((category) =>
                state.player.pools[category].available.map(
                  (entry) => entry.id,
                ),
              ),
            );
            state = cycleSimulationCategory(state);
            const afterCycle = JSON.stringify(
              CARD_CATEGORIES.map((category) =>
                state.player.pools[category].available.map(
                  (entry) => entry.id,
                ),
              ),
            );
            if (beforeCycle === afterCycle) break;
            pick = chooseSimulationAction(state, normalizedPolicy);
            cycleAttempts += 1;
          }
        }
        if (!pick) break;
        const beforeCount = state.pendingActions.length;
        const reserveBefore = state.player.reserve;
        state = chooseThreeRoute(
          state,
          pick.cardId,
          pick.choice.id,
        );
        if (state.pendingActions.length === beforeCount) break;
        summary.commandPointsSpent += Math.max(
          0,
          reserveBefore - state.player.reserve,
        );
        if (!pick.choice.modifier) {
          summary.actions += 1;
          summary.categoryUses[pick.choice.card.category] += 1;
          if (pick.choice.card.context) summary.contextCardsUsed += 1;
        }
      }
      if (state.phase !== "planning") {
        stalled = state.phase !== "result";
        break;
      }
      if (state.player.plan.length === 0 && hasPlayableThreeRouteAction(state)) {
        stalled = true;
        break;
      }
      const healthBefore = state.player.condition;
      const integrityBefore = Object.values(state.objectIntegrity).reduce(
        (sum, value) => sum + value,
        0,
      );
      for (const intent of state.enemyIntents) {
        summary.enemyIntents += 1;
        summary.enemyIntentKinds[intent.kind] =
          (summary.enemyIntentKinds[intent.kind] ?? 0) + 1;
      }
      state = resolveThreeRouteRound(state);
      const reviewEvents = state.currentReview?.events ?? [];
      for (const event of reviewEvents) {
        if (event.phase === "player" && event.title.includes("INVALIDATED")) {
          summary.invalidatedActions += 1;
        }
        if (event.phase === "enemy" && event.success) {
          summary.enemySuccesses += 1;
          if (enemyEventWasMeaningful(event)) summary.meaningfulEnemyActions += 1;
        }
      }
      summary.playerHealthLost += Math.max(0, healthBefore - state.player.condition);
      const integrityAfter = Object.values(state.objectIntegrity).reduce(
        (sum, value) => sum + value,
        0,
      );
      summary.objectIntegrityLost += Math.max(0, integrityBefore - integrityAfter);
      if (state.phase === "round-review") {
        state = startNextThreeRouteRound(state);
      }
    }
    if (stalled) summary.stalledBattles += 1;
    summary.rounds.push(Math.min(state.round, maxRounds));
    const outcome = state.result?.outcome ?? "unfinished";
    summary.outcomeCounts[outcome] =
      (summary.outcomeCounts[outcome] ?? 0) + 1;
    if (state.result?.outcome === "withdrawal") summary.retreats += 1;
    else if (state.result?.winner === "player") {
      summary.playerWins += 1;
      if (state.round === 1) summary.firstRoundWins += 1;
    }
    else if (state.result?.winner === "enemy") summary.enemyWins += 1;
    else summary.unfinished += 1;
  }
  summary.averageRounds =
    summary.rounds.length > 0
      ? summary.rounds.reduce((sum, value) => sum + value, 0) /
        summary.rounds.length
      : 0;
  summary.playerWinRate = battles > 0 ? summary.playerWins / battles : 0;
  summary.enemyMeaningfulRate =
    summary.enemySuccesses > 0
      ? summary.meaningfulEnemyActions / summary.enemySuccesses
      : 0;
  return summary;
}

export function runThreeRouteLaboratory({
  battlesPerCell = 100,
  seedPrefix = "three-route-laboratory",
  maxRounds = 30,
  scenarioIds = THREE_ROUTE_SCENARIOS.map((entry) => entry.id),
  policies = ["deliberate", "random", "first-legal"],
  difficulties = ["basic", "standard", "tactical"],
} = {}) {
  const cells = [];
  for (const scenarioId of scenarioIds) {
    for (const enemyDifficulty of difficulties) {
      for (const policy of policies) {
        cells.push(
          runThreeRouteSimulation({
            battles: battlesPerCell,
            seedPrefix: seedPrefix + ":" + scenarioId,
            maxRounds,
            scenarioId,
            policy,
            enemyDifficulty,
          }),
        );
      }
    }
  }
  const comparisons = scenarioIds.flatMap((scenarioId) =>
    difficulties.map((enemyDifficulty) => {
      const deliberate = cells.find(
        (entry) =>
          entry.scenarioId === scenarioId &&
          entry.enemyDifficulty === enemyDifficulty &&
          entry.policy === "deliberate",
      );
      const random = cells.find(
        (entry) =>
          entry.scenarioId === scenarioId &&
          entry.enemyDifficulty === enemyDifficulty &&
          entry.policy === "random",
      );
      return {
        scenarioId,
        enemyDifficulty,
        deliberateWinRate: deliberate?.playerWinRate ?? 0,
        randomWinRate: random?.playerWinRate ?? 0,
        intentionalAdvantage:
          (deliberate?.playerWinRate ?? 0) - (random?.playerWinRate ?? 0),
      };
    }),
  );
  return {
    version: "0.4",
    battlesPerCell,
    maxRounds,
    cells,
    comparisons,
  };
}
