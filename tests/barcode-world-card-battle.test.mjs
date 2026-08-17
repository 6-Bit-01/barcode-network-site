import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CARD_BATTLE_RULES,
  ENEMY_CARD_DEFINITIONS,
  ENEMY_DECK,
  PLAYER_CARD_DEFINITIONS,
  PLAYER_DECK,
  cancelOutflank,
  createCardBattleState,
  deterministicShuffle,
  placePlayerCard,
  planEnemyPlacements,
  replayNewShuffle,
  replaySameState,
  resolveRound,
  returnPlayerCard,
  runDeterministicSimulation,
  startNextRound,
  undoPlayerAction,
  useOutflank,
} from "../src/lib/barcode-world/card-battle-engine.mjs";

function active(side, designId, copy = 1, enteredRound = 0, overrides = {}) {
  const definitions = side === "player" ? PLAYER_CARD_DEFINITIONS : ENEMY_CARD_DEFINITIONS;
  const definition = definitions[designId];
  return {
    ...definition,
    id: `${side}-${designId}-${copy}`,
    designId,
    side,
    copy,
    maxHealth: definition.health,
    currentHealth: definition.health,
    powerBonus: 0,
    healthBonus: 0,
    temporaryPowerBonus: 0,
    enteredRound,
    damageReductionAvailable: designId === "enforcer",
    ...overrides,
  };
}

function card(side, designId, copy = 1) {
  const deck = side === "player" ? PLAYER_DECK : ENEMY_DECK;
  return structuredClone(deck.find((entry) => entry.designId === designId && entry.copy === copy));
}

function controlledState(seed = "controlled") {
  const state = createCardBattleState(seed);
  state.player.hand = [];
  state.player.drawPile = [];
  state.player.discard = [];
  state.player.lanes = [null, null, null, null];
  state.enemy.hand = [];
  state.enemy.drawPile = [];
  state.enemy.discard = [];
  state.enemy.lanes = [null, null, null, null];
  state.enemyPreview = { round: state.round, locked: true, placements: [] };
  state.pendingPlayerActions = [];
  state.pendingEvents = [];
  state.currentReview = null;
  state.history = [];
  state.eventSequence = 0;
  state.playerActionSequence = 0;
  state.player.command = 6;
  state.enemy.command = 0;
  return state;
}

function eventTypes(state) {
  return state.currentReview.events.map((entry) => entry.type);
}

function assertCausalEvents(events) {
  assert.ok(events.length > 0);
  for (const entry of events) {
    assert.equal(typeof entry.sceneCue, "string", `${entry.id} sceneCue type`);
    assert.ok(entry.sceneCue.length > 0, `${entry.id} has a scene cue`);
    assert.equal(typeof entry.detail, "string", `${entry.id} detail type`);
    assert.ok(entry.detail.length > 0, `${entry.id} has causal detail`);
  }
}

function allZoneIds(state, side) {
  const actor = state[side];
  return [
    ...actor.drawPile,
    ...actor.hand,
    ...actor.discard,
    ...actor.lanes.filter(Boolean),
    ...(side === "enemy" && state.phase === "player-action"
      ? state.enemyPreview.placements.map((entry) => entry.card)
      : []),
  ].map((entry) => entry.id);
}

test("exact decks contain twelve unique instances and two copies of every approved design", () => {
  for (const [side, deck, definitions] of [
    ["player", PLAYER_DECK, PLAYER_CARD_DEFINITIONS],
    ["enemy", ENEMY_DECK, ENEMY_CARD_DEFINITIONS],
  ]) {
    assert.equal(deck.length, 12, `${side} deck size`);
    assert.equal(new Set(deck.map((entry) => entry.id)).size, 12, `${side} instance ids`);
    assert.deepEqual(new Set(deck.map((entry) => entry.designId)), new Set(Object.keys(definitions)));
    for (const [designId, definition] of Object.entries(definitions)) {
      const copies = deck.filter((entry) => entry.designId === designId);
      assert.deepEqual(copies.map((entry) => entry.copy), [1, 2]);
      for (const instance of copies) {
        assert.equal(instance.side, side);
        assert.deepEqual(
          { name: instance.name, cost: instance.cost, power: instance.power, health: instance.health, ability: instance.ability },
          { name: definition.name, cost: definition.cost, power: definition.power, health: definition.health, ability: definition.ability },
        );
      }
    }
  }
});

