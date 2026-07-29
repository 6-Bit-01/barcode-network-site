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
  getDirectorCardTargets,
  getDirectorObjectAction,
  getDirectorReachableTiles,
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
  for (let step = 0; step < 12 && next.phase === "enemy"; step += 1) {
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

test("director cut opens as a compact deterministic battle cockpit", () => {
  const state = createDirectorState("DIRECTOR-CONTRACT");
  assert.equal(
    DIRECTOR_SOURCE,
    "BARCODE_WORLD_FRACTURED_GATE_DIRECTORS_CUT_2026-07-28",
  );
  assert.deepEqual(DIRECTOR_RULES, {
    commandStart: 16,
    commandIncome: 16,
    commandCap: 32,
    moveRange: 4,
    playerHp: 10,
    gateIntegrity: 3,
  });
  assert.deepEqual(Object.keys(DIRECTOR_CARDS), [
    "quick-shot",
    "force-push",
    "dash-strike",
    "guard-pulse",
    "overload",
  ]);
  assert.deepEqual(Object.keys(state.enemies), ["ram", "warden", "jammer"]);
  assert.deepEqual(Object.keys(DIRECTOR_OBJECTS), [
    "anchor-a",
    "anchor-b",
    "cell",
    "gate",
  ]);
  assert.equal(state.command, 16);
  assert.equal(state.phase, "player");
  assert.equal(state.moveAvailable, true);
  assert.equal(state.intents.length, 3);
  assert.equal(new Set(livingPositions(state)).size, 4);
  assert.equal(DIRECTOR_TILES[DIRECTOR_OBJECTS.cell.position].id, "t-5-3");
  assert.equal("paidActionCap" in DIRECTOR_RULES, false);
});

test("the 51-tile floor is connected and ordinary movement is free", () => {
  const ids = Object.keys(DIRECTOR_TILES);
  assert.equal(ids.length, 51);
  const visited = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const tile = DIRECTOR_TILES[queue.shift()];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const neighbor = `t-${tile.x + dx}-${tile.y + dy}`;
      if (DIRECTOR_TILES[neighbor] && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  assert.equal(visited.size, ids.length);

  const opening = createDirectorState();
  const reachable = getDirectorReachableTiles(opening);
  assert.deepEqual(reachable["t-2-1"], {
    cost: 3,
    path: ["t-1-3", "t-2-3", "t-2-2", "t-2-1"],
  });
  assert.equal(reachable["t-4-3"].cost, 4, "rubble costs two");
  const moved = moveDirectorPlayer(opening, "t-2-1");
  assert.equal(moved.command, opening.command);
  assert.equal(moved.moveAvailable, false);
  assert.equal(getDirectorReachableTiles(moved)["t-3-2"], undefined);
});

test("Command pays for cards and objects, banks to 32, and has no action counter", () => {
  let state = createDirectorState();
  state = moveDirectorPlayer(state, "t-2-1");
  state = useDirectorObject(state, "anchor-a");
  state = playDirectorCard(state, "guard-pulse", "player");
  state = playDirectorCard(state, "quick-shot", "jammer");
  assert.equal(state.command, 4);
  assert.equal("paidActions" in state, false);

  state = finishEnemyTurn(state);
  assert.equal(state.command, 20);
  state = finishEnemyTurn(state);
  assert.equal(state.command, 32);
});

test("card previews enforce range and show interrupt speed before execution", () => {
  const opening = createDirectorState();
  const quick = previewDirectorCard(opening, "quick-shot", "ram");
  assert.equal(quick.legal, true);
  assert.equal(quick.interrupts, true);
  assert.equal(quick.relation, "FAST > STANDARD");
  assert.equal(getDirectorCardTargets(opening, "force-push").length, 0);

  const overload = previewDirectorCard(opening, "overload", "cell");
  assert.equal(overload.legal, true);
  assert.deepEqual(overload.victims, ["ram", "warden", "jammer"]);
  assert.equal(overload.relation, "BLAST OVERRIDES INTENT");
  assert.match(overload.summary, /CANCELS INTENTS/);
});

test("the environmental blast is a visible exception that hits and cancels all three intents", () => {
  const opening = createDirectorState();
  const blasted = playDirectorCard(opening, "overload", "cell");
  assert.equal(blasted.command, 8);
  assert.equal(blasted.cell.active, false);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(blasted.enemies).map(([id, enemy]) => [id, enemy.hp]),
    ),
    { ram: 5, warden: 3, jammer: 2 },
  );
  assert.ok(
    blasted.intents.every((intent) => intent.status === "canceled"),
  );
});

