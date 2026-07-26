import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILDS,
  CARDS,
  CORE_RULES,
  PROFILES,
  attachCard,
  beginOutskirts,
  canResolvePlans,
  commitApproach,
  createGreyboxState,
  discardCard,
  getImmediateActionGroups,
  inspectApproach,
  lockSeatPlan,
  queueAction,
  resetGreybox,
  resolvePlans,
  selectApproachResult,
  setApproachConfirmation,
  setClaimMode,
  setConsent,
  settleCycle,
} from "../src/lib/barcode-world/engine.mjs";

function enterApproach(
  profileId,
  approachId = "impact-scar",
  resultId = "ordinary",
) {
  let state = createGreyboxState(profileId);
  state = beginOutskirts(state);
  state = inspectApproach(state, approachId);
  state = selectApproachResult(
    state,
    approachId,
    resultId,
    state.seats[0].id,
  );
  for (const seat of state.seats) {
    state = setApproachConfirmation(state, seat.id, true);
  }
  state = commitApproach(state);
  assert.equal(state.stage, "loose-signal");
  return state;
}

function actionsFor(state, seatId, focusId) {
  return getImmediateActionGroups(state, seatId, focusId).flatMap(
    (group) => group.variants,
  );
}

function findAction(state, seatId, focusId, match, label = String(match)) {
  const candidate = actionsFor(state, seatId, focusId).find((action) =>
    typeof match === "function"
      ? match(action)
      : action.id === match || action.baseId === match,
  );
  assert.ok(candidate, `Expected action ${label} for ${seatId} at ${focusId}`);
  return candidate;
}

function queueBy(state, seatId, focusId, match, label) {
  const before = state.seats.find((seat) => seat.id === seatId).plan.length;
  const candidate = findAction(state, seatId, focusId, match, label);
  const next = queueAction(state, seatId, candidate);
  const after = next.seats.find((seat) => seat.id === seatId).plan.length;
  assert.equal(after, before + 1, `Queued ${label ?? candidate.name}`);
  return next;
}

function discardToRetainLimit(state) {
  let next = state;
  for (const seat of next.seats) {
    while (
      next.seats.find((candidate) => candidate.id === seat.id).hand.length >
      CORE_RULES.retainLimit
    ) {
      const current = next.seats.find((candidate) => candidate.id === seat.id);
      next = discardCard(next, seat.id, current.hand[0]);
    }
  }
  return next;
}

function lockResolve(state) {
  let next = discardToRetainLimit(state);
  for (const seat of next.seats) {
    next = lockSeatPlan(next, seat.id);
  }
  assert.equal(canResolvePlans(next), true, next.warnings.at(-1));
  next = resolvePlans(next);
  assert.equal(next.encounter.resolutionComplete, true);
  return next;
}

function runAndSettle(state) {
  const resolved = lockResolve(state);
  return settleCycle(resolved);
}

test("locked source constants expose six ordered solo-safe builds and fixed decks", () => {
  assert.equal(BUILDS.length, 6);
  assert.deepEqual(
    BUILDS.map((build) => build.id),
    [
      "battle-exploration",
      "exploration-battle",
      "battle-hacking",
      "hacking-battle",
      "exploration-hacking",
      "hacking-exploration",
    ],
  );
  for (const build of BUILDS) {
    assert.equal(build.deck.length, 12, `${build.id} deck size`);
    assert.equal(new Set(build.deck).size, 12, `${build.id} deck uniqueness`);
    assert.deepEqual(build.deck.slice(0, 5), [
      "fallback-guard",
      "objective-brace",
      ...build.deck.slice(2, 5),
    ]);
    assert.equal(
      build.deck.some((cardId) => CARDS[cardId]?.partyOnly),
      false,
      `${build.id} solo deck has no party-only card`,
    );
  }
  assert.equal(CORE_RULES.commandStart, 16);
  assert.equal(CORE_RULES.commandIncome, 16);
  assert.equal(CORE_RULES.commandCap, 32);
  assert.equal(CORE_RULES.paidActionCap, 4);
  assert.equal(CORE_RULES.condition, 12);
});

