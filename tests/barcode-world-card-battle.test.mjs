import test from "node:test";
import assert from "node:assert/strict";

import {
  CARD_BATTLE_RULES,
  CARD_BATTLE_SCENARIOS,
  CARD_TYPES,
  DEFAULT_CARD_BATTLE_SCENARIO_ID,
  ENEMY_CARD_DEFINITIONS,
  ENEMY_DECK,
  PLAYER_CARD_DEFINITIONS,
  PLAYER_DECK,
  compileMove,
  createCardBattleState,
  deterministicContestRoll,
  deterministicShuffle,
  getLaneForecast,
  getPlacementPreview,
  placePlayerCard,
  replayNewShuffle,
  replaySameState,
  resolveRound,
  returnPlayerCard,
  runDeterministicSimulation,
  startNextRound,
  undoPlayerAction,
} from "../src/lib/barcode-world/card-battle-engine.mjs";

function card(side, designId, copy = 1) {
  const deck = side === "player" ? PLAYER_DECK : ENEMY_DECK;
  return structuredClone(
    deck.find((entry) => entry.designId === designId && entry.copy === copy),
  );
}

function passingSeed(prefix, maximumRoll = 50, lane = 0) {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `${prefix}-${index}`;
    if (deterministicContestRoll(seed, 1, lane) <= maximumRoll) return seed;
  }
  throw new Error(`Could not find passing seed for ${prefix}`);
}

function failingSeed(prefix, minimumRoll = 96, lane = 0) {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `${prefix}-${index}`;
    if (deterministicContestRoll(seed, 1, lane) >= minimumRoll) return seed;
  }
  throw new Error(`Could not find failing seed for ${prefix}`);
}

function controlledState(
  seed = "controlled",
  scenarioId = DEFAULT_CARD_BATTLE_SCENARIO_ID,
) {
  const state = createCardBattleState(seed, scenarioId);
  state.player.hand = [];
  state.player.drawPile = [];
  state.player.discard = [];
  state.player.lanes = [[], [], [], []];
  state.player.reserve = CARD_BATTLE_RULES.commandCap;
  state.player.conditions = { charge: false, chargeLane: null };
  state.enemy.hand = [];
  state.enemy.drawPile = [];
  state.enemy.discard = [];
  state.enemy.reserve = 0;
  state.enemy.conditions = { fear: false };
  state.enemyPreview = { round: state.round, locked: true, lanes: [null, null, null, null] };
  state.pendingPlayerActions = [];
  state.pendingEvents = [];
  state.currentReview = null;
  state.currentRoundGrant = { automaticCards: 0, reserveBonus: 0 };
  state.history = [];
  state.unlocks = { fearDrawClaimed: false, pressureDrawClaimed: false };
  state.eventSequence = 0;
  state.playerActionSequence = 0;
  return state;
}

function setEnemyIntent(state, lane, designIds) {
  const cards = designIds.map((designId, index) => card("enemy", designId, index + 1));
  const move = compileMove(cards, "enemy");
  state.enemyPreview.lanes[lane] = {
    lane,
    cards,
    move,
    cost: move.cost,
    score: 1,
  };
  return state;
}

function reviewEventTypes(state) {
  return state.currentReview.events.map((entry) => entry.type);
}

function assertCausalEvents(events) {
  assert.ok(events.length > 0);
  for (const entry of events) {
    assert.ok(entry.id);
    assert.ok(entry.sceneCue, `${entry.id} scene cue`);
    assert.ok(entry.detail, `${entry.id} causal detail`);
  }
}

function playerZoneIds(state) {
  return [
    ...state.player.drawPile,
    ...state.player.hand,
    ...state.player.discard,
    ...state.player.lanes.flat(),
  ].map((entry) => entry.id);
}

function enemyZoneIds(state) {
  return [
    ...state.enemy.drawPile,
    ...state.enemy.hand,
    ...state.enemy.discard,
    ...state.enemyPreview.lanes.flatMap((intent) => intent?.cards ?? []),
  ].map((entry) => entry.id);
}

