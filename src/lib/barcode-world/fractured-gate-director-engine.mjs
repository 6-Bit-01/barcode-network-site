export const DIRECTOR_SOURCE =
  "BARCODE_WORLD_FRACTURED_GATE_DIRECTORS_CUT_2026-07-28";

export const DIRECTOR_RULES = Object.freeze({
  commandStart: 16,
  commandIncome: 16,
  commandCap: 32,
  moveRange: 4,
  playerHp: 10,
  gateIntegrity: 3,
});

const TEMPO_VALUE = Object.freeze({
  Fast: 3,
  Standard: 2,
  Slow: 1,
});

const ENEMY_TIE_ORDER = Object.freeze({
  ram: 0,
  warden: 1,
  jammer: 2,
});

const OMITTED_TILES = new Set([
  "t-0-0",
  "t-0-1",
  "t-0-5",
  "t-0-6",
  "t-1-0",
  "t-1-6",
  "t-7-0",
  "t-7-6",
  "t-8-0",
  "t-8-1",
  "t-8-5",
  "t-8-6",
]);

const COVER_TILES = new Set([
  "t-2-2",
  "t-2-4",
  "t-4-1",
  "t-4-5",
  "t-6-2",
  "t-6-4",
]);

const RUBBLE_TILES = new Set(["t-4-3", "t-5-3"]);
const RAIL_TILES = new Set(["t-5-5", "t-6-5", "t-7-5"]);

function tileId(x, y) {
  return `t-${x}-${y}`;
}

