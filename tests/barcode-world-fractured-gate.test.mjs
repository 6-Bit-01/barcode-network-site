import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDS,
  CARDS,
  CORE_RULES,
  RESULT_TYPES,
  advanceResolution,
  availableCommand,
  createFracturedGateState,
  discardToRetain,
  displaySnapshot,
  getCompatibleCards,
  getContextActionGroups,
  lockPlan,
  paidActionCount,
  projectPlan,
  queueAction,
  refocusCards,
  resetFracturedGate,
  settleRound,
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

function resolveToSettle(state) {
  const locked = lockPlan(state);
  assert.equal(locked.phase, "resolution", locked.warning);
  let next = locked;
  let guard = 0;
  while (next.phase === "resolution" && guard < 8) {
    next = advanceResolution(next);
    guard += 1;
  }
  assert.equal(next.phase, "settle");
  return next;
}

function finishRound(state) {
  return settleRound(resolveToSettle(state));
}

function retainSeven(state) {
  let next = state;
  while (next.phase === "planning" && next.hand.length > CORE_RULES.retainLimit) {
    next = discardToRetain(next, next.hand.at(-1));
  }
  return next;
}

function battleExplorationOpening() {
  let state = createFracturedGateState("battle-exploration");
  state = queue(state, "reposition", "lower-cover");
  state = queue(
    state,
    "answer-divider",
    "cracked-divider",
    "brace-through",
  );
  state = queue(state, "cross-breach", "gate-platform");
  return state;
}

test("locked Battle foundation and all validated opening hands are preserved", () => {
  assert.deepEqual(
    BUILDS.map((build) => build.id),
    Object.keys(EXPECTED_OPENING_HANDS),
  );
  for (const build of BUILDS) {
    const state = createFracturedGateState(build.id);
    assert.equal(state.deck.length, 12, `${build.id} deck`);
    assert.equal(new Set(state.deck).size, 12, `${build.id} unique deck`);
    assert.deepEqual(state.hand, EXPECTED_OPENING_HANDS[build.id]);
    assert.equal(
      state.hand.some((cardId) => CARDS[cardId].partyOnly),
      false,
      `${build.id} opening is solo-safe`,
    );
  }
  assert.equal(CORE_RULES.commandStart, 16);
  assert.equal(CORE_RULES.commandIncome, 16);
  assert.equal(CORE_RULES.commandCap, 32);
  assert.equal(CORE_RULES.paidActionCap, 4);
  assert.equal(CORE_RULES.ordinaryRepositionPerPhase, 1);
  assert.equal(CORE_RULES.openingHand, 5);
  assert.equal(CORE_RULES.drawPerSettle, 2);
  assert.equal(CORE_RULES.retainLimit, 7);
});

test("context selection exposes no more than four parent actions and never uses dropdown movement", () => {
  const state = createFracturedGateState("battle-exploration");
  for (const focusId of [
    "player",
    "impact-rush",
    "assault",
    "cracked-divider",
    "upper-walk",
    "gate-actuator",
    "gate",
    "field-cache",
    "west-exit",
  ]) {
    const groups = getContextActionGroups(state, focusId);
    assert.ok(groups.length <= 4, focusId);
    assert.equal(new Set(groups.map((group) => group.parent)).size, groups.length);
  }
  assert.deepEqual(
    getContextActionGroups(state, "impact-rush").map((group) => group.parent),
    ["Attack", "Defend", "Discipline", "Inspect"],
  );
  const playerMove = getContextActionGroups(state, "player").find(
    (group) => group.parent === "Move",
  );
  assert.ok(playerMove.choices[0].legalTargets.includes("lower-cover"));

  let projected = createFracturedGateState("battle-exploration");
  projected = queue(projected, "reposition", "lower-cover");
  projected = queue(
    projected,
    "answer-divider",
    "cracked-divider",
    "brace-through",
  );
  const breachMove = getContextActionGroups(projected, "breach").find(
    (group) => group.parent === "Move",
  );
  assert.equal(breachMove.choices[0].id, "cross-breach");
  assert.deepEqual(breachMove.choices[0].legalTargets, ["gate-platform"]);
});