test("v0.2 decks contain eighteen unique cards and all eight card types", () => {
  assert.equal(CARD_BATTLE_RULES.deckSize, 18);
  assert.equal(CARD_BATTLE_RULES.handSize, 6);
  assert.equal(CARD_TYPES.length, 8);
  assert.deepEqual(
    new Set(Object.values(PLAYER_CARD_DEFINITIONS).map((entry) => entry.type)),
    new Set(CARD_TYPES),
  );
  for (const [side, deck, definitions] of [
    ["player", PLAYER_DECK, PLAYER_CARD_DEFINITIONS],
    ["enemy", ENEMY_DECK, ENEMY_CARD_DEFINITIONS],
  ]) {
    assert.equal(deck.length, 18, `${side} deck size`);
    assert.equal(new Set(deck.map((entry) => entry.id)).size, 18, `${side} unique ids`);
    assert.deepEqual(new Set(deck.map((entry) => entry.designId)), new Set(Object.keys(definitions)));
    for (const instance of deck) {
      assert.equal(instance.side, side);
      assert.equal(instance.ability, instance.effect);
    }
  }
  assert.equal(PLAYER_CARD_DEFINITIONS["cache-tap"].type, "modifier");
  assert.equal(PLAYER_CARD_DEFINITIONS["cache-tap"].drawOnSuccess, 2);
});

test("scenario recipes can isolate or mix every replenishment source", () => {
  const byId = Object.fromEntries(CARD_BATTLE_SCENARIOS.map((entry) => [entry.id, entry]));
  assert.equal(byId["breacher-intercept-v0.2"].replenishment.roundStartDraw, 0);
  assert.equal(byId["breacher-intercept-v0.2"].replenishment.contestedSuccessDraw, 1);
  assert.equal(byId["signal-surge-v0.2"].replenishment.roundStartDraw, 2);
  assert.equal(byId["signal-surge-v0.2"].reservePerRoundBonus, 2);
  assert.equal(byId["fractured-cache-v0.2"].replenishment.fearUnlockDraw, 2);
  const mixed = byId["cascade-protocol-v0.2"];
  assert.ok(mixed.replenishment.roundStartDraw > 0);
  assert.ok(mixed.replenishment.contestedSuccessDraw > 0);
  assert.ok(mixed.replenishment.fearUnlockDraw > 0);
});

test("seeded openings and hidden rolls replay exactly within the selected scenario", () => {
  const first = createCardBattleState("replay-proof", "cascade-protocol-v0.2");
  const duplicate = createCardBattleState("replay-proof", "cascade-protocol-v0.2");
  assert.deepEqual(first, duplicate);
  assert.deepEqual(replaySameState(first), first);
  const reshuffled = replayNewShuffle(first);
  assert.equal(reshuffled.scenarioId, first.scenarioId);
  assert.equal(reshuffled.shuffleIndex, 1);
  assert.notEqual(reshuffled.seed, first.seed);
  assert.notDeepEqual(reshuffled, first);
  assert.deepEqual(
    deterministicShuffle([1, 2, 3, 4, 5], "domain"),
    deterministicShuffle([1, 2, 3, 4, 5], "domain"),
  );
});

test("setup deals six visible cards, +10 Reserve, and locked enemy intents", () => {
  const state = createCardBattleState("opening-zones");
  assert.equal(state.phase, "player-action");
  assert.equal(state.round, 1);
  assert.equal(state.player.hand.length, 6);
  assert.equal(state.player.drawPile.length, 12);
  assert.equal(state.player.reserve, 10);
  assert.equal(state.enemy.reserve >= 0, true);
  assert.equal(state.enemyPreview.locked, true);
  assert.ok(state.enemyPreview.lanes.some(Boolean));
  assert.equal(new Set(playerZoneIds(state)).size, 18);
  assert.equal(new Set(enemyZoneIds(state)).size, 18);
});

test("Signal Surge grants its Reserve bonus immediately and automatic cards only next round", () => {
  let state = controlledState("automatic-feed", "signal-surge-v0.2");
  state.player.reserve = 0;
  state.player.drawPile = [card("player", "jab", 1), card("player", "guard", 1)];
  state = resolveRound(state);
  assert.equal(state.currentReview.replenishment.playerDrawn, 0);
  state = startNextRound(state);
  assert.equal(state.player.reserve, 12);
  assert.equal(state.player.hand.length, 2);
  assert.equal(state.currentRoundGrant.automaticCards, 2);
  assert.ok(state.pendingEvents.some((entry) => entry.type === "automatic-draw"));
});

test("earned-feed scenarios do not automatically refill the rack", () => {
  let state = controlledState("no-auto-refill");
  state.player.hand = [card("player", "guard")];
  state.player.drawPile = [card("player", "jab")];
  state = resolveRound(state);
  assert.equal(state.currentReview.replenishment.playerDrawn, 0);
  state = startNextRound(state);
  assert.equal(state.player.hand.length, 1);
  assert.equal(state.player.hand[0].designId, "guard");
  assert.equal(state.currentRoundGrant.automaticCards, 0);
});

