import test from "node:test";
import assert from "node:assert/strict";

import {
  CARD_CATEGORIES,
  CATEGORY_LOADOUTS,
  CONTEXT_CARD_DEFINITIONS,
  GENERAL_CARD_DEFINITIONS,
  THREE_ROUTE_RULES,
  THREE_ROUTE_SCENARIOS,
  chooseThreeRoute,
  createThreeRouteState,
  cycleThreeRouteCategory,
  deterministicThreeRouteRoll,
  getThreeRouteChoices,
  getVisibleCategoryCards,
  projectPlannedTheater,
  replayNewThreeRouteShuffle,
  replaySameThreeRouteState,
  resolveThreeRouteRound,
  runThreeRouteSimulation,
  startNextThreeRouteRound,
  undoThreeRouteChoice,
} from "../src/lib/barcode-world/three-route-engine.mjs";

function exposeCard(state, category, designId) {
  const pool = state.player.pools[category];
  const existing = pool.available.find((entry) => entry.designId === designId);
  if (existing) return existing;
  const index = pool.drawPile.findIndex((entry) => entry.designId === designId);
  assert.notEqual(index, -1, designId + " must exist in " + category);
  const [card] = pool.drawPile.splice(index, 1);
  if (pool.available.length >= THREE_ROUTE_RULES.categoryCapacity) {
    pool.drawPile.push(pool.available.pop());
  }
  pool.available.push(card);
  return card;
}

function choiceForTarget(state, cardId, targetId) {
  const choice = getThreeRouteChoices(state, cardId).find(
    (entry) => entry.target.id === targetId,
  );
  assert.ok(choice, cardId + " must target " + targetId);
  return choice;
}

test("v0.3 keeps four separate reusable category pools and three neutral choice lanes", () => {
  const state = createThreeRouteState("category-contract");
  assert.equal(state.version, "0.3");
  assert.equal(state.scenarioId, "fractured-gate-routes-v0.3");
  assert.equal(THREE_ROUTE_RULES.choiceLanes, 3);
  assert.equal(THREE_ROUTE_RULES.maxPlanSteps, 3);
  assert.equal(state.player.condition, 12);
  assert.equal(state.player.maxCondition, 12);
  assert.equal(THREE_ROUTE_RULES.guardCap, 8);
  assert.ok(THREE_ROUTE_RULES.openingPerCategory >= 4);
  assert.ok(THREE_ROUTE_RULES.categoryCapacity > THREE_ROUTE_RULES.openingPerCategory);
  assert.deepEqual(Object.keys(state.player.pools), CARD_CATEGORIES);
  for (const category of CARD_CATEGORIES) {
    const pool = state.player.pools[category];
    assert.equal(pool.category, category);
    assert.equal(pool.available.length, THREE_ROUTE_RULES.openingPerCategory);
    assert.ok(pool.available.every((entry) => entry.category === category));
    assert.equal(
      new Set(pool.available.map((entry) => entry.designId)).size,
      THREE_ROUTE_RULES.openingPerCategory,
      category + " must open with distinct choices rather than duplicate filler",
    );
    assert.ok(CATEGORY_LOADOUTS[category].length >= 6);
  }
});

test("Guard absorbs enemy Impact before Health while Control remains a separate track", () => {
  let state = createThreeRouteState("health-contract", "sublevel-duel-v0.3");
  state.player.positionId = state.enemies[0].positionId;
  state.enemyIntents = [{
    actorId: state.enemies[0].id,
    kind: "attack",
    name: "Contract Strike",
    targetId: "wayfinder",
    destinationId: state.enemies[0].positionId,
    chance: 95,
    impact: 3,
    pressure: 1,
    order: 0,
  }];
  const guard = getVisibleCategoryCards(state, "defense").find(
    (entry) => entry.designId === "guard",
  );
  state = chooseThreeRoute(
    state,
    guard.id,
    getThreeRouteChoices(state, guard.id)[0].id,
  );
  state = resolveThreeRouteRound(state);
  assert.equal(state.player.guard, 0, "2 Guard must absorb the first 2 Impact");
  assert.equal(state.player.condition, 11, "remaining Impact must reduce Health");
  assert.equal(state.pressure, -1, "actual Health loss may also shift Control");
  assert.equal(state.currentReview.conditionBefore, 12);
  assert.equal(state.currentReview.conditionAfter, 11);
  assert.equal(state.currentReview.conditionDelta, -1);
  assert.match(
    state.currentReview.events.find((event) => event.phase === "enemy").detail,
    /2 Guard absorbed\. 1 Health lost · Control -1/,
  );
});

