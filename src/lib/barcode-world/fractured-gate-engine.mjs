import {
  BUILDS,
  CARDS,
  CORE_RULES,
} from "./constants.mjs";

export const FRACTURED_GATE_SOURCE =
  "BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_PREIMPLEMENTATION_CHECKPOINT_2026-07-26";

export const RESULT_TYPES = Object.freeze([
  "Fast Secure",
  "Clean Secure",
  "Recovery Secure",
  "Gate Lost",
  "Controlled Retreat",
]);

export const BOARD_FOCUSES = Object.freeze({
  "west-exit": {
    id: "west-exit",
    name: "West Exit",
    kind: "exit",
    x: 6,
    y: 62,
    description:
      "The physical retreat route. Leaving records a Controlled Retreat and abandons unresolved priorities.",
  },
  entry: {
    id: "entry",
    name: "Entry",
    kind: "position",
    x: 18,
    y: 78,
    description:
      "Your insertion point. It connects to the Lower Yard, Upper Walk stairs, Actuator trench, and West Exit.",
  },
  player: {
    id: "player",
    name: "Player",
    kind: "player",
    x: 18,
    y: 65,
    description:
      "Your one directly controlled character. Solo play has no hidden helper or missing-role penalty.",
  },
  "lower-cover": {
    id: "lower-cover",
    name: "Lower Yard Cover",
    kind: "terrain",
    positionId: "lower-cover",
    x: 28,
    y: 79,
    description:
      "Low fractured plating beside the Assault line. It is one ordinary step from Entry.",
  },
  "lower-yard": {
    id: "lower-yard",
    name: "Lower Yard",
    kind: "terrain",
    positionId: "lower-yard",
    x: 41,
    y: 68,
    description:
      "The universal confrontation space and the longer ordinary approach to Gate Platform.",
  },
  assault: {
    id: "assault",
    name: "Assault",
    kind: "enemy",
    x: 48,
    y: 53,
    description:
      "A single hostile unit committed to an Impact Rush against the unstable Gate.",
  },
  "impact-rush": {
    id: "impact-rush",
    name: "Impact Rush",
    kind: "intent",
    x: 62,
    y: 50,
    description:
      "Confirmed · Standard. If it is not stopped, the Gate loses one Stability pip.",
  },
  "cracked-divider": {
    id: "cracked-divider",
    name: "Cracked Divider",
    kind: "terrain",
    x: 58,
    y: 69,
    description:
      "A visibly damaged barrier. A Battle answer can turn the Assault's own Force into an Opening.",
  },
  "upper-walk": {
    id: "upper-walk",
    name: "Upper Walk",
    kind: "terrain",
    positionId: "upper-walk",
    x: 38,
    y: 17,
    description:
      "An elevated optional approach. Its missing eastern span must be prepared, preserved, or replaced.",
  },
  "field-cache": {
    id: "field-cache",
    name: "Field Cache",
    kind: "cache",
    x: 58,
    y: 19,
    description:
      "Optional prototype recovery. Taking it delays the primary objective and creates a different result.",
  },
  "service-gap": {
    id: "service-gap",
    name: "Service Gap",
    kind: "terrain",
    x: 60,
    y: 36,
    description:
      "A narrow relationship beneath the Upper Walk. It can become a Route if its closure mechanism is handled.",
  },
  "gate-actuator": {
    id: "gate-actuator",
    name: "Gate Actuator",
    kind: "machinery",
    positionId: "actuator",
    x: 68,
    y: 87,
    description:
      "Local machinery with bounded authored Outputs: a defensive bollard or a service lift.",
  },
  "gate-platform": {
    id: "gate-platform",
    name: "Gate Platform",
    kind: "position",
    positionId: "gate-platform",
    x: 82,
    y: 64,
    description:
      "The objective space. Begin a planning cycle here to complete Stabilize Gate.",
  },
  gate: {
    id: "gate",
    name: "Fractured Gate",
    kind: "objective",
    x: 92,
    y: 47,
    description:
      "The primary objective. Three Stability pips track how many unopposed Impact Rushes it can survive.",
  },
  breach: {
    id: "breach",
    name: "Projected Breach",
    kind: "opening",
    x: 67,
    y: 59,
    description:
      "A causal Opening created by driving the Assault into the Cracked Divider.",
  },
  "upper-route": {
    id: "upper-route",
    name: "Prepared Upper Route",
    kind: "opening",
    x: 68,
    y: 30,
    description:
      "A prepared relationship from the Upper Walk to Gate Platform.",
  },
  "service-route": {
    id: "service-route",
    name: "Prepared Service Route",
    kind: "opening",
    x: 70,
    y: 40,
    description:
      "A protected rear approach created from the service gap.",
  },
  "service-lift": {
    id: "service-lift",
    name: "Service Lift",
    kind: "opening",
    x: 70,
    y: 27,
    description:
      "Temporary machine-created geometry. It resets after Settle and may isolate the player.",
  },
  regulator: {
    id: "regulator",
    name: "Impact Regulator",
    kind: "component",
    x: 52,
    y: 50,
    description:
      "Protected hardware exposed only after a physical answer to the Assault's Rush.",
  },
});

const POSITION_COORDS = Object.freeze({
  "west-exit": { x: 6, y: 62 },
  entry: { x: 18, y: 65 },
  "lower-cover": { x: 33, y: 70 },
  "lower-yard": { x: 45, y: 61 },
  "upper-walk": { x: 45, y: 24 },
  actuator: { x: 63, y: 79 },
  "gate-platform": { x: 79, y: 53 },
});

const POSITION_NAMES = Object.freeze({
  "west-exit": "West Exit",
  entry: "Entry",
  "lower-cover": "Lower Yard Cover",
  "lower-yard": "Lower Yard",
  "upper-walk": "Upper Walk",
  actuator: "Gate Actuator",
  "gate-platform": "Gate Platform",
});

const ORDINARY_EDGES = Object.freeze([
  ["west-exit", "entry"],
  ["entry", "lower-cover"],
  ["entry", "upper-walk"],
  ["entry", "actuator"],
  ["lower-cover", "lower-yard"],
  ["lower-yard", "actuator"],
  ["lower-yard", "gate-platform"],
]);

const LANE_ORDER = Object.freeze(["Fast", "Standard", "Slow"]);
const LANE_RANK = Object.freeze({ Fast: 0, Standard: 1, Slow: 2 });
const ACTIVE_ENEMY_STATUSES = new Set(["active", "staggered", "pinned"]);

