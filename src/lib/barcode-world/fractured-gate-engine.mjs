export const FRACTURED_GATE_SOURCE =
  "BARCODE_WORLD_BATTLE_MODE_BREACHFLOW_OWNER_LOCK_2026-07-31";

export const RESULT_TYPES = Object.freeze([
  "Fast Secure",
  "Clean Secure",
  "Recovery Secure",
  "Gate Lost",
  "Controlled Retreat",
]);

export const CORE_RULES = Object.freeze({
  movementPips: 6,
  actionSlots: 2,
  openingHand: 5,
  deckSize: 12,
  condition: 12,
  protection: 6,
  protectionCap: 8,
  gateStability: 3,
});

export const CARDS = Object.freeze({
  "brace-through": {
    id: "brace-through",
    name: "Brace Through",
    kind: "CONTACT",
    compatibility: ["shunt-ram", "hook-regulator"],
    text: "Reduce the declared contact loss. The physical conversion is unchanged.",
  },
  "safe-landing": {
    id: "safe-landing",
    name: "Safe Landing",
    kind: "ROUTE",
    compatibility: [
      "ride-breach",
      "meet-landing",
      "follow-regulator",
      "ride-track",
      "follow-signal",
      "cross-vacated",
    ],
    text: "Gain 2 Protection after completing the declared one-use route.",
  },
  "objective-brace": {
    id: "objective-brace",
    name: "Objective Brace",
    kind: "OBJECTIVE",
    compatibility: ["lock-now"],
    text: "The declared Gate lock remains braced even if Protection reaches zero.",
  },
  "hold-the-edge": {
    id: "hold-the-edge",
    name: "Hold the Edge",
    kind: "GUARD",
    compatibility: ["guard-position"],
    text: "Guard restores 6 Protection and prevents displacement this exchange.",
  },
  "recovery-mesh": {
    id: "recovery-mesh",
    name: "Recovery Mesh",
    kind: "RECOVERY",
    compatibility: ["take-cache"],
    text: "Recover the Field Cache and restore 1 Protection.",
  },
  "field-patch": {
    id: "field-patch",
    name: "Field Patch",
    kind: "RIG",
    compatibility: ["field-rig"],
    text: "Field Rig restores 4 Protection instead of 2.",
  },
  "fallback-guard": {
    id: "fallback-guard",
    name: "Fallback Guard",
    kind: "FALLBACK",
    compatibility: ["any-action"],
    text: "If the named source becomes illegal before begin, gain 2 Protection. Never retarget.",
  },
  "needle-focus": {
    id: "needle-focus",
    name: "Needle Focus",
    kind: "WEAPON",
    compatibility: ["strike"],
    text: "Keep the named shot stable through ordinary movement. No extra attack.",
  },
  "clear-return": {
    id: "clear-return",
    name: "Clear Return",
    kind: "MOVEMENT",
    compatibility: ["leave"],
    text: "Mark the West Exit as the declared safe return line.",
  },
  "relay-echo": {
    id: "relay-echo",
    name: "Relay Echo",
    kind: "SIGNAL",
    compatibility: ["redirect-broadcast"],
    text: "Keep the redirected signal legible after its source closes.",
  },
  "track-lock": {
    id: "track-lock",
    name: "Track Lock",
    kind: "SYSTEM",
    compatibility: ["reverse-track-feed"],
    text: "Make the displayed westbound track direction unmistakable.",
  },
  "survey-thread": {
    id: "survey-thread",
    name: "Survey Thread",
    kind: "EXPLORATION",
    compatibility: ["prepare-crossing", "map-relay-angle"],
    text: "Keep the declared landing and relay relationship visible through contact.",
  },
});

const CARD_IDS = Object.freeze(Object.keys(CARDS));

const BUILD_SPECS = [
  {
    id: "battle-exploration",
    name: "Battle → Exploration",
    short: "BATTLE / EXPLORATION",
    line: "Support RAM's collision, redirect it into the Divider, then move through the breach.",
    sourceFocusId: "cracked-divider",
    sourceLabel: "RAM → Cracked Divider contact",
    signatureActionIds: ["anchor", "shunt-ram"],
  },
  {
    id: "exploration-battle",
    name: "Exploration → Battle",
    short: "EXPLORATION / BATTLE",
    line: "Prepare an exact upper landing, then preserve the one contact planned there.",
    sourceFocusId: "upper-crossing",
    sourceLabel: "Upper crossing and declared landing",
    signatureActionIds: ["prepare-crossing"],
  },
  {
    id: "battle-hacking",
    name: "Battle → Hacking",
    short: "BATTLE / HACKING",
    line: "Use physical contact to expose RAM's regulator, then suppress only its displayed response.",
    sourceFocusId: "ram",
    sourceLabel: "RAM stabilization regulator",
    signatureActionIds: ["brace-contact", "hook-regulator"],
  },
  {
    id: "hacking-battle",
    name: "Hacking → Battle",
    short: "HACKING / BATTLE",
    line: "Rewrite the powered track, then physically drive RAM into the behavior Preview showed.",
    sourceFocusId: "powered-track",
    sourceLabel: "Powered service track",
    signatureActionIds: ["reverse-track-feed", "drive-ram-track"],
  },
  {
    id: "exploration-hacking",
    name: "Exploration → Hacking",
    short: "EXPLORATION / HACKING",
    line: "Map TRACE's relay relationship, then turn JAMMER's broadcast into a Gate route.",
    sourceFocusId: "trace-relay",
    sourceLabel: "TRACE relay angle",
    signatureActionIds: ["map-relay-angle", "redirect-broadcast"],
  },
  {
    id: "hacking-exploration",
    name: "Hacking → Exploration",
    short: "HACKING / EXPLORATION",
    line: "Rewrite JAMMER's visible rig move and cross only the geometry it actually vacates.",
    sourceFocusId: "jammer",
    sourceLabel: "JAMMER movement rig",
    signatureActionIds: ["rewrite-rig-stabilize", "intercept-ram"],
  },
];

export const BUILDS = Object.freeze(
  BUILD_SPECS.map((build, index) => {
    const deck = [...CARD_IDS.slice(index), ...CARD_IDS.slice(0, index)];
    return Object.freeze({
      ...build,
      deck: Object.freeze(deck),
      openingHand: Object.freeze(deck.slice(0, CORE_RULES.openingHand)),
    });
  }),
);

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

const coordKey = (x, y) => String(x) + "," + String(y);
const tileId = (x, y) => "tile-" + String(x) + "-" + String(y);
const WALKABLE = new Set(WALKABLE_COORDS.map(([x, y]) => coordKey(x, y)));