test("Guard persists across rounds and Stabilize restores Health without exceeding its maximum", () => {
  let guarded = createThreeRouteState("guard-persistence", "sublevel-duel-v0.3");
  guarded.enemyIntents = [{
    actorId: guarded.enemies[0].id,
    kind: "advance",
    name: "Hold Range",
    targetId: guarded.player.positionId,
    destinationId: guarded.enemies[0].positionId,
    chance: 95,
    impact: 0,
    pressure: 0,
    order: 0,
  }];
  const guard = getVisibleCategoryCards(guarded, "defense").find(
    (entry) => entry.designId === "guard",
  );
  guarded = chooseThreeRoute(
    guarded,
    guard.id,
    getThreeRouteChoices(guarded, guard.id)[0].id,
  );
  guarded = resolveThreeRouteRound(guarded);
  assert.equal(guarded.player.guard, 2);
  guarded = startNextThreeRouteRound(guarded);
  assert.equal(guarded.player.guard, 2, "unused Guard must persist into the next round");

  let wounded = createThreeRouteState("stabilize-health", "sublevel-duel-v0.3");
  wounded.player.condition = 11;
  wounded.enemyIntents = [{
    actorId: wounded.enemies[0].id,
    kind: "advance",
    name: "Hold Range",
    targetId: wounded.player.positionId,
    destinationId: wounded.enemies[0].positionId,
    chance: 95,
    impact: 0,
    pressure: 0,
    order: 0,
  }];
  const stabilize = exposeCard(wounded, "special", "stabilize");
  wounded = chooseThreeRoute(
    wounded,
    stabilize.id,
    getThreeRouteChoices(wounded, stabilize.id)[0].id,
  );
  wounded = resolveThreeRouteRound(wounded);
  assert.equal(wounded.player.condition, 12);
  assert.equal(wounded.player.guard, 1);
});

test("Control disruption does not fake Health damage and zero Health causes Compromised", () => {
  let disrupted = createThreeRouteState("control-only", "sublevel-duel-v0.3");
  disrupted.enemyIntents = [{
    actorId: disrupted.enemies[0].id,
    kind: "disrupt",
    name: "Signal Jam",
    targetId: "objective",
    destinationId: disrupted.enemies[0].positionId,
    chance: 95,
    impact: 0,
    pressure: 1,
    order: 0,
  }];
  const charge = getVisibleCategoryCards(disrupted, "special").find(
    (entry) => entry.designId === "charge",
  );
  disrupted = chooseThreeRoute(
    disrupted,
    charge.id,
    getThreeRouteChoices(disrupted, charge.id)[0].id,
  );
  disrupted = resolveThreeRouteRound(disrupted);
  assert.equal(disrupted.player.condition, 12);
  assert.equal(disrupted.pressure, -1);

  let compromised = createThreeRouteState("compromised", "sublevel-duel-v0.3");
  compromised.player.condition = 1;
  compromised.player.positionId = compromised.enemies[0].positionId;
  compromised.enemyIntents = [{
    actorId: compromised.enemies[0].id,
    kind: "attack",
    name: "Final Strike",
    targetId: "wayfinder",
    destinationId: compromised.enemies[0].positionId,
    chance: 95,
    impact: 2,
    pressure: 1,
    order: 0,
  }];
  const finalCharge = getVisibleCategoryCards(compromised, "special").find(
    (entry) => entry.designId === "charge",
  );
  compromised = chooseThreeRoute(
    compromised,
    finalCharge.id,
    getThreeRouteChoices(compromised, finalCharge.id)[0].id,
  );
  compromised = resolveThreeRouteRound(compromised);
  assert.equal(compromised.player.condition, 0);
  assert.equal(compromised.result?.winner, "enemy");
  assert.equal(compromised.result?.outcome, "compromised");
  assert.match(compromised.result?.reason ?? "", /Health reached zero.*Compromised/);
  assert.ok(compromised.pressure > THREE_ROUTE_RULES.pressureMin);
});