const ACTIONS = Object.freeze({
  reposition: {
    id: "reposition",
    parent: "Move",
    label: "Reposition",
    description: "Take one free ordinary adjacent step.",
    cost: 0,
    paid: false,
    lane: "Standard",
    tempo: 9,
    compatibilityKey: "reposition",
  },
  advance: {
    id: "advance",
    parent: "Move",
    label: "Advance",
    description: "Take one additional ordinary adjacent step.",
    cost: 4,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "additional-movement",
  },
  attack: {
    id: "attack",
    parent: "Attack",
    label: "Weapon Attack",
    description: "Break 2 Guard, then deliver 6 Impact to the Assault.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 6,
    compatibilityKey: "attack",
  },
  guard: {
    id: "guard",
    parent: "Defend",
    label: "Guard",
    description: "Gain 4 Guard against the next visible pressure.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 5,
    compatibilityKey: "guard",
  },
  "guard-impact": {
    id: "guard-impact",
    parent: "Defend",
    label: "Brace the Rush",
    description: "Protect the Gate line from this Impact Rush.",
    cost: 6,
    paid: true,
    lane: "Fast",
    tempo: 6,
    compatibilityKey: "guard",
  },
  "stabilize-gate": {
    id: "stabilize-gate",
    parent: "Use",
    label: "Stabilize Gate",
    description: "Complete the objective and activate the defensive seal.",
    cost: 6,
    paid: true,
    lane: "Standard",
    tempo: 7,
    compatibilityKey: "work-objective",
  },
  "recover-cache": {
    id: "recover-cache",
    parent: "Use",
    label: "Recover Field Cache",
    description: "Take the prototype Package before leaving the Upper Walk.",
    cost: 4,
    paid: true,
    lane: "Slow",
    tempo: 5,
    compatibilityKey: "recover-package",
  },
  leave: {
    id: "leave",
    parent: "Leave",
    label: "Controlled Retreat",
    description: "Exit safely and record everything left unresolved.",
    cost: 8,
    paid: true,
    lane: "Standard",
    tempo: 10,
    compatibilityKey: "standard-extract",
  },
  "answer-divider": {
    id: "answer-divider",
    parent: "Discipline",
    label: "Answer Rush at Divider",
    description:
      "Meet the hostile Commitment and turn its Force into a physical breach.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 9,
    compatibilityKey: "answer-commitment",
  },
  "cross-breach": {
    id: "cross-breach",
    parent: "Move",
    label: "Cross Created Opening",
    description: "Use the confrontation-created breach to reach Gate Platform.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Standard",
    tempo: 4,
    compatibilityKey: "cross-opening",
  },
  "prepare-upper-route": {
    id: "prepare-upper-route",
    parent: "Discipline",
    label: "Prepare Upper Route",
    description: "Establish a dependable physical relationship to Gate Platform.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "prepare-route",
  },
  "contest-upper-landing": {
    id: "contest-upper-landing",
    parent: "Discipline",
    label: "Contest Threatened Landing",
    description: "Physically protect the prepared landing from the Rush.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Standard",
    tempo: 7,
    compatibilityKey: "contest",
  },
  "cross-upper-route": {
    id: "cross-upper-route",
    parent: "Move",
    label: "Exploit Upper Route",
    description: "Spend the prepared Route to reach Gate Platform.",
    cost: CORE_RULES.majorPayoffCost,
    paid: true,
    lane: "Standard",
    tempo: 4,
    compatibilityKey: "exploit-route",
  },
  "answer-regulator": {
    id: "answer-regulator",
    parent: "Discipline",
    label: "Expose Impact Regulator",
    description:
      "Answer the Rush physically so the Assault's protected regulator becomes reachable.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 9,
    compatibilityKey: "answer-commitment",
  },
  "suppress-regulator": {
    id: "suppress-regulator",
    parent: "Discipline",
    label: "Suppress Regulator Reset",
    description: "Delay the actual automatic response that would reseal the hardware.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Fast",
    tempo: 6,
    compatibilityKey: "suppress-response",
  },
  "establish-bollard-control": {
    id: "establish-bollard-control",
    parent: "Discipline",
    label: "Control Defensive Bollard",
    description: "Establish local Control at the exposed Actuator face.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "establish-control",
  },
  "contest-actuator": {
    id: "contest-actuator",
    parent: "Discipline",
    label: "Hold Actuator Access",
    description: "Contest the Rush so physical access survives Settle.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Standard",
    tempo: 7,
    compatibilityKey: "contest",
  },
  "execute-bollard": {
    id: "execute-bollard",
    parent: "Discipline",
    label: "Execute Bollard Output",
    description: "Spend Control to redirect and pin the Assault.",
    cost: CORE_RULES.majorPayoffCost,
    paid: true,
    lane: "Standard",
    tempo: 9,
    compatibilityKey: "execute-output",
  },
  "prepare-service-route": {
    id: "prepare-service-route",
    parent: "Discipline",
    label: "Prepare Service Route",
    description: "Turn the service gap into a protected rear relationship.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "prepare-route",
  },
  "suppress-service-closure": {
    id: "suppress-service-closure",
    parent: "Discipline",
    label: "Suppress Automatic Closure",
    description: "Delay the real mechanism that would close the prepared gap.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Fast",
    tempo: 6,
    compatibilityKey: "suppress-response",
  },
  "cross-service-route": {
    id: "cross-service-route",
    parent: "Move",
    label: "Exploit Service Route",
    description: "Use the preserved rear Route to reach Gate Platform.",
    cost: CORE_RULES.majorPayoffCost,
    paid: true,
    lane: "Standard",
    tempo: 4,
    compatibilityKey: "exploit-route",
  },
  "establish-lift-control": {
    id: "establish-lift-control",
    parent: "Discipline",
    label: "Control Service Lift",
    description: "Establish local Control over the lift mechanism.",
    cost: CORE_RULES.majorSetupCost,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "establish-control",
  },
  "execute-lift": {
    id: "execute-lift",
    parent: "Discipline",
    label: "Execute Lift Output",
    description: "Spend Control to move machinery into the missing upper span.",
    cost: CORE_RULES.majorPayoffCost,
    paid: true,
    lane: "Standard",
    tempo: 8,
    compatibilityKey: "execute-output",
  },
  "cross-lift": {
    id: "cross-lift",
    parent: "Move",
    label: "Cross Service Lift",
    description: "Cross the temporary geometry before it resets.",
    cost: CORE_RULES.minorFoundationCost,
    paid: true,
    lane: "Standard",
    tempo: 4,
    compatibilityKey: "cross-opening",
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function neighbors(positionId) {
  return ORDINARY_EDGES.flatMap(([left, right]) => {
    if (left === positionId) return [right];
    if (right === positionId) return [left];
    return [];
  });
}

function cardReserved(state, cardId) {
  return state.plan.some((action) => action.cardId === cardId);
}

export function availableCommand(state) {
  return Math.max(
    0,
    state.command -
      state.plan.reduce((sum, action) => sum + action.totalCost, 0),
  );
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

function majorLabel(buildId) {
  const build = getBuild(buildId);
  if (build.major === "battle") return "Battle Ready";
  if (build.major === "exploration") return "Route Sense Ready";
  return "Local Control Ready";
}

export function createFracturedGateState(
  buildId = "battle-exploration",
) {
  const build = getBuild(buildId);
  return {
    sourceRevision: FRACTURED_GATE_SOURCE,
    seed: "FRACTURED-GATE-001",
    buildId: build.id,
    round: 1,
    phase: "planning",
    command: CORE_RULES.commandStart,
    condition: 12,
    guard: 4,
    position: "entry",
    freeRepositionUsed: false,
    planningActionCount: 0,
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
    },
    enemy: {
      id: "assault",
      status: "active",
      condition: 8,
      guard: 4,
      position: "lower-yard",
      regulator: "shielded",
      regulatorResetSuppressed: false,
      staggered: false,
    },
    divider: {
      status: "cracked",
    },
    actuator: {
      mode: null,
      controlled: false,
      accessHeld: false,
      quietRewrite: false,
    },
    upperRoute: {
      prepared: false,
      protected: false,
      destinationClaim: false,
    },
    serviceRoute: {
      prepared: false,
      closureSuppressed: false,
      destinationClaim: false,
    },
    lift: {
      deployed: false,
      resetAfterSettle: false,
    },
    cache: {
      status: "available",
    },
    deck: [...build.deck],
    hand: build.deck.slice(0, CORE_RULES.openingHand),
    drawIndex: CORE_RULES.openingHand,
    discard: [],
    plan: [],
    nextActionSequence: 1,
    warning: "",
    resolution: null,
    settleSummary: null,
    review: [],
    result: null,
    retreated: false,
    flags: {
      rushBlocked: false,
      regulatorSuppressionArmed: false,
      serviceSuppressionArmed: false,
      turningPoint: null,
    },
  };
}

export function resetFracturedGate(state) {
  return createFracturedGateState(state.buildId);
}

export function changeFracturedGateBuild(state, buildId) {
  if (!BUILDS.some((build) => build.id === buildId)) return state;
  return createFracturedGateState(buildId);
}

function planningView(state) {
  const view = {
    position: state.position,
    freeRepositionUsed: state.freeRepositionUsed,
    dividerOpen: state.divider.status === "breached",
    upperPrepared: state.upperRoute.prepared,
    servicePrepared: state.serviceRoute.prepared,
    liftDeployed: state.lift.deployed,
    regulatorExposed: state.enemy.regulator === "exposed",
    controlMode: state.actuator.controlled ? state.actuator.mode : null,
  };
  for (const action of state.plan) {
    switch (action.id) {
      case "reposition":
      case "advance":
        view.position = action.targetId;
        if (action.id === "reposition") view.freeRepositionUsed = true;
        break;
      case "answer-divider":
        view.dividerOpen = true;
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
      case "cross-breach":
      case "cross-upper-route":
      case "cross-service-route":
      case "cross-lift":
        view.position = "gate-platform";
        break;
      default:
        break;
    }
  }
  return view;
}

function legalTargetsForAction(state, actionId) {
  const view = planningView(state);
  switch (actionId) {
    case "reposition":
    case "advance":
      return neighbors(view.position);
    case "attack":
    case "answer-regulator":
    case "suppress-regulator":
    case "execute-bollard":
      return ["assault"];
    case "guard":
      return ["player"];
    case "guard-impact":
      return ["impact-rush"];
    case "stabilize-gate":
      return ["gate"];
    case "recover-cache":
      return ["field-cache"];
    case "leave":
      return ["west-exit"];
    case "answer-divider":
      return ["cracked-divider"];
    case "cross-breach":
      return ["gate-platform"];
    case "prepare-upper-route":
      return ["gate-platform"];
    case "contest-upper-landing":
      return ["upper-walk"];
    case "cross-upper-route":
      return ["gate-platform"];
    case "establish-bollard-control":
    case "establish-lift-control":
      return ["gate-actuator"];
    case "contest-actuator":
      return ["gate-actuator"];
    case "prepare-service-route":
    case "suppress-service-closure":
      return ["service-gap"];
    case "cross-service-route":
      return ["gate-platform"];
    case "execute-lift":
      return ["service-lift"];
    case "cross-lift":
      return ["gate-platform"];
    default:
      return [];
  }
}

function validateAction(state, actionId, targetId, cardId = null) {
  const action = ACTIONS[actionId];
  if (!action) return "Unknown action.";
  if (state.phase !== "planning") return "Actions are available only during Planning.";
  if (state.hand.length > CORE_RULES.retainLimit) {
    return `Retain ${CORE_RULES.retainLimit} cards before planning.`;
  }
  const build = getBuild(state.buildId);
  const view = planningView(state);
  const legalTargets = legalTargetsForAction(state, actionId);
  if (!targetId || !legalTargets.includes(targetId)) {
    return "Choose a highlighted target on the board.";
  }
  if (action.paid && paidActionCount(state) >= CORE_RULES.paidActionCap) {
    return "Four paid actions is the hard cap; four should remain exceptional.";
  }
  if (actionId === "reposition" && view.freeRepositionUsed) {
    return "The one free ordinary Reposition is already committed.";
  }
  if (
    ["attack", "answer-divider", "answer-regulator", "guard-impact"].includes(
      actionId,
    ) &&
    !ACTIVE_ENEMY_STATUSES.has(state.enemy.status)
  ) {
    return "The Assault no longer presents this hostile Commitment.";
  }
  if (actionId === "stabilize-gate" && state.position !== "gate-platform") {
    return "Begin a planning cycle on Gate Platform to stabilize the Gate.";
  }
  if (actionId === "stabilize-gate" && state.gate.status === "failed") {
    return "The Gate has already failed.";
  }
  if (actionId === "recover-cache" && state.position !== "upper-walk") {
    return "Begin a planning cycle on Upper Walk to recover the Cache.";
  }
  if (actionId === "recover-cache" && state.cache.status !== "available") {
    return "The Field Cache is no longer available.";
  }
  if (actionId === "leave" && state.position !== "entry") {
    return "Return to Entry before leaving through West Exit.";
  }
  if (actionId === "answer-divider" && build.id !== "battle-exploration") {
    return "This causal answer belongs to Battle / Exploration.";
  }
  if (actionId === "answer-regulator" && build.id !== "battle-hacking") {
    return "This causal answer belongs to Battle / Hacking.";
  }
  if (
    actionId === "prepare-upper-route" &&
    build.id !== "exploration-battle"
  ) {
    return "This Route preparation belongs to Exploration / Battle.";
  }
  if (
    actionId === "prepare-upper-route" &&
    view.position !== "upper-walk"
  ) {
    return "Reach Upper Walk before preparing its missing span.";
  }
  if (
    actionId === "contest-upper-landing" &&
    build.id !== "exploration-battle"
  ) {
    return "This physical protection belongs to Exploration / Battle.";
  }
  if (actionId === "contest-upper-landing" && !view.upperPrepared) {
    return "Prepare the Upper Route before protecting its landing.";
  }
  if (actionId === "cross-upper-route" && !view.upperPrepared) {
    return "No prepared Upper Route exists.";
  }
  if (actionId === "cross-upper-route" && view.position !== "upper-walk") {
    return "Reach Upper Walk before exploiting its Route.";
  }
  if (actionId === "suppress-regulator") {
    if (build.id !== "battle-hacking") {
      return "This response suppression belongs to Battle / Hacking.";
    }
    if (!view.regulatorExposed) {
      return "Expose the regulator through confrontation before suppressing its reset.";
    }
  }
  if (
    actionId === "establish-bollard-control" &&
    build.id !== "hacking-battle"
  ) {
    return "This bounded Output belongs to Hacking / Battle.";
  }
  if (
    actionId === "establish-lift-control" &&
    build.id !== "hacking-exploration"
  ) {
    return "This bounded Output belongs to Hacking / Exploration.";
  }
  if (
    ["establish-bollard-control", "establish-lift-control"].includes(
      actionId,
    ) &&
    view.position !== "actuator"
  ) {
    return "Reach the Gate Actuator before establishing local Control.";
  }
  if (actionId === "contest-actuator") {
    if (build.id !== "hacking-battle") {
      return "This access protection belongs to Hacking / Battle.";
    }
    if (view.controlMode !== "bollard") {
      return "Establish Bollard Control before holding its access.";
    }
  }
  if (actionId === "execute-bollard") {
    if (
      !state.actuator.controlled ||
      state.actuator.mode !== "bollard" ||
      state.position !== "actuator"
    ) {
      return "Persistent Bollard Control and physical Actuator access are required.";
    }
  }
  if (
    actionId === "prepare-service-route" &&
    build.id !== "exploration-hacking"
  ) {
    return "This natural Route belongs to Exploration / Hacking.";
  }
  if (actionId === "suppress-service-closure") {
    if (build.id !== "exploration-hacking") {
      return "This closure suppression belongs to Exploration / Hacking.";
    }
    if (!view.servicePrepared) {
      return "Prepare the service relationship before suppressing its closure.";
    }
  }
  if (actionId === "cross-service-route" && !view.servicePrepared) {
    return "No prepared Service Route exists.";
  }
  if (
    actionId === "execute-lift" &&
    (!state.actuator.controlled ||
      state.actuator.mode !== "lift" ||
      state.position !== "actuator")
  ) {
    return "Persistent Lift Control and physical Actuator access are required.";
  }
  if (actionId === "cross-lift" && !view.liftDeployed) {
    return "Execute the Lift Output before crossing its temporary geometry.";
  }
  if (cardId) {
    const card = CARDS[cardId];
    if (!card || !state.hand.includes(cardId) || cardReserved(state, cardId)) {
      return "That Prepared Card is not available.";
    }
    const compatible =
      card.compatibility.includes(action.compatibilityKey) ||
      (cardId === "fallback-guard" && action.paid);
    if (!compatible) return "That card is not compatible with this action.";
  }
  const cardCost = cardId ? CARDS[cardId].cost : 0;
  if (availableCommand(state) < action.cost + cardCost) {
    return "Not enough Command remains for this plan.";
  }
  return null;
}

function targetPositionForFocus(focusId) {
  if (POSITION_COORDS[focusId]) return focusId;
  if (focusId === "gate-actuator") return "actuator";
  if (focusId === "gate" || focusId === "field-cache") {
    return focusId === "gate" ? "gate-platform" : "upper-walk";
  }
  return BOARD_FOCUSES[focusId]?.positionId ?? null;
}

function movementChoices(state, focusId) {
  const view = planningView(state);
  if (focusId === "breach") {
    return [makeChoice(state, "cross-breach")];
  }
  if (focusId === "upper-route") {
    return [makeChoice(state, "cross-upper-route")];
  }
  if (focusId === "service-route") {
    return [makeChoice(state, "cross-service-route")];
  }
  if (focusId === "service-lift") {
    return [makeChoice(state, "cross-lift")];
  }
  const selectedPosition = targetPositionForFocus(focusId);
  const targets = selectedPosition
    ? [selectedPosition]
    : focusId === "player"
      ? neighbors(view.position)
      : [];
  if (!targets.length || targets.every((target) => target === view.position)) {
    return [];
  }
  const choices = [];
  if (!view.freeRepositionUsed) {
    choices.push(makeChoice(state, "reposition", targets));
  }
  choices.push(makeChoice(state, "advance", targets));
  return choices;
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
    description: "Open the selected board element's concise details.",
    cost: 0,
    paid: false,
    lane: "Now",
    tempo: null,
    compatibilityKey: null,
    legalTargets: [],
    legal: true,
    reason: null,
    immediate: true,
  };
}

function disciplineChoices(state, focusId) {
  const buildId = state.buildId;
  const view = planningView(state);
  const ids = [];
  if (focusId === "impact-rush" || focusId === "cracked-divider") {
    if (buildId === "battle-exploration") ids.push("answer-divider");
    if (buildId === "battle-hacking") ids.push("answer-regulator");
    if (buildId === "exploration-battle") ids.push("contest-upper-landing");
    if (buildId === "hacking-battle") ids.push("contest-actuator");
  }
  if (focusId === "assault" || focusId === "regulator") {
    if (buildId === "battle-hacking") ids.push("suppress-regulator");
    if (buildId === "hacking-battle" && state.actuator.mode === "bollard") {
      ids.push("execute-bollard");
    }
  }
  if (focusId === "upper-walk" || focusId === "upper-route") {
    if (buildId === "exploration-battle") {
      if (!view.upperPrepared) ids.push("prepare-upper-route");
    }
  }
  if (focusId === "service-gap" || focusId === "service-route") {
    if (buildId === "exploration-hacking") {
      if (!view.servicePrepared) ids.push("prepare-service-route");
      else ids.push("suppress-service-closure");
    }
  }
  if (focusId === "gate-actuator" || focusId === "service-lift") {
    if (buildId === "hacking-battle") {
      ids.push(
        state.actuator.controlled ? "execute-bollard" : "establish-bollard-control",
      );
    }
    if (buildId === "hacking-exploration") {
      ids.push(
        state.actuator.controlled ? "execute-lift" : "establish-lift-control",
      );
    }
  }
  return [...new Set(ids)].map((id) => makeChoice(state, id));
}

export function getContextActionGroups(state, focusId) {
  const groups = [];
  const movement = movementChoices(state, focusId);
  if (movement.length) groups.push({ parent: "Move", choices: movement });

  if (["assault", "impact-rush"].includes(focusId)) {
    groups.push({ parent: "Attack", choices: [makeChoice(state, "attack")] });
    groups.push({
      parent: "Defend",
      choices: [makeChoice(state, "guard-impact")],
    });
  } else if (focusId === "player") {
    groups.push({ parent: "Defend", choices: [makeChoice(state, "guard")] });
  }

  const disciplines = disciplineChoices(state, focusId);
  if (disciplines.length) {
    groups.push({ parent: "Discipline", choices: disciplines });
  }

  if (focusId === "gate") {
    groups.push({
      parent: "Use",
      choices: [makeChoice(state, "stabilize-gate")],
    });
  }
  if (focusId === "field-cache") {
    groups.push({
      parent: "Use",
      choices: [makeChoice(state, "recover-cache")],
    });
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
  return state.hand
    .filter((cardId) => !cardReserved(state, cardId))
    .filter((cardId) => {
      const card = CARDS[cardId];
      return (
        card.compatibility.includes(action.compatibilityKey) ||
        (cardId === "fallback-guard" && action.paid)
      );
    });
}

function makePlannedAction(state, actionId, targetId, cardId = null) {
  const definition = ACTIONS[actionId];
  const card = cardId ? CARDS[cardId] : null;
  return {
    ...definition,
    targetId,
    targetName: BOARD_FOCUSES[targetId]?.name ?? POSITION_NAMES[targetId] ?? targetId,
    cardId,
    cardName: card?.name ?? null,
    cardCost: card?.cost ?? 0,
    totalCost: definition.cost + (card?.cost ?? 0),
    instanceId: `plan-${state.nextActionSequence}`,
    sequence: state.nextActionSequence,
  };
}

export function previewAction(state, actionId, targetId, cardId = null) {
  const error = validateAction(state, actionId, targetId, cardId);
  if (error) return { legal: false, error };
  const next = clone(state);
  next.plan.push(makePlannedAction(next, actionId, targetId, cardId));
  const projection = projectPlan(next);
  return {
    legal: true,
    action: next.plan.at(-1),
    projection,
  };
}

export function queueAction(state, actionId, targetId, cardId = null) {
  const error = validateAction(state, actionId, targetId, cardId);
  if (error) return withWarning(state, error);
  const next = clone(state);
  const action = makePlannedAction(next, actionId, targetId, cardId);
  next.plan.push(action);
  next.nextActionSequence += 1;
  if (actionId === "reposition") next.freeRepositionUsed = true;
  next.warning = "";
  return next;
}

export function removePlanAction(state, instanceId) {
  if (state.phase !== "planning") return state;
  const next = clone(state);
  const index = next.plan.findIndex((action) => action.instanceId === instanceId);
  if (index < 0) return state;
  next.plan.splice(index, 1);
  next.freeRepositionUsed = next.plan.some((action) => action.id === "reposition");
  next.warning = "";
  return next;
}

export function reorderPlanAction(state, instanceId, direction) {
  if (state.phase !== "planning") return state;
  const next = clone(state);
  const index = next.plan.findIndex((action) => action.instanceId === instanceId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.plan.length) {
    return state;
  }
  const [action] = next.plan.splice(index, 1);
  next.plan.splice(destination, 0, action);
  next.plan.forEach((item, itemIndex) => {
    item.sequence = itemIndex + 1;
  });
  return next;
}

export function refocusCards(state, cardIds) {
  if (state.phase !== "planning") return state;
  const unique = [...new Set(cardIds)];
  if (state.refocusUsed) {
    return withWarning(state, "Refocus is available once per planning phase.");
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
    return withWarning(state, "Only uncommitted cards in hand can be Refocused.");
  }
  const next = clone(state);
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
  next.refocusRecord = {
    discarded: unique,
    drawn,
    cost: 4,
  };
  next.warning = "";
  return next;
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
    enemy: state.enemy,
    divider: state.divider,
    actuator: state.actuator,
    upperRoute: state.upperRoute,
    serviceRoute: state.serviceRoute,
    lift: state.lift,
    cache: state.cache,
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

function logEvent(packets, lane, action, title, detail, outcome = "resolved") {
  packets[lane].events.push({
    actionId: action?.id ?? "enemy-impact-rush",
    instanceId: action?.instanceId ?? "enemy-impact-rush",
    title,
    detail,
    outcome,
  });
}

function invalidate(sim, packets, lane, action, reason) {
  const card = action.cardId ? CARDS[action.cardId] : null;
  const contingency = card?.kind === "Contingency";
  const refundablePrimary = contingency
    ? action.cost
    : action.cost + action.cardCost;
  sim.refunds += Math.floor(refundablePrimary / 2);
  if (action.cardId === "fallback-guard") {
    sim.guard += 3;
    sim.flags.braced = true;
    logEvent(
      packets,
      "Fast",
      action,
      "Fallback Guard triggered",
      "The primary invalidated before beginning; gain 3 Guard. Its 4 Command reserve is spent.",
    );
  }
  logEvent(packets, lane, action, `${action.label} invalidated`, reason, "invalidated_before_begin");
}

function applyImpactToPlayer(sim, impact) {
  const absorbed = Math.min(sim.guard, impact);
  sim.guard -= absorbed;
  sim.condition = Math.max(0, sim.condition - (impact - absorbed));
}

function applyPlayerAction(sim, packets, lane, action, fullPlan) {
  const hasCard = (cardId) => action.cardId === cardId;
  switch (action.id) {
    case "reposition":
    case "advance": {
      if (!neighbors(sim.position).includes(action.targetId)) {
        invalidate(
          sim,
          packets,
          lane,
          action,
          `The path from ${POSITION_NAMES[sim.position]} to ${POSITION_NAMES[action.targetId]} is no longer ordinary and adjacent.`,
        );
        return;
      }
      sim.position = action.targetId;
      sim.movementPath.push(action.targetId);
      if (hasCard("covering-step")) sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        action.label,
        `Player moved to ${POSITION_NAMES[action.targetId]}.`,
      );
      return;
    }
    case "guard":
      sim.guard += 4;
      logEvent(packets, lane, action, "Guard raised", "Player gained 4 Guard.");
      return;
    case "guard-impact":
      sim.flags.rushBlocked = true;
      sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        "Impact line braced",
        "The confirmed Rush will not remove Gate Stability this cycle.",
      );
      return;
    case "attack": {
      if (!ACTIVE_ENEMY_STATUSES.has(sim.enemy.status)) {
        invalidate(
          sim,
          packets,
          lane,
          action,
          "The declared Assault target was no longer active. No retarget occurred.",
        );
        return;
      }
      const guardBreak = Math.min(2, sim.enemy.guard);
      sim.enemy.guard -= guardBreak;
      const absorbed = Math.min(sim.enemy.guard, 6);
      sim.enemy.guard -= absorbed;
      sim.enemy.condition = Math.max(
        0,
        sim.enemy.condition - (6 - absorbed),
      );
      if (sim.enemy.condition === 0) {
        sim.enemy.status = "disabled";
        sim.flags.rushBlocked = true;
      }
      logEvent(
        packets,
        lane,
        action,
        "Weapon Attack",
        sim.enemy.status === "disabled"
          ? "The Assault was disabled before its Rush."
          : `Assault now has ${sim.enemy.guard} Guard and ${sim.enemy.condition} Condition.`,
      );
      return;
    }
    case "answer-divider":
      if (!ACTIVE_ENEMY_STATUSES.has(sim.enemy.status)) {
        invalidate(sim, packets, lane, action, "The hostile Commitment no longer existed.");
        return;
      }
      sim.flags.rushBlocked = true;
      sim.divider.status = "breached";
      sim.enemy.status = "staggered";
      sim.enemy.staggered = true;
      sim.majorState = {
        type: "battle",
        name: "Battle Advantage",
        status: "active",
      };
      sim.flags.turningPoint = "divider";
      if (hasCard("brace-through")) sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        "Cracked Divider breached",
        "The Assault's own Rush created a physical Opening usable by either side.",
      );
      return;
    case "cross-breach":
      if (sim.divider.status !== "breached") {
        invalidate(sim, packets, lane, action, "The causal breach was never created.");
        return;
      }
      sim.position = "gate-platform";
      sim.movementPath.push("gate-platform");
      sim.majorState = {
        type: "battle",
        name: "Battle Advantage",
        status: "spent",
      };
      logEvent(
        packets,
        lane,
        action,
        "Breach crossed",
        "Player reached Gate Platform through confrontation-created geometry.",
      );
      return;
    case "prepare-upper-route":
      if (sim.position !== "upper-walk") {
        invalidate(sim, packets, lane, action, "Upper Walk access was lost before setup.");
        return;
      }
      sim.upperRoute.prepared = true;
      sim.upperRoute.destinationClaim = hasCard("destination-claim");
      sim.majorState = {
        type: "exploration",
        name: "Prepared Upper Route",
        status: "active",
      };
      sim.flags.turningPoint = "upper-route";
      logEvent(
        packets,
        lane,
        action,
        "Upper Route prepared",
        "A physical relationship to Gate Platform now exists.",
      );
      return;
    case "contest-upper-landing":
      if (!sim.upperRoute.prepared) {
        invalidate(sim, packets, lane, action, "No Upper Route landing existed to protect.");
        return;
      }
      sim.upperRoute.protected = true;
      sim.flags.rushBlocked = true;
      if (hasCard("brace-through")) sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        "Upper landing held",
        "The prepared Route survived physical pressure and the Rush was turned aside.",
      );
      return;
    case "cross-upper-route":
      if (!sim.upperRoute.prepared || sim.position !== "upper-walk") {
        invalidate(sim, packets, lane, action, "The prepared Upper Route was unavailable.");
        return;
      }
      sim.position = "gate-platform";
      sim.movementPath.push("gate-platform");
      sim.upperRoute.prepared = false;
      sim.majorState = {
        type: "exploration",
        name: "Prepared Upper Route",
        status: "spent",
      };
      logEvent(
        packets,
        lane,
        action,
        "Upper Route crossed",
        "Player spent the prepared relationship and reached Gate Platform.",
      );
      return;
    case "answer-regulator":
      if (!ACTIVE_ENEMY_STATUSES.has(sim.enemy.status)) {
        invalidate(sim, packets, lane, action, "The hostile Commitment no longer existed.");
        return;
      }
      sim.flags.rushBlocked = true;
      sim.enemy.status = "staggered";
      sim.enemy.staggered = true;
      sim.enemy.regulator = "exposed";
      sim.majorState = {
        type: "battle",
        name: "Battle Advantage",
        status: "active",
      };
      sim.flags.turningPoint = "regulator";
      if (hasCard("brace-through")) sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        "Impact regulator exposed",
        "Physical confrontation opened access to protected hardware.",
      );
      return;
    case "suppress-regulator":
      if (
        !fullPlan.some((candidate) => candidate.id === "answer-regulator") &&
        sim.enemy.regulator !== "exposed"
      ) {
        invalidate(sim, packets, lane, action, "The regulator was never exposed.");
        return;
      }
      sim.flags.regulatorSuppressionArmed = true;
      sim.enemy.regulatorResetSuppressed = true;
      logEvent(
        packets,
        lane,
        action,
        "Regulator reset suppressed",
        "The automatic reseal response is delayed beyond Settle.",
      );
      return;
    case "establish-bollard-control":
      if (sim.position !== "actuator") {
        invalidate(sim, packets, lane, action, "Physical Actuator access was lost.");
        return;
      }
      sim.actuator.mode = "bollard";
      sim.actuator.controlled = true;
      sim.actuator.quietRewrite = hasCard("quiet-rewrite");
      sim.majorState = {
        type: "hacking",
        name: "Temporary Bollard Control",
        status: "active",
      };
      sim.flags.turningPoint = "bollard";
      logEvent(
        packets,
        lane,
        action,
        "Bollard Control established",
        "A next-cycle defensive Output is available if physical access survives.",
      );
      return;
    case "contest-actuator":
      if (!sim.actuator.controlled || sim.actuator.mode !== "bollard") {
        invalidate(sim, packets, lane, action, "No Bollard Control existed to protect.");
        return;
      }
      sim.actuator.accessHeld = true;
      sim.flags.rushBlocked = true;
      if (hasCard("brace-through")) sim.guard += 2;
      logEvent(
        packets,
        lane,
        action,
        "Actuator access held",
        "Physical protection preserved local Control against ejection.",
      );
      return;
    case "execute-bollard":
      if (
        !sim.actuator.controlled ||
        sim.actuator.mode !== "bollard" ||
        sim.position !== "actuator"
      ) {
        invalidate(sim, packets, lane, action, "Bollard Control or physical access was unavailable.");
        return;
      }
      sim.actuator.controlled = false;
      sim.enemy.status = "pinned";
      sim.flags.rushBlocked = true;
      sim.majorState = {
        type: "hacking",
        name: "Temporary Bollard Control",
        status: "spent",
      };
      logEvent(
        packets,
        lane,
        action,
        "Bollard Output executed",
        "The Assault was redirected and pinned by authored machinery.",
      );
      return;
    case "prepare-service-route":
      sim.serviceRoute.prepared = true;
      sim.serviceRoute.destinationClaim = hasCard("destination-claim");
      sim.majorState = {
        type: "exploration",
        name: "Prepared Service Route",
        status: "active",
      };
      sim.flags.turningPoint = "service-route";
      logEvent(
        packets,
        lane,
        action,
        "Service Route prepared",
        "The natural relationship now reaches toward Gate Platform.",
      );
      return;
    case "suppress-service-closure":
      if (
        !fullPlan.some((candidate) => candidate.id === "prepare-service-route") &&
        !sim.serviceRoute.prepared
      ) {
        invalidate(sim, packets, lane, action, "No prepared service relationship existed.");
        return;
      }
      sim.flags.serviceSuppressionArmed = true;
      sim.serviceRoute.closureSuppressed = true;
      logEvent(
        packets,
        lane,
        action,
        "Service closure suppressed",
        "The actual automatic closure mechanism is delayed.",
      );
      return;
    case "cross-service-route":
      if (!sim.serviceRoute.prepared) {
        invalidate(sim, packets, lane, action, "The Service Route was unavailable.");
        return;
      }
      sim.position = "gate-platform";
      sim.movementPath.push("gate-platform");
      sim.serviceRoute.prepared = false;
      sim.majorState = {
        type: "exploration",
        name: "Prepared Service Route",
        status: "spent",
      };
      logEvent(
        packets,
        lane,
        action,
        "Service Route crossed",
        "Player reached Gate Platform through the protected rear relationship.",
      );
      return;
    case "establish-lift-control":
      if (sim.position !== "actuator") {
        invalidate(sim, packets, lane, action, "Physical Actuator access was lost.");
        return;
      }
      sim.actuator.mode = "lift";
      sim.actuator.controlled = true;
      sim.actuator.quietRewrite = hasCard("quiet-rewrite");
      sim.majorState = {
        type: "hacking",
        name: "Temporary Lift Control",
        status: "active",
      };
      sim.flags.turningPoint = "lift";
      logEvent(
        packets,
        lane,
        action,
        "Lift Control established",
        "A next-cycle geometry Output is available.",
      );
      return;
    case "execute-lift":
      if (
        !sim.actuator.controlled ||
        sim.actuator.mode !== "lift" ||
        sim.position !== "actuator"
      ) {
        invalidate(sim, packets, lane, action, "Lift Control or physical access was unavailable.");
        return;
      }
      sim.actuator.controlled = false;
      sim.lift.deployed = true;
      sim.lift.resetAfterSettle = true;
      sim.majorState = {
        type: "hacking",
        name: "Temporary Lift Control",
        status: "spent",
      };
      logEvent(
        packets,
        lane,
        action,
        "Service Lift deployed",
        "Machinery created temporary geometry across the missing upper span.",
      );
      return;
    case "cross-lift":
      if (!sim.lift.deployed) {
        invalidate(sim, packets, lane, action, "The Lift Output never created the crossing.");
        return;
      }
      sim.position = "gate-platform";
      sim.movementPath.push("gate-platform");
      logEvent(
        packets,
        lane,
        action,
        "Service Lift crossed",
        "Player reached Gate Platform before the machinery reset.",
      );
      return;
    case "stabilize-gate":
      if (sim.position !== "gate-platform" || sim.gate.status === "failed") {
        invalidate(sim, packets, lane, action, "Gate Platform access or Gate integrity was lost.");
        return;
      }
      sim.gate.status = "stabilized";
      sim.flags.rushBlocked = true;
      if (ACTIVE_ENEMY_STATUSES.has(sim.enemy.status)) {
        sim.enemy.status = "driven";
      }
      sim.flags.turningPoint ??= "stabilize";
      logEvent(
        packets,
        lane,
        action,
        "Gate stabilized",
        "The defensive seal activated and forced the remaining Assault out.",
      );
      return;
    case "recover-cache":
      if (sim.position !== "upper-walk" || sim.cache.status !== "available") {
        invalidate(sim, packets, lane, action, "Upper Walk access to the Cache was lost.");
        return;
      }
      sim.cache.status = "recovered";
      sim.flags.turningPoint = "cache";
      logEvent(
        packets,
        lane,
        action,
        "Field Cache recovered",
        "The prototype Package is carried locally; no persistent reward is created.",
      );
      return;
    case "leave":
      if (sim.position !== "entry") {
        invalidate(sim, packets, lane, action, "The West Exit was no longer adjacent.");
        return;
      }
      sim.position = "west-exit";
      sim.movementPath.push("west-exit");
      sim.retreated = true;
      sim.flags.turningPoint = "retreat";
      logEvent(
        packets,
        lane,
        action,
        "Controlled Retreat",
        "Player left through West Exit before becoming Compromised.",
      );
      return;
    default:
      invalidate(sim, packets, lane, action, "This action has no deterministic resolver.");
  }
}

