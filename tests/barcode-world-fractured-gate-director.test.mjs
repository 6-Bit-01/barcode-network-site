import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTOR_CARDS,
  DIRECTOR_OBJECTS,
  DIRECTOR_RULES,
  DIRECTOR_SOURCE,
  DIRECTOR_TILES,
  advanceDirectorEnemyTurn,
  beginDirectorEnemyTurn,
  createDirectorState,
  getDirectorBattleSnapshot,
  getDirectorCardCost,
  getDirectorCardTargets,
  getDirectorObjectAction,
  getDirectorReachableTiles,
  getDirectorScreenPosition,
  getDirectorTilePolygon,
  hasDirectorLineOfSight,
  moveDirectorPlayer,
  planDirectorIntents,
  playDirectorCard,
  previewDirectorCard,
  resetDirectorState,
  useDirectorObject,
} from "../src/lib/barcode-world/fractured-gate-director-engine.mjs";

function finishEnemyTurn(state) {
  let next =
    state.phase === "player" ? beginDirectorEnemyTurn(state) : state;
  for (let step = 0; step < 16 && next.phase === "enemy"; step += 1) {
    next = advanceDirectorEnemyTurn(next);
  }
  assert.notEqual(next.phase, "enemy", "enemy turn must terminate");
  return next;
}

function livingPositions(state) {
  return [
    state.player.position,
    ...Object.values(state.enemies)
      .filter((enemy) => enemy.hp > 0)
      .map((enemy) => enemy.position),
  ];
}

function disableEnemiesExcept(state, keptId) {
  for (const [enemyId, enemy] of Object.entries(state.enemies)) {
    if (enemyId !== keptId) enemy.hp = 0;
  }
  state.intents = planDirectorIntents(state);
  return state;
}

function polygonPoints(id) {
  return getDirectorTilePolygon(id)
    .split(" ")
    .map((pair) => pair.split(",").map(Number));
}

test("Live Circuit opens as a larger tactical battlefield", () => {
  const state = createDirectorState("LIVE-CIRCUIT-CONTRACT");
  assert.equal(
    DIRECTOR_SOURCE,
    "BARCODE_WORLD_FRACTURED_GATE_LIVE_CIRCUIT_2026-07-29",
  );
  assert.equal(DIRECTOR_RULES.commandStart, 16);
  assert.equal(DIRECTOR_RULES.commandIncome, 16);
  assert.equal(DIRECTOR_RULES.commandCap, 32);
  assert.equal(DIRECTOR_RULES.moveRange, 5);
  assert.equal("paidActionCap" in DIRECTOR_RULES, false);
  assert.ok(Object.keys(DIRECTOR_TILES).length >= 145);
  assert.deepEqual(Object.keys(DIRECTOR_CARDS), [
    "bitcrush",
    "shunt",
    "skip-step",
    "firewall",
    "overload",
  ]);
  assert.deepEqual(Object.keys(state.enemies), [
    "ram",
    "warden",
    "jammer",
    "sniper",
  ]);
  assert.deepEqual(Object.keys(DIRECTOR_OBJECTS), [
    "anchor-a",
    "anchor-b",
    "cell",
    "divider",
    "cache",
    "exit",
    "gate",
  ]);
  assert.equal(state.intents.length, 4);
  assert.equal(new Set(livingPositions(state)).size, 5);
});

test("edge-sharing projection creates a continuous SVG grid", () => {
  const left = polygonPoints("t-1-6");
  const right = polygonPoints("t-2-6");
  assert.ok(
    Math.abs(left[1][0] - right[0][0]) < Number.EPSILON &&
      Math.abs(left[1][1] - right[0][1]) < 1e-12,
    "east edge starts at the same vertex",
  );
  assert.ok(
    Math.abs(left[2][0] - right[3][0]) < Number.EPSILON &&
      Math.abs(left[2][1] - right[3][1]) < 1e-12,
    "east edge ends at the same vertex",
  );

  const leftCenter = getDirectorScreenPosition("t-1-6");
  const rightCenter = getDirectorScreenPosition("t-2-6");
  assert.ok(
    Math.abs(
      rightCenter.x - leftCenter.x - DIRECTOR_RULES.tileHalfWidth,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      rightCenter.y - leftCenter.y - DIRECTOR_RULES.tileHalfHeight,
    ) < 1e-12,
  );
});