test("the same general card binds to scenario theater targets instead of encoding level names", () => {
  assert.equal(GENERAL_CARD_DEFINITIONS.advance.name, "Advance");
  assert.doesNotMatch(
    JSON.stringify(GENERAL_CARD_DEFINITIONS),
    /Cargo Divider|Service Ring|Coolant Conduit/,
  );
  const duel = createThreeRouteState(
    "general-duel",
    "sublevel-duel-v0.3",
  );
  const gate = createThreeRouteState(
    "general-gate",
    "fractured-gate-routes-v0.3",
  );
  const duelAdvance = getVisibleCategoryCards(duel, "movement").find(
    (entry) => entry.designId === "advance",
  );
  const gateAdvance = getVisibleCategoryCards(gate, "movement").find(
    (entry) => entry.designId === "advance",
  );
  assert.deepEqual(
    getThreeRouteChoices(duel, duelAdvance.id).map((entry) => entry.target.name),
    ["Service Ring", "Upper Walk"],
  );
  assert.deepEqual(
    getThreeRouteChoices(gate, gateAdvance.id).map((entry) => entry.target.name),
    ["Cargo Divider", "Service Relay"],
  );
});

test("card-first targeting exposes at most three legal routes with honest outcomes", () => {
  const state = createThreeRouteState(
    "three-targets",
    "fractured-gate-routes-v0.3",
  );
  for (const category of CARD_CATEGORIES) {
    for (const card of getVisibleCategoryCards(state, category)) {
      const choices = getThreeRouteChoices(state, card.id);
      assert.ok(choices.length <= THREE_ROUTE_RULES.choiceLanes);
      for (const choice of choices) {
        assert.equal(choice.card.id, card.id);
        assert.ok(choice.target.id);
        assert.ok(choice.forecast.chance >= 15 && choice.forecast.chance <= 95);
        assert.equal(choice.forecast.chance % 5, 0);
        assert.ok(choice.forecast.successLabel);
        assert.ok(choice.forecast.failureLabel);
      }
    }
  }
});

test("choosing a route spends its general card without automatic replacement and keeps enemy intent locked", () => {
  const state = createThreeRouteState(
    "no-auto-refill",
    "fractured-gate-routes-v0.3",
  );
  const advance = getVisibleCategoryCards(state, "movement").find(
    (entry) => entry.designId === "advance",
  );
  const choice = choiceForTarget(state, advance.id, "cargo-divider");
  const beforeAvailable = state.player.pools.movement.available.length;
  const beforeDraw = state.player.pools.movement.drawPile.length;
  const intents = structuredClone(state.enemyIntents);
  const staged = chooseThreeRoute(state, advance.id, choice.id);
  assert.equal(staged.player.plan.length, 1);
  assert.equal(staged.player.plan[0].card.name, "Advance");
  assert.equal(staged.player.plan[0].target.name, "Cargo Divider");
  assert.equal(staged.player.pools.movement.available.length, beforeAvailable - 1);
  assert.equal(staged.player.pools.movement.drawPile.length, beforeDraw);
  assert.equal(staged.player.reserve, state.player.reserve - advance.cost);
  assert.deepEqual(staged.enemyIntents, intents);
  assert.equal(state.player.plan.length, 0, "public transition must remain pure");
});

test("a projected general movement opens a rare scene-bound Context Card", () => {
  let state = createThreeRouteState(
    "context-branch",
    "fractured-gate-routes-v0.3",
  );
  const advance = getVisibleCategoryCards(state, "movement").find(
    (entry) => entry.designId === "advance",
  );
  state = chooseThreeRoute(
    state,
    advance.id,
    choiceForTarget(state, advance.id, "service-relay").id,
  );
  assert.equal(projectPlannedTheater(state).playerPositionId, "service-relay");
  const specialCards = getVisibleCategoryCards(state, "special");
  assert.ok(
    specialCards.some(
      (entry) =>
        entry.designId === "overload-relay" &&
        entry.context === true,
    ),
  );
  assert.equal(CONTEXT_CARD_DEFINITIONS["overload-relay"].kind, "context");
  assert.equal(
    CATEGORY_LOADOUTS.special.includes("overload-relay"),
    false,
    "Context Cards must not pollute the permanent category deck",
  );
});