test("Outskirts exact-result gates require the matching Major and unanimous consent", () => {
  let state = createGreyboxState("LS-SOLO-2");
  state = beginOutskirts(state);
  state = inspectApproach(state, "impact-scar");
  const rejected = selectApproachResult(
    state,
    "impact-scar",
    "exact",
    "seat-1",
  );
  assert.equal(rejected.approach.selectedId, null);
  assert.match(rejected.warnings.at(-1), /Battle Major/);

  state = createGreyboxState("LS-SOLO-1");
  state = beginOutskirts(state);
  state = inspectApproach(state, "impact-scar");
  state = selectApproachResult(state, "impact-scar", "exact", "seat-1");
  const blocked = commitApproach(state);
  assert.equal(blocked.stage, "outskirts");
  assert.match(blocked.warnings.at(-1), /must confirm/);
  state = setApproachConfirmation(state, "seat-1", true);
  state = commitApproach(state);
  assert.equal(state.stage, "loose-signal");
  assert.equal(state.encounter.enemies["skimmer-b"].status, "absent");
  assert.equal(state.seats[0].packages[0].id, "counterweight-breaker");
});

test("all six solo builds complete the same conservative core baseline deterministically", () => {
  const observations = [];
  for (const profile of PROFILES.filter((candidate) =>
    candidate.id.startsWith("LS-SOLO-"),
  )) {
    let state = enterApproach(profile.id);
    const seatId = state.seats[0].id;

    state = queueBy(state, seatId, "skimmer-a", "attack");
    state = queueBy(state, seatId, "skimmer-a", "attack");
    state = runAndSettle(state);
    assert.equal(state.encounter.enemies["skimmer-a"].status, "defeated");

    state = queueBy(
      state,
      seatId,
      "entry-shelf",
      (action) =>
        action.baseId === "reposition" &&
        action.destinationId === "broken-lane-lip",
      "Reposition to Broken-Lane Lip",
    );
    state = queueBy(state, seatId, "broken-lane-lip", "stabilize-plate");
    state = runAndSettle(state);
    assert.equal(state.encounter.plate.stabilized, true);
    assert.equal(state.encounter.enemies["skimmer-c"].status, "active");

    state = queueBy(state, seatId, "skimmer-c", "attack");
    state = queueBy(state, seatId, "skimmer-c", "attack");
    state = queueBy(state, seatId, "broken-lane-lip", "cross-plate");
    state = runAndSettle(state);
    assert.equal(state.encounter.enemies["skimmer-c"].status, "defeated");
    assert.equal(state.seats[0].position, "far-platform");

    state = queueBy(state, seatId, "far-platform", "jam-shutter-track");
    state = queueBy(state, seatId, "release-socket", "complete-release");
    state = lockResolve(state);
    state = settleCycle(state);

    assert.equal(state.stage, "segment-settle", profile.id);
    assert.equal(state.encounter.release.validated, true, profile.id);
    assert.equal(
      state.encounter.enteredEnemyIds.every((enemyId) =>
        ["defeated", "disabled", "driven", "bound"].includes(
          state.encounter.enemies[enemyId].status,
        ),
      ),
      true,
      profile.id,
    );
    observations.push({
      profileId: profile.id,
      cycles: state.encounter.cycle,
      condition: state.seats[0].condition,
      command: state.seats[0].command,
    });
  }
  assert.equal(observations.length, 6);
  assert.equal(new Set(observations.map((item) => item.cycles)).size, 1);
});

test("Battle Major can answer a projected Commitment and conditionally spend its Advantage", () => {
  let state = enterApproach(
    "LS-SOLO-1",
    "folded-service-walk",
    "folded",
  );
  state = runAndSettle(state);
  const seatId = "seat-1";
  state = queueBy(state, seatId, "broken-lane-lip", "cross-opening");
  state = queueBy(state, seatId, "skimmer-a", "answer-commitment");
  state = queueBy(state, seatId, "skimmer-a", "convert-drive");
  state = lockResolve(state);
  assert.equal(state.encounter.enemies["skimmer-a"].status, "driven");
  assert.equal(state.seats[0].position, "far-platform");
  assert.equal(state.seats[0].majorState, null);
  assert.ok(
    state.encounter.causalLog.some(
      (event) =>
        event.actionId === "answer-commitment" &&
        event.tags.includes("state-created"),
    ),
  );
});