test("the walkable floor remains connected without the powered bridge", () => {
  const walkable = Object.values(DIRECTOR_TILES).filter(
    (tile) => tile.walkable && tile.terrain !== "bridge",
  );
  const ids = new Set(walkable.map((tile) => tile.id));
  const visited = new Set([walkable[0].id]);
  const queue = [walkable[0].id];
  while (queue.length) {
    const current = DIRECTOR_TILES[queue.shift()];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const candidate = `t-${current.x + dx}-${current.y + dy}`;
      if (ids.has(candidate) && !visited.has(candidate)) {
        visited.add(candidate);
        queue.push(candidate);
      }
    }
  }
  assert.equal(visited.size, ids.size);
});

test("opening reach offers route choice without covering the whole formation", () => {
  const state = createDirectorState();
  const reachable = getDirectorReachableTiles(state);
  assert.ok(Object.keys(reachable).length >= 15);
  assert.ok(Object.keys(reachable).length < Object.keys(DIRECTOR_TILES).length / 4);
  assert.equal(getDirectorCardTargets(state, "bitcrush").length, 0);
  assert.equal(getDirectorCardTargets(state, "shunt").length, 0);
  assert.equal(getDirectorCardTargets(state, "overload").length, 0);
  assert.ok(getDirectorCardTargets(state, "skip-step").length > 0);
  for (const objectId of ["anchor-a", "anchor-b", "cell", "divider", "gate"]) {
    const position = DIRECTOR_OBJECTS[objectId].position;
    assert.equal(reachable[position], undefined);
  }
});

test("racks block movement and sight while rubble has a real movement cost", () => {
  const state = createDirectorState();
  assert.equal(DIRECTOR_TILES["t-4-5"].terrain, "rack");
  assert.equal(DIRECTOR_TILES["t-4-5"].walkable, false);
  assert.equal(
    hasDirectorLineOfSight(state, "t-3-5", "t-5-5"),
    false,
  );
  const rubble = getDirectorReachableTiles(state)["t-3-5"];
  assert.equal(rubble.cost, 4);
  assert.equal(rubble.path.at(-1), "t-3-5");
  assert.equal(rubble.path.includes("t-4-5"), false);
});

test("cover and high ground materially change combat", () => {
  let covered = disableEnemiesExcept(createDirectorState(), "sniper");
  covered.player.position = "t-5-5";
  covered.player.cover = DIRECTOR_TILES[covered.player.position].cover;
  covered.enemies.sniper.position = "t-5-2";
  covered.intents = planDirectorIntents(covered);
  covered = finishEnemyTurn(covered);
  assert.equal(covered.player.hp, covered.player.maxHp, "heavy cover stops 2");

  let exposed = disableEnemiesExcept(createDirectorState(), "sniper");
  exposed.player.position = "t-5-6";
  exposed.player.cover = DIRECTOR_TILES[exposed.player.position].cover;
  exposed.enemies.sniper.position = "t-5-2";
  exposed.intents = planDirectorIntents(exposed);
  exposed = finishEnemyTurn(exposed);
  assert.equal(exposed.player.hp, exposed.player.maxHp - 2);

  const high = createDirectorState();
  high.player.position = "t-9-2";
  high.enemies.ram.position = "t-9-4";
  high.intents = planDirectorIntents(high);
  const preview = previewDirectorCard(high, "bitcrush", "ram");
  assert.equal(preview.highGround, true);
  assert.equal(preview.impact, 3);
  assert.match(preview.summary, /HIGH GROUND/);
});

test("line of sight is reciprocal across every battlefield cell", () => {
  const state = createDirectorState();
  const tileIds = Object.keys(DIRECTOR_TILES);
  for (let from = 0; from < tileIds.length; from += 1) {
    for (let to = from + 1; to < tileIds.length; to += 1) {
      assert.equal(
        hasDirectorLineOfSight(state, tileIds[from], tileIds[to]),
        hasDirectorLineOfSight(state, tileIds[to], tileIds[from]),
        `${tileIds[from]} ↔ ${tileIds[to]}`,
      );
    }
  }
});

test("cover protects against TRACE but not adjacent melee", () => {
  let state = disableEnemiesExcept(createDirectorState(), "warden");
  state.player.position = "t-5-5";
  state.player.cover = DIRECTOR_TILES[state.player.position].cover;
  state.enemies.warden.position = "t-5-4";
  state.intents = planDirectorIntents(state);
  assert.equal(
    state.intents.find((intent) => intent.actorId === "warden").name,
    "SHIELD BASH",
  );
  state = finishEnemyTurn(state);
  assert.equal(state.player.hp, state.player.maxHp - 2);
});

