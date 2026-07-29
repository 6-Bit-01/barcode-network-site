import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_FOCUSES,
  BOARD_TILES,
  BUILDS,
  CARDS,
  CORE_RULES,
  ENEMY_CARDS,
  FRACTURED_GATE_ACTIONS,
  FRACTURED_GATE_SOURCE,
  RESULT_TYPES,
  advanceEnemyTurn,
  availableCommand,
  availableEnemyCommand,
  beginEnemyTurn,
  changeFracturedGateBuild,
  createFracturedGateState,
  discardToRetain,
  displaySnapshot,
  getAvailableContextCards,
  getCompatibleCards,
  getFocusGuidance,
  getMissionGuidance,
  getReachableTiles,
  getResponseOptions,
  performAction,
  previewAction,
  refocusCards,
  resetFracturedGate,
  resolveEnemyAction,
  tempoComparisonForRoute,
} from "../src/lib/barcode-world/fractured-gate-engine.mjs";

const BUILD_IDS = [
  "battle-exploration",
  "exploration-battle",
  "battle-hacking",
  "hacking-battle",
  "exploration-hacking",
  "hacking-exploration",
];

function finishEnemyTurn(state, chooseResponse = () => null) {
  let next = state.phase === "player" ? beginEnemyTurn(state) : state;
  for (let step = 0; step < 30 && next.phase === "enemy"; step += 1) {
    next = next.pendingEnemyAction
      ? resolveEnemyAction(next, chooseResponse(next))
      : advanceEnemyTurn(next);
  }
  assert.notEqual(next.phase, "enemy", "enemy turn must terminate");
  return next;
}

function discardDown(state) {
  let next = state;
  while (next.phase === "discard") {
    next = discardToRetain(next, next.hand.at(-1));
  }
  return next;
}

test("the owner-revised alternating-turn contract keeps Command, local Tempo, and all six builds", () => {
  assert.equal(
    FRACTURED_GATE_SOURCE,
    "BARCODE_WORLD_FRACTURED_GATE_ALTERNATING_TURN_OWNER_REVISION_2026-07-28",
  );
  assert.deepEqual(
    BUILDS.map((build) => build.id),
    BUILD_IDS,
  );
  assert.equal(CORE_RULES.commandStart, 16);
  assert.equal(CORE_RULES.commandIncome, 16);
  assert.equal(CORE_RULES.commandCap, 32);
  assert.equal(CORE_RULES.noPaidActionLimit, true);
  assert.equal("paidActionCap" in CORE_RULES, false);
  assert.equal("boardTileCount" in CORE_RULES, false);
  assert.equal(CORE_RULES.openingHand, 5);
  assert.equal(CORE_RULES.drawPerTurn, 2);
  assert.equal(CORE_RULES.retainLimit, 7);

  const movementValues = new Set(BUILDS.map((build) => build.movement));
  assert.ok(
    movementValues.size > 1,
    "movement is derived from the ordered build, not one universal value",
  );

  for (const build of BUILDS) {
    const state = createFracturedGateState(build.id);
    assert.equal(state.phase, "player");
    assert.equal(state.command, 16);
    assert.equal(state.enemyCommand, 16);
    assert.equal(state.movementMax, build.movement);
    assert.equal(state.deck.length, CORE_RULES.deckSize);
    assert.equal(new Set(state.deck).size, CORE_RULES.deckSize);
    assert.equal(state.hand.length, CORE_RULES.openingHand);
    assert.ok(
      state.hand.every((cardId) => !CARDS[cardId].partyOnly),
      `${build.id} opening hand remains solo-safe`,
    );
  }

  const enemies = createFracturedGateState().enemies;
  assert.deepEqual(Object.keys(enemies), [
    "breacher",
    "guard",
    "controller",
    "pressure",
  ]);
  for (const enemy of Object.values(enemies)) {
    assert.equal(enemy.deck.length, 12);
    assert.equal(new Set(enemy.deck).size, 12);
    assert.equal(enemy.hand.length, 5);
    assert.ok(enemy.hand.every((cardId) => ENEMY_CARDS[cardId]));
  }
});