function resolveEnemyRush(sim, packets) {
  const action = { id: "enemy-impact-rush", instanceId: "enemy-impact-rush" };
  if (!ACTIVE_ENEMY_STATUSES.has(sim.enemy.status)) {
    logEvent(
      packets,
      "Standard",
      action,
      "Impact Rush canceled",
      "The Assault was no longer able to execute its Commitment.",
      "canceled",
    );
    return;
  }
  if (sim.gate.status === "stabilized") {
    sim.enemy.status = "driven";
    logEvent(
      packets,
      "Standard",
      action,
      "Impact Rush denied",
      "The stabilized defensive seal drove the Assault out.",
      "canceled",
    );
    return;
  }
  if (sim.flags.rushBlocked) {
    logEvent(
      packets,
      "Standard",
      action,
      "Impact Rush stopped",
      "A visible player action prevented Gate Stability loss.",
      "blocked",
    );
    return;
  }
  sim.gate.stability = Math.max(0, sim.gate.stability - 1);
  if (
    ["lower-cover", "lower-yard", "gate-platform"].includes(sim.position)
  ) {
    applyImpactToPlayer(sim, 3);
    if (sim.position !== "gate-platform") sim.position = "entry";
  }
  if (
    sim.position === "actuator" &&
    sim.buildId === "hacking-battle" &&
    sim.actuator.controlled &&
    !sim.actuator.accessHeld
  ) {
    applyImpactToPlayer(sim, 3);
    sim.position = "lower-yard";
    sim.actuator.controlled = false;
    sim.majorState = {
      type: "hacking",
      name: "Temporary Bollard Control",
      status: "lost",
    };
  }
  if (sim.gate.stability === 0) sim.gate.status = "failed";
  logEvent(
    packets,
    "Standard",
    action,
    "Impact Rush connected",
    sim.gate.status === "failed"
      ? "The third unopposed Rush removed the final Stability pip. The Gate failed."
      : `Gate Stability fell to ${sim.gate.stability} of 3.`,
  );
}