test("the two Anchors create different board advantages", () => {
  const closed = createDirectorState();
  closed.player.position = "t-5-3";
  closed.moveAvailable = true;
  assert.equal(getDirectorReachableTiles(closed)["t-6-3"], undefined);
  assert.equal(
    getDirectorReachableTiles(closed)["t-9-3"],
    undefined,
    "the broken catwalk requires a real detour",
  );

  const bridge = createDirectorState();
  bridge.player.position = "t-5-3";
  bridge.command = 32;
  const bridgeOnline = useDirectorObject(bridge, "anchor-a");
  bridgeOnline.moveAvailable = true;
  assert.ok(getDirectorReachableTiles(bridgeOnline)["t-6-3"]);
  assert.equal(
    getDirectorReachableTiles(bridgeOnline)["t-9-3"].cost,
    4,
    "Anchor I opens a meaningful upper-route shortcut",
  );

  const coldTrack = createDirectorState();
  coldTrack.player.position = "t-7-9";
  coldTrack.moveAvailable = true;
  const coldCost = getDirectorReachableTiles(coldTrack)["t-11-10"].cost;

  const liveTrack = createDirectorState();
  liveTrack.anchors["anchor-b"].powered = true;
  liveTrack.player.position = "t-7-9";
  liveTrack.moveAvailable = true;
  const liveCost = getDirectorReachableTiles(liveTrack)["t-11-10"].cost;
  assert.ok(liveCost < coldCost);
});

test("Shunt turns the powered track and ledges into weapons", () => {
  const track = createDirectorState();
  track.anchors["anchor-b"].powered = true;
  track.player.position = "t-6-10";
  track.player.tempoBoost = true;
  track.enemies.ram.position = "t-8-10";
  track.intents = planDirectorIntents(track);
  const preview = previewDirectorCard(track, "shunt", "ram");
  assert.equal(preview.push.track, true);
  assert.match(preview.summary, /ARC STUN/);
  const stunned = playDirectorCard(track, "shunt", "ram");
  assert.equal(stunned.enemies.ram.position, "t-10-10");
  assert.equal(stunned.enemies.ram.stunned, true);
  assert.equal(
    stunned.intents.find((intent) => intent.actorId === "ram").status,
    "canceled",
  );

  const ledge = createDirectorState();
  ledge.player.position = "t-9-1";
  ledge.enemies.ram.position = "t-9-2";
  ledge.intents = planDirectorIntents(ledge);
  const ledgePreview = previewDirectorCard(ledge, "shunt", "ram");
  assert.equal(ledgePreview.push.ledge, true);
  assert.match(ledgePreview.summary, /LEDGE/);
});

test("Command banks, supports combinations, and Jammer taxation is explicit", () => {
  let state = createDirectorState();
  state.player.position = "t-5-3";
  state.command = 16;
  state = useDirectorObject(state, "anchor-a");
  state = playDirectorCard(state, "firewall", "player");
  state = playDirectorCard(state, "skip-step", "t-5-4");
  assert.equal(state.command, 4);
  assert.equal("paidActions" in state, false);

  state = finishEnemyTurn(state);
  assert.equal(state.command, 20);
  state = finishEnemyTurn(state);
  assert.equal(state.command, 32);

  state.player.jammed = true;
  assert.equal(getDirectorCardCost(state, "bitcrush"), 5);
  assert.equal(getDirectorCardCost(state, "firewall"), 4);
});