test("Power Cell self-damage cannot leave a zero-health player in battle", () => {
  const setup = createDirectorState();
  setup.player.position = "t-4-3";
  setup.player.hp = 2;
  const defeated = playDirectorCard(setup, "overload", "cell");
  assert.equal(defeated.player.hp, 0);
  assert.equal(defeated.phase, "result");
  assert.equal(defeated.result.title, "SIGNAL LOST");
});

test("spatial actions refresh intents and never permit stacked living pieces", () => {
  let state = createDirectorState();
  state.player.position = "t-7-5";
  state.moveAvailable = true;
  state = moveDirectorPlayer(state, "t-8-3");
  assert.equal(
    state.intents.find((intent) => intent.actorId === "ram").name,
    "BODY CHECK",
  );
  state = finishEnemyTurn(state);
  assert.equal(
    new Set(livingPositions(state)).size,
    livingPositions(state).length,
  );
});

test("Force Push reports shield absorption and removes stale melee intent", () => {
  const setup = createDirectorState();
  setup.player.position = "t-4-4";
  setup.enemies.warden.shield = 3;
  setup.intents = planDirectorIntents(setup);
  assert.equal(
    setup.intents.find((intent) => intent.actorId === "warden").name,
    "SHIELD BASH",
  );

  const preview = previewDirectorCard(setup, "force-push", "warden");
  assert.equal(preview.damage, 0);
  assert.equal(preview.shieldAbsorbed, 1);
  const pushed = playDirectorCard(setup, "force-push", "warden");
  assert.equal(pushed.enemies.warden.position, "t-7-4");
  assert.match(pushed.lastEvent.detail, /took 0; 1 absorbed by shield/);
  assert.notEqual(
    pushed.intents.find((intent) => intent.actorId === "warden").name,
    "SHIELD BASH",
  );
});

test("direct attacks preview and apply enemy Shield consistently", () => {
  const setup = createDirectorState();
  setup.enemies.ram.shield = 3;
  const preview = previewDirectorCard(setup, "quick-shot", "ram");
  assert.equal(preview.impact, 2);
  assert.equal(preview.damage, 0);
  assert.equal(preview.shieldAbsorbed, 2);
  assert.match(preview.summary, /0 DMG · 2 SHIELD/);

  const fired = playDirectorCard(setup, "quick-shot", "ram");
  assert.equal(fired.enemies.ram.hp, 9);
  assert.equal(fired.enemies.ram.shield, 1);
});

test("Warden shielding persists into the next Player Turn", () => {
  const completed = finishEnemyTurn(createDirectorState());
  assert.equal(completed.phase, "player");
  assert.equal(completed.enemies.ram.shield, 3);
  const nextEnemyTurn = beginDirectorEnemyTurn(completed);
  assert.equal(nextEnemyTurn.enemies.ram.shield, 0);
});

test("Warden closes a two-tile gap instead of landing a remote Bash", () => {
  let state = createDirectorState();
  state.player.position = "t-3-3";
  state.enemies.ram.hp = 0;
  state.enemies.jammer.hp = 0;
  state.enemies.warden.position = "t-5-3";
  state.intents = planDirectorIntents(state);
  assert.equal(state.intents[0].name, "HUNT");

  state = finishEnemyTurn(state);
  assert.equal(state.player.hp, 10);
  assert.equal(state.enemies.warden.position, "t-4-3");
});

test("killing RAM immediately replaces Warden's obsolete support intent", () => {
  const setup = createDirectorState();
  setup.enemies.ram.hp = 2;
  const disabled = playDirectorCard(setup, "quick-shot", "ram");
  assert.equal(disabled.enemies.ram.hp, 0);
  assert.equal(
    disabled.intents.find((intent) => intent.actorId === "warden").name,
    "HUNT",
  );
});

test("later object use cannot restore an intent already interrupted this turn", () => {
  let state = createDirectorState();
  state.player.position = "t-2-1";
  state = useDirectorObject(state, "anchor-a");
  state = playDirectorCard(state, "quick-shot", "jammer");
  assert.equal(
    state.intents.find((intent) => intent.actorId === "jammer").status,
    "canceled",
  );
  state.player.position = "t-3-4";
  state = useDirectorObject(state, "anchor-b");
  assert.equal(
    state.intents.find((intent) => intent.actorId === "jammer").status,
    "canceled",
  );
});