test("Exploration and Hacking Major state persists across cycles and is owner-spent", () => {
  let exploration = enterApproach(
    "LS-SOLO-2",
    "folded-service-walk",
    "folded",
  );
  exploration = queueBy(
    exploration,
    "seat-1",
    "broken-lane-lip",
    "prepare-route",
  );
  exploration = lockResolve(exploration);
  assert.equal(exploration.seats[0].majorState.type, "prepared-route");
  exploration = settleCycle(exploration);
  exploration = queueBy(
    exploration,
    "seat-1",
    "broken-lane-lip",
    "exploit-route",
  );
  exploration = lockResolve(exploration);
  assert.equal(exploration.seats[0].position, "far-platform");
  assert.equal(exploration.seats[0].majorState, null);

  let hacking = enterApproach("LS-SOLO-4");
  hacking = queueBy(
    hacking,
    "seat-1",
    "entry-shelf",
    (action) =>
      action.baseId === "reposition" &&
      action.destinationId === "shutter-console",
    "Reposition to Shutter Console",
  );
  hacking = runAndSettle(hacking);
  hacking = queueBy(
    hacking,
    "seat-1",
    "shutter-console",
    "establish-control",
  );
  hacking = lockResolve(hacking);
  assert.equal(hacking.seats[0].majorState.type, "temporary-control");
  hacking = settleCycle(hacking);
  hacking = queueBy(
    hacking,
    "seat-1",
    "shutter-console",
    "execute-hold-open",
  );
  hacking = lockResolve(hacking);
  assert.equal(hacking.encounter.shutter.state, "controlled-open");
  assert.equal(hacking.seats[0].majorState, null);
});

test("contextual browser keeps every legal variant under at most four immediate roots", () => {
  const state = enterApproach(
    "LS-SOLO-1",
    "folded-service-walk",
    "folded",
  );
  for (const focusId of [
    "skimmer-a",
    "frontier-marker",
    "broken-lane-lip",
    "far-platform",
    "release-socket",
    "relay-cache",
    "seat-1",
  ]) {
    const groups = getImmediateActionGroups(state, "seat-1", focusId);
    assert.ok(groups.length <= CORE_RULES.normalImmediateChoices, focusId);
    assert.equal(
      groups.every((group) => group.variants.length > 0),
      true,
      focusId,
    );
  }
});

test("all supported local duo, trio, duplicate, and rescue fixtures start and resolve deterministic concurrency", () => {
  const localProfiles = PROFILES.filter((profile) =>
    profile.mode.startsWith("local-"),
  );
  assert.deepEqual(
    localProfiles.map((profile) => profile.id),
    [
      "LS-DUO-MIXED",
      "LS-TRIO-MIXED",
      "LS-TRIO-DUP-EB",
      "LS-DUO-DUP-HB",
      "LS-RESCUE-GREEDY",
    ],
  );
  for (const profile of localProfiles) {
    let state = enterApproach(profile.id);
    state = lockResolve(state);
    assert.equal(state.encounter.resolutionComplete, true, profile.id);
    assert.equal(
      state.encounter.causalLog.some((event) => event.actor === "skimmer-c"),
      profile.mode === "local-trio",
      `${profile.id} immediate reinforcement concurrency`,
    );
    state = settleCycle(state);
    assert.equal(state.encounter.cycle, 2, profile.id);
  }
});

