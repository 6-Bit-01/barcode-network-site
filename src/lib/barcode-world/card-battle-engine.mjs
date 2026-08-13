export const CARD_BATTLE_SOURCE =
  "BARCODE_WORLD_CARD_BATTLE_TRANSITION_AND_WORK_HANDOFF_2026-08-12_REV1";

export const CARD_BATTLE_RULES = Object.freeze({
  lanes: 4,
  openingHand: 5,
  drawAfterRoundOne: 1,
  commandPerRound: 3,
  commandCap: 6,
  pressureMin: -5,
  pressureMax: 5,
  playerBreak: 3,
  enemyBreak: -3,
  breakRearmMin: -2,
  breakRearmMax: 2,
  startingBruiserLane: 1,
});

export const PLAYER_CARD_DEFINITIONS = Object.freeze({
  "hold-ground": Object.freeze({
    id: "hold-ground",
    name: "Hold Ground",
    cost: 1,
    power: 1,
    health: 3,
    ability: "+1 Power while blocked.",
  }),
  "scout-route": Object.freeze({
    id: "scout-route",
    name: "Scout Route",
    cost: 1,
    power: 1,
    health: 2,
    ability: "Draw one card when destroyed.",
  }),
  intercept: Object.freeze({
    id: "intercept",
    name: "Intercept",
    cost: 2,
    power: 2,
    health: 2,
    ability: "+1 Health when played opposite a previewed enemy.",
  }),
  flank: Object.freeze({
    id: "flank",
    name: "Flank",
    cost: 2,
    power: 2,
    health: 2,
    ability: "+1 Power while unblocked.",
  }),
  linebreaker: Object.freeze({
    id: "linebreaker",
    name: "Linebreaker",
    cost: 3,
    power: 3,
    health: 3,
    ability: "Shift Pressure +1 when it destroys an enemy card.",
  }),
  "last-opening": Object.freeze({
    id: "last-opening",
    name: "Last Opening",
    cost: 3,
    power: 2,
    health: 3,
    ability: "If the player is behind when played, gain +1 Power and +1 Health.",
  }),
});

export const ENEMY_CARD_DEFINITIONS = Object.freeze({
  rush: Object.freeze({
    id: "rush",
    name: "Rush",
    cost: 1,
    power: 1,
    health: 1,
    ability: "+1 Power while unblocked.",
  }),
  brace: Object.freeze({
    id: "brace",
    name: "Brace",
    cost: 1,
    power: 1,
    health: 3,
    ability: "+1 Health if opposed when it enters.",
  }),
  bruiser: Object.freeze({
    id: "bruiser",
    name: "Bruiser",
    cost: 2,
    power: 2,
    health: 3,
    ability: "+1 Power while blocked.",
  }),
  breaker: Object.freeze({
    id: "breaker",
    name: "Breaker",
    cost: 2,
    power: 2,
    health: 2,
    ability: "Deals +1 damage to opposing cards.",
  }),
  enforcer: Object.freeze({
    id: "enforcer",
    name: "Enforcer",
    cost: 3,
    power: 3,
    health: 4,
    ability: "Reduce the first damage it receives by 1.",
  }),
  "last-push": Object.freeze({
    id: "last-push",
    name: "Last Push",
    cost: 3,
    power: 3,
    health: 2,
    ability: "If the enemy is behind when played, gain +1 Power and +1 Health.",
  }),
});

export const ENEMY_AI_TUNING = Object.freeze({
  contestOccupiedLane: 5,
  openLanePressurePerPower: 1.4,
  lethalContest: 2,
  replaceActivePenalty: 2.25,
  powerWeight: 0.9,
  healthWeight: 0.35,
  commandEfficiencyWeight: 0.2,
  normalPlacementLimit: 1,
  behindPlacementLimit: 2,
  aheadPlacementLimit: 0,
});

const PLAYER_DESIGNS = Object.keys(PLAYER_CARD_DEFINITIONS);
const ENEMY_DESIGNS = Object.keys(ENEMY_CARD_DEFINITIONS);
const LANES_FOR_ENGINE = Array.from({ length: CARD_BATTLE_RULES.lanes }, (_, lane) => lane);

function clone(value) {
  return structuredClone(value);
}

