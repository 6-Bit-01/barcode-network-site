import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_TILES,
  BUILDS,
  CARDS,
  CORE_RULES,
  ENEMY_CARDS,
  FRACTURED_GATE_ACTIONS,
  FRACTURED_GATE_SOURCE,
  RESULT_TYPES,
  advanceResolution,
  availableCommand,
  availableEnemyCommand,
  createFracturedGateState,
  discardToRetain,
  displaySnapshot,
  getAvailableContextCards,
  getCompatibleCards,
  getContextActionGroups,
  paidActionCount,
  passPriority,
  pivotOpenAction,
  projectPlan,
  queueAction,
  refocusCards,
  removePlanAction,
  resetFracturedGate,
  settleRound,
  tempoComparisonForRoute,
} from "../src/lib/barcode-world/fractured-gate-engine.mjs";

const EXPECTED_OPENING_HANDS = {
  "battle-exploration": [
    "fallback-guard",
    "objective-brace",
    "brace-through",
    "hold-the-edge",
    "safe-landing",
  ],
  "exploration-battle": [
    "fallback-guard",
    "objective-brace",
    "safe-landing",
    "destination-claim",
    "brace-through",
  ],
  "battle-hacking": [
    "fallback-guard",
    "objective-brace",
    "brace-through",
    "hold-the-edge",
    "clean-buffer",
  ],
  "hacking-battle": [
    "fallback-guard",
    "objective-brace",
    "clean-buffer",
    "quiet-rewrite",
    "brace-through",
  ],
  "exploration-hacking": [
    "fallback-guard",
    "objective-brace",
    "safe-landing",
    "destination-claim",
    "clean-buffer",
  ],
  "hacking-exploration": [
    "fallback-guard",
    "objective-brace",
    "clean-buffer",
    "quiet-rewrite",
    "safe-landing",
  ],
};

function queue(state, actionId, targetId, cardId = null) {
  const before = state.plan.length;
  const next = queueAction(state, actionId, targetId, cardId);
  assert.equal(
    next.plan.length,
    before + 1,
    `${actionId} should queue: ${next.warning}`,
  );
  return next;
}

function passToLock(state) {
  let next = state;
  for (let count = 0; count < 12 && next.phase === "planning"; count += 1) {
    next = passPriority(next);
  }
  assert.equal(next.phase, "resolution", next.warning);
  return next;
}

function resolveToSettle(state) {
  let next = state.phase === "planning" ? passToLock(state) : state;
  for (let count = 0; count < 8 && next.phase === "resolution"; count += 1) {
    next = advanceResolution(next);
  }
  assert.equal(next.phase, "settle");
  return next;
}

function retainSeven(state, preserve = []) {
  let next = state;
  while (next.phase === "planning" && next.hand.length > CORE_RULES.retainLimit) {
    const discard = [...next.hand]
      .reverse()
      .find((cardId) => !preserve.includes(cardId));
    assert.ok(discard, "a discardable card should remain");
    next = discardToRetain(next, discard);
  }
  return next;
}

function battleExplorationCycleOne() {
  let state = createFracturedGateState("battle-exploration");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-5-6");
  assert.deepEqual(getAvailableContextCards(state, "answer-divider"), [
    "follow-through",
  ]);
  state = queue(
    state,
    "answer-divider",
    "cracked-divider",
    "follow-through",
  );
  return state;
}

function settledCycleOne() {
  return resolveToSettle(battleExplorationCycleOne());
}

function battleExplorationCycleTwo() {
  let state = settleRound(settledCycleOne());
  state = queue(state, "cross-breach", "tile-10-5");
  state = queue(state, "stabilize-gate", "gate");
  state = pivotOpenAction(
    state,
    "angle-clash",
    "defensive-bollard",
  );
  assert.equal(state.warning, "");
  return state;
}

function settledCycleTwo() {
  return resolveToSettle(battleExplorationCycleTwo());
}

function fastSecureResult() {
  let state = settleRound(settledCycleTwo());
  state = retainSeven(state, ["objective-brace"]);
  state = queue(state, "guard-gate", "gate");
  state = queue(
    state,
    "stabilize-gate",
    "gate",
    "objective-brace",
  );
  state = resolveToSettle(state);
  return settleRound(state);
}