test("seeded Fisher-Yates openings replay exactly while a new shuffle changes domains", () => {
  const first = createCardBattleState("replay-proof");
  const duplicate = createCardBattleState("replay-proof");
  assert.deepEqual(first, duplicate);
  assert.deepEqual(replaySameState(first), first);

  const next = replayNewShuffle(first);
  assert.equal(next.baseSeed, first.baseSeed);
  assert.equal(next.shuffleIndex, first.shuffleIndex + 1);
  assert.notEqual(next.seed, first.seed);
  assert.notDeepEqual(next.player.hand.map((entry) => entry.id), first.player.hand.map((entry) => entry.id));
  assert.deepEqual(
    deterministicShuffle([1, 2, 3, 4, 5], "domain-a"),
    deterministicShuffle([1, 2, 3, 4, 5], "domain-a"),
  );
  assert.notDeepEqual(
    deterministicShuffle([1, 2, 3, 4, 5], "domain-a"),
    deterministicShuffle([1, 2, 3, 4, 5], "domain-b"),
  );
});

test("setup deals real five-card hands and fixes the lone opening Bruiser in Lane 2", () => {
  const state = createCardBattleState("opening-zones");
  assert.equal(state.phase, "player-action");
  assert.equal(state.round, 1);
  assert.equal(state.player.hand.length, 5);
  assert.equal(state.player.drawPile.length, 7);
  assert.equal(state.enemy.hand.length + state.enemyPreview.placements.length, 5);
  assert.equal(state.enemy.drawPile.length, 6);
  assert.equal(state.enemy.lanes.filter(Boolean).length, 1);
  assert.equal(state.enemy.lanes[CARD_BATTLE_RULES.startingBruiserLane].designId, "bruiser");
  assert.equal(state.enemy.lanes[CARD_BATTLE_RULES.startingBruiserLane].enteredRound, 0);
  assert.equal(state.enemyPreview.locked, true);
  assert.equal(state.player.command, 3);
  assert.ok(state.enemy.command >= 0 && state.enemy.command <= 3);
  assert.equal(new Set(allZoneIds(state, "player")).size, 12);
  assert.equal(new Set(allZoneIds(state, "enemy")).size, 12);
});

test("Command gains three, banks to six, and only later rounds draw one card", () => {
  let state = controlledState("command-draw");
  state.player.command = 4;
  state.enemy.command = 5;
  state.player.drawPile = [card("player", "hold-ground")];
  state.enemy.drawPile = [card("enemy", "rush")];
  state = resolveRound(state);
  state = startNextRound(state);
  assert.equal(state.round, 2);
  assert.equal(state.player.command, 6);
  assert.ok(state.enemy.command <= 6);
  assert.equal(state.player.hand.length, 1);
  assert.equal(state.player.hand[0].designId, "hold-ground");
  assert.equal(state.pendingEvents.filter((entry) => entry.type === "draw").length, 2);
});

test("affordability is enforced and replacement discards without a false destroy trigger", () => {
  let state = controlledState("replacement");
  state.player.command = 1;
  state.player.hand = [card("player", "linebreaker"), card("player", "hold-ground")];
  state.player.lanes[0] = active("player", "scout-route", 1, 0, { currentHealth: 1 });
  const blocked = placePlayerCard(state, state.player.hand[0].id, 0);
  assert.equal(blocked.player.lanes[0].designId, "scout-route");
  assert.match(blocked.notice, /need 3 Command/i);

  state = placePlayerCard(state, state.player.hand[1].id, 0);
  assert.equal(state.player.lanes[0].designId, "hold-ground");
  assert.equal(state.player.command, 0);
  assert.deepEqual(state.player.discard.map((entry) => entry.designId), ["scout-route"]);
  state = resolveRound(state);
  assert.ok(eventTypes(state).includes("replace"));
  assert.equal(state.currentReview.events.some((entry) => entry.type === "destroy" && entry.title.includes("Scout Route")), false);
  assert.equal(state.player.hand.some((entry) => entry.designId === "linebreaker"), true);
});