test("category modifiers attach to compatible staged actions rather than becoming scenario cards", () => {
  let state = createThreeRouteState(
    "modifier-attachment",
    "fractured-gate-routes-v0.3",
  );
  const advance = getVisibleCategoryCards(state, "movement").find(
    (entry) => entry.designId === "advance",
  );
  state = chooseThreeRoute(
    state,
    advance.id,
    choiceForTarget(state, advance.id, "cargo-divider").id,
  );
  const quickstep = exposeCard(state, "movement", "quickstep");
  const modifierChoice = getThreeRouteChoices(state, quickstep.id)[0];
  assert.ok(modifierChoice.modifier);
  assert.equal(modifierChoice.target.kind, "plan");
  const beforeChance = state.player.plan[0].forecast.chance;
  state = chooseThreeRoute(state, quickstep.id, modifierChoice.id);
  assert.equal(state.player.plan[0].modifiers[0].designId, "quickstep");
  assert.equal(state.player.plan[0].forecast.chance, Math.min(95, beforeChance + 15));
});

test("branch prerequisites invalidate cleanly when an earlier movement fails", () => {
  let selected = null;
  for (let index = 0; index < 2000 && !selected; index += 1) {
    const seed = "failed-branch-" + index;
    if (deterministicThreeRouteRoll(seed, 1, "player", 0) <= 80) continue;
    let state = createThreeRouteState(
      seed,
      "fractured-gate-routes-v0.3",
    );
    const advance = getVisibleCategoryCards(state, "movement").find(
      (entry) => entry.designId === "advance",
    );
    const movementChoice = choiceForTarget(
      state,
      advance.id,
      "service-relay",
    );
    if (movementChoice.forecast.chance >= 95) continue;
    state = chooseThreeRoute(state, advance.id, movementChoice.id);
    const overload = getVisibleCategoryCards(state, "special").find(
      (entry) => entry.designId === "overload-relay",
    );
    state = chooseThreeRoute(
      state,
      overload.id,
      getThreeRouteChoices(state, overload.id)[0].id,
    );
    const result = resolveThreeRouteRound(state);
    if (result.currentReview.events[0].success === false) {
      selected = { state, result };
    }
  }
  assert.ok(selected, "a deterministic failing movement seed must exist");
  const playerEvents = selected.result.currentReview.events.filter(
    (entry) => entry.phase === "player",
  );
  assert.equal(playerEvents[0].success, false);
  assert.match(playerEvents[1].title, /INVALIDATED/);
  assert.match(playerEvents[1].detail, /Cards and Reserve returned/);
  assert.equal(
    selected.result.usedContextCardIds.includes("overload-relay"),
    false,
  );
});

test("resolution is deterministic and ordered player actions then enemies then Settle", () => {
  let state = createThreeRouteState("timeline-order", "sublevel-duel-v0.3");
  const guard = getVisibleCategoryCards(state, "defense").find(
    (entry) => entry.designId === "guard",
  );
  state = chooseThreeRoute(
    state,
    guard.id,
    getThreeRouteChoices(state, guard.id)[0].id,
  );
  const sameInput = structuredClone(state);
  const first = resolveThreeRouteRound(state);
  const second = resolveThreeRouteRound(sameInput);
  assert.deepEqual(first, second);
  const phases = first.currentReview.events.map((entry) => entry.phase);
  const firstEnemy = phases.indexOf("enemy");
  const settle = phases.indexOf("settle");
  assert.ok(firstEnemy > 0);
  assert.equal(settle, phases.length - 1);
  assert.ok(phases.slice(0, firstEnemy).every((entry) => entry === "player"));
  assert.ok(
    phases.slice(firstEnemy, settle).every((entry) => entry === "enemy"),
  );
});

test("explicit category cycling costs Reserve and is not a placement refill", () => {
  const state = createThreeRouteState("category-cycle");
  const before = state.player.pools.offense.available.map((entry) => entry.id);
  const cycled = cycleThreeRouteCategory(state, "offense");
  assert.equal(cycled.player.reserve, state.player.reserve - 1);
  assert.notDeepEqual(
    cycled.player.pools.offense.available.map((entry) => entry.id),
    before,
  );
  assert.match(cycled.notice, /cycled from OFFENSE/);
});