function finishAutomaticResponses(sim, packets) {
  if (
    sim.enemy.regulator === "exposed" &&
    !sim.enemy.regulatorResetSuppressed
  ) {
    sim.enemy.regulator = "shielded";
    sim.enemy.staggered = false;
    if (sim.enemy.status === "staggered") sim.enemy.status = "active";
    logEvent(
      packets,
      "Slow",
      null,
      "Regulator automatically reset",
      "The exposed component resealed because its response was not suppressed.",
    );
  }
  if (
    sim.serviceRoute.prepared &&
    !sim.serviceRoute.closureSuppressed
  ) {
    if (sim.serviceRoute.destinationClaim) {
      sim.serviceRoute.destinationClaim = false;
      logEvent(
        packets,
        "Slow",
        null,
        "Destination Claim absorbed closure",
        "The observed relationship survives this environmental shift once.",
      );
    } else {
      sim.serviceRoute.prepared = false;
      sim.majorState = {
        type: "exploration",
        name: "Prepared Service Route",
        status: "lost",
      };
      logEvent(
        packets,
        "Slow",
        null,
        "Service Route closed",
        "The unsuppressed mechanism removed the prepared relationship.",
      );
    }
  }
  if (sim.actuator.controlled && !sim.actuator.quietRewrite) {
    sim.actuator.controlled = false;
    sim.majorState = {
      type: "hacking",
      name:
        sim.actuator.mode === "bollard"
          ? "Temporary Bollard Control"
          : "Temporary Lift Control",
      status: "lost",
    };
    logEvent(
      packets,
      "Slow",
      null,
      "Actuator lockout responded",
      "Local Control was lost because its automatic response was not delayed.",
    );
  }
}