function parseTile(id) {
  const match = /^tile-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pointToPercent(x, y) {
  const row = y - 2;
  return {
    x: 8 + ((x - 1) / 12) * 82 + (Math.abs(row) % 2) * 1.8,
    y: 15 + (row / 6) * 68,
  };
}

function terrainAt(x, y) {
  if (y === 5 && x >= 3 && x <= 5) return "rubble";
  if (y === 6 && x >= 3 && x <= 7) return "clear";
  if (y === 7 && x >= 3 && x <= 10) return "powered";
  if (y <= 3) return "upper";
  if (x >= 10 && y >= 4 && y <= 6) return "gate";
  return "ordinary";
}

export const BOARD_TILES = Object.freeze(
  Object.fromEntries(
    WALKABLE_COORDS.map(([x, y]) => {
      const id = tileId(x, y);
      const point = pointToPercent(x, y);
      const terrain = terrainAt(x, y);
      return [
        id,
        Object.freeze({
          id,
          x,
          y,
          boardX: point.x,
          boardY: point.y,
          terrain,
          name: titleCase(terrain) + " space (" + String(x) + ", " + String(y) + ")",
        }),
      ];
    }),
  ),
);

function focusAt(id, name, kind, x, y, description) {
  const point = pointToPercent(x, y);
  return Object.freeze({
    id,
    name,
    kind,
    tileId: tileId(x, y),
    x: point.x,
    y: point.y,
    description,
  });
}

const CORE_FOCUSES = {
  "west-exit": focusAt("west-exit", "West Exit", "exit", 1, 6, "The legitimate retreat route."),
  "cracked-divider": focusAt("cracked-divider", "Cracked Divider", "terrain", 8, 5, "Load-bearing cover in RAM's center line."),
  "upper-crossing": focusAt("upper-crossing", "Unstable Crossing", "terrain", 7, 3, "A capacity-one upper landing with visible handholds."),
  "powered-track": focusAt("powered-track", "Powered Service Track", "machinery", 7, 7, "JAMMER powers this physical east-west track."),
  "trace-relay": focusAt("trace-relay", "TRACE Relay", "machinery", 9, 3, "The visible relay angle linking JAMMER and the Gate."),
  "field-cache": focusAt("field-cache", "Field Cache", "cache", 5, 2, "Optional recovery package. It creates no progression."),
  gate: focusAt("gate", "Fractured Gate", "objective", 12, 5, "Lock this three-Stability objective before RAM breaks it."),
  ram: focusAt("ram", "RAM", "enemy", 6, 5, "Direct collision and Gate pressure."),
  trace: focusAt("trace", "TRACE", "enemy", 9, 3, "Relay fire and landing pressure."),
  jammer: focusAt("jammer", "JAMMER", "enemy", 10, 7, "Powered support, movement rig, and route closure."),
};

const ROUTE_DEFINITIONS = Object.freeze({
  breach: { id: "breach", focusId: "route-breach", name: "Ride the Breach", actionId: "ride-breach", x: 8.8, y: 4.6, destination: "tile-10-5", movement: 3 },
  upper: { id: "upper", focusId: "route-upper", name: "Meet at Landing", actionId: "meet-landing", x: 8, y: 3, destination: "tile-10-4", movement: 3 },
  maintenance: { id: "maintenance", focusId: "route-maintenance", name: "Follow Regulator Line", actionId: "follow-regulator", x: 8, y: 6, destination: "tile-11-6", movement: 3 },
  track: { id: "track", focusId: "route-track", name: "Ride Reversed Track", actionId: "ride-track", x: 8, y: 7, destination: "tile-10-6", movement: 3 },
  signal: { id: "signal", focusId: "route-signal", name: "Follow the Signal", actionId: "follow-signal", x: 9, y: 4, destination: "tile-11-5", movement: 3 },
  rig: { id: "rig", focusId: "route-rig", name: "Cross Vacated Geometry", actionId: "cross-vacated", x: 10, y: 7, destination: "tile-10-6", movement: 3 },
});

const ROUTE_FOCUSES = Object.fromEntries(
  Object.values(ROUTE_DEFINITIONS).map((route) => [
    route.focusId,
    focusAt(
      route.focusId,
      route.name,
      "route",
      route.x,
      route.y,
      "Exclusive one-use movement to a declared Gate landing.",
    ),
  ]),
);

export const BOARD_FOCUSES = Object.freeze({ ...CORE_FOCUSES, ...ROUTE_FOCUSES });

const ACTIONS = Object.freeze({
  strike: { id: "strike", label: "Strike", parent: "WEAPON", usesAction: true, timing: "CONTACT", description: "Needle Carbine attacks one named enemy for 4 Impact.", preview: ["One named enemy receives 4 Impact.", "An invalid target is never replaced."], risk: "Opposed movement may invalidate the named contact." },
  "guard-position": { id: "guard-position", label: "Guard Position", parent: "PROTECTION", usesAction: true, timing: "YOU ACT FIRST", description: "Raise Barrier Mesh before enemy pressure.", preview: ["Restore 4 Protection before contact.", "The action does not move the player."], risk: "Protection can be consumed before Lock Now settles." },
  "field-rig": { id: "field-rig", label: "Field Rig", parent: "RIG", usesAction: true, timing: "YOU ACT FIRST", description: "Restore Protection without creating movement.", preview: ["Restore 2 Protection.", "No route or extra action is created."], risk: "This spends one of two actions on recovery." },
  "take-cache": { id: "take-cache", label: "Take Cache", parent: "OBJECT", usesAction: true, timing: "YOU ACT FIRST", description: "Carry the optional Field Cache into Results.", preview: ["Field Cache becomes carried.", "No persistent reward is created."], risk: "RAM's visible Gate pressure is not stopped." },
  "lock-now": { id: "lock-now", label: "Lock Now", parent: "OBJECTIVE", usesAction: true, timing: "CONTACT", description: "Complete the Gate lock from its platform.", preview: ["Lock the Gate if the landing remains legal.", "Visible enemy pressure resolves first."], risk: "The lock fails if the Gate or landing is lost." },
  leave: { id: "leave", label: "Leave", parent: "EXIT", usesAction: true, timing: "YOU ACT FIRST", description: "Take a legitimate Controlled Retreat.", preview: ["Exit west before becoming Compromised.", "The Gate and enemies remain unresolved."], risk: "The mission objective is abandoned." },
  anchor: { id: "anchor", label: "Anchor", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "battle-exploration", description: "Support RAM's exact collision line.", preview: ["Establish physical support at the Divider.", "Shunt RAM can now preserve this contact."], risk: "Intercepting will cost Protection and destroy infrastructure." },
  "shunt-ram": { id: "shunt-ram", label: "Shunt RAM", parent: "BUILD", usesAction: true, timing: "CONTACT", buildId: "battle-exploration", description: "Redirect RAM's visible charge into the Divider.", preview: ["Earn Intercept or Let It Land at contact.", "Intercept creates a real breach and costs Protection."], risk: "The choice preserves either the Gate or the player's position—not both." },
  "prepare-crossing": { id: "prepare-crossing", label: "Prepare Crossing", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "exploration-battle", description: "Declare TRACE's exact upper landing.", preview: ["Create one upper route to the declared landing.", "No extra attack or indefinite pin is granted."], risk: "RAM still completes this turn's Gate Commitment." },
  "brace-contact": { id: "brace-contact", label: "Brace Contact", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "battle-hacking", description: "Expose RAM's Stabilize regulator through contact.", preview: ["RAM's current charge meets the player.", "Only the displayed regulator response becomes hackable."], risk: "The current collision still lands." },
  "hook-regulator": { id: "hook-regulator", label: "Hook Regulator", parent: "BUILD", usesAction: true, timing: "CONTACT", buildId: "battle-hacking", description: "Prepare to suppress RAM's exact Stabilize response.", preview: ["Earn Suppress Stabilize or Let It Reset.", "No other part of RAM's turn is cancelled."], risk: "Suppression costs Protection at contact." },
  "reverse-track-feed": { id: "reverse-track-feed", label: "Reverse Track Feed", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "hacking-battle", description: "Rewrite the powered service track west.", preview: ["The track visibly points west.", "The rewrite has no payoff without a physical trigger."], risk: "JAMMER can later restore the track." },
  "drive-ram-track": { id: "drive-ram-track", label: "Drive RAM onto Track", parent: "BUILD", usesAction: true, timing: "CONTACT", buildId: "hacking-battle", description: "Physically trigger the rewritten track with RAM.", preview: ["Contact drives RAM onto the live track.", "JAMMER's own pulse launches RAM west."], risk: "Both actions are committed to one component behavior." },
  "map-relay-angle": { id: "map-relay-angle", label: "Map Relay Angle", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "exploration-hacking", description: "Trace the visible JAMMER → TRACE → Gate relationship.", preview: ["Declare one real relay angle.", "The relationship alone does not stop RAM."], risk: "RAM's Gate Commitment remains live." },
  "redirect-broadcast": { id: "redirect-broadcast", label: "Redirect Broadcast", parent: "BUILD", usesAction: true, timing: "CONTACT", buildId: "exploration-hacking", description: "Turn JAMMER's support signal into a route.", preview: ["Create one source-bound signal route.", "The route closes after its next exchange."], risk: "The build accepts one RAM Gate hit to gain position." },
  "rewrite-rig-stabilize": { id: "rewrite-rig-stabilize", label: "Rewrite Rig Stabilize", parent: "BUILD", usesAction: true, timing: "YOU ACT FIRST", buildId: "hacking-exploration", description: "Move JAMMER to one declared adjacent legal space.", preview: ["JAMMER must physically reach the declared space.", "Its vacated geometry creates one exclusive route."], risk: "No movement means no route and no fallback geometry." },
  "intercept-ram": { id: "intercept-ram", label: "Intercept RAM", parent: "BUILD", usesAction: true, timing: "CONTACT", buildId: "hacking-exploration", description: "Plan the ordinary RAM contact preserved by the rig route.", preview: ["Contact occurs only through JAMMER's vacated geometry.", "No damage, Guard break, pin, or extra action is added."], risk: "The contact disappears if the rig source does not move." },
  "ride-breach": { id: "ride-breach", label: "Ride the Breach", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "breach", timing: "YOU ACT FIRST", description: "Spend movement through the destroyed Divider." },
  "meet-landing": { id: "meet-landing", label: "Meet at Landing", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "upper", timing: "CONTACT", description: "Spend movement to the prepared TRACE landing." },
  "follow-regulator": { id: "follow-regulator", label: "Follow Regulator Line", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "maintenance", timing: "YOU ACT FIRST", description: "Spend movement through the exposed maintenance line." },
  "ride-track": { id: "ride-track", label: "Ride Reversed Track", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "track", timing: "YOU ACT FIRST", description: "Spend movement along the west-reversed powered track." },
  "follow-signal": { id: "follow-signal", label: "Follow the Signal", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "signal", timing: "YOU ACT FIRST", description: "Spend movement through the hostile relay route." },
  "cross-vacated": { id: "cross-vacated", label: "Cross Vacated Geometry", parent: "ROUTE", usesAction: false, contextMove: true, routeId: "rig", timing: "YOU ACT FIRST", description: "Spend movement through JAMMER's vacated space." },
});

export const FRACTURED_GATE_ACTIONS = ACTIONS;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getBuild(buildId) {
  return BUILDS.find((build) => build.id === buildId) ?? BUILDS[0];
}

export function getBuildDefinition(buildId) {
  return getBuild(buildId);
}

function distance(left, right) {
  const a = parseTile(left);
  const b = parseTile(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function ordinaryNeighbors(id) {
  const point = parseTile(id);
  if (!point) return [];
  const result = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = point.x + dx;
    const ny = point.y + dy;
    if (!WALKABLE.has(coordKey(nx, ny))) continue;
    if (dx && dy && (!WALKABLE.has(coordKey(point.x + dx, point.y)) || !WALKABLE.has(coordKey(point.x, point.y + dy)))) continue;
    result.push(tileId(nx, ny));
  }
  return result;
}

function activeEnemyPositions(state) {
  return new Set(
    Object.values(state.enemies)
      .filter((enemy) => !["disabled", "withdrawn"].includes(enemy.status))
      .map((enemy) => enemy.position),
  );
}

function findReachable(state, origin, budget) {
  const blocked = activeEnemyPositions(state);
  const frontier = [{ id: origin, cost: 0, path: [origin] }];
  const best = new Map([[origin, { cost: 0, path: [origin] }]]);
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (current.cost !== best.get(current.id)?.cost) continue;
    for (const next of ordinaryNeighbors(current.id)) {
      if (blocked.has(next)) continue;
      const cost = current.cost + (BOARD_TILES[next].terrain === "rubble" ? 2 : 1);
      if (cost > budget || cost >= (best.get(next)?.cost ?? Infinity)) continue;
      const entry = { cost, path: [...current.path, next] };
      best.set(next, entry);
      frontier.push({ id: next, ...entry });
    }
  }
  best.delete(origin);
  return best;
}

function planPosition(state) {
  const moves = state.plan.filter((step) => step.kind === "move" || step.kind === "context-move");
  return moves.at(-1)?.destination ?? state.position;
}

export function getProjectedPosition(state) {
  return planPosition(state);
}

export function movementSpent(state) {
  return state.plan
    .filter((step) => step.kind === "move" || step.kind === "context-move")
    .reduce((sum, step) => sum + step.movement, 0);
}

export function movementRemaining(state) {
  return Math.max(0, CORE_RULES.movementPips - movementSpent(state));
}

export function actionSlotsUsed(state) {
  return state.plan.filter((step) => step.kind === "action").length;
}

export function getReachableTiles(state) {
  if (state.phase !== "planning") return {};
  return Object.fromEntries(findReachable(state, planPosition(state), movementRemaining(state)));
}

function emptyRoutes() {
  return Object.fromEntries(
    Object.keys(ROUTE_DEFINITIONS).map((id) => [id, { id, active: false, consumed: false, createdRound: null, expiresAfterRound: null }]),
  );
}

function makeEnemyIntent(state) {
  const activeRoute = Object.values(state.routes).find((route) => route.active && !route.consumed);
  if (state.round > 1 && (activeRoute || state.gate.windowOpen)) {
    return {
      commitment: { id: "trace-the-opening", actorId: "trace", actor: "TRACE", label: "Trace the Opening", targetId: "player", target: "Gate landing", timing: "ENEMY ACTS FIRST", confidence: "CONFIRMED", text: "TRACE will fire across the route landing before the Gate lock settles." },
      support: { id: "close-the-line", actorId: "jammer", actor: "JAMMER", label: "Close the Line", targetId: activeRoute ? ROUTE_DEFINITIONS[activeRoute.id].focusId : "gate", target: activeRoute ? "Active route" : "Gate receiver", timing: "CONTACT", confidence: "CONFIRMED", text: "JAMMER will close the temporary source after this exchange." },
      idle: { actorId: "ram", actor: "RAM", text: "Recovering position; no hidden third action." },
    };
  }
  if (["disabled", "withdrawn", "displaced"].includes(state.enemies.ram.status)) {
    return {
      commitment: { id: "trace-line-shot", actorId: "trace", actor: "TRACE", label: "Line Shot", targetId: "player", target: "Player", timing: "ENEMY ACTS FIRST", confidence: "CONFIRMED", text: "TRACE will fire along its visible lane." },
      support: { id: "jammer-recenter", actorId: "jammer", actor: "JAMMER", label: "Recenter RAM", targetId: "ram", target: "RAM", timing: "ENEMY ACTS FIRST", confidence: "CONFIRMED", text: "JAMMER will restore RAM's board position without adding an attack." },
      idle: { actorId: "ram", actor: "RAM", text: "No hidden third action while displaced or disabled." },
    };
  }
  return {
    commitment: { id: "ram-the-gate", actorId: "ram", actor: "RAM", label: "RAM the Gate", targetId: "gate", target: "Fractured Gate", timing: "CONTACT", confidence: "CONFIRMED", text: "RAM will charge the Gate for 1 Stability unless planned contact changes it." },
    support: { id: "stabilize-shift", actorId: "jammer", actor: "JAMMER", label: "Stabilize Shift", targetId: "ram", target: "RAM / lower lane", timing: "ENEMY ACTS FIRST", confidence: "CONFIRMED", text: "JAMMER will move one legal space and broadcast through TRACE." },
    idle: { actorId: "trace", actor: "TRACE", text: "Relay source only; no hidden third action." },
  };
}

function initialState(buildId) {
  const build = getBuild(buildId);
  const state = {
    seed: "FG-BREACHFLOW-01",
    source: FRACTURED_GATE_SOURCE,
    buildId: build.id,
    phase: "planning",
    round: 1,
    warning: "",
    position: "tile-2-6",
    condition: CORE_RULES.condition,
    protection: CORE_RULES.protection,
    hand: [...build.openingHand],
    deck: build.deck.slice(CORE_RULES.openingHand),
    discard: [],
    plan: [],
    gate: { stability: CORE_RULES.gateStability, locked: false, windowOpen: false },
    divider: { status: "cracked" },
    track: { direction: "east", rewritten: false },
    cache: { status: "available", carried: false },
    enemies: {
      ram: { id: "ram", name: "RAM", position: "tile-6-5", condition: 10, guard: 2, status: "active" },
      trace: { id: "trace", name: "TRACE", position: "tile-9-3", condition: 8, guard: 1, status: "active" },
      jammer: { id: "jammer", name: "JAMMER", position: "tile-10-7", condition: 8, guard: 2, status: "active" },
    },
    routes: emptyRoutes(),
    flags: { anchored: false, guarding: false, displacementBlocked: false, turningPoint: null, routeUsed: null, regulatorSuppressed: false, relayMapped: false, rigMoved: false, retreated: false },
    enemyIntent: null,
    response: null,
    resolution: null,
    result: null,
    review: [],
  };
  state.enemyIntent = makeEnemyIntent(state);
  return state;
}

export function createFracturedGateState(buildId = "battle-exploration") {
  return initialState(buildId);
}

export function resetFracturedGate(state) {
  return initialState(state?.buildId ?? "battle-exploration");
}

export function changeFracturedGateBuild(state, buildId) {
  if (state.phase !== "planning" || state.round !== 1 || state.plan.length) {
    return { ...state, warning: "Reset before changing the ordered build." };
  }
  return initialState(buildId);
}

function focusTile(state, focusId) {
  if (focusId === "player") return planPosition(state);
  if (state.enemies[focusId]) return state.enemies[focusId].position;
  return BOARD_FOCUSES[focusId]?.tileId ?? null;
}

function isGatePlatform(id) {
  const point = parseTile(id);
  return Boolean(point && point.x >= 10 && point.x <= 13 && point.y >= 4 && point.y <= 6);
}

function plannedIds(state) {
  return new Set(state.plan.map((step) => step.id));
}

function cardReserved(state, cardId) {
  return state.plan.some((step) => step.cardId === cardId);
}

export function getCompatibleCards(state, actionId) {
  const action = ACTIONS[actionId];
  if (!action) return [];
  return state.hand.filter((cardId) => {
    if (cardReserved(state, cardId)) return false;
    const compatibility = CARDS[cardId]?.compatibility ?? [];
    return compatibility.includes(actionId) || (compatibility.includes("any-action") && action.usesAction);
  });
}

function validation(state, actionId, targetId, cardId = null) {
  const action = ACTIONS[actionId];
  if (!action) return { legal: false, reason: "That action is unavailable." };
  if (state.phase !== "planning") return { legal: false, reason: "Actions can be planned only during Read & Plan." };
  if (action.buildId && action.buildId !== state.buildId) return { legal: false, reason: "This build does not create that opportunity." };
  if (action.usesAction && actionSlotsUsed(state) >= CORE_RULES.actionSlots) return { legal: false, reason: "Both action slots are already committed." };
  if (cardId && (!state.hand.includes(cardId) || cardReserved(state, cardId) || !getCompatibleCards(state, actionId).includes(cardId))) return { legal: false, reason: "That card is not compatible or available." };

  const position = planPosition(state);
  const ids = plannedIds(state);
  const ramDistance = distance(position, state.enemies.ram.position);
  const sourceDistance = (focusId) => distance(position, focusTile(state, focusId));

  if (action.contextMove) {
    const route = state.routes[action.routeId];
    if (!route?.active || route.consumed) return { legal: false, reason: "That physical route does not currently exist." };
    if (movementRemaining(state) < ROUTE_DEFINITIONS[action.routeId].movement) return { legal: false, reason: "Not enough movement pips remain for this route." };
  }

  switch (actionId) {
    case "strike":
      if (!state.enemies[targetId] || ["disabled", "withdrawn"].includes(state.enemies[targetId].status)) return { legal: false, reason: "Select an active enemy." };
      if (distance(position, state.enemies[targetId].position) > 2) return { legal: false, reason: "Move within two tactical spaces first." };
      break;
    case "take-cache":
      if (state.cache.status !== "available") return { legal: false, reason: "The Field Cache is no longer available." };
      if (sourceDistance("field-cache") > 1) return { legal: false, reason: "Move beside the Field Cache first." };
      break;
    case "lock-now":
      if (!isGatePlatform(position)) return { legal: false, reason: "Reach the Gate Platform first." };
      if (state.gate.stability <= 0) return { legal: false, reason: "The Gate has already failed." };
      break;
    case "leave":
      if (sourceDistance("west-exit") > 1) return { legal: false, reason: "Return beside the West Exit first." };
      break;
    case "anchor":
      if (ramDistance > 2 && sourceDistance("cracked-divider") > 3) return { legal: false, reason: "Move into RAM's Divider contact line first." };
      break;
    case "shunt-ram":
      if (!ids.has("anchor")) return { legal: false, reason: "Anchor must be the first action." };
      if (ramDistance > 2) return { legal: false, reason: "RAM is outside the anchored contact line." };
      break;
    case "prepare-crossing":
      if (sourceDistance("upper-crossing") > 2) return { legal: false, reason: "Move within reach of the unstable crossing." };
      break;
    case "brace-contact":
      if (ramDistance > 2) return { legal: false, reason: "Move into RAM's contact line first." };
      break;
    case "hook-regulator":
      if (!ids.has("brace-contact")) return { legal: false, reason: "Brace Contact must expose the regulator first." };
      break;
    case "reverse-track-feed":
      if (sourceDistance("powered-track") > 1) return { legal: false, reason: "Reach the powered service track access first." };
      break;
    case "drive-ram-track":
      if (!ids.has("reverse-track-feed")) return { legal: false, reason: "Reverse the track before the physical trigger." };
      if (ramDistance > 3) return { legal: false, reason: "RAM cannot be driven onto the track from here." };
      break;
    case "map-relay-angle":
      if (sourceDistance("trace-relay") > 4) return { legal: false, reason: "Reach the upper relay angle first." };
      break;
    case "redirect-broadcast":
      if (!ids.has("map-relay-angle")) return { legal: false, reason: "Map the relay relationship first." };
      break;
    case "rewrite-rig-stabilize":
      if (["disabled", "withdrawn"].includes(state.enemies.jammer.status)) return { legal: false, reason: "JAMMER is not a live source for this Rewrite." };
      if (sourceDistance("jammer") > 3) return { legal: false, reason: "Reach the visible rig response first." };
      break;
    case "intercept-ram":
      if (!ids.has("rewrite-rig-stabilize")) return { legal: false, reason: "Rewrite Rig Stabilize must declare the vacated geometry first." };
      if (ramDistance > 3) return { legal: false, reason: "RAM is outside the planned contact." };
      break;
    default:
      break;
  }
  return { legal: true, reason: "" };
}

function choiceFor(state, actionId, targetId) {
  const action = ACTIONS[actionId];
  const checked = validation(state, actionId, targetId);
  return { ...action, targetId, legal: checked.legal, reason: checked.reason };
}

function group(parent, choices) {
  return { parent, choices };
}

export function getContextActionGroups(state, focusId) {
  if (state.phase !== "planning") return [];
  const groups = [];
  const add = (parent, choices) => {
    if (choices.length) groups.push(group(parent, choices));
  };

  if (focusId === "player") {
    add("MOVE", [{ id: "move", label: "Move", parent: "MOVE", moveMode: true, legal: movementRemaining(state) > 0, reason: movementRemaining(state) ? "" : "All six movement pips are spent.", description: "Show every legal destination. Movement may be split." }]);
    add("PROTECTION", [choiceFor(state, "guard-position", "player")]);
    add("RIG", [choiceFor(state, "field-rig", "player")]);
  }

  if (state.enemies[focusId]) add("WEAPON", [choiceFor(state, "strike", focusId)]);
  if (focusId === "field-cache") add("OBJECT", [choiceFor(state, "take-cache", focusId)]);
  if (focusId === "gate") add("OBJECTIVE", [choiceFor(state, "lock-now", focusId)]);
  if (focusId === "west-exit") add("EXIT", [choiceFor(state, "leave", focusId)]);

  const build = getBuild(state.buildId);
  const buildChoices = [];
  for (const actionId of build.signatureActionIds) {
    const targetByAction = {
      anchor: "cracked-divider",
      "shunt-ram": "ram",
      "prepare-crossing": "upper-crossing",
      "brace-contact": "ram",
      "hook-regulator": "ram",
      "reverse-track-feed": "powered-track",
      "drive-ram-track": "ram",
      "map-relay-angle": "trace-relay",
      "redirect-broadcast": "trace",
      "rewrite-rig-stabilize": "jammer",
      "intercept-ram": "ram",
    };
    const target = targetByAction[actionId];
    if (focusId === target || focusId === build.sourceFocusId) buildChoices.push(choiceFor(state, actionId, target));
  }
  add("BUILD", buildChoices);

  const route = Object.values(ROUTE_DEFINITIONS).find((entry) => entry.focusId === focusId);
  if (route) add("ROUTE", [choiceFor(state, route.actionId, focusId)]);
  return groups.slice(0, 4);
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

function planSignature(state, proposal = null) {
  const steps = proposal ? [...state.plan, proposal] : state.plan;
  return hash(JSON.stringify({ seed: state.seed, build: state.buildId, round: state.round, position: state.position, intent: state.enemyIntent.commitment.id + "/" + state.enemyIntent.support.id, steps: steps.map((step) => [step.id, step.targetId, step.destination, step.cardId]) }));
}

export function previewAction(state, actionId, targetId, cardId = null) {
  const action = ACTIONS[actionId];
  const checked = validation(state, actionId, targetId, cardId);
  if (!action) return { legal: false, reason: checked.reason, title: "Unavailable", expected: [], risk: checked.reason, signature: planSignature(state) };
  const route = action.contextMove ? ROUTE_DEFINITIONS[action.routeId] : null;
  const proposal = { id: actionId, targetId, destination: route?.destination, cardId };
  return { legal: checked.legal, reason: checked.reason, title: action.label, expected: action.preview ?? [action.description, "The named source and destination remain explicit."], risk: action.risk ?? "The route disappears if its physical source becomes illegal.", signature: planSignature(state, proposal) };
}

export function queueMove(state, destination) {
  if (state.phase !== "planning") return { ...state, warning: "Movement can be planned only during Read & Plan." };
  const reachable = getReachableTiles(state)[destination];
  if (!reachable) return { ...state, warning: "That space is not a legal movement destination." };
  return {
    ...state,
    warning: "",
    plan: [...state.plan, { instanceId: "move-" + String(state.plan.length + 1), id: "move", label: "Move to " + BOARD_TILES[destination].name, kind: "move", targetId: destination, destination, movement: reachable.cost, path: reachable.path, timing: "YOU ACT FIRST", usesAction: false, cardId: null }],
  };
}

export function queueAction(state, actionId, targetId, cardId = null) {
  const checked = validation(state, actionId, targetId, cardId);
  if (!checked.legal) return { ...state, warning: checked.reason };
  const action = ACTIONS[actionId];
  const route = action.contextMove ? ROUTE_DEFINITIONS[action.routeId] : null;
  const step = {
    ...action,
    instanceId: actionId + "-" + String(state.plan.length + 1),
    targetId,
    cardId,
    kind: action.contextMove ? "context-move" : "action",
    destination: route?.destination ?? null,
    movement: route?.movement ?? 0,
    path: route ? [planPosition(state), route.destination] : [],
  };
  return { ...state, warning: "", plan: [...state.plan, step] };
}

export function removePlanStep(state, instanceId) {
  if (state.phase !== "planning") return state;
  const index = state.plan.findIndex((step) => step.instanceId === instanceId);
  if (index < 0) return state;
  return { ...state, warning: "", plan: state.plan.slice(0, index) };
}

function responseFor(state) {
  const ids = plannedIds(state);
  if (ids.has("shunt-ram")) {
    return {
      title: "RAM reaches the anchored collision",
      text: "Choose whether to take the hit and redirect the charge or preserve position and let it land.",
      recommendedId: "intercept",
      options: [
        { id: "intercept", label: "Intercept", text: "Take the declared hit, save the Gate, and destroy the Divider." },
        { id: "let-land", label: "Let It Land", text: "Preserve position and accept 1 Gate Stability loss." },
      ],
    };
  }
  if (ids.has("hook-regulator")) {
    return {
      title: "RAM's Stabilize response is exposed",
      text: "Choose whether to suppress only that displayed response or let it reset.",
      recommendedId: "suppress-stabilize",
      options: [
        { id: "suppress-stabilize", label: "Suppress Stabilize", text: "Take contact and strand RAM without cancelling its whole turn." },
        { id: "let-reset", label: "Let It Reset", text: "Preserve the hook and accept the Gate hit." },
      ],
    };
  }
  return null;
}

export function projectPlan(state) {
  const response = responseFor(state);
  const labels = state.plan.map((step) => step.label);
  return {
    signature: planSignature(state),
    expected: labels.length ? labels.map((label) => label + " remains source-bound.") : ["The visible enemy Commitment resolves unchanged.", "The support action resolves; the third enemy does nothing hidden."],
    risk: response ? "A contact choice remains unresolved until the earned Response." : state.plan.length ? "Named sources can become illegal; no step silently retargets." : "RAM will damage the Gate if nothing changes its Commitment.",
    response,
  };
}

function impactEnemy(enemy, amount) {
  const absorbed = Math.min(enemy.guard, amount);
  enemy.guard -= absorbed;
  enemy.condition = Math.max(0, enemy.condition - (amount - absorbed));
  if (enemy.condition === 0) enemy.status = "disabled";
}

function impactPlayer(sim, amount) {
  const absorbed = Math.min(sim.protection, amount);
  sim.protection -= absorbed;
  sim.condition = Math.max(0, sim.condition - (amount - absorbed));
}

function materialSnapshot(sim) {
  return clone({
    position: sim.position,
    condition: sim.condition,
    protection: sim.protection,
    gate: sim.gate,
    divider: sim.divider,
    track: sim.track,
    cache: sim.cache,
    enemies: sim.enemies,
    routes: sim.routes,
    flags: sim.flags,
  });
}

function addEvent(events, sim, timing, title, detail, actor = "SYSTEM") {
  events.push({ id: "event-" + String(events.length + 1), timing, title, detail, actor, snapshot: materialSnapshot(sim) });
}

function activateRoute(sim, routeId) {
  sim.routes[routeId] = { id: routeId, active: true, consumed: false, createdRound: sim.round, expiresAfterRound: sim.round + 1 };
  sim.gate.windowOpen = true;
}

function simulateTurn(state, responseChoice) {
  const sim = clone(state);
  const events = [];
  let commitmentHandled = false;
  let deferredLock = null;

  for (const step of state.plan) {
    if (step.kind === "move") {
      sim.position = step.destination;
      addEvent(events, sim, "YOU ACT FIRST", "Movement confirmed", step.label + " using " + String(step.movement) + " of 6 movement pips.", "PLAYER");
      continue;
    }
    if (step.kind === "context-move") {
      const route = sim.routes[step.routeId];
      if (!route?.active || route.consumed) {
        if (step.cardId === "fallback-guard") sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + 2);
        addEvent(events, sim, step.timing, step.label + " invalidated", "Its physical source no longer exists. No silent reroute occurred.", "PLAYER");
        continue;
      }
      route.consumed = true;
      route.active = false;
      sim.position = step.destination;
      sim.flags.routeUsed = step.routeId;
      if (step.routeId === "upper") sim.flags.turningPoint = "TRACE met at the declared landing.";
      if (step.cardId === "safe-landing") sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + 2);
      addEvent(events, sim, step.timing, step.label, "The one-use route carries the player to the declared Gate landing.", "PLAYER");
      continue;
    }

    switch (step.id) {
      case "guard-position":
        sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + (step.cardId === "hold-the-edge" ? 6 : 4));
        sim.flags.guarding = true;
        sim.flags.displacementBlocked = step.cardId === "hold-the-edge";
        addEvent(events, sim, "YOU ACT FIRST", "Gate lane guarded", "Barrier Mesh rises before the visible enemy pressure.", "PLAYER");
        break;
      case "field-rig":
        sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + (step.cardId === "field-patch" ? 4 : 2));
        addEvent(events, sim, "YOU ACT FIRST", "Field Rig stabilized", "Protection is restored without creating movement or another action.", "PLAYER");
        break;
      case "strike": {
        const enemy = sim.enemies[step.targetId];
        if (!enemy || ["disabled", "withdrawn"].includes(enemy.status)) {
          if (step.cardId === "fallback-guard") sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + 2);
          addEvent(events, sim, "CONTACT", "Strike invalidated", "The selected target was no longer legal. No retarget occurred.", "PLAYER");
        } else {
          impactEnemy(enemy, 4);
          addEvent(events, sim, "CONTACT", "Needle Carbine contact", "4 Impact resolves against " + enemy.name + "'s visible Guard and Condition.", "PLAYER");
        }
        break;
      }
      case "take-cache":
        sim.cache.status = "carried";
        sim.cache.carried = true;
        if (step.cardId === "recovery-mesh") sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + 1);
        addEvent(events, sim, "YOU ACT FIRST", "Field Cache recovered", "The optional Package is carried into Results. It remains nonpersistent.", "PLAYER");
        break;
      case "leave":
        sim.flags.retreated = true;
        sim.position = "tile-1-6";
        addEvent(events, sim, "YOU ACT FIRST", "West Exit used", "The player leaves before becoming Compromised.", "PLAYER");
        break;
      case "anchor":
        sim.flags.anchored = true;
        addEvent(events, sim, "YOU ACT FIRST", "Anchor established", "The player supports the exact RAM-to-Divider collision line.", "PLAYER");
        break;
      case "shunt-ram":
        if (responseChoice === "intercept") {
          impactPlayer(sim, step.cardId === "brace-through" ? 2 : 4);
          sim.divider.status = "breached";
          sim.enemies.ram.status = "staggered";
          sim.enemies.ram.position = "tile-7-5";
          activateRoute(sim, "breach");
          sim.flags.turningPoint = "RAM's charge destroyed the Cracked Divider.";
          commitmentHandled = true;
          addEvent(events, sim, "CONTACT", "RAM crashes through the Divider", "The player takes the declared hit, redirects RAM, and creates a one-use breach.", "RAM + PLAYER");
        } else {
          sim.gate.stability = Math.max(0, sim.gate.stability - 1);
          commitmentHandled = true;
          addEvent(events, sim, "CONTACT", "RAM reaches the Gate", "The player preserves position and accepts 1 Gate Stability loss.", "RAM");
        }
        break;
      case "prepare-crossing":
        activateRoute(sim, "upper");
        sim.flags.turningPoint = "The upper landing was prepared.";
        addEvent(events, sim, "YOU ACT FIRST", "Crossing prepared", "Stable handholds and TRACE's exact east landing become a real one-use route.", "PLAYER");
        break;
      case "brace-contact":
        sim.flags.anchored = true;
        addEvent(events, sim, "YOU ACT FIRST", "Contact braced", "RAM's current charge will meet the player instead of the Gate.", "PLAYER");
        break;
      case "hook-regulator":
        if (responseChoice === "suppress-stabilize") {
          impactPlayer(sim, step.cardId === "brace-through" ? 1 : 3);
          sim.enemies.ram.status = "staggered";
          activateRoute(sim, "maintenance");
          sim.flags.regulatorSuppressed = true;
          sim.flags.turningPoint = "RAM's exposed Stabilize response was suppressed.";
          commitmentHandled = true;
          addEvent(events, sim, "CONTACT", "Regulator suppression", "The current collision lands, but only RAM's displayed Stabilize response is suppressed.", "RAM + PLAYER");
        } else {
          sim.gate.stability = Math.max(0, sim.gate.stability - 1);
          commitmentHandled = true;
          addEvent(events, sim, "CONTACT", "RAM resets and reaches the Gate", "The response completes and removes 1 Gate Stability.", "RAM");
        }
        break;
      case "reverse-track-feed":
        sim.track.direction = "west";
        sim.track.rewritten = true;
        addEvent(events, sim, "YOU ACT FIRST", "Track feed reversed", "The service track points west, but still needs a physical trigger.", "PLAYER");
        break;
      case "drive-ram-track":
        sim.enemies.ram.position = "tile-3-5";
        sim.enemies.ram.status = "displaced";
        activateRoute(sim, "track");
        sim.flags.turningPoint = "JAMMER's own track pulse launched RAM west.";
        commitmentHandled = true;
        addEvent(events, sim, "CONTACT", "RAM launched west", "Physical contact triggers the rewritten track. No remote or free payoff occurs.", "RAM + PLAYER");
        break;
      case "map-relay-angle":
        sim.flags.relayMapped = true;
        addEvent(events, sim, "YOU ACT FIRST", "Relay angle mapped", "JAMMER, TRACE, and the Gate receiver are linked by one visible line.", "PLAYER");
        break;
      case "redirect-broadcast":
        activateRoute(sim, "signal");
        sim.flags.turningPoint = "JAMMER's broadcast became a Gate route.";
        addEvent(events, sim, "CONTACT", "Hostile signal redirected", "The broadcast becomes a one-use route. RAM remains free to complete its Commitment.", "PLAYER");
        break;
      case "rewrite-rig-stabilize":
        sim.enemies.jammer.position = "tile-11-7";
        sim.flags.rigMoved = true;
        activateRoute(sim, "rig");
        addEvent(events, sim, "YOU ACT FIRST", "JAMMER shifts east", "The rig reaches its declared legal space and vacates one-use geometry.", "JAMMER");
        break;
      case "intercept-ram":
        if (sim.flags.rigMoved) {
          sim.enemies.ram.status = "staggered";
          sim.flags.turningPoint = "JAMMER's vacated geometry preserved RAM contact.";
          commitmentHandled = true;
          addEvent(events, sim, "CONTACT", "RAM intercepted through vacated geometry", "The ordinary contact connects. No extra damage, action, Guard break, or pin is added.", "RAM + PLAYER");
        }
        break;
      case "lock-now":
        deferredLock = step;
        break;
      default:
        break;
    }
  }

  const commitmentActor = sim.enemies[state.enemyIntent.commitment.actorId];
  if (!commitmentHandled && !sim.flags.retreated && !sim.gate.locked && commitmentActor && ["disabled", "withdrawn"].includes(commitmentActor.status)) {
    commitmentHandled = true;
    addEvent(events, sim, "CONTACT", state.enemyIntent.commitment.label + " invalidated", commitmentActor.name + " cannot complete the displayed Commitment. No other enemy inherits it.", commitmentActor.name);
  }

  if (!commitmentHandled && !sim.flags.retreated && !sim.gate.locked) {
    if (state.enemyIntent.commitment.id === "ram-the-gate") {
      sim.gate.stability = Math.max(0, sim.gate.stability - 1);
      sim.enemies.ram.position = "tile-9-5";
      addEvent(events, sim, "CONTACT", "RAM impacts the Gate", "No planned contact changed the Commitment. Gate Stability falls by 1.", "RAM");
    } else {
      impactPlayer(sim, 3);
      addEvent(events, sim, "ENEMY ACTS FIRST", "TRACE crosses the landing", "The confirmed firing line removes 3 Protection before the Gate lock.", "TRACE");
    }
  }

  const supportActor = sim.enemies[state.enemyIntent.support.actorId];
  if (!sim.flags.retreated && supportActor && ["disabled", "withdrawn"].includes(supportActor.status)) {
    addEvent(events, sim, "ENEMY ACTS FIRST", state.enemyIntent.support.label + " invalidated", supportActor.name + " cannot complete the displayed support action. No hidden replacement occurs.", supportActor.name);
  } else if (!sim.flags.retreated) {
    if (state.enemyIntent.support.id === "stabilize-shift") {
      if (!sim.flags.rigMoved) sim.enemies.jammer.position = "tile-11-7";
      if (parseTile(sim.position)?.y >= 6) impactPlayer(sim, 1);
      addEvent(events, sim, "ENEMY ACTS FIRST", "JAMMER Stabilize Shift", "JAMMER completes one visible rig move and broadcasts through TRACE. No third enemy attack occurs.", "JAMMER");
    } else if (state.enemyIntent.support.id === "close-the-line") {
      addEvent(events, sim, "ENEMY ACTS FIRST", "JAMMER closes the source", "The temporary source closes after any already-completed crossing.", "JAMMER");
    } else if (state.enemyIntent.support.id === "jammer-recenter") {
      if (sim.enemies.ram.status === "displaced") {
        sim.enemies.ram.position = "tile-6-5";
        sim.enemies.ram.status = "active";
      }
      addEvent(events, sim, "ENEMY ACTS FIRST", "JAMMER recenters RAM", "The support restores RAM's board position without adding an attack.", "JAMMER");
    }
  }

  if (deferredLock && !sim.flags.retreated) {
    const braced = sim.flags.guarding || deferredLock.cardId === "objective-brace" || sim.protection > 0;
    if (isGatePlatform(sim.position) && sim.gate.stability > 0 && braced) {
      sim.gate.locked = true;
      addEvent(events, sim, "CONTACT", "Gate locked", "The player holds the landing through visible pressure and completes the lock.", "PLAYER");
    } else {
      if (deferredLock.cardId === "fallback-guard") sim.protection = Math.min(CORE_RULES.protectionCap, sim.protection + 2);
      addEvent(events, sim, "CONTACT", "Lock Now invalidated", "The declared landing or objective no longer supports the lock. No alternate target is chosen.", "PLAYER");
    }
  }

  if (!events.length) addEvent(events, sim, "CONTACT", "No player interruption", "The visible enemy plan resolves exactly as forecast.");
  return { events, final: materialSnapshot(sim) };
}