test("all six ordered builds have legal, distinct causal openings on the same board", () => {
  const observations = {};

  let state = battleExplorationOpening();
  state = resolveToSettle(state);
  observations["battle-exploration"] = {
    divider: state.divider.status,
    position: state.position,
    gate: state.gate.stability,
  };

  state = createFracturedGateState("exploration-battle");
  state = queue(state, "reposition", "upper-walk");
  state = queue(
    state,
    "prepare-upper-route",
    "gate-platform",
    "destination-claim",
  );
  state = queue(state, "contest-upper-landing", "upper-walk");
  state = resolveToSettle(state);
  observations["exploration-battle"] = {
    prepared: state.upperRoute.prepared,
    protected: state.upperRoute.protected,
    gate: state.gate.stability,
  };

  state = createFracturedGateState("battle-hacking");
  state = queue(state, "reposition", "lower-cover");
  state = queue(
    state,
    "answer-regulator",
    "assault",
    "brace-through",
  );
  state = queue(state, "suppress-regulator", "assault");
  state = resolveToSettle(state);
  observations["battle-hacking"] = {
    regulator: state.enemy.regulator,
    suppressed: state.enemy.regulatorResetSuppressed,
    gate: state.gate.stability,
  };

  state = createFracturedGateState("hacking-battle");
  state = queue(state, "reposition", "actuator");
  state = queue(
    state,
    "establish-bollard-control",
    "gate-actuator",
    "quiet-rewrite",
  );
  state = queue(state, "contest-actuator", "gate-actuator");
  state = resolveToSettle(state);
  observations["hacking-battle"] = {
    mode: state.actuator.mode,
    controlled: state.actuator.controlled,
    held: state.actuator.accessHeld,
    gate: state.gate.stability,
  };

  state = createFracturedGateState("exploration-hacking");
  state = queue(
    state,
    "prepare-service-route",
    "service-gap",
    "destination-claim",
  );
  state = queue(state, "suppress-service-closure", "service-gap");
  state = resolveToSettle(state);
  observations["exploration-hacking"] = {
    prepared: state.serviceRoute.prepared,
    suppressed: state.serviceRoute.closureSuppressed,
    gate: state.gate.stability,
  };

  state = createFracturedGateState("hacking-exploration");
  state = queue(state, "reposition", "actuator");
  state = queue(
    state,
    "establish-lift-control",
    "gate-actuator",
    "quiet-rewrite",
  );
  state = resolveToSettle(state);
  observations["hacking-exploration"] = {
    mode: state.actuator.mode,
    controlled: state.actuator.controlled,
    gate: state.gate.stability,
  };

  assert.deepEqual(observations, {
    "battle-exploration": {
      divider: "breached",
      position: "gate-platform",
      gate: 3,
    },
    "exploration-battle": {
      prepared: true,
      protected: true,
      gate: 3,
    },
    "battle-hacking": {
      regulator: "exposed",
      suppressed: true,
      gate: 3,
    },
    "hacking-battle": {
      mode: "bollard",
      controlled: true,
      held: true,
      gate: 3,
    },
    "exploration-hacking": {
      prepared: true,
      suppressed: true,
      gate: 2,
    },
    "hacking-exploration": {
      mode: "lift",
      controlled: true,
      gate: 2,
    },
  });
});

test("Preview and visible Fast → Standard → Slow resolution share the exact deterministic result", () => {
  const first = battleExplorationOpening();
  const firstProjection = projectPlan(first);
  const second = battleExplorationOpening();
  const secondProjection = projectPlan(second);
  assert.equal(firstProjection.signature, secondProjection.signature);
  assert.deepEqual(
    firstProjection.packets.map((packet) => packet.lane),
    ["Fast", "Standard", "Slow"],
  );

  const resolved = resolveToSettle(first);
  assert.deepEqual(displaySnapshot(resolved), firstProjection.finalSnapshot);
  assert.equal(resolved.resolution.signature, firstProjection.signature);
  assert.equal(
    resolved.review.some((event) => event.title === "Cracked Divider breached"),
    true,
  );
});

test("Command, free Reposition, paid-action cap, and Refocus accounting are enforced", () => {
  let state = createFracturedGateState();
  state = queue(state, "reposition", "lower-cover");
  const secondFree = queueAction(state, "reposition", "lower-yard");
  assert.equal(secondFree.plan.length, state.plan.length);
  assert.match(secondFree.warning, /one free ordinary Reposition/);

  state = finishRound(state);
  assert.equal(state.command, 32);
  assert.equal(state.round, 2);

  state = queue(state, "guard", "player");
  state = queue(state, "guard", "player");
  state = queue(state, "guard", "player");
  state = queue(state, "guard", "player");
  assert.equal(paidActionCount(state), 4);
  const fifth = queueAction(state, "guard", "player");
  assert.equal(fifth.plan.length, 4);
  assert.match(fifth.warning, /Four paid actions/);
  assert.equal(availableCommand(state), 8);

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
  assert.match(repeated.warning, /once per planning phase/);
});