test("placing a card spends Reserve without drawing a replacement", () => {
  let state = controlledState("placement-no-refill");
  state.player.reserve = 10;
  state.player.hand = [card("player", "jab"), card("player", "guard")];
  state.player.drawPile = [card("player", "flank")];
  const beforePile = state.player.drawPile.map((entry) => entry.id);
  state = placePlayerCard(state, "player-jab-1", 0);
  assert.equal(state.player.reserve, 8);
  assert.deepEqual(state.player.hand.map((entry) => entry.designId), ["guard"]);
  assert.deepEqual(state.player.drawPile.map((entry) => entry.id), beforePile);
  assert.equal(state.player.lanes[0][0].designId, "jab");
  assert.match(state.pendingEvents.at(-1).detail, /No replacement card is drawn/i);
});

test("stack grammar transforms compatible cards and rejects incompatible modifiers", () => {
  let state = controlledState("stack-grammar");
  state.player.hand = [
    card("player", "jab", 1),
    card("player", "jab", 2),
    card("player", "overclock", 1),
    card("player", "dread-pulse", 1),
  ];
  const modifierAlone = placePlayerCard(state, "player-overclock-1", 0);
  assert.match(modifierAlone.notice, /does not connect/i);
  state = placePlayerCard(state, "player-jab-1", 0);
  state = placePlayerCard(state, "player-jab-2", 0);
  assert.equal(getLaneForecast(state, 0).playerMove.name, "POWER ATTACK");
  state = placePlayerCard(state, "player-overclock-1", 0);
  assert.equal(getLaneForecast(state, 0).playerMove.name, "OVERLOADED POWER ATTACK");
  const tooMany = placePlayerCard(state, "player-dread-pulse-1", 0);
  assert.match(tooMany.notice, /complete three-card move/i);
});

test("Flank plus Dread Pulse creates Surprise and Fear without a wordy rules layer", () => {
  let state = controlledState(passingSeed("surprise", 90));
  state.player.hand = [card("player", "flank"), card("player", "dread-pulse")];
  state = placePlayerCard(state, "player-flank-1", 0);
  state = placePlayerCard(state, "player-dread-pulse-1", 0);
  const forecast = getLaneForecast(state, 0);
  assert.equal(forecast.playerMove.name, "SURPRISE");
  assert.equal(forecast.playerMove.appliesFear, true);
  state = resolveRound(state);
  assert.equal(state.currentReview.laneResults[0].success, true);
  assert.equal(state.enemy.conditions.fear, true);
});

test("a draw Modifier attaches to an action and grants cards only when that move succeeds", () => {
  let state = controlledState(passingSeed("cache-success", 80), "signal-surge-v0.2");
  state.player.hand = [card("player", "jab"), card("player", "cache-tap")];
  state.player.drawPile = [
    card("player", "guard"),
    card("player", "flank"),
    card("player", "charge"),
  ];
  state = placePlayerCard(state, "player-jab-1", 0);
  state = placePlayerCard(state, "player-cache-tap-1", 0);
  assert.equal(getLaneForecast(state, 0).playerMove.name, "SIGNAL STRIKE");
  assert.match(getLaneForecast(state, 0).successLabel, /DRAW 2/);
  state = resolveRound(state);
  assert.equal(state.currentReview.replenishment.cardEffectDraws, 2);
  assert.equal(state.currentReview.replenishment.playerDrawn, 2);
  assert.deepEqual(
    state.currentReview.replenishment.sources.map((entry) => entry.type),
    ["card"],
  );

  let failed = controlledState(failingSeed("cache-failure"), "signal-surge-v0.2");
  failed.player.hand = [card("player", "jab"), card("player", "cache-tap")];
  failed.player.drawPile = [card("player", "guard")];
  failed = placePlayerCard(failed, "player-jab-1", 0);
  failed = placePlayerCard(failed, "player-cache-tap-1", 0);
  failed = resolveRound(failed);
  assert.equal(failed.currentReview.laneResults[0].success, false);
  assert.equal(failed.currentReview.replenishment.cardEffectDraws, 0);
  assert.equal(failed.currentReview.replenishment.playerDrawn, 0);
});