function simulateCycle(state) {
  const sim = dynamicSnapshot(state);
  sim.movementPath = [state.position];
  sim.refunds = 0;
  const packets = Object.fromEntries(
    LANE_ORDER.map((lane) => [
      lane,
      {
        lane,
        events: [],
        snapshot: null,
      },
    ]),
  );

  for (const action of state.plan) {
    if (action.cardId) {
      logEvent(
        packets,
        "Fast",
        action,
        `${action.cardName} prepared`,
        `Compatible card attached to ${action.label}.`,
      );
    }
  }

  const entries = state.plan.map((action) => ({ type: "player", action }));
  entries.push({
    type: "enemy",
    action: {
      id: "enemy-impact-rush",
      instanceId: "enemy-impact-rush",
      lane: "Standard",
      tempo: 5,
      sequence: Number.MAX_SAFE_INTEGER,
    },
  });
  entries.sort((left, right) => {
    const laneDelta =
      LANE_RANK[left.action.lane] - LANE_RANK[right.action.lane];
    if (laneDelta !== 0) return laneDelta;
    const tempoDelta = right.action.tempo - left.action.tempo;
    if (tempoDelta !== 0) return tempoDelta;
    return left.action.sequence - right.action.sequence;
  });

  for (const lane of LANE_ORDER) {
    for (const entry of entries.filter((candidate) => candidate.action.lane === lane)) {
      if (entry.type === "enemy") resolveEnemyRush(sim, packets);
      else applyPlayerAction(sim, packets, lane, entry.action, state.plan);
    }
    if (lane === "Slow") finishAutomaticResponses(sim, packets);
    packets[lane].snapshot = clone({
      ...sim,
      movementPath: sim.movementPath,
      refunds: sim.refunds,
    });
  }

  const finalSnapshot = clone(sim);
  delete finalSnapshot.movementPath;
  delete finalSnapshot.refunds;
  return {
    packets: LANE_ORDER.map((lane) => packets[lane]),
    finalSnapshot,
    movementPath: sim.movementPath,
    refunds: sim.refunds,
  };
}