test("the Power Cell is local, destructive, and cannot erase the opening turn", () => {
  const opening = createDirectorState();
  assert.equal(getDirectorCardTargets(opening, "overload").includes("cell"), false);

  const setup = createDirectorState();
  setup.player.position = "t-8-4";
  setup.enemies.jammer.position = "t-9-6";
  setup.enemies.sniper.position = "t-8-8";
  setup.intents = planDirectorIntents(setup);
  const preview = previewDirectorCard(setup, "overload", "cell");
  assert.equal(preview.legal, true);
  assert.equal(preview.selfDamage, 2);
  assert.match(preview.summary, /SELF 2/);
  assert.deepEqual(new Set(preview.victims), new Set(["jammer", "sniper"]));
  assert.ok(preview.victims.length < Object.keys(setup.enemies).length);

  const blasted = playDirectorCard(setup, "overload", "cell");
  assert.equal(blasted.cell.active, false);
  assert.equal(blasted.divider.intact, false);
  assert.equal(blasted.enemies.jammer.hp, setup.enemies.jammer.hp - 3);
  assert.equal(blasted.enemies.sniper.hp, setup.enemies.sniper.hp - 3);
  assert.equal(blasted.enemies.ram.hp, setup.enemies.ram.hp);
  assert.equal(blasted.enemies.warden.hp, setup.enemies.warden.hp);
  assert.equal(blasted.player.hp, setup.player.hp - 2);

  const collision = createDirectorState();
  collision.player.position = "t-6-6";
  collision.enemies.ram.position = "t-7-6";
  collision.intents = planDirectorIntents(collision);
  collision.intents.find(
    (intent) => intent.actorId === "ram",
  ).status = "canceled";
  const collisionPreview = previewDirectorCard(
    collision,
    "shunt",
    "ram",
  );
  assert.equal(collisionPreview.push.cell, true);
  assert.equal(collisionPreview.damage, 6);
  assert.equal(collisionPreview.selfDamage, 2);
  assert.match(collisionPreview.summary, /6 DMG.*DETONATE.*SELF 2/);
  const collided = playDirectorCard(collision, "shunt", "ram");
  assert.equal(
    collided.enemies.ram.hp,
    collision.enemies.ram.hp - collisionPreview.damage,
  );
  assert.equal(
    collided.player.hp,
    collision.player.hp - collisionPreview.selfDamage,
  );
});

test("local Tempo responds to terrain instead of creating global phases", () => {
  const boosted = createDirectorState();
  boosted.player.position = "t-11-6";
  boosted.player.tempoBoost = true;
  boosted.enemies.ram.position = "t-13-6";
  boosted.intents = planDirectorIntents(boosted);
  const first = previewDirectorCard(boosted, "shunt", "ram");
  assert.equal(first.relation, "YOU FIRST");
  assert.equal(first.interrupts, true);

  const rubble = createDirectorState();
  rubble.player.position = "t-9-6";
  rubble.enemies.ram.position = "t-9-4";
  rubble.enemies.warden.position = "t-13-6";
  rubble.intents = planDirectorIntents(rubble);
  const together = previewDirectorCard(rubble, "bitcrush", "ram");
  assert.equal(together.relation, "TOGETHER");
  assert.equal(together.interrupts, false);
});

test("local Tempo changes causal resolution, not only preview text", () => {
  const fast = disableEnemiesExcept(createDirectorState(), "ram");
  fast.player.position = "t-8-6";
  fast.enemies.ram.position = "t-8-4";
  fast.enemies.ram.hp = 2;
  fast.intents = planDirectorIntents(fast);
  assert.equal(
    previewDirectorCard(fast, "bitcrush", "ram").relation,
    "YOU FIRST",
  );
  const interrupted = playDirectorCard(fast, "bitcrush", "ram");
  assert.equal(interrupted.player.hp, interrupted.player.maxHp);
  assert.equal(interrupted.enemies.ram.hp, 0);

  const equal = disableEnemiesExcept(createDirectorState(), "ram");
  equal.player.position = "t-9-6";
  equal.enemies.ram.position = "t-9-4";
  equal.enemies.ram.hp = 2;
  equal.intents = planDirectorIntents(equal);
  assert.equal(
    previewDirectorCard(equal, "bitcrush", "ram").relation,
    "TOGETHER",
  );
  const traded = playDirectorCard(equal, "bitcrush", "ram");
  assert.equal(traded.player.hp, traded.player.maxHp - 3);
  assert.equal(traded.enemies.ram.hp, 0);

  const slow = disableEnemiesExcept(createDirectorState(), "ram");
  slow.player.position = "t-9-6";
  slow.enemies.ram.position = "t-9-4";
  slow.enemies.ram.hp = 4;
  slow.intents = planDirectorIntents(slow);
  assert.equal(
    previewDirectorCard(slow, "overload", "ram").relation,
    "ENEMY FIRST",
  );
  const followed = playDirectorCard(slow, "overload", "ram");
  assert.equal(followed.player.hp, followed.player.maxHp - 3);
  assert.equal(
    followed.enemies.ram.hp,
    2,
    "RAM acts first, reaches heavy cover, and survives the slower hit",
  );
});

