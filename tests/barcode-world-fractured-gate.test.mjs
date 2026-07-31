import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_TILES,
  BUILDS,
  CARDS,
  CORE_RULES,
  FRACTURED_GATE_SOURCE,
  RESULT_TYPES,
  actionSlotsUsed,
  advanceResolution,
  chooseResponse,
  createFracturedGateState,
  getActiveRouteFocuses,
  getContextActionGroups,
  getReachableTiles,
  lockPlan,
  movementRemaining,
  projectPlan,
  queueAction,
  queueMove,
  resetFracturedGate,
  settleRound,
} from "../src/lib/barcode-world/fractured-gate-engine.mjs";

const FIRST_TURNS = {
  "battle-exploration": {
    destination: "tile-5-6",
    actions: [["anchor", "cracked-divider"], ["shunt-ram", "ram"]],
    response: "intercept",
    route: "breach",
    turningPoint: "RAM's charge destroyed the Cracked Divider.",
  },
  "exploration-battle": {
    destination: "tile-5-3",
    actions: [["prepare-crossing", "upper-crossing"], ["take-cache", "field-cache"]],
    route: "upper",
    turningPoint: "The upper landing was prepared.",
  },
  "battle-hacking": {
    destination: "tile-5-6",
    actions: [["brace-contact", "ram"], ["hook-regulator", "ram"]],
    response: "suppress-stabilize",
    route: "maintenance",
    turningPoint: "RAM's exposed Stabilize response was suppressed.",
  },
  "hacking-battle": {
    destination: "tile-6-7",
    actions: [["reverse-track-feed", "powered-track"], ["drive-ram-track", "ram"]],
    route: "track",
    turningPoint: "JAMMER's own track pulse launched RAM west.",
  },
  "exploration-hacking": {
    destination: "tile-5-3",
    actions: [["map-relay-angle", "trace-relay"], ["redirect-broadcast", "trace"]],
    route: "signal",
    turningPoint: "JAMMER's broadcast became a Gate route.",
  },
  "hacking-exploration": {
    destination: "tile-7-7",
    actions: [["rewrite-rig-stabilize", "jammer"], ["intercept-ram", "ram"]],
    route: "rig",
    turningPoint: "JAMMER's vacated geometry preserved RAM contact.",
  },
};

function queue(state, actionId, targetId, cardId = null) {
  const before = state.plan.length;
  const next = queueAction(state, actionId, targetId, cardId);
  assert.equal(next.plan.length, before + 1, actionId + " should queue: " + next.warning);
  return next;
}

function resolve(state) {
  let next = state.phase === "planning" ? lockPlan(state) : state;
  if (next.phase === "response") next = chooseResponse(next, next.response.recommendedId);
  while (next.phase === "resolution") next = advanceResolution(next);
  assert.equal(next.phase, "settle");
  return next;
}

function completeFirstTurn(buildId) {
  const scenario = FIRST_TURNS[buildId];
  let state = createFracturedGateState(buildId);
  state = queueMove(state, scenario.destination);
  assert.equal(state.warning, "");
  for (const [actionId, targetId] of scenario.actions) state = queue(state, actionId, targetId);
  state = lockPlan(state);
  if (scenario.response) state = chooseResponse(state, scenario.response);
  while (state.phase === "resolution") state = advanceResolution(state);
  state = settleRound(state);
  assert.equal(state.phase, "planning");
  assert.equal(state.round, 2);
  return state;
}

function finishAtGate(buildId) {
  let state = completeFirstTurn(buildId);
  const routeFocus = getActiveRouteFocuses(state)[0];
  const routeChoice = getContextActionGroups(state, routeFocus)
    .flatMap((group) => group.choices)
    .find((choice) => choice.contextMove);
  assert.ok(routeChoice, buildId + " should expose its route move");
  state = queue(state, routeChoice.id, routeChoice.targetId, state.hand.includes("safe-landing") ? "safe-landing" : null);
  state = queue(state, "guard-position", "player");
  state = queue(state, "lock-now", "gate", state.hand.includes("objective-brace") ? "objective-brace" : null);
  state = settleRound(resolve(state));
  assert.equal(state.phase, "result");
  return state;
}