test("Intercept, Last Opening, Brace, and Last Push apply only their exact entry bonuses", () => {
  let state = controlledState("entry-bonuses");
  state.pressure = -1;
  state.player.hand = [card("player", "intercept"), card("player", "last-opening")];
  state.enemyPreview = {
    round: 1,
    locked: true,
    placements: [{ card: card("enemy", "brace"), cardId: "enemy-brace-1", designId: "brace", lane: 0, cost: 1, replacesCardId: null, score: 1 }],
  };
  state = placePlayerCard(state, "player-intercept-1", 0);
  state = placePlayerCard(state, "player-last-opening-1", 1);
  assert.equal(state.player.lanes[0].maxHealth, 3, "Intercept sees the locked preview");
  assert.equal(state.player.lanes[0].powerBonus, 0);
  assert.equal(state.player.lanes[1].maxHealth, 4, "Last Opening enters while behind");
  assert.equal(state.player.lanes[1].powerBonus, 1);
  state = resolveRound(state);
  assert.equal(state.enemy.lanes[0].maxHealth, 4, "Brace enters opposed");

  let enemyBehind = controlledState("last-push");
  enemyBehind.pressure = 1;
  enemyBehind.player.lanes[2] = active("player", "hold-ground");
  enemyBehind.enemyPreview = {
    round: 1,
    locked: true,
    placements: [{ card: card("enemy", "last-push"), cardId: "enemy-last-push-1", designId: "last-push", lane: 2, cost: 3, replacesCardId: null, score: 1 }],
  };
  enemyBehind = resolveRound(enemyBehind);
  assert.equal(enemyBehind.enemy.lanes[2].maxHealth, 3);
  assert.equal(enemyBehind.enemy.lanes[2].powerBonus, 1);
});

test("four lanes resolve simultaneously, survivor damage persists, and mutual destruction is possible", () => {
  let state = controlledState("simultaneous");
  state.player.lanes[0] = active("player", "hold-ground");
  state.enemy.lanes[0] = active("enemy", "bruiser", 2);
  state.player.lanes[1] = active("player", "intercept");
  state.enemy.lanes[1] = active("enemy", "breaker");
  state = resolveRound(state);
  assert.equal(state.player.lanes[0], null);
  assert.equal(state.enemy.lanes[0].currentHealth, 1);
  assert.equal(state.player.lanes[1], null);
  assert.equal(state.enemy.lanes[1], null);
  assert.equal(state.player.discard.some((entry) => entry.designId === "intercept"), true);
  assert.equal(state.enemy.discard.some((entry) => entry.designId === "breaker"), true);
  assert.equal(state.currentReview.events.filter((entry) => entry.type === "clash").length, 2);
});

test("Scout Route draws on destruction and Enforcer reduces only the first damage it receives", () => {
  let scout = controlledState("scout-trigger");
  scout.player.drawPile = [card("player", "flank")];
  scout.player.lanes[0] = active("player", "scout-route");
  scout.enemy.lanes[0] = active("enemy", "breaker");
  scout = resolveRound(scout);
  assert.equal(scout.player.lanes[0], null);
  assert.deepEqual(scout.player.hand.map((entry) => entry.designId), ["flank"]);
  assert.equal(scout.currentReview.events.some((entry) => entry.sceneCue === "scout-draw"), true);

  let enforcer = controlledState("enforcer-persistence");
  enforcer.player.lanes[0] = active("player", "hold-ground");
  enforcer.enemy.lanes[0] = active("enemy", "enforcer");
  enforcer = resolveRound(enforcer);
  assert.equal(enforcer.enemy.lanes[0].currentHealth, 3, "first 2 damage is reduced to 1");
  assert.equal(enforcer.enemy.lanes[0].damageReductionAvailable, false);
  enforcer = startNextRound(enforcer);
  enforcer.enemyPreview = { round: enforcer.round, locked: true, placements: [] };
  enforcer.player.lanes[0] = active("player", "hold-ground", 2, enforcer.round);
  enforcer = resolveRound(enforcer);
  assert.equal(enforcer.enemy.lanes[0].currentHealth, 1, "later 2 damage is not reduced");
  assert.equal(enforcer.enemy.lanes[0].damageReductionAvailable, false);
});