test("the battlefield is a filled continuous diamond floor with only a physical broken span", () => {
  const tiles = Object.values(BOARD_TILES);
  const coordinateKeys = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  assert.equal(coordinateKeys.size, tiles.length);
  assert.ok(tiles.length > 100, "the physical arena is densely tiled");

  const byRow = new Map();
  for (const tile of tiles) {
    const row = byRow.get(tile.y) ?? [];
    row.push(tile.x);
    byRow.set(tile.y, row);
    assert.ok(tile.boardX >= 0 && tile.boardX <= 100);
    assert.ok(tile.boardY >= 0 && tile.boardY <= 100);
  }
  for (const [y, xs] of byRow) {
    xs.sort((left, right) => left - right);
    const gaps = xs
      .slice(1)
      .map((x, index) => [xs[index], x])
      .filter(([left, right]) => right - left > 1);
    if (y <= 3) {
      assert.deepEqual(gaps, [[7, 9]], `upper row ${y} has the real span`);
    } else {
      assert.deepEqual(gaps, [], `floor row ${y} is edge-filled`);
    }
  }

  const queue = [tiles[0].id];
  const visited = new Set(queue);
  while (queue.length) {
    const current = BOARD_TILES[queue.shift()];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const neighbor = `tile-${current.x + dx}-${current.y + dy}`;
      if (BOARD_TILES[neighbor] && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  assert.equal(
    visited.size,
    tiles.length,
    "all floor diamonds belong to one connected battlefield",
  );

  const opening = createFracturedGateState();
  assert.equal(
    previewAction(opening, "attack", "breacher").legal,
    false,
    "the player cannot attack the Breacher from spawn",
  );
  assert.equal(
    BOARD_FOCUSES.gate.tileId in getReachableTiles(opening),
    false,
    "the Gate is not reachable from spawn",
  );
});

test("the encounter explains its mission, threats, objects, and immediate next step", () => {
  const opening = createFracturedGateState("battle-exploration");
  const mission = getMissionGuidance(opening);
  assert.match(mission.objective, /Stabilize the Gate/);
  assert.match(mission.win, /Enemy Turn/);
  assert.match(mission.lose, /0|defeated/);
  assert.match(mission.nextTitle, /GATE marker/);
  assert.equal(mission.source.focusId, "cracked-divider");
  assert.match(mission.nextText, /optional build opportunity/);

  const controller = getFocusGuidance(opening, "controller");
  assert.match(controller.typeLabel, /ENEMY UNIT/);
  assert.match(controller.what, /not an object or control panel/);
  assert.match(controller.why, /interrupt Slow Gate Work/);
  assert.match(controller.how, /Attack or Scan/);

  const gate = getFocusGuidance(opening, "gate");
  assert.equal(gate.typeLabel, "PRIMARY OBJECTIVE");
  assert.match(gate.how, /select the Gate.+Stabilize Gate.+Enemy Turn/);
  assert.match(gate.risk, /Controller can interrupt/);

  const bollard = getFocusGuidance(opening, "defensive-bollard");
  assert.match(bollard.how, /Do not click the Bollard to fire it/);

  const divider = getFocusGuidance(opening, "cracked-divider");
  assert.match(divider.typeLabel, /YOUR BUILD SOURCE/);
  assert.match(divider.how, /Breacher/);

  const ready = structuredClone(opening);
  ready.player.position = "tile-14-5";
  assert.match(
    getMissionGuidance(ready).nextTitle,
    /position to start the objective/,
  );

  const working = performAction(ready, "stabilize-gate", "gate");
  assert.match(getMissionGuidance(working).nextTitle, /prepare for interruption/);
});

test("movement is skill-based, free, connected, and splittable around paid actions", () => {
  let state = createFracturedGateState("battle-exploration");
  const openingCommand = state.command;
  const firstMove = previewAction(state, "move", "tile-4-6");
  assert.equal(firstMove.legal, true);
  assert.deepEqual(firstMove.path, ["tile-2-6", "tile-3-6", "tile-4-6"]);
  assert.equal(firstMove.movementCost, 2);

  state = performAction(state, "move", "tile-4-6");
  assert.equal(state.command, openingCommand);
  assert.equal(state.movementRemaining, state.movementMax - 2);
  assert.deepEqual(getAvailableContextCards(state, "attack"), [
    "follow-through",
  ]);

  state = performAction(state, "guard", "player");
  assert.equal(state.command, openingCommand - 4);
  assert.equal(state.movementRemaining, state.movementMax - 2);

  state = performAction(state, "move", "tile-5-6");
  assert.equal(state.command, openingCommand - 4);
  assert.equal(state.player.position, "tile-5-6");
  assert.equal(state.movementRemaining, state.movementMax - 3);
});

test("a banked 32-Command turn supports more than four legal expenditures", () => {
  let state = createFracturedGateState("hacking-battle");
  state = finishEnemyTurn(state);
  assert.equal(state.phase, "player");
  assert.equal(availableCommand(state), 32);

  const logStart = state.log.length;
  for (const enemyId of [
    "breacher",
    "guard",
    "controller",
    "pressure",
  ]) {
    state = performAction(state, "scan-intent", enemyId);
    assert.equal(state.warning, "");
  }
  state = performAction(state, "guard", "player");
  assert.equal(state.warning, "");
  state = refocusCards(state, [state.hand[0]]);
  assert.equal(state.warning, "");

  assert.equal(state.command, 8);
  assert.equal(
    state.log
      .slice(logStart)
      .filter((entry) => entry.side === "player").length,
    6,
  );
  assert.equal("paidActions" in state, false);
});

test("enemy intent remains hidden until action start and adapts to the final board", () => {
  const baseline = createFracturedGateState();
  assert.equal(baseline.currentEnemyReveal, null);
  assert.equal(baseline.pendingEnemyAction, null);
  assert.deepEqual(baseline.revealedIntel, {});

  const evaluating = beginEnemyTurn(baseline);
  assert.equal(evaluating.currentEnemyReveal, null);
  assert.equal(evaluating.pendingEnemyAction, null);

  const baselineAction = advanceEnemyTurn(evaluating);
  assert.equal(baselineAction.currentEnemyReveal.id, "guard-cover");
  assert.equal(baselineAction.currentEnemyReveal.actorId, "guard");
  assert.ok(Array.isArray(baselineAction.currentEnemyReveal.path));

  const changedBoard = createFracturedGateState("hacking-battle");
  changedBoard.actuator.controlled = true;
  const adaptiveAction = advanceEnemyTurn(beginEnemyTurn(changedBoard));
  assert.equal(adaptiveAction.currentEnemyReveal.id, "controller-purge");
  assert.equal(adaptiveAction.currentEnemyReveal.actorId, "controller");
  assert.notEqual(
    adaptiveAction.currentEnemyReveal.id,
    baselineAction.currentEnemyReveal.id,
  );
});

test("multiple enemies act through one shared visible Command pool", () => {
  const initial = createFracturedGateState();
  const completed = finishEnemyTurn(initial);
  const enemyEvents = completed.log.filter((entry) => entry.side === "enemy");

  assert.deepEqual(
    enemyEvents.map((entry) => entry.title),
    ["Shield Link established", "Breacher advanced"],
  );
  assert.equal(completed.enemyCommand, 4);
  assert.equal(availableEnemyCommand(completed), 4);
  assert.equal(completed.turn, 2);
  assert.equal(completed.command, 32);
});

test("off-turn Response spends banked Command and local Tempo controls order", () => {
  let state = createFracturedGateState("battle-exploration");
  state.player.position = "tile-9-5";
  state = advanceEnemyTurn(beginEnemyTurn(state));
  assert.equal(state.pendingEnemyAction.id, "breacher-strike");
  assert.equal(state.currentEnemyReveal.targetId, "player");

  const options = getResponseOptions(state);
  assert.ok(options.some((option) => option.id === "fallback-guard"));
  const responded = resolveEnemyAction(state, "fallback-guard");
  assert.equal(responded.command, 12);
  assert.equal(responded.player.condition, 11);
  assert.equal(responded.lastExchange.relation, "player-first");
  assert.match(
    responded.lastExchange.summary,
    /^5 Guard established.+5 Guard absorbed;/,
  );
  assert.equal(responded.lastClash.title, "CLASH");
});

test("Tempo compares only at a local collision and preserves route causality", () => {
  assert.equal(
    tempoComparisonForRoute("clear", "east", 5, 6).relation,
    "simultaneous",
  );
  assert.equal(
    tempoComparisonForRoute("rubble", "east", 5, 6).relation,
    "enemy-first",
  );
  assert.equal(
    tempoComparisonForRoute("powered", "east", 5, 6).relation,
    "player-first",
  );
  assert.equal(
    tempoComparisonForRoute("powered", "west", 5, 6).relation,
    "enemy-first",
  );

  let state = createFracturedGateState("battle-hacking");
  state.player.position = "tile-9-5";
  const preview = previewAction(
    state,
    "expose-regulator",
    "breacher",
    "brace-through",
  );
  assert.equal(preview.legal, true);
  assert.equal(preview.tempo.unknownFactors, 1);
  assert.match(preview.risks[0], /concealed legal enemy response/);

  state = performAction(
    state,
    "expose-regulator",
    "breacher",
    "brace-through",
  );
  assert.equal(state.lastExchange.actionTempo, "Standard 6");
  assert.equal(state.lastExchange.response, "Impact Counter");
  assert.equal(state.lastExchange.relation, "player-first");
  assert.equal(state.lastClash.participants, "Player × Breacher");
});

test("cards expose Action, Modifier, Response, and Context roles", () => {
  assert.equal(CARDS["field-patch"].role, "Action");
  assert.equal(CARDS["brace-through"].role, "Modifier");
  assert.equal(CARDS["fallback-guard"].role, "Response");
  assert.equal(CARDS["follow-through"].role, "Context");
  assert.ok(
    getCompatibleCards(
      createFracturedGateState("battle-exploration"),
      "break-divider",
    ).includes("brace-through"),
  );
  assert.equal(CARDS["follow-through"].context, true);
});

test("each ordered build has a physical source-to-effect chain", () => {
  const scenarios = [
    {
      build: "battle-exploration",
      position: "tile-11-4",
      actions: [["break-divider", "cracked-divider"]],
      verify: (state) => state.divider.status === "breached",
    },
    {
      build: "exploration-battle",
      position: "tile-6-2",
      actions: [["prepare-upper-crossing", "upper-crossing"]],
      verify: (state) =>
        state.upperCrossing.prepared && state.upperCrossing.protected,
    },
    {
      build: "battle-hacking",
      position: "tile-9-5",
      actions: [
        ["expose-regulator", "breacher"],
        ["suppress-reset", "breacher"],
      ],
      verify: (state) => state.revealedIntel.regulatorSuppressed,
    },
    {
      build: "hacking-battle",
      position: "tile-9-8",
      actions: [
        ["establish-actuator", "gate-actuator"],
        ["bollard-output", "guard"],
      ],
      verify: (state) =>
        state.actuator.spent && state.enemies.guard.status === "pinned",
    },
    {
      build: "exploration-hacking",
      position: "tile-8-10",
      actions: [
        ["prepare-service-gap", "service-gap"],
        ["suppress-shutter", "service-gap"],
      ],
      verify: (state) => state.serviceGap.shutter === "open",
    },
    {
      build: "hacking-exploration",
      position: "tile-5-10",
      actions: [
        ["align-lift", "lift-relay"],
        ["deploy-lift", "lift-relay"],
      ],
      verify: (state) => state.lift.deployed,
    },
  ];

  for (const scenario of scenarios) {
    let state = createFracturedGateState(scenario.build);
    state.player.position = scenario.position;
    state.enemyCommand = 0;
    for (const [actionId, targetId] of scenario.actions) {
      state = performAction(state, actionId, targetId);
      assert.equal(
        state.warning,
        "",
        `${scenario.build} should execute ${actionId}`,
      );
    }
    assert.equal(scenario.verify(state), true, scenario.build);
  }
});

test("Slow Gate Work survives an Enemy Turn or is directly interrupted", () => {
  let turnTwo = finishEnemyTurn(
    createFracturedGateState("battle-exploration"),
  );
  turnTwo = discardDown(turnTwo);
  assert.ok(turnTwo.enemies.controller.hand.includes("static-tax"));
  turnTwo.player.position = "tile-14-5";

  let unprotected = performAction(
    structuredClone(turnTwo),
    "stabilize-gate",
    "gate",
  );
  assert.equal(unprotected.phase, "player");
  assert.equal(unprotected.gate.status, "working");
  assert.equal(unprotected.result, null);
  unprotected = advanceEnemyTurn(beginEnemyTurn(unprotected));
  assert.equal(unprotected.currentEnemyReveal.id, "controller-static-tax");
  assert.equal(unprotected.gate.status, "unstable");
  assert.equal(unprotected.gate.work, null);

  let protectedWork = performAction(
    structuredClone(turnTwo),
    "stabilize-gate",
    "gate",
    "objective-brace",
  );
  assert.equal(protectedWork.gate.work.protected, true);
  protectedWork = finishEnemyTurn(protectedWork);
  assert.equal(protectedWork.phase, "result");
  assert.equal(protectedWork.gate.status, "stabilized");
  assert.match(protectedWork.result.cause, /survived the Enemy Turn/);
});

test("retreat and deterministic reset remain immediate and battle-local", () => {
  const initial = createFracturedGateState(
    "exploration-hacking",
    "FG-RESET-17",
  );
  const retreated = performAction(initial, "leave", "west-exit");
  assert.equal(retreated.phase, "result");
  assert.equal(retreated.result.title, "Controlled Retreat");
  assert.ok(RESULT_TYPES.includes(retreated.result.title));

  const reset = resetFracturedGate(retreated);
  assert.equal(reset.seed, "FG-RESET-17");
  assert.equal(reset.buildId, "exploration-hacking");
  assert.equal(reset.phase, "player");
  assert.equal(reset.result, null);
  assert.deepEqual(
    displaySnapshot(reset),
    displaySnapshot(
      createFracturedGateState("exploration-hacking", "FG-RESET-17"),
    ),
  );

  const changed = changeFracturedGateBuild(reset, "hacking-exploration");
  assert.equal(changed.buildId, "hacking-exploration");
  assert.equal(changed.seed, "FG-RESET-17");
});

test("identical seeds and choices produce identical adaptive turns", () => {
  const left = finishEnemyTurn(
    createFracturedGateState("battle-exploration", "FG-DETERMINISTIC"),
  );
  const right = finishEnemyTurn(
    createFracturedGateState("battle-exploration", "FG-DETERMINISTIC"),
  );
  assert.deepEqual(left, right);
  assert.equal(availableEnemyCommand(left), availableEnemyCommand(right));
  assert.equal(
    FRACTURED_GATE_ACTIONS["stabilize-gate"].band,
    "Slow",
  );
});