function beginResolution(state, responseChoice = null) {
  const projection = projectPlan(state);
  const simulation = simulateTurn(state, responseChoice);
  return {
    ...state,
    warning: "",
    phase: "resolution",
    response: null,
    resolution: { signature: projection.signature, cursor: -1, events: simulation.events, final: simulation.final },
  };
}

export function lockPlan(state) {
  if (state.phase !== "planning") return state;
  const response = responseFor(state);
  if (response) return { ...state, warning: "", phase: "response", response, resolution: null };
  return beginResolution(state);
}

export function chooseResponse(state, responseId) {
  if (state.phase !== "response" || !state.response?.options.some((option) => option.id === responseId)) return { ...state, warning: "That Response is not available." };
  return beginResolution(state, responseId);
}

function applySnapshot(state, snapshot) {
  return { ...state, ...clone(snapshot) };
}

export function advanceResolution(state) {
  if (state.phase !== "resolution" || !state.resolution) return state;
  const cursor = state.resolution.cursor + 1;
  if (cursor >= state.resolution.events.length) return state;
  const event = state.resolution.events[cursor];
  let next = applySnapshot(state, event.snapshot);
  const review = [...state.review, { round: state.round, timing: event.timing, title: event.title, detail: event.detail, actor: event.actor }];
  next = { ...next, review, resolution: { ...state.resolution, cursor } };
  if (cursor === state.resolution.events.length - 1) next.phase = "settle";
  return next;
}