test("Command banks to 32, retain limit blocks lock, and four paid slots remain personal", () => {
  let state = enterApproach(
    "LS-SOLO-1",
    "folded-service-walk",
    "folded",
  );
  state = runAndSettle(state);
  assert.equal(state.seats[0].command, 32);

  state = queueBy(state, "seat-1", "broken-lane-lip", "cross-opening");
  state = queueBy(state, "seat-1", "skimmer-a", "answer-commitment");
  state = queueBy(state, "seat-1", "skimmer-a", "convert-drive");
  state = queueBy(state, "seat-1", "seat-1", "guard");
  const before = state.seats[0].plan.length;
  const fifth = findAction(state, "seat-1", "skimmer-a", "scan");
  const rejected = queueAction(state, "seat-1", fifth);
  assert.equal(rejected.seats[0].plan.length, before);
  assert.match(rejected.warnings.at(-1), /four paid action slots/);

  state = lockResolve(state);
  state = settleCycle(state);
  assert.ok(state.seats[0].hand.length > CORE_RULES.retainLimit);
  const blockedLock = lockSeatPlan(state, "seat-1");
  assert.equal(blockedLock.seats[0].locked, false);
  assert.match(blockedLock.warnings.at(-1), /discard to 7/);
});

test("equal-time unlinked movement that exceeds capacity fails for every mover", () => {
  let state = enterApproach("LS-DUO-MIXED");
  for (const seat of state.seats) {
    state = queueBy(
      state,
      seat.id,
      "entry-shelf",
      (action) =>
        action.baseId === "reposition" &&
        action.destinationId === "shutter-console",
      `${seat.id} to Shutter Console`,
    );
  }
  state = lockResolve(state);
  assert.deepEqual(
    state.seats.map((seat) => seat.position),
    ["entry-shelf", "entry-shelf"],
  );
  assert.equal(
    state.encounter.causalLog.filter((event) =>
      event.tags.includes("capacity-conflict"),
    ).length,
    2,
  );
});

test("exclusive claim conflicts block resolution until one owner yields priority", () => {
  let state = enterApproach("LS-DUO-DUP-HB");
  state.seats.forEach((seat) => {
    seat.position = "far-platform";
  });
  state = queueBy(
    state,
    "seat-1",
    "far-platform",
    "establish-control",
  );
  state = queueBy(
    state,
    "seat-2",
    "far-platform",
    "establish-control",
  );
  state = lockSeatPlan(state, "seat-1");
  state = lockSeatPlan(state, "seat-2");
  assert.equal(canResolvePlans(state), false);

  state.seats.forEach((seat) => {
    seat.locked = false;
  });
  const secondAction = state.seats[1].plan[0];
  state = setClaimMode(
    state,
    "seat-2",
    secondAction.instanceId,
    "If Available",
  );
  state = lockSeatPlan(state, "seat-1");
  state = lockSeatPlan(state, "seat-2");
  assert.equal(canResolvePlans(state), true);
  state = resolvePlans(state);
  assert.equal(state.seats[0].majorState?.type, "temporary-control");
  assert.equal(state.seats[1].majorState, null);
});

test("ally effects require the recipient's explicit consent", () => {
  let state = enterApproach("LS-DUO-MIXED");
  state = queueBy(state, "seat-1", "seat-2", "guard");
  const action = state.seats[0].plan[0];
  let blocked = lockSeatPlan(state, "seat-1");
  assert.equal(blocked.seats[0].locked, false);
  assert.match(blocked.warnings.at(-1), /needs consent/);

  state = setConsent(state, "seat-2", action.instanceId, true);
  state = lockSeatPlan(state, "seat-1");
  state = lockSeatPlan(state, "seat-2");
  assert.equal(canResolvePlans(state), true);
});

test("Fallback Guard distinguishes invalidation before begin from ordinary failure", () => {
  let state = enterApproach(
    "LS-SOLO-1",
    "folded-service-walk",
    "folded",
  );
  state.seats[0].command = 32;
  state.seats[0].activeWeaponId = "breaker";
  state.seats[0].majorState = {
    type: "battle-advantage",
    name: "Battle Advantage",
    ownerSeatId: "seat-1",
    targetId: "skimmer-a",
    status: "active",
  };
  state = queueBy(state, "seat-1", "skimmer-a", "convert-drive");
  state = queueBy(state, "seat-1", "skimmer-a", "attack");
  const attack = state.seats[0].plan.find(
    (action) => action.baseId === "attack",
  );
  state = attachCard(state, "seat-1", attack.instanceId, "fallback-guard");
  state = lockResolve(state);
  assert.equal(
    state.resolution.results[attack.instanceId].status,
    "invalidated_before_begin",
  );
  assert.equal(state.encounter.refundsPending["seat-1"], 3);
  assert.equal(state.seats[0].temporaryGuard, 3);
  assert.equal(state.seats[0].flags.braced, true);
});