function importantRisk(state, finalSnapshot) {
  if (state.plan.some((action) => action.id === "answer-divider")) {
    return "The breach remains usable by the Assault and the Divider stays destroyed.";
  }
  if (state.plan.some((action) => action.id === "prepare-upper-route")) {
    return "Route setup consumes time while Gate Stability remains under pressure.";
  }
  if (state.plan.some((action) => action.id === "answer-regulator")) {
    return "Technical control delays direct objective access.";
  }
  if (state.plan.some((action) => action.id === "establish-bollard-control")) {
    return "Control is lost if the exposed Actuator access is not physically held.";
  }
  if (state.plan.some((action) => action.id === "prepare-service-route")) {
    return "The Assault remains active while the rear relationship is established.";
  }
  if (state.plan.some((action) => action.id === "execute-lift")) {
    return "The service lift resets at Settle and may isolate you on the far side.";
  }
  if (state.plan.some((action) => action.id === "recover-cache")) {
    return "Recovering the Cache spends a pressure cycle before the Gate is stable.";
  }
  if (
    finalSnapshot.gate.stability < state.gate.stability &&
    finalSnapshot.gate.status !== "stabilized"
  ) {
    return "An unopposed Impact Rush removes one Gate Stability pip.";
  }
  return "No hidden uncertainty: the confirmed projection resolves exactly as shown.";
}