test("undo restores the exact category card, Reserve, and projected theater", () => {
  let state = createThreeRouteState(
    "undo-route",
    "fractured-gate-routes-v0.3",
  );
  const before = structuredClone(state);
  const advance = getVisibleCategoryCards(state, "movement").find(
    (entry) => entry.designId === "advance",
  );
  state = chooseThreeRoute(
    state,
    advance.id,
    choiceForTarget(state, advance.id, "cargo-divider").id,
  );
  state = undoThreeRouteChoice(state);
  assert.deepEqual(state.player.pools, before.player.pools);
  assert.equal(state.player.reserve, before.player.reserve);
  assert.equal(state.player.plan.length, 0);
  assert.equal(projectPlannedTheater(state).playerPositionId, before.player.positionId);
});

test("scenario recipes grant specific category pools instead of universally refilling them", () => {
  let state = createThreeRouteState(
    "round-grants",
    "coolant-extraction-v0.3",
  );
  const guard = getVisibleCategoryCards(state, "defense").find(
    (entry) => entry.designId === "guard",
  );
  state = chooseThreeRoute(
    state,
    guard.id,
    getThreeRouteChoices(state, guard.id)[0].id,
  );
  state = resolveThreeRouteRound(state);
  if (state.phase === "result") return;
  const movementBefore = state.player.pools.movement.available.length;
  const defenseBefore = state.player.pools.defense.available.length;
  state = startNextThreeRouteRound(state);
  assert.ok(state.currentRoundGrant.some((entry) => entry.category === "movement"));
  assert.equal(
    state.currentRoundGrant.some((entry) => entry.category === "defense"),
    false,
  );
  assert.ok(state.player.pools.movement.available.length >= movementBefore);
  assert.equal(state.player.pools.defense.available.length, defenseBefore);
});

test("same-state replay is exact while New Shuffle changes category availability", () => {
  const state = createThreeRouteState(
    "replay-contract",
    "fractured-gate-routes-v0.3",
  );
  assert.deepEqual(replaySameThreeRouteState(state), state);
  const shuffled = replayNewThreeRouteShuffle(state);
  assert.equal(shuffled.baseSeed, state.baseSeed);
  assert.equal(shuffled.shuffleIndex, state.shuffleIndex + 1);
  assert.notEqual(shuffled.seed, state.seed);
  assert.notDeepEqual(shuffled.player.pools, state.player.pools);
});

test("the same engine handles one, two, and three enemies across different physical settings", () => {
  assert.deepEqual(
    THREE_ROUTE_SCENARIOS.map((entry) => entry.enemies.length),
    [1, 3, 2],
  );
  assert.equal(new Set(THREE_ROUTE_SCENARIOS.map((entry) => entry.location)).size, 3);
  for (const scenario of THREE_ROUTE_SCENARIOS) {
    assert.ok(scenario.zones.length >= 4);
    assert.ok(scenario.edges.length >= scenario.zones.length - 1);
    assert.ok(scenario.exits.length >= 1);
    const degrees = new Map(scenario.zones.map((zone) => [zone.id, 0]));
    for (const [left, right] of scenario.edges) {
      degrees.set(left, degrees.get(left) + 1);
      degrees.set(right, degrees.get(right) + 1);
    }
    assert.ok(
      [...degrees.values()].some((degree) => degree >= 3),
      scenario.name + " must contain a spatial branch instead of a single corridor",
    );
  }
});

test("deterministic multi-scenario simulations terminate and exercise all card categories", () => {
  for (const scenario of THREE_ROUTE_SCENARIOS) {
    const result = runThreeRouteSimulation({
      battles: 40,
      seedPrefix: "contract-" + scenario.id,
      maxRounds: 40,
      scenarioId: scenario.id,
    });
    assert.equal(result.unfinished, 0, scenario.name + " unfinished");
    assert.equal(
      result.playerWins + result.enemyWins + result.retreats,
      result.battles,
    );
    assert.ok(result.averageRounds >= 2 && result.averageRounds < 12);
    for (const category of CARD_CATEGORIES) {
      assert.ok(result.categoryUses[category] > 0, category + " unused");
    }
  }
});