test("unblocked effective Power nets once and Linebreaker adds its printed Pressure effect", () => {
  let state = controlledState("pressure-net");
  state.player.lanes[0] = active("player", "flank");
  state.enemy.lanes[1] = active("enemy", "rush");
  state.player.lanes[2] = active("player", "linebreaker");
  state.enemy.lanes[2] = active("enemy", "breaker", 1, 0, { currentHealth: 2 });
  state = resolveRound(state);
  assert.equal(state.pressure, 2, "Flank +3 and Rush -2 net +1; Linebreaker adds +1");
  assert.equal(state.currentReview.events.some((entry) => entry.sceneCue === "linebreaker-pressure"), true);
  assert.equal(state.currentReview.pressureDelta, 2);
});

test("victory at an end is checked before Pressure Break", () => {
  let state = controlledState("victory-before-break");
  state.pressure = 2;
  state.player.lanes[0] = active("player", "linebreaker");
  state = resolveRound(state);
  assert.equal(state.pressure, 5);
  assert.equal(state.phase, "result");
  assert.equal(state.result.winner, "player");
  assert.equal(eventTypes(state).includes("victory"), true);
  assert.equal(eventTypes(state).includes("break"), false);
  assert.notEqual(state.player.lanes[0], null, "victory prevents Break clear");
});

test("enemy-side victory and negative Break mirror the player-side rules", () => {
  let victory = controlledState("enemy-victory-before-break");
  victory.pressure = -2;
  victory.enemy.lanes[0] = active("enemy", "enforcer");
  victory = resolveRound(victory);
  assert.equal(victory.pressure, -5);
  assert.equal(victory.phase, "result");
  assert.equal(victory.result.winner, "enemy");
  assert.equal(eventTypes(victory).includes("break"), false);

  let negativeBreak = controlledState("negative-break");
  negativeBreak.pressure = -2;
  negativeBreak.enemy.lanes[0] = active("enemy", "rush");
  negativeBreak.player.lanes[1] = active("player", "hold-ground");
  negativeBreak = resolveRound(negativeBreak);
  assert.equal(negativeBreak.pressure, -3);
  assert.equal(negativeBreak.currentReview.breakTriggered, true);
  assert.equal(negativeBreak.breakArmed, false);
  assert.deepEqual(negativeBreak.player.lanes, [null, null, null, null]);
  assert.deepEqual(negativeBreak.enemy.lanes, [null, null, null, null]);
});

test("Pressure Break finishes the clash, clears both boards, retains Pressure, disarms, then rearms centrally", () => {
  let state = controlledState("break-cycle");
  state.pressure = 2;
  state.player.lanes[0] = active("player", "hold-ground");
  state.player.lanes[2] = active("player", "flank");
  state.enemy.lanes[0] = active("enemy", "brace");
  state.enemy.lanes[3] = active("enemy", "rush");
  state = resolveRound(state);
  assert.equal(state.pressure, 3);
  assert.equal(state.currentReview.breakTriggered, true);
  assert.equal(state.breakArmed, false);
  assert.deepEqual(state.player.lanes, [null, null, null, null]);
  assert.deepEqual(state.enemy.lanes, [null, null, null, null]);
  assert.equal(state.player.discard.length, 2);
  assert.equal(state.enemy.discard.length, 2);
  assert.ok(state.currentReview.events.every((entry) => entry.type !== "destroy"));

  state = startNextRound(state);
  state.enemyPreview = { round: state.round, locked: true, placements: [] };
  state.enemy.lanes = [active("enemy", "rush"), null, null, null];
  state.player.lanes = [null, active("player", "hold-ground"), null, null];
  state = resolveRound(state);
  assert.equal(state.pressure, 2);
  assert.equal(state.breakArmed, true);
  assert.equal(eventTypes(state).includes("break-rearm"), true);
  assert.equal(eventTypes(state).includes("break"), false);
});