test("revised checkpoint, 62-tile board, six builds, and shared squad economy are locked", () => {
  assert.equal(
    FRACTURED_GATE_SOURCE,
    "BARCODE_WORLD_BATTLE_MODE_FRACTURED_GATE_REVISED_ENCOUNTER_CHECKPOINT_2026-07-27",
  );
  assert.equal(Object.keys(BOARD_TILES).length, 62);
  assert.equal(
    new Set(
      Object.values(BOARD_TILES).map((tile) => `${tile.x},${tile.y}`),
    ).size,
    62,
  );
  assert.deepEqual(
    BUILDS.map((build) => build.id),
    Object.keys(EXPECTED_OPENING_HANDS),
  );

  for (const build of BUILDS) {
    const state = createFracturedGateState(build.id);
    assert.equal(state.deck.length, 12, `${build.id} player deck`);
    assert.equal(new Set(state.deck).size, 12, `${build.id} unique player deck`);
    assert.deepEqual(state.hand, EXPECTED_OPENING_HANDS[build.id]);
    assert.equal(
      state.hand.some((cardId) => CARDS[cardId].partyOnly),
      false,
      `${build.id} opening is solo-safe`,
    );
  }

  const state = createFracturedGateState();
  assert.deepEqual(Object.keys(state.enemies), [
    "breacher",
    "guard",
    "controller",
    "pressure",
  ]);
  for (const enemy of Object.values(state.enemies)) {
    assert.equal(enemy.deck.length, 12, `${enemy.name} deck`);
    assert.equal(new Set(enemy.deck).size, 12, `${enemy.name} unique deck`);
    assert.equal(enemy.hand.length, 5, `${enemy.name} opening hand`);
    assert.ok(enemy.hand.every((cardId) => ENEMY_CARDS[cardId]));
  }
  assert.equal(state.enemyCommand, 16);
  assert.equal(availableEnemyCommand(state), 4);
  assert.deepEqual(
    state.enemyPlan.map((action) => action.id),
    ["impact-rush"],
  );
  assert.equal(state.enemyPlan[0].totalCost, 12);

  assert.equal(CORE_RULES.commandStart, 16);
  assert.equal(CORE_RULES.commandIncome, 16);
  assert.equal(CORE_RULES.commandCap, 32);
  assert.equal(CORE_RULES.paidActionCap, 4);
  assert.equal(CORE_RULES.ordinaryRepositionPerPhase, 1);
  assert.equal(CORE_RULES.openingHand, 5);
  assert.equal(CORE_RULES.drawPerSettle, 2);
  assert.equal(CORE_RULES.retainLimit, 7);
});

test("board-first context stays bounded and spatial legality blocks remote attacks and contact", () => {
  const state = createFracturedGateState("battle-exploration");
  for (const tile of Object.values(BOARD_TILES)) {
    assert.ok(
      tile.boardX >= 9 && tile.boardX <= 92,
      `${tile.id} horizontal bounds`,
    );
    assert.ok(
      tile.boardY >= 17 && tile.boardY <= 82,
      `${tile.id} vertical bounds`,
    );
  }
  assert.notEqual(
    BOARD_TILES["tile-4-2"].boardX,
    BOARD_TILES["tile-4-3"].boardX,
    "adjacent rows should be visibly staggered",
  );

  for (const focusId of [
    "player",
    "breacher",
    "cracked-divider",
    "gate-actuator",
    "gate",
    "field-cache",
    "west-exit",
    "tile-3-6",
  ]) {
    const groups = getContextActionGroups(state, focusId);
    assert.ok(groups.length <= 4, focusId);
    assert.equal(new Set(groups.map((group) => group.parent)).size, groups.length);
  }

  const playerMove = getContextActionGroups(state, "player").find(
    (group) => group.parent === "Move",
  );
  assert.ok(
    playerMove,
    "selecting the player should expose action-first movement",
  );
  assert.deepEqual(
    playerMove.choices.map((choice) => choice.id),
    ["reposition", "advance"],
  );
  assert.deepEqual(playerMove.choices[0].legalTargets.sort(), [
    "tile-1-6",
    "tile-3-6",
  ]);
  assert.ok(
    playerMove.choices[1].legalTargets.includes("tile-5-6"),
    "paid Advance should expose every reachable destination before tile probing",
  );

  const remoteAttack = getContextActionGroups(state, "breacher")
    .find((group) => group.parent === "Attack")
    .choices[0];
  assert.equal(remoteAttack.legal, false);
  assert.match(remoteAttack.reason, /within two tactical tiles/);

  const remoteAnswer = getContextActionGroups(state, "cracked-divider")
    .find((group) => group.parent === "Discipline")
    .choices[0];
  assert.equal(remoteAnswer.legal, false);
  assert.match(remoteAnswer.reason, /Approach within two tactical tiles/);

  const tileMove = getContextActionGroups(state, "tile-3-6")
    .find((group) => group.parent === "Move");
  assert.deepEqual(
    tileMove.choices.map((choice) => choice.id),
    ["reposition", "advance"],
  );
  assert.deepEqual(tileMove.choices[0].legalTargets, ["tile-3-6"]);
});