test("Breachflow locks the 62-space board, six builds, three enemies, six movement pips, and two actions", () => {
  assert.equal(FRACTURED_GATE_SOURCE, "BARCODE_WORLD_BATTLE_MODE_BREACHFLOW_OWNER_LOCK_2026-07-31");
  assert.equal(Object.keys(BOARD_TILES).length, 62);
  assert.equal(new Set(Object.values(BOARD_TILES).map((tile) => tile.x + "," + tile.y)).size, 62);
  assert.equal(BUILDS.length, 6);
  assert.equal(CORE_RULES.movementPips, 6);
  assert.equal(CORE_RULES.actionSlots, 2);
  assert.equal(CORE_RULES.openingHand, 5);
  assert.equal(CORE_RULES.deckSize, 12);
  assert.equal("commandStart" in CORE_RULES, false);
  assert.equal("commandCap" in CORE_RULES, false);

  for (const build of BUILDS) {
    const state = createFracturedGateState(build.id);
    assert.equal(state.hand.length, 5);
    assert.equal(state.deck.length, 7);
    assert.equal(new Set([...state.hand, ...state.deck]).size, 12);
    assert.deepEqual(state.hand, build.openingHand);
  }
  const state = createFracturedGateState();
  assert.deepEqual(Object.keys(state.enemies), ["ram", "trace", "jammer"]);
  assert.equal(state.enemyIntent.commitment.actor, "RAM");
  assert.equal(state.enemyIntent.support.actor, "JAMMER");
  assert.equal(state.enemyIntent.idle.actor, "TRACE");
  assert.match(state.enemyIntent.idle.text, /no hidden third action/i);
});

test("movement is direct, path-based, six-pip, and can split around two actions", () => {
  let state = createFracturedGateState();
  const initial = getReachableTiles(state);
  assert.equal(initial["tile-5-6"].cost, 3);
  assert.equal(initial["tile-5-3"].cost, 6);
  assert.equal(initial["tile-6-3"], undefined);
  state = queueMove(state, "tile-4-6");
  assert.equal(movementRemaining(state), 4);
  state = queue(state, "guard-position", "player");
  state = queueMove(state, "tile-5-6");
  assert.equal(movementRemaining(state), 3);
  state = queue(state, "field-rig", "player");
  assert.equal(actionSlotsUsed(state), 2);
  const blocked = queueAction(state, "strike", "ram");
  assert.equal(blocked.plan.length, state.plan.length);
  assert.match(blocked.warning, /Both action slots/);
});

test("board context stays bounded and exposes only the selected build's physical actions", () => {
  for (const build of BUILDS) {
    const state = createFracturedGateState(build.id);
    for (const focusId of ["player", "ram", "trace", "jammer", "cracked-divider", "upper-crossing", "powered-track", "trace-relay", "field-cache", "gate", "west-exit"]) {
      const groups = getContextActionGroups(state, focusId);
      assert.ok(groups.length <= 4, build.id + " " + focusId);
      assert.equal(new Set(groups.map((entry) => entry.parent)).size, groups.length);
    }
    const buildActions = ["ram", "trace", "jammer", "cracked-divider", "upper-crossing", "powered-track", "trace-relay"]
      .flatMap((focusId) => getContextActionGroups(state, focusId))
      .flatMap((entry) => entry.choices)
      .filter((choice) => choice.buildId)
      .map((choice) => choice.id);
    assert.ok(buildActions.every((id) => build.signatureActionIds.includes(id)));
  }
});

test("Preview and locked resolution use the same deterministic signature", () => {
  let first = createFracturedGateState("battle-exploration");
  first = queueMove(first, "tile-5-6");
  first = queue(first, "anchor", "cracked-divider");
  first = queue(first, "shunt-ram", "ram", "brace-through");
  let second = createFracturedGateState("battle-exploration");
  second = queueMove(second, "tile-5-6");
  second = queue(second, "anchor", "cracked-divider");
  second = queue(second, "shunt-ram", "ram", "brace-through");
  assert.equal(projectPlan(first).signature, projectPlan(second).signature);
  assert.equal(projectPlan(first).response.recommendedId, "intercept");
  let locked = chooseResponse(lockPlan(first), "intercept");
  assert.equal(locked.resolution.signature, projectPlan(first).signature);
  while (locked.phase === "resolution") locked = advanceResolution(locked);
  assert.equal(locked.divider.status, "breached");
  assert.equal(locked.gate.stability, 3);
  assert.equal(locked.enemies.ram.status, "staggered");
  assert.equal(locked.protection, 3);
});

test("Battle → Exploration's Response preserves a real sacrifice", () => {
  let state = createFracturedGateState("battle-exploration");
  state = queueMove(state, "tile-5-6");
  state = queue(state, "anchor", "cracked-divider");
  state = queue(state, "shunt-ram", "ram");
  state = lockPlan(state);
  assert.deepEqual(state.response.options.map((option) => option.id), ["intercept", "let-land"]);
  let intercept = chooseResponse(state, "intercept");
  while (intercept.phase === "resolution") intercept = advanceResolution(intercept);
  assert.equal(intercept.gate.stability, 3);
  assert.equal(intercept.routes.breach.active, true);
  assert.ok(intercept.protection < CORE_RULES.protection);
  let letLand = chooseResponse(state, "let-land");
  while (letLand.phase === "resolution") letLand = advanceResolution(letLand);
  assert.equal(letLand.gate.stability, 2);
  assert.equal(letLand.divider.status, "cracked");
  assert.equal(letLand.routes.breach.active, false);
});