function expectedConsequences(state, simulation) {
  const events = simulation.packets.flatMap((packet) => packet.events);
  const material = events
    .filter((event) => event.outcome !== "canceled")
    .map((event) => event.detail)
    .filter(Boolean);
  return material.slice(0, 5);
}

export function projectPlan(state) {
  const simulation = simulateCycle(state);
  const signature = stableHash({
    seed: state.seed,
    round: state.round,
    initial: dynamicSnapshot(state),
    plan: state.plan.map((action) => ({
      id: action.id,
      targetId: action.targetId,
      cardId: action.cardId,
      totalCost: action.totalCost,
      sequence: action.sequence,
    })),
  });
  return {
    signature,
    packets: simulation.packets,
    finalSnapshot: simulation.finalSnapshot,
    movementPath: simulation.movementPath,
    ghostPosition:
      simulation.movementPath.at(-1) ?? simulation.finalSnapshot.position,
    collision:
      state.plan.some((action) => action.id === "answer-divider")
        ? "cracked-divider"
        : state.plan.some((action) => action.id === "answer-regulator")
          ? "assault"
          : null,
    expected: expectedConsequences(state, simulation),
    risk: importantRisk(state, simulation.finalSnapshot),
    refunds: simulation.refunds,
  };
}

function planLockError(state) {
  if (state.phase !== "planning") return "The current phase cannot be locked.";
  if (!state.plan.length && !state.refocusRecord) {
    return "Add at least one action before Lock.";
  }
  if (state.hand.length > CORE_RULES.retainLimit) {
    return `Discard to retain ${CORE_RULES.retainLimit} cards before Lock.`;
  }
  if (paidActionCount(state) > CORE_RULES.paidActionCap) {
    return "The plan exceeds four paid actions.";
  }
  if (availableCommand(state) < 0) return "The plan exceeds available Command.";
  const test = createFracturedGateState(state.buildId);
  Object.assign(test, clone(state), {
    plan: [],
    freeRepositionUsed: false,
    warning: "",
  });
  for (const action of state.plan) {
    const error = validateAction(
      { ...test, plan: clone(test.plan) },
      action.id,
      action.targetId,
      action.cardId,
    );
    if (error) return `${action.label}: ${error}`;
    test.plan.push(clone(action));
    if (action.id === "reposition") test.freeRepositionUsed = true;
  }
  return null;
}