function makeResult(state, type) {
  const turningPoint = state.flags.turningPoint ?? (type === "Controlled Retreat" ? "The West Exit was used before compromise." : type === "Gate Lost" ? "Visible Gate pressure completed without a successful lock." : "The declared Gate landing held through contact.");
  const tradeoff = type === "Recovery Secure"
    ? "The Cache was recovered, but RAM received time to damage the Gate."
    : type === "Clean Secure"
      ? "The infrastructure survived, but the Field Cache was left behind."
      : type === "Controlled Retreat"
        ? "The Gate and active enemies remain unresolved."
        : type === "Gate Lost"
          ? "Survival or combat activity does not replace the location objective."
          : state.divider.status === "breached"
            ? "The fastest route destroyed the Divider and abandoned recovery."
            : "The immediate lock left active enemies and the Cache behind.";
  return {
    type,
    reason: type === "Gate Lost" ? "Gate Stability reached zero; other activity does not replace the location objective." : type === "Controlled Retreat" ? "The player left through the legitimate West Exit before compromise." : "The Gate was locked through the selected build's physical conversion.",
    objective: state.gate.locked ? "Gate locked" : type === "Gate Lost" ? "Gate lost" : "Gate unresolved",
    player: "Condition " + String(state.condition) + " · Protection " + String(state.protection),
    cache: state.cache.carried ? "Carried" : "Left behind",
    location: state.divider.status === "breached" ? "Divider destroyed" : "Divider intact",
    enemies: Object.values(state.enemies).map((enemy) => ({ name: enemy.name, status: enemy.status, condition: enemy.condition })),
    turningPoint,
    tradeoff,
  };
}