test("Tempo distinguishes clear, rubble, and powered routes without changing Command", () => {
  assert.deepEqual(
    tempoComparisonForRoute("clear"),
    {
      route: "clear",
      player: 6,
      enemy: 6,
      outcome: "simultaneous",
      link: "Preserved",
      reason: "The clear approach preserves Follow Through.",
    },
  );
  assert.deepEqual(
    tempoComparisonForRoute("rubble"),
    {
      route: "rubble",
      player: 4,
      enemy: 6,
      outcome: "enemy_first",
      link: "Broken",
      reason: "Rubble breaks the movement-to-contact link.",
    },
  );
  assert.deepEqual(
    tempoComparisonForRoute("powered", "toward-divider"),
    {
      route: "powered",
      player: 7,
      enemy: 6,
      outcome: "player_first",
      link: "Accelerated",
      reason:
        "The powered service track carries momentum toward contact.",
    },
  );
  assert.equal(createFracturedGateState().command, 16);
});

test("Follow Through is source-bound, appears only after a clear approach, and does not leak enemy cards", () => {
  let state = createFracturedGateState();
  assert.deepEqual(getAvailableContextCards(state, "answer-divider"), []);
  assert.equal(state.hand.includes("follow-through"), false);

  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-5-6");
  assert.deepEqual(getAvailableContextCards(state, "answer-divider"), [
    "follow-through",
  ]);
  assert.ok(
    getCompatibleCards(state, "answer-divider").includes("follow-through"),
  );
  state = queue(
    state,
    "answer-divider",
    "cracked-divider",
    "follow-through",
  );
  assert.equal(availableCommand(state), 4);

  const projection = projectPlan(state);
  assert.equal(projection.contact.timing, "Likely even");
  assert.equal(projection.contact.link, "Preserved");
  const playerFacingPreview = JSON.stringify({
    expected: projection.expected,
    risk: projection.risk,
    contact: projection.contact,
  });
  assert.doesNotMatch(
    playerFacingPreview,
    /Driving Ram|Impact Counter|Shield Link/,
  );
  assert.match(playerFacingPreview, /concealed/);
});

