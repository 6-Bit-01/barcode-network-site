export const DIRECTOR_SOURCE =
  "BARCODE_WORLD_FRACTURED_GATE_LIVE_CIRCUIT_BREACHFLOW_2026-07-29";

const TILE_HALF_WIDTH = 4;
const TILE_HALF_HEIGHT = 3.2;

export const DIRECTOR_RULES = Object.freeze({
  movementPerTurn: 6,
  actionsPerTurn: 2,
  reactionRange: 4,
  playerHp: 12,
  gateIntegrity: 3,
  tileHalfWidth: TILE_HALF_WIDTH,
  tileHalfHeight: TILE_HALF_HEIGHT,
});

export const DIRECTOR_BUILD = Object.freeze({
  id: "battle-exploration",
  name: "BATTLE → EXPLORATION",
  major: "BATTLE",
  minor: "EXPLORATION",
  grammar: "IMPACT CREATES OPENINGS · OPENINGS BECOME ROUTES",
});

const TEMPO_VALUE = Object.freeze({
  Fast: 3,
  Standard: 2,
  Slow: 1,
});

const ENEMY_TIE_ORDER = Object.freeze({
  sniper: 0,
  jammer: 1,
  warden: 2,
  ram: 3,
});

const ROW_SEGMENTS = Object.freeze({
  0: [
    [5, 5],
    [7, 11],
  ],
  1: [
    [4, 5],
    [7, 13],
  ],
  2: [
    [3, 5],
    [7, 14],
  ],
  3: [
    [2, 9],
    [12, 14],
  ],
  4: [[1, 15]],
  5: [[0, 16]],
  6: [[0, 16]],
  7: [[1, 15]],
  8: [[1, 15]],
  9: [
    [2, 9],
    [12, 14],
  ],
  10: [[3, 13]],
  11: [[4, 12]],
  12: [[5, 11]],
});

const SERVER_RACK_TILES = new Set([
  "t-4-5",
  "t-4-7",
  "t-7-5",
  "t-7-7",
  "t-12-5",
  "t-12-7",
]);

const RUBBLE_TILES = new Set([
  "t-3-5",
  "t-4-4",
  "t-6-6",
  "t-9-6",
  "t-10-5",
  "t-11-8",
]);

const COVER_TILES = new Map([
  ["t-2-5", 1],
  ["t-3-7", 1],
  ["t-5-5", 2],
  ["t-6-8", 1],
  ["t-8-5", 1],
  ["t-9-5", 2],
  ["t-11-7", 2],
  ["t-13-5", 1],
  ["t-13-8", 1],
]);

const TRACK_TILES = new Set([
  "t-6-10",
  "t-7-10",
  "t-8-10",
  "t-9-10",
  "t-10-10",
  "t-11-10",
  "t-12-10",
]);

const BRIDGE_TILES = new Set(["t-6-3"]);

function tileId(x, y) {
  return `t-${x}-${y}`;
}