test("Outflank moves only a prior-round card to an open lane, grants one-clash Power, and is once per battle", () => {
  let state = controlledState("outflank");
  state.round = 2;
  state.player.lanes[0] = active("player", "hold-ground", 1, 1);
  state.player.lanes[2] = active("player", "flank", 1, 2);
  const ineligible = useOutflank(state, 2, 3);
  assert.match(ineligible.notice, /played this round/i);
  state.player.lanes[2] = null;
  state.pressure = 1;

  state = useOutflank(state, 0, 1);
  assert.equal(state.player.lanes[0], null);
  assert.equal(state.player.lanes[1].temporaryPowerBonus, 1);
  assert.equal(state.outflank.used, true);
  const second = useOutflank(state, 1, 3);
  assert.match(second.notice, /already been used/i);
  state = resolveRound(state);
  assert.equal(state.pressure, 3);
  assert.equal(state.outflank.pending, null);
  assert.equal(state.outflank.used, true);
  assert.equal(state.player.lanes[1], null, "Break clears the Outflanking card after its +2 direct press");
  assert.equal(state.currentReview.events.some((entry) => entry.type === "outflank"), true);
});

test("enemy preview is legal, deterministic, locked, and blind to player hand contents", () => {
  const state = createCardBattleState("blind-ai");
  const altered = structuredClone(state);
  altered.player.hand = PLAYER_DECK.slice(0, 5).map((entry) => structuredClone(entry));
  assert.deepEqual(planEnemyPlacements(altered), planEnemyPlacements(state));
  assert.equal(state.enemyPreview.locked, true);
  assert.equal(state.enemyPreview.round, state.round);
  assert.equal(new Set(state.enemyPreview.placements.map((entry) => entry.lane)).size, state.enemyPreview.placements.length);
  assert.ok(state.enemyPreview.placements.reduce((sum, entry) => sum + entry.cost, 0) <= 3);
  assert.ok(state.enemyPreview.placements.every((entry) => ENEMY_DECK.some((cardEntry) => cardEntry.id === entry.cardId)));

  const locked = structuredClone(state.enemyPreview);
  const affordable = state.player.hand.find((entry) => entry.cost <= state.player.command);
  const afterPlayer = placePlayerCard(state, affordable.id, 0);
  assert.deepEqual(afterPlayer.enemyPreview, locked);
});

test("undo restores the exact pending play or Outflank state without affecting locked preview", () => {
  let state = createCardBattleState("undo");
  const initial = structuredClone(state);
  const affordable = state.player.hand.find((entry) => entry.cost <= state.player.command);
  state = placePlayerCard(state, affordable.id, 0);
  state = undoPlayerAction(state);
  assert.deepEqual(state.player, initial.player);
  assert.deepEqual(state.enemyPreview, initial.enemyPreview);

  state.round = 2;
  state.player.lanes[0] = active("player", "hold-ground", 1, 1);
  const beforeOutflank = structuredClone(state.player.lanes);
  state = useOutflank(state, 0, 3);
  state = undoPlayerAction(state);
  assert.deepEqual(state.player.lanes, beforeOutflank);
  assert.deepEqual(state.outflank, { used: false, pending: null });
});

test("direct return and cancel paths keep action identities causal and collision-free", () => {
  let state = controlledState("direct-cancel-paths");
  state.player.hand = [
    card("player", "hold-ground"),
    card("player", "scout-route"),
    card("player", "flank"),
  ];
  state = placePlayerCard(state, "player-hold-ground-1", 0);
  state = placePlayerCard(state, "player-scout-route-1", 1);
  const scoutActionId = state.pendingPlayerActions[1].actionId;
  state = returnPlayerCard(state, "player-hold-ground-1");
  state = placePlayerCard(state, "player-flank-1", 2);
  assert.equal(new Set(state.pendingPlayerActions.map((action) => action.actionId)).size, 2);
  assert.notEqual(state.pendingPlayerActions[1].actionId, scoutActionId);
  state = undoPlayerAction(state);
  assert.equal(state.player.lanes[1].designId, "scout-route");
  assert.equal(state.pendingPlayerActions.length, 1);
  assert.equal(state.pendingPlayerActions[0].actionId, scoutActionId);
  assert.ok(state.pendingEvents.some((entry) => entry.actionId === scoutActionId));
  state = undoPlayerAction(state);
  assert.deepEqual(
    state.player.hand.map((entry) => entry.designId),
    ["hold-ground", "scout-route", "flank"],
  );

  let outflank = controlledState("direct-outflank-cancel");
  outflank.round = 2;
  outflank.player.lanes[0] = active("player", "hold-ground", 1, 1);
  const before = structuredClone(outflank.player.lanes);
  outflank = useOutflank(outflank, 0, 3);
  outflank = cancelOutflank(outflank);
  assert.deepEqual(outflank.player.lanes, before);
  assert.deepEqual(outflank.outflank, { used: false, pending: null });
  assert.equal(outflank.pendingPlayerActions.length, 0);
  assert.equal(outflank.pendingEvents.some((entry) => entry.type === "outflank"), false);
});