function resultType(state) {
  if (state.flags.retreated) return "Controlled Retreat";
  if (state.gate.stability <= 0) return "Gate Lost";
  if (!state.gate.locked) return null;
  if (state.cache.carried) return "Recovery Secure";
  if (["battle-hacking", "hacking-battle"].includes(state.buildId) && state.divider.status !== "breached") return "Clean Secure";
  return "Fast Secure";
}

function cycleHand(state) {
  const used = new Set(state.plan.map((step) => step.cardId).filter(Boolean));
  const hand = state.hand.filter((cardId) => !used.has(cardId));
  let deck = [...state.deck];
  const discard = [...state.discard, ...used];
  while (hand.length < CORE_RULES.openingHand && deck.length) hand.push(deck.shift());
  return { hand, deck, discard };
}

export function settleRound(state) {
  if (state.phase !== "settle") return state;
  const type = resultType(state);
  if (type) return { ...state, phase: "result", result: makeResult(state, type), response: null };

  const next = {
    ...state,
    ...cycleHand(state),
    phase: "planning",
    round: state.round + 1,
    warning: "",
    plan: [],
    response: null,
    resolution: null,
    flags: { ...state.flags, guarding: false, displacementBlocked: false },
  };
  for (const route of Object.values(next.routes)) {
    if (route.consumed || (route.expiresAfterRound && next.round > route.expiresAfterRound)) route.active = false;
  }
  next.gate.windowOpen = Object.values(next.routes).some((route) => route.active && !route.consumed);
  next.enemyIntent = makeEnemyIntent(next);
  return next;
}

export function getActiveRouteFocuses(state) {
  return Object.values(ROUTE_DEFINITIONS)
    .filter((route) => state.routes[route.id]?.active && !state.routes[route.id].consumed)
    .map((route) => route.focusId);
}

export function getPositionCoordinates(positionId) {
  const tile = BOARD_TILES[positionId];
  if (tile) return { x: tile.boardX, y: tile.boardY };
  const focus = BOARD_FOCUSES[positionId];
  if (focus) return { x: focus.x, y: focus.y };
  return { x: 50, y: 50 };
}

export function getActionDefinition(actionId) {
  return ACTIONS[actionId] ?? null;
}