test("Preview and resolution share one deterministic simulation while Clash remains a reveal payoff", () => {
  const first = battleExplorationCycleOne();
  const second = battleExplorationCycleOne();
  const firstProjection = projectPlan(first);
  const secondProjection = projectPlan(second);

  assert.equal(firstProjection.signature, secondProjection.signature);
  assert.deepEqual(
    firstProjection.packets.map((packet) => packet.lane),
    ["Fast", "Standard", "Slow"],
  );
  assert.equal(firstProjection.packets[0].snapshot.position, "tile-2-6");
  assert.equal(firstProjection.packets[0].snapshot.divider.status, "cracked");
  assert.equal(firstProjection.packets[1].snapshot.position, "tile-5-6");
  assert.equal(firstProjection.packets[1].snapshot.divider.status, "breached");

  const resolved = resolveToSettle(first);
  const resolvedDisplay = displaySnapshot(resolved);
  for (const key of [
    "position",
    "condition",
    "guard",
    "majorState",
    "gate",
    "divider",
    "actuator",
    "bollard",
    "upperRoute",
    "serviceRoute",
    "lift",
    "poweredTrack",
    "cache",
    "westExit",
    "flags",
  ]) {
    assert.deepEqual(
      resolvedDisplay[key],
      firstProjection.finalSnapshot[key],
      key,
    );
  }
  for (const enemyId of Object.keys(resolved.enemies)) {
    for (const key of ["position", "condition", "guard", "status"]) {
      assert.deepEqual(
        resolvedDisplay.enemies[enemyId][key],
        firstProjection.finalSnapshot.enemies[enemyId][key],
        `${enemyId}.${key}`,
      );
    }
  }
  assert.equal(resolved.resolution.signature, firstProjection.signature);
  assert.equal(resolved.divider.status, "breached");
  assert.equal(resolved.gate.stability, 3);
  assert.equal(resolved.enemies.breacher.status, "staggered");
  assert.equal(
    resolved.review.some(
      (event) => event.title === "CLASH · Divider contact" && event.clash,
    ),
    true,
  );
  assert.deepEqual(
    resolved.review
      .filter((event) => !event.title.includes("revealed"))
      .map((event) => event.title),
    [
      "Guard linked to Breacher",
      "Reposition",
      "Advance",
      "CLASH · Divider contact",
    ],
  );
});

test("opposed planning protects solid commitments and permits one bounded Pivot per side", () => {
  let state = settleRound(settledCycleOne());
  state = queue(state, "cross-breach", "tile-10-5");
  const committedCross = state.plan[0];
  state = queue(state, "stabilize-gate", "gate");

  assert.deepEqual(
    state.plan.map((action) => [action.id, action.status]),
    [
      ["cross-breach", "solid"],
      ["stabilize-gate", "open"],
    ],
  );
  assert.deepEqual(
    state.enemyPlan.map((action) => [action.id, action.status]),
    [
      ["charge-debris", "solid"],
      ["body-block", "open"],
    ],
  );

  state = pivotOpenAction(state, "angle-clash", "defensive-bollard");
  assert.equal(state.playerPivotUsed, true);
  assert.equal(state.enemyPivotUsed, true);
  assert.equal(state.plan[0].instanceId, committedCross.instanceId);
  assert.equal(state.plan[0].id, "cross-breach");
  assert.deepEqual(
    state.plan.map((action) => [action.id, action.status]),
    [
      ["cross-breach", "solid"],
      ["angle-clash", "solid"],
    ],
  );
  assert.deepEqual(
    state.enemyPlan.map((action) => action.id),
    ["charge-debris", "brace-line"],
  );

  const secondPivot = pivotOpenAction(
    state,
    "stabilize-gate",
    "gate",
  );
  assert.deepEqual(secondPivot.plan, state.plan);
  assert.match(secondPivot.warning, /one Pivot is already spent/);

  const erased = removePlanAction(state, committedCross.instanceId);
  assert.deepEqual(erased.plan, state.plan);
  assert.match(erased.warning, /Earlier solid commitments cannot be erased/);
});

test("the revised second cycle reveals fast terrain pressure before linked movement and its Gate Clash", () => {
  const planned = battleExplorationCycleTwo();
  const projection = projectPlan(planned);
  assert.deepEqual(projection.contact, {
    risk: "HIGH",
    timing: "Likely even",
    location: "Defensive Bollard",
    unknown: 1,
    link: "Preserved",
    reason: "The safe upper lip preserves the redirected contact line.",
    details: "Player 6 · Enemy 6",
  });

  const resolved = resolveToSettle(planned);
  const material = resolved.review
    .filter((event) => !event.title.includes("revealed"))
    .map((event) => `${event.lane}:${event.title}`);
  assert.deepEqual(material, [
    "Fast:Divider conduit charged",
    "Fast:West Exit threatened",
    "Standard:Divider opening crossed",
    "Standard:CLASH · Gate access",
  ]);
  assert.equal(resolved.position, "tile-10-5");
  assert.equal(resolved.divider.conduit, "charged");
  assert.equal(resolved.bollard.status, "jammed");
  assert.equal(resolved.westExit.status, "threatened");
  assert.equal(resolved.gate.stability, 3);
  assert.equal(resolved.enemies.guard.condition, 5);
  assert.equal(availableCommand(resolved), 8);
  assert.equal(availableEnemyCommand(resolved), 0);
});