test("all six builds create different source-bound routes", () => {
  const routes = new Set();
  for (const build of BUILDS) {
    const state = completeFirstTurn(build.id);
    const scenario = FIRST_TURNS[build.id];
    assert.equal(state.routes[scenario.route].active, true);
    assert.equal(state.routes[scenario.route].consumed, false);
    assert.equal(state.flags.turningPoint, scenario.turningPoint);
    routes.add(scenario.route);
  }
  assert.equal(routes.size, 6);
});

test("Hacking → Exploration requires JAMMER to move and never fabricates geometry", () => {
  let state = createFracturedGateState("hacking-exploration");
  state = queueMove(state, "tile-7-7");
  state.enemies.jammer.status = "disabled";
  const rewrite = getContextActionGroups(state, "jammer").flatMap((group) => group.choices).find((choice) => choice.id === "rewrite-rig-stabilize");
  assert.equal(rewrite.legal, false);
  assert.match(rewrite.reason, /not a live source/);

  state = createFracturedGateState("hacking-exploration");
  state = queueMove(state, "tile-7-7");
  state = queue(state, "rewrite-rig-stabilize", "jammer");
  state = queue(state, "intercept-ram", "ram");
  state = resolve(state);
  assert.equal(state.flags.rigMoved, true);
  assert.equal(state.enemies.jammer.position, "tile-11-7");
  assert.equal(state.routes.rig.active, true);
  assert.equal(state.enemies.ram.status, "staggered");
});

test("the six build routes produce the approved secure families", () => {
  const expected = {
    "battle-exploration": "Fast Secure",
    "exploration-battle": "Recovery Secure",
    "battle-hacking": "Clean Secure",
    "hacking-battle": "Clean Secure",
    "exploration-hacking": "Fast Secure",
    "hacking-exploration": "Fast Secure",
  };
  for (const build of BUILDS) {
    const result = finishAtGate(build.id);
    assert.equal(result.result.type, expected[build.id]);
    assert.equal(result.gate.locked, true);
    assert.ok(result.result.turningPoint);
    assert.ok(result.result.tradeoff);
    assert.equal(result.result.enemies.length, 3);
  }
});

test("Gate Lost and Controlled Retreat remain honest objective results", () => {
  let lost = createFracturedGateState();
  for (let turn = 0; turn < 3; turn += 1) lost = settleRound(resolve(lost));
  assert.equal(lost.phase, "result");
  assert.equal(lost.result.type, "Gate Lost");
  assert.equal(lost.gate.stability, 0);
  assert.match(lost.result.reason, /does not replace the location objective/);

  let retreat = createFracturedGateState();
  retreat = queue(retreat, "leave", "west-exit");
  retreat = settleRound(resolve(retreat));
  assert.equal(retreat.result.type, "Controlled Retreat");
  assert.equal(retreat.position, "tile-1-6");
  assert.equal(retreat.gate.locked, false);
  assert.match(retreat.result.tradeoff, /Gate and active enemies remain unresolved/);
  assert.deepEqual([
    finishAtGate("battle-exploration").result.type,
    finishAtGate("battle-hacking").result.type,
    finishAtGate("exploration-battle").result.type,
    lost.result.type,
    retreat.result.type,
  ], RESULT_TYPES);
});

test("cards have no arithmetic cost, stay optional, and cycle deterministically", () => {
  assert.ok(Object.values(CARDS).every((card) => !("cost" in card)));
  let state = createFracturedGateState("battle-exploration");
  state = queueMove(state, "tile-5-6");
  state = queue(state, "anchor", "cracked-divider");
  state = queue(state, "shunt-ram", "ram", "brace-through");
  state = settleRound(resolve(state));
  assert.equal(state.hand.length, 5);
  assert.equal(state.hand.includes("brace-through"), false);
  assert.equal(state.discard.includes("brace-through"), true);
  assert.equal(state.deck.length, 6);
});

test("invalidated attacks and enemy actions never retarget", () => {
  let state = createFracturedGateState();
  state = queueMove(state, "tile-5-6");
  state.enemies.ram.guard = 0;
  state.enemies.ram.condition = 4;
  const untouched = { trace: state.enemies.trace.condition, jammer: state.enemies.jammer.condition };
  state = queue(state, "strike", "ram");
  state = queue(state, "strike", "ram");
  state = resolve(state);
  assert.equal(state.enemies.ram.status, "disabled");
  assert.equal(state.gate.stability, 3);
  assert.deepEqual({ trace: state.enemies.trace.condition, jammer: state.enemies.jammer.condition }, untouched);
  assert.ok(state.review.some((event) => event.title === "Strike invalidated" && /No retarget occurred/.test(event.detail)));
  assert.ok(state.review.some((event) => event.title === "RAM the Gate invalidated" && /No other enemy inherits it/.test(event.detail)));
});

test("reset restores the exact selected build and deterministic opening", () => {
  let state = completeFirstTurn("exploration-hacking");
  state = resetFracturedGate(state);
  assert.deepEqual(state, createFracturedGateState("exploration-hacking"));
});