function parseTile(id) {
  const match = /^t-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function inSegments(x, segments) {
  return segments.some(([start, end]) => x >= start && x <= end);
}

function terrainFor(id, x, y) {
  if (SERVER_RACK_TILES.has(id)) return "rack";
  if (BRIDGE_TILES.has(id)) return "bridge";
  if (TRACK_TILES.has(id)) return "track";
  if (RUBBLE_TILES.has(id)) return "rubble";
  if (y <= 2) return "catwalk";
  if (y === 3 || y === 9) return "ramp";
  if (y >= 10) return "trench";
  if ((x + y) % 7 === 0) return "panel";
  return "floor";
}

function elevationFor(y) {
  if (y <= 2) return 1;
  if (y >= 10) return -1;
  return 0;
}

const tileEntries = [];
for (const [row, segments] of Object.entries(ROW_SEGMENTS)) {
  const y = Number(row);
  for (let x = 0; x <= 16; x += 1) {
    if (!inSegments(x, segments)) continue;
    const id = tileId(x, y);
    const terrain = terrainFor(id, x, y);
    tileEntries.push([
      id,
      Object.freeze({
        id,
        x,
        y,
        terrain,
        elevation: elevationFor(y),
        cover: COVER_TILES.get(id) ?? 0,
        walkable: terrain !== "rack",
        blocksSight: terrain === "rack",
        lane:
          y <= 3 ? "upper" : y >= 9 ? "lower" : "yard",
      }),
    ]);
  }
}

export const DIRECTOR_TILES = Object.freeze(Object.fromEntries(tileEntries));

export const DIRECTOR_OBJECTS = Object.freeze({
  "anchor-a": {
    id: "anchor-a",
    name: "BRIDGE ANCHOR",
    position: "t-5-2",
    glyph: "I",
  },
  "anchor-b": {
    id: "anchor-b",
    name: "TRACK ANCHOR",
    position: "t-5-10",
    glyph: "II",
  },
  cell: {
    id: "cell",
    name: "POWER CELL",
    position: "t-8-6",
    glyph: "ϟ",
  },
  divider: {
    id: "divider",
    name: "CRACKED DIVIDER",
    position: "t-14-6",
    glyph: "▥",
  },
  cache: {
    id: "cache",
    name: "FIELD CACHE",
    position: "t-8-1",
    glyph: "◆",
  },
  exit: {
    id: "exit",
    name: "WEST EXIT",
    position: "t-0-6",
    glyph: "←",
  },
  gate: {
    id: "gate",
    name: "FRACTURED GATE",
    position: "t-17-6",
    glyph: "G",
  },
});

export const DIRECTOR_CARDS = Object.freeze({
  bitcrush: {
    id: "bitcrush",
    name: "BITCRUSH",
    glyph: "◉",
    actionCost: 1,
    tempo: "Fast",
    range: 5,
    source: "FIELD RIG",
    shape: "RANGED",
    short: "RANGED · PRESSURE",
    target: "enemy",
  },
  shunt: {
    id: "shunt",
    name: "SHUNT",
    glyph: "≫",
    actionCost: 1,
    tempo: "Standard",
    range: 1,
    source: "BATTLE",
    shape: "CONTACT",
    short: "CONTACT · FORCE",
    target: "enemy",
  },
  "skip-step": {
    id: "skip-step",
    name: "SKIP//STEP",
    glyph: "↯",
    actionCost: 1,
    tempo: "Fast",
    range: 3,
    source: "EXPLORATION",
    shape: "SHIFT",
    short: "SHIFT · IGNORE TERRAIN",
    target: "tile",
  },
  firewall: {
    id: "firewall",
    name: "FIREWALL",
    glyph: "⬡",
    actionCost: 1,
    tempo: "Fast",
    range: 0,
    source: "FIELD RIG",
    shape: "SELF",
    short: "SELF · HOLD POSITION",
    target: "self",
  },
  overload: {
    id: "overload",
    name: "OVERLOAD",
    glyph: "✦",
    actionCost: 1,
    tempo: "Slow",
    range: 4,
    source: "FIELD RIG",
    shape: "BLAST",
    short: "BLAST · SYSTEMS",
    target: "enemy-or-system",
  },
});

const ENEMY_BLUEPRINTS = Object.freeze({
  ram: {
    id: "ram",
    name: "RAM",
    role: "BREAKS THE GATE",
    glyph: "▶",
    position: "t-13-6",
    hp: 8,
    color: "orange",
  },
  warden: {
    id: "warden",
    name: "WARDEN",
    role: "BLOCKS & EJECTS",
    glyph: "⬢",
    position: "t-11-5",
    hp: 8,
    color: "red",
  },
  jammer: {
    id: "jammer",
    name: "JAMMER",
    role: "HUNTS CIRCUITS",
    glyph: "⌁",
    position: "t-8-10",
    hp: 7,
    color: "violet",
  },
  sniper: {
    id: "sniper",
    name: "TRACE",
    role: "PUNISHES OPEN LINES",
    glyph: "⌖",
    position: "t-11-2",
    hp: 6,
    color: "cyan",
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

function bridgeOpen(state, position) {
  return (
    !BRIDGE_TILES.has(position) ||
    Boolean(state.anchors?.["anchor-a"]?.powered)
  );
}

function objectBlocks(state, object) {
  if (object.id === "gate" || object.id === "exit" || object.id === "cache") {
    return false;
  }
  if (object.id === "cell") return state.cell.active;
  if (object.id === "divider") return state.divider.intact;
  return true;
}

function enemyAt(state, position) {
  return activeEnemies(state).find((enemy) => enemy.position === position);
}

function isBlocked(state, position, options = {}) {
  const tile = DIRECTOR_TILES[position];
  if (!tile || tile.walkable === false || !bridgeOpen(state, position)) {
    return true;
  }
  if (
    Object.values(DIRECTOR_OBJECTS).some(
      (object) =>
        object.position === position &&
        object.id !== options.ignoreObject &&
        objectBlocks(state, object),
    )
  ) {
    return true;
  }
  const occupyingEnemy = enemyAt(state, position);
  if (
    occupyingEnemy &&
    occupyingEnemy.id !== options.ignoreEnemy
  ) {
    return true;
  }
  return (
    state.player.position === position &&
    !options.allowPlayer
  );
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

function tileCost(state, id) {
  const tile = DIRECTOR_TILES[id];
  if (!tile) return Number.POSITIVE_INFINITY;
  if (tile.terrain === "rubble") return 2;
  if (
    tile.terrain === "track" &&
    state.anchors["anchor-b"].powered
  ) {
    return 0;
  }
  return 1;
}

function pathsFrom(state, start, budget, options = {}) {
  const found = new Map([[start, { cost: 0, path: [start] }]]);
  const queue = [start];
  while (queue.length) {
    queue.sort((left, right) => found.get(left).cost - found.get(right).cost);
    const current = queue.shift();
    const currentPath = found.get(current);
    for (const candidate of neighbors(state, current, options)) {
      const cost =
        currentPath.cost +
        (options.ignoreTerrain ? 1 : tileCost(state, candidate));
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
  const found = pathsFrom(state, from, 80, {
    ...options,
  });
  let route = found.get(destination)?.path;
  if (!route) {
    route = [...found.entries()]
      .sort((left, right) => {
        const delta =
          distance(left[0], destination) - distance(right[0], destination);
        return delta || left[0].localeCompare(right[0]);
      })[0]?.[1]?.path;
  }
  const limited = [from];
  let spent = 0;
  for (const position of (route ?? [from]).slice(1)) {
    const cost = tileCost(state, position);
    if (spent + cost > steps) break;
    spent += cost;
    limited.push(position);
  }
  return limited;
}

function directionalLineTiles(fromId, toId) {
  const from = parseTile(fromId);
  const to = parseTile(toId);
  if (!from || !to) return [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  const points = [];
  while (true) {
    points.push(tileId(x, y));
    if (x === to.x && y === to.y) break;
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
  return points;
}

function lineTiles(fromId, toId) {
  return [
    ...new Set([
      ...directionalLineTiles(fromId, toId).slice(1, -1),
      ...directionalLineTiles(toId, fromId).slice(1, -1),
    ]),
  ];
}

export function hasDirectorLineOfSight(state, fromId, toId) {
  const line = lineTiles(fromId, toId);
  return line.every((id) => {
    if (DIRECTOR_TILES[id]?.blocksSight) return false;
    if (
      state.divider.intact &&
      id === DIRECTOR_OBJECTS.divider.position
    ) {
      return false;
    }
    return true;
  });
}

function actorPosition(state, targetId) {
  if (state.enemies[targetId]) return state.enemies[targetId].position;
  if (DIRECTOR_OBJECTS[targetId]) return DIRECTOR_OBJECTS[targetId].position;
  if (targetId === "player") return state.player.position;
  if (DIRECTOR_TILES[targetId]) return targetId;
  return null;
}

function tileElevation(position) {
  return DIRECTOR_TILES[position]?.elevation ?? 0;
}

function targetRange(state, card, targetId) {
  const targetPosition = actorPosition(state, targetId);
  if (!targetPosition) return card.range;
  return (
    card.range +
    (tileElevation(state.player.position) > tileElevation(targetPosition)
      ? 1
      : 0)
  );
}

function intentTargetPosition(state, intent) {
  return actorPosition(state, intent.targetId) ?? intent.destination ?? null;
}

function nearestOpenNeighbor(state, targetPosition, fromPosition, options = {}) {
  const point = parseTile(targetPosition);
  if (!point) return null;
  return [
    tileId(point.x + 1, point.y),
    tileId(point.x - 1, point.y),
    tileId(point.x, point.y + 1),
    tileId(point.x, point.y - 1),
  ]
    .filter((id) => isTile(id) && !isBlocked(state, id, options))
    .sort(
      (left, right) =>
        distance(fromPosition, left) - distance(fromPosition, right) ||
        left.localeCompare(right),
    )[0] ?? null;
}

function planRam(state) {
  const enemy = state.enemies.ram;
  if (enemy.hp <= 0) return null;
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
  if (distance(enemy.position, state.player.position) <= 2) {
    let path = routeToward(
      state,
      enemy.position,
      state.player.position,
      2,
      { ignoreEnemy: "ram", allowPlayer: true },
    );
    if (path.at(-1) === state.player.position) path = path.slice(0, -1);
    return {
      id: `intent-${state.turn}-ram-check`,
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
  const path = routeToward(
    state,
    enemy.position,
    "t-16-6",
    2,
    { ignoreEnemy: "ram" },
  );
  return {
    id: `intent-${state.turn}-ram-charge`,
    actorId: "ram",
    name: "CHARGE LINE",
    glyph: "≫",
    targetId: "gate",
    destination: path.at(-1) ?? enemy.position,
    path,
    tempo: "Standard",
    status: "ready",
    detail: "ADVANCE 2",
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
      { ignoreEnemy: "warden", allowPlayer: true },
    );
    if (path.at(-1) === state.player.position) path = path.slice(0, -1);
    return {
      id: `intent-${state.turn}-warden-eject`,
      actorId: "warden",
      name: "EJECT",
      glyph: "↤",
      targetId: "player",
      destination: path.at(-1) ?? enemy.position,
      path,
      tempo: "Standard",
      status: "ready",
      detail: "BREAK GATE HOLD",
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
      detail: "2 DMG · PUSH",
    };
  }
  if (state.enemies.ram.hp > 0) {
    if (adjacent(enemy.position, state.enemies.ram.position)) {
      return {
        id: `intent-${state.turn}-warden-link`,
        actorId: "warden",
        name: "SHIELD LINK",
        glyph: "⬡",
        targetId: "ram",
        tempo: "Fast",
        status: "ready",
        detail: "+2 SHIELD",
      };
    }
    const destination = nearestOpenNeighbor(
      state,
      state.enemies.ram.position,
      enemy.position,
      { ignoreEnemy: "warden" },
    );
    const path = destination
      ? routeToward(state, enemy.position, destination, 2, {
          ignoreEnemy: "warden",
        })
      : [enemy.position];
    return {
      id: `intent-${state.turn}-warden-interpose`,
      actorId: "warden",
      name: "INTERPOSE",
      glyph: "↣",
      targetId: "ram",
      destination: path.at(-1) ?? enemy.position,
      path,
      tempo: "Standard",
      status: "ready",
      detail: "TAKE THE LANE",
    };
  }
  let path = routeToward(
    state,
    enemy.position,
    state.player.position,
    2,
    { ignoreEnemy: "warden", allowPlayer: true },
  );
  if (path.at(-1) === state.player.position) path = path.slice(0, -1);
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

function poweredAnchorIds(state) {
  return ["anchor-a", "anchor-b"].filter(
    (id) => state.anchors[id].powered,
  );
}

function planJammer(state) {
  const enemy = state.enemies.jammer;
  if (enemy.hp <= 0) return null;
  const powered = poweredAnchorIds(state);
  const drainTarget = powered
    .filter(
      (id) =>
        distance(enemy.position, DIRECTOR_OBJECTS[id].position) <= 3 &&
        hasDirectorLineOfSight(
          state,
          enemy.position,
          DIRECTOR_OBJECTS[id].position,
        ),
    )
    .sort()[0];
  if (drainTarget) {
    return {
      id: `intent-${state.turn}-jammer-drain-${drainTarget}`,
      actorId: "jammer",
      name: "DRAIN LINK",
      glyph: "⌁",
      targetId: drainTarget,
      tempo: "Slow",
      status: "ready",
      detail: "ANCHOR OFFLINE",
    };
  }
  if (distance(enemy.position, state.player.position) <= 3) {
    return {
      id: `intent-${state.turn}-jammer-static`,
      actorId: "jammer",
      name: "STATIC FIELD",
      glyph: "ϟ",
      targetId: "player",
      tempo: "Fast",
      status: "ready",
      detail: "BLOCKS SHIFT + INTERCEPT",
    };
  }
  if (powered.length === 0) {
    const lanes = ["upper", "yard", "lower"];
    const affectedLane = lanes[(state.turn - 1) % lanes.length];
    const affectedTiles = Object.values(DIRECTOR_TILES)
      .filter(
        (tile) =>
          tile.lane === affectedLane &&
          tile.walkable &&
          bridgeOpen(state, tile.id),
      )
      .map((tile) => tile.id);
    return {
      id: `intent-${state.turn}-jammer-sweep-${affectedLane}`,
      actorId: "jammer",
      name: "BROADCAST SWEEP",
      glyph: "⌁",
      targetId: affectedTiles[Math.floor(affectedTiles.length / 2)],
      affectedLane,
      affectedTiles,
      tempo: "Fast",
      status: "ready",
      detail: `${affectedLane.toUpperCase()} LANE · BREAK COVER`,
    };
  }
  const targetId =
    powered
      .sort(
        (left, right) =>
          distance(enemy.position, DIRECTOR_OBJECTS[left].position) -
          distance(enemy.position, DIRECTOR_OBJECTS[right].position),
      )[0] ?? "anchor-b";
  const destination = nearestOpenNeighbor(
    state,
    DIRECTOR_OBJECTS[targetId].position,
    enemy.position,
    { ignoreEnemy: "jammer", ignoreObject: targetId },
  );
  const path = destination
    ? routeToward(state, enemy.position, destination, 2, {
        ignoreEnemy: "jammer",
      })
    : [enemy.position];
  return {
    id: `intent-${state.turn}-jammer-hunt-${targetId}`,
    actorId: "jammer",
    name: "HUNT CIRCUIT",
    glyph: "⌁",
    targetId,
    destination: path.at(-1) ?? enemy.position,
    path,
    tempo: "Standard",
    status: "ready",
    detail: "MOVE INTO RANGE",
  };
}

function sniperVantage(state, enemy) {
  return Object.values(DIRECTOR_TILES)
    .filter(
      (tile) =>
        tile.elevation > 0 &&
        tile.walkable &&
        !isBlocked(state, tile.id, { ignoreEnemy: "sniper" }),
    )
    .sort((left, right) => {
      const leftCanSee = hasDirectorLineOfSight(
        state,
        left.id,
        state.player.position,
      );
      const rightCanSee = hasDirectorLineOfSight(
        state,
        right.id,
        state.player.position,
      );
      if (leftCanSee !== rightCanSee) return leftCanSee ? -1 : 1;
      return (
        distance(left.id, state.player.position) -
          distance(right.id, state.player.position) ||
        distance(enemy.position, left.id) -
          distance(enemy.position, right.id) ||
        left.id.localeCompare(right.id)
      );
    })[0]?.id;
}

function planSniper(state) {
  const enemy = state.enemies.sniper;
  if (enemy.hp <= 0) return null;
  if (
    distance(enemy.position, state.player.position) <= 12 &&
    hasDirectorLineOfSight(state, enemy.position, state.player.position)
  ) {
    return {
      id: `intent-${state.turn}-sniper-trace`,
      actorId: "sniper",
      name: "TRACE SHOT",
      glyph: "⌖",
      targetId: "player",
      tempo: "Slow",
      status: "ready",
      detail: "2 DMG · COVER COUNTS",
    };
  }
  const destination = sniperVantage(state, enemy);
  const path = destination
    ? routeToward(state, enemy.position, destination, 2, {
        ignoreEnemy: "sniper",
      })
    : [enemy.position];
  return {
    id: `intent-${state.turn}-sniper-perch`,
    actorId: "sniper",
    name: "FIND TRACE",
    glyph: "⌖",
    targetId: "player",
    destination: path.at(-1) ?? enemy.position,
    path,
    tempo: "Fast",
    status: "ready",
    detail: "REPOSITION",
  };
}

export function planDirectorIntents(state) {
  const plans = {
    ram: planRam(state),
    warden: planWarden(state),
    jammer: planJammer(state),
    sniper: planSniper(state),
  };
  const primaryActor =
    state.gate.sealing && plans.warden
      ? "warden"
      : plans.ram
        ? "ram"
        : plans.warden
          ? "warden"
          : plans.sniper
            ? "sniper"
            : "jammer";
  const primary = plans[primaryActor];

  const supportRotation = [
    ["warden", "jammer", "sniper"],
    ["jammer", "sniper", "warden"],
    ["sniper", "warden", "jammer"],
  ][(state.turn - 1) % 3];
  const drain = plans.jammer?.name === "DRAIN LINK" ? plans.jammer : null;
  const support =
    (drain?.actorId !== primaryActor ? drain : null) ??
    supportRotation
      .filter((actorId) => actorId !== primaryActor)
      .map((actorId) => plans[actorId])
      .find(Boolean) ??
    Object.values(plans).find(
      (intent) => intent && intent.actorId !== primaryActor,
    );

  return [
    primary ? { ...primary, priority: "primary" } : null,
    support ? { ...support, priority: "support" } : null,
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const tempo = TEMPO_VALUE[right.tempo] - TEMPO_VALUE[left.tempo];
      return (
        tempo ||
        (left.priority === "support" ? -1 : 1) ||
        ENEMY_TIE_ORDER[left.actorId] - ENEMY_TIE_ORDER[right.actorId]
      );
    });
}

function replanIntents(state) {
  const preservedByActor = new Map(
    state.intents
      .filter(
        (intent) =>
          intent.status === "canceled" || intent.status === "spent",
      )
      .map((intent) => [
        intent.actorId,
        {
          status: intent.status,
          cancelReason: intent.cancelReason,
        },
      ]),
  );
  state.intents = planDirectorIntents(state).map((intent) => {
    const preserved = preservedByActor.get(intent.actorId);
    return preserved
      ? { ...intent, ...preserved }
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
    build: clone(DIRECTOR_BUILD),
    movementRemaining: DIRECTOR_RULES.movementPerTurn,
    actionsRemaining: DIRECTOR_RULES.actionsPerTurn,
    reactionReady: true,
    reaction: null,
    player: {
      position: "t-1-6",
      hp: DIRECTOR_RULES.playerHp,
      maxHp: DIRECTOR_RULES.playerHp,
      shield: 0,
      cover: 0,
      braced: false,
      jammed: false,
      tempoBoost: false,
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
    divider: {
      intact: true,
      breached: false,
    },
    cache: {
      present: true,
      carried: false,
    },
    cell: {
      active: true,
    },
    enemies,
    cardUses: {},
    contextAction: null,
    intents: [],
    enemyQueue: [],
    enemyCursor: 0,
    lastEvent: {
      id: "event-opening",
      tone: "objective",
      text: "LIVE CIRCUIT",
      detail: "Reach the Gate. The two Anchors are optional tactical tools.",
    },
    eventCounter: 0,
    result: null,
  };
  updateCover(state);
  state.intents = planDirectorIntents(state);
  return state;
}

export function createDirectorState(seed = "FG-LIVE-CIRCUIT-01") {
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
  state.player.cover = DIRECTOR_TILES[state.player.position]?.cover ?? 0;
}

export function getDirectorReachableTiles(state) {
  if (state.phase !== "player" || state.movementRemaining <= 0) return {};
  const found = pathsFrom(
    state,
    state.player.position,
    state.movementRemaining,
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
  next.movementRemaining = Math.max(
    0,
    next.movementRemaining - route.cost,
  );
  next.player.tempoBoost =
    next.anchors["anchor-b"].powered &&
    route.path.some((id) => DIRECTOR_TILES[id]?.terrain === "track");
  updateCover(next);
  replanIntents(next);
  const tile = DIRECTOR_TILES[destination];
  addEvent(
    next,
    "move",
    tile.elevation > 0
      ? "HIGH GROUND"
      : next.player.tempoBoost
        ? "TRACK SURGE"
        : tile.terrain === "rubble"
          ? "RUBBLE"
        : next.player.cover
          ? "COVER TAKEN"
          : "POSITION CHANGED",
    tile.elevation > 0
      ? "Ranged attacks gain reach downhill."
      : next.player.tempoBoost
        ? "Your next contested action is faster."
        : tile.terrain === "rubble"
          ? "The heavy route used more of this turn's movement."
        : next.player.cover
          ? `Incoming ranged damage reduced by ${next.player.cover}.`
          : next.movementRemaining > 0
            ? "You can keep moving before or after an action."
            : "Movement spent for this turn.",
  );
  return next;
}

export function getDirectorCardCost(state, cardId) {
  const card = DIRECTOR_CARDS[cardId];
  if (!card) return Number.POSITIVE_INFINITY;
  return card.actionCost ?? 1;
}

function cardAvailable(state, cardId) {
  const card = DIRECTOR_CARDS[cardId];
  if (!card || state.phase !== "player") return false;
  if (state.cardUses[cardId]) return false;
  if (state.actionsRemaining < getDirectorCardCost(state, cardId)) {
    return false;
  }
  return !(state.player.jammed && cardId === "skip-step");
}

function validEnemyTargets(state, card) {
  return activeEnemies(state)
    .filter((enemy) => {
      const range = targetRange(state, card, enemy.id);
      return (
        distance(state.player.position, enemy.position) <= range &&
        hasDirectorLineOfSight(
          state,
          state.player.position,
          enemy.position,
        )
      );
    })
    .map((enemy) => enemy.id);
}

export function getDirectorCardTargets(state, cardId) {
  if (!cardAvailable(state, cardId)) return [];
  const card = DIRECTOR_CARDS[cardId];
  if (card.target === "self") return ["player"];
  if (card.target === "tile") {
    return [...pathsFrom(state, state.player.position, card.range, {
      allowPlayer: true,
      ignoreTerrain: true,
    }).keys()].filter((id) => id !== state.player.position);
  }
  const targets = validEnemyTargets(state, card);
  if (card.target === "enemy-or-system") {
    for (const objectId of ["cell", "divider"]) {
      if (
        (objectId !== "cell" || state.cell.active) &&
        (objectId !== "divider" || state.divider.intact) &&
        distance(
          state.player.position,
          DIRECTOR_OBJECTS[objectId].position,
        ) <= card.range &&
        hasDirectorLineOfSight(
          state,
          state.player.position,
          DIRECTOR_OBJECTS[objectId].position,
        )
      ) {
        targets.push(objectId);
      }
    }
  }
  return targets;
}

function intentFor(state, enemyId) {
  return state.intents.find(
    (intent) => intent.actorId === enemyId && intent.status === "ready",
  );
}

function effectiveTempo(state, card, targetId) {
  let value = TEMPO_VALUE[card.tempo];
  const tile = DIRECTOR_TILES[state.player.position];
  const targetPosition = actorPosition(state, targetId);
  if (tile?.terrain === "rubble") value -= 1;
  if (state.player.jammed) value -= 1;
  if (state.player.tempoBoost) value += 1;
  if (
    targetPosition &&
    tileElevation(state.player.position) > tileElevation(targetPosition)
  ) {
    value += 1;
  }
  return Math.max(1, Math.min(3, value));
}

function tempoRelation(state, card, targetId, intent) {
  if (!intent) return { relation: "", interrupts: false };
  const playerTempo = effectiveTempo(state, card, targetId);
  const enemyTempo = TEMPO_VALUE[intent.tempo];
  return {
    intentId: intent.id,
    relation:
      playerTempo > enemyTempo
        ? "YOU FIRST"
        : playerTempo === enemyTempo
          ? "TOGETHER"
          : "ENEMY FIRST",
    interrupts: playerTempo > enemyTempo,
  };
}

function targetDefense(state, targetId, rawDamage, ignoresCover = false) {
  const enemy = state.enemies[targetId];
  const cover = ignoresCover
    ? 0
    : DIRECTOR_TILES[enemy.position]?.cover ?? 0;
  const afterCover = Math.max(0, rawDamage - cover);
  const shieldAbsorbed = Math.min(enemy.shield, afterCover);
  return {
    rawDamage,
    coverAbsorbed: rawDamage - afterCover,
    shieldAbsorbed,
    damage: afterCover - shieldAbsorbed,
  };
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
  const horizontal =
    Math.abs(enemyPoint.x - playerPoint.x) >=
    Math.abs(enemyPoint.y - playerPoint.y);
  const stepX = horizontal ? dx || 1 : 0;
  const stepY = horizontal ? 0 : dy || 1;
  const startElevation = tileElevation(enemy.position);
  let current = enemy.position;
  const path = [];
  let collision = false;
  let divider = false;
  let cell = false;
  for (let step = 0; step < spaces; step += 1) {
    const point = parseTile(current);
    const candidate = tileId(point.x + stepX, point.y + stepY);
    if (
      state.divider.intact &&
      candidate === DIRECTOR_OBJECTS.divider.position
    ) {
      collision = true;
      divider = true;
      const beyond = tileId(point.x + stepX * 2, point.y + stepY * 2);
      if (
        isTile(beyond) &&
        !isBlocked(state, beyond, { ignoreEnemy: enemyId }) &&
        beyond !== state.player.position
      ) {
        current = beyond;
        path.push(candidate, beyond);
      }
      break;
    }
    if (
      state.cell.active &&
      candidate === DIRECTOR_OBJECTS.cell.position
    ) {
      collision = true;
      cell = true;
      break;
    }
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
    divider,
    cell,
    path,
    track:
      state.anchors["anchor-b"].powered &&
      DIRECTOR_TILES[current]?.terrain === "track",
    ledge: tileElevation(current) < startElevation,
  };
}

function nearbyEnemies(state, position, radius) {
  return activeEnemies(state)
    .filter((enemy) => distance(enemy.position, position) <= radius)
    .map((enemy) => enemy.id);
}

function nearbyTiles(position, radius) {
  return Object.keys(DIRECTOR_TILES).filter(
    (tile) => distance(tile, position) <= radius,
  );
}

export function previewDirectorCard(state, cardId, targetId) {
  const card = DIRECTOR_CARDS[cardId];
  if (!card) return null;
  const legal = getDirectorCardTargets(state, cardId).includes(targetId);
  if (!legal) {
    return {
      legal: false,
      cardId,
      targetId,
      summary: state.cardUses[cardId]
        ? "USED THIS TURN"
        : state.actionsRemaining < getDirectorCardCost(state, cardId)
          ? "TWO ACTIONS SPENT"
          : state.player.jammed && cardId === "skip-step"
            ? "STATIC FIELD BLOCKS SHIFT"
          : "OUT OF RANGE / SIGHT",
    };
  }

  if (cardId === "firewall") {
    return {
      legal: true,
      cardId,
      targetId,
      damage: 0,
      summary: "+4 SHIELD · PREVENT FIRST PUSH",
      footprint: [state.player.position],
      interrupts: false,
      relation: "",
    };
  }

  if (cardId === "skip-step") {
    return {
      legal: true,
      cardId,
      targetId,
      damage: 0,
      path:
        pathsFrom(state, state.player.position, card.range, {
          allowPlayer: true,
          ignoreTerrain: true,
        }).get(targetId)?.path ?? [state.player.position, targetId],
      footprint: [targetId],
      summary: "SHIFT · MOVEMENT STILL AVAILABLE",
      interrupts: false,
      relation: "",
    };
  }

  if (targetId === "divider") {
    return {
      legal: true,
      cardId,
      targetId,
      damage: 0,
      summary: "BREACH DIVIDER · OPEN CENTER ROUTE",
      footprint: [DIRECTOR_OBJECTS.divider.position],
      interrupts: false,
      relation: "SLOW · EXPOSED",
    };
  }

  if (targetId === "cell") {
    const victims = nearbyEnemies(
      state,
      DIRECTOR_OBJECTS.cell.position,
      2,
    );
    const selfDamage =
      distance(
        state.player.position,
        DIRECTOR_OBJECTS.cell.position,
      ) <= 2
        ? 2
        : 0;
    return {
      legal: true,
      cardId,
      targetId,
      damage: 3,
      selfDamage,
      victims,
      breachesDivider:
        state.divider.intact &&
        distance(
          DIRECTOR_OBJECTS.cell.position,
          DIRECTOR_OBJECTS.divider.position,
        ) <= 2,
      footprint: nearbyTiles(DIRECTOR_OBJECTS.cell.position, 2),
      summary: `LOCAL BLAST · ${victims.length} TARGET${
        victims.length === 1 ? "" : "S"
      }${selfDamage ? " · SELF 2" : ""} · BREACH`,
      interrupts: false,
      relation: "COLLATERAL RADIUS 2",
    };
  }

  const intent = intentFor(state, targetId);
  const tempo = tempoRelation(state, card, targetId, intent);
  if (cardId === "shunt") {
    const push = pushDestination(state, targetId, 2);
    const impact =
      1 +
      (push.collision ? 2 : 0) +
      (push.track ? 2 : 0) +
      (push.ledge ? 2 : 0);
    const defense = targetDefense(state, targetId, impact, true);
    const blastDefense = push.cell
      ? targetDefense(state, targetId, 3, true)
      : null;
    const shieldAfterBlast = push.cell
      ? Math.max(0, state.enemies[targetId].shield - 3)
      : state.enemies[targetId].shield;
    const totalDamage = push.cell
      ? blastDefense.damage + Math.max(0, impact - shieldAfterBlast)
      : defense.damage;
    const selfDamage =
      push.cell &&
      distance(
        state.player.position,
        DIRECTOR_OBJECTS.cell.position,
      ) <= 2
        ? 2
        : 0;
    return {
      legal: true,
      cardId,
      targetId,
      impact,
      ...defense,
      damage: totalDamage,
      selfDamage,
      push,
      footprint: [
        state.enemies[targetId].position,
        ...(push.path ?? []),
      ],
      ...tempo,
      summary: `${totalDamage} DMG · PUSH ${push.path.length}${
        push.divider
          ? " · BREACH"
          : push.cell
            ? " · DETONATE"
            : push.track
              ? " · ARC STUN"
              : push.ledge
                ? " · LEDGE"
                : push.collision
                  ? " · COLLISION"
          : ""
      }${selfDamage ? " · SELF 2" : ""}`,
    };
  }

  const highGround =
    tileElevation(state.player.position) >
    tileElevation(state.enemies[targetId].position);
  const rawDamage =
    cardId === "bitcrush" ? 2 + (highGround ? 1 : 0) : 4;
  const defense = targetDefense(state, targetId, rawDamage);
  return {
    legal: true,
    cardId,
    targetId,
    impact: rawDamage,
    highGround,
    footprint: [
      ...lineTiles(
        state.player.position,
        state.enemies[targetId].position,
      ),
      state.enemies[targetId].position,
    ],
    ...defense,
    ...tempo,
    summary: `${defense.damage} DMG${
      defense.coverAbsorbed ? ` · ${defense.coverAbsorbed} COVER` : ""
    }${defense.shieldAbsorbed ? ` · ${defense.shieldAbsorbed} SHIELD` : ""}${
      highGround ? " · HIGH GROUND" : ""
    }${tempo.interrupts ? " · INTERRUPT" : ""}`,
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

function damageEnemy(state, enemyId, rawAmount, options = {}) {
  const enemy = state.enemies[enemyId];
  if (!enemy || enemy.hp <= 0) return 0;
  const cover = options.ignoreCover
    ? 0
    : DIRECTOR_TILES[enemy.position]?.cover ?? 0;
  const afterCover = Math.max(0, rawAmount - cover);
  const absorbed = Math.min(enemy.shield, afterCover);
  enemy.shield -= absorbed;
  const dealt = afterCover - absorbed;
  enemy.hp = Math.max(0, enemy.hp - dealt);
  if (enemy.hp === 0) {
    enemy.shield = 0;
    cancelIntent(state, enemyId, "DISABLED");
  }
  return dealt;
}

function damageEnemyExact(state, enemyId, amount) {
  const enemy = state.enemies[enemyId];
  if (!enemy || enemy.hp <= 0) return 0;
  const dealt = Math.min(enemy.hp, Math.max(0, amount));
  enemy.hp -= dealt;
  if (enemy.hp === 0) {
    enemy.shield = 0;
    cancelIntent(state, enemyId, "DISABLED");
  }
  return dealt;
}

function breachDivider(state, createsBuildOpening = false) {
  if (!state.divider.intact) return false;
  state.divider.intact = false;
  state.divider.breached = true;
  if (createsBuildOpening) {
    state.contextAction = {
      id: "ride-the-breach",
      source: "divider",
      label: "RIDE THE BREACH",
      available: true,
      createdTurn: state.turn,
      destination: DIRECTOR_OBJECTS.divider.position,
      sourcePosition: DIRECTOR_OBJECTS.divider.position,
      detail: "EXPLORATION PAYOFF · CROSS THE BROKEN DIVIDER",
    };
  }
  return true;
}

function createFollowThrough(state, enemyId, origin) {
  state.contextAction = {
    id: "follow-through",
    source: enemyId,
    label: "FOLLOW THROUGH",
    available: true,
    createdTurn: state.turn,
    destination: origin,
    sourcePosition: origin,
    detail: "EXPLORATION PAYOFF · TAKE THE SPACE YOU CREATED",
  };
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
    damageEnemy(state, enemyId, 3, { ignoreCover: true });
    cancelIntent(state, enemyId, "BLASTED");
  }
  if (
    distance(
      state.player.position,
      DIRECTOR_OBJECTS.cell.position,
    ) <= 2
  ) {
    damagePlayer(state, 2, { ignoreCover: true });
  }
  if (
    distance(
      DIRECTOR_OBJECTS.cell.position,
      DIRECTOR_OBJECTS.divider.position,
    ) <= 2
  ) {
    breachDivider(state);
  }
  return victims;
}

export function playDirectorCard(state, cardId, targetId) {
  const declaredPreview = previewDirectorCard(state, cardId, targetId);
  if (!declaredPreview?.legal) return state;
  const next = clone(state);
  const declaredCost = getDirectorCardCost(state, cardId);
  let preview = declaredPreview;
  let collisionText = "";

  if (
    declaredPreview.intentId &&
    (declaredPreview.relation === "ENEMY FIRST" ||
      declaredPreview.relation === "TOGETHER")
  ) {
    const contestedIntent = next.intents.find(
      (intent) => intent.id === declaredPreview.intentId,
    );
    if (contestedIntent?.status === "ready") {
      resolveIntent(next, contestedIntent);
      contestedIntent.status = "spent";
      collisionText =
        declaredPreview.relation === "TOGETHER"
          ? `${next.lastEvent.text} resolved together.`
          : `${next.lastEvent.text} resolved first.`;
    }

    if (
      declaredPreview.relation === "ENEMY FIRST" &&
      !finishBattleIfNeeded(next)
    ) {
      const refreshState = clone(next);
      refreshState.actionsRemaining = DIRECTOR_RULES.actionsPerTurn;
      refreshState.cardUses[cardId] = false;
      refreshState.player.jammed = state.player.jammed;
      const refreshed = previewDirectorCard(
        refreshState,
        cardId,
        targetId,
      );
      if (!refreshed?.legal) {
        next.actionsRemaining = Math.max(
          0,
          next.actionsRemaining - declaredCost,
        );
        next.cardUses[cardId] = true;
        next.player.tempoBoost = false;
        addEvent(
          next,
          "danger",
          "ACTION OUTRUN",
          `${collisionText} Target left legal range or sight.`,
        );
        return finalizeAfterPlayerAction(next);
      }
      preview = {
        ...refreshed,
        relation: declaredPreview.relation,
        interrupts: false,
      };
    }
  }

  next.actionsRemaining = Math.max(
    0,
    next.actionsRemaining - declaredCost,
  );
  next.cardUses[cardId] = true;

  if (next.result) return next;

  if (cardId === "firewall") {
    next.player.shield += 4;
    next.player.braced = true;
    addEvent(next, "guard", "FIREWALL UP", "+4 Shield · first push blocked.");
    return next;
  }

  if (cardId === "skip-step") {
    next.player.position = targetId;
    updateCover(next);
    replanIntents(next);
    addEvent(next, "move", "SKIP//STEP", "Fluid movement remains available.");
    return next;
  }

  if (targetId === "divider") {
    breachDivider(next);
    addEvent(next, "impact", "DIVIDER BREACHED", "The center route is open to both sides.");
    return finalizeAfterPlayerAction(next);
  }

  if (targetId === "cell") {
    const victims = detonateCell(next);
    addEvent(
      next,
      "impact",
      "LOCAL CASCADE",
      `${victims.length} enemy${victims.length === 1 ? "" : "ies"} caught; Divider breached.`,
    );
    return finalizeAfterPlayerAction(next);
  }

  if (cardId === "shunt") {
    const push = preview.push;
    const enemyOrigin = next.enemies[targetId].position;
    const hpBefore = next.enemies[targetId].hp;
    if (push.divider) breachDivider(next, true);
    if (push.cell) detonateCell(next);
    damageEnemy(next, targetId, preview.impact, {
      ignoreCover: true,
    });
    const dealt = hpBefore - next.enemies[targetId].hp;
    if (next.enemies[targetId].hp > 0) {
      next.enemies[targetId].position = push.destination;
    }
    if (
      !push.divider &&
      (push.destination !== enemyOrigin || next.enemies[targetId].hp <= 0)
    ) {
      createFollowThrough(next, targetId, enemyOrigin);
    }
    if (push.track || push.ledge) {
      next.enemies[targetId].stunned = true;
      cancelIntent(next, targetId, push.track ? "ARC STUN" : "LEDGE FALL");
    } else if (preview.interrupts) {
      cancelIntent(next, targetId);
    }
    next.player.tempoBoost = false;
    addEvent(
      next,
      "impact",
      push.divider
        ? "DIVIDER BREACHED"
        : push.cell
          ? "CELL CASCADE"
          : push.track
            ? "ARC STUN"
            : push.ledge
              ? "LEDGE DROP"
              : push.collision
                ? "COLLISION"
                : "SHUNTED",
      `${collisionText ? `${collisionText} ` : ""}${
        next.enemies[targetId].name
      } took ${dealt}.`,
    );
    return finalizeAfterPlayerAction(next);
  }

  const dealt = damageEnemyExact(next, targetId, preview.damage);
  if (preview.interrupts) cancelIntent(next, targetId);
  next.player.tempoBoost = false;
  addEvent(
    next,
    preview.interrupts ? "interrupt" : "impact",
    preview.interrupts ? "INTENT CRUSHED" : `${dealt} DAMAGE`,
    `${next.enemies[targetId].name}${
      next.enemies[targetId].hp <= 0
        ? " disabled."
        : ` has ${next.enemies[targetId].hp} Signal.`
    }${collisionText ? ` ${collisionText}` : ""}`,
  );
  return finalizeAfterPlayerAction(next);
}

function finalizeAfterPlayerAction(state) {
  if (finishBattleIfNeeded(state)) return state;
  replanIntents(state);
  return state;
}

export function getDirectorContextAction(state) {
  if (
    state.phase !== "player" ||
    !state.contextAction?.available ||
    !["ride-the-breach", "follow-through"].includes(
      state.contextAction.id,
    )
  ) {
    return null;
  }
  const destination = state.contextAction.destination;
  const sourcePosition =
    state.contextAction.sourcePosition ?? destination;
  const occupied = isBlocked(state, destination, {
    allowPlayer: true,
  });
  return {
    ...clone(state.contextAction),
    legal: !occupied && state.player.position !== destination,
    destination,
    sourcePosition,
    reason:
      state.player.position === destination
        ? "ALREADY THERE"
        : occupied
          ? "OPENING OCCUPIED"
          : "",
    detail:
      state.contextAction.detail ??
      "EXPLORATION PAYOFF · FREE FOLLOW-THROUGH",
  };
}

export function useDirectorContextAction(state) {
  const action = getDirectorContextAction(state);
  if (!action?.legal) return state;
  const next = clone(state);
  next.player.position = action.destination;
  next.contextAction.available = false;
  next.contextAction.used = true;
  updateCover(next);
  replanIntents(next);
  addEvent(
    next,
    "success",
    "RIDE THE BREACH",
    "Battle created the opening. Exploration converted it into a route.",
  );
  return next;
}

function canUseObject(state, objectId) {
  const position = DIRECTOR_OBJECTS[objectId]?.position;
  return (
    state.phase === "player" &&
    Boolean(position) &&
    (state.player.position === position ||
      adjacent(state.player.position, position))
  );
}

export function getDirectorObjectAction(state, objectId) {
  if (objectId === "anchor-a" || objectId === "anchor-b") {
    if (state.anchors[objectId].powered) {
      return {
        id: "powered",
        legal: false,
        label: "ONLINE",
        reason:
          objectId === "anchor-a"
            ? "BRIDGE ACTIVE"
            : "STRIKE TRACK ACTIVE",
      };
    }
    const legal =
      canUseObject(state, objectId) && state.actionsRemaining > 0;
    return {
      id: "power-anchor",
      legal,
      label: "SYNC",
      actionCost: 1,
      reason: !canUseObject(state, objectId)
        ? "MOVE ADJACENT"
        : state.actionsRemaining <= 0
          ? "TWO ACTIONS SPENT"
          : "",
    };
  }

  if (objectId === "gate") {
    const legal =
      canUseObject(state, "gate") &&
      state.actionsRemaining > 0 &&
      !state.gate.sealing;
    return {
      id: "seal-gate",
      legal,
      label: state.gate.sealing ? "HOLDING" : "SEAL GATE",
      actionCost: 1,
      reason: !canUseObject(state, "gate")
          ? "MOVE INTO GATE RING"
          : state.actionsRemaining <= 0
            ? "TWO ACTIONS SPENT"
            : state.gate.sealing
              ? "SURVIVE ENEMY TURN"
              : "",
    };
  }

  if (objectId === "cache") {
    if (!state.cache.present || state.cache.carried) {
      return {
        id: "cache-taken",
        legal: false,
        label: "RECOVERED",
        reason: "CACHE SECURED",
      };
    }
    const legal =
      canUseObject(state, "cache") && state.actionsRemaining > 0;
    return {
      id: "recover-cache",
      legal,
      label: "RECOVER",
      actionCost: 1,
      reason: !canUseObject(state, "cache")
        ? "MOVE ADJACENT"
        : state.actionsRemaining <= 0
          ? "TWO ACTIONS SPENT"
          : "",
    };
  }

  if (objectId === "exit") {
    return {
      id: "retreat",
      legal: canUseObject(state, "exit"),
      label: "RETREAT",
      actionCost: 0,
      reason: canUseObject(state, "exit") ? "" : "RETURN WEST",
    };
  }

  if (objectId === "divider") {
    return {
      id: "divider-state",
      legal: false,
      label: state.divider.intact ? "BLOCKING" : "BREACHED",
      reason: state.divider.intact
        ? "SHUNT A UNIT OR USE OVERLOAD"
        : "CENTER ROUTE OPEN",
    };
  }

  if (objectId === "cell") {
    return {
      id: "cell-state",
      legal: false,
      label: state.cell.active ? "VOLATILE" : "RUPTURED",
      reason: state.cell.active ? "TARGET WITH OVERLOAD" : "SPENT",
    };
  }

  return null;
}

export function useDirectorObject(state, objectId) {
  const action = getDirectorObjectAction(state, objectId);
  if (!action?.legal) return state;
  const next = clone(state);
  if (action.actionCost) {
    next.actionsRemaining = Math.max(
      0,
      next.actionsRemaining - action.actionCost,
    );
  }

  if (objectId === "anchor-a" || objectId === "anchor-b") {
    next.anchors[objectId].powered = true;
    addEvent(
      next,
      "objective",
      `${DIRECTOR_OBJECTS[objectId].name} ONLINE`,
      objectId === "anchor-a"
        ? "Hardlight bridge opened."
        : "Lower track is now a live push hazard.",
    );
    replanIntents(next);
    return next;
  }

  if (objectId === "cache") {
    next.cache.present = false;
    next.cache.carried = true;
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 2);
    addEvent(next, "objective", "CACHE RECOVERED", "+2 Signal · position spent.");
    return next;
  }

  if (objectId === "exit") {
    next.phase = "result";
    next.result = {
      type: "retreat",
      title: "CONTROLLED RETREAT",
      cause: "You abandoned the Gate through the West Exit.",
    };
    return next;
  }

  next.gate.sealing = true;
  addEvent(
    next,
    "objective",
    "GATE HOLD STARTED",
    "Stay in the Gate ring and survive the primary assault.",
  );
  replanIntents(next);
  return next;
}

export function getDirectorObjective(state) {
  const powered = poweredAnchorIds(state).length;
  if (state.gate.sealing) {
    return {
      step: 3,
      title: "HOLD THE GATE",
      short: "SURVIVE 1 ENEMY TURN",
      powered,
    };
  }
  if (!canUseObject(state, "gate")) {
    return {
      step: 1,
      title: "REACH THE GATE",
      short:
        powered === 0
          ? "ANCHORS ARE OPTIONAL"
          : `${powered} ROUTE TOOL${powered === 1 ? "" : "S"} ONLINE`,
      powered,
    };
  }
  return {
    step: 2,
    title: "START THE LOCK",
    short: "USES ONE ACTION",
    powered,
  };
}

function damagePlayer(state, rawAmount, options = {}) {
  const coverReduction =
    options.ranged && !options.ignoreCover ? state.player.cover : 0;
  const amount = Math.max(0, rawAmount - coverReduction);
  const absorbed = Math.min(state.player.shield, amount);
  state.player.shield -= absorbed;
  state.player.hp = Math.max(0, state.player.hp - (amount - absorbed));
  return amount - absorbed;
}

function collapseHardlightBridge(state) {
  const affected = [];
  const destinations = ["t-6-4", "t-5-3", "t-7-3"];

  if (BRIDGE_TILES.has(state.player.position)) {
    const destination = destinations.find(
      (candidate) => !isBlocked(state, candidate),
    );
    if (destination) {
      state.player.position = destination;
    } else {
      state.player.hp = 0;
    }
    const dealt = destination
      ? damagePlayer(state, 2, { ignoreCover: true })
      : state.player.maxHp;
    updateCover(state);
    affected.push(`YOU FELL ${dealt}`);
  }

  for (const enemy of activeEnemies(state)) {
    if (!BRIDGE_TILES.has(enemy.position)) continue;
    const destination = destinations.find(
      (candidate) =>
        !isBlocked(state, candidate, { ignoreEnemy: enemy.id }),
    );
    if (destination) {
      enemy.position = destination;
    } else {
      enemy.hp = 0;
      enemy.shield = 0;
      cancelIntent(state, enemy.id, "BRIDGE COLLAPSE");
    }
    const dealt = destination
      ? damageEnemy(state, enemy.id, 2, {
          ignoreCover: true,
        })
      : enemy.maxHp;
    affected.push(`${enemy.name} FELL ${dealt}`);
  }

  return affected.join(" · ");
}

function pushPlayerAwayFrom(state, enemyId, spaces = 1) {
  if (state.player.braced) {
    state.player.braced = false;
    return false;
  }
  const enemy = state.enemies[enemyId];
  const playerPoint = parseTile(state.player.position);
  const enemyPoint = parseTile(enemy.position);
  const dx = Math.sign(playerPoint.x - enemyPoint.x);
  const dy = Math.sign(playerPoint.y - enemyPoint.y);
  const horizontal =
    Math.abs(playerPoint.x - enemyPoint.x) >=
    Math.abs(playerPoint.y - enemyPoint.y);
  const stepX = horizontal ? dx || -1 : 0;
  const stepY = horizontal ? 0 : dy || 1;
  let current = state.player.position;
  for (let step = 0; step < spaces; step += 1) {
    const point = parseTile(current);
    const candidate = tileId(point.x + stepX, point.y + stepY);
    if (
      !isTile(candidate) ||
      isBlocked(state, candidate, { allowPlayer: true })
    ) {
      break;
    }
    current = candidate;
  }
  const moved = current !== state.player.position;
  state.player.position = current;
  updateCover(state);
  return moved;
}

function ejectPlayerFromGate(state) {
  if (state.player.braced) {
    state.player.braced = false;
    return false;
  }
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
  options = {},
) {
  const enemy = state.enemies[enemyId];
  let path = routeToward(
    state,
    enemy.position,
    destination,
    steps,
    { ...options, ignoreEnemy: enemyId, allowPlayer: true },
  );
  if (path.at(-1) === state.player.position) path = path.slice(0, -1);
  const nextPosition = path.at(-1);
  if (
    nextPosition &&
    !isBlocked(state, nextPosition, {
      ignoreEnemy: enemyId,
      ...options,
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
      `${state.gate.integrity}/${state.gate.maxIntegrity} locks remain.`,
    );
    return;
  }
  if (intent.actorId === "ram" && intent.name === "BODY CHECK") {
    moveEnemyToward(state, "ram", state.player.position, 2);
    const dealt =
      distance(enemy.position, state.player.position) <= 1
        ? damagePlayer(state, 3)
        : 0;
    const pushed =
      dealt > 0 ? pushPlayerAwayFrom(state, "ram", 1) : false;
    addEvent(
      state,
      "danger",
      dealt > 0 ? "RAM BODY CHECK" : "RAM CLOSED IN",
      dealt > 0
        ? `${dealt} damage${pushed ? " · displaced" : " · held"}.`
        : "Its charge lane narrowed.",
    );
    return;
  }
  if (intent.actorId === "ram" && intent.name === "CHARGE LINE") {
    moveEnemyToward(state, "ram", "t-16-6", 2);
    addEvent(state, "danger", "RAM CHARGED", "The Gate lane is under pressure.");
    return;
  }

  if (intent.actorId === "warden" && intent.name === "SHIELD LINK") {
    if (state.enemies.ram.hp > 0) state.enemies.ram.shield += 2;
    addEvent(state, "enemy", "RAM SHIELDED +2", "WARDEN is holding the lane.");
    return;
  }
  if (intent.actorId === "warden" && intent.name === "INTERPOSE") {
    moveEnemyToward(
      state,
      "warden",
      intent.destination,
      2,
    );
    addEvent(state, "enemy", "WARDEN INTERPOSED", "A route is now occupied.");
    return;
  }
  if (intent.actorId === "warden" && intent.name === "SHIELD BASH") {
    if (adjacent(enemy.position, state.player.position)) {
      const dealt = damagePlayer(state, 2);
      const pushed = pushPlayerAwayFrom(state, "warden", 1);
      addEvent(
        state,
        "enemy",
        "SHIELD BASH",
        `${dealt} damage${pushed ? " · displaced" : " · held"}.`,
      );
    } else {
      addEvent(state, "interrupt", "BASH MISSED", "You left the contact tile.");
    }
    return;
  }
  if (intent.actorId === "warden" && intent.name === "EJECT") {
    moveEnemyToward(state, "warden", state.player.position, 2);
    const inRange = adjacent(enemy.position, state.player.position);
    const displaced = inRange ? ejectPlayerFromGate(state) : false;
    if (inRange) damagePlayer(state, 1);
    addEvent(
      state,
      displaced ? "danger" : "enemy",
      displaced ? "FORCED OFF THE GATE" : "WARDEN CLOSED IN",
      displaced ? "Gate Work lost legal access." : "The hold survived this impact.",
    );
    return;
  }
  if (intent.actorId === "warden" && intent.name === "HUNT") {
    moveEnemyToward(state, "warden", state.player.position, 2);
    addEvent(state, "enemy", "WARDEN ADVANCED", "It is hunting your position.");
    return;
  }

  if (intent.actorId === "jammer" && intent.name === "DRAIN LINK") {
    const inRange =
      distance(enemy.position, DIRECTOR_OBJECTS[intent.targetId].position) <=
        3 &&
      hasDirectorLineOfSight(
        state,
        enemy.position,
        DIRECTOR_OBJECTS[intent.targetId].position,
      );
    if (inRange) {
      state.anchors[intent.targetId].powered = false;
      const collapse =
        intent.targetId === "anchor-a"
          ? collapseHardlightBridge(state)
          : "";
      addEvent(
        state,
        "danger",
        `${DIRECTOR_OBJECTS[intent.targetId].name} DRAINED`,
        intent.targetId === "anchor-a"
          ? `The hardlight bridge collapsed.${
              collapse ? ` ${collapse}.` : ""
            }`
          : "The lower strike track went cold.",
      );
    } else {
      addEvent(state, "interrupt", "DRAIN BROKEN", "Range or sight was denied.");
    }
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "STATIC FIELD") {
    if (distance(enemy.position, state.player.position) <= 3) {
      state.player.jammed = true;
      addEvent(
        state,
        "enemy",
        "STATIC FIELD",
        "SKIP//STEP and the automatic Intercept response are blocked.",
      );
    } else {
      addEvent(state, "interrupt", "FIELD MISSED", "You left the Jammer radius.");
    }
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "BROADCAST SWEEP") {
    const caught =
      DIRECTOR_TILES[state.player.position]?.lane === intent.affectedLane;
    const dealt = caught
      ? damagePlayer(state, 2, { ranged: true })
      : 0;
    addEvent(
      state,
      caught ? (dealt > 0 ? "danger" : "guard") : "interrupt",
      caught
        ? dealt > 0
          ? "BROADCAST SWEEP"
          : "SWEEP ABSORBED"
        : "SWEEP MISSED",
      caught
        ? dealt > 0
          ? `${intent.affectedLane.toUpperCase()} lane caught you for ${dealt}.`
          : "Terrain and Shield broke the scan."
        : `You left the ${intent.affectedLane.toUpperCase()} lane before the scan.`,
    );
    return;
  }
  if (intent.actorId === "jammer" && intent.name === "HUNT CIRCUIT") {
    moveEnemyToward(
      state,
      "jammer",
      intent.destination,
      2,
      { ignoreObject: intent.targetId },
    );
    addEvent(state, "enemy", "JAMMER RELOCATED", "Its drain tether is getting closer.");
    return;
  }

  if (intent.actorId === "sniper" && intent.name === "TRACE SHOT") {
    const legal =
      distance(enemy.position, state.player.position) <= 12 &&
      hasDirectorLineOfSight(state, enemy.position, state.player.position);
    if (legal) {
      const dealt = damagePlayer(state, 2, { ranged: true });
      addEvent(
        state,
        dealt > 0 ? "danger" : "guard",
        dealt > 0 ? "TRACE SHOT" : "SHOT ABSORBED",
        dealt > 0
          ? `${dealt} damage through the open line.`
          : "Cover and Shield stopped the trace.",
      );
    } else {
      addEvent(state, "interrupt", "TRACE BROKEN", "Sightline denied.");
    }
    return;
  }
  if (intent.actorId === "sniper" && intent.name === "FIND TRACE") {
    moveEnemyToward(state, "sniper", intent.destination, 2);
    addEvent(state, "enemy", "TRACE REPOSITIONED", "A new sightline is forming.");
  }
}

function reactionForIntent(state, intent) {
  if (
    !intent ||
    intent.status !== "ready" ||
    intent.priority !== "primary" ||
    !state.reactionReady ||
    state.player.jammed ||
    !["ram", "warden"].includes(intent.actorId)
  ) {
    return null;
  }
  const enemy = state.enemies[intent.actorId];
  if (!enemy || enemy.hp <= 0) return null;
  const reachable = pathsFrom(
    state,
    state.player.position,
    DIRECTOR_RULES.reactionRange,
    { allowPlayer: true },
  );
  const candidates = [
    ...(adjacent(state.player.position, enemy.position)
      ? [state.player.position]
      : []),
    ...neighbors(state, enemy.position, {
      ignoreEnemy: intent.actorId,
      allowPlayer: true,
    }),
  ]
    .filter((position) => reachable.has(position))
    .sort(
      (left, right) =>
        reachable.get(left).cost - reachable.get(right).cost ||
        distance(left, intentTargetPosition(state, intent)) -
          distance(right, intentTargetPosition(state, intent)) ||
        left.localeCompare(right),
    );
  const destination = candidates[0];
  if (!destination) return null;
  return {
    id: `reaction-${state.turn}-${intent.id}`,
    intentId: intent.id,
    actorId: intent.actorId,
    label: "INTERCEPT",
    title: `${state.enemies[intent.actorId].name} COMMITTED`,
    detail:
      intent.targetId === "gate"
        ? "Crash the Gate attack before it lands."
        : "Meet the contact and stop the displacement.",
    interceptEffect: "STOP IT · TAKE 1 HIT",
    declineEffect:
      intent.targetId === "gate"
        ? "GATE TAKES THE HIT"
        : "YOU TAKE THE PUSH",
    origin: state.player.position,
    destination,
    path: reachable.get(destination)?.path ?? [
      state.player.position,
      destination,
    ],
  };
}

function openReactionIfAvailable(state) {
  const intentId = state.enemyQueue[state.enemyCursor];
  const intent = state.intents.find((candidate) => candidate.id === intentId);
  const reaction = reactionForIntent(state, intent);
  if (!reaction) return false;
  state.phase = "reaction";
  state.reaction = reaction;
  addEvent(
    state,
    "reaction",
    "RESPONSE WINDOW",
    `${reaction.title} · ${reaction.detail}`,
  );
  return true;
}

export function getDirectorReaction(state) {
  return state.phase === "reaction" && state.reaction
    ? clone(state.reaction)
    : null;
}

export function resolveDirectorReaction(state, choice) {
  if (state.phase !== "reaction" || !state.reaction) return state;
  const next = clone(state);
  const reaction = next.reaction;
  const intent = next.intents.find(
    (candidate) => candidate.id === reaction.intentId,
  );
  next.phase = "enemy";
  next.reaction = null;
  next.reactionReady = false;

  if (choice !== "intercept" || !intent) {
    addEvent(
      next,
      "danger",
      "RESPONSE PASSED",
      `${next.enemies[reaction.actorId].name}'s commitment will resolve.`,
    );
    return next;
  }

  next.player.position = reaction.destination;
  updateCover(next);
  const dealt = damageEnemy(next, reaction.actorId, 1, {
    ignoreCover: true,
  });
  const received = damagePlayer(next, 1, { ignoreCover: true });
  cancelIntent(next, reaction.actorId, "INTERCEPTED");
  if (
    next.gate.sealing &&
    adjacent(reaction.origin, DIRECTOR_OBJECTS.gate.position)
  ) {
    next.player.position = reaction.origin;
    updateCover(next);
  }
  addEvent(
    next,
    "interrupt",
    "CLASH // INTERCEPT",
    `${next.enemies[reaction.actorId].name} stopped · dealt ${dealt} · took ${received}.`,
  );
  return next;
}

function finishBattleIfNeeded(state) {
  if (state.gate.integrity <= 0) {
    state.phase = "result";
    state.result = {
      type: "defeat",
      title: "GATE DESTROYED",
      cause: "RAM collapsed the final Gate lock.",
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
        title: state.cache.carried ? "RECOVERY SECURE" : "GATE SEALED",
        cause: "Your Gate position survived the primary enemy commitment.",
      };
      addEvent(state, "victory", state.result.title, "Signal lock restored.");
      return;
    }
    state.gate.sealing = false;
    addEvent(
      state,
      "danger",
      "GATE HOLD BROKEN",
      "Return to the Gate ring and start another lock.",
    );
  }
  state.turn += 1;
  state.phase = "player";
  state.movementRemaining = DIRECTOR_RULES.movementPerTurn;
  state.actionsRemaining = DIRECTOR_RULES.actionsPerTurn;
  state.reactionReady = true;
  state.reaction = null;
  state.cardUses = {};
  state.player.shield = 0;
  state.player.braced = false;
  state.player.tempoBoost = false;
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
  if (next.contextAction?.available) {
    next.contextAction.available = false;
    next.contextAction.expired = true;
  }
  for (const enemy of Object.values(next.enemies)) {
    enemy.shield = 0;
  }
  next.player.jammed = false;
  next.phase = "enemy";
  next.reactionReady = true;
  next.reaction = null;
  next.enemyQueue = next.intents
    .filter((intent) => intent.status !== "spent")
    .map((intent) => intent.id);
  next.enemyCursor = 0;
  addEvent(
    next,
    "enemy",
    "ENEMY COMMITMENT",
    "One primary threat and one support action will resolve.",
  );
  openReactionIfAvailable(next);
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
  } else {
    openReactionIfAvailable(next);
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
    x: 50 + (point.x - point.y - 2) * TILE_HALF_WIDTH,
    y: 16 + (point.x + point.y - 5) * TILE_HALF_HEIGHT,
  };
}

export function getDirectorTilePolygon(positionId) {
  const point = getDirectorScreenPosition(positionId);
  return [
    `${point.x},${point.y - TILE_HALF_HEIGHT}`,
    `${point.x + TILE_HALF_WIDTH},${point.y}`,
    `${point.x},${point.y + TILE_HALF_HEIGHT}`,
    `${point.x - TILE_HALF_WIDTH},${point.y}`,
  ].join(" ");
}

export function getDirectorBattleSnapshot(state) {
  return {
    seed: state.seed,
    turn: state.turn,
    phase: state.phase,
    build: clone(state.build),
    movementRemaining: state.movementRemaining,
    actionsRemaining: state.actionsRemaining,
    reactionReady: state.reactionReady,
    reaction: clone(state.reaction),
    player: clone(state.player),
    gate: clone(state.gate),
    anchors: clone(state.anchors),
    divider: clone(state.divider),
    cache: clone(state.cache),
    cell: clone(state.cell),
    enemies: clone(state.enemies),
    cardUses: clone(state.cardUses),
    contextAction: clone(state.contextAction),
    intents: clone(state.intents),
    enemyQueue: clone(state.enemyQueue),
    enemyCursor: state.enemyCursor,
    lastEvent: clone(state.lastEvent),
    result: clone(state.result),
  };
}