test("the complete three-cycle encounter ends in an explained Fast Secure result", () => {
  const resultState = fastSecureResult();
  assert.equal(resultState.phase, "result");
  assert.equal(resultState.result.type, "Fast Secure");
  assert.equal(resultState.result.diagnostic, false);
  assert.equal(resultState.result.objective, "Gate stabilized with 3/3 Stability");
  assert.equal(resultState.result.enemies.length, 4);
  assert.match(resultState.result.location, /Divider breached/);
  assert.match(resultState.result.location, /bollard jammed/);
  assert.match(resultState.result.turningPoint, /second contact/);
  assert.match(resultState.result.tradeoff, /Field Cache left/);

  const finalReview = resultState.review.map(
    (event) => `${event.lane}:${event.title}`,
  );
  assert.ok(finalReview.includes("Fast:Gate lane guarded"));
  assert.ok(finalReview.includes("Standard:CLASH · Defended Gate lane"));
  assert.ok(finalReview.includes("Slow:Gate stabilized"));
  assert.ok(
    finalReview.indexOf("Fast:Gate lane guarded") <
      finalReview.indexOf("Standard:CLASH · Defended Gate lane"),
  );
  assert.ok(
    finalReview.indexOf("Standard:CLASH · Defended Gate lane") <
      finalReview.indexOf("Slow:Gate stabilized"),
  );

  assert.deepEqual(
    resetFracturedGate(resultState),
    createFracturedGateState("battle-exploration"),
  );
});

test("Command banking, free Reposition, paid-action cap, and Refocus are independent from Tempo", () => {
  let state = createFracturedGateState();
  state = queue(state, "reposition", "tile-3-6");
  const secondFree = queueAction(state, "reposition", "tile-4-6");
  assert.equal(secondFree.plan.length, state.plan.length);
  assert.match(secondFree.warning, /one free ordinary Reposition/);

  state = settleRound(resolveToSettle(state));
  assert.equal(state.command, 32);
  assert.equal(state.round, 2);

  for (let count = 0; count < 4; count += 1) {
    state = queue(state, "guard", "player");
  }
  assert.equal(paidActionCount(state), 4);
  const fifth = queueAction(state, "guard", "player");
  assert.equal(fifth.plan.length, 4);
  assert.match(fifth.warning, /Four paid actions/);
  assert.equal(availableCommand(state), 8);
  assert.equal(tempoComparisonForRoute("clear").player, 6);

  let refocus = createFracturedGateState("battle-exploration");
  refocus = refocusCards(refocus, [
    "fallback-guard",
    "objective-brace",
  ]);
  assert.equal(refocus.command, 12);
  assert.equal(refocus.refocusUsed, true);
  assert.equal(paidActionCount(refocus), 1);
  assert.deepEqual(refocus.hand.slice(-2), [
    "covering-step",
    "extended-intercept",
  ]);
  const repeated = refocusCards(refocus, ["brace-through"]);
  assert.deepEqual(repeated.hand, refocus.hand);
  assert.match(repeated.warning, /once per planning cycle/);
});

