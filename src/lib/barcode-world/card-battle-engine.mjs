export const CARD_BATTLE_SOURCE =
  "BARCODE_WORLD_OWNER_CARD_GRAMMAR_V0.2_2026-08-16";

export const CARD_TYPES = Object.freeze([
  "attack",
  "defend",
  "maneuver",
  "modifier",
  "preparation",
  "reaction",
  "finisher",
  "recovery",
]);

export const CARD_BATTLE_RULES = Object.freeze({
  lanes: 4,
  handSize: 6,
  deckSize: 18,
  maxStack: 3,
  commandPerRound: 10,
  commandCap: 20,
  pressureMin: -5,
  pressureMax: 5,
  playerBreak: 3,
  enemyBreak: -3,
  breakRearmMin: -2,
  breakRearmMax: 2,
  chanceMin: 15,
  chanceMax: 95,
  chanceStep: 5,
});

function scenario({
  id,
  name,
  shortName,
  rule,
  openingHand = CARD_BATTLE_RULES.handSize,
  reservePerRoundBonus = 0,
  roundStartDraw = 0,
  contestedSuccessDraw = 0,
  successfulComboDraw = 0,
  fearUnlockDraw = 0,
  pressureUnlockDraw = 0,
  pressureUnlockAt = 2,
  emptyRackFallback = 0,
  breakRefill = CARD_BATTLE_RULES.handSize,
  enemyReplenishment = 2,
}) {
  return Object.freeze({
    id,
    name,
    shortName,
    rule,
    openingHand,
    reservePerRoundBonus,
    replenishment: Object.freeze({
      roundStartDraw,
      contestedSuccessDraw,
      successfulComboDraw,
      fearUnlockDraw,
      pressureUnlockDraw,
      pressureUnlockAt,
      emptyRackFallback,
      breakRefill,
      enemyReplenishment,
    }),
  });
}

export const CARD_BATTLE_SCENARIOS = Object.freeze([
  scenario({
    id: "breacher-intercept-v0.2",
    name: "Breacher Intercept",
    shortName: "Earned feed",
    rule: "Land a contested move or combo to earn cards.",
    contestedSuccessDraw: 1,
    successfulComboDraw: 1,
    emptyRackFallback: 1,
  }),
  scenario({
    id: "signal-surge-v0.2",
    name: "Signal Surge",
    shortName: "Automatic feed",
    rule: "Draw 2 and gain +2 Reserve at the start of each new round.",
    reservePerRoundBonus: 2,
    roundStartDraw: 2,
  }),
  scenario({
    id: "fractured-cache-v0.2",
    name: "Fractured Cache",
    shortName: "Unlock feed",
    rule: "Fear and +2 Pressure each unlock 2 cards once.",
    fearUnlockDraw: 2,
    pressureUnlockDraw: 2,
    pressureUnlockAt: 2,
    emptyRackFallback: 1,
  }),
  scenario({
    id: "cascade-protocol-v0.2",
    name: "Cascade Protocol",
    shortName: "Mixed feed",
    rule: "Draw 1 each round; contests, Fear, and card effects grant more.",
    reservePerRoundBonus: 1,
    roundStartDraw: 1,
    contestedSuccessDraw: 1,
    fearUnlockDraw: 2,
    emptyRackFallback: 1,
  }),
]);

export const DEFAULT_CARD_BATTLE_SCENARIO_ID = CARD_BATTLE_SCENARIOS[0].id;

// Default-scenario alias for consumers that only need one encounter.
export const CARD_BATTLE_SCENARIO = CARD_BATTLE_SCENARIOS[0];

export function getCardBattleScenario(scenarioId = DEFAULT_CARD_BATTLE_SCENARIO_ID) {
  return CARD_BATTLE_SCENARIOS.find((entry) => entry.id === scenarioId) ?? CARD_BATTLE_SCENARIO;
}

function definition({
  id,
  name,
  type,
  cost,
  effect,
  accuracy = 0,
  impact = 0,
  resistance = 0,
  guard = 0,
  drawOnSuccess = 0,
}) {
  return Object.freeze({
    id,
    name,
    type,
    cost,
    effect,
    ability: effect,
    accuracy,
    impact,
    resistance,
    guard,
    drawOnSuccess,
  });
}

export const PLAYER_CARD_DEFINITIONS = Object.freeze({
  jab: definition({
    id: "jab",
    name: "Jab",
    type: "attack",
    cost: 2,
    effect: "FAST · +10%",
    accuracy: 10,
    impact: 1,
  }),
  "heavy-strike": definition({
    id: "heavy-strike",
    name: "Heavy Strike",
    type: "attack",
    cost: 4,
    effect: "+2 PRESSURE · -10%",
    accuracy: -10,
    impact: 2,
    resistance: 5,
  }),
  guard: definition({
    id: "guard",
    name: "Guard",
    type: "defend",
    cost: 2,
    effect: "BLOCK · +20% VS ATTACK",
    accuracy: 10,
    resistance: 10,
    guard: 2,
  }),
  flank: definition({
    id: "flank",
    name: "Flank",
    type: "maneuver",
    cost: 2,
    effect: "VS DEFEND · +20%",
    accuracy: 5,
    resistance: 5,
  }),
  overclock: definition({
    id: "overclock",
    name: "Overclock",
    type: "modifier",
    cost: 2,
    effect: "+1 PRESSURE · -10%",
    accuracy: -10,
    impact: 1,
  }),
  "dread-pulse": definition({
    id: "dread-pulse",
    name: "Dread Pulse",
    type: "modifier",
    cost: 2,
    effect: "SURPRISE → FEAR",
  }),
  charge: definition({
    id: "charge",
    name: "Charge",
    type: "preparation",
    cost: 2,
    effect: "ATTACK → +15% / +1",
    accuracy: 5,
  }),
  parry: definition({
    id: "parry",
    name: "Parry",
    type: "reaction",
    cost: 2,
    effect: "VS ATTACK → COUNTER",
    accuracy: 10,
    resistance: 10,
    guard: 2,
  }),
  breakpoint: definition({
    id: "breakpoint",
    name: "Breakpoint",
    type: "finisher",
    cost: 6,
    effect: "FEAR → +3 PRESSURE",
    accuracy: -15,
    impact: 3,
    resistance: 5,
  }),
  "cache-tap": definition({
    id: "cache-tap",
    name: "Cache Tap",
    type: "modifier",
    cost: 2,
    effect: "SUCCESS → DRAW 2",
    drawOnSuccess: 2,
  }),
  recompile: definition({
    id: "recompile",
    name: "Recompile",
    type: "recovery",
    cost: 1,
    effect: "SUCCESS → DRAW 2",
    drawOnSuccess: 2,
  }),
});