export function lockPlan(state) {
  const error = planLockError(state);
  if (error) return withWarning(state, error);
  const projection = projectPlan(state);
  const next = clone(state);
  next.command = availableCommand(next);
  next.phase = "resolution";
  next.warning = "";
  next.resolution = {
    signature: projection.signature,
    visibleLaneIndex: -1,
    packets: projection.packets,
    finalSnapshot: projection.finalSnapshot,
    movementPath: projection.movementPath,
    refunds: projection.refunds,
    expected: projection.expected,
    risk: projection.risk,
  };
  return next;
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
  const committedCards = next.plan
    .map((action) => action.cardId)
    .filter(Boolean);
  applied.hand = applied.hand.filter(
    (cardId) => !committedCards.includes(cardId),
  );
  applied.discard.push(...committedCards);
  applied.settleSummary = {
    gateStability: applied.gate.stability,
    gateStatus: applied.gate.status,
    playerPosition: POSITION_NAMES[applied.position],
    enemyStatus: applied.enemy.status,
    dividerStatus: applied.divider.status,
    cacheStatus: applied.cache.status,
    commandCarried: applied.command,
    refunds: next.resolution.refunds,
    draw: [],
  };
  return applied;
}

function pendingResultType(state) {
  if (state.retreated) return "Controlled Retreat";
  if (state.gate.status === "failed" || state.condition === 0) return "Gate Lost";
  if (state.gate.status !== "stabilized") return null;
  if (state.cache.status === "recovered") return "Recovery Secure";
  if (
    state.enemy.status === "disabled" &&
    state.divider.status === "cracked"
  ) {
    return "Clean Secure";
  }
  return "Fast Secure";
}

function turningPointText(state, resultType) {
  if (resultType === "Controlled Retreat") {
    return "Selecting the physical West Exit preserved the character before the situation collapsed.";
  }
  if (resultType === "Gate Lost") {
    return state.enemy.status === "disabled"
      ? "The Assault was stopped, but combat consumed the cycles needed to stabilize the Gate."
      : "The final unopposed Impact Rush removed the Gate's last Stability pip.";
  }
  if (resultType === "Recovery Secure") {
    return "You accepted another pressure cycle to recover the Field Cache before sealing the Gate.";
  }
  const turningPoints = {
    divider:
      "The enemy's own Impact Rush broke the Cracked Divider and created your path.",
    "upper-route":
      "Preparing and physically protecting the Upper Walk created a clean objective approach.",
    regulator:
      "Physical confrontation exposed hardware before Hacking suppressed its automatic reset.",
    bollard:
      "Local Control survived because you physically held the Actuator access.",
    "service-route":
      "A natural service relationship survived because its real closure mechanism was suppressed.",
    lift:
      "The Gate Actuator moved machinery into the missing span, creating temporary geometry.",
    stabilize:
      "Reaching Gate Platform in time let the defensive seal end the confrontation.",
  };
  return (
    turningPoints[state.flags.turningPoint] ??
    "The plan removed the immediate threat and reached the objective in time."
  );
}

function tradeoffText(state, resultType) {
  if (resultType === "Controlled Retreat") {
    return "The Gate and Field Cache remain unresolved, but the player survives.";
  }
  if (resultType === "Gate Lost") {
    return "A combat success cannot replace the failed location objective.";
  }
  if (resultType === "Recovery Secure") {
    return `The Cache was recovered, but the Gate absorbed ${3 - state.gate.stability} Rush impact${3 - state.gate.stability === 1 ? "" : "s"}.`;
  }
  if (resultType === "Clean Secure") {
    return "The location stayed intact, but the slower direct approach abandoned the Field Cache.";
  }
  if (state.divider.status === "breached") {
    return "The quickest path destroyed the Divider and left the breach usable from either side.";
  }
  return "The Gate was secured quickly, but the Field Cache was left behind.";
}

function buildResult(state, resultType) {
  return {
    type: resultType,
    objective:
      state.gate.status === "stabilized"
        ? "Gate stabilized"
        : state.gate.status === "failed"
          ? "Gate failed"
          : `Gate unresolved · ${state.gate.stability}/3 Stability`,
    enemy:
      state.enemy.status === "driven"
        ? "Driven out"
        : state.enemy.status[0].toUpperCase() + state.enemy.status.slice(1),
    player:
      state.retreated
        ? "Extracted safely"
        : state.condition === 0
          ? "Compromised"
          : `Safe · ${state.condition} Condition · ${state.guard} Guard`,
    cache:
      state.cache.status === "recovered"
        ? "Recovered · prototype-only"
        : "Left at Upper Walk",
    location:
      `Divider ${state.divider.status}; Actuator ${
        state.actuator.controlled ? "controlled" : "idle"
      }; Gate ${state.gate.status}.`,
    turningPoint: turningPointText(state, resultType),
    tradeoff: tradeoffText(state, resultType),
  };
}

export function settleRound(state) {
  if (state.phase !== "settle") return state;
  const resultType = pendingResultType(state);
  const next = clone(state);
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
  next.command = Math.min(
    CORE_RULES.commandCap,
    next.command + (next.resolution?.refunds ?? 0) + CORE_RULES.commandIncome,
  );
  next.round += 1;
  next.phase = "planning";
  next.plan = [];
  next.resolution = null;
  next.freeRepositionUsed = false;
  next.planningActionCount = 0;
  next.refocusUsed = false;
  next.refocusRecord = null;
  next.warning = "";
  next.flags.rushBlocked = false;
  next.flags.regulatorSuppressionArmed = false;
  next.flags.serviceSuppressionArmed = false;
  if (next.enemy.status === "pinned") next.enemy.status = "active";
  if (
    next.enemy.status === "staggered" &&
    !next.enemy.regulatorResetSuppressed
  ) {
    next.enemy.status = "active";
    next.enemy.staggered = false;
  }
  if (next.lift.resetAfterSettle) {
    next.lift.deployed = false;
    next.lift.resetAfterSettle = false;
    next.review.push({
      lane: "Settle",
      actionId: "lift-reset",
      instanceId: "lift-reset",
      title: "Service Lift reset",
      detail:
        "Temporary geometry closed; the player remains at the last legal landing.",
      outcome: "resolved",
    });
  }
  next.settleSummary.draw = drawn;
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
  return POSITION_COORDS[positionId] ?? POSITION_COORDS.entry;
}

export function getActionDefinition(actionId) {
  return ACTIONS[actionId] ?? null;
}

export {
  ACTIONS as FRACTURED_GATE_ACTIONS,
  BUILDS,
  CARDS,
  CORE_RULES,
  POSITION_NAMES,
};