test("release Work remains blocked while any entered threat is active", () => {
  let state = enterApproach("LS-SOLO-1");
  state.seats[0].position = "far-platform";
  state.encounter.shutter.state = "jammed-open";
  state = queueBy(
    state,
    "seat-1",
    "release-socket",
    "complete-release",
  );
  state = runAndSettle(state);
  assert.equal(state.stage, "loose-signal");
  assert.equal(state.encounter.release.validated, false);
  assert.match(
    state.encounter.release.blockedReason,
    /hostile pressure remains active/,
  );
  assert.equal(
    state.sourceMismatches.some(
      (item) => item.id === "LS-FULL-CLEAR-VS-DUO-EXPECTED",
    ),
    true,
  );
});

test("Expose Cache can causally unlock same-cycle Relay Needle recovery", () => {
  let state = enterApproach("LS-DUO-MIXED");
  state.seats.forEach((seat) => {
    seat.position = "far-platform";
  });
  state.seats[1].majorState = {
    type: "temporary-control",
    name: "Temporary Control",
    ownerSeatId: "seat-2",
    dependencyId: "shutter-dependency",
    status: "active",
  };
  state.encounter.shutter.controlledBySeatId = "seat-2";
  state = queueBy(
    state,
    "seat-2",
    "relay-cache",
    "execute-expose-cache",
  );
  state = queueBy(
    state,
    "seat-1",
    "relay-cache",
    "recover-relay-cache",
  );
  state = lockResolve(state);
  assert.equal(state.encounter.cache.exposed, true);
  assert.equal(state.encounter.cache.recovered, true);
  assert.equal(
    state.seats[0].packages.some((item) => item.id === "relay-needle"),
    true,
  );
});

test("Compromised rescue and opened-Threshold extraction preserve personal ownership", () => {
  let rescue = enterApproach("LS-DUO-MIXED");
  rescue.seats[1].condition = 0;
  rescue.seats[1].guard = 0;
  rescue.seats[1].compromised = true;
  rescue.seats[1].rescueSettlesRemaining = 2;
  rescue = queueBy(rescue, "seat-1", "seat-2", "stabilize");
  const rescueAction = rescue.seats[0].plan[0];
  rescue = setConsent(rescue, "seat-2", rescueAction.instanceId, true);
  rescue = lockResolve(rescue);
  assert.equal(rescue.seats[1].compromised, false);
  assert.equal(rescue.seats[1].condition, 4);
  assert.equal(rescue.seats[1].disruption, 1);

  let extraction = enterApproach("LS-SOLO-1");
  extraction.seats[0].position = "threshold";
  extraction.encounter.release.thresholdOpen = true;
  extraction.encounter.release.validated = true;
  extraction = queueBy(
    extraction,
    "seat-1",
    "threshold",
    "standard-extract",
  );
  extraction = lockResolve(extraction);
  assert.equal(extraction.seats[0].flags.extracted, true);
  assert.equal(extraction.seats[0].packages[0].ownerSeatId, "seat-1");
});

test("reset restores the selected deterministic profile without persistence", () => {
  let state = enterApproach("LS-TRIO-MIXED");
  state.seats[0].command = 1;
  state.seats[0].condition = 2;
  state = resetGreybox(state);
  assert.equal(state.stage, "preparation");
  assert.equal(state.encounter, null);
  assert.equal(state.profileId, "LS-TRIO-MIXED");
  assert.deepEqual(
    state.seats.map((seat) => [seat.command, seat.condition, seat.plan.length]),
    [
      [16, 12, 0],
      [16, 12, 0],
      [16, 12, 0],
    ],
  );
  assert.equal(state.evidence.at(-1).type, "reset");
});