test("compatible cards lift for the current action while the complete hand remains available", () => {
  let state = createFracturedGateState("battle-exploration");
  assert.deepEqual(
    new Set(getCompatibleCards(state, "answer-divider")),
    new Set(["fallback-guard", "brace-through", "hold-the-edge"]),
  );
  assert.ok(
    getCompatibleCards(state, "stabilize-gate").includes("objective-brace"),
  );

  state = createFracturedGateState("exploration-battle");
  assert.ok(
    getCompatibleCards(state, "prepare-upper-route").includes(
      "destination-claim",
    ),
  );

  state = createFracturedGateState("hacking-battle");
  assert.ok(
    getCompatibleCards(state, "establish-bollard-control").includes(
      "quiet-rewrite",
    ),
  );
});

test("invalidated actions do not retarget and receive deterministic Settle refunds", () => {
  let state = createFracturedGateState();
  state.enemy.guard = 0;
  state.enemy.condition = 6;
  state = queue(state, "attack", "assault");
  state = queue(state, "attack", "assault", "fallback-guard");
  state = resolveToSettle(state);
  assert.equal(state.enemy.status, "disabled");
  assert.equal(state.settleSummary.refunds, 3);
  assert.equal(state.guard, 7);
  assert.equal(
    state.review.some(
      (event) =>
        event.outcome === "invalidated_before_begin" &&
        /No retarget occurred/.test(event.detail),
    ),
    true,
  );
});

test("all five required Results are reachable and explain complete state", () => {
  const results = [];

  let state = finishRound(battleExplorationOpening());
  state = queue(state, "stabilize-gate", "gate");
  state = finishRound(state);
  results.push(state.result);

  state = createFracturedGateState();
  state = queue(state, "attack", "assault");
  state = queue(state, "attack", "assault");
  state = finishRound(state);
  state = queue(state, "reposition", "lower-cover");
  state = queue(state, "advance", "lower-yard");
  state = queue(state, "advance", "gate-platform");
  state = retainSeven(finishRound(state));
  state = queue(state, "stabilize-gate", "gate");
  state = finishRound(state);
  results.push(state.result);

  state = createFracturedGateState("exploration-battle");
  state = queue(state, "reposition", "upper-walk");
  state = queue(
    state,
    "prepare-upper-route",
    "gate-platform",
    "destination-claim",
  );
  state = queue(state, "contest-upper-landing", "upper-walk");
  state = retainSeven(finishRound(state));
  state = queue(state, "recover-cache", "field-cache");
  state = retainSeven(finishRound(state));
  state = queue(state, "cross-upper-route", "gate-platform");
  state = retainSeven(finishRound(state));
  state = queue(state, "stabilize-gate", "gate");
  state = finishRound(state);
  results.push(state.result);

  state = createFracturedGateState();
  for (let round = 0; round < 3; round += 1) {
    state = queue(state, "guard", "player");
    state = retainSeven(finishRound(state));
  }
  results.push(state.result);

  state = createFracturedGateState();
  state = queue(state, "leave", "west-exit");
  state = finishRound(state);
  results.push(state.result);

  assert.deepEqual(
    results.map((result) => result.type),
    RESULT_TYPES,
  );
  for (const result of results) {
    assert.ok(result.objective);
    assert.ok(result.enemy);
    assert.ok(result.player);
    assert.ok(result.cache);
    assert.ok(result.location);
    assert.ok(result.turningPoint);
    assert.ok(result.tradeoff);
  }
});

test("Hacking / Exploration creates temporary geometry and the lift resets after Settle", () => {
  let state = createFracturedGateState("hacking-exploration");
  state = queue(state, "reposition", "actuator");
  state = queue(
    state,
    "establish-lift-control",
    "gate-actuator",
    "quiet-rewrite",
  );
  state = finishRound(state);
  state = queue(state, "execute-lift", "service-lift");
  state = queue(state, "cross-lift", "gate-platform", "safe-landing");
  state = resolveToSettle(state);
  assert.equal(state.position, "gate-platform");
  assert.equal(state.lift.deployed, true);
  state = settleRound(state);
  assert.equal(state.lift.deployed, false);
  assert.equal(
    state.review.some((event) => event.title === "Service Lift reset"),
    true,
  );
});

test("reset restores the same seed, opening state, and deterministic plan signature", () => {
  const planned = battleExplorationOpening();
  const signature = projectPlan(planned).signature;
  const reset = resetFracturedGate(resolveToSettle(planned));
  assert.deepEqual(reset, createFracturedGateState("battle-exploration"));
  const replay = battleExplorationOpening();
  assert.equal(projectPlan(replay).signature, signature);
});