function emptyLanes() {
  return Array.from({ length: CARD_BATTLE_RULES.lanes }, () => null);
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomSequence(seed) {
  let value = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicShuffle(items, seed) {
  const shuffled = [...items];
  const random = randomSequence(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function makeDeck(side) {
  const definitions = side === "player" ? PLAYER_CARD_DEFINITIONS : ENEMY_CARD_DEFINITIONS;
  const designs = side === "player" ? PLAYER_DESIGNS : ENEMY_DESIGNS;
  return designs.flatMap((designId) =>
    [1, 2].map((copy) => ({
      ...definitions[designId],
      id: `${side}-${designId}-${copy}`,
      designId,
      side,
      copy,
    })),
  );
}

export const PLAYER_DECK = Object.freeze(makeDeck("player").map(Object.freeze));
export const ENEMY_DECK = Object.freeze(makeDeck("enemy").map(Object.freeze));

function activeCard(card, round, entry = {}) {
  const powerBonus = entry.powerBonus ?? 0;
  const healthBonus = entry.healthBonus ?? 0;
  return {
    ...card,
    maxHealth: card.health + healthBonus,
    currentHealth: card.health + healthBonus,
    powerBonus,
    healthBonus,
    temporaryPowerBonus: 0,
    enteredRound: round,
    damageReductionAvailable: card.designId === "enforcer",
  };
}

function zoneCard(card) {
  return {
    id: card.id,
    designId: card.designId,
    side: card.side,
    copy: card.copy,
    name: card.name,
    cost: card.cost,
    power: card.power,
    health: card.health,
    ability: card.ability,
  };
}

function event(state, type, title, detail, sceneCue, lane = null, side = "system", actionId = null) {
  const sequence = state.eventSequence + 1;
  state.eventSequence = sequence;
  return {
    id: `round-${state.round}-event-${sequence}`,
    round: state.round,
    type,
    title,
    detail,
    sceneCue,
    lane,
    side,
    actionId,
  };
}

function derivedSeed(baseSeed, shuffleIndex) {
  return shuffleIndex === 0 ? baseSeed : `${baseSeed}::shuffle-${shuffleIndex}`;
}

function drawOne(state, side, eventSink = state.pendingEvents) {
  const actor = state[side];
  if (actor.drawPile.length === 0 && actor.discard.length > 0) {
    const key = side === "player" ? "playerReshuffles" : "enemyReshuffles";
    const reshuffleIndex = state.rng[key];
    actor.drawPile = deterministicShuffle(
      actor.discard.map(zoneCard),
      `${state.seed}|${side}|reshuffle|${reshuffleIndex}`,
    );
    actor.discard = [];
    state.rng[key] += 1;
    eventSink.push(event(
      state,
      "reshuffle",
      `${side === "player" ? "Battle / Exploration" : "Breacher"} discard reshuffled`,
      `The empty ${side} draw pile was rebuilt deterministically.`,
      `reshuffle-${side}`,
      null,
      side,
    ));
  }
  const card = actor.drawPile.shift();
  if (card) actor.hand.push(card);
  return card ?? null;
}

function enemyEntry(state, card, lane) {
  let healthBonus = 0;
  let powerBonus = 0;
  if (card.designId === "brace" && state.player.lanes[lane]) healthBonus = 1;
  if (card.designId === "last-push" && state.pressure > 0) {
    healthBonus = 1;
    powerBonus = 1;
  }
  return activeCard(card, state.round, { healthBonus, powerBonus });
}

function playerEntry(state, card, lane) {
  let healthBonus = 0;
  let powerBonus = 0;
  const previewed = state.enemyPreview.placements.some((placement) => placement.lane === lane);
  if (card.designId === "intercept" && previewed) healthBonus = 1;
  if (card.designId === "last-opening" && state.pressure < 0) {
    healthBonus = 1;
    powerBonus = 1;
  }
  return activeCard(card, state.round, { healthBonus, powerBonus });
}

function effectivePower(card, blocked) {
  if (!card) return 0;
  let power = card.power + card.powerBonus + card.temporaryPowerBonus;
  if (blocked && ["hold-ground", "bruiser"].includes(card.designId)) power += 1;
  if (!blocked && ["flank", "rush"].includes(card.designId)) power += 1;
  return power;
}

function scoreEnemyPlacement(card, lane, publicState, projectedEnemyLanes) {
  const playerCard = publicState.playerLanes[lane];
  const enemyCard = projectedEnemyLanes[lane];
  let score =
    card.power * ENEMY_AI_TUNING.powerWeight +
    card.health * ENEMY_AI_TUNING.healthWeight +
    (card.power / card.cost) * ENEMY_AI_TUNING.commandEfficiencyWeight;
  if (playerCard) {
    score += ENEMY_AI_TUNING.contestOccupiedLane;
    const damage = card.power + (card.designId === "breaker" ? 1 : 0);
    if (damage >= playerCard.currentHealth) score += ENEMY_AI_TUNING.lethalContest;
  } else {
    const pressurePower = card.power + (card.designId === "rush" ? 1 : 0);
    score += pressurePower * ENEMY_AI_TUNING.openLanePressurePerPower;
  }
  if (enemyCard) score -= ENEMY_AI_TUNING.replaceActivePenalty;
  if (card.designId === "last-push" && publicState.pressure > 0) score += 1.25;
  if (card.designId === "brace" && playerCard) score += 0.75;
  return score;
}

export function planEnemyPlacements(state) {
  const publicState = {
    pressure: state.pressure,
    playerLanes: state.player.lanes.map((card) => card ? {
      designId: card.designId,
      currentHealth: card.currentHealth,
      power: card.power,
    } : null),
  };
  const hand = state.enemy.hand.map(zoneCard);
  const projectedEnemyLanes = state.enemy.lanes.map((card) => card ? { ...card } : null);
  let command = state.enemy.command;
  const placements = [];
  const usedLanes = new Set();
  const random = randomSequence(`${state.seed}|enemy-ai|round-${state.round}`);
  const placementLimit = state.pressure > 0
    ? ENEMY_AI_TUNING.behindPlacementLimit
    : state.pressure < 0
      ? ENEMY_AI_TUNING.aheadPlacementLimit
      : ENEMY_AI_TUNING.normalPlacementLimit;

  while (placements.length < placementLimit) {
    const options = [];
    for (const card of hand) {
      if (card.cost > command) continue;
      for (let lane = 0; lane < CARD_BATTLE_RULES.lanes; lane += 1) {
        if (usedLanes.has(lane)) continue;
        options.push({
          card,
          lane,
          score: scoreEnemyPlacement(card, lane, publicState, projectedEnemyLanes),
          tie: random(),
        });
      }
    }
    if (options.length === 0) break;
    options.sort((left, right) => right.score - left.score || right.tie - left.tie || left.card.id.localeCompare(right.card.id));
    const chosen = options[0];
    placements.push({
      card: zoneCard(chosen.card),
      cardId: chosen.card.id,
      designId: chosen.card.designId,
      lane: chosen.lane,
      cost: chosen.card.cost,
      replacesCardId: projectedEnemyLanes[chosen.lane]?.id ?? null,
      score: Number(chosen.score.toFixed(3)),
    });
    command -= chosen.card.cost;
    usedLanes.add(chosen.lane);
    projectedEnemyLanes[chosen.lane] = chosen.card;
    hand.splice(hand.findIndex((card) => card.id === chosen.card.id), 1);
  }
  return placements;
}

function lockEnemyPreview(state) {
  const placements = planEnemyPlacements(state);
  for (const placement of placements) {
    const index = state.enemy.hand.findIndex((card) => card.id === placement.cardId);
    if (index !== -1) state.enemy.hand.splice(index, 1);
    state.enemy.command -= placement.cost;
  }
  state.enemyPreview = {
    round: state.round,
    locked: true,
    placements,
  };
  for (const placement of placements) {
    state.pendingEvents.push(event(
      state,
      "enemy-preview",
      `${placement.card.name} locked in Lane ${placement.lane + 1}`,
      `The Breacher committed a legal ${placement.cost}-Command placement and cannot revise it.`,
      `preview-${placement.card.designId}`,
      placement.lane,
      "enemy",
    ));
  }
}

function prepareRound(state, drawCards) {
  state.phase = "player-action";
  state.notice = "Enemy preview locked. Select a card, then choose a lane.";
  state.player.command = Math.min(CARD_BATTLE_RULES.commandCap, state.player.command + CARD_BATTLE_RULES.commandPerRound);
  state.enemy.command = Math.min(CARD_BATTLE_RULES.commandCap, state.enemy.command + CARD_BATTLE_RULES.commandPerRound);
  state.pendingPlayerActions = [];
  state.pendingEvents = [];
  state.currentReview = null;
  state.outflank.pending = null;
  if (drawCards) {
    const playerDraw = drawOne(state, "player");
    const enemyDraw = drawOne(state, "enemy");
    if (playerDraw) state.pendingEvents.push(event(state, "draw", `${playerDraw.name} drawn`, "Battle / Exploration drew one card for the new round.", "draw-player", null, "player"));
    if (enemyDraw) state.pendingEvents.push(event(state, "draw", "Breacher drew one card", "The enemy draw is recorded without exposing its hand.", "draw-enemy", null, "enemy"));
  }
  lockEnemyPreview(state);
  return state;
}

function buildInitialState(baseSeed, shuffleIndex) {
  const seed = derivedSeed(baseSeed, shuffleIndex);
  const playerDeck = deterministicShuffle(makeDeck("player"), `${seed}|player|initial`);
  const enemyFullDeck = makeDeck("enemy");
  const startingBruiserIndex = enemyFullDeck.findIndex((card) => card.id === "enemy-bruiser-1");
  const [startingBruiser] = enemyFullDeck.splice(startingBruiserIndex, 1);
  const enemyDeck = deterministicShuffle(enemyFullDeck, `${seed}|enemy|initial`);
  const state = {
    version: "0.1",
    source: CARD_BATTLE_SOURCE,
    baseSeed,
    seed,
    shuffleIndex,
    round: 1,
    phase: "setup",
    pressure: 0,
    breakArmed: true,
    result: null,
    notice: "",
    player: {
      command: 0,
      drawPile: playerDeck.slice(CARD_BATTLE_RULES.openingHand),
      hand: playerDeck.slice(0, CARD_BATTLE_RULES.openingHand),
      discard: [],
      lanes: emptyLanes(),
    },
    enemy: {
      command: 0,
      drawPile: enemyDeck.slice(CARD_BATTLE_RULES.openingHand),
      hand: enemyDeck.slice(0, CARD_BATTLE_RULES.openingHand),
      discard: [],
      lanes: emptyLanes(),
    },
    enemyPreview: { round: 0, locked: false, placements: [] },
    outflank: { used: false, pending: null },
    pendingPlayerActions: [],
    pendingEvents: [],
    currentReview: null,
    history: [],
    rng: { playerReshuffles: 0, enemyReshuffles: 0 },
    eventSequence: 0,
    playerActionSequence: 0,
  };
  state.enemy.lanes[CARD_BATTLE_RULES.startingBruiserLane] = activeCard(startingBruiser, 0);
  return prepareRound(state, false);
}

export function createCardBattleState(seed = "BW-CARD-V0.1-01") {
  return buildInitialState(String(seed), 0);
}

export function replaySameState(state) {
  return buildInitialState(state.baseSeed, state.shuffleIndex);
}

export function replayNewShuffle(state) {
  return buildInitialState(state.baseSeed, state.shuffleIndex + 1);
}

function invalid(state, notice) {
  return { ...state, notice };
}

export function placePlayerCard(state, cardId, lane) {
  if (state.phase !== "player-action") return invalid(state, "Cards can be placed only before round resolution.");
  if (!Number.isInteger(lane) || lane < 0 || lane >= CARD_BATTLE_RULES.lanes) return invalid(state, "Choose one of the four lanes.");
  const cardIndex = state.player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) return invalid(state, "That card is not in your hand.");
  const card = state.player.hand[cardIndex];
  if (card.cost > state.player.command) return invalid(state, `You need ${card.cost} Command to play ${card.name}.`);

  const next = clone(state);
  next.playerActionSequence += 1;
  const actionId = `player-action-${next.round}-${next.playerActionSequence}`;
  const selected = next.player.hand.splice(cardIndex, 1)[0];
  const previousActive = next.player.lanes[lane] ? clone(next.player.lanes[lane]) : null;
  const commandBefore = next.player.command;
  next.player.command -= selected.cost;
  if (previousActive) {
    next.player.discard.push(zoneCard(previousActive));
    next.pendingEvents.push(event(next, "replace", `${previousActive.name} replaced`, `Lane ${lane + 1} withdrew without a destroy trigger.`, "replace-player", lane, "player", actionId));
  }
  next.player.lanes[lane] = playerEntry(next, selected, lane);
  next.pendingPlayerActions.push({ type: "play", actionId, card: zoneCard(selected), lane, handIndex: cardIndex, commandBefore, previousActive });
  next.pendingEvents.push(event(next, "play", `${selected.name} entered Lane ${lane + 1}`, `${selected.cost} Command spent. ${selected.ability}`, `play-${selected.designId}`, lane, "player", actionId));
  next.notice = `${selected.name} staged in Lane ${lane + 1}.`;
  return next;
}

export function returnPlayerCard(state, cardId) {
  if (state.phase !== "player-action") return invalid(state, "Cards can be returned only before Resolve.");
  const actionIndex = state.pendingPlayerActions.findIndex((action) => action.type === "play" && action.card.id === cardId);
  if (actionIndex === -1) return invalid(state, "Only a card played this round can return to hand.");
  const action = state.pendingPlayerActions[actionIndex];
  const next = clone(state);
  const current = next.player.lanes[action.lane];
  if (current?.id !== cardId) return invalid(state, "Undo newer actions before returning that card.");
  next.player.lanes[action.lane] = action.previousActive;
  const replacedIndex = action.previousActive
    ? next.player.discard.findIndex((card) => card.id === action.previousActive.id)
    : -1;
  if (replacedIndex !== -1) next.player.discard.splice(replacedIndex, 1);
  next.player.hand.splice(action.handIndex, 0, action.card);
  next.player.command += action.card.cost;
  next.pendingPlayerActions.splice(actionIndex, 1);
  for (const later of next.pendingPlayerActions.slice(actionIndex)) {
    if (later.type === "play" && later.handIndex >= action.handIndex) later.handIndex += 1;
  }
  next.pendingEvents = next.pendingEvents.filter((entry) => entry.actionId !== action.actionId);
  next.notice = `${action.card.name} returned to hand.`;
  return next;
}

export function useOutflank(state, fromLane, toLane) {
  if (state.phase !== "player-action") return invalid(state, "Outflank is used before Resolve.");
  if (state.outflank.used) return invalid(state, "Outflank has already been used this battle.");
  if (![fromLane, toLane].every((lane) => Number.isInteger(lane) && lane >= 0 && lane < CARD_BATTLE_RULES.lanes) || fromLane === toLane) {
    return invalid(state, "Choose a different open destination lane.");
  }
  const active = state.player.lanes[fromLane];
  if (!active) return invalid(state, "Choose an active friendly card to Outflank.");
  if (active.enteredRound >= state.round) return invalid(state, "A card played this round cannot Outflank.");
  if (state.player.lanes[toLane]) return invalid(state, "Outflank needs an open friendly lane.");

  const next = clone(state);
  next.playerActionSequence += 1;
  const actionId = `player-action-${next.round}-${next.playerActionSequence}`;
  const moved = next.player.lanes[fromLane];
  next.player.lanes[fromLane] = null;
  moved.temporaryPowerBonus = 1;
  next.player.lanes[toLane] = moved;
  next.outflank = { used: true, pending: { actionId, cardId: moved.id, fromLane, toLane } };
  next.pendingPlayerActions.push({ type: "outflank", actionId, cardId: moved.id, fromLane, toLane });
  next.pendingEvents.push(event(next, "outflank", `${moved.name} Outflanked`, `Moved from Lane ${fromLane + 1} to open Lane ${toLane + 1}; +1 Power for this clash.`, "outflank-player", toLane, "player", actionId));
  next.notice = `${moved.name} is Outflanking through Lane ${toLane + 1}.`;
  return next;
}

export function cancelOutflank(state) {
  if (state.phase !== "player-action" || !state.outflank.pending) return invalid(state, "There is no pending Outflank to cancel.");
  const next = clone(state);
  const action = next.outflank.pending;
  const moved = next.player.lanes[action.toLane];
  if (!moved || moved.id !== action.cardId || next.player.lanes[action.fromLane]) return invalid(state, "The Outflank position can no longer be restored.");
  moved.temporaryPowerBonus = 0;
  next.player.lanes[action.toLane] = null;
  next.player.lanes[action.fromLane] = moved;
  next.pendingPlayerActions = next.pendingPlayerActions.filter((entry) => entry.actionId !== action.actionId);
  next.pendingEvents = next.pendingEvents.filter((entry) => entry.actionId !== action.actionId);
  next.outflank = { used: false, pending: null };
  next.notice = "Outflank returned to ready.";
  return next;
}

export function undoPlayerAction(state) {
  if (state.phase !== "player-action" || state.pendingPlayerActions.length === 0) return invalid(state, "There is no pending player action to undo.");
  const next = clone(state);
  const action = next.pendingPlayerActions.pop();
  next.pendingEvents = next.pendingEvents.filter((entry) => entry.actionId !== action.actionId);
  if (action.type === "play") {
    const current = next.player.lanes[action.lane];
    if (current?.id === action.card.id) next.player.lanes[action.lane] = action.previousActive;
    const replacedIndex = action.previousActive
      ? next.player.discard.findIndex((card) => card.id === action.previousActive.id)
      : -1;
    if (replacedIndex !== -1) next.player.discard.splice(replacedIndex, 1);
    next.player.hand.splice(action.handIndex, 0, action.card);
    next.player.command = action.commandBefore;
    next.notice = `${action.card.name} returned to hand.`;
  } else {
    const moved = next.player.lanes[action.toLane];
    if (moved?.id === action.cardId) {
      moved.temporaryPowerBonus = 0;
      next.player.lanes[action.toLane] = null;
      next.player.lanes[action.fromLane] = moved;
    }
    next.outflank = { used: false, pending: null };
    next.notice = "Outflank returned to ready.";
  }
  return next;
}

function applyEnemyPreview(state, events) {
  for (const placement of state.enemyPreview.placements) {
    const previous = state.enemy.lanes[placement.lane];
    if (previous) {
      state.enemy.discard.push(zoneCard(previous));
      events.push(event(state, "replace", `${previous.name} replaced`, `The Breacher withdrew its Lane ${placement.lane + 1} card without a destroy trigger.`, "replace-enemy", placement.lane, "enemy"));
    }
    state.enemy.lanes[placement.lane] = enemyEntry(state, placement.card, placement.lane);
    events.push(event(state, "enemy-entry", `${placement.card.name} entered Lane ${placement.lane + 1}`, placement.card.ability, `play-${placement.card.designId}`, placement.lane, "enemy"));
  }
}

function destroyCard(state, side, lane, events) {
  const card = state[side].lanes[lane];
  if (!card) return;
  state[side].discard.push(zoneCard(card));
  state[side].lanes[lane] = null;
  events.push(event(state, "destroy", `${card.name} destroyed`, `Lane ${lane + 1}: ${card.name} left the confrontation.`, `destroy-${side}`, lane, side));
}

function clearCardForBreak(state, side, lane, events) {
  const card = state[side].lanes[lane];
  if (!card) return;
  state[side].discard.push(zoneCard(card));
  state[side].lanes[lane] = null;
  events.push(event(state, "break-clear", `${card.name} cleared by Break`, `Lane ${lane + 1}: the active card withdrew to discard without a destroy trigger.`, `break-clear-${side}`, lane, side));
}

function centralPressure(pressure) {
  return pressure >= CARD_BATTLE_RULES.breakRearmMin && pressure <= CARD_BATTLE_RULES.breakRearmMax;
}

export function resolveRound(state) {
  if (state.phase !== "player-action") return invalid(state, "This round has already resolved.");
  const next = clone(state);
  const pressureBefore = next.pressure;
  const events = [...next.pendingEvents];
  applyEnemyPreview(next, events);
  const outcomes = [];
  let pressureDelta = 0;
  let printedPressure = 0;

  for (let lane = 0; lane < CARD_BATTLE_RULES.lanes; lane += 1) {
    const playerCard = next.player.lanes[lane];
    const enemyCard = next.enemy.lanes[lane];
    if (playerCard && enemyCard) {
      const playerPower = effectivePower(playerCard, true);
      const enemyPower = effectivePower(enemyCard, true);
      let damageToEnemy = playerPower;
      const damageToPlayer = enemyPower + (enemyCard.designId === "breaker" ? 1 : 0);
      let reductionUsed = false;
      if (enemyCard.damageReductionAvailable && damageToEnemy > 0) {
        damageToEnemy = Math.max(0, damageToEnemy - 1);
        reductionUsed = true;
      }
      outcomes.push({ lane, playerCardId: playerCard.id, enemyCardId: enemyCard.id, damageToPlayer, damageToEnemy, reductionUsed });
      events.push(event(next, "clash", `Lane ${lane + 1} clash`, `${playerCard.name} deals ${damageToEnemy}; ${enemyCard.name} deals ${damageToPlayer}.`, "clash", lane, "both"));
    } else if (playerCard) {
      const direct = effectivePower(playerCard, false);
      pressureDelta += direct;
      events.push(event(next, "direct-pressure", `${playerCard.name} presses unblocked`, `Lane ${lane + 1} contributes +${direct} Pressure.`, "press-player", lane, "player"));
    } else if (enemyCard) {
      const direct = effectivePower(enemyCard, false);
      pressureDelta -= direct;
      events.push(event(next, "direct-pressure", `${enemyCard.name} presses unblocked`, `Lane ${lane + 1} contributes -${direct} Pressure.`, "press-enemy", lane, "enemy"));
    }
  }

  for (const outcome of outcomes) {
    const playerCard = next.player.lanes[outcome.lane];
    const enemyCard = next.enemy.lanes[outcome.lane];
    playerCard.currentHealth -= outcome.damageToPlayer;
    enemyCard.currentHealth -= outcome.damageToEnemy;
    if (outcome.reductionUsed) enemyCard.damageReductionAvailable = false;
  }

  for (const outcome of outcomes) {
    const playerCard = next.player.lanes[outcome.lane];
    const enemyCard = next.enemy.lanes[outcome.lane];
    const playerDestroyed = playerCard && playerCard.currentHealth <= 0;
    const enemyDestroyed = enemyCard && enemyCard.currentHealth <= 0;
    if (enemyDestroyed && playerCard?.designId === "linebreaker") {
      printedPressure += 1;
      events.push(event(next, "card-effect", "Linebreaker shifts Pressure", `Lane ${outcome.lane + 1} adds +1 Pressure after destroying ${enemyCard.name}.`, "linebreaker-pressure", outcome.lane, "player"));
    }
    if (playerDestroyed && playerCard?.designId === "scout-route") {
      const drawn = drawOne(next, "player", events);
      if (drawn) events.push(event(next, "card-effect", "Scout Route found another line", `${drawn.name} was drawn after Scout Route was destroyed.`, "scout-draw", outcome.lane, "player"));
    }
    if (playerDestroyed) destroyCard(next, "player", outcome.lane, events);
    if (enemyDestroyed) destroyCard(next, "enemy", outcome.lane, events);
  }

  next.pressure = Math.max(
    CARD_BATTLE_RULES.pressureMin,
    Math.min(CARD_BATTLE_RULES.pressureMax, next.pressure + pressureDelta + printedPressure),
  );
  if (next.pressure !== pressureBefore) {
    const change = next.pressure - pressureBefore;
    events.push(event(next, "pressure", "Shared Pressure moved", `${pressureBefore} to ${next.pressure} (${change > 0 ? "+" : ""}${change}) after all four lanes netted.`, change > 0 ? "pressure-player" : "pressure-enemy", null, change > 0 ? "player" : "enemy"));
  } else {
    events.push(event(next, "pressure", "Pressure holds", `All direct and printed effects net to ${next.pressure}.`, "pressure-hold", null, "system"));
  }

  if (next.pressure >= CARD_BATTLE_RULES.pressureMax || next.pressure <= CARD_BATTLE_RULES.pressureMin) {
    const winner = next.pressure > 0 ? "player" : "enemy";
    next.result = { winner, round: next.round, pressure: next.pressure, reason: "Pressure end reached before Break." };
    next.phase = "result";
    events.push(event(next, "victory", winner === "player" ? "Battle / Exploration wins" : "Breacher wins", `Pressure reached ${next.pressure}; victory takes precedence over Break.`, `victory-${winner}`, null, winner));
  } else {
    const crossedPlayerBreak = pressureBefore < CARD_BATTLE_RULES.playerBreak && next.pressure >= CARD_BATTLE_RULES.playerBreak;
    const crossedEnemyBreak = pressureBefore > CARD_BATTLE_RULES.enemyBreak && next.pressure <= CARD_BATTLE_RULES.enemyBreak;
    if (next.breakArmed && (crossedPlayerBreak || crossedEnemyBreak)) {
      for (let lane = 0; lane < CARD_BATTLE_RULES.lanes; lane += 1) {
        if (next.player.lanes[lane]) clearCardForBreak(next, "player", lane, events);
        if (next.enemy.lanes[lane]) clearCardForBreak(next, "enemy", lane, events);
      }
      next.breakArmed = false;
      events.push(event(next, "break", "PRESSURE BREAK", `The clash finished, all active cards cleared, and Pressure remains at ${next.pressure}.`, crossedPlayerBreak ? "break-player" : "break-enemy", null, "system"));
    } else if (!next.breakArmed && centralPressure(next.pressure)) {
      next.breakArmed = true;
      events.push(event(next, "break-rearm", "Pressure Break rearmed", `Pressure returned to the central range at ${next.pressure}.`, "break-rearm", null, "system"));
    }
    next.phase = "round-review";
  }

  for (const card of next.player.lanes) {
    if (card) card.temporaryPowerBonus = 0;
  }
  next.outflank.pending = null;
  const breakTriggered = events.some((entry) => entry.type === "break");
  next.currentReview = {
    round: next.round,
    pressureBefore,
    pressureAfter: next.pressure,
    pressureDelta: next.pressure - pressureBefore,
    breakTriggered,
    winner: next.result?.winner ?? null,
    events,
  };
  next.history.push(clone(next.currentReview));
  next.pendingEvents = [];
  next.pendingPlayerActions = [];
  next.enemyPreview.locked = true;
  next.notice = next.result ? "Battle complete. Review the exact causes below." : "Round resolved. Review it, then begin the next round.";
  return next;
}

export function startNextRound(state) {
  if (state.phase !== "round-review" || state.result) return invalid(state, "Finish the current review before continuing.");
  const next = clone(state);
  next.round += 1;
  return prepareRound(next, true);
}

export function runDeterministicSimulation({
  battles = 100,
  seedPrefix = "BW-CARD-SIM",
  maxRounds = 40,
} = {}) {
  const result = {
    version: "0.1",
    battles,
    maxRounds,
    playerWins: 0,
    enemyWins: 0,
    unfinished: 0,
    breaks: 0,
    rounds: [],
  };
  for (let battle = 0; battle < battles; battle += 1) {
    let state = createCardBattleState(`${seedPrefix}-${battle}`);
    let resolvedRounds = 0;
    while (!state.result && resolvedRounds < maxRounds) {
      const threats = LANES_FOR_ENGINE.map((lane) => {
        const preview = state.enemyPreview.placements.find((placement) => placement.lane === lane);
        const card = preview?.card ?? state.enemy.lanes[lane];
        return card && !state.player.lanes[lane]
          ? { lane, power: card.power + (card.designId === "rush" ? 1 : 0) }
          : null;
      }).filter(Boolean).sort((left, right) => right.power - left.power || left.lane - right.lane);
      for (const threat of threats) {
        const defender = [...state.player.hand]
          .filter((card) => card.cost <= state.player.command)
          .sort((left, right) => left.cost - right.cost || right.health - left.health || right.power - left.power || left.id.localeCompare(right.id))[0];
        if (defender) state = placePlayerCard(state, defender.id, threat.lane);
      }
      for (const lane of LANES_FOR_ENGINE) {
        if (state.player.lanes[lane]) continue;
        const attacker = [...state.player.hand]
          .filter((card) => card.cost <= state.player.command)
          .sort((left, right) => left.cost - right.cost || right.power - left.power || right.health - left.health || left.id.localeCompare(right.id))[0];
        if (attacker) state = placePlayerCard(state, attacker.id, lane);
      }
      state = resolveRound(state);
      resolvedRounds += 1;
      if (state.currentReview?.breakTriggered) result.breaks += 1;
      if (!state.result && resolvedRounds < maxRounds) state = startNextRound(state);
    }
    if (state.result?.winner === "player") result.playerWins += 1;
    else if (state.result?.winner === "enemy") result.enemyWins += 1;
    else result.unfinished += 1;
    result.rounds.push(resolvedRounds);
  }
  result.averageRounds = Number((result.rounds.reduce((sum, value) => sum + value, 0) / battles).toFixed(3));
  result.minRounds = Math.min(...result.rounds);
  result.maxRoundsObserved = Math.max(...result.rounds);
  return result;
}