test("empty draw piles reshuffle discard deterministically without losing or duplicating cards", () => {
  let state = controlledState("reshuffle-proof");
  state.player.discard = [card("player", "hold-ground"), card("player", "flank")];
  state.enemy.discard = [card("enemy", "rush"), card("enemy", "brace")];
  state = resolveRound(state);
  const replayInput = structuredClone(state);
  const first = startNextRound(state);
  const second = startNextRound(replayInput);
  assert.deepEqual(first, second);
  assert.equal(first.rng.playerReshuffles, 1);
  assert.equal(first.rng.enemyReshuffles, 1);
  assert.equal(first.player.discard.length, 0);
  assert.equal(first.enemy.discard.length, 0);
  assert.equal(first.player.hand.length, 1);
  assert.equal(first.player.drawPile.length, 1);
  assert.equal(
    first.enemy.hand.length + first.enemy.drawPile.length + first.enemyPreview.placements.length,
    2,
  );
  assert.equal(first.pendingEvents.filter((entry) => entry.type === "reshuffle").length, 2);
  assertCausalEvents(first.pendingEvents);
});

test("public engine transitions are pure and invalid actions do not mutate their input", () => {
  const original = createCardBattleState("purity");
  const snapshot = structuredClone(original);
  const affordable = original.player.hand.find((entry) => entry.cost <= original.player.command);
  const placed = placePlayerCard(original, affordable.id, 0);
  assert.deepEqual(original, snapshot);
  const placedSnapshot = structuredClone(placed);
  const resolved = resolveRound(placed);
  assert.deepEqual(placed, placedSnapshot);
  assert.notEqual(resolved, placed);

  const invalidSnapshot = structuredClone(original);
  const invalid = placePlayerCard(original, "missing-card", 9);
  assert.deepEqual(original, invalidSnapshot);
  assert.notEqual(invalid, original);
  assert.match(invalid.notice, /four lanes/i);
});

test("every emitted event has a causal scene cue and normal play preserves twelve unique instances per side", () => {
  let state = createCardBattleState("event-and-zones");
  for (let rounds = 0; rounds < 3 && state.phase !== "result"; rounds += 1) {
    const affordable = state.player.hand.find((entry) => entry.cost <= state.player.command);
    if (affordable) state = placePlayerCard(state, affordable.id, rounds % 4);
    state = resolveRound(state);
    assertCausalEvents(state.currentReview.events);
    assert.equal(allZoneIds(state, "player").length, 12);
    assert.equal(new Set(allZoneIds(state, "player")).size, 12);
    assert.equal(allZoneIds(state, "enemy").length, 12);
    assert.equal(new Set(allZoneIds(state, "enemy")).size, 12);
    if (state.phase === "round-review") state = startNextRound(state);
  }
  assert.equal("storage" in state, false);
  assert.equal("account" in state, false);
  assert.equal("profile" in state, false);
});

test("the checked-in fixed-seed simulation artifact is exactly reproducible", async () => {
  const artifact = JSON.parse(
    await readFile("tests/artifacts/barcode-world-card-battle-simulation-v0.1.json", "utf8"),
  );
  const result = runDeterministicSimulation(artifact.run);
  const { rounds, ...summary } = result;
  const roundsChecksum = rounds.reduce(
    (hash, value, index) => Math.imul(hash ^ ((value + index) & 255), 16777619) >>> 0,
    2166136261,
  );
  assert.deepEqual(summary, artifact.summary);
  assert.equal(roundsChecksum, artifact.roundsChecksum);
});