export const ENEMY_CARD_DEFINITIONS = Object.freeze({
  rush: definition({
    id: "rush",
    name: "Rush",
    type: "attack",
    cost: 2,
    effect: "FAST · 1 THREAT",
    accuracy: 5,
    impact: 1,
  }),
  maul: definition({
    id: "maul",
    name: "Maul",
    type: "attack",
    cost: 4,
    effect: "2 THREAT · HEAVY",
    accuracy: -10,
    impact: 2,
    resistance: 5,
  }),
  brace: definition({
    id: "brace",
    name: "Brace",
    type: "defend",
    cost: 2,
    effect: "BLOCK · HARD TO BREAK",
    resistance: 15,
    guard: 2,
  }),
  circle: definition({
    id: "circle",
    name: "Circle",
    type: "maneuver",
    cost: 2,
    effect: "SHIFT · 1 THREAT",
    accuracy: 5,
    impact: 1,
    resistance: 5,
  }),
  rage: definition({
    id: "rage",
    name: "Rage",
    type: "modifier",
    cost: 2,
    effect: "+1 THREAT · -10%",
    accuracy: -10,
    impact: 1,
  }),
  "wind-up": definition({
    id: "wind-up",
    name: "Wind Up",
    type: "preparation",
    cost: 2,
    effect: "ATTACK → +15% / +1",
    accuracy: 5,
    resistance: 5,
  }),
  counter: definition({
    id: "counter",
    name: "Counter",
    type: "reaction",
    cost: 2,
    effect: "VS ATTACK · 1 THREAT",
    accuracy: 10,
    impact: 1,
    resistance: 15,
    guard: 2,
  }),
  breach: definition({
    id: "breach",
    name: "Breach",
    type: "finisher",
    cost: 6,
    effect: "3 THREAT · COMMITTED",
    accuracy: -15,
    impact: 3,
    resistance: 10,
  }),
});

export const PLAYER_LOADOUT_COUNTS = Object.freeze({
  jab: 3,
  "heavy-strike": 2,
  guard: 2,
  flank: 2,
  overclock: 2,
  "dread-pulse": 2,
  charge: 1,
  parry: 1,
  breakpoint: 1,
  "cache-tap": 1,
  recompile: 1,
});

export const ENEMY_LOADOUT_COUNTS = Object.freeze({
  rush: 3,
  maul: 2,
  brace: 3,
  circle: 2,
  rage: 2,
  "wind-up": 2,
  counter: 2,
  breach: 2,
});

export const ENEMY_AI_TUNING = Object.freeze({
  normalMoveLimit: 2,
  behindMoveLimit: 3,
  aheadMoveLimit: 1,
  impactWeight: 4,
  resistanceWeight: 0.08,
  comboWeight: 0.75,
  costWeight: -0.18,
  finisherWeight: 1.5,
});

const PLAYER_SEQUENCE_KEYS = new Set([
  "attack",
  "defend",
  "maneuver",
  "preparation",
  "reaction",
  "finisher",
  "recovery",
  "attack>attack",
  "attack>overclock",
  "attack>cache-tap",
  "defend>attack",
  "defend>cache-tap",
  "defend>recovery",
  "maneuver>attack",
  "maneuver>cache-tap",
  "maneuver>dread-pulse",
  "maneuver>defend",
  "preparation>attack",
  "reaction>attack",
  "attack>attack>overclock",
  "attack>attack>cache-tap",
  "maneuver>attack>dread-pulse",
  "maneuver>attack>cache-tap",
  "maneuver>dread-pulse>finisher",
  "preparation>attack>overclock",
  "preparation>attack>cache-tap",
  "defend>attack>overclock",
  "defend>attack>cache-tap",
  "reaction>attack>overclock",
  "reaction>attack>cache-tap",
]);

const ENEMY_SEQUENCE_KEYS = new Set([
  "attack",
  "defend",
  "maneuver",
  "preparation",
  "reaction",
  "finisher",
  "attack>attack",
  "attack>rage",
  "defend>attack",
  "maneuver>attack",
  "preparation>attack",
  "reaction>attack",
  "attack>attack>rage",
  "preparation>attack>rage",
  "preparation>attack>finisher",
  "defend>attack>rage",
  "reaction>attack>rage",
]);

const LANES = Array.from({ length: CARD_BATTLE_RULES.lanes }, (_, lane) => lane);

function clone(value) {
  return structuredClone(value);
}

function emptyLanes() {
  return Array.from({ length: CARD_BATTLE_RULES.lanes }, () => []);
}