test("Breacher Intercept grants separate contest and combo draws", () => {
  let state = controlledState(passingSeed("earned-combo", 70));
  state.player.hand = [card("player", "flank"), card("player", "guard")];
  state.player.drawPile = [card("player", "jab"), card("player", "charge")];
  setEnemyIntent(state, 0, ["rush"]);
  state = placePlayerCard(state, "player-flank-1", 0);
  state = placePlayerCard(state, "player-guard-1", 0);
  state = resolveRound(state);
  assert.equal(state.currentReview.laneResults[0].success, true);
  assert.equal(state.currentReview.replenishment.outcomeDraws, 2);
  assert.equal(state.currentReview.replenishment.playerDrawn, 2);
  assert.deepEqual(
    state.currentReview.replenishment.sources.map((entry) => entry.label),
    ["CONTEST", "COMBO"],
  );
});

test("Fractured Cache unlocks draws from Fear and Pressure milestones once", () => {
  let fear = controlledState(passingSeed("fear-unlock", 90), "fractured-cache-v0.2");
  fear.player.hand = [card("player", "flank"), card("player", "dread-pulse")];
  fear.player.drawPile = [card("player", "guard"), card("player", "jab")];
  fear = placePlayerCard(fear, "player-flank-1", 0);
  fear = placePlayerCard(fear, "player-dread-pulse-1", 0);
  fear = resolveRound(fear);
  assert.equal(fear.unlocks.fearDrawClaimed, true);
  assert.equal(fear.currentReview.replenishment.unlockDraws, 2);
  assert.equal(fear.currentReview.replenishment.sources[0].label, "FEAR UNLOCK");

  let pressure = controlledState(passingSeed("pressure-unlock", 65), "fractured-cache-v0.2");
  pressure.player.hand = [card("player", "heavy-strike")];
  pressure.player.drawPile = [card("player", "guard"), card("player", "jab")];
  pressure = placePlayerCard(pressure, "player-heavy-strike-1", 0);
  pressure = resolveRound(pressure);
  assert.equal(pressure.pressure, 2);
  assert.equal(pressure.unlocks.pressureDrawClaimed, true);
  assert.equal(pressure.currentReview.replenishment.unlockDraws, 2);
});

test("Cascade Protocol combines an earned draw with an automatic next-round draw", () => {
  let state = controlledState(passingSeed("mixed-feed", 70), "cascade-protocol-v0.2");
  state.player.hand = [card("player", "jab")];
  state.player.drawPile = [card("player", "guard"), card("player", "flank")];
  setEnemyIntent(state, 0, ["rush"]);
  state = placePlayerCard(state, "player-jab-1", 0);
  state = resolveRound(state);
  assert.equal(state.currentReview.replenishment.outcomeDraws, 1);
  assert.equal(state.player.hand.length, 1);
  state = startNextRound(state);
  assert.equal(state.currentRoundGrant.automaticCards, 1);
  assert.equal(state.player.hand.length, 2);
  assert.equal(state.currentRoundGrant.reserveBonus, 1);
});

test("visible probability is stepped and the deterministic roll stays hidden until resolve", () => {
  let state = controlledState("probability-forecast");
  state.player.hand = [card("player", "heavy-strike")];
  setEnemyIntent(state, 0, ["brace"]);
  const preview = getPlacementPreview(state, "player-heavy-strike-1", 0);
  assert.equal(preview.legal, true);
  assert.ok(preview.forecast.chance >= 15 && preview.forecast.chance <= 95);
  assert.equal(preview.forecast.chance % 5, 0);
  assert.equal("roll" in preview.forecast, false);
  assert.ok(preview.forecast.successLabel);
  assert.ok(preview.forecast.failureLabel);
  state = placePlayerCard(state, "player-heavy-strike-1", 0);
  state = resolveRound(state);
  assert.equal(typeof state.currentReview.laneResults[0].roll, "number");
  assert.match(
    state.currentReview.events.find((entry) => entry.type.startsWith("move-")).detail,
    /rolled \d+ against \d+%/,
  );
});

test("undo restores the exact rack, lane, Reserve, and pending event boundary", () => {
  let state = controlledState("undo");
  state.player.reserve = 10;
  state.player.hand = [card("player", "jab"), card("player", "guard")];
  const before = structuredClone(state);
  state = placePlayerCard(state, "player-jab-1", 2);
  state = undoPlayerAction(state);
  assert.deepEqual(state.player, before.player);
  assert.deepEqual(state.pendingEvents, before.pendingEvents);
  assert.equal(state.eventSequence, before.eventSequence);
  assert.match(state.notice, /returned to the rack/i);

  state = placePlayerCard(state, "player-jab-1", 2);
  state = returnPlayerCard(state, "player-jab-1");
  assert.deepEqual(state.player, before.player);
});