test("Jammer stops beside an Anchor instead of occupying the device", () => {
  let state = createDirectorState();
  state.player.position = "t-6-6";
  state.enemies.ram.hp = 0;
  state.enemies.warden.hp = 0;
  state.enemies.jammer.position = "t-3-2";
  state.intents = planDirectorIntents(state);

  state = finishEnemyTurn(state);
  assert.equal(state.enemies.jammer.position, "t-3-2");
  assert.notEqual(
    state.enemies.jammer.position,
    DIRECTOR_OBJECTS["anchor-a"].position,
  );
});

test("Warden Eject closes a two-tile gap and actually breaks Gate Work", () => {
  let state = createDirectorState();
  state.anchors["anchor-a"].powered = true;
  state.anchors["anchor-b"].powered = true;
  state.player.position = "t-8-3";
  state.gate.sealing = true;
  state.enemies.ram.hp = 0;
  state.enemies.jammer.hp = 0;
  state.enemies.warden.position = "t-6-3";
  state.intents = planDirectorIntents(state);

  state = finishEnemyTurn(state);
  assert.equal(state.result, null);
  assert.equal(state.gate.sealing, false);
  assert.notEqual(state.player.position, "t-8-3");
  assert.equal(state.lastEvent.text, "SEAL BROKEN");
});

test("Jammer can break the circuit while a clear field produces victory", () => {
  let interrupted = createDirectorState();
  interrupted.anchors["anchor-a"].powered = true;
  interrupted.anchors["anchor-b"].powered = true;
  interrupted.player.position = "t-8-3";
  interrupted.enemies.ram.hp = 0;
  interrupted.enemies.warden.hp = 0;
  interrupted.intents = planDirectorIntents(interrupted);
  interrupted = useDirectorObject(interrupted, "gate");
  interrupted = finishEnemyTurn(interrupted);
  assert.equal(interrupted.result, null);
  assert.equal(interrupted.gate.sealing, false);
  assert.equal(
    Object.values(interrupted.anchors).filter((anchor) => anchor.powered)
      .length,
    1,
  );

  let clear = createDirectorState();
  clear.anchors["anchor-a"].powered = true;
  clear.anchors["anchor-b"].powered = true;
  clear.player.position = "t-8-3";
  for (const enemy of Object.values(clear.enemies)) enemy.hp = 0;
  clear.intents = planDirectorIntents(clear);
  clear = useDirectorObject(clear, "gate");
  assert.equal(clear.gate.sealing, true);
  clear = finishEnemyTurn(clear);
  assert.equal(clear.result.type, "victory");
  assert.equal(clear.result.title, "GATE SEALED");
});

test("doing nothing deterministically loses the Gate after three smashes", () => {
  let left = createDirectorState("WAIT-LOSS");
  let right = createDirectorState("WAIT-LOSS");
  for (let turn = 0; turn < 8 && !left.result; turn += 1) {
    left = finishEnemyTurn(left);
    right = finishEnemyTurn(right);
  }
  assert.equal(left.result.title, "GATE DESTROYED");
  assert.deepEqual(left, right);
});

test("the four-turn environmental route is a complete playable victory", () => {
  let state = createDirectorState("GOLDEN-ROUTE");

  state = playDirectorCard(state, "overload", "cell");
  state = moveDirectorPlayer(state, "t-2-1");
  state = useDirectorObject(state, "anchor-a");
  state = finishEnemyTurn(state);

  state = playDirectorCard(state, "quick-shot", "jammer");
  state = moveDirectorPlayer(state, "t-3-4");
  state = useDirectorObject(state, "anchor-b");
  state = playDirectorCard(state, "dash-strike", "warden");
  state = playDirectorCard(state, "force-push", "warden");
  state = finishEnemyTurn(state);

  state = moveDirectorPlayer(state, "t-7-3");
  state = playDirectorCard(state, "quick-shot", "ram");
  state = playDirectorCard(state, "force-push", "ram");
  state = finishEnemyTurn(state);

  state = moveDirectorPlayer(state, "t-8-3");
  assert.equal(getDirectorObjectAction(state, "gate").legal, true);
  state = useDirectorObject(state, "gate");
  assert.equal(state.result, null, "Gate Work must survive the Enemy Turn");
  state = finishEnemyTurn(state);
  assert.equal(state.result.type, "victory");
  assert.equal(state.turn, 4);
});

test("reset restores the exact opening snapshot and seed", () => {
  const opening = createDirectorState("RESET-DIRECTOR");
  const changed = playDirectorCard(opening, "overload", "cell");
  const reset = resetDirectorState(changed);
  assert.deepEqual(
    getDirectorBattleSnapshot(reset),
    getDirectorBattleSnapshot(createDirectorState("RESET-DIRECTOR")),
  );
});