function emptyIntentLanes() {
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

export function deterministicContestRoll(seed, round, lane) {
  const random = randomSequence(`${seed}|contest|round-${round}|lane-${lane}`);
  return Math.floor(random() * 100) + 1;
}

function makeDeck(side) {
  const definitions = side === "player" ? PLAYER_CARD_DEFINITIONS : ENEMY_CARD_DEFINITIONS;
  const counts = side === "player" ? PLAYER_LOADOUT_COUNTS : ENEMY_LOADOUT_COUNTS;
  return Object.entries(counts).flatMap(([designId, count]) =>
    Array.from({ length: count }, (_, index) => ({
      ...definitions[designId],
      id: `${side}-${designId}-${index + 1}`,
      designId,
      side,
      copy: index + 1,
    })),
  );
}

export const PLAYER_DECK = Object.freeze(makeDeck("player").map(Object.freeze));
export const ENEMY_DECK = Object.freeze(makeDeck("enemy").map(Object.freeze));

function zoneCard(card) {
  return { ...card };
}

function derivedSeed(baseSeed, shuffleIndex) {
  return shuffleIndex === 0 ? baseSeed : `${baseSeed}::shuffle-${shuffleIndex}`;
}

function event(state, type, title, detail, sceneCue, lane = null, side = "system", actionId = null) {
  state.eventSequence += 1;
  return {
    id: `round-${state.round}-event-${state.eventSequence}`,
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

function drawOne(state, side, eventSink = null) {
  const actor = state[side];
  if (actor.drawPile.length === 0 && actor.discard.length > 0) {
    const key = side === "player" ? "playerReshuffles" : "enemyReshuffles";
    actor.drawPile = deterministicShuffle(
      actor.discard.map(zoneCard),
      `${state.seed}|${side}|reshuffle|${state.rng[key]}`,
    );
    actor.discard = [];
    state.rng[key] += 1;
    if (eventSink) {
      eventSink.push(event(
        state,
        "reshuffle",
        `${side === "player" ? "Your" : "Breacher"} discard recycled`,
        `The empty ${side} draw pile reshuffled from discard using the battle seed.`,
        `reshuffle-${side}`,
        null,
        side,
      ));
    }
  }
  const card = actor.drawPile.shift() ?? null;
  if (card) actor.hand.push(card);
  return card;
}

function drawGrantedCards(state, side, count, eventSink = null) {
  const drawn = [];
  while (drawn.length < count && state[side].hand.length < CARD_BATTLE_RULES.handSize) {
    const card = drawOne(state, side, eventSink);
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}

function cardToken(card) {
  if (["overclock", "dread-pulse", "cache-tap", "rage"].includes(card.designId)) {
    return card.designId;
  }
  return card.type;
}

function sequenceKey(cards) {
  return cards.map(cardToken).join(">");
}

function hasDesign(cards, designId) {
  return cards.some((card) => card.designId === designId);
}

function hasType(cards, type) {
  return cards.some((card) => card.type === type);
}

function baseMove(cards, side) {
  const first = cards[0];
  const move = {
    side,
    name: first.name.toUpperCase(),
    cards: cards.map(zoneCard),
    cost: cards.reduce((sum, card) => sum + card.cost, 0),
    accuracy: cards.reduce((sum, card) => sum + card.accuracy, 0),
    impact: cards.reduce((sum, card) => sum + card.impact, 0),
    resistance: cards.reduce((sum, card) => sum + card.resistance, 0),
    guard: cards.reduce((sum, card) => sum + card.guard, 0),
    drawOnSuccess: cards.reduce((sum, card) => sum + card.drawOnSuccess, 0),
    category: first.type,
    appliesFear: false,
    setsCharge: first.type === "preparation" && cards.length === 1,
    usesCharge: false,
    usesFear: false,
    matchup: {},
    signature: cards.map((card) => card.id).join("+"),
  };
  if (move.impact > 0 && ["defend", "reaction"].includes(first.type)) move.category = "reaction";
  if (hasType(cards, "attack")) move.category = "attack";
  return move;
}

function compilePlayerMove(cards, context = {}) {
  if (!cards?.length) return null;
  const move = baseMove(cards, "player");
  const types = cards.map((card) => card.type).join(">");
  const key = sequenceKey(cards);

  if (types === "attack>attack") {
    move.name = "POWER ATTACK";
    move.impact += 1;
    move.accuracy -= 5;
  } else if (key === "attack>overclock") {
    move.name = "POWER ATTACK";
  } else if (key === "attack>cache-tap") {
    move.name = "SIGNAL STRIKE";
  } else if (types === "defend>attack") {
    move.name = "COUNTERATTACK";
    move.impact += 1;
    move.accuracy += 10;
    move.matchup.attack = 15;
  } else if (key === "defend>cache-tap") {
    move.name = "SECURE TAP";
    move.accuracy += 10;
    move.matchup.attack = 15;
  } else if (types === "defend>recovery") {
    move.name = "SECURE RECOMPILE";
    move.accuracy += 10;
    move.matchup.attack = 15;
  } else if (types === "maneuver>attack") {
    move.name = "AMBUSH";
    move.impact += 1;
    move.accuracy += 10;
    move.matchup.defend = 20;
    move.matchup.open = 15;
  } else if (key === "maneuver>cache-tap") {
    move.name = "GHOST TAP";
    move.accuracy += 15;
    move.matchup.defend = 20;
  } else if (key === "maneuver>dread-pulse") {
    move.name = "SURPRISE";
    move.impact = Math.max(move.impact, 1);
    move.accuracy += 15;
    move.appliesFear = true;
  } else if (types === "maneuver>defend") {
    move.name = "EVASIVE GUARD";
    move.guard += 1;
    move.accuracy += 15;
    move.matchup.attack = 20;
  } else if (types === "preparation>attack") {
    move.name = "CHARGED STRIKE";
    move.impact += 1;
    move.accuracy += 15;
    move.setsCharge = false;
  } else if (types === "reaction>attack") {
    move.name = "RIPOSTE";
    move.impact += 1;
    move.accuracy += 15;
    move.matchup.attack = 20;
  }

  if (key === "attack>attack>overclock") {
    move.name = "OVERLOADED POWER ATTACK";
    move.impact += 1;
    move.accuracy -= 5;
  } else if (key === "attack>attack>cache-tap") {
    move.name = "POWER CACHE";
    move.impact += 1;
    move.accuracy -= 5;
  } else if (key === "maneuver>attack>dread-pulse") {
    move.name = "TERROR AMBUSH";
    move.impact += 1;
    move.accuracy += 15;
    move.appliesFear = true;
    move.matchup.defend = 20;
  } else if (key === "maneuver>attack>cache-tap") {
    move.name = "CACHE AMBUSH";
    move.impact += 1;
    move.accuracy += 15;
    move.matchup.defend = 20;
  } else if (key === "maneuver>dread-pulse>finisher") {
    move.name = "PANIC BREAK";
    move.impact = Math.max(move.impact, 4);
    move.accuracy += 10;
    move.appliesFear = false;
  } else if (key === "preparation>attack>overclock") {
    move.name = "OVERCHARGED STRIKE";
    move.impact += 2;
    move.accuracy += 10;
    move.setsCharge = false;
  } else if (key === "preparation>attack>cache-tap") {
    move.name = "CHARGED CACHE";
    move.impact += 1;
    move.accuracy += 15;
    move.setsCharge = false;
  } else if (key === "defend>attack>overclock") {
    move.name = "POWER COUNTER";
    move.impact += 2;
    move.accuracy += 10;
    move.matchup.attack = 20;
  } else if (key === "defend>attack>cache-tap") {
    move.name = "CACHE COUNTER";
    move.impact += 1;
    move.accuracy += 10;
    move.matchup.attack = 20;
  } else if (key === "reaction>attack>overclock") {
    move.name = "OVERDRIVE RIPOSTE";
    move.impact += 2;
    move.accuracy += 15;
    move.matchup.attack = 25;
  } else if (key === "reaction>attack>cache-tap") {
    move.name = "SIGNAL RIPOSTE";
    move.impact += 1;
    move.accuracy += 15;
    move.matchup.attack = 25;
  }

  const producesFearInsideStack = hasDesign(cards, "dread-pulse") && hasDesign(cards, "flank");
  if (hasDesign(cards, "breakpoint") && !producesFearInsideStack) {
    move.usesFear = true;
    move.accuracy += 20;
    if (cards.length === 1) move.name = "BREAKPOINT";
  }

  if (
    context.chargeReady &&
    context.chargeLane === context.lane &&
    move.impact > 0 &&
    !hasDesign(cards, "charge")
  ) {
    move.usesCharge = true;
    move.accuracy += 15;
    move.impact += 1;
    if (!move.name.startsWith("CHARGED")) move.name = `CHARGED ${move.name}`;
  }

  return move;
}

function compileEnemyMove(cards) {
  if (!cards?.length) return null;
  const move = baseMove(cards, "enemy");
  const types = cards.map((card) => card.type).join(">");
  const key = sequenceKey(cards);

  if (types === "attack>attack") {
    move.name = "MAULING RUSH";
    move.impact += 1;
    move.resistance += 5;
  } else if (key === "attack>rage") {
    move.name = "RAGE RUSH";
  } else if (types === "defend>attack") {
    move.name = "GUARDED LUNGE";
    move.impact += 1;
    move.resistance += 10;
  } else if (types === "maneuver>attack") {
    move.name = "CIRCLING STRIKE";
    move.impact += 1;
    move.resistance += 5;
  } else if (types === "preparation>attack") {
    move.name = "WOUND-UP MAUL";
    move.impact += 1;
    move.resistance += 5;
  } else if (types === "reaction>attack") {
    move.name = "COUNTER RUSH";
    move.impact += 1;
    move.resistance += 10;
  }

  if (key.endsWith(">rage")) {
    move.name = `RAGING ${move.name}`;
    move.impact += 1;
  }
  if (types === "preparation>attack>finisher") {
    move.name = "BREACH SEQUENCE";
    move.impact = Math.max(move.impact + 1, 4);
    move.resistance += 10;
  }
  if (hasDesign(cards, "breach") && cards.length === 1) move.name = "BREACH";
  return move;
}

export function compileMove(cards, side = "player", context = {}) {
  return side === "player" ? compilePlayerMove(cards, context) : compileEnemyMove(cards);
}

function sequenceAllowed(side, cards) {
  const keys = side === "player" ? PLAYER_SEQUENCE_KEYS : ENEMY_SEQUENCE_KEYS;
  return keys.has(sequenceKey(cards));
}

function intentAt(state, lane) {
  return state.enemyPreview.lanes[lane] ?? null;
}

function globalFearAlreadyReserved(state, exceptLane = null) {
  return state.player.lanes.some((stack, lane) => {
    if (lane === exceptLane || !hasDesign(stack, "breakpoint")) return false;
    return !(hasDesign(stack, "flank") && hasDesign(stack, "dread-pulse"));
  });
}

function placementValidation(state, card, lane) {
  if (state.phase !== "player-action") return { legal: false, reason: "Resolve or continue the current round first." };
  if (!Number.isInteger(lane) || lane < 0 || lane >= CARD_BATTLE_RULES.lanes) {
    return { legal: false, reason: "Choose one of the four lanes." };
  }
  if (!card) return { legal: false, reason: "That card is not in your six-card rack." };
  if (card.cost > state.player.reserve) {
    return { legal: false, reason: `${card.name} needs ${card.cost} Reserve.` };
  }
  const current = state.player.lanes[lane];
  if (current.length >= CARD_BATTLE_RULES.maxStack) {
    return { legal: false, reason: "This lane already has a complete three-card move." };
  }
  const nextStack = [...current, card];
  if (!sequenceAllowed("player", nextStack)) {
    return { legal: false, reason: `${card.name} does not connect to this stack.` };
  }
  if (card.type === "reaction" && current.length === 0) {
    const enemyMove = compileEnemyMove(intentAt(state, lane)?.cards ?? []);
    if (enemyMove?.category !== "attack") {
      return { legal: false, reason: "Parry needs a locked enemy attack in this lane." };
    }
  }
  if (card.type === "finisher") {
    const createsFear = hasDesign(nextStack, "flank") && hasDesign(nextStack, "dread-pulse");
    if (!createsFear && !state.enemy.conditions.fear) {
      return { legal: false, reason: "Breakpoint needs Fear or a Surprise stack." };
    }
    if (!createsFear && globalFearAlreadyReserved(state, lane)) {
      return { legal: false, reason: "Fear is already committed to another finisher." };
    }
  }
  return { legal: true, reason: "" };
}

function contextForLane(state, lane, stack = state.player.lanes[lane]) {
  let chargeLane = state.player.conditions.chargeLane;
  if (state.player.conditions.charge && chargeLane === null) {
    const uncharged = compilePlayerMove(stack, { lane, chargeLane: null, chargeReady: false });
    if (uncharged?.impact > 0 && !hasDesign(stack, "charge")) chargeLane = lane;
  }
  return {
    lane,
    chargeLane,
    chargeReady: state.player.conditions.charge,
  };
}

function roundedChance(value) {
  const stepped = Math.round(value / CARD_BATTLE_RULES.chanceStep) * CARD_BATTLE_RULES.chanceStep;
  return Math.max(CARD_BATTLE_RULES.chanceMin, Math.min(CARD_BATTLE_RULES.chanceMax, stepped));
}

export function contestChance(playerMove, enemyMove, state) {
  if (!playerMove) return 0;
  let chance = 65 + playerMove.accuracy + playerMove.guard * 2;
  if (!enemyMove) {
    chance += 15 + (playerMove.matchup.open ?? 0);
  } else {
    chance -= enemyMove.resistance;
    chance += playerMove.matchup[enemyMove.category] ?? 0;
    if (["defend", "reaction"].includes(playerMove.category) && enemyMove.category === "attack") chance += 15;
    if (playerMove.category === "maneuver" && ["defend", "preparation"].includes(enemyMove.category)) chance += 20;
    if (playerMove.category === "attack" && enemyMove.category === "defend") chance -= 15;
    if (playerMove.category === "attack" && enemyMove.category === "reaction") chance -= 20;
    if (playerMove.category === "preparation" && enemyMove.category === "attack") chance -= 25;
    if (playerMove.category === "reaction" && enemyMove.category !== "attack") chance -= 15;
  }
  if (state.enemy.conditions.fear) chance += playerMove.usesFear ? 10 : 5;
  return roundedChance(chance);
}

function successLabel(move) {
  if (!move) return "NO MOVE";
  const parts = [];
  if (move.impact > 0) parts.push(`+${move.impact} PRESSURE`);
  else if (move.setsCharge) parts.push("CHARGE READY");
  else if (move.guard > 0) parts.push("BLOCK");
  else parts.push("LANDS");
  if (move.appliesFear) parts.push("FEAR");
  if (move.drawOnSuccess > 0) parts.push(`DRAW ${move.drawOnSuccess}`);
  return parts.join(" · ");
}

function failureLabel(enemyMove) {
  if (enemyMove?.impact > 0) return `-${enemyMove.impact} PRESSURE`;
  return enemyMove ? "HELD · 0" : "MISS · 0";
}

export function getLaneForecast(state, lane) {
  if (!Number.isInteger(lane) || lane < 0 || lane >= CARD_BATTLE_RULES.lanes) return null;
  const stack = state.player.lanes[lane];
  const playerMove = compilePlayerMove(stack, contextForLane(state, lane, stack));
  const enemyMove = compileEnemyMove(intentAt(state, lane)?.cards ?? []);
  if (!playerMove) {
    return {
      lane,
      playerMove: null,
      enemyMove,
      chance: null,
      successPressure: 0,
      failurePressure: enemyMove?.impact ? -enemyMove.impact : 0,
      successLabel: "OPEN",
      failureLabel: enemyMove?.impact ? `-${enemyMove.impact} PRESSURE` : "0",
    };
  }
  return {
    lane,
    playerMove,
    enemyMove,
    chance: contestChance(playerMove, enemyMove, state),
    successPressure: playerMove.impact,
    failurePressure: enemyMove?.impact ? -enemyMove.impact : 0,
    successLabel: successLabel(playerMove),
    failureLabel: failureLabel(enemyMove),
  };
}

export function getPlacementPreview(state, cardId, lane) {
  const card = state.player.hand.find((entry) => entry.id === cardId) ?? null;
  const validation = placementValidation(state, card, lane);
  if (!validation.legal) return { ...validation, lane, card, forecast: null };
  const projected = clone(state);
  projected.player.lanes[lane].push(zoneCard(card));
  if (projected.player.conditions.charge && projected.player.conditions.chargeLane === null) {
    const move = compilePlayerMove(projected.player.lanes[lane], {
      lane,
      chargeLane: null,
      chargeReady: false,
    });
    if (move?.impact > 0 && !hasDesign(projected.player.lanes[lane], "charge")) {
      projected.player.conditions.chargeLane = lane;
    }
  }
  return {
    legal: true,
    reason: "",
    lane,
    card,
    forecast: getLaneForecast(projected, lane),
  };
}

function invalid(state, notice) {
  return { ...state, notice };
}

export function placePlayerCard(state, cardId, lane) {
  const cardIndex = state.player.hand.findIndex((entry) => entry.id === cardId);
  const card = cardIndex === -1 ? null : state.player.hand[cardIndex];
  const validation = placementValidation(state, card, lane);
  if (!validation.legal) return invalid(state, validation.reason);

  const next = clone(state);
  next.playerActionSequence += 1;
  const actionId = `player-action-${next.round}-${next.playerActionSequence}`;
  const snapshot = {
    player: clone(state.player),
    eventSequence: state.eventSequence,
    pendingEventsLength: state.pendingEvents.length,
    notice: state.notice,
  };
  const selected = next.player.hand.splice(cardIndex, 1)[0];
  next.player.reserve -= selected.cost;
  next.player.lanes[lane].push(selected);

  if (next.player.conditions.charge && next.player.conditions.chargeLane === null) {
    const move = compilePlayerMove(next.player.lanes[lane], {
      lane,
      chargeLane: null,
      chargeReady: false,
    });
    if (move?.impact > 0 && !hasDesign(next.player.lanes[lane], "charge")) {
      next.player.conditions.chargeLane = lane;
    }
  }

  const move = compilePlayerMove(next.player.lanes[lane], contextForLane(next, lane));
  next.pendingPlayerActions.push({
    type: "play",
    actionId,
    card: zoneCard(selected),
    lane,
    snapshot,
  });
  next.pendingEvents.push(event(
    next,
    "play",
    `${selected.name} connected in Lane ${lane + 1}`,
    `${selected.cost} Reserve spent. The stack is now ${move.name}. No replacement card is drawn.`,
    `stage-${selected.designId}`,
    lane,
    "player",
    actionId,
  ));
  next.notice = `${move.name} staged in Lane ${lane + 1}.`;
  return next;
}

export function undoPlayerAction(state) {
  if (state.phase !== "player-action" || state.pendingPlayerActions.length === 0) {
    return invalid(state, "There is no staged card to undo.");
  }
  const next = clone(state);
  const action = next.pendingPlayerActions.pop();
  next.player = action.snapshot.player;
  next.eventSequence = action.snapshot.eventSequence;
  next.pendingEvents = next.pendingEvents.slice(0, action.snapshot.pendingEventsLength);
  next.notice = `${action.card.name} returned to the rack.`;
  return next;
}

export function returnPlayerCard(state, cardId) {
  const action = state.pendingPlayerActions.at(-1);
  if (!action || action.card.id !== cardId) {
    return invalid(state, "Only the most recently staged card can return directly.");
  }
  return undoPlayerAction(state);
}

function enemySequenceLegal(cards, state) {
  if (!sequenceAllowed("enemy", cards)) return false;
  if (cards[0]?.type === "finisher" && state.pressure > -2) return false;
  if (hasDesign(cards, "breach") && cards.length > 1) {
    return hasDesign(cards, "wind-up") && hasType(cards, "attack");
  }
  return true;
}

function orderedSequences(cards, maxLength = CARD_BATTLE_RULES.maxStack) {
  const results = [];
  function visit(prefix, remaining) {
    if (prefix.length > 0) results.push(prefix);
    if (prefix.length >= maxLength) return;
    for (let index = 0; index < remaining.length; index += 1) {
      visit([...prefix, remaining[index]], [
        ...remaining.slice(0, index),
        ...remaining.slice(index + 1),
      ]);
    }
  }
  visit([], cards);
  return results;
}

function buildEnemyPlan(state) {
  const planning = clone(state);
  const intents = [];
  const usedLanes = new Set();
  const random = randomSequence(`${state.seed}|enemy-plan|round-${state.round}`);
  const moveLimit = state.pressure > 0
    ? ENEMY_AI_TUNING.behindMoveLimit
    : state.pressure < 0
      ? ENEMY_AI_TUNING.aheadMoveLimit
      : ENEMY_AI_TUNING.normalMoveLimit;

  while (intents.length < moveLimit && planning.enemy.reserve > 0) {
    const options = [];
    for (const cards of orderedSequences(planning.enemy.hand)) {
      const cost = cards.reduce((sum, card) => sum + card.cost, 0);
      if (cost > planning.enemy.reserve || !enemySequenceLegal(cards, planning)) continue;
      const move = compileEnemyMove(cards);
      for (const lane of LANES) {
        if (usedLanes.has(lane)) continue;
        const score =
          move.impact * ENEMY_AI_TUNING.impactWeight +
          move.resistance * ENEMY_AI_TUNING.resistanceWeight +
          cards.length * ENEMY_AI_TUNING.comboWeight +
          cost * ENEMY_AI_TUNING.costWeight +
          (hasDesign(cards, "breach") ? ENEMY_AI_TUNING.finisherWeight : 0);
        options.push({ cards, cost, lane, move, score, tie: random() });
      }
    }
    if (options.length === 0) break;
    options.sort((left, right) =>
      right.score - left.score ||
      right.tie - left.tie ||
      left.move.signature.localeCompare(right.move.signature));
    const chosen = options[0];
    const committed = [];
    for (const chosenCard of chosen.cards) {
      const index = planning.enemy.hand.findIndex((card) => card.id === chosenCard.id);
      if (index !== -1) committed.push(planning.enemy.hand.splice(index, 1)[0]);
    }
    planning.enemy.reserve -= chosen.cost;
    intents.push({
      lane: chosen.lane,
      cards: committed.map(zoneCard),
      move: compileEnemyMove(committed),
      cost: chosen.cost,
      score: Number(chosen.score.toFixed(3)),
    });
    usedLanes.add(chosen.lane);
  }
  return { enemy: planning.enemy, intents };
}

export function planEnemyIntents(state) {
  return buildEnemyPlan(state).intents;
}

function lockEnemyPreview(state) {
  const plan = buildEnemyPlan(state);
  state.enemy = plan.enemy;
  const lanes = emptyIntentLanes();
  for (const intent of plan.intents) lanes[intent.lane] = intent;
  state.enemyPreview = { round: state.round, locked: true, lanes };
  for (const intent of plan.intents) {
    state.pendingEvents.push(event(
      state,
      "enemy-intent",
      `${intent.move.name} locked in Lane ${intent.lane + 1}`,
      `${intent.cards.length} card${intent.cards.length === 1 ? "" : "s"} and ${intent.cost} Reserve are committed.`,
      `intent-${intent.move.category}`,
      intent.lane,
      "enemy",
    ));
  }
}

function prepareRound(state) {
  const replenishment = state.scenario.replenishment;
  state.phase = "player-action";
  state.player.lanes = emptyLanes();
  state.pendingPlayerActions = [];
  state.pendingEvents = [];
  state.currentReview = null;
  state.player.reserve = Math.min(
    CARD_BATTLE_RULES.commandCap,
    state.player.reserve + CARD_BATTLE_RULES.commandPerRound + state.scenario.reservePerRoundBonus,
  );
  state.enemy.reserve = Math.min(
    CARD_BATTLE_RULES.commandCap,
    state.enemy.reserve + CARD_BATTLE_RULES.commandPerRound,
  );
  state.player.conditions.chargeLane = null;

  const automaticDraws = state.round > 1
    ? drawGrantedCards(state, "player", replenishment.roundStartDraw, state.pendingEvents)
    : [];
  state.currentRoundGrant = {
    automaticCards: automaticDraws.length,
    reserveBonus: state.scenario.reservePerRoundBonus,
  };
  if (automaticDraws.length > 0) {
    state.pendingEvents.push(event(
      state,
      "automatic-draw",
      `${state.scenario.name} dealt ${automaticDraws.length}`,
      `${automaticDraws.map((card) => card.name).join(", ")} entered the rack automatically.`,
      "replenish-automatic",
      null,
      "player",
    ));
  }
  if (state.scenario.reservePerRoundBonus > 0) {
    state.pendingEvents.push(event(
      state,
      "scenario-bonus",
      `+${state.scenario.reservePerRoundBonus} scenario Reserve`,
      `${state.scenario.name} raises this round's Reserve income to ${CARD_BATTLE_RULES.commandPerRound + state.scenario.reservePerRoundBonus}.`,
      "reserve-bonus",
      null,
      "player",
    ));
  }
  lockEnemyPreview(state);
  state.notice = `${state.scenario.shortName}: Breacher intent locked.`;
  return state;
}

function buildInitialState(baseSeed, shuffleIndex, scenarioId) {
  const seed = derivedSeed(baseSeed, shuffleIndex);
  const selectedScenario = getCardBattleScenario(scenarioId);
  const playerDeck = deterministicShuffle(makeDeck("player"), `${seed}|player|initial`);
  const enemyDeck = deterministicShuffle(makeDeck("enemy"), `${seed}|enemy|initial`);
  const openingHand = Math.min(CARD_BATTLE_RULES.handSize, selectedScenario.openingHand);
  const state = {
    version: "0.2",
    source: CARD_BATTLE_SOURCE,
    scenario: selectedScenario,
    scenarioId: selectedScenario.id,
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
      reserve: 0,
      drawPile: playerDeck.slice(openingHand),
      hand: playerDeck.slice(0, openingHand),
      discard: [],
      lanes: emptyLanes(),
      conditions: { charge: false, chargeLane: null },
    },
    enemy: {
      reserve: 0,
      drawPile: enemyDeck.slice(CARD_BATTLE_RULES.handSize),
      hand: enemyDeck.slice(0, CARD_BATTLE_RULES.handSize),
      discard: [],
      conditions: { fear: false },
    },
    enemyPreview: { round: 0, locked: false, lanes: emptyIntentLanes() },
    pendingPlayerActions: [],
    pendingEvents: [],
    currentReview: null,
    currentRoundGrant: { automaticCards: 0, reserveBonus: 0 },
    history: [],
    unlocks: { fearDrawClaimed: false, pressureDrawClaimed: false },
    rng: { playerReshuffles: 0, enemyReshuffles: 0 },
    eventSequence: 0,
    playerActionSequence: 0,
  };
  return prepareRound(state);
}

export function createCardBattleState(
  seed = "BW-CARD-V0.2-06",
  scenarioId = DEFAULT_CARD_BATTLE_SCENARIO_ID,
) {
  return buildInitialState(String(seed), 0, scenarioId);
}

export function replaySameState(state) {
  return buildInitialState(state.baseSeed, state.shuffleIndex, state.scenarioId);
}

export function replayNewShuffle(state) {
  return buildInitialState(state.baseSeed, state.shuffleIndex + 1, state.scenarioId);
}

function centralPressure(pressure) {
  return pressure >= CARD_BATTLE_RULES.breakRearmMin && pressure <= CARD_BATTLE_RULES.breakRearmMax;
}

function breakRefresh(state, events) {
  state.player.discard.push(...state.player.hand.map(zoneCard));
  state.enemy.discard.push(...state.enemy.hand.map(zoneCard));
  state.player.hand = [];
  state.enemy.hand = [];
  state.player.conditions = { charge: false, chargeLane: null };
  state.enemy.conditions = { fear: false };
  const count = state.scenario.replenishment.breakRefill;
  return {
    playerDrawn: drawGrantedCards(state, "player", count, events).length,
    enemyDrawn: drawGrantedCards(state, "enemy", count, events).length,
  };
}

function settleScenarioReplenishment(
  state,
  laneResults,
  events,
  { fearCreated, pressureBefore, pressureAfter },
) {
  const policy = state.scenario.replenishment;
  const contestedSuccess = laneResults.some((result) =>
    result.playerMove && result.enemyMove && result.success,
  );
  const comboSuccess = laneResults.some((result) =>
    result.playerMove?.cards.length > 1 && result.success,
  );
  const cardEffectDraws = laneResults.reduce((sum, result) =>
    sum + (result.success ? result.playerMove?.drawOnSuccess ?? 0 : 0),
  0);

  const sources = [];
  if (contestedSuccess && policy.contestedSuccessDraw > 0) {
    sources.push({ type: "outcome", label: "CONTEST", requested: policy.contestedSuccessDraw });
  }
  if (comboSuccess && policy.successfulComboDraw > 0) {
    sources.push({ type: "outcome", label: "COMBO", requested: policy.successfulComboDraw });
  }
  if (cardEffectDraws > 0) {
    sources.push({ type: "card", label: "CARD EFFECT", requested: cardEffectDraws });
  }
  if (fearCreated && !state.unlocks.fearDrawClaimed && policy.fearUnlockDraw > 0) {
    state.unlocks.fearDrawClaimed = true;
    sources.push({ type: "unlock", label: "FEAR UNLOCK", requested: policy.fearUnlockDraw });
  }
  const crossedPressureUnlock =
    pressureBefore < policy.pressureUnlockAt && pressureAfter >= policy.pressureUnlockAt;
  if (
    crossedPressureUnlock &&
    !state.unlocks.pressureDrawClaimed &&
    policy.pressureUnlockDraw > 0
  ) {
    state.unlocks.pressureDrawClaimed = true;
    sources.push({ type: "unlock", label: "+2 PRESSURE UNLOCK", requested: policy.pressureUnlockDraw });
  }
  if (state.player.hand.length === 0 && sources.length === 0 && policy.emptyRackFallback > 0) {
    sources.push({ type: "fallback", label: "LAST SIGNAL", requested: policy.emptyRackFallback });
  }

  const requested = sources.reduce((sum, source) => sum + source.requested, 0);
  const playerDrawn = drawGrantedCards(state, "player", requested, events);
  const enemyDrawn = drawGrantedCards(
    state,
    "enemy",
    policy.enemyReplenishment,
    events,
  );
  if (playerDrawn.length > 0) {
    events.push(event(
      state,
      "replenish",
      `${playerDrawn.length} card${playerDrawn.length === 1 ? "" : "s"} granted`,
      `${sources.map((source) => source.label).join(" + ")} replenished ${playerDrawn.map((card) => card.name).join(", ")}.`,
      "replenish-player",
      null,
      "player",
    ));
  }
  if (enemyDrawn.length > 0) {
    events.push(event(
      state,
      "replenish",
      "Breacher feed replenished",
      `${enemyDrawn.length} hidden enemy card${enemyDrawn.length === 1 ? "" : "s"} entered its rack.`,
      "replenish-enemy",
      null,
      "enemy",
    ));
  }
  return {
    contestedSuccess,
    comboSuccess,
    cardEffectDraws,
    unlockDraws: sources
      .filter((source) => source.type === "unlock")
      .reduce((sum, source) => sum + source.requested, 0),
    outcomeDraws: sources
      .filter((source) => source.type === "outcome")
      .reduce((sum, source) => sum + source.requested, 0),
    fallbackDraws: sources
      .filter((source) => source.type === "fallback")
      .reduce((sum, source) => sum + source.requested, 0),
    sources,
    requested,
    playerDrawn: playerDrawn.length,
    enemyDrawn: enemyDrawn.length,
  };
}

export function resolveRound(state) {
  if (state.phase !== "player-action") return invalid(state, "This round has already resolved.");
  const next = clone(state);
  const pressureBefore = next.pressure;
  const events = [...next.pendingEvents];
  const laneResults = [];
  let pressureDelta = 0;
  let chargeCreated = false;
  let fearCreated = false;
  let chargeUsed = false;
  let fearUsed = false;

  for (const lane of LANES) {
    const forecast = getLaneForecast(next, lane);
    const playerMove = forecast.playerMove;
    const enemyMove = forecast.enemyMove;
    if (!playerMove && !enemyMove) {
      laneResults.push({
        lane,
        playerMove: null,
        enemyMove: null,
        chance: null,
        roll: null,
        success: null,
        pressure: 0,
        successLabel: "OPEN",
        failureLabel: "OPEN",
      });
      continue;
    }
    if (!playerMove) {
      const direct = -(enemyMove?.impact ?? 0);
      pressureDelta += direct;
      laneResults.push({
        lane,
        playerMove: null,
        enemyMove,
        chance: null,
        roll: null,
        success: false,
        pressure: direct,
        successLabel: "UNCONTESTED",
        failureLabel: enemyMove?.impact ? `-${enemyMove.impact} PRESSURE` : "HELD · 0",
      });
      events.push(event(
        next,
        "uncontested",
        `${enemyMove.name} lands uncontested`,
        direct < 0 ? `Lane ${lane + 1} moves Pressure ${direct}.` : `Lane ${lane + 1} sets without moving Pressure.`,
        "enemy-landed",
        lane,
        "enemy",
      ));
      continue;
    }

    const roll = deterministicContestRoll(next.seed, next.round, lane);
    const success = roll <= forecast.chance;
    const lanePressure = success ? forecast.successPressure : forecast.failurePressure;
    pressureDelta += lanePressure;
    if (playerMove.usesCharge) chargeUsed = true;
    if (playerMove.usesFear) fearUsed = true;
    if (success && playerMove.setsCharge) chargeCreated = true;
    if (success && playerMove.appliesFear) fearCreated = true;
    laneResults.push({
      lane,
      playerMove,
      enemyMove,
      chance: forecast.chance,
      roll,
      success,
      pressure: lanePressure,
      successLabel: forecast.successLabel,
      failureLabel: forecast.failureLabel,
    });
    events.push(event(
      next,
      success ? "move-success" : "move-failure",
      `${playerMove.name} ${success ? "lands" : "fails"}`,
      `Lane ${lane + 1}: rolled ${roll} against ${forecast.chance}%. ${success ? forecast.successLabel : forecast.failureLabel}.`,
      success ? `success-${playerMove.category}` : `failure-${enemyMove?.category ?? "open"}`,
      lane,
      success ? "player" : enemyMove ? "enemy" : "system",
    ));
  }

  for (const stack of next.player.lanes) next.player.discard.push(...stack.map(zoneCard));
  for (const intent of next.enemyPreview.lanes) {
    if (intent) next.enemy.discard.push(...intent.cards.map(zoneCard));
  }
  next.player.lanes = emptyLanes();
  next.enemyPreview = { round: next.round, locked: true, lanes: emptyIntentLanes() };
  if (chargeUsed) next.player.conditions.charge = false;
  if (fearUsed) next.enemy.conditions.fear = false;
  if (chargeCreated) next.player.conditions.charge = true;
  if (fearCreated) next.enemy.conditions.fear = true;
  next.player.conditions.chargeLane = null;

  next.pressure = Math.max(
    CARD_BATTLE_RULES.pressureMin,
    Math.min(CARD_BATTLE_RULES.pressureMax, next.pressure + pressureDelta),
  );
  const actualDelta = next.pressure - pressureBefore;
  events.push(event(
    next,
    "pressure",
    actualDelta === 0 ? "Pressure holds" : "Shared Pressure moves",
    `${pressureBefore} to ${next.pressure} (${actualDelta > 0 ? "+" : ""}${actualDelta}) after all four lane results net together.`,
    actualDelta > 0 ? "pressure-player" : actualDelta < 0 ? "pressure-enemy" : "pressure-hold",
    null,
    actualDelta > 0 ? "player" : actualDelta < 0 ? "enemy" : "system",
  ));

  let breakTriggered = false;
  let replenishment = null;
  if (next.pressure >= CARD_BATTLE_RULES.pressureMax || next.pressure <= CARD_BATTLE_RULES.pressureMin) {
    const winner = next.pressure > 0 ? "player" : "enemy";
    next.result = {
      winner,
      round: next.round,
      pressure: next.pressure,
      reason: "Pressure end reached before Break.",
    };
    next.phase = "result";
    events.push(event(
      next,
      "victory",
      winner === "player" ? "LINE HELD" : "LINE BREACHED",
      `Pressure reached ${next.pressure}; victory resolves before Break.`,
      `victory-${winner}`,
      null,
      winner,
    ));
  } else {
    const crossedPlayerBreak = pressureBefore < CARD_BATTLE_RULES.playerBreak && next.pressure >= CARD_BATTLE_RULES.playerBreak;
    const crossedEnemyBreak = pressureBefore > CARD_BATTLE_RULES.enemyBreak && next.pressure <= CARD_BATTLE_RULES.enemyBreak;
    if (next.breakArmed && (crossedPlayerBreak || crossedEnemyBreak)) {
      breakTriggered = true;
      next.breakArmed = false;
      const breakDraws = breakRefresh(next, events);
      replenishment = {
        contestedSuccess: false,
        comboSuccess: false,
        cardEffectDraws: 0,
        unlockDraws: 0,
        outcomeDraws: 0,
        fallbackDraws: 0,
        sources: [{
          type: "break",
          label: "PRESSURE BREAK",
          requested: next.scenario.replenishment.breakRefill,
        }],
        requested: next.scenario.replenishment.breakRefill,
        playerDrawn: breakDraws.playerDrawn,
        enemyDrawn: breakDraws.enemyDrawn,
      };
      events.push(event(
        next,
        "break",
        "PRESSURE BREAK",
        `Pressure stays at ${next.pressure}; both racks receive ${next.scenario.replenishment.breakRefill} and Charge/Fear clear.`,
        crossedPlayerBreak ? "break-player" : "break-enemy",
        null,
        "system",
      ));
    } else {
      replenishment = settleScenarioReplenishment(next, laneResults, events, {
        fearCreated,
        pressureBefore,
        pressureAfter: next.pressure,
      });
      if (!next.breakArmed && centralPressure(next.pressure)) {
        next.breakArmed = true;
        events.push(event(
          next,
          "break-rearm",
          "Pressure Break rearmed",
          `Pressure returned to the central range at ${next.pressure}.`,
          "break-rearm",
        ));
      }
    }
    next.phase = "round-review";
  }

  next.currentReview = {
    round: next.round,
    pressureBefore,
    pressureAfter: next.pressure,
    pressureDelta: actualDelta,
    breakTriggered,
    winner: next.result?.winner ?? null,
    replenishment,
    laneResults,
    events,
  };
  next.history.push(clone(next.currentReview));
  next.pendingEvents = [];
  next.pendingPlayerActions = [];
  next.notice = next.result
    ? "Battle complete."
    : breakTriggered
      ? "Break refilled both racks. Review, then continue."
      : "Round resolved. Review the result and any granted cards.";
  return next;
}

export function startNextRound(state) {
  if (state.phase !== "round-review" || state.result) {
    return invalid(state, "Finish the current review before continuing.");
  }
  const next = clone(state);
  next.round += 1;
  return prepareRound(next);
}

function expectedLaneValue(forecast) {
  if (!forecast?.playerMove || forecast.chance === null) return forecast?.failurePressure ?? 0;
  const successWeight = forecast.chance / 100;
  return (
    successWeight * forecast.successPressure +
    (1 - successWeight) * forecast.failurePressure +
    (forecast.playerMove.appliesFear ? 0.35 * successWeight : 0) +
    (forecast.playerMove.setsCharge ? 0.25 * successWeight : 0) +
    (forecast.playerMove.drawOnSuccess ? 0.2 * forecast.playerMove.drawOnSuccess * successWeight : 0)
  );
}

function simulationTurn(state) {
  let next = state;
  let actions = 0;
  while (actions < 10) {
    const options = [];
    for (const card of next.player.hand) {
      for (const lane of LANES) {
        const preview = getPlacementPreview(next, card.id, lane);
        if (!preview.legal) continue;
        const before = getLaneForecast(next, lane);
        const gain = expectedLaneValue(preview.forecast) - expectedLaneValue(before);
        options.push({
          cardId: card.id,
          lane,
          gain,
          chance: preview.forecast.chance,
          comboLength: preview.forecast.playerMove.cards.length,
        });
      }
    }
    if (options.length === 0) break;
    options.sort((left, right) =>
      right.gain - left.gain ||
      right.comboLength - left.comboLength ||
      right.chance - left.chance ||
      left.lane - right.lane ||
      left.cardId.localeCompare(right.cardId));
    const best = options[0];
    if (best.gain <= 0.02) break;
    next = placePlayerCard(next, best.cardId, best.lane);
    actions += 1;
  }
  return next;
}

export function runDeterministicSimulation({
  battles = 100,
  seedPrefix = "BW-CARD-V0.2-SIM",
  maxRounds = 40,
  scenarioId = DEFAULT_CARD_BATTLE_SCENARIO_ID,
} = {}) {
  const result = {
    version: "0.2",
    scenarioId: getCardBattleScenario(scenarioId).id,
    battles,
    maxRounds,
    playerWins: 0,
    enemyWins: 0,
    unfinished: 0,
    breaks: 0,
    attempts: 0,
    successes: 0,
    cardsDrawn: 0,
    namedCombos: {},
    rounds: [],
  };
  for (let battle = 0; battle < battles; battle += 1) {
    let state = createCardBattleState(`${seedPrefix}-${battle}`, scenarioId);
    let resolvedRounds = 0;
    while (!state.result && resolvedRounds < maxRounds) {
      state = simulationTurn(state);
      state = resolveRound(state);
      resolvedRounds += 1;
      if (state.currentReview?.breakTriggered) result.breaks += 1;
      result.cardsDrawn += state.currentReview?.replenishment?.playerDrawn ?? 0;
      for (const lane of state.currentReview?.laneResults ?? []) {
        if (lane.chance !== null) {
          result.attempts += 1;
          if (lane.success) result.successes += 1;
          const name = lane.playerMove.name;
          if (lane.playerMove.cards.length > 1) {
            result.namedCombos[name] = (result.namedCombos[name] ?? 0) + 1;
          }
        }
      }
      if (!state.result && resolvedRounds < maxRounds) state = startNextRound(state);
    }
    if (state.result?.winner === "player") result.playerWins += 1;
    else if (state.result?.winner === "enemy") result.enemyWins += 1;
    else result.unfinished += 1;
    result.rounds.push(resolvedRounds);
  }
  result.averageRounds = Number((result.rounds.reduce((sum, value) => sum + value, 0) / battles).toFixed(3));
  result.averageCardsDrawn = Number((result.cardsDrawn / battles).toFixed(3));
  result.minRounds = Math.min(...result.rounds);
  result.maxRoundsObserved = Math.max(...result.rounds);
  result.successRate = result.attempts
    ? Number((result.successes / result.attempts).toFixed(4))
    : 0;
  return result;
}