test("Reaction and Finisher requirements are enforced by lane context and Fear", () => {
  let state = controlledState("requirements");
  state.player.hand = [card("player", "parry"), card("player", "breakpoint")];
  let rejected = placePlayerCard(state, "player-parry-1", 0);
  assert.match(rejected.notice, /locked enemy attack/i);
  setEnemyIntent(state, 0, ["rush"]);
  state = placePlayerCard(state, "player-parry-1", 0);
  assert.equal(state.player.lanes[0][0].designId, "parry");
  rejected = placePlayerCard(state, "player-breakpoint-1", 1);
  assert.match(rejected.notice, /needs Fear/i);
});

test("Pressure Break refreshes both racks to six and clears Charge and Fear", () => {
  let state = controlledState(passingSeed("pressure-break", 65));
  state.pressure = 2;
  state.player.conditions.charge = true;
  state.enemy.conditions.fear = true;
  state.player.hand = [card("player", "jab")];
  state.player.drawPile = PLAYER_DECK.filter((entry) => entry.designId !== "jab")
    .slice(0, 8)
    .map((entry) => structuredClone(entry));
  state.enemy.drawPile = ENEMY_DECK.slice(0, 8).map((entry) => structuredClone(entry));
  state = placePlayerCard(state, "player-jab-1", 0);
  state = resolveRound(state);
  assert.equal(state.currentReview.breakTriggered, true);
  assert.equal(state.pressure, 4);
  assert.equal(state.player.hand.length, 6);
  assert.equal(state.enemy.hand.length, 6);
  assert.equal(state.player.conditions.charge, false);
  assert.equal(state.enemy.conditions.fear, false);
  assert.equal(state.currentReview.replenishment.sources[0].type, "break");
  assert.ok(reviewEventTypes(state).includes("break"));
});

test("victory at either Pressure endpoint resolves before a Break refresh", () => {
  let state = controlledState(passingSeed("endpoint", 80));
  state.pressure = 4;
  state.player.hand = [card("player", "jab")];
  state = placePlayerCard(state, "player-jab-1", 0);
  state = resolveRound(state);
  assert.equal(state.phase, "result");
  assert.equal(state.result.winner, "player");
  assert.equal(state.pressure, 5);
  assert.equal(state.currentReview.breakTriggered, false);
  assert.ok(reviewEventTypes(state).includes("victory"));
  assert.equal(reviewEventTypes(state).includes("break"), false);
});

test("enemy intents are seeded and locked before player staging", () => {
  const state = createCardBattleState("blind-ai");
  const before = structuredClone(state.enemyPreview);
  const legal = state.player.hand.flatMap((entry) =>
    [0, 1, 2, 3].map((lane) => getPlacementPreview(state, entry.id, lane)),
  ).find((entry) => entry.legal);
  assert.ok(legal);
  const after = placePlayerCard(state, legal.card.id, legal.lane);
  assert.deepEqual(after.enemyPreview, before);
  assert.notDeepEqual(after.player.lanes, state.player.lanes);
});

test("round review events expose causal lane outcomes, Pressure, and replenishment", () => {
  let state = controlledState(passingSeed("causal-events", 70));
  state.player.hand = [card("player", "jab")];
  state.player.drawPile = [card("player", "guard")];
  setEnemyIntent(state, 0, ["rush"]);
  state = placePlayerCard(state, "player-jab-1", 0);
  state = resolveRound(state);
  assertCausalEvents(state.currentReview.events);
  assert.ok(reviewEventTypes(state).includes("move-success"));
  assert.ok(reviewEventTypes(state).includes("pressure"));
  assert.ok(reviewEventTypes(state).includes("replenish"));
  assert.equal(state.currentReview.laneResults.length, 4);
});

test("deterministic simulations terminate and exercise named stacks under every scenario recipe", () => {
  for (const scenario of CARD_BATTLE_SCENARIOS) {
    const result = runDeterministicSimulation({
      battles: 40,
      seedPrefix: `contract-${scenario.id}`,
      maxRounds: 40,
      scenarioId: scenario.id,
    });
    assert.equal(result.scenarioId, scenario.id);
    assert.equal(result.unfinished, 0, `${scenario.name} unfinished`);
    assert.equal(result.playerWins + result.enemyWins, 40);
    assert.ok(result.averageRounds >= 1 && result.averageRounds < 10);
    assert.ok(result.successRate > 0 && result.successRate < 1);
    assert.ok(Object.keys(result.namedCombos).length > 0);
  }
});