function parseTile(id) {
  const match = /^t-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

const tileEntries = [];
for (let x = 0; x <= 8; x += 1) {
  for (let y = 0; y <= 6; y += 1) {
    const id = tileId(x, y);
    if (OMITTED_TILES.has(id)) continue;
    tileEntries.push([
      id,
      Object.freeze({
        id,
        x,
        y,
        terrain: RUBBLE_TILES.has(id)
          ? "rubble"
          : RAIL_TILES.has(id)
            ? "rail"
            : "floor",
        cover: COVER_TILES.has(id),
      }),
    ]);
  }
}

export const DIRECTOR_TILES = Object.freeze(Object.fromEntries(tileEntries));

export const DIRECTOR_OBJECTS = Object.freeze({
  "anchor-a": {
    id: "anchor-a",
    name: "UPPER ANCHOR",
    position: "t-3-1",
    glyph: "I",
  },
  "anchor-b": {
    id: "anchor-b",
    name: "LOWER ANCHOR",
    position: "t-3-5",
    glyph: "II",
  },
  cell: {
    id: "cell",
    name: "POWER CELL",
    position: "t-5-3",
    glyph: "⚡",
  },
  gate: {
    id: "gate",
    name: "FRACTURED GATE",
    position: "t-9-3",
    glyph: "G",
  },
});

export const DIRECTOR_CARDS = Object.freeze({
  "quick-shot": {
    id: "quick-shot",
    name: "QUICK SHOT",
    glyph: "◉",
    cost: 4,
    tempo: "Fast",
    range: 5,
    short: "2 DMG · INTERRUPT",
    target: "enemy",
  },
  "force-push": {
    id: "force-push",
    name: "FORCE PUSH",
    glyph: "≫",
    cost: 5,
    tempo: "Standard",
    range: 3,
    short: "1 DMG · PUSH 2",
    target: "enemy",
  },
  "dash-strike": {
    id: "dash-strike",
    name: "DASH STRIKE",
    glyph: "↯",
    cost: 6,
    tempo: "Fast",
    range: 3,
    short: "MOVE IN · 2 DMG",
    target: "enemy",
  },
  "guard-pulse": {
    id: "guard-pulse",
    name: "GUARD PULSE",
    glyph: "⬡",
    cost: 4,
    tempo: "Fast",
    range: 0,
    short: "+3 SHIELD",
    target: "self",
  },
  overload: {
    id: "overload",
    name: "OVERLOAD",
    glyph: "✦",
    cost: 8,
    tempo: "Slow",
    range: 4,
    short: "BLAST 4 · CANCEL INTENTS",
    target: "enemy-or-cell",
  },
});

const ENEMY_BLUEPRINTS = Object.freeze({
  ram: {
    id: "ram",
    name: "RAM",
    role: "BREAKS THE GATE",
    glyph: "▶",
    position: "t-6-3",
    hp: 9,
    color: "orange",
  },
  warden: {
    id: "warden",
    name: "WARDEN",
    role: "BLOCKS & SHIELDS",
    glyph: "⬢",
    position: "t-5-4",
    hp: 7,
    color: "red",
  },
  jammer: {
    id: "jammer",
    name: "JAMMER",
    role: "DRAINS ANCHORS",
    glyph: "⌁",
    position: "t-5-2",
    hp: 6,
    color: "violet",
  },
});

function clone(value) {
  return structuredClone(value);
}

function activeEnemies(state) {
  return Object.values(state.enemies).filter((enemy) => enemy.hp > 0);
}

function distance(fromId, toId) {
  const from = parseTile(fromId);
  const to = parseTile(toId);
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function adjacent(fromId, toId) {
  return distance(fromId, toId) === 1;
}

function isTile(id) {
  return Boolean(DIRECTOR_TILES[id]);
}

function enemyAt(state, position) {
  return activeEnemies(state).find((enemy) => enemy.position === position);
}

function isBlocked(state, position, options = {}) {
  if (!isTile(position)) return true;
  if (
    Object.values(DIRECTOR_OBJECTS).some(
      (object) =>
        object.position === position &&
        object.id !== "gate" &&
        object.id !== options.ignoreObject,
    )
  ) {
    return true;
  }
  if (
    enemyAt(state, position) &&
    enemyAt(state, position).id !== options.ignoreEnemy
  ) {
    return true;
  }
  return state.player.position === position && !options.allowPlayer;
}

function neighbors(state, position, options = {}) {
  const point = parseTile(position);
  if (!point) return [];
  return [
    tileId(point.x + 1, point.y),
    tileId(point.x - 1, point.y),
    tileId(point.x, point.y + 1),
    tileId(point.x, point.y - 1),
  ].filter(
    (candidate) =>
      isTile(candidate) && !isBlocked(state, candidate, options),
  );
}

function tileCost(id) {
  return DIRECTOR_TILES[id]?.terrain === "rubble" ? 2 : 1;
}

function pathsFrom(state, start, budget, options = {}) {
  const found = new Map([[start, { cost: 0, path: [start] }]]);
  const queue = [start];
  while (queue.length) {
    queue.sort((left, right) => found.get(left).cost - found.get(right).cost);
    const current = queue.shift();
    const currentPath = found.get(current);
    for (const candidate of neighbors(state, current, options)) {
      const cost = currentPath.cost + tileCost(candidate);
      if (cost > budget) continue;
      if (!found.has(candidate) || cost < found.get(candidate).cost) {
        found.set(candidate, {
          cost,
          path: [...currentPath.path, candidate],
        });
        queue.push(candidate);
      }
    }
  }
  return found;
}

function routeToward(state, from, destination, steps, options = {}) {
  const visited = new Map([[from, [from]]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    if (current === destination) break;
    for (const candidate of neighbors(state, current, {
      ...options,
      allowPlayer: destination === state.player.position,
    })) {
      if (visited.has(candidate)) continue;
      visited.set(candidate, [...visited.get(current), candidate]);
      queue.push(candidate);
    }
  }
  let path = visited.get(destination);
  if (!path) {
    const destinationPoint = parseTile(destination);
    const candidates = [...visited.entries()].sort((left, right) => {
      const leftPoint = parseTile(left[0]);
      const rightPoint = parseTile(right[0]);
      const leftDistance =
        Math.abs(leftPoint.x - destinationPoint.x) +
        Math.abs(leftPoint.y - destinationPoint.y);
      const rightDistance =
        Math.abs(rightPoint.x - destinationPoint.x) +
        Math.abs(rightPoint.y - destinationPoint.y);
      return leftDistance - rightDistance;
    });
    path = candidates[0]?.[1] ?? [from];
  }
  return path.slice(0, Math.min(path.length, steps + 1));
}

function intentTargetPosition(state, intent) {
  if (intent.targetId === "player") return state.player.position;
  if (intent.targetId === "gate") return DIRECTOR_OBJECTS.gate.position;
  if (intent.targetId === "anchor-a") {
    return DIRECTOR_OBJECTS["anchor-a"].position;
  }
  if (intent.targetId === "anchor-b") {
    return DIRECTOR_OBJECTS["anchor-b"].position;
  }
  if (state.enemies[intent.targetId]) {
    return state.enemies[intent.targetId].position;
  }
  return intent.destination ?? null;
}

function lowestPoweredAnchor(state) {
  return ["anchor-a", "anchor-b"].find(
    (id) => state.anchors[id].powered,
  );
}

function planRam(state) {
  const enemy = state.enemies.ram;
  if (enemy.hp <= 0) return null;
  if (distance(enemy.position, state.player.position) <= 2) {
    let path = routeToward(
      state,
      enemy.position,
      state.player.position,
      2,
      { ignoreEnemy: "ram" },
    );
    if (path.at(-1) === state.player.position) {
      path = path.slice(0, -1);
    }
    return {
      id: `intent-${state.turn}-ram-body-check`,
      actorId: "ram",
      name: "BODY CHECK",
      glyph: "▶",
      targetId: "player",
      destination: path.at(-1) ?? enemy.position,
      path,
      tempo: "Standard",
      status: "ready",
      detail: "3 DMG · PUSH",
    };
  }
  if (adjacent(enemy.position, DIRECTOR_OBJECTS.gate.position)) {
    return {
      id: `intent-${state.turn}-ram-smash`,
      actorId: "ram",
      name: "GATE SMASH",
      glyph: "▰",
      targetId: "gate",
      tempo: "Slow",
      status: "ready",
      detail: "-1 GATE",
    };
  }
  const path = routeToward(
    state,
    enemy.position,
    "t-8-3",
    2,
    { ignoreEnemy: "ram" },
  );
  return {
    id: `intent-${state.turn}-ram-advance`,
    actorId: "ram",
    name: "CHARGE GATE",
    glyph: "≫",
    targetId: "gate",
    destination: path.at(-1),
    path,
    tempo: "Standard",
    status: "ready",
    detail: "ADVANCE",
  };
}

function planWarden(state) {
  const enemy = state.enemies.warden;
  if (enemy.hp <= 0) return null;
  if (state.gate.sealing) {
    let path = routeToward(
      state,
      enemy.position,
      state.player.position,
      2,
      { ignoreEnemy: "warden" },
    );
    if (path.at(-1) === state.player.position) {
      path = path.slice(0, -1);
    }
    return {
      id: `intent-${state.turn}-warden-eject`,
      actorId: "warden",
      name: "EJECT",
      glyph: "↤",
      targetId: "player",
      destination: path.at(-1),
      path,
      tempo: "Standard",
      status: "ready",
      detail: "PUSH OFF GATE",
    };
  }
  if (adjacent(enemy.position, state.player.position)) {
    return {
      id: `intent-${state.turn}-warden-bash`,
      actorId: "warden",
      name: "SHIELD BASH",
      glyph: "⬢",
      targetId: "player",
      tempo: "Standard",
      status: "ready",
      detail: "2 DMG",
    };
  }
  if (state.enemies.ram.hp <= 0) {
    let path = routeToward(
      state,
      enemy.position,
      state.player.position,
      2,
      { ignoreEnemy: "warden" },
    );
    if (path.at(-1) === state.player.position) {
      path = path.slice(0, -1);
    }
    return {
      id: `intent-${state.turn}-warden-hunt`,
      actorId: "warden",
      name: "HUNT",
      glyph: "↣",
      targetId: "player",
      destination: path.at(-1) ?? enemy.position,
      path,
      tempo: "Standard",
      status: "ready",
      detail: "CLOSE DISTANCE",
    };
  }
  return {
    id: `intent-${state.turn}-warden-link`,
    actorId: "warden",
    name: "SHIELD RAM",
    glyph: "⬡",
    targetId: "ram",
    tempo: "Standard",
    status: "ready",
    detail: "+3 SHIELD",
  };
}

function planJammer(state) {
  const enemy = state.enemies.jammer;
  if (enemy.hp <= 0) return null;
  const anchorId = lowestPoweredAnchor(state);
  if (anchorId) {
    return {
      id: `intent-${state.turn}-jammer-drain-${anchorId}`,
      actorId: "jammer",
      name: "DRAIN ANCHOR",
      glyph: "⌁",
      targetId: anchorId,
      tempo: "Slow",
      status: "ready",
      detail: "ANCHOR OFFLINE",
    };
  }
  if (distance(enemy.position, state.player.position) <= 4) {
    return {
      id: `intent-${state.turn}-jammer-static`,
      actorId: "jammer",
      name: "STATIC BOLT",
      glyph: "ϟ",
      targetId: "player",
      tempo: "Slow",
      status: "ready",
      detail: "2 DMG",
    };
  }
  const target = DIRECTOR_OBJECTS["anchor-a"].position;
  const path = routeToward(state, enemy.position, target, 1, {
    ignoreEnemy: "jammer",
    ignoreObject: "anchor-a",
  });
  return {
    id: `intent-${state.turn}-jammer-move`,
    actorId: "jammer",
    name: "SEEK ANCHOR",
    glyph: "⌁",
    targetId: "anchor-a",
    destination: path.at(-1),
    path,
    tempo: "Standard",
    status: "ready",
    detail: "ADVANCE",
  };
}

export function planDirectorIntents(state) {
  const intents = [planRam(state), planWarden(state), planJammer(state)]
    .filter(Boolean)
    .sort((left, right) => {
      const tempo = TEMPO_VALUE[right.tempo] - TEMPO_VALUE[left.tempo];
      return (
        tempo ||
        ENEMY_TIE_ORDER[left.actorId] - ENEMY_TIE_ORDER[right.actorId]
      );
    });
  return intents;
}

function replanIntents(state) {
  const canceledByActor = new Map(
    state.intents
      .filter((intent) => intent.status === "canceled")
      .map((intent) => [
        intent.actorId,
        intent.cancelReason ?? "INTERRUPTED",
      ]),
  );
  state.intents = planDirectorIntents(state).map((intent) => {
    const cancelReason = canceledByActor.get(intent.actorId);
    return cancelReason
      ? { ...intent, status: "canceled", cancelReason }
      : intent;
  });
}

function initialState(seed) {
  const enemies = Object.fromEntries(
    Object.entries(ENEMY_BLUEPRINTS).map(([id, enemy]) => [
      id,
      {
        ...clone(enemy),
        maxHp: enemy.hp,
        shield: 0,
        stunned: false,
      },
    ]),
  );
  const state = {
    seed,
    turn: 1,
    phase: "player",
    command: DIRECTOR_RULES.commandStart,
    moveAvailable: true,
    player: {
      position: "t-1-3",
      hp: DIRECTOR_RULES.playerHp,
      maxHp: DIRECTOR_RULES.playerHp,
      shield: 0,
      cover: 0,
    },
    gate: {
      integrity: DIRECTOR_RULES.gateIntegrity,
      maxIntegrity: DIRECTOR_RULES.gateIntegrity,
      sealing: false,
      secure: false,
    },
    anchors: {
      "anchor-a": { powered: false },
      "anchor-b": { powered: false },
    },
    cell: {
      active: true,
    },
    enemies,
    cardUses: {},
    intents: [],
    enemyQueue: [],
    enemyCursor: 0,
    lastEvent: {
      id: "event-opening",
      tone: "objective",
      text: "POWER BOTH ANCHORS → SEAL THE GATE",
      detail: "RAM reaches the Gate soon.",
    },
    eventCounter: 0,
    result: null,
  };
  state.intents = planDirectorIntents(state);
  return state;
}

export function createDirectorState(seed = "FG-DIRECTOR-01") {
  return initialState(seed);
}

export function resetDirectorState(state) {
  return initialState(state.seed);
}

function addEvent(state, tone, text, detail = "") {
  state.eventCounter += 1;
  state.lastEvent = {
    id: `event-${state.eventCounter}`,
    tone,
    text,
    detail,
  };
}

function updateCover(state) {
  state.player.cover = DIRECTOR_TILES[state.player.position]?.cover ? 1 : 0;
}

export function getDirectorReachableTiles(state) {
  if (state.phase !== "player" || !state.moveAvailable) return {};
  const found = pathsFrom(
    state,
    state.player.position,
    DIRECTOR_RULES.moveRange,
    { allowPlayer: true },
  );
  return Object.fromEntries(
    [...found.entries()]
      .filter(([id]) => id !== state.player.position)
      .map(([id, route]) => [id, route]),
  );
}

export function moveDirectorPlayer(state, destination) {
  const route = getDirectorReachableTiles(state)[destination];
  if (!route) return state;
  const next = clone(state);
  next.player.position = destination;
  next.moveAvailable = false;
  updateCover(next);
  replanIntents(next);
  addEvent(
    next,
    "move",
    next.player.cover ? "COVER TAKEN" : "POSITION CHANGED",
    next.player.cover ? "Incoming damage reduced by 1." : "",
  );
  return next;
}

function actorPosition(state, targetId) {
  if (state.enemies[targetId]) return state.enemies[targetId].position;
  if (DIRECTOR_OBJECTS[targetId]) return DIRECTOR_OBJECTS[targetId].position;
  if (targetId === "player") return state.player.position;
  return null;
}

function cardAvailable(state, cardId) {
  const card = DIRECTOR_CARDS[cardId];
  if (!card || state.phase !== "player") return false;
  if (state.cardUses[cardId]) return false;
  return state.command >= card.cost;
}

function validEnemyTargets(state, range) {
  return activeEnemies(state)
    .filter(
      (enemy) => distance(state.player.position, enemy.position) <= range,
    )
    .map((enemy) => enemy.id);
}

export function getDirectorCardTargets(state, cardId) {
  if (!cardAvailable(state, cardId)) return [];
  const card = DIRECTOR_CARDS[cardId];
  if (card.target === "self") return ["player"];
  const targets = validEnemyTargets(state, card.range);
  if (
    card.target === "enemy-or-cell" &&
    state.cell.active &&
    distance(
      state.player.position,
      DIRECTOR_OBJECTS.cell.position,
    ) <= card.range
  ) {
    targets.push("cell");
  }
  return targets;
}

function intentFor(state, enemyId) {
  return state.intents.find(
    (intent) => intent.actorId === enemyId && intent.status === "ready",
  );
}

function tempoInterrupts(card, intent) {
  return (
    Boolean(intent) &&
    TEMPO_VALUE[card.tempo] > TEMPO_VALUE[intent.tempo]
  );
}

function pushDestination(state, enemyId, spaces) {
  const enemy = state.enemies[enemyId];
  const playerPoint = parseTile(state.player.position);
  const enemyPoint = parseTile(enemy.position);
  if (!playerPoint || !enemyPoint) {
    return { destination: enemy.position, collision: true, path: [] };
  }
  const dx = Math.sign(enemyPoint.x - playerPoint.x);
  const dy = Math.sign(enemyPoint.y - playerPoint.y);
  const horizontal = Math.abs(enemyPoint.x - playerPoint.x) >=
    Math.abs(enemyPoint.y - playerPoint.y);
  const stepX = horizontal ? dx || 1 : 0;
  const stepY = horizontal ? 0 : dy || 1;
  let current = enemy.position;
  const path = [];
  let collision = false;
  for (let step = 0; step < spaces; step += 1) {
    const point = parseTile(current);
    const candidate = tileId(point.x + stepX, point.y + stepY);
    if (
      !isTile(candidate) ||
      isBlocked(state, candidate, { ignoreEnemy: enemyId })
    ) {
      collision = true;
      break;
    }
    current = candidate;
    path.push(candidate);
  }
  return {
    destination: current,
    collision,
    path,
    rail: DIRECTOR_TILES[current]?.terrain === "rail",
  };
}

function nearbyEnemies(state, position, radius) {
  return activeEnemies(state)
    .filter((enemy) => distance(enemy.position, position) <= radius)
    .map((enemy) => enemy.id);
}

export function previewDirectorCard(state, cardId, targetId) {
  const card = DIRECTOR_CARDS[cardId];
  if (!card) return null;
  const targets = getDirectorCardTargets(state, cardId);
  const legal = targets.includes(targetId);
  if (!legal) {
    return {
      legal: false,
      cardId,
      targetId,
      summary: state.cardUses[cardId]
        ? "USED THIS TURN"
        : state.command < card.cost
          ? `NEED ${card.cost - state.command} COMMAND`
          : "OUT OF RANGE",
    };
  }

  if (cardId === "guard-pulse") {
    return {
      legal: true,
      cardId,
      targetId,
      damage: 0,
      summary: "+3 SHIELD",
      interrupts: false,
      relation: "",
    };
  }

  if (targetId === "cell") {
    const victims = nearbyEnemies(
      state,
      DIRECTOR_OBJECTS.cell.position,
      2,
    );
    return {
      legal: true,
      cardId,
      targetId,
      damage: 4,
      victims,
      summary: `DETONATE · ${victims.length} ENEM${
        victims.length === 1 ? "Y" : "IES"
      } IN BLAST · CANCELS INTENTS`,
      interrupts: false,
      relation: "BLAST OVERRIDES INTENT",
    };
  }

  const intent = intentFor(state, targetId);
  const interrupts = tempoInterrupts(card, intent);
  if (cardId === "force-push") {
    const push = pushDestination(state, targetId, 2);
    const impact = 1 + (push.collision ? 2 : 0) + (push.rail ? 2 : 0);
    const shieldAbsorbed = Math.min(
      state.enemies[targetId].shield,
      impact,
    );
    const damage = impact - shieldAbsorbed;
    return {
      legal: true,
      cardId,
      targetId,
      damage,
      impact,
      shieldAbsorbed,
      push,
      interrupts,
      relation: intent
        ? `${card.tempo.toUpperCase()} ${
            interrupts ? ">" : "≤"
          } ${intent.tempo.toUpperCase()}`
        : "",
      summary: `${damage} DMG${
        shieldAbsorbed ? ` · ${shieldAbsorbed} SHIELD` : ""
      } · PUSH ${
        push.path.length
      }${push.rail ? " · RAIL STUN" : push.collision ? " · COLLISION" : ""}`,
    };
  }

  const damage =
    cardId === "quick-shot"
      ? 2
      : cardId === "dash-strike"
        ? 2
        : 4;
  const shieldAbsorbed = Math.min(
    state.enemies[targetId].shield,
    damage,
  );
  const dealt = damage - shieldAbsorbed;
  return {
    legal: true,
    cardId,
    targetId,
    damage: dealt,
    impact: damage,
    shieldAbsorbed,
    interrupts,
    relation: intent
      ? `${card.tempo.toUpperCase()} ${
          interrupts ? ">" : "≤"
        } ${intent.tempo.toUpperCase()}`
      : "",
    summary: `${dealt} DMG${
      shieldAbsorbed ? ` · ${shieldAbsorbed} SHIELD` : ""
    }${interrupts ? " · INTENT INTERRUPTED" : ""}`,
  };
}

function cancelIntent(state, enemyId, reason = "INTERRUPTED") {
  const intent = state.intents.find(
    (candidate) =>
      candidate.actorId === enemyId && candidate.status === "ready",
  );
  if (intent) {
    intent.status = "canceled";
    intent.cancelReason = reason;
  }
}

function damageEnemy(state, enemyId, amount) {
  const enemy = state.enemies[enemyId];
  if (!enemy || enemy.hp <= 0) return 0;
  const absorbed = Math.min(enemy.shield, amount);
  enemy.shield -= absorbed;
  const dealt = amount - absorbed;
  enemy.hp = Math.max(0, enemy.hp - dealt);
  if (enemy.hp === 0) {
    enemy.shield = 0;
    cancelIntent(state, enemyId, "DISABLED");
  }
  return dealt;
}

function detonateCell(state) {
  if (!state.cell.active) return [];
  state.cell.active = false;
  const victims = nearbyEnemies(
    state,
    DIRECTOR_OBJECTS.cell.position,
    2,
  );
  for (const enemyId of victims) {
    damageEnemy(state, enemyId, 4);
    cancelIntent(state, enemyId, "BLASTED");
  }
  if (
    distance(
      state.player.position,
      DIRECTOR_OBJECTS.cell.position,
    ) <= 2
  ) {
    damagePlayer(state, 2);
  }
  return victims;
}

function nearestOpenAdjacent(state, targetPosition) {
  const candidates = neighbors(state, targetPosition, { allowPlayer: true })
    .filter(
      (candidate) =>
        candidate !== state.player.position &&
        !enemyAt(state, candidate),
    )
    .sort(
      (left, right) =>
        distance(state.player.position, left) -
        distance(state.player.position, right),
    );
  return candidates[0] ?? state.player.position;
}

export function playDirectorCard(state, cardId, targetId) {
  const preview = previewDirectorCard(state, cardId, targetId);
  if (!preview?.legal) return state;
  const next = clone(state);
  const card = DIRECTOR_CARDS[cardId];
  next.command -= card.cost;
  next.cardUses[cardId] = true;

  if (cardId === "guard-pulse") {
    next.player.shield += 3;
    addEvent(next, "guard", "SHIELDED +3", "Ready for the Enemy Turn.");
    return next;
  }

  if (targetId === "cell") {
    const victims = detonateCell(next);
    addEvent(
      next,
      "impact",
      "POWER CELL DETONATED",
      `${victims.length} enemy${victims.length === 1 ? "" : "ies"} caught.`,
    );
    return finalizeAfterPlayerAction(next);
  }

  if (cardId === "force-push") {
    const push = pushDestination(next, targetId, 2);
    const impact =
      1 + (push.collision ? 2 : 0) + (push.rail ? 2 : 0);
    const dealt = damageEnemy(next, targetId, impact);
    const absorbed = impact - dealt;
    if (next.enemies[targetId].hp > 0) {
      next.enemies[targetId].position = push.destination;
    }
    if (push.rail) {
      next.enemies[targetId].stunned = true;
      cancelIntent(next, targetId, "RAIL STUN");
    } else if (preview.interrupts) {
      cancelIntent(next, targetId);
    }
    addEvent(
      next,
      "impact",
      push.rail
        ? "ARC RAIL STUN"
        : push.collision
          ? "COLLISION"
          : "FORCED BACK",
      `${next.enemies[targetId].name} took ${dealt}${
        absorbed ? `; ${absorbed} absorbed by shield` : ""
      }.`,
    );
    return finalizeAfterPlayerAction(next);
  }

  if (cardId === "dash-strike") {
    next.player.position = nearestOpenAdjacent(
      next,
      next.enemies[targetId].position,
    );
    next.moveAvailable = false;
    updateCover(next);
  }

  const dealt = damageEnemy(
    next,
    targetId,
    preview.impact ?? preview.damage,
  );
  if (preview.interrupts) cancelIntent(next, targetId);
  addEvent(
    next,
    preview.interrupts ? "interrupt" : "impact",
    preview.interrupts ? "INTERRUPTED" : `${dealt} DAMAGE`,
    `${next.enemies[targetId].name}${
      next.enemies[targetId].hp <= 0 ? " disabled." : ` has ${next.enemies[targetId].hp} HP.`
    }`,
  );
  return finalizeAfterPlayerAction(next);
}

function finalizeAfterPlayerAction(state) {
  if (finishBattleIfNeeded(state)) return state;
  replanIntents(state);
  if (activeEnemies(state).length === 0 && !state.gate.sealing) {
    addEvent(
      state,
      "objective",
      "FIELD CLEAR",
      "Power the Anchors and seal the Gate.",
    );
  }
  return state;
}

function canUseObject(state, objectId) {
  const position = DIRECTOR_OBJECTS[objectId]?.position;
  return (
    state.phase === "player" &&
    Boolean(position) &&
    adjacent(state.player.position, position)
  );
}

export function getDirectorObjectAction(state, objectId) {
  if (objectId === "anchor-a" || objectId === "anchor-b") {
    if (state.anchors[objectId].powered) {
      return {
        id: "powered",
        legal: false,
        label: "POWERED",
        reason: "ONLINE",
      };
    }
    const legal = canUseObject(state, objectId) && state.command >= 4;
    return {
      id: "power-anchor",
      legal,
      label: "POWER",
      cost: 4,
      reason: !canUseObject(state, objectId)
        ? "MOVE ADJACENT"
        : state.command < 4
          ? "NEED 4 COMMAND"
          : "",
    };
  }
  if (objectId === "gate") {
    const bothPowered = Object.values(state.anchors).every(
      (anchor) => anchor.powered,
    );
    const legal =
      canUseObject(state, "gate") &&
      bothPowered &&
      state.command >= 8 &&
      !state.gate.sealing;
    return {
      id: "seal-gate",
      legal,
      label: state.gate.sealing ? "SEALING" : "SEAL GATE",
      cost: 8,
      reason: !bothPowered
        ? "POWER BOTH ANCHORS"
        : !canUseObject(state, "gate")
          ? "MOVE ADJACENT"
          : state.command < 8
            ? "NEED 8 COMMAND"
            : state.gate.sealing
              ? "HOLD THROUGH ENEMY TURN"
              : "",
    };
  }
  return null;
}

export function useDirectorObject(state, objectId) {
  const action = getDirectorObjectAction(state, objectId);
  if (!action?.legal) return state;
  const next = clone(state);
  next.command -= action.cost;
  if (objectId === "anchor-a" || objectId === "anchor-b") {
    next.anchors[objectId].powered = true;
    addEvent(
      next,
      "objective",
      `${DIRECTOR_OBJECTS[objectId].name} ONLINE`,
      Object.values(next.anchors).every((anchor) => anchor.powered)
        ? "Both Gate circuits are live."
        : "One circuit remains.",
    );
    replanIntents(next);
    return next;
  }
  next.gate.sealing = true;
  addEvent(
    next,
    "objective",
    "SEAL STARTED",
    "Stay beside the Gate. Keep both Anchors online.",
  );
  replanIntents(next);
  return next;
}

export function getDirectorObjective(state) {
  const powered = Object.values(state.anchors).filter(
    (anchor) => anchor.powered,
  ).length;
  if (state.gate.sealing) {
    return {
      step: 4,
      title: "HOLD THE SEAL",
      short: "STAY AT GATE · KEEP BOTH ANCHORS LIT",
      powered,
    };
  }
  if (powered < 2) {
    return {
      step: powered + 1,
      title: powered === 0 ? "POWER AN ANCHOR" : "POWER THE LAST ANCHOR",
      short: `${powered}/2 CIRCUITS ONLINE`,
      powered,
    };
  }
  return {
    step: 3,
    title: "REACH THE GATE",
    short: "SEAL · 8 COMMAND",
    powered,
  };
}

function damagePlayer(state, rawAmount) {
  const coverReduction = state.player.cover ? 1 : 0;
  const amount = Math.max(0, rawAmount - coverReduction);
  const absorbed = Math.min(state.player.shield, amount);
  state.player.shield -= absorbed;
  state.player.hp = Math.max(0, state.player.hp - (amount - absorbed));
  return amount - absorbed;
}

function pushPlayerAwayFrom(state, enemyId, spaces = 1) {
  const enemy = state.enemies[enemyId];
  const playerPoint = parseTile(state.player.position);
  const enemyPoint = parseTile(enemy.position);
  const dx = Math.sign(playerPoint.x - enemyPoint.x);
  const dy = Math.sign(playerPoint.y - enemyPoint.y);
  const horizontal = Math.abs(playerPoint.x - enemyPoint.x) >=
    Math.abs(playerPoint.y - enemyPoint.y);
  const stepX = horizontal ? dx || -1 : 0;
  const stepY = horizontal ? 0 : dy || 1;
  let current = state.player.position;
  for (let step = 0; step < spaces; step += 1) {
    const point = parseTile(current);
    const candidate = tileId(point.x + stepX, point.y + stepY);
    if (!isTile(candidate) || isBlocked(state, candidate, { allowPlayer: true })) {
      break;
    }
    current = candidate;
  }
  state.player.position = current;
  updateCover(state);
}

function ejectPlayerFromGate(state) {
  const candidates = neighbors(state, state.player.position, {
    allowPlayer: true,
  })
    .filter(
      (candidate) =>
        distance(candidate, DIRECTOR_OBJECTS.gate.position) > 1,
    )
    .sort((left, right) => left.localeCompare(right));
  const destination = candidates[0];
  if (!destination) return false;
  state.player.position = destination;
  updateCover(state);
  return true;
}

function moveEnemyToward(
  state,
  enemyId,
  destination,
  steps,
  ignoreObject,
) {
  const enemy = state.enemies[enemyId];
  let path = routeToward(
    state,
    enemy.position,
    destination,
    steps,
    { ignoreEnemy: enemyId, ignoreObject },
  );
  if (path.at(-1) === state.player.position) {
    path = path.slice(0, -1);
  }
  if (ignoreObject && path.at(-1) === destination) {
    path = path.slice(0, -1);
  }
  const nextPosition = path.at(-1);
  if (
    nextPosition &&
    !isBlocked(state, nextPosition, {
      ignoreEnemy: enemyId,
      ignoreObject,
    })
  ) {
    enemy.position = nextPosition;
  }
  return path;
}

function resolveIntent(state, intent) {
  if (intent.status !== "ready") {
    addEvent(
      state,
      "interrupt",
      `${state.enemies[intent.actorId].name} ${intent.cancelReason ?? "INTERRUPTED"}`,
      `${intent.name} canceled.`,
    );
    return;
  }
  const enemy = state.enemies[intent.actorId];
  if (!enemy || enemy.hp <= 0) return;

  if (intent.actorId === "ram" && intent.name === "GATE SMASH") {
    state.gate.integrity = Math.max(0, state.gate.integrity - 1);
    addEvent(
      state,
      "danger",
      "RAM HIT THE GATE",
      `${state.gate.integrity}/${state.gate.maxIntegrity} integrity remains.`,
    );
    return;
  }
  if (intent.actorId === "ram" && intent.name === "BODY CHECK") {
    moveEnemyToward(
      state,
      "ram",
      state.player.position,
      2,
    );
    const dealt =
      distance(enemy.position, state.player.position) <= 1
        ? damagePlayer(state, 3)
        : 0;
    if (dealt > 0) {
      if (adjacent(state.player.position, DIRECTOR_OBJECTS.gate.position)) {
        ejectPlayerFromGate(state);
      } else {
        pushPlayerAwayFrom(state, "ram", 1);
      }
    }
    addEvent(
      state,
      "danger",
      dealt > 0 ? "RAM BODY CHECK" : "RAM CLOSED IN",
      dealt > 0 ? `${dealt} damage reached you.` : "It is still coming.",
    );
    return;
  }
  if (intent.actorId === "ram" && intent.name === "CHARGE GATE") {
    moveEnemyToward(
      state,
      "ram",
      "t-8-3",
      2,
    );
    addEvent(
      state,
      "danger",
      "RAM ADVANCED",
      "Gate impact is getting closer.",
    );
    return;
  }
  if (intent.actorId === "warden" && intent.name === "SHIELD RAM") {
    if (state.enemies.ram.hp > 0) state.enemies.ram.shield += 3;
    addEvent(state, "enemy", "RAM SHIELDED +3", "Break or interrupt the link.");
    return;
  }
  if (intent.actorId === "warden" && intent.name === "SHIELD BASH") {
    if (distance(enemy.position, state.player.position) <= 2) {
      const dealt = damagePlayer(state, 2);
      addEvent(state, "enemy", "SHIELD BASH", `${dealt} damage reached you.`);
    } else {
      addEvent(state, "interrupt", "BASH MISSED", "You moved out of range.");
    }
    return;
  }
  if (intent.actorId === "warden" && intent.name === "EJECT") {
    moveEnemyToward(
      state,
      "warden",
      state.player.position,
      2,
    );
    if (distance(enemy.position, state.player.position) <= 1) {
      const displaced = ejectPlayerFromGate(state);
      damagePlayer(state, 1);
      addEvent(
        state,
        "danger",
        displaced ? "FORCED OFF THE GATE" : "WARDEN IMPACT",
        "The seal needs adjacency when the turn ends.",
      );
    } else {
      addEvent(state, "enemy", "WARDEN CLOSED IN", "Ejection range shortened.");
    }
    return;
  }
  if (intent.actorId === "warden" && intent.name === "HUNT") {
    moveEnemyToward(
      state,
      "warden",
      state.player.position,
      2,
    );
    addEvent(state, "enemy", "WARDEN ADVANCED", "It is closing on your position.");
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "DRAIN ANCHOR") {
    state.anchors[intent.targetId].powered = false;
    addEvent(
      state,
      "danger",
      `${DIRECTOR_OBJECTS[intent.targetId].name} OFFLINE`,
      "The Gate circuit went dark.",
    );
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "STATIC BOLT") {
    const dealt = damagePlayer(state, 2);
    addEvent(state, "enemy", "STATIC BOLT", `${dealt} damage reached you.`);
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "SEEK ANCHOR") {
    moveEnemyToward(
      state,
      "jammer",
      DIRECTOR_OBJECTS["anchor-a"].position,
      1,
      "anchor-a",
    );
    addEvent(state, "enemy", "JAMMER ADVANCED", "It is closing on a circuit.");
  }
}

function finishBattleIfNeeded(state) {
  if (state.gate.integrity <= 0) {
    state.phase = "result";
    state.result = {
      type: "defeat",
      title: "GATE DESTROYED",
      cause: "RAM collapsed the final integrity lock.",
    };
    return true;
  }
  if (state.player.hp <= 0) {
    state.phase = "result";
    state.result = {
      type: "defeat",
      title: "SIGNAL LOST",
      cause: "Your fighter was Compromised.",
    };
    return true;
  }
  return false;
}

function sealStillValid(state) {
  return (
    state.gate.sealing &&
    Object.values(state.anchors).every((anchor) => anchor.powered) &&
    adjacent(state.player.position, DIRECTOR_OBJECTS.gate.position) &&
    state.gate.integrity > 0 &&
    state.player.hp > 0
  );
}

function beginNextPlayerTurn(state) {
  if (state.gate.sealing) {
    if (sealStillValid(state)) {
      state.gate.secure = true;
      state.phase = "result";
      state.result = {
        type: "victory",
        title: "GATE SEALED",
        cause: "Both circuits and your position survived the Enemy Turn.",
      };
      addEvent(state, "victory", "GATE SEALED", "Signal lock restored.");
      return;
    }
    state.gate.sealing = false;
    addEvent(
      state,
      "danger",
      "SEAL BROKEN",
      "Restore both circuits and return to the Gate.",
    );
  }
  state.turn += 1;
  state.phase = "player";
  state.command = Math.min(
    DIRECTOR_RULES.commandCap,
    state.command + DIRECTOR_RULES.commandIncome,
  );
  state.moveAvailable = true;
  state.cardUses = {};
  state.player.shield = 0;
  for (const enemy of Object.values(state.enemies)) {
    enemy.stunned = false;
  }
  state.enemyQueue = [];
  state.enemyCursor = 0;
  state.intents = planDirectorIntents(state);
}

export function beginDirectorEnemyTurn(state) {
  if (state.phase !== "player" || state.result) return state;
  const next = clone(state);
  for (const enemy of Object.values(next.enemies)) {
    enemy.shield = 0;
  }
  next.phase = "enemy";
  next.enemyQueue = next.intents.map((intent) => intent.id);
  next.enemyCursor = 0;
  addEvent(next, "enemy", "ENEMY TURN", "Intents resolve Fast → Standard → Slow.");
  return next;
}

export function advanceDirectorEnemyTurn(state) {
  if (state.phase !== "enemy" || state.result) return state;
  const next = clone(state);
  if (finishBattleIfNeeded(next)) return next;
  const intentId = next.enemyQueue[next.enemyCursor];
  if (!intentId) {
    beginNextPlayerTurn(next);
    return next;
  }
  const intent = next.intents.find((candidate) => candidate.id === intentId);
  if (intent) resolveIntent(next, intent);
  next.enemyCursor += 1;
  if (finishBattleIfNeeded(next)) return next;
  if (next.enemyCursor >= next.enemyQueue.length) {
    beginNextPlayerTurn(next);
  }
  return next;
}

export function getDirectorFocusPosition(state, focusId) {
  return actorPosition(state, focusId);
}

export function getDirectorIntentTargetPosition(state, intent) {
  return intentTargetPosition(state, intent);
}

export function getDirectorScreenPosition(positionId) {
  const point = parseTile(positionId);
  if (!point) return { x: 50, y: 50 };
  return {
    x: 50 + (point.x - point.y - 1.5) * 6,
    y: 7 + (point.x + point.y) * 5.8,
  };
}

export function getDirectorBattleSnapshot(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    phase: state.phase,
    command: state.command,
    moveAvailable: state.moveAvailable,
    player: clone(state.player),
    gate: clone(state.gate),
    anchors: clone(state.anchors),
    cell: clone(state.cell),
    enemies: clone(state.enemies),
    cardUses: clone(state.cardUses),
    intents: clone(state.intents),
    enemyQueue: clone(state.enemyQueue),
    enemyCursor: state.enemyCursor,
    lastEvent: clone(state.lastEvent),
    result: clone(state.result),
  };
}