test("the opening Enemy Turn changes the physical board", () => {
  const opening = createDirectorState();
  const before = Object.fromEntries(
    Object.entries(opening.enemies).map(([id, enemy]) => [id, enemy.position]),
  );
  const after = finishEnemyTurn(opening);
  const moved = Object.entries(after.enemies).filter(
    ([id, enemy]) => enemy.position !== before[id],
  );
  assert.ok(moved.length >= 3);
  assert.equal(new Set(livingPositions(after)).size, livingPositions(after).length);
  assert.equal(after.turn, 2);
});

test("enemy movement uses the same powered-track terrain economy", () => {
  const cold = disableEnemiesExcept(createDirectorState(), "ram");
  cold.enemies.ram.position = "t-8-10";
  cold.intents = planDirectorIntents(cold);
  const coldResult = finishEnemyTurn(cold);
  assert.equal(coldResult.enemies.ram.position, "t-10-10");

  const live = disableEnemiesExcept(createDirectorState(), "ram");
  live.anchors["anchor-b"].powered = true;
  live.enemies.ram.position = "t-8-10";
  live.intents = planDirectorIntents(live);
  const liveResult = finishEnemyTurn(live);
  assert.equal(liveResult.enemies.ram.position, "t-12-10");
});

test("Jammer must establish a real tether before draining an Anchor", () => {
  const distant = createDirectorState();
  distant.anchors["anchor-a"].powered = true;
  distant.enemies.jammer.position = "t-8-10";
  distant.intents = planDirectorIntents(distant);
  assert.equal(
    distant.intents.find((intent) => intent.actorId === "jammer").name,
    "HUNT CIRCUIT",
  );

  const tethered = createDirectorState();
  tethered.anchors["anchor-a"].powered = true;
  tethered.enemies.jammer.position = "t-5-5";
  tethered.intents = planDirectorIntents(tethered);
  assert.equal(
    tethered.intents.find((intent) => intent.actorId === "jammer").name,
    "DRAIN LINK",
  );
  const drained = finishEnemyTurn(tethered);
  assert.equal(drained.anchors["anchor-a"].powered, false);
});

test("a drained hardlight bridge drops its occupant into the yard", () => {
  const state = disableEnemiesExcept(createDirectorState(), "jammer");
  state.anchors["anchor-a"].powered = true;
  state.player.position = "t-6-3";
  state.enemies.jammer.position = "t-5-5";
  state.intents = planDirectorIntents(state);
  assert.equal(
    state.intents.find((intent) => intent.actorId === "jammer").name,
    "DRAIN LINK",
  );
  const collapsed = finishEnemyTurn(state);
  assert.equal(collapsed.anchors["anchor-a"].powered, false);
  assert.equal(collapsed.player.position, "t-6-4");
  assert.equal(collapsed.player.hp, collapsed.player.maxHp - 2);
});

test("Firewall can preserve a Gate hold against Warden displacement", () => {
  const setup = createDirectorState();
  setup.anchors["anchor-a"].powered = true;
  setup.anchors["anchor-b"].powered = true;
  setup.player.position = "t-16-6";
  setup.player.braced = true;
  setup.player.shield = 4;
  setup.gate.sealing = true;
  setup.enemies.ram.hp = 0;
  setup.enemies.jammer.hp = 0;
  setup.enemies.sniper.hp = 0;
  setup.enemies.warden.position = "t-14-6";
  setup.intents = planDirectorIntents(setup);
  const held = finishEnemyTurn(setup);
  assert.equal(held.result.type, "victory");
  assert.equal(held.player.position, "t-16-6");

  const exposed = cloneForTest(setup);
  exposed.player.braced = false;
  exposed.gate.sealing = true;
  exposed.result = null;
  exposed.phase = "player";
  exposed.enemies.warden.position = "t-14-6";
  exposed.intents = planDirectorIntents(exposed);
  const ejected = finishEnemyTurn(exposed);
  assert.equal(ejected.result, null);
  assert.equal(ejected.gate.sealing, false);
  assert.notEqual(ejected.player.position, "t-16-6");
});

test("RAM can still destroy an ignored Gate", () => {
  const state = disableEnemiesExcept(createDirectorState(), "ram");
  state.gate.integrity = 1;
  state.enemies.ram.position = "t-16-6";
  state.intents = planDirectorIntents(state);
  assert.equal(
    state.intents.find((intent) => intent.actorId === "ram").name,
    "GATE SMASH",
  );
  const lost = finishEnemyTurn(state);
  assert.equal(lost.result.type, "defeat");
  assert.equal(lost.result.title, "GATE DESTROYED");
});