test("invalidated attacks never retarget and refund half the primary cost at Settle", () => {
  let state = createFracturedGateState();
  state.position = "tile-5-6";
  state.command = 32;
  state.enemies.breacher.guard = 0;
  state.enemies.breacher.condition = 5;
  const untouched = Object.fromEntries(
    ["guard", "controller", "pressure"].map((id) => [
      id,
      state.enemies[id].condition,
    ]),
  );

  state = queue(state, "attack", "breacher");
  state = queue(state, "attack", "breacher");
  state = queue(state, "attack", "breacher");
  state = resolveToSettle(state);

  assert.equal(state.enemies.breacher.status, "disabled");
  assert.deepEqual(
    Object.fromEntries(
      ["guard", "controller", "pressure"].map((id) => [
        id,
        state.enemies[id].condition,
      ]),
    ),
    untouched,
  );
  assert.equal(state.settleSummary.refunds, 3);
  assert.equal(
    state.review.some(
      (event) =>
        event.outcome === "invalidated_before_begin" &&
        /No retarget occurred/.test(event.detail),
    ),
    true,
  );
});

test("all six ordered builds cause distinct, attributed state changes against the same formation", () => {
  const observations = {};

  let state = settledCycleOne();
  observations["battle-exploration"] = {
    turningPoint: state.flags.turningPoint,
    divider: state.divider.status,
  };

  state = createFracturedGateState("exploration-battle");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-4-4");
  state = queue(state, "advance", "tile-6-3");
  state = queue(state, "prepare-upper-route", "upper-crossing");
  state = resolveToSettle(state);
  observations["exploration-battle"] = {
    turningPoint: state.flags.turningPoint,
    prepared: state.upperRoute.prepared,
  };

  state = createFracturedGateState("battle-hacking");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-5-6");
  state = queue(state, "answer-regulator", "breacher");
  state = resolveToSettle(state);
  observations["battle-hacking"] = {
    turningPoint: state.flags.turningPoint,
    exposedThenReset:
      state.review.some((event) => event.title === "Impact regulator exposed") &&
      state.review.some(
        (event) => event.title === "Regulator automatically reset",
      ),
  };

  state = createFracturedGateState("hacking-battle");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-5-7");
  state = queue(state, "advance", "tile-7-7");
  state = settleRound(resolveToSettle(state));
  state = queue(
    state,
    "establish-bollard-control",
    "gate-actuator",
    "quiet-rewrite",
  );
  state = queue(state, "hold-actuator", "gate-actuator");
  state = resolveToSettle(state);
  observations["hacking-battle"] = {
    turningPoint: state.flags.turningPoint,
    mode: state.actuator.mode,
    held: state.actuator.accessHeld,
  };

  state = createFracturedGateState("exploration-hacking");
  state = queue(state, "prepare-service-route", "service-gap");
  state = queue(state, "suppress-service-closure", "service-gap");
  state = resolveToSettle(state);
  observations["exploration-hacking"] = {
    turningPoint: state.flags.turningPoint,
    prepared: state.serviceRoute.prepared,
    suppressed: state.serviceRoute.closureSuppressed,
  };

  state = createFracturedGateState("hacking-exploration");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-4-8");
  state = queue(state, "advance", "tile-5-8");
  state = settleRound(resolveToSettle(state));
  state = queue(
    state,
    "establish-lift-control",
    "lift-relay",
    "quiet-rewrite",
  );
  state = resolveToSettle(state);
  observations["hacking-exploration"] = {
    turningPoint: state.flags.turningPoint,
    mode: state.actuator.mode,
    controlled: state.actuator.controlled,
  };

  assert.deepEqual(observations, {
    "battle-exploration": {
      turningPoint: "divider",
      divider: "breached",
    },
    "exploration-battle": {
      turningPoint: "upper-route",
      prepared: true,
    },
    "battle-hacking": {
      turningPoint: "regulator",
      exposedThenReset: true,
    },
    "hacking-battle": {
      turningPoint: "actuator",
      mode: "bollard",
      held: true,
    },
    "exploration-hacking": {
      turningPoint: "service-route",
      prepared: true,
      suppressed: true,
    },
    "hacking-exploration": {
      turningPoint: "lift",
      mode: "lift",
      controlled: true,
    },
  });

  const attributed = [
    "answer-divider",
    "prepare-upper-route",
    "answer-regulator",
    "establish-bollard-control",
    "prepare-service-route",
    "establish-lift-control",
  ];
  for (const actionId of attributed) {
    assert.ok(FRACTURED_GATE_ACTIONS[actionId].attribution.revealed);
    assert.ok(FRACTURED_GATE_ACTIONS[actionId].attribution.enabled);
  }
});

