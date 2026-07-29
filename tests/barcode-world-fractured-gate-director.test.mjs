import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTOR_BUILD,
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
  getDirectorContextAction,
  getDirectorObjectAction,
  getDirectorReachableTiles,
  getDirectorReaction,
  getDirectorScreenPosition,
  getDirectorTilePolygon,
  hasDirectorLineOfSight,
  moveDirectorPlayer,
  planDirectorIntents,
  playDirectorCard,
  previewDirectorCard,
  resetDirectorState,
  resolveDirectorReaction,
  useDirectorContextAction,
  useDirectorObject,
} from "../src/lib/barcode-world/fractured-gate-director-engine.mjs";

function finishEnemyTurn(state, reactionChoice = "decline") {
  let next =
    state.phase === "player" ? beginDirectorEnemyTurn(state) : state;
  for (
    let step = 0;
    step < 16 && ["enemy", "reaction"].includes(next.phase);
    step += 1
  ) {
    next =
      next.phase === "reaction"
        ? resolveDirectorReaction(next, reactionChoice)
        : advanceDirectorEnemyTurn(next);
  }
  assert.equal(
    ["enemy", "reaction"].includes(next.phase),
    false,
    "enemy commitment must terminate",
  );
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

test("Breachflow keeps the dense board while replacing bookkeeping with a simple turn surface", () => {
  const state = createDirectorState("BREACHFLOW-CONTRACT");
  assert.equal(
    DIRECTOR_SOURCE,
    "BARCODE_WORLD_FRACTURED_GATE_LIVE_CIRCUIT_BREACHFLOW_2026-07-29",
  );
  assert.deepEqual(DIRECTOR_BUILD, {
    id: "battle-exploration",
    name: "BATTLE → EXPLORATION",
    major: "BATTLE",
    minor: "EXPLORATION",
    grammar: "IMPACT CREATES OPENINGS · OPENINGS BECOME ROUTES",
  });
  assert.equal(DIRECTOR_RULES.movementPerTurn, 6);
  assert.equal(DIRECTOR_RULES.actionsPerTurn, 2);
  assert.equal(DIRECTOR_RULES.reactionRange, 4);
  assert.equal("commandStart" in DIRECTOR_RULES, false);
  assert.equal("command" in state, false);
  assert.equal("moveAvailable" in state, false);
  assert.equal(state.movementRemaining, 6);
  assert.equal(state.actionsRemaining, 2);
  assert.ok(Object.keys(DIRECTOR_TILES).length >= 145);
  assert.deepEqual(Object.keys(DIRECTOR_CARDS), [
    "bitcrush",
    "shunt",
    "skip-step",
    "firewall",
    "overload",
  ]);
  assert.equal(DIRECTOR_CARDS.shunt.source, "BATTLE");
  assert.equal(DIRECTOR_CARDS.shunt.shape, "CONTACT");
  assert.equal(DIRECTOR_CARDS.shunt.range, 1);
  assert.equal(DIRECTOR_CARDS["skip-step"].source, "EXPLORATION");
  assert.equal(DIRECTOR_CARDS["skip-step"].shape, "SHIFT");
  assert.equal(state.intents.length, 2);
  assert.deepEqual(
    new Set(state.intents.map((intent) => intent.priority)),
    new Set(["primary", "support"]),
  );
  assert.equal(new Set(livingPositions(state)).size, 5);
});

test("edge-sharing projection creates a continuous SVG grid", () => {
  const left = polygonPoints("t-1-6");
  const right = polygonPoints("t-2-6");
  assert.ok(
    Math.abs(left[1][0] - right[0][0]) < Number.EPSILON &&
      Math.abs(left[1][1] - right[0][1]) < 1e-12,
  );
  assert.ok(
    Math.abs(left[2][0] - right[3][0]) < Number.EPSILON &&
      Math.abs(left[2][1] - right[3][1]) < 1e-12,
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

test("the ordinary walkable floor remains connected without either optional Anchor", () => {
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

test("movement splits before, between, and after the two main actions", () => {
  let state = createDirectorState();
  state = moveDirectorPlayer(state, "t-3-3");
  assert.equal(state.movementRemaining, 1);
  assert.ok(getDirectorReachableTiles(state)["t-4-3"]);

  state = playDirectorCard(state, "firewall", "player");
  assert.equal(state.actionsRemaining, 1);
  assert.equal(state.movementRemaining, 1);
  assert.ok(getDirectorReachableTiles(state)["t-4-3"]);

  state = moveDirectorPlayer(state, "t-4-3");
  assert.equal(state.movementRemaining, 0);
  assert.equal(state.actionsRemaining, 1);

  state = playDirectorCard(state, "skip-step", "t-5-3");
  assert.equal(state.actionsRemaining, 0);
  assert.equal(state.player.position, "t-5-3");
  assert.equal(getDirectorReachableTiles(state)["t-5-4"], undefined);
});

test("racks, rubble, cover, and high ground remain real rules under the simple surface", () => {
  const state = createDirectorState();
  assert.equal(DIRECTOR_TILES["t-4-5"].walkable, false);
  assert.equal(
    hasDirectorLineOfSight(state, "t-3-5", "t-5-5"),
    false,
  );
  assert.equal(getDirectorReachableTiles(state)["t-3-5"].cost, 4);

  let covered = disableEnemiesExcept(createDirectorState(), "sniper");
  covered.turn = 3;
  covered.player.position = "t-5-5";
  covered.player.cover = DIRECTOR_TILES[covered.player.position].cover;
  covered.enemies.sniper.position = "t-5-2";
  covered.intents = planDirectorIntents(covered);
  covered = finishEnemyTurn(covered);
  assert.equal(covered.player.hp, covered.player.maxHp);

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

test("the optional Anchors create distinct shortcuts without gating the mission", () => {
  const bridge = createDirectorState();
  bridge.player.position = "t-5-3";
  bridge.movementRemaining = 6;
  assert.equal(getDirectorReachableTiles(bridge)["t-6-3"], undefined);
  const bridgeOnline = useDirectorObject(bridge, "anchor-a");
  assert.equal(bridgeOnline.actionsRemaining, 1);
  assert.ok(getDirectorReachableTiles(bridgeOnline)["t-6-3"]);
  assert.ok(getDirectorReachableTiles(bridgeOnline)["t-9-3"].cost < 6);

  const coldTrack = createDirectorState();
  coldTrack.player.position = "t-7-9";
  coldTrack.movementRemaining = 6;
  const coldCost = getDirectorReachableTiles(coldTrack)["t-11-10"].cost;
  const liveTrack = createDirectorState();
  liveTrack.anchors["anchor-b"].powered = true;
  liveTrack.player.position = "t-7-9";
  liveTrack.movementRemaining = 6;
  const liveCost = getDirectorReachableTiles(liveTrack)["t-11-10"].cost;
  assert.ok(liveCost < coldCost);

  const directGate = createDirectorState();
  directGate.player.position = "t-16-6";
  assert.equal(getDirectorObjectAction(directGate, "gate").legal, true);
  assert.equal(
    Object.values(directGate.anchors).some((anchor) => anchor.powered),
    false,
  );
});

test("two action lights replace costs, caps, banking, and end-turn arithmetic", () => {
  let state = createDirectorState();
  assert.equal(getDirectorCardCost(state, "firewall"), 1);
  state = playDirectorCard(state, "firewall", "player");
  state = playDirectorCard(state, "skip-step", "t-2-6");
  assert.equal(state.actionsRemaining, 0);
  assert.equal(
    previewDirectorCard(state, "bitcrush", "ram").summary,
    "TWO ACTIONS SPENT",
  );
  const retreat = createDirectorState();
  retreat.player.position = "t-1-6";
  assert.equal(getDirectorObjectAction(retreat, "exit").legal, true);
  assert.equal(getDirectorObjectAction(retreat, "exit").actionCost, 0);

  state = finishEnemyTurn(state);
  assert.equal(state.actionsRemaining, 2);
  assert.equal(state.movementRemaining, 6);
  assert.equal("command" in state, false);
});

test("Battle impact can create a source-bound Exploration payoff", () => {
  let state = createDirectorState("BREACHFLOW-CHAIN");
  state.player.position = "t-12-6";
  state.enemies.ram.position = "t-13-6";
  state.divider.intact = true;
  state.intents = planDirectorIntents(state);

  const preview = previewDirectorCard(state, "shunt", "ram");
  assert.equal(preview.legal, true);
  assert.equal(preview.push.divider, true);
  assert.deepEqual(preview.footprint, [
    "t-13-6",
    "t-14-6",
    "t-15-6",
  ]);

  state = playDirectorCard(state, "shunt", "ram");
  assert.equal(state.divider.intact, false);
  assert.equal(state.enemies.ram.position, "t-15-6");
  assert.equal(state.actionsRemaining, 1);
  const context = getDirectorContextAction(state);
  assert.equal(context.label, "RIDE THE BREACH");
  assert.equal(context.destination, "t-14-6");

  const movementBefore = state.movementRemaining;
  state = useDirectorContextAction(state);
  assert.equal(state.player.position, "t-14-6");
  assert.equal(state.actionsRemaining, 1);
  assert.equal(state.movementRemaining, movementBefore);
  assert.equal(getDirectorContextAction(state), null);
});

test("a generic system blast opens geometry but does not counterfeit the build chain", () => {
  let state = createDirectorState();
  state.player.position = "t-12-6";
  state.intents = planDirectorIntents(state);
  state = playDirectorCard(state, "overload", "divider");
  assert.equal(state.divider.intact, false);
  assert.equal(getDirectorContextAction(state), null);
});

test("Shunt keeps powered-track and ledge consequences visually causal", () => {
  const track = createDirectorState();
  track.anchors["anchor-b"].powered = true;
  track.player.position = "t-7-10";
  track.enemies.ram.position = "t-8-10";
  track.enemies.jammer.hp = 0;
  track.intents = planDirectorIntents(track);
  const preview = previewDirectorCard(track, "shunt", "ram");
  assert.equal(preview.push.track, true);
  assert.match(preview.summary, /ARC STUN/);
  const stunned = playDirectorCard(track, "shunt", "ram");
  assert.equal(stunned.enemies.ram.stunned, true);
  const followThrough = getDirectorContextAction(stunned);
  assert.equal(followThrough.label, "FOLLOW THROUGH");
  assert.equal(followThrough.destination, "t-8-10");
  const followed = useDirectorContextAction(stunned);
  assert.equal(followed.player.position, "t-8-10");
  assert.equal(followed.actionsRemaining, stunned.actionsRemaining);
  assert.equal(followed.movementRemaining, stunned.movementRemaining);

  const expired = beginDirectorEnemyTurn(stunned);
  assert.equal(expired.contextAction.available, false);
  assert.equal(expired.contextAction.expired, true);

  const ledge = createDirectorState();
  ledge.player.position = "t-9-1";
  ledge.enemies.ram.position = "t-9-2";
  ledge.intents = planDirectorIntents(ledge);
  assert.equal(
    previewDirectorCard(ledge, "shunt", "ram").push.ledge,
    true,
  );
});

test("the Power Cell remains local and its complete footprint is previewed", () => {
  const opening = createDirectorState();
  assert.equal(
    getDirectorCardTargets(opening, "overload").includes("cell"),
    false,
  );

  const setup = createDirectorState();
  setup.player.position = "t-8-4";
  setup.enemies.jammer.position = "t-9-6";
  setup.enemies.sniper.position = "t-8-8";
  setup.intents = planDirectorIntents(setup);
  const preview = previewDirectorCard(setup, "overload", "cell");
  assert.equal(preview.legal, true);
  assert.equal(preview.selfDamage, 2);
  assert.ok(preview.footprint.length > 1);
  assert.deepEqual(new Set(preview.victims), new Set(["jammer", "sniper"]));

  const blasted = playDirectorCard(setup, "overload", "cell");
  assert.equal(blasted.cell.active, false);
  assert.equal(
    blasted.divider.intact,
    true,
    "the relocated Gate Divider is outside the local blast",
  );
  assert.equal(blasted.enemies.ram.hp, setup.enemies.ram.hp);
  assert.equal(blasted.enemies.warden.hp, setup.enemies.warden.hp);
});

test("only one primary commitment and one rotating support action resolve", () => {
  const supports = [];
  for (const turn of [1, 2, 3]) {
    const state = createDirectorState();
    state.turn = turn;
    state.intents = planDirectorIntents(state);
    assert.equal(state.intents.length, 2);
    assert.equal(
      state.intents.filter((intent) => intent.priority === "primary").length,
      1,
    );
    assert.equal(
      state.intents.filter((intent) => intent.priority === "support").length,
      1,
    );
    supports.push(
      state.intents.find((intent) => intent.priority === "support").actorId,
    );
  }
  assert.deepEqual(supports, ["warden", "jammer", "sniper"]);

  const opening = createDirectorState();
  const before = Object.fromEntries(
    Object.entries(opening.enemies).map(([id, enemy]) => [id, enemy.position]),
  );
  const after = finishEnemyTurn(opening);
  const moved = Object.entries(after.enemies).filter(
    ([id, enemy]) => enemy.position !== before[id],
  );
  assert.ok(moved.length >= 1);
  assert.ok(moved.length <= 2);
});

test("Broadcast Sweep marks one lane and rewards leaving it before End Turn", () => {
  const caught = createDirectorState();
  caught.turn = 2;
  caught.player.position = "t-5-6";
  caught.player.cover = 0;
  caught.intents = planDirectorIntents(caught);
  const caughtSweep = caught.intents.find(
    (intent) => intent.name === "BROADCAST SWEEP",
  );
  assert.equal(caughtSweep.affectedLane, "yard");
  assert.ok(caughtSweep.affectedTiles.length > 20);
  const caughtResult = finishEnemyTurn(caught);
  assert.equal(caughtResult.player.hp, caught.player.hp - 2);

  const escaped = createDirectorState();
  escaped.turn = 2;
  escaped.player.position = "t-5-2";
  escaped.player.cover = 0;
  escaped.intents = planDirectorIntents(escaped);
  const escapedResult = finishEnemyTurn(escaped);
  assert.equal(escapedResult.player.hp, escaped.player.hp);
});

test("the automatic Intercept window pauses a primary threat without a resource calculation", () => {
  let state = createDirectorState();
  state.divider.intact = false;
  state.player.position = "t-16-6";
  state.gate.sealing = true;
  state.enemies.warden.position = "t-14-6";
  state.intents = planDirectorIntents(state);
  state = beginDirectorEnemyTurn(state);
  while (state.phase === "enemy" && !state.result) {
    state = advanceDirectorEnemyTurn(state);
  }
  assert.equal(state.phase, "reaction");
  const reaction = getDirectorReaction(state);
  assert.equal(reaction.label, "INTERCEPT");
  assert.equal(reaction.actorId, "warden");
  assert.equal(reaction.interceptEffect, "STOP IT · TAKE 1 HIT");
  assert.equal(reaction.declineEffect, "YOU TAKE THE PUSH");

  const actionsBefore = state.actionsRemaining;
  state = resolveDirectorReaction(state, "intercept");
  assert.equal(state.actionsRemaining, actionsBefore);
  assert.equal(
    state.intents.find((intent) => intent.actorId === "warden").status,
    "canceled",
  );
  state = advanceDirectorEnemyTurn(state);
  assert.equal(state.result.type, "victory");
});

test("passing the response lets Warden eject an unguarded Gate holder", () => {
  let state = createDirectorState();
  state.divider.intact = false;
  state.player.position = "t-16-6";
  state.gate.sealing = true;
  state.enemies.warden.position = "t-14-6";
  state.intents = planDirectorIntents(state);
  state = beginDirectorEnemyTurn(state);
  while (state.phase === "enemy") {
    state = advanceDirectorEnemyTurn(state);
  }
  assert.equal(state.phase, "reaction");
  state = resolveDirectorReaction(state, "decline");
  state = advanceDirectorEnemyTurn(state);
  assert.equal(state.result, null);
  assert.equal(state.gate.sealing, false);
  assert.notEqual(state.player.position, "t-16-6");
});

test("Jammer can visibly block Shift and the automatic response", () => {
  let state = createDirectorState();
  state.turn = 2;
  state.divider.intact = false;
  state.player.position = "t-14-6";
  state.enemies.jammer.position = "t-12-6";
  state.enemies.ram.position = "t-16-6";
  state.intents = planDirectorIntents(state);
  assert.equal(
    state.intents.find((intent) => intent.actorId === "jammer").name,
    "STATIC FIELD",
  );
  state = beginDirectorEnemyTurn(state);
  state = advanceDirectorEnemyTurn(state);
  assert.equal(state.player.jammed, true);
  assert.equal(state.phase, "enemy");
  assert.equal(getDirectorReaction(state), null);

  state.phase = "player";
  state.actionsRemaining = 2;
  assert.equal(getDirectorCardTargets(state, "skip-step").length, 0);
  assert.equal(
    previewDirectorCard(state, "skip-step", "t-13-6").summary,
    "STATIC FIELD BLOCKS SHIFT",
  );
});

test("Gate lock no longer requires Anchors, but it still must survive the assault", () => {
  let safe = createDirectorState();
  for (const enemy of Object.values(safe.enemies)) enemy.hp = 0;
  safe.player.position = "t-16-6";
  safe.intents = planDirectorIntents(safe);
  safe = useDirectorObject(safe, "gate");
  assert.equal(safe.gate.sealing, true);
  assert.equal(safe.actionsRemaining, 1);
  safe = finishEnemyTurn(safe);
  assert.equal(safe.result.type, "victory");
  assert.equal(
    Object.values(safe.anchors).some((anchor) => anchor.powered),
    false,
  );

  const guarded = createDirectorState();
  guarded.divider.intact = false;
  guarded.player.position = "t-16-6";
  guarded.player.braced = true;
  guarded.player.shield = 4;
  guarded.gate.sealing = true;
  guarded.enemies.ram.hp = 0;
  guarded.enemies.jammer.hp = 0;
  guarded.enemies.sniper.hp = 0;
  guarded.enemies.warden.position = "t-14-6";
  guarded.intents = planDirectorIntents(guarded);
  const guardedResult = finishEnemyTurn(guarded, "decline");
  assert.equal(guardedResult.result.type, "victory");
});

test("RAM can still destroy an ignored Gate", () => {
  const state = disableEnemiesExcept(createDirectorState(), "ram");
  state.gate.integrity = 1;
  state.enemies.ram.position = "t-16-6";
  state.intents = planDirectorIntents(state);
  const lost = finishEnemyTurn(state, "decline");
  assert.equal(lost.result.type, "defeat");
  assert.equal(lost.result.title, "GATE DESTROYED");
});

test("Cache and West Exit remain meaningful optional result branches", () => {
  const retreat = createDirectorState();
  assert.equal(getDirectorObjectAction(retreat, "exit").legal, true);
  const left = useDirectorObject(retreat, "exit");
  assert.equal(left.result.title, "CONTROLLED RETREAT");

  const cache = createDirectorState();
  cache.player.position = DIRECTOR_OBJECTS.cache.position;
  cache.player.hp = 8;
  const recovered = useDirectorObject(cache, "cache");
  assert.equal(recovered.cache.carried, true);
  assert.equal(recovered.player.hp, 10);
  assert.equal(recovered.actionsRemaining, 1);
});

test("same seed and choices remain deterministic", () => {
  let left = createDirectorState("DETERMINISTIC-BREACHFLOW");
  let right = createDirectorState("DETERMINISTIC-BREACHFLOW");
  for (let turn = 0; turn < 4 && !left.result; turn += 1) {
    left = finishEnemyTurn(left, "decline");
    right = finishEnemyTurn(right, "decline");
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
      createDirectorState("DETERMINISTIC-BREACHFLOW"),
    ),
  );
});

test("randomized battles preserve action, movement, occupancy, and termination invariants", () => {
  let random = 0x6b17f4a1;
  const nextRandom = () => {
    random = (random * 1664525 + 1013904223) >>> 0;
    return random / 2 ** 32;
  };

  for (let battle = 0; battle < 250; battle += 1) {
    let state = createDirectorState(`FUZZ-${battle}`);
    for (let turn = 0; turn < 10 && !state.result; turn += 1) {
      for (
        let choice = 0;
        choice < 8 && state.phase === "player" && !state.result;
        choice += 1
      ) {
        const candidates = [];
        const reachable = Object.keys(getDirectorReachableTiles(state));
        if (reachable.length) {
          candidates.push(() => {
            const target =
              reachable[Math.floor(nextRandom() * reachable.length)];
            state = moveDirectorPlayer(state, target);
          });
        }
        for (const cardId of Object.keys(DIRECTOR_CARDS)) {
          const targets = getDirectorCardTargets(state, cardId);
          if (!targets.length) continue;
          candidates.push(() => {
            const target =
              targets[Math.floor(nextRandom() * targets.length)];
            state = playDirectorCard(state, cardId, target);
          });
        }
        const context = getDirectorContextAction(state);
        if (context?.legal) {
          candidates.push(() => {
            state = useDirectorContextAction(state);
          });
        }
        for (const objectId of Object.keys(DIRECTOR_OBJECTS)) {
          if (objectId === "exit") continue;
          if (getDirectorObjectAction(state, objectId)?.legal) {
            candidates.push(() => {
              state = useDirectorObject(state, objectId);
            });
          }
        }
        if (!candidates.length || nextRandom() < 0.22) break;
        candidates[Math.floor(nextRandom() * candidates.length)]();
        assert.ok(state.actionsRemaining >= 0);
        assert.ok(state.actionsRemaining <= DIRECTOR_RULES.actionsPerTurn);
        assert.ok(state.movementRemaining >= 0);
        assert.ok(
          state.movementRemaining <= DIRECTOR_RULES.movementPerTurn,
        );
        assert.equal(new Set(livingPositions(state)).size, livingPositions(state).length);
      }
      if (!state.result) {
        state = finishEnemyTurn(
          state,
          nextRandom() < 0.5 ? "intercept" : "decline",
        );
      }
      assert.equal(new Set(livingPositions(state)).size, livingPositions(state).length);
      assert.equal("command" in state, false);
    }
  }
});