function cloneForTest(value) {
  return structuredClone(value);
}

test("Cache and West Exit create meaningful result branches", () => {
  const retreat = createDirectorState();
  assert.equal(getDirectorObjectAction(retreat, "exit").legal, true);
  const left = useDirectorObject(retreat, "exit");
  assert.equal(left.result.title, "CONTROLLED RETREAT");

  const standingOnExit = createDirectorState();
  standingOnExit.player.position = DIRECTOR_OBJECTS.exit.position;
  assert.equal(
    getDirectorObjectAction(standingOnExit, "exit").legal,
    true,
  );

  const cache = createDirectorState();
  cache.player.position = DIRECTOR_OBJECTS.cache.position;
  cache.player.hp = 8;
  assert.equal(getDirectorObjectAction(cache, "cache").legal, true);
  const recovered = useDirectorObject(cache, "cache");
  assert.equal(recovered.cache.carried, true);
  assert.equal(recovered.cache.present, false);
  assert.equal(recovered.player.hp, 10);
});

test("a real six-turn route uses terrain, interrupts, and a defended Gate hold", () => {
  let state = createDirectorState("LIVE-CIRCUIT-GOLDEN");

  state = moveDirectorPlayer(state, "t-3-3");
  state = playDirectorCard(state, "firewall", "player");
  state = finishEnemyTurn(state);

  state = moveDirectorPlayer(state, "t-5-3");
  state = useDirectorObject(state, "anchor-a");
  state = playDirectorCard(state, "skip-step", "t-5-6");
  state = finishEnemyTurn(state);

  state = moveDirectorPlayer(state, "t-5-9");
  state = useDirectorObject(state, "anchor-b");
  state = playDirectorCard(state, "shunt", "jammer");
  state = playDirectorCard(state, "bitcrush", "jammer");
  state = playDirectorCard(state, "overload", "jammer");
  assert.equal(state.enemies.jammer.hp, 0);
  state = finishEnemyTurn(state);

  assert.ok(getDirectorReachableTiles(state)["t-12-10"]);
  state = moveDirectorPlayer(state, "t-12-10");
  assert.equal(state.player.tempoBoost, true);
  state = playDirectorCard(state, "skip-step", "t-14-9");
  state = playDirectorCard(state, "bitcrush", "ram");
  state = playDirectorCard(state, "firewall", "player");
  state = finishEnemyTurn(state);

  state = moveDirectorPlayer(state, "t-14-6");
  state = playDirectorCard(state, "bitcrush", "warden");
  state = playDirectorCard(state, "overload", "warden");
  state = playDirectorCard(state, "shunt", "warden");
  assert.equal(state.enemies.warden.hp, 0);
  state = finishEnemyTurn(state);

  state = playDirectorCard(state, "bitcrush", "ram");
  state = playDirectorCard(state, "overload", "ram");
  state = playDirectorCard(state, "shunt", "ram");
  assert.equal(state.enemies.ram.hp, 0);
  state = playDirectorCard(state, "skip-step", "t-16-6");
  state = playDirectorCard(state, "firewall", "player");
  assert.equal(getDirectorObjectAction(state, "gate").legal, true);
  state = useDirectorObject(state, "gate");
  assert.equal(state.result, null, "Gate Work must survive the Enemy Turn");
  state = finishEnemyTurn(state);

  assert.equal(state.result.type, "victory");
  assert.equal(state.result.title, "GATE SEALED");
  assert.equal(state.turn, 6);
  assert.ok(state.gate.integrity > 0);
});

test("same seed and choices remain deterministic", () => {
  let left = createDirectorState("DETERMINISTIC-LIVE-CIRCUIT");
  let right = createDirectorState("DETERMINISTIC-LIVE-CIRCUIT");
  for (let turn = 0; turn < 4 && !left.result; turn += 1) {
    left = finishEnemyTurn(left);
    right = finishEnemyTurn(right);
  }
  assert.deepEqual(left, right);

  const changed = playDirectorCard(
    moveDirectorPlayer(left, "t-3-3"),
    "firewall",
    "player",
  );
  const reset = resetDirectorState(changed);
  assert.deepEqual(
    getDirectorBattleSnapshot(reset),
    getDirectorBattleSnapshot(
      createDirectorState("DETERMINISTIC-LIVE-CIRCUIT"),
    ),
  );
});