test("all five owner-facing result families are reachable and explain complete state", () => {
  const results = [fastSecureResult().result];

  let clean = createFracturedGateState("exploration-battle");
  clean = queue(clean, "reposition", "tile-3-6");
  clean = queue(clean, "advance", "tile-4-4");
  clean = queue(clean, "advance", "tile-6-3");
  clean = queue(clean, "prepare-upper-route", "upper-crossing");
  clean = settleRound(resolveToSettle(clean));
  clean = queue(clean, "cross-upper-route", "tile-9-3");
  clean = queue(clean, "advance", "tile-10-5");
  clean = settleRound(resolveToSettle(clean));
  clean = retainSeven(clean, ["objective-brace"]);
  clean = queue(clean, "guard-gate", "gate");
  clean = queue(clean, "stabilize-gate", "gate", "objective-brace");
  clean = settleRound(resolveToSettle(clean));
  results.push(clean.result);

  let recovery = createFracturedGateState("exploration-battle");
  recovery = queue(recovery, "reposition", "tile-3-6");
  recovery = queue(recovery, "advance", "tile-4-4");
  recovery = queue(recovery, "advance", "tile-6-3");
  recovery = queue(recovery, "prepare-upper-route", "upper-crossing");
  recovery = settleRound(resolveToSettle(recovery));
  recovery = queue(recovery, "reposition", "tile-6-2");
  recovery = queue(recovery, "recover-cache", "field-cache");
  recovery = queue(recovery, "cross-upper-route", "tile-9-3");
  recovery = queue(recovery, "advance", "tile-10-5");
  recovery = settleRound(resolveToSettle(recovery));
  recovery = retainSeven(recovery, ["objective-brace"]);
  recovery = queue(recovery, "guard-gate", "gate");
  recovery = queue(
    recovery,
    "stabilize-gate",
    "gate",
    "objective-brace",
  );
  recovery = settleRound(resolveToSettle(recovery));
  results.push(recovery.result);

  let lost = createFracturedGateState();
  lost = queue(lost, "guard", "player");
  lost = settleRound(resolveToSettle(lost));
  lost = queue(lost, "guard", "player");
  lost = settleRound(resolveToSettle(lost));
  lost = retainSeven(lost);
  lost = queue(lost, "guard", "player");
  lost = settleRound(resolveToSettle(lost));
  results.push(lost.result);

  let retreat = createFracturedGateState();
  retreat = queue(retreat, "leave", "west-exit");
  retreat = settleRound(resolveToSettle(retreat));
  results.push(retreat.result);

  assert.deepEqual(
    results.map((result) => result.type),
    RESULT_TYPES,
  );
  for (const result of results) {
    assert.ok(result.objective);
    assert.equal(result.enemies.length, 4);
    assert.ok(result.player);
    assert.ok(result.cache);
    assert.ok(result.location);
    assert.ok(result.turningPoint);
    assert.ok(result.tradeoff);
    assert.ok(result.reason);
  }
});

test("Hacking / Exploration creates temporary geometry and the lift returns at Settle", () => {
  let state = createFracturedGateState("hacking-exploration");
  state = queue(state, "reposition", "tile-3-6");
  state = queue(state, "advance", "tile-4-8");
  state = queue(state, "advance", "tile-5-8");
  state = settleRound(resolveToSettle(state));
  state = queue(
    state,
    "establish-lift-control",
    "lift-relay",
    "quiet-rewrite",
  );
  state = settleRound(resolveToSettle(state));
  state = retainSeven(state);
  state = queue(state, "execute-lift", "service-lift");
  state = queue(
    state,
    "cross-lift",
    "tile-9-2",
    state.hand.includes("safe-landing") ? "safe-landing" : null,
  );
  state = resolveToSettle(state);
  assert.equal(state.position, "tile-9-2");
  assert.equal(state.lift.deployed, true);
  state = settleRound(state);
  assert.equal(state.lift.deployed, false);
  assert.equal(
    state.review.some((event) => event.title === "Service Lift returned"),
    true,
  );
});
