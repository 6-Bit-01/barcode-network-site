import {
  APPROACHES,
  ARMOR,
  BUILDS,
  CARDS,
  CORE_RULES,
  DISCIPLINES,
  LOADOUTS,
  ORDINARY_EDGES,
  POSITIONS,
  PROFILES,
  RIGS,
  SOURCE_REVISION,
  SPECIAL_EDGE,
  WEAPONS,
  getBuild,
  getProfile,
} from "./constants.mjs";

const LANE_RANK = { Fast: 0, Standard: 1, Slow: 2 };
const ENTERED_CLEAR_STATUSES = new Set(["defeated", "disabled", "driven", "bound"]);
const SYSTEM_ACTION_IDS = new Set([
  "manual-shutter-release",
  "jam-shutter-track",
  "complete-release",
  "recover-relay-cache",
  "basic-interface",
  "establish-control",
  "execute-hold-open",
  "execute-expose-cache",
  "execute-blind-repeater",
]);
const CROSSING_ACTION_IDS = new Set([
  "cross-opening",
  "cross-plate",
  "follow-route",
  "exploit-route",
  "backtrack",
]);
const PAID_REPEAT_LIMIT_IDS = new Set([
  "attack",
  "guard",
  "additional-movement",
  "scan",
  "basic-interface",
  "work-objective",
  "assist",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushEvidence(state, type, detail = {}) {
  state.evidence.push({
    sequence: state.evidence.length + 1,
    type,
    stage: state.stage,
    cycle: state.encounter?.cycle ?? 0,
    ...detail,
  });
}

function buildSeat(profileSeat, index) {
  const build = getBuild(profileSeat.build) ?? BUILDS[0];
  const loadout = LOADOUTS[profileSeat.loadout] ?? LOADOUTS.A;
  const armor = ARMOR[loadout.armor];
  return {
    id: profileSeat.id || `seat-${index + 1}`,
    label: `Seat ${index + 1}`,
    buildId: build.id,
    loadoutId: loadout.id,
    primaryPriority: profileSeat.primaryPriority ?? "Complete",
    secondaryPriority: profileSeat.secondaryPriority ?? "Survey",
    activeWeaponId: loadout.activeWeapon,
    reserveWeaponId: loadout.reserveWeapon,
    armorId: loadout.armor,
    rigId: loadout.rig,
    command: CORE_RULES.commandStart,
    condition: CORE_RULES.condition,
    guard: armor.guardCap,
    temporaryGuard: 0,
    disruption: 0,
    position: "entry-shelf",
    majorState: null,
    packages: [],
    hand: build.deck.slice(0, CORE_RULES.openingHand),
    deck: [...build.deck],
    drawIndex: CORE_RULES.openingHand,
    discard: [],
    committedCards: [],
    plan: [],
    locked: false,
    lockError: "",
    focusId: "entry-shelf",
    compromised: false,
    rescueSettlesRemaining: null,
    fieldPatchUsed: false,
    scanUsed: false,
    insulatedShellUsed: false,
    recoveryMeshUsed: false,
    difficultTerrainIgnored: false,
    forceResistance: armor.forceResistance ?? 0,
    flags: {},
  };
}

export function createGreyboxState(profileId = PROFILES[0].id) {
  const profile = getProfile(profileId);
  const seats = profile.seats.map(buildSeat);
  const state = {
    sourceRevision: SOURCE_REVISION,
    profileId: profile.id,
    profileName: profile.name,
    profileMode: profile.mode,
    expectedPaperResult: clone(profile.expected ?? null),
    stage: "preparation",
    stageLabel: "Home preparation",
    seats,
    activeSeatId: seats[0].id,
    approach: {
      inspected: [],
      selectedId: null,
      resultId: null,
      resolverSeatId: seats[0].id,
      confirmations: Object.fromEntries(seats.map((seat) => [seat.id, false])),
      committed: false,
    },
    encounter: null,
    resolution: null,
    segmentDecision: null,
    nextActionSequence: 1,
    evidence: [],
    warnings: [],
    sourceMismatches: [
      {
        id: "LS-FULL-CLEAR-VS-DUO-EXPECTED",
        status: "SOURCE CONFLICT",
        rule:
          "LS-01 §12 requires every entered Skimmer to be neutralized before release validation.",
        conflictingExpectation:
          "The mixed-duo profile says all three Skimmers remain active when release validates.",
        implementation:
          "The complete LS-01 deterministic specification controls; active entered threats block validation.",
      },
      {
        id: "DISCIPLINE-TIMING-OMISSION",
        status: "TEMPORARY IMPLEMENTATION ASSUMPTION",
        rule:
          "The controlling pack fixes discipline costs and causal layers but omits standalone lane/Tempo values; REV7 labels its timing table provisional.",
        implementation:
          "The greybox uses the REV7 provisional table where printed, lets Battle responses inherit the threatened packet, uses Standard / 5 for LS Opening transit, and preserves exact LS Context Card timing.",
      },
      {
        id: "LS-PROFILE-SCRIPT-OMISSION",
        status: "SOURCE LIMIT",
        rule:
          "The source provides final paper totals for solo LS profiles but no complete per-cycle action scripts for those totals.",
        implementation:
          "The greybox compares observed runs to the paper totals without fabricating a hidden canonical plan.",
      },
      {
        id: "OUTSKIRTS-COORDINATES",
        status: "TEMPORARY PRESENTATION ASSUMPTION",
        rule:
          "The three approaches share one freely explored physical block, but exact coordinates are not specified.",
        implementation:
          "The greybox uses a neutral three-branch node diagram and does not choose top-down versus isometric presentation.",
      },
      {
        id: "OPTIONAL-PANEL-BASE-SEED",
        status: "UNRESOLVED / EXCLUDED",
        rule:
          "The Hanging Panel is explicitly optional and not required in the base class-comparison seed.",
        implementation:
          "The first playable excludes it rather than inventing a Force vector or cover-placement choice.",
      },
      {
        id: "EQUIPMENT-VECTOR-CHOICES",
        status: "EXCLUDED FROM BALANCE EVIDENCE",
        rule:
          "Several exact optional weapon techniques require a player-selected line, cone, pull, breach, or step vector.",
        implementation:
          "The base Loadout A profile and exact basic equipment values remain available; optional technique projections are not treated as verified balance outcomes until the spatial choice UI is complete.",
      },
    ],
  };
  pushEvidence(state, "profile_loaded", {
    profileId: profile.id,
    seatCount: seats.length,
    buildIds: seats.map((seat) => seat.buildId),
  });
  return state;
}

export function resetGreybox(state) {
  const next = createGreyboxState(state.profileId);
  pushEvidence(next, "reset", { fromStage: state.stage });
  return next;
}

export function loadProfile(state, profileId) {
  const next = createGreyboxState(profileId);
  pushEvidence(next, "profile_changed", { priorProfileId: state.profileId, profileId });
  return next;
}

export function updatePreparation(state, seatId, changes) {
  if (state.stage !== "preparation") return state;
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat) return state;

  if (changes.buildId && getBuild(changes.buildId)) {
    const build = getBuild(changes.buildId);
    seat.buildId = build.id;
    seat.deck = [...build.deck];
    seat.hand = build.deck.slice(0, CORE_RULES.openingHand);
    seat.drawIndex = CORE_RULES.openingHand;
    seat.discard = [];
  }
  if (changes.loadoutId && LOADOUTS[changes.loadoutId]) {
    const loadout = LOADOUTS[changes.loadoutId];
    const armor = ARMOR[loadout.armor];
    seat.loadoutId = loadout.id;
    seat.activeWeaponId = loadout.activeWeapon;
    seat.reserveWeaponId = loadout.reserveWeapon;
    seat.armorId = loadout.armor;
    seat.rigId = loadout.rig;
    seat.guard = armor.guardCap;
    seat.forceResistance = armor.forceResistance ?? 0;
  }
  if (typeof changes.primaryPriority === "string") {
    seat.primaryPriority = changes.primaryPriority;
  }
  if (typeof changes.secondaryPriority === "string") {
    seat.secondaryPriority = changes.secondaryPriority;
  }
  pushEvidence(next, "preparation_changed", { seatId, changes });
  return next;
}

export function beginOutskirts(state) {
  if (state.stage !== "preparation") return state;
  const next = clone(state);
  next.stage = "outskirts";
  next.stageLabel = "Outskirts approach block";
  pushEvidence(next, "outskirts_entered");
  return next;
}

export function inspectApproach(state, approachId, seatId = state.activeSeatId) {
  if (state.stage !== "outskirts" || !APPROACHES[approachId]) return state;
  const next = clone(state);
  if (!next.approach.inspected.includes(approachId)) {
    next.approach.inspected.push(approachId);
  }
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  pushEvidence(next, "approach_inspected", {
    approachId,
    seatId,
    major: getBuild(seat?.buildId)?.major,
  });
  return next;
}

export function selectApproachResult(state, approachId, resultId, resolverSeatId) {
  if (state.stage !== "outskirts") return state;
  const approach = APPROACHES[approachId];
  const resolver = state.seats.find((seat) => seat.id === resolverSeatId);
  if (!approach || !resolver || !approach.results.includes(resultId)) return state;

  const major = getBuild(resolver.buildId)?.major;
  if (approachId === "impact-scar" && resultId === "exact" && major !== "battle") {
    return withWarning(state, "Exact Impact Scar confrontation requires a Battle Major.");
  }
  if (approachId === "mute-repeater" && resultId === "preserved" && major !== "hacking") {
    return withWarning(state, "Preserving the Mute Repeater result requires a Hacking Major.");
  }

  const next = clone(state);
  next.approach.selectedId = approachId;
  next.approach.resultId = resultId;
  next.approach.resolverSeatId = resolverSeatId;
  next.approach.confirmations = Object.fromEntries(
    next.seats.map((seat) => [seat.id, false]),
  );
  pushEvidence(next, "approach_result_selected", {
    approachId,
    resultId,
    resolverSeatId,
  });
  return next;
}

export function setApproachConfirmation(state, seatId, confirmed) {
  if (state.stage !== "outskirts" || !(seatId in state.approach.confirmations)) {
    return state;
  }
  const next = clone(state);
  next.approach.confirmations[seatId] = Boolean(confirmed);
  pushEvidence(next, "approach_confirmation", { seatId, confirmed: Boolean(confirmed) });
  return next;
}

function approachPackage(approachId, resultId) {
  if (approachId === "impact-scar" && resultId === "exact") {
    return { id: "counterweight-breaker", name: "Counterweight Breaker", slots: 1 };
  }
  if (approachId === "impact-scar") {
    return { id: "weapon-parts", name: "Weapon Parts", slots: 1 };
  }
  if (approachId === "mute-repeater" && resultId === "destroyed") {
    return { id: "rig-parts", name: "Rig Parts", slots: 1 };
  }
  return null;
}

export function commitApproach(state) {
  if (state.stage !== "outskirts") return state;
  if (!state.approach.selectedId || !state.approach.resultId) {
    return withWarning(state, "Select an approach result before committing.");
  }
  const missing = state.seats.filter(
    (seat) => !state.approach.confirmations[seat.id],
  );
  if (missing.length) {
    return withWarning(
      state,
      `Every continuing seat must confirm. Missing: ${missing
        .map((seat) => seat.label)
        .join(", ")}.`,
    );
  }

  const next = clone(state);
  const resolver =
    next.seats.find((seat) => seat.id === next.approach.resolverSeatId) ??
    next.seats[0];
  const packageResult = approachPackage(
    next.approach.selectedId,
    next.approach.resultId,
  );
  if (packageResult) {
    resolver.packages.push({ ...packageResult, ownerSeatId: resolver.id, exposed: true });
  }

  const folded = next.approach.selectedId === "folded-service-walk";
  const muted = next.approach.selectedId === "mute-repeater";
  const impact = next.approach.selectedId === "impact-scar";
  const trio = next.seats.length === 3;
  next.seats.forEach((seat) => {
    seat.position = folded ? "broken-lane-lip" : "entry-shelf";
    seat.focusId = seat.position;
    seat.command = CORE_RULES.commandStart;
    seat.condition = CORE_RULES.condition;
    seat.guard = ARMOR[seat.armorId].guardCap;
    seat.temporaryGuard = 0;
    seat.disruption = 0;
    seat.plan = [];
    seat.locked = false;
  });
  next.approach.committed = true;
  next.stage = "loose-signal";
  next.stageLabel = "Loose Signal Crossing · Planning";
  next.encounter = {
    id: "LS-01",
    cycle: 1,
    tieOrder: next.seats.map((seat) => seat.id),
    marker: {
      integrity: 4,
      locked: false,
      dislodged: false,
      surveyAvailable: true,
    },
    plate: {
      stabilized: false,
      naturalOpeningConfirmed: folded,
      crossingCollisionReduction: folded ? 1 : 0,
    },
    shutter: {
      state: "closed",
      intact: true,
      resealSuppressedUntilCycle: null,
      outputWindowEndsAfterCycle: null,
      controlledBySeatId: null,
      hackingOutputsAvailable: true,
    },
    release: {
      work: 0,
      pendingValidation: false,
      validated: false,
      thresholdOpen: false,
      blockedReason: "",
    },
    cache: {
      exposed: false,
      recovered: false,
      destroyed: false,
    },
    reinforcementPrevented: muted,
    majorDestinationFact:
      muted && next.approach.resultId === "preserved"
        ? "One major-destination system fact secured."
        : null,
    approachDiscoveries:
      folded
        ? ["Folded Entry Record"]
        : muted && next.approach.resultId === "preserved"
          ? ["Repeater Pattern", "Major-destination route fact"]
          : [],
    enemies: {
      "skimmer-a": makeSkimmer("skimmer-a", "Trace Skimmer A", "far-platform", "active"),
      "skimmer-b": makeSkimmer(
        "skimmer-b",
        "Trace Skimmer B",
        "upper-trace-rail",
        impact ? "absent" : "active",
      ),
      "skimmer-c": makeSkimmer(
        "skimmer-c",
        "Trace Skimmer C",
        "upper-trace-rail",
        muted ? "prevented" : trio ? "active" : "pending",
      ),
    },
    enteredEnemyIds: [
      "skimmer-a",
      ...(impact ? [] : ["skimmer-b"]),
      ...(trio && !muted ? ["skimmer-c"] : []),
    ],
    packagesOnMap: [],
    causalLog: [],
    refundsPending: Object.fromEntries(next.seats.map((seat) => [seat.id, 0])),
    resolutionComplete: false,
    selectedOutcome: null,
  };
  next.resolution = null;
  next.warnings = [];
  pushEvidence(next, "approach_committed", {
    approachId: next.approach.selectedId,
    resultId: next.approach.resultId,
    resolverSeatId: resolver.id,
  });
  pushEvidence(next, "encounter_started", {
    encounterId: "LS-01",
    activeEnemies: Object.values(next.encounter.enemies)
      .filter((enemy) => enemy.status === "active")
      .map((enemy) => enemy.id),
  });
  return next;
}

function makeSkimmer(id, name, position, status) {
  return {
    id,
    name,
    position,
    guard: 1,
    condition: 4,
    force: 1,
    status,
    pinnedUntilSettle: null,
    intactActuator: true,
    entered: status === "active",
  };
}

function withWarning(state, message) {
  const next = clone(state);
  next.warnings = [...next.warnings.slice(-3), message];
  return next;
}

export function selectSeat(state, seatId) {
  if (!state.seats.some((seat) => seat.id === seatId)) return state;
  const next = clone(state);
  next.activeSeatId = seatId;
  return next;
}

export function selectFocus(state, seatId, focusId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.locked) return state;
  seat.focusId = focusId;
  pushEvidence(next, "focus_selected", { seatId, focusId });
  return next;
}

function activePlanCost(seat) {
  return seat.plan.reduce((sum, action) => sum + action.totalReservedCommand, 0);
}

export function seatCommandAvailable(seat) {
  return seat.command - activePlanCost(seat);
}

function canReachOrdinary(from, to) {
  return ORDINARY_EDGES.some(
    ([left, right]) =>
      (left === from && right === to) || (left === to && right === from),
  );
}

function ordinaryNeighbors(position) {
  return ORDINARY_EDGES.flatMap(([left, right]) => {
    if (left === position) return [right];
    if (right === position) return [left];
    return [];
  });
}

function physicalDistance(from, to) {
  if (from === to) return 0;
  const edges = [
    ...ORDINARY_EDGES,
    [SPECIAL_EDGE.origin, SPECIAL_EDGE.destination],
  ];
  const visited = new Set([from]);
  let frontier = [from];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const next = [];
    for (const current of frontier) {
      for (const [left, right] of edges) {
        const neighbor =
          left === current ? right : right === current ? left : null;
        if (!neighbor || visited.has(neighbor)) continue;
        if (neighbor === to) return distance;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

function sameOrOrdinarilyAdjacent(left, right) {
  return left === right || canReachOrdinary(left, right);
}

function positionOccupants(state, positionId) {
  return state.seats.filter(
    (seat) => !seat.compromised && seat.position === positionId,
  );
}

function enemyIsActive(enemy) {
  return enemy && (enemy.status === "active" || enemy.status === "pinned");
}

function focusLabel(state, focusId) {
  if (POSITIONS[focusId]) return POSITIONS[focusId].name;
  if (state.encounter?.enemies[focusId]) return state.encounter.enemies[focusId].name;
  const seat = state.seats.find((candidate) => candidate.id === focusId);
  return seat?.label ?? focusId;
}

function baseProjection(action, state, seat) {
  return {
    actor: seat.label,
    target: focusLabel(state, action.targetId),
    action: action.name,
    timing: `${action.lane} / ${action.tempo}`,
    command: action.cost,
    paidSlot: action.paid ? "Paid" : "Outside paid-action limit",
    requirements: action.requirements?.join("; ") || "Visible legal source",
    rangeAccess: action.rangeAccess ?? "Confirmed by current position and source",
    claims: action.exclusiveClaim
      ? `${action.claimMode ?? "Primary"} · ${action.exclusiveClaim}`
      : "None",
    invalidators: action.invalidators?.join("; ") || "Actor, target, or source becomes illegal before beginning",
    guard: action.guardEffect ?? "No projected Guard change",
    condition: action.conditionEffect ?? "No projected Condition change",
    force: action.forceEffect ?? "No projected Force",
    movement: action.movementEffect ?? "No projected movement",
    work: action.workEffect ?? "No projected Work",
    control: action.controlEffect ?? "No projected Control change",
    route: action.routeEffect ?? "No projected Route change",
    packages: action.packageEffect ?? "No projected Package change",
    integrity: action.integrityEffect ?? "No projected Integrity change",
    objective: action.objectiveEffect ?? "No projected objective change",
    extraction: action.extractionEffect ?? "No projected extraction",
    certainty: action.certainty ?? "Confirmed",
    alternatives: action.alternatives ?? "None",
    executionTag: action.tag,
  };
}

function actionTemplate(state, seat, spec) {
  const action = {
    instanceId: `candidate:${seat.id}:${spec.id}`,
    id: spec.id,
    baseId: spec.baseId ?? spec.id,
    name: spec.name,
    actorSeatId: seat.id,
    targetId: spec.targetId ?? seat.focusId,
    sourceId: spec.sourceId ?? seat.focusId,
    cost: spec.cost ?? 0,
    modifierCost: 0,
    contingencyReserve: 0,
    totalReservedCommand: spec.cost ?? 0,
    lane: spec.lane ?? "Standard",
    tempo: spec.tempo ?? 4,
    paid: spec.paid !== false,
    tag: spec.tag ?? "Instant",
    family: spec.family ?? "Core",
    group: spec.group ?? "Act",
    requirements: spec.requirements ?? [],
    invalidators: spec.invalidators ?? [],
    rangeAccess: spec.rangeAccess,
    exclusiveClaim: spec.exclusiveClaim ?? null,
    claimMode: spec.claimMode ?? (spec.exclusiveClaim ? "Primary" : null),
    requiresConsentFromSeatId: spec.requiresConsentFromSeatId ?? null,
    consentGranted: spec.requiresConsentFromSeatId ? false : true,
    attachedCardId: null,
    refocusCardIds: spec.refocusCardIds ?? [],
    destinationId: spec.destinationId ?? null,
    includedActionId: spec.includedActionId ?? null,
    outputId: spec.outputId ?? null,
    payoffId: spec.payoffId ?? null,
    supportedActionInstanceId: spec.supportedActionInstanceId ?? null,
    dependsOnActionInstanceId: spec.dependsOnActionInstanceId ?? null,
    guardEffect: spec.guardEffect,
    conditionEffect: spec.conditionEffect,
    forceEffect: spec.forceEffect,
    movementEffect: spec.movementEffect,
    workEffect: spec.workEffect,
    controlEffect: spec.controlEffect,
    routeEffect: spec.routeEffect,
    packageEffect: spec.packageEffect,
    integrityEffect: spec.integrityEffect,
    objectiveEffect: spec.objectiveEffect,
    extractionEffect: spec.extractionEffect,
    certainty: spec.certainty,
    alternatives: spec.alternatives,
    effect: spec.effect ?? {},
  };
  action.projection = baseProjection(action, state, seat);
  return action;
}

function currentEnemyIntentPreview(state, enemyId) {
  const enemy = state.encounter?.enemies[enemyId];
  if (!enemyIsActive(enemy)) return null;
  if (enemyId === "skimmer-a") {
    const crossing = state.seats
      .flatMap((seat) => seat.plan)
      .find((action) => CROSSING_ACTION_IDS.has(action.baseId));
    return crossing
      ? {
          id: "crossing-intercept",
          name: "Crossing Intercept",
          targetSeatId: crossing.actorSeatId,
          lane: crossing.lane,
          tempo: crossing.tempo,
        }
      : null;
  }
  if (enemyId === "skimmer-b") {
    const access = earliestAccessAction(state);
    return access
      ? {
          id: "access-clamp",
          name: "Access Clamp",
          targetSeatId: access.actorSeatId,
          lane: "Standard",
          tempo: 5,
        }
      : {
          id: "marker-clamp",
          name: "Marker Clamp",
          targetSeatId: null,
          lane: "Standard",
          tempo: 5,
        };
  }
  return {
    id: "razor-pass",
    name: "Razor Pass",
    targetSeatId: chooseRazorTarget(state),
    lane: "Fast",
    tempo: 7,
  };
}

function earliestAccessAction(state) {
  const actions = state.seats.flatMap((seat) => seat.plan);
  return actions
    .filter((action) => SYSTEM_ACTION_IDS.has(action.baseId))
    .sort(compareTiming)[0];
}

function compareTiming(left, right) {
  const laneDifference = LANE_RANK[left.lane] - LANE_RANK[right.lane];
  if (laneDifference !== 0) return laneDifference;
  if (right.tempo !== left.tempo) return right.tempo - left.tempo;
  return String(left.instanceId).localeCompare(String(right.instanceId));
}

function chooseRazorTarget(state) {
  const active = state.seats.filter((seat) => !seat.compromised);
  const majorCarrier = active.find((seat) =>
    seat.packages.some((item) => item.slots === 2),
  );
  if (majorCarrier) return majorCarrier.id;
  const far = active.find((seat) => seat.position === "far-platform");
  if (far) return far.id;
  return state.encounter.tieOrder.find((seatId) =>
    active.some((seat) => seat.id === seatId),
  );
}

function makeCoreActions(state, seat, focusId) {
  const actions = [];
  const focusEnemy = state.encounter.enemies[focusId];
  const focusPosition = POSITIONS[focusId];
  const focusSeat = state.seats.find((candidate) => candidate.id === focusId);
  const weapon = WEAPONS[seat.activeWeaponId];
  const rig = RIGS[seat.rigId];

  if (focusEnemy && enemyIsActive(focusEnemy)) {
    actions.push(
      actionTemplate(state, seat, {
        id: "attack",
        name: `Attack · ${weapon.name}`,
        targetId: focusId,
        cost: 6,
        lane: weapon.lane,
        tempo: weapon.tempo,
        tag: "Instant",
        group: "Direct",
        requirements: [`${weapon.name} line and range ${weapon.range}`],
        rangeAccess: `Authored LS line; weapon range ${weapon.range}`,
        conditionEffect: `${weapon.impact} Impact after ${weapon.guardBreak} Guard Break`,
        forceEffect: weapon.force ? `Force ${weapon.force}` : "No Force",
        effect: {
          impact: weapon.impact,
          guardBreak:
            weapon.id === "static-driver" ? weapon.guardBreak : weapon.guardBreak,
          force: weapon.force,
        },
      }),
    );
    if (weapon.technique) {
      actions.push(
        actionTemplate(state, seat, {
          ...weapon.technique,
          baseId: weapon.technique.id,
          targetId: focusId,
          group: "Gear technique",
          requirements: [weapon.technique.text],
          conditionEffect:
            weapon.technique.id === "drive-through"
              ? "5 Impact after 2 Guard Break"
              : weapon.technique.id === "phase-cut"
                ? "3 Impact"
                : "Technique-specific effect",
          forceEffect:
            weapon.technique.id === "drive-through" ? "Force 3" : undefined,
          effect: {
            impact:
              weapon.technique.id === "drive-through"
                ? 5
                : weapon.technique.id === "phase-cut"
                  ? 3
                  : weapon.impact,
            guardBreak:
              weapon.technique.id === "drive-through" ? 2 : weapon.guardBreak,
            force: weapon.technique.id === "drive-through" ? 3 : weapon.force,
          },
        }),
      );
    }
  }

  actions.push(
    actionTemplate(state, seat, {
      id: "guard",
      name: focusSeat && focusSeat.id !== seat.id ? `Guard ${focusSeat.label}` : "Guard",
      targetId: focusSeat?.id ?? seat.id,
      cost: 6,
      lane: "Fast",
      tempo: 7,
      tag: "Instant",
      group: "Protect",
      guardEffect:
        focusSeat && focusSeat.id !== seat.id
          ? "+3 temporary Guard to adjacent ally"
          : "Restore 4 Guard to armor cap and Brace against one visible Commitment",
      requiresConsentFromSeatId:
        focusSeat && focusSeat.id !== seat.id ? focusSeat.id : null,
    }),
  );

  if (focusPosition || focusEnemy) {
    actions.push(
      actionTemplate(state, seat, {
        id: "scan",
        name: "Scan",
        targetId: focusId,
        cost: 4,
        lane: "Fast",
        tempo: 4,
        tag: "Instant",
        group: "Observe",
        certainty: "Improves one authored uncertain fact by one information band",
        objectiveEffect: "No discipline authority or exact conversion",
      }),
    );
  }

  ordinaryNeighbors(seat.position).forEach((destinationId) => {
    actions.push(
      actionTemplate(state, seat, {
        id: `reposition:${destinationId}`,
        baseId: "reposition",
        name: `Reposition → ${POSITIONS[destinationId].name}`,
        targetId: destinationId,
        destinationId,
        cost: 0,
        lane: "Standard",
        tempo: 5,
        paid: false,
        tag: "Transit",
        group: "Move",
        requirements: ["Adjacent ordinary legal position", "Available destination capacity"],
        movementEffect: `Move one ordinary position to ${POSITIONS[destinationId].name}`,
      }),
    );
    actions.push(
      actionTemplate(state, seat, {
        id: `additional-movement:${destinationId}`,
        baseId: "additional-movement",
        name: `Additional Movement → ${POSITIONS[destinationId].name}`,
        targetId: destinationId,
        destinationId,
        cost: 4,
        lane: "Standard",
        tempo: 5,
        tag: "Transit",
        group: "Move",
        requirements: ["Adjacent ordinary legal position", "Available destination capacity"],
        movementEffect: `Move one additional ordinary position to ${POSITIONS[destinationId].name}`,
      }),
    );
  });

  if (
    rig?.id === "traversal-line" &&
    !seat.packages.some((item) => item.slots >= 2)
  ) {
    const paths = new Map();
    ordinaryNeighbors(seat.position).forEach((first) => {
      paths.set(first, [seat.position, first]);
      ordinaryNeighbors(first)
        .filter((second) => second !== seat.position)
        .forEach((second) => {
          if (!paths.has(second)) {
            paths.set(second, [seat.position, first, second]);
          }
        });
    });
    paths.forEach((path, destinationId) => {
      if (
        destinationId === "threshold" &&
        !state.encounter.release.thresholdOpen
      ) {
        return;
      }
      actions.push(
        actionTemplate(state, seat, {
          ...rig.action,
          id: `line-move:${destinationId}`,
          baseId: "line-move",
          targetId: destinationId,
          destinationId,
          group: "Gear technique",
          requirements: [
            rig.text,
            "Selected path uses one or two ordinary connections",
            "No carried Major Package",
          ],
          movementEffect: `Move through ${path
            .slice(1)
            .map((positionId) => focusLabel(state, positionId))
            .join(" → ")}`,
          effect: { path },
        }),
      );
    });
  } else if (rig?.action) {
    actions.push(
      actionTemplate(state, seat, {
        ...rig.action,
        targetId: seat.id,
        group: "Gear technique",
        requirements: [rig.text],
        guardEffect:
          rig.action.id === "anchor-lock"
            ? "Prevent first 2 Force before Settle"
            : rig.action.id === "protected-access"
              ? "Protect one declared access action from direct-hit invalidation"
              : undefined,
        movementEffect:
          rig.action.id === "line-move"
            ? "Choose up to two connected ordinary positions; no special Opening"
            : undefined,
      }),
    );
  }

  actions.push(
    actionTemplate(state, seat, {
      id: "swap-weapon",
      name: `Swap to ${WEAPONS[seat.reserveWeaponId].name}`,
      targetId: seat.id,
      cost: 4,
      lane: "Fast",
      tempo: 3,
      tag: "Instant",
      group: "Gear technique",
      requirements: ["Once per planning phase", "Includes no Attack"],
      objectiveEffect: "Active and reserve weapons exchange",
    }),
  );

  seat.hand.forEach((cardId) => {
    if (cardId === "field-patch" && !seat.fieldPatchUsed) {
      actions.push(
        actionTemplate(state, seat, {
          id: "field-patch",
          name: "Field Patch",
          targetId: focusSeat?.id ?? seat.id,
          cost: CARDS["field-patch"].cost,
          lane: "Slow",
          tempo: 3,
          tag: "Sustained",
          group: "Prepared card",
          requirements: ["Self or adjacent non-Compromised ally", "Once per character per encounter"],
          conditionEffect: "Restore 3 Condition; cannot Stabilize",
          requiresConsentFromSeatId:
            focusSeat && focusSeat.id !== seat.id ? focusSeat.id : null,
          effect: { cardActionId: "field-patch" },
        }),
      );
    }
    actions.push(
      actionTemplate(state, seat, {
        id: `refocus:${cardId}`,
        baseId: "refocus",
        name: `Refocus · ${CARDS[cardId].name}`,
        targetId: seat.id,
        cost: 4,
        lane: "Fast",
        tempo: 2,
        tag: "Instant",
        group: "Prepared card",
        requirements: ["Once per planning phase", "Cycle one selected card"],
        objectiveEffect: `Discard ${CARDS[cardId].name} and immediately draw one`,
        refocusCardIds: [cardId],
      }),
    );
  });

  return actions;
}

function makeDisciplineActions(state, seat, focusId) {
  const actions = [];
  const build = getBuild(seat.buildId);
  const focusEnemy = state.encounter.enemies[focusId];
  const intent = focusEnemy ? currentEnemyIntentPreview(state, focusId) : null;
  const plannedAnswer = seat.plan.find(
    (action) =>
      action.baseId === "answer-commitment" &&
      action.targetId === focusId,
  );

  if (build.major === "battle" || build.minor === "battle") {
    if (focusEnemy && intent) {
      const definition =
        build.major === "battle"
          ? DISCIPLINES.battle.setup
          : DISCIPLINES.battle.minor;
      actions.push(
        actionTemplate(state, seat, {
          id: definition.id,
          name: `${definition.name} · ${intent.name}`,
          targetId: focusId,
          cost: definition.cost,
          lane: intent.lane,
          tempo: intent.tempo,
          tag: "Instant",
          family: build.major === "battle" ? "Major engine" : "Minor foundation",
          group: "Commitment",
          requirements: [`Visible ${intent.name}`, "One primary responder per Commitment"],
          exclusiveClaim: `commitment:${focusId}:${intent.id}`,
          certainty:
            "Confirmed response layer; inherits the threatened Commitment packet",
          forceEffect:
            build.major === "battle"
              ? "Changes the Commitment and creates Battle Advantage on success"
              : "Reduces Force by 2; creates no Battle Advantage",
          controlEffect:
            build.major === "battle"
              ? "Create Battle Advantage tied to this enemy and confrontation"
              : "No stored state",
          effect: { intentId: intent.id },
        }),
      );
    }
    const hasBattleAdvantage =
      seat.majorState?.type === "battle-advantage" &&
      seat.majorState.targetId === focusId;
    if (build.major === "battle" && (hasBattleAdvantage || plannedAnswer)) {
      [
        ["drive", "Drive to Trace Rail", "Remove target; intact component may become inaccessible"],
        ["pin", "Pin", "Cancel movement Commitment through next Settle"],
        ["disarm", "Controlled Disarm", "Disable pressure and preserve an intact actuator if requirements hold"],
      ].forEach(([payoffId, name, result]) => {
        actions.push(
          actionTemplate(state, seat, {
            id: `convert-${payoffId}`,
            baseId: "convert-advantage",
            name,
            targetId: focusId,
            cost: 8,
            lane: "Standard",
            tempo: 5,
            tag: "Instant",
            family: "Major engine",
            group: "Advantage",
            requirements:
              payoffId === "disarm"
                ? [
                    hasBattleAdvantage
                      ? "Owned Battle Advantage"
                      : "Planned Answer Commitment must complete first",
                    "Zero Guard or confrontation-created exposure",
                  ]
                : payoffId === "pin"
                  ? [
                      hasBattleAdvantage
                        ? "Owned Battle Advantage"
                        : "Planned Answer Commitment must complete first",
                      "Stable physical relationship",
                    ]
                  : [
                      hasBattleAdvantage
                        ? "Owned Battle Advantage"
                        : "Planned Answer Commitment must complete first",
                    ],
            controlEffect: `Spend Battle Advantage · ${result}`,
            payoffId,
            dependsOnActionInstanceId: hasBattleAdvantage
              ? null
              : plannedAnswer.instanceId,
            certainty: hasBattleAdvantage
              ? "Confirmed"
              : "Conditional: begins only after the planned Answer creates Battle Advantage",
          }),
        );
      });
    }
  }

  const atOpening =
    focusId === "broken-lane-lip" ||
    focusId === "far-platform" ||
    focusId === SPECIAL_EDGE.id;
  if (atOpening && (build.major === "exploration" || build.minor === "exploration")) {
    if (build.major === "exploration") {
      actions.push(
        actionTemplate(state, seat, {
          id: "prepare-route",
          name: "Prepare Route",
          targetId: SPECIAL_EDGE.id,
          sourceId: SPECIAL_EDGE.id,
          cost: 7,
          lane: "Standard",
          tempo: 4,
          tag: "Instant",
          family: "Major engine",
          group: "Opening",
          requirements: ["Natural Opening accessible", "One owner for this origin/destination relationship"],
          exclusiveClaim: `route:${SPECIAL_EDGE.origin}:${SPECIAL_EDGE.destination}`,
          routeEffect: "Create owner Exploit passage and one authorized allied Follow passage",
          certainty:
            "Confirmed geometry; standalone timing is a declared prototype assumption because the source omits it",
        }),
      );
    } else {
      actions.push(
        actionTemplate(state, seat, {
          id: "cross-opening",
          name: "Cross Opening",
          targetId: "far-platform",
          sourceId: SPECIAL_EDGE.id,
          destinationId:
            seat.position === "far-platform" ? "broken-lane-lip" : "far-platform",
          cost: 6,
          lane: "Standard",
          tempo: 5,
          tag: "Transit",
          family: "Minor foundation",
          group: "Opening",
          requirements: ["Natural Opening accessible", "Legal destination capacity"],
          movementEffect: "Personal immediate crossing; no stored Route or destination action",
          certainty:
            "Crossing Intercept resolves as an explicit response in this packet",
        }),
      );
    }
  }

  if (build.major === "exploration" && seat.majorState?.type === "prepared-route") {
    actions.push(
      actionTemplate(state, seat, {
        id: "exploit-route",
        name: "Exploit Route · cross",
        targetId: seat.majorState.destinationId,
        sourceId: seat.majorState.openingId,
        destinationId: seat.majorState.destinationId,
        cost: 8,
        lane: "Standard",
        tempo: 5,
        tag: "Transit",
        family: "Major engine",
        group: "Route",
        requirements: ["Owned active prepared Route", "Legal landing position"],
        routeEffect: "Spend owner passage and traverse; no arbitrary extra objective is compressed",
        movementEffect: `Cross to ${focusLabel(state, seat.majorState.destinationId)}`,
      }),
    );
    if (
      seat.majorState.destinationId === "far-platform" &&
      state.encounter.shutter.state !== "closed"
    ) {
      actions.push(
        actionTemplate(state, seat, {
          id: "exploit-release",
          baseId: "exploit-route",
          name: "Exploit Route · Complete Release",
          targetId: "release-socket",
          sourceId: seat.majorState.openingId,
          destinationId: seat.majorState.destinationId,
          includedActionId: "complete-release",
          cost: 8,
          lane: "Standard",
          tempo: 5,
          tag: "Transit",
          family: "Major engine",
          group: "Route",
          requirements: ["Owned prepared Route", "Open or bypassed shutter", "Legal release access at destination"],
          routeEffect: "Spend owner passage",
          movementEffect: "Cross to Far Platform",
          workEffect: "Included legal destination action adds 1 Release Work",
          objectiveEffect: "Release validates only at Settle if the shutter remains open and entered threats are clear",
        }),
      );
    }
  }

  const alliedRouteOwner = state.seats.find(
    (candidate) =>
      candidate.id !== seat.id &&
      candidate.majorState?.type === "prepared-route" &&
      candidate.majorState.followPassages > 0,
  );
  if (alliedRouteOwner && atOpening) {
    actions.push(
      actionTemplate(state, seat, {
        id: "follow-route",
        name: `Follow ${alliedRouteOwner.label}'s Route`,
        targetId: alliedRouteOwner.majorState.destinationId,
        sourceId: alliedRouteOwner.majorState.openingId,
        destinationId: alliedRouteOwner.majorState.destinationId,
        cost: 4,
        lane: "Standard",
        tempo: 5,
        tag: "Transit",
        family: "Allied discipline passage",
        group: "Route",
        requirements: ["Authorized allied passage", "Distinct legal landing position"],
        requiresConsentFromSeatId: alliedRouteOwner.id,
        exclusiveClaim: `route-passage:${alliedRouteOwner.id}:follow`,
        movementEffect: "Traversal only; no destination action",
      }),
    );
  }

  if (
    seat.flags.backtrack &&
    seat.position === seat.flags.backtrack.destinationId &&
    atOpening
  ) {
    actions.push(
      actionTemplate(state, seat, {
        id: "backtrack",
        name: `Backtrack → ${focusLabel(
          state,
          seat.flags.backtrack.originId,
        )}`,
        targetId: seat.flags.backtrack.originId,
        sourceId: seat.flags.backtrack.openingId,
        destinationId: seat.flags.backtrack.originId,
        cost: 4,
        lane: "Standard",
        tempo: 5,
        tag: "Transit",
        family: "Prepared card",
        group: "Route",
        requirements: [
          "Backtrack Marker created this cycle",
          "Same Opening or Route remains legal",
          "Legal destination capacity",
        ],
        movementEffect: "Return to the marked origin before Settle",
        certainty: "Confirmed temporary action from Backtrack Marker",
      }),
    );
  }

  const shutterFocus = new Set([
    "shutter-console",
    "far-platform",
    "release-socket",
    "relay-cache",
  ]).has(focusId);
  if (shutterFocus && (build.major === "hacking" || build.minor === "hacking")) {
    if (build.major === "hacking") {
      if (!seat.majorState) {
        actions.push(
          actionTemplate(state, seat, {
            id: "establish-control",
            name: "Establish Control · Shutter Dependency",
            targetId: "shutter-console",
            sourceId: "shutter-console",
            cost: 7,
            lane: "Standard",
            tempo: 3,
            tag: "Sustained",
            family: "Major engine",
            group: "Control",
            requirements: ["Console or Far Platform access", "Continuous legal access"],
            exclusiveClaim: "control:shutter-dependency",
            controlEffect: "Create character-owned Temporary Control; already-committed actions remain",
          }),
        );
      }
      const hasTemporaryControl =
        seat.majorState?.type === "temporary-control";
      if (hasTemporaryControl) {
        [
          {
            id: "execute-hold-open",
            outputId: "hold-open",
            name: "Execute Output · Hold Open",
            text: "Keep shutter open for the encounter; no cache; reinforcement remains.",
          },
          {
            id: "execute-expose-cache",
            outputId: "expose-cache",
            name: "Execute Output · Expose Cache",
            text: "Keep shutter open and expose Relay Needle; +1 Disruption at Settle unless prevented.",
          },
          {
            id: "execute-blind-repeater",
            outputId: "blind-repeater",
            name: "Execute Output · Blind Repeater",
            text: "Prevent reinforcement; shutter stays open through the next planning cycle only.",
          },
        ].forEach((output) => {
          if (
            output.outputId === "blind-repeater" &&
            state.encounter.reinforcementPrevented
          ) {
            return;
          }
          actions.push(
            actionTemplate(state, seat, {
              id: output.id,
              baseId: "execute-output",
              name: output.name,
              targetId: "shutter-console",
              sourceId: "shutter-console",
              outputId: output.outputId,
              cost: 8,
              lane: "Standard",
              tempo: 6,
              tag: "Sustained",
              family: "Major engine",
              group: "Control",
              requirements: ["Owned active Control", "Continuous legal access"],
              controlEffect: `Spend Control · ${output.text}`,
              alternatives: "Outputs are mutually exclusive because Control is spent",
              certainty: "Confirmed",
            }),
          );
        });
      }
    } else {
      actions.push(
        actionTemplate(state, seat, {
          id: "suppress-response",
          name: "Suppress Reseal Response",
          targetId: "shutter-console",
          sourceId: "shutter-console",
          cost: 6,
          lane: "Fast",
          tempo: 6,
          tag: "Instant",
          family: "Minor foundation",
          group: "Control",
          requirements: ["Visible immediate Reseal or lockout response"],
          controlEffect: "Delay the authored Reseal response; creates no Control",
        }),
      );
    }
  }
  return actions;
}

function makeContextActions(state, seat, focusId) {
  const actions = [];
  if (focusId === "frontier-marker") {
    actions.push(
      actionTemplate(state, seat, {
        id: "lock-frontier-marker",
        name: "Lock Frontier Marker",
        targetId: "frontier-marker",
        cost: 6,
        lane: "Fast",
        tempo: 6,
        tag: "Sustained",
        family: "Context Card",
        group: "Secure",
        requirements: ["Accessible Frontier Marker", "1 Work embodied in this action"],
        exclusiveClaim: "work:frontier-marker-lock",
        guardEffect: "Marker gains +1 Force resistance; remains damageable",
        integrityEffect: "Preserves Survey against Force, not direct damage",
      }),
    );
  }

  if (focusId === "broken-lane-lip" || focusId === SPECIAL_EDGE.id) {
    if (!state.encounter.plate.stabilized) {
      actions.push(
        actionTemplate(state, seat, {
          id: "stabilize-plate",
          name: "Stabilize Maintenance Plate",
          targetId: SPECIAL_EDGE.id,
          sourceId: "broken-lane-lip",
          cost: 6,
          lane: "Standard",
          tempo: 4,
          tag: "Sustained",
          family: "Context Card",
          group: "Repair",
          requirements: ["Broken-Lane Lip access", "1 Work"],
          exclusiveClaim: "work:maintenance-plate",
          workEffect: "Add 1 Work of 1; creates Cross Plate for the encounter",
        }),
      );
    } else {
      actions.push(
        actionTemplate(state, seat, {
          id: "cross-plate",
          name: "Cross Plate",
          targetId: "far-platform",
          sourceId: SPECIAL_EDGE.id,
          destinationId:
            seat.position === "far-platform" ? "broken-lane-lip" : "far-platform",
          cost: 6,
          lane: "Standard",
          tempo: 5,
          tag: "Transit",
          family: "Context Card",
          group: "Opening",
          requirements: ["Stabilized plate", "One character at a time", "Legal landing"],
          exclusiveClaim: `passage:plate:${state.encounter.cycle}`,
          movementEffect: "Universal crossing; not an Exploration action or Route",
          certainty:
            "Crossing Intercept remains visible and resolves in this crossing packet",
        }),
      );
    }
  }

  const shutterAccessible =
    seat.position === "shutter-console" || seat.position === "far-platform";
  if (
    ["shutter-console", "far-platform"].includes(focusId) &&
    shutterAccessible
  ) {
    const traceEchoDiscount =
      seat.flags.traceEcho?.componentId === "shutter-console" ? 2 : 0;
    actions.push(
      actionTemplate(state, seat, {
        id: "manual-shutter-release",
        name: "Manual Shutter Release",
        targetId: "shutter-console",
        cost: 6,
        lane: "Standard",
        tempo: 6,
        tag: "Sustained",
        family: "Context Card",
        group: "Operate",
        requirements: ["Console or Far Platform access"],
        objectiveEffect: "Open shutter for this resolution; visible Reseal Response occurs at Settle",
        certainty:
          "Release Work cannot validate unless the shutter remains open through Settle",
      }),
      actionTemplate(state, seat, {
        id: "jam-shutter-track",
        name: "Jam Shutter Track",
        targetId: "shutter-console",
        cost: 6,
        lane: "Standard",
        tempo: 5,
        tag: "Sustained",
        family: "Context Card",
        group: "Operate",
        requirements: ["Shutter access", "1 Work"],
        objectiveEffect: "Shutter stays open for encounter",
        packageEffect: "Relay cache destroyed",
        integrityEffect: "Shutter damaged; Hacking Outputs become unavailable",
      }),
      actionTemplate(state, seat, {
        id: "basic-interface",
        name: "Basic Interface · cycle shutter",
        targetId: "shutter-console",
        cost: Math.max(4, 6 - traceEchoDiscount),
        lane: "Standard",
        tempo: 4,
        tag: "Sustained",
        family: "Core",
        group: "Operate",
        requirements: ["Visible accessible interface point"],
        objectiveEffect: "Perform exposed standard operation; Reseal Response remains projected",
        controlEffect: "No Dependency reveal, Control, or Output selection",
        certainty: traceEchoDiscount
          ? "Confirmed by Trace Echo; first eligible interface receives its 2-Command reduction"
          : "Confirmed",
      }),
    );
  }

  if (focusId === "release-socket" && seat.position === "far-platform") {
    actions.push(
      actionTemplate(state, seat, {
        id: "complete-release",
        name: "Complete Far-Side Release",
        targetId: "release-socket",
        cost: 6,
        lane: "Standard",
        tempo: 4,
        tag: "Sustained",
        family: "Context Card",
        group: "Objective",
        requirements: ["Far-side access", "Open or bypassed shutter", "1 Work"],
        exclusiveClaim: "work:far-side-release",
        workEffect: "Add 1 Release Work of 1",
        objectiveEffect:
          "Validate at Settle only if shutter remains open and every entered Skimmer is neutralized",
      }),
    );
  }

  if (
    focusId === "relay-cache" &&
    (state.encounter.cache.exposed ||
      state.seats.some((candidate) =>
        candidate.plan.some(
          (planned) => planned.id === "execute-expose-cache",
        ),
      )) &&
    !state.encounter.cache.recovered &&
    seat.position === "far-platform"
  ) {
    const plannedExpose = state.seats
      .flatMap((candidate) => candidate.plan)
      .find((planned) => planned.id === "execute-expose-cache");
    actions.push(
      actionTemplate(state, seat, {
        id: "recover-relay-cache",
        name: "Recover Relay Cache",
        targetId: "relay-cache",
        cost: 6,
        lane: "Standard",
        tempo: 4,
        tag: "Sustained",
        family: "Context Card",
        group: "Package",
        requirements: ["Exposed cache", "Far Platform access", "One exposed Package slot"],
        exclusiveClaim: "package:relay-needle",
        packageEffect: "Recover Relay Needle · one slot",
        dependsOnActionInstanceId:
          state.encounter.cache.exposed ? null : plannedExpose?.instanceId ?? null,
        certainty:
          state.encounter.cache.exposed
            ? "Confirmed"
            : "Conditional: delayed until the planned Expose Cache Output completes",
      }),
    );
  }

  if (focusId === "threshold") {
    actions.push(
      actionTemplate(state, seat, {
        id: "standard-extract",
        name: "Standard Extract",
        targetId: "threshold",
        cost: 8,
        lane: "Slow",
        tempo: 3,
        tag: "Sustained",
        family: "Core",
        group: "Exit",
        requirements: ["Prepared legal exit", "Occupy the exit through completion"],
        extractionEffect:
          state.encounter.release.thresholdOpen
            ? "Extract this character and carried Packages"
            : "Unavailable: Threshold is not yet open or prepared",
      }),
    );
  }

  const ally = state.seats.find(
    (candidate) => candidate.id === focusId && candidate.id !== seat.id,
  );
  if (ally) {
    const supported = ally.plan[0];
    if (supported) {
      actions.push(
        actionTemplate(state, seat, {
          id: "assist",
          name: `Assist ${ally.label} · ${supported.name}`,
          targetId: ally.id,
          cost: 4,
          lane: supported.lane,
          tempo: supported.tempo + 1,
          tag: "Instant",
          family: "Core",
          group: "Support",
          requirements: ["Printed contextual Assist use", "Maximum one standard Assist per supported action"],
          requiresConsentFromSeatId: ally.id,
          supportedActionInstanceId: supported.instanceId,
          guardEffect: "Contextual protection or +1 Work if both actions complete",
        }),
      );
    }
    if (ally.compromised) {
      actions.push(
        actionTemplate(state, seat, {
          id: "stabilize",
          name: `Stabilize ${ally.label}`,
          targetId: ally.id,
          cost: 12,
          lane: "Slow",
          tempo: 2,
          tag: "Sustained",
          family: "Core",
          group: "Rescue",
          requirements: ["Compromised teammate", "Complete before two-Settle window expires"],
          requiresConsentFromSeatId: ally.id,
          conditionEffect: "Return next planning phase at 4 Condition, 0 Guard, +1 Disruption",
        }),
      );
    }
  }
  return actions;
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.id}|${action.targetId}|${action.destinationId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getImmediateActionGroups(state, seatId, focusId) {
  if (state.stage !== "loose-signal" || state.encounter?.resolutionComplete) {
    return [];
  }
  const seat = state.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.compromised || seat.locked) return [];
  const actions = dedupeActions([
    ...makeContextActions(state, seat, focusId),
    ...makeDisciplineActions(state, seat, focusId),
    ...makeCoreActions(state, seat, focusId),
  ]).filter((action) => isActionCurrentlyVisible(state, seat, action));

  const familyFor = (action) => {
    if (action.family === "Context Card") return "World action";
    if (
      ["Major engine", "Minor foundation", "Allied discipline passage"].includes(
        action.family,
      )
    ) {
      return "Discipline";
    }
    if (
      action.group === "Gear technique" ||
      action.group === "Prepared card"
    ) {
      return "Cards & equipment";
    }
    return "Core action";
  };
  const grouped = new Map();
  actions.forEach((action) => {
    const family = familyFor(action);
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(action);
  });
  const preferredOrder = [
    "World action",
    "Discipline",
    "Core action",
    "Cards & equipment",
  ];
  const result = [...grouped.entries()]
    .sort(
      ([left], [right]) =>
        preferredOrder.indexOf(left) - preferredOrder.indexOf(right),
    )
    .map(([name, variants]) => ({ name, variants }));

  pushEvidencePreview(state, seatId, focusId, actions, result);
  return result;
}

function pushEvidencePreview(state, seatId, focusId, actions, groups) {
  // Read-only option queries must not mutate the state. The UI records the
  // actual focus event; this helper only keeps the choice-cap logic explicit.
  void state;
  void seatId;
  void focusId;
  void actions;
  void groups;
}

function isActionCurrentlyVisible(state, seat, action) {
  if (
    [
      "attack",
      "drive-through",
      "phase-cut",
      "ground-lock",
      "clear-lane",
    ].includes(action.baseId) &&
    action.targetId?.startsWith("skimmer-")
  ) {
    const enemy = state.encounter.enemies[action.targetId];
    if (
      !enemy ||
      physicalDistance(seat.position, enemy.position) >
        WEAPONS[seat.activeWeaponId].range
    ) {
      return false;
    }
  }
  if (
    action.baseId === "guard" &&
    action.targetId !== seat.id &&
    !sameOrOrdinarilyAdjacent(
      seat.position,
      state.seats.find((candidate) => candidate.id === action.targetId)
        ?.position,
    )
  ) {
    return false;
  }
  if (
    action.baseId === "lock-frontier-marker" &&
    !sameOrOrdinarilyAdjacent(seat.position, "frontier-marker")
  ) {
    return false;
  }
  if (
    action.destinationId === "threshold" &&
    !state.encounter.release.thresholdOpen
  ) {
    return false;
  }
  if (
    action.baseId === "standard-extract" &&
    (!state.encounter.release.thresholdOpen || seat.position !== "threshold")
  ) {
    return false;
  }
  if (
    action.baseId === "establish-control" &&
    !["shutter-console", "far-platform"].includes(seat.position)
  ) {
    return false;
  }
  if (
    action.baseId === "suppress-response" &&
    state.encounter.shutter.state !== "open-until-settle" &&
    !seat.plan.some((planned) => planned.baseId === "manual-shutter-release") &&
    !state.seats.some((candidate) =>
      candidate.plan.some((planned) => planned.baseId === "manual-shutter-release"),
    )
  ) {
    return false;
  }
  if (
    CROSSING_ACTION_IDS.has(action.baseId) &&
    !["broken-lane-lip", "far-platform"].includes(seat.position)
  ) {
    return false;
  }
  if (
    action.baseId === "cross-plate" &&
    !state.encounter.plate.stabilized
  ) {
    return false;
  }
  if (
    action.baseId === "complete-release" &&
    state.encounter.shutter.state === "closed" &&
    !state.seats.some((candidate) =>
      candidate.plan.some((planned) =>
        [
          "manual-shutter-release",
          "jam-shutter-track",
          "execute-hold-open",
          "execute-expose-cache",
          "execute-blind-repeater",
        ].includes(planned.id),
      ),
    )
  ) {
    return false;
  }
  return true;
}

export function queueAction(state, seatId, candidate) {
  if (state.stage !== "loose-signal" || state.encounter?.resolutionComplete) {
    return state;
  }
  const next = clone(state);
  const seat = next.seats.find((item) => item.id === seatId);
  if (!seat || seat.locked) return state;
  const action = clone(candidate);
  action.instanceId = `${seat.id}:c${next.encounter.cycle}:a${next.nextActionSequence}`;
  next.nextActionSequence += 1;
  action.actorSeatId = seatId;
  action.consentGranted = !action.requiresConsentFromSeatId;

  const validation = validateQueuedAction(next, seat, action);
  if (!validation.ok) return withWarning(state, validation.reason);
  seat.plan.push(action);
  seat.lockError = "";
  pushEvidence(next, "action_queued", {
    seatId,
    actionId: action.baseId,
    targetId: action.targetId,
    cost: action.cost,
    paid: action.paid,
    lane: action.lane,
    tempo: action.tempo,
    claim: action.exclusiveClaim,
  });
  return next;
}

function validateQueuedAction(state, seat, action) {
  const paidCount = seat.plan.filter((planned) => planned.paid).length;
  if (action.paid && paidCount >= CORE_RULES.paidActionCap) {
    return { ok: false, reason: "This personal plan already uses four paid action slots." };
  }
  if (
    !action.paid &&
    action.baseId === "reposition" &&
    seat.plan.some((planned) => planned.baseId === "reposition")
  ) {
    return { ok: false, reason: "Ordinary Reposition is limited to once per planning phase." };
  }
  if (
    ["answer-commitment", "prepare-route", "establish-control"].includes(
      action.baseId,
    ) &&
    seat.plan.some((planned) => planned.baseId === action.baseId)
  ) {
    return { ok: false, reason: "That guaranteed Major setup is limited to once this phase." };
  }
  if (
    ["contest", "cross-opening", "suppress-response"].includes(action.baseId) &&
    seat.plan.some((planned) => planned.baseId === action.baseId)
  ) {
    return { ok: false, reason: "That guaranteed Minor foundation is limited to once this phase." };
  }
  if (
    action.baseId === "refocus" &&
    seat.plan.some((planned) => planned.baseId === "refocus")
  ) {
    return { ok: false, reason: "Refocus is limited to once per planning phase." };
  }
  if (
    action.baseId === "swap-weapon" &&
    seat.plan.some((planned) => planned.baseId === "swap-weapon")
  ) {
    return { ok: false, reason: "Reserve swap is limited to once per planning phase." };
  }
  if (
    PAID_REPEAT_LIMIT_IDS.has(action.baseId) &&
    seat.plan.filter((planned) => planned.baseId === action.baseId).length >= 2
  ) {
    return { ok: false, reason: "Identical core or equipment actions are limited to twice." };
  }
  if (seatCommandAvailable(seat) < action.totalReservedCommand) {
    return {
      ok: false,
      reason: `Insufficient Command. Available ${seatCommandAvailable(seat)}, required ${action.totalReservedCommand}.`,
    };
  }
  return { ok: true };
}

export function removeAction(state, seatId, actionInstanceId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.locked) return state;
  const index = seat.plan.findIndex((action) => action.instanceId === actionInstanceId);
  if (index < 0) return state;
  const [removed] = seat.plan.splice(index, 1);
  pushEvidence(next, "action_removed", {
    seatId,
    actionId: removed.baseId,
    actionInstanceId,
  });
  return next;
}

export function attachCard(state, seatId, actionInstanceId, cardId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  const action = seat?.plan.find((candidate) => candidate.instanceId === actionInstanceId);
  const card = CARDS[cardId];
  if (!seat || !action || seat.locked || !card || !seat.hand.includes(cardId)) {
    return state;
  }
  if (
    seat.plan.some(
      (planned) =>
        planned.instanceId !== action.instanceId &&
        planned.attachedCardId === cardId,
    )
  ) {
    return withWarning(
      state,
      `${card.name} is a single-copy controlled test card and is already committed.`,
    );
  }
  if (card.kind === "Action" || !card.compatibility.includes(action.baseId) && !card.compatibility.includes("paid")) {
    return withWarning(state, `${card.name} is not compatible with ${action.name}.`);
  }

  const priorCard = action.attachedCardId ? CARDS[action.attachedCardId] : null;
  const nextModifierCost =
    card.kind === "Contingency" ? 0 : card.cost;
  const nextReserve = card.kind === "Contingency" ? card.cost : 0;
  const priorReserved = priorCard?.cost ?? 0;
  const newReserved = card.cost;
  const availableWithPrior = seatCommandAvailable(seat) + priorReserved;
  if (availableWithPrior < newReserved) {
    return withWarning(state, `Insufficient Command to attach ${card.name}.`);
  }

  action.attachedCardId = cardId;
  action.modifierCost = nextModifierCost;
  action.contingencyReserve = nextReserve;
  action.totalReservedCommand = action.cost + nextModifierCost + nextReserve;
  action.projection.command = `${action.cost} primary + ${card.cost} ${card.kind === "Contingency" ? "reserve" : "modifier"}`;
  action.projection.invalidators =
    card.kind === "Contingency"
      ? `${action.projection.invalidators}; ${card.name} tests if the primary invalidates before beginning`
      : action.projection.invalidators;
  pushEvidence(next, "card_attached", {
    seatId,
    actionInstanceId,
    cardId,
    kind: card.kind,
  });
  return next;
}

export function detachCard(state, seatId, actionInstanceId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  const action = seat?.plan.find((candidate) => candidate.instanceId === actionInstanceId);
  if (!seat || !action || seat.locked || !action.attachedCardId) return state;
  const cardId = action.attachedCardId;
  action.attachedCardId = null;
  action.modifierCost = 0;
  action.contingencyReserve = 0;
  action.totalReservedCommand = action.cost;
  action.projection.command = action.cost;
  pushEvidence(next, "card_detached", { seatId, actionInstanceId, cardId });
  return next;
}

export function setClaimMode(state, seatId, actionInstanceId, claimMode) {
  if (!["Primary", "If Available", "Yielded"].includes(claimMode)) return state;
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  const action = seat?.plan.find((candidate) => candidate.instanceId === actionInstanceId);
  if (!seat || !action || seat.locked || !action.exclusiveClaim) return state;
  action.claimMode = claimMode;
  action.projection.claims = `${claimMode} · ${action.exclusiveClaim}`;
  pushEvidence(next, "claim_mode_changed", {
    seatId,
    actionInstanceId,
    claimMode,
  });
  return next;
}

export function setConsent(state, ownerSeatId, actionInstanceId, granted) {
  const next = clone(state);
  let targetAction = null;
  for (const seat of next.seats) {
    const action = seat.plan.find(
      (candidate) => candidate.instanceId === actionInstanceId,
    );
    if (action) {
      targetAction = action;
      break;
    }
  }
  if (
    !targetAction ||
    targetAction.requiresConsentFromSeatId !== ownerSeatId ||
    next.seats.find((seat) => seat.id === ownerSeatId)?.locked
  ) {
    return state;
  }
  targetAction.consentGranted = Boolean(granted);
  pushEvidence(next, "consent_changed", {
    ownerSeatId,
    actionInstanceId,
    granted: Boolean(granted),
  });
  return next;
}

export function compatibleCardsForAction(seat, action) {
  return seat.hand
    .map((cardId) => CARDS[cardId])
    .filter(
      (card) =>
        card &&
        card.kind !== "Action" &&
        (card.compatibility.includes(action.baseId) ||
          (card.compatibility.includes("paid") && action.paid)),
    );
}

function validatePartyPlans(state) {
  const errors = [];
  for (const seat of state.seats) {
    if (seat.hand.length > CORE_RULES.retainLimit) {
      errors.push(
        `${seat.label} must discard to ${CORE_RULES.retainLimit} before locking.`,
      );
    }
    if (activePlanCost(seat) > seat.command) {
      errors.push(`${seat.label} reserves more Command than it owns.`);
    }
    const missingConsent = seat.plan.find(
      (action) => action.requiresConsentFromSeatId && !action.consentGranted,
    );
    if (missingConsent) {
      errors.push(`${seat.label}: ${missingConsent.name} still needs consent.`);
    }
  }

  const claims = new Map();
  state.seats
    .flatMap((seat) => seat.plan)
    .filter(
      (action) => action.exclusiveClaim && action.claimMode === "Primary",
    )
    .forEach((action) => {
      const key = `${action.exclusiveClaim}|${action.lane}|${action.tempo}`;
      if (!claims.has(key)) claims.set(key, []);
      claims.get(key).push(action);
    });
  for (const [key, actions] of claims.entries()) {
    if (actions.length > 1) {
      errors.push(
        `Conflict: ${actions.length} equal-time Primary claims on ${key.split("|")[0]}. Revise, yield, or mark one If Available.`,
      );
    }
  }
  return errors;
}

export function lockSeatPlan(state, seatId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.locked || state.stage !== "loose-signal") return state;
  const localError = validatePartyPlans(next).find((error) =>
    error.startsWith(seat.label),
  );
  if (localError) {
    seat.lockError = localError;
    return withWarning(next, localError);
  }
  seat.locked = true;
  seat.lockError = "";
  pushEvidence(next, "plan_locked", {
    seatId,
    actions: seat.plan.map((action) => action.baseId),
    commandReserved: activePlanCost(seat),
  });
  return next;
}

export function unlockSeatPlan(state, seatId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat || !seat.locked || state.encounter?.resolutionComplete) return state;
  seat.locked = false;
  pushEvidence(next, "plan_unlocked", { seatId });
  return next;
}

export function canResolvePlans(state) {
  return (
    state.stage === "loose-signal" &&
    state.seats.length > 0 &&
    state.seats.every((seat) => seat.locked) &&
    validatePartyPlans(state).length === 0
  );
}

function enemyActionsForPlan(state) {
  const actions = [];
  const encounter = state.encounter;
  const a = encounter.enemies["skimmer-a"];
  if (a.status === "active") {
    const crossing = state.seats
      .flatMap((seat) => seat.plan)
      .filter((action) => CROSSING_ACTION_IDS.has(action.baseId))
      .sort(compareTiming)[0];
    if (crossing) {
      actions.push({
        instanceId: "enemy-a-intercept",
        id: "crossing-intercept",
        baseId: "crossing-intercept",
        name: "Crossing Intercept",
        actorEnemyId: a.id,
        targetId: crossing.actorSeatId,
        targetActionInstanceId: crossing.instanceId,
        lane: crossing.lane,
        tempo: crossing.tempo,
        paid: false,
        tag: "Instant",
        effect: { impact: 3, force: 1, edgeCollision: 1 },
      });
    } else {
      const farTarget = state.seats.find((seat) => seat.position === "far-platform");
      if (farTarget) {
        actions.push(enemyRazorAction(a.id, farTarget.id, "enemy-a-razor"));
      }
    }
  }
  const b = encounter.enemies["skimmer-b"];
  if (b.status === "active") {
    const access = earliestAccessAction(state);
    actions.push(
      access
        ? {
            instanceId: "enemy-b-access",
            id: "access-clamp",
            baseId: "access-clamp",
            name: "Access Clamp",
            actorEnemyId: b.id,
            targetId: access.actorSeatId,
            targetActionInstanceId: access.instanceId,
            lane: "Standard",
            tempo: 5,
            paid: false,
            tag: "Instant",
            effect: { impact: 2, force: 1, compactCollision: 1 },
          }
        : {
            instanceId: "enemy-b-marker",
            id: "marker-clamp",
            baseId: "marker-clamp",
            name: "Marker Clamp",
            actorEnemyId: b.id,
            targetId: "frontier-marker",
            lane: "Standard",
            tempo: 5,
            paid: false,
            tag: "Instant",
            effect: { impact: 2, force: 1 },
          },
    );
  }
  const c = encounter.enemies["skimmer-c"];
  if (c.status === "active") {
    actions.push(
      enemyRazorAction(c.id, chooseRazorTarget(state), "enemy-c-razor"),
    );
  }
  return actions;
}

function enemyRazorAction(enemyId, targetSeatId, instanceId) {
  return {
    instanceId,
    id: "razor-pass",
    baseId: "razor-pass",
    name: "Razor Pass",
    actorEnemyId: enemyId,
    targetId: targetSeatId,
    lane: "Fast",
    tempo: 7,
    paid: false,
    tag: "Instant",
    effect: { impact: 3, force: 0 },
  };
}

function logEvent(state, packet, action, outcome, detail, tags = []) {
  const event = {
    index: state.encounter.causalLog.length + 1,
    cycle: state.encounter.cycle,
    lane: packet.lane,
    tempo: packet.tempo,
    packet: `${packet.lane}/${packet.tempo}`,
    actionId: action.baseId,
    actor: action.actorEnemyId ?? action.actorSeatId,
    target: action.targetId,
    outcome,
    detail,
    tags,
  };
  state.encounter.causalLog.push(event);
  pushEvidence(state, "resolution_event", event);
}

function findSeat(state, seatId) {
  return state.seats.find((seat) => seat.id === seatId);
}

function findEnemy(state, enemyId) {
  return state.encounter.enemies[enemyId];
}

function actionStartLegal(state, action) {
  if (action.claimMode === "Yielded") {
    return { ok: false, reason: "Claim yielded before beginning" };
  }
  if (action.requiresConsentFromSeatId && !action.consentGranted) {
    return { ok: false, reason: "Required consent missing" };
  }
  if (action.actorEnemyId) {
    const enemy = findEnemy(state, action.actorEnemyId);
    return enemyIsActive(enemy)
      ? { ok: true }
      : { ok: false, reason: "Enemy no longer active" };
  }
  if (
    ["contest", "answer-commitment"].includes(action.baseId) &&
    !state.resolution.actions.some(
      (candidate) =>
        candidate.actorEnemyId === action.targetId &&
        candidate.id === action.effect.intentId,
    )
  ) {
    return { ok: false, reason: "The named visible Commitment changed before lock" };
  }
  if (action.dependsOnActionInstanceId) {
    const dependency = state.resolution.results[action.dependsOnActionInstanceId];
    if (!dependency || dependency.status !== "completed") {
      return {
        ok: false,
        reason: "Projected causal prerequisite did not complete",
      };
    }
  }
  const seat = findSeat(state, action.actorSeatId);
  if (!seat || seat.compromised) {
    return { ok: false, reason: "Actor is Compromised or absent" };
  }
  if (seat.flags.emergencyDisconnectTriggeredFor === action.instanceId) {
    return {
      ok: false,
      reason: "Emergency Disconnect aborted the parent before beginning",
    };
  }
  if (state.resolution.claimWinners[action.exclusiveClaim] && action.claimMode === "If Available") {
    return { ok: false, reason: "Exclusive source already claimed" };
  }
  if (action.targetId?.startsWith("skimmer-")) {
    const enemy = findEnemy(state, action.targetId);
    if (!enemyIsActive(enemy)) {
      return { ok: false, reason: "Target no longer active" };
    }
    if (
      [
        "attack",
        "drive-through",
        "phase-cut",
        "ground-lock",
        "clear-lane",
      ].includes(action.baseId)
    ) {
      const weapon = WEAPONS[seat.activeWeaponId];
      if (physicalDistance(seat.position, enemy.position) > weapon.range) {
        return {
          ok: false,
          reason: `${weapon.name} no longer has a legal range-${weapon.range} line`,
        };
      }
    }
  }
  if (
    action.baseId === "guard" &&
    action.targetId !== seat.id &&
    !sameOrOrdinarilyAdjacent(
      seat.position,
      findSeat(state, action.targetId)?.position,
    )
  ) {
    return { ok: false, reason: "Guard target is no longer adjacent" };
  }
  if (
    action.baseId === "hold-line" &&
    physicalDistance(
      seat.position,
      findEnemy(state, action.targetId)?.position,
    ) > 4
  ) {
    return { ok: false, reason: "Selected Hold Line exceeds four positions" };
  }
  if (
    CROSSING_ACTION_IDS.has(action.baseId) &&
    !["broken-lane-lip", "far-platform"].includes(seat.position)
  ) {
    return { ok: false, reason: "Actor no longer has Opening access" };
  }
  if (
    ["complete-release", "recover-relay-cache"].includes(action.baseId) &&
    seat.position !== "far-platform"
  ) {
    return { ok: false, reason: "Far-side access lost" };
  }
  if (
    action.baseId === "stabilize-plate" &&
    seat.position !== "broken-lane-lip"
  ) {
    return { ok: false, reason: "Broken-Lane Lip access lost" };
  }
  if (
    action.baseId === "lock-frontier-marker" &&
    !sameOrOrdinarilyAdjacent(seat.position, "frontier-marker")
  ) {
    return { ok: false, reason: "Frontier Marker access lost" };
  }
  if (
    [
      "manual-shutter-release",
      "jam-shutter-track",
      "basic-interface",
      "establish-control",
      "execute-output",
    ].includes(action.baseId) &&
    !["shutter-console", "far-platform"].includes(seat.position)
  ) {
    return { ok: false, reason: "Shutter Dependency access lost" };
  }
  if (
    action.baseId === "standard-extract" &&
    (seat.position !== "threshold" ||
      !state.encounter.release.thresholdOpen)
  ) {
    return { ok: false, reason: "Prepared Threshold exit is unavailable" };
  }
  if (
    action.destinationId === "threshold" &&
    !state.encounter.release.thresholdOpen
  ) {
    return { ok: false, reason: "Threshold connection remains closed" };
  }
  if (
    action.baseId === "line-move" &&
    (action.effect.path?.[0] !== seat.position ||
      action.effect.path
        .slice(1)
        .some(
          (positionId, index) =>
            !canReachOrdinary(action.effect.path[index], positionId),
        ) ||
      seat.packages.some((item) => item.slots >= 2))
  ) {
    return {
      ok: false,
      reason: "Traversal Line path or carried-Package clearance became illegal",
    };
  }
  if (
    action.baseId === "complete-release" &&
    state.encounter.shutter.state === "closed"
  ) {
    return { ok: false, reason: "Shutter is closed" };
  }
  if (
    action.baseId === "recover-relay-cache" &&
    (!state.encounter.cache.exposed || state.encounter.cache.recovered)
  ) {
    return { ok: false, reason: "Relay cache is not recoverable" };
  }
  if (
    action.baseId === "execute-output" &&
    seat.majorState?.type !== "temporary-control"
  ) {
    return { ok: false, reason: "Temporary Control unavailable" };
  }
  if (
    action.baseId === "convert-advantage" &&
    seat.majorState?.type !== "battle-advantage"
  ) {
    return { ok: false, reason: "Battle Advantage unavailable" };
  }
  if (
    action.baseId === "exploit-route" &&
    seat.majorState?.type !== "prepared-route"
  ) {
    return { ok: false, reason: "Prepared Route unavailable" };
  }
  return { ok: true };
}

function markPrimaryClaim(state, action) {
  if (!action.exclusiveClaim || action.claimMode !== "Primary") return;
  state.resolution.claimWinners[action.exclusiveClaim] = action.instanceId;
}

function invalidateBeforeBegin(state, packet, action, reason) {
  if (!action.actorEnemyId) {
    const seat = findSeat(state, action.actorSeatId);
    const primaryTotal = action.cost + action.modifierCost;
    const refund = Math.floor(primaryTotal / 2);
    state.encounter.refundsPending[seat.id] += refund;
    if (action.attachedCardId) {
      const card = CARDS[action.attachedCardId];
      if (card.kind === "Contingency") {
        if (card.id === "fallback-guard") {
          seat.temporaryGuard += 3;
          seat.flags.braced = true;
          seat.flags.contingencyReserveSpent = action.contingencyReserve;
        } else if (card.id === "controlled-withdrawal") {
          seat.temporaryGuard += 1;
          const destination = ordinaryNeighbors(seat.position).find(
            (candidate) =>
              positionOccupants(state, candidate).length <
              (POSITIONS[candidate]?.capacity ?? 1),
          );
          if (destination) seat.position = destination;
          seat.flags.contingencyReserveSpent = action.contingencyReserve;
        } else if (card.id === "emergency-disconnect") {
          seat.flags.accessSevered = true;
          seat.flags.contingencyReserveSpent = action.contingencyReserve;
        }
      } else {
        seat.flags.returnContingencyReserve =
          (seat.flags.returnContingencyReserve ?? 0) + action.contingencyReserve;
      }
    }
    logEvent(
      state,
      packet,
      action,
      "invalidated_before_begin",
      `${reason}; refund ${refund} at Settle`,
      ["refund", "start-legality"],
    );
  } else {
    logEvent(
      state,
      packet,
      action,
      "invalidated_before_begin",
      reason,
      ["start-legality"],
    );
  }
  state.resolution.results[action.instanceId] = {
    status: "invalidated_before_begin",
    reason,
  };
}

function spendPlannedCommand(state) {
  state.seats.forEach((seat) => {
    const reserved = activePlanCost(seat);
    seat.command -= reserved;
    seat.committedCards = seat.plan
      .flatMap((action) => [
        ...(action.attachedCardId ? [action.attachedCardId] : []),
        ...(action.baseId === "field-patch" ? ["field-patch"] : []),
      ])
      .filter((cardId, index, list) => list.indexOf(cardId) === index);
  });
}

function applyGuardBreakAndImpact(target, guardBreak, impact) {
  const broken = Math.min(target.guard, Math.max(0, guardBreak));
  target.guard -= broken;
  let remainingImpact = Math.max(0, impact);
  const tempTaken = Math.min(target.temporaryGuard ?? 0, remainingImpact);
  target.temporaryGuard = Math.max(0, (target.temporaryGuard ?? 0) - tempTaken);
  remainingImpact -= tempTaken;
  const guardTaken = Math.min(target.guard, remainingImpact);
  target.guard -= guardTaken;
  remainingImpact -= guardTaken;
  target.condition = Math.max(0, target.condition - remainingImpact);
  return {
    guardBreak: broken,
    temporaryGuardDamage: tempTaken,
    guardDamage: guardTaken,
    conditionDamage: remainingImpact,
  };
}

function compromiseIfNeeded(state, seat, packet, causeAction) {
  if (seat.condition > 0 || seat.compromised) return;
  seat.compromised = true;
  seat.guard = 0;
  seat.temporaryGuard = 0;
  seat.majorState = null;
  seat.rescueSettlesRemaining = 2;
  seat.packages.forEach((item) => {
    state.encounter.packagesOnMap.push({
      ...item,
      position: seat.position,
      droppedBySeatId: seat.id,
    });
  });
  seat.packages = [];
  logEvent(
    state,
    packet,
    causeAction,
    "compromised",
    `${seat.label} reached 0 Condition, lost Major state, and dropped unsecured Packages`,
    ["condition", "rescue-window", "package-drop"],
  );
}

function resolveResponseAction(state, packet, action) {
  if (action.baseId === "contest" || action.baseId === "answer-commitment") {
    const intentId = action.effect.intentId;
    const enemyAction = state.resolution.actions.find(
      (candidate) =>
        candidate.actorEnemyId === action.targetId &&
        candidate.id === intentId,
    );
    if (!enemyAction) {
      return { begun: false, reason: "Named Commitment no longer exists" };
    }
    if (action.baseId === "contest") {
      enemyAction.effect.force = Math.max(0, (enemyAction.effect.force ?? 0) - 2);
      if (action.attachedCardId === "brace-through") {
        enemyAction.effect.force = Math.max(0, enemyAction.effect.force - 1);
        const seat = findSeat(state, action.actorSeatId);
        seat.temporaryGuard += 2;
      }
      logEvent(
        state,
        packet,
        action,
        "completed",
        `Reduced ${enemyAction.name} Force by 2; no Battle Advantage created`,
        ["response", "minor-foundation"],
      );
    } else {
      enemyAction.effect.answeredBy = action.actorSeatId;
      const seat = findSeat(state, action.actorSeatId);
      seat.majorState = {
        type: "battle-advantage",
        name: "Battle Advantage",
        ownerSeatId: seat.id,
        targetId: action.targetId,
        createdCycle: state.encounter.cycle,
        status: "active",
        surviveFirstShift: action.attachedCardId === "hold-the-edge",
      };
      if (action.attachedCardId === "brace-through") {
        enemyAction.effect.force = Math.max(
          0,
          (enemyAction.effect.force ?? 0) - 1,
        );
        seat.temporaryGuard += 2;
      }
      logEvent(
        state,
        packet,
        action,
        "completed",
        `Changed ${enemyAction.name}; created Battle Advantage tied to ${focusLabel(state, action.targetId)}`,
        ["response", "major-setup", "state-created"],
      );
    }
    return { begun: true, handled: true };
  }
  if (action.baseId === "suppress-response") {
    state.encounter.shutter.resealSuppressedUntilCycle =
      state.encounter.cycle +
      (action.attachedCardId === "delay-stack" ? 2 : 1);
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Delayed the visible Reseal Response until after the next Settle; no Control created",
      ["response", "minor-foundation"],
    );
    return { begun: true, handled: true };
  }
  if (action.baseId === "protected-access") {
    const seat = findSeat(state, action.actorSeatId);
    seat.flags.protectedAccess = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Protected one declared Interface or Hacking action from direct-hit invalidation",
      ["protection", "equipment"],
    );
    return { begun: true, handled: true };
  }
  if (action.baseId === "anchor-lock") {
    const seat = findSeat(state, action.actorSeatId);
    seat.flags.anchorLock = 2;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Prevent the first 2 Force before Settle; ends on voluntary movement",
      ["protection", "equipment"],
    );
    return { begun: true, handled: true };
  }
  return { begun: false, handled: false };
}

function resolveProtectionAction(state, packet, action) {
  if (action.baseId !== "guard") return false;
  const actor = findSeat(state, action.actorSeatId);
  const target = findSeat(state, action.targetId);
  if (!target || target.id === actor.id) {
    const cap = ARMOR[actor.armorId].guardCap;
    const restored = Math.min(4, cap - actor.guard);
    actor.guard += restored;
    actor.flags.braced = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Restored ${restored} Guard to ${actor.guard}/${cap}; Braced against one visible Commitment`,
      ["protection", "guard"],
    );
  } else {
    target.temporaryGuard += 3;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Granted ${target.label} 3 temporary Guard`,
      ["protection", "guard", "consent"],
    );
  }
  return true;
}

function resolveDamageAction(state, packet, action) {
  if (action.actorEnemyId) {
    if (action.effect.answeredBy) {
      logEvent(
        state,
        packet,
        action,
        "answered",
        `${action.name} normal result prevented by Answer Commitment`,
        ["commitment", "answered"],
      );
      return true;
    }
    if (action.id === "access-clamp" && action.targetActionInstanceId) {
      const parent = state.resolution.actions.find(
        (candidate) =>
          candidate.instanceId === action.targetActionInstanceId,
      );
      if (parent?.attachedCardId === "emergency-disconnect") {
        const target = findSeat(state, parent.actorSeatId);
        target.flags.emergencyDisconnectTriggeredFor = parent.instanceId;
        logEvent(
          state,
          packet,
          action,
          "prevented",
          `Emergency Disconnect ignored Access Clamp and will abort ${parent.name} before beginning`,
          ["system-response", "contingency", "access-severed"],
        );
        return true;
      }
    }
    if (action.targetId === "frontier-marker") {
      const marker = state.encounter.marker;
      const force = Math.max(
        0,
        action.effect.force - (marker.locked ? 1 : 0),
      );
      if (marker.locked) {
        marker.integrity = Math.max(0, marker.integrity - action.effect.impact);
        marker.dislodged = marker.integrity <= 0;
        marker.surveyAvailable = !marker.dislodged;
      } else if (force > 0) {
        marker.dislodged = true;
        marker.surveyAvailable = false;
      } else {
        marker.integrity = Math.max(0, marker.integrity - action.effect.impact);
      }
      logEvent(
        state,
        packet,
        action,
        "completed",
        marker.dislodged
          ? "Frontier Marker dislodged; Crossing Survey lost"
          : `Frontier Marker held at ${marker.integrity} Integrity`,
        ["enemy", "marker", "force"],
      );
      return true;
    }
    const target = findSeat(state, action.targetId);
    if (!target) return false;
    let force = action.effect.force ?? 0;
    if (target.flags.anchorLock) {
      const prevented = Math.min(force, target.flags.anchorLock);
      force -= prevented;
      target.flags.anchorLock -= prevented;
    }
    if (target.flags.braced) force = Math.max(0, force - 1);
    force = Math.max(0, force - (target.forceResistance ?? 0));
    let impact = action.effect.impact ?? 0;
    if (action.id === "crossing-intercept") {
      const safeLanding = target.plan.find(
        (planned) =>
          planned.instanceId === action.targetActionInstanceId &&
          planned.attachedCardId === "safe-landing",
      );
      const approachReduction = state.encounter.plate.crossingCollisionReduction;
      if (safeLanding) {
        impact = Math.max(0, impact - 2);
        force = Math.max(0, force - 1);
      }
      const collision =
        Math.max(0, (action.effect.edgeCollision ?? 0) - approachReduction) *
        (force > 0 ? 1 : 0);
      impact += collision;
    }
    if (action.id === "access-clamp" && force > 0) {
      impact += action.effect.compactCollision ?? 0;
      force = 0;
    }
    const damage = applyGuardBreakAndImpact(target, 0, impact);
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${target.label}: ${damage.temporaryGuardDamage + damage.guardDamage} Guard and ${damage.conditionDamage} Condition lost${force ? `; Force ${force} remains` : ""}`,
      ["enemy", "impact", ...(force ? ["force"] : [])],
    );
    compromiseIfNeeded(state, target, packet, action);
    return true;
  }

  if (
    ["attack", "drive-through", "phase-cut", "ground-lock", "clear-lane"].includes(
      action.baseId,
    )
  ) {
    const enemy = findEnemy(state, action.targetId);
    if (!enemy) return false;
    let guardBreak = action.effect.guardBreak ?? 0;
    if (WEAPONS[findSeat(state, action.actorSeatId).activeWeaponId].id === "static-driver") {
      guardBreak = 4;
    }
    const broken = Math.min(enemy.guard, guardBreak);
    enemy.guard -= broken;
    const guardImpact = Math.min(enemy.guard, action.effect.impact ?? 0);
    enemy.guard -= guardImpact;
    const conditionImpact = Math.max(
      0,
      (action.effect.impact ?? 0) - guardImpact,
    );
    enemy.condition = Math.max(0, enemy.condition - conditionImpact);
    if (enemy.condition <= 0) {
      enemy.status = "defeated";
    }
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${enemy.name}: ${broken} Guard Break, ${guardImpact} Guard damage, ${conditionImpact} Condition damage; ${enemy.status}`,
      ["attack", "impact", ...(broken ? ["guard-break"] : [])],
    );
    return true;
  }
  return false;
}

function resolveMovementAction(state, packet, action) {
  if (
    ![
      "reposition",
      "additional-movement",
      "cross-opening",
      "cross-plate",
      "follow-route",
      "exploit-route",
      "backtrack",
      "line-move",
      "emergency-drag",
    ].includes(action.baseId)
  ) {
    return false;
  }
  const seat = findSeat(state, action.actorSeatId);
  if (
    state.resolution.blockedMovementInstances?.includes(action.instanceId)
  ) {
    logEvent(
      state,
      packet,
      action,
      "failed_after_begin",
      "Equal-time unlinked moves contested one capacity-one destination; nobody enters",
      ["movement", "capacity-conflict"],
    );
    return true;
  }
  const destinationId =
    action.destinationId ??
    (action.baseId === "line-move"
      ? ordinaryNeighbors(seat.position)[0]
      : null);
  if (!destinationId) {
    logEvent(state, packet, action, "failed_after_begin", "No legal destination selected", [
      "movement",
    ]);
    return true;
  }
  const capacity = POSITIONS[destinationId]?.capacity ?? 1;
  const packetMoves = state.resolution.packetMoves ?? {};
  const competing = packetMoves[destinationId] ?? [];
  competing.push(action.instanceId);
  packetMoves[destinationId] = competing;
  state.resolution.packetMoves = packetMoves;
  if (
    competing.length > 1 &&
    capacity === 1 &&
    !action.requiresConsentFromSeatId
  ) {
    logEvent(
      state,
      packet,
      action,
      "failed_after_begin",
      "Equal-time unlinked moves contested one capacity-one destination; nobody enters",
      ["movement", "capacity-conflict"],
    );
    return true;
  }
  const initialPositions = state.resolution.packetInitialPositions ?? {};
  const departingSeatIds = new Set(
    state.resolution.packetDepartingSeatIds ?? [],
  );
  const blockingOccupants = positionOccupants(state, destinationId).filter(
    (occupant) =>
      !(
        initialPositions[occupant.id] === destinationId &&
        departingSeatIds.has(occupant.id)
      ),
  );
  if (blockingOccupants.length >= capacity) {
    logEvent(
      state,
      packet,
      action,
      "failed_after_begin",
      "Destination became occupied; actor stops at the last legal position",
      ["movement", "capacity"],
    );
    return true;
  }
  if (seat.compromised) {
    logEvent(
      state,
      packet,
      action,
      "failed_after_begin",
      "Transit failed because the actor became Compromised",
      ["movement", "compromised"],
    );
    return true;
  }
  seat.position = destinationId;
  if (seat.flags.anchorLock) seat.flags.anchorLock = 0;
  if (action.attachedCardId === "covering-step") seat.temporaryGuard += 2;
  if (action.attachedCardId === "backtrack-marker") {
    seat.flags.backtrack = {
      originId: state.resolution.packetInitialPositions[seat.id],
      destinationId,
      openingId: action.sourceId,
      createdCycle: state.encounter.cycle,
    };
  }
  if (action.baseId === "backtrack") {
    seat.flags.backtrack = null;
    seat.flags.holdLine = null;
  }
  if (action.baseId === "exploit-route") {
    seat.majorState = null;
  }
  if (action.baseId === "follow-route") {
    const owner = state.seats.find(
      (candidate) =>
        candidate.majorState?.type === "prepared-route" &&
        candidate.majorState.followPassages > 0,
    );
    if (owner) owner.majorState.followPassages -= 1;
  }
  logEvent(
    state,
    packet,
    action,
    "completed",
    `${seat.label} moved to ${focusLabel(state, destinationId)}`,
    ["movement", action.tag.toLowerCase()],
  );
  if (action.includedActionId === "complete-release") {
    state.encounter.release.work = 1;
    state.encounter.release.pendingValidation = true;
    logEvent(
      state,
      packet,
      action,
      "included_action_completed",
      "Exploit destination action added 1 Release Work",
      ["work", "objective"],
    );
  }
  return true;
}

function resolveCompletionAction(state, packet, action) {
  const seat = action.actorSeatId ? findSeat(state, action.actorSeatId) : null;
  if (action.baseId === "hold-line") {
    seat.flags.holdLine = {
      targetEnemyId: action.targetId,
      lineEndPosition: findEnemy(state, action.targetId)?.position,
      impact: 3,
      remainingTriggers: 1,
      createdCycle: state.encounter.cycle,
    };
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Prepared one range-four line; its first visible hostile crossing before Settle will receive 3 Impact",
      ["equipment", "preparation", "line"],
    );
    return true;
  }
  if (action.baseId === "lock-frontier-marker") {
    state.encounter.marker.locked = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Frontier Marker locked: +1 Force resistance; direct damage still applies",
      ["work", "anchor"],
    );
    return true;
  }
  if (action.baseId === "stabilize-plate") {
    state.encounter.plate.stabilized = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Maintenance Plate stabilized; Cross Plate is now source-bound and legal",
      ["work", "opening"],
    );
    return true;
  }
  if (
    action.baseId === "manual-shutter-release" ||
    action.baseId === "basic-interface"
  ) {
    state.encounter.shutter.state = "open-until-settle";
    if (
      action.baseId === "basic-interface" &&
      action.attachedCardId === "delay-stack"
    ) {
      state.encounter.shutter.resealSuppressedUntilCycle =
        state.encounter.cycle + 1;
    }
    if (
      action.baseId === "basic-interface" &&
      seat.flags.traceEcho?.componentId === "shutter-console"
    ) {
      seat.flags.traceEcho = null;
    }
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Shutter opened for this resolution; Reseal Response remains visible",
      ["infrastructure", "reseal"],
    );
    return true;
  }
  if (action.baseId === "jam-shutter-track") {
    state.encounter.shutter.state = "jammed-open";
    state.encounter.shutter.intact = false;
    state.encounter.shutter.hackingOutputsAvailable = false;
    state.encounter.cache.destroyed = true;
    state.encounter.cache.exposed = false;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Shutter jammed open; cache destroyed; Hacking Outputs removed",
      ["infrastructure", "work", "sacrifice"],
    );
    return true;
  }
  if (action.baseId === "complete-release") {
    state.encounter.release.work = 1;
    state.encounter.release.pendingValidation = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Release Work complete; validation waits for Settle, open shutter, and entered-threat clear",
      ["objective", "work", "pending"],
    );
    return true;
  }
  if (action.baseId === "recover-relay-cache") {
    const used = seat.packages.reduce((sum, item) => sum + item.slots, 0);
    if (used + 1 > CORE_RULES.exposedPackageSlots) {
      logEvent(
        state,
        packet,
        action,
        "failed_after_begin",
        "Package capacity exceeded; no automatic replacement occurred",
        ["package", "capacity"],
      );
      return true;
    }
    seat.packages.push({
      id: "relay-needle",
      name: "Relay Needle",
      slots: 1,
      ownerSeatId: seat.id,
      exposed: true,
    });
    state.encounter.cache.recovered = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${seat.label} recovered Relay Needle; ownership remains personal`,
      ["package", "exclusive-claim"],
    );
    return true;
  }
  if (action.baseId === "prepare-route") {
    const destinationId =
      seat.position === "far-platform" ? "broken-lane-lip" : "far-platform";
    seat.majorState = {
      type: "prepared-route",
      name: "Prepared Route",
      ownerSeatId: seat.id,
      openingId: SPECIAL_EDGE.id,
      originId: seat.position,
      destinationId,
      exploitPassages: 1,
      followPassages: action.attachedCardId === "route-capacity" ? 2 : 1,
      createdCycle: state.encounter.cycle,
      status: "active",
      destinationClaim:
        action.attachedCardId === "destination-claim",
    };
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Prepared Route ${seat.position} → ${destinationId}; one Exploit and ${seat.majorState.followPassages} Follow passage(s)`,
      ["major-setup", "route", "state-created"],
    );
    return true;
  }
  if (action.baseId === "establish-control") {
    if (!state.encounter.shutter.hackingOutputsAvailable) {
      logEvent(
        state,
        packet,
        action,
        "failed_after_begin",
        "Shutter track damage removed the bounded Output set",
        ["control", "infrastructure"],
      );
      return true;
    }
    seat.majorState = {
      type: "temporary-control",
      name: "Temporary Control",
      ownerSeatId: seat.id,
      dependencyId: "shutter-dependency",
      accessPosition: seat.position,
      createdCycle: state.encounter.cycle,
      status: "active",
    };
    state.encounter.shutter.controlledBySeatId = seat.id;
    logEvent(
      state,
      packet,
      action,
      "completed",
      "Established character-owned Temporary Control over the Shutter Dependency",
      ["major-setup", "control", "state-created"],
    );
    return true;
  }
  if (action.baseId === "execute-output") {
    if (action.outputId === "hold-open") {
      state.encounter.shutter.state = "controlled-open";
    }
    if (action.outputId === "expose-cache") {
      state.encounter.shutter.state = "controlled-open";
      state.encounter.cache.exposed = true;
      seat.flags.pendingOutputDisruption = action.attachedCardId === "clean-buffer" ? 0 : 1;
    }
    if (action.outputId === "blind-repeater") {
      state.encounter.reinforcementPrevented = true;
      state.encounter.shutter.state = "output-window";
      state.encounter.shutter.outputWindowEndsAfterCycle =
        state.encounter.cycle + 1;
      const c = state.encounter.enemies["skimmer-c"];
      if (c.status === "pending") c.status = "prevented";
    }
    if (action.attachedCardId === "trace-echo") {
      seat.flags.traceEcho = {
        componentId: "shutter-console",
        responseConfirmed: true,
        commandReduction: 2,
      };
    }
    seat.majorState = null;
    state.encounter.shutter.controlledBySeatId = null;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Executed bounded Output: ${action.outputId}; Temporary Control spent`,
      ["major-payoff", "control", "state-spent"],
    );
    return true;
  }
  if (action.baseId === "convert-advantage") {
    const enemy = findEnemy(state, action.targetId);
    if (action.payoffId === "drive") {
      enemy.status = "driven";
      enemy.intactActuator = false;
    } else if (action.payoffId === "pin") {
      enemy.status = "pinned";
      enemy.pinnedUntilSettle = state.encounter.cycle + 1;
    } else if (action.payoffId === "disarm") {
      if (enemy.guard > 0) {
        logEvent(
          state,
          packet,
          action,
          "failed_after_begin",
          "Controlled Disarm lacked zero Guard or authored exposure",
          ["major-payoff", "requirement"],
        );
        return true;
      }
      enemy.status = "disabled";
      enemy.intactActuator = true;
    }
    seat.majorState = null;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${action.name} resolved; Battle Advantage spent`,
      ["major-payoff", "state-spent"],
    );
    return true;
  }
  if (action.baseId === "field-patch") {
    const target = findSeat(state, action.targetId) ?? seat;
    let restored = 3;
    if (target.armorId === "recovery-mesh" && !target.recoveryMeshUsed) {
      restored += 1;
      target.recoveryMeshUsed = true;
    }
    const actual = Math.min(restored, CORE_RULES.condition - target.condition);
    target.condition += actual;
    seat.fieldPatchUsed = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${target.label} restored ${actual} Condition`,
      ["prepared-card", "condition"],
    );
    return true;
  }
  if (action.baseId === "refocus") {
    const cardId = action.refocusCardIds[0];
    const index = seat.hand.indexOf(cardId);
    if (index >= 0) {
      seat.hand.splice(index, 1);
      seat.discard.push(cardId);
      if (seat.drawIndex < seat.deck.length) {
        seat.hand.push(seat.deck[seat.drawIndex]);
        seat.drawIndex += 1;
      }
    }
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Refocused ${CARDS[cardId]?.name ?? cardId}; drew one replacement`,
      ["prepared-card", "refocus"],
    );
    return true;
  }
  if (action.baseId === "swap-weapon") {
    const prior = seat.activeWeaponId;
    seat.activeWeaponId = seat.reserveWeaponId;
    seat.reserveWeaponId = prior;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${WEAPONS[seat.activeWeaponId].name} is now active; no Attack included`,
      ["equipment", "swap"],
    );
    return true;
  }
  if (action.baseId === "assist") {
    const supportedSeat = findSeat(state, action.targetId);
    const supported = supportedSeat?.plan.find(
      (candidate) => candidate.instanceId === action.supportedActionInstanceId,
    );
    if (!supported) {
      logEvent(
        state,
        packet,
        action,
        "invalidated_before_begin",
        "Supported action no longer exists",
        ["assist"],
      );
      return true;
    }
    supported.effect.assistWork = ["work-objective", "complete-release", "stabilize-plate"].includes(
      supported.baseId,
    )
      ? 1
      : 0;
    supportedSeat.temporaryGuard +=
      action.attachedCardId === "linked-effort" ? 2 : 0;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `Assist attached to ${supportedSeat.label}'s ${supported.name}`,
      ["assist", "consent"],
    );
    return true;
  }
  if (action.baseId === "stabilize") {
    const target = findSeat(state, action.targetId);
    if (!target?.compromised) return false;
    target.compromised = false;
    target.condition =
      target.armorId === "recovery-mesh" ? 5 : 4;
    target.guard = 0;
    target.disruption += 1;
    target.rescueSettlesRemaining = null;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${target.label} will return next planning phase at ${target.condition} Condition, 0 Guard, +1 Disruption`,
      ["rescue", "stabilize"],
    );
    return true;
  }
  if (action.baseId === "standard-extract") {
    if (
      seat.position !== "threshold" ||
      !state.encounter.release.thresholdOpen ||
      seat.compromised
    ) {
      logEvent(
        state,
        packet,
        action,
        "failed_after_begin",
        "Sustained Extract lost its legal exit or actor requirement",
        ["extract", "sustained"],
      );
      return true;
    }
    if (action.attachedCardId === "last-exit") {
      const secured = seat.packages.find(
        (item) => item.slots === 1 && item.exposed,
      );
      if (secured) secured.securedByLastExit = true;
    }
    seat.flags.extracted = true;
    logEvent(
      state,
      packet,
      action,
      "completed",
      `${seat.label} extracted with owned carried Packages`,
      ["extract", "package"],
    );
    return true;
  }
  return false;
}

export function resolvePlans(state) {
  if (!canResolvePlans(state)) {
    return withWarning(
      state,
      validatePartyPlans(state)[0] ??
        "Every seat must lock its own valid plan before resolution.",
    );
  }
  const next = clone(state);
  next.stageLabel = `Loose Signal Crossing · Cycle ${next.encounter.cycle} resolution`;
  next.encounter.resolutionComplete = false;
  next.resolution = {
    actions: [],
    results: {},
    claimWinners: {},
    packetMoves: {},
  };
  spendPlannedCommand(next);
  const playerActions = next.seats.flatMap((seat) => seat.plan);
  const enemyActions = enemyActionsForPlan(next);
  const actions = [...playerActions, ...enemyActions].sort(compareTiming);
  next.resolution.actions = actions;

  const packets = [];
  for (const action of actions) {
    const key = `${action.lane}/${action.tempo}`;
    let packet = packets.find((candidate) => candidate.key === key);
    if (!packet) {
      packet = {
        key,
        lane: action.lane,
        tempo: action.tempo,
        actions: [],
      };
      packets.push(packet);
    }
    packet.actions.push(action);
  }
  packets.sort((left, right) =>
    compareTiming(
      { lane: left.lane, tempo: left.tempo, instanceId: left.key },
      { lane: right.lane, tempo: right.tempo, instanceId: right.key },
    ),
  );

  for (const packet of packets) {
    next.resolution.packetMoves = {};
    next.resolution.packetInitialPositions = Object.fromEntries(
      next.seats.map((seat) => [seat.id, seat.position]),
    );
    const begun = [];
    const conditional = packet.actions.filter(
      (action) => action.dependsOnActionInstanceId,
    );
    for (const action of packet.actions.filter(
      (candidate) => !candidate.dependsOnActionInstanceId,
    )) {
      const legality = actionStartLegal(next, action);
      if (!legality.ok) {
        invalidateBeforeBegin(next, packet, action, legality.reason);
        continue;
      }
      markPrimaryClaim(next, action);
      begun.push(action);
      next.resolution.results[action.instanceId] = { status: "begun" };
    }

    const movementActions = begun.filter((action) =>
        [
          "reposition",
          "additional-movement",
          "cross-opening",
          "cross-plate",
          "follow-route",
          "exploit-route",
          "backtrack",
          "line-move",
          "emergency-drag",
        ].includes(action.baseId),
      );
    next.resolution.packetDepartingSeatIds = movementActions
      .filter((action) => action.destinationId)
      .map((action) => action.actorSeatId);
    const destinationClaims = new Map();
    movementActions.forEach((action) => {
        if (!action.destinationId) return;
        if (!destinationClaims.has(action.destinationId)) {
          destinationClaims.set(action.destinationId, []);
        }
        destinationClaims.get(action.destinationId).push(action.instanceId);
      });
    next.resolution.blockedMovementInstances = [];
    destinationClaims.forEach((instances, destinationId) => {
      if (
        positionOccupants(next, destinationId).filter(
          (occupant) =>
            !(
              next.resolution.packetInitialPositions[occupant.id] ===
                destinationId &&
              next.resolution.packetDepartingSeatIds.includes(occupant.id)
            ),
        ).length +
          instances.length >
        (POSITIONS[destinationId]?.capacity ?? 1)
      ) {
        instances.forEach((instanceId) =>
          next.resolution.blockedMovementInstances.push(instanceId),
        );
      }
    });

    const handled = new Set();
    begun.forEach((action) => {
      const result = resolveResponseAction(next, packet, action);
      if (result.handled) handled.add(action.instanceId);
    });
    begun.forEach((action) => {
      if (!handled.has(action.instanceId) && resolveProtectionAction(next, packet, action)) {
        handled.add(action.instanceId);
      }
    });
    begun.forEach((action) => {
      if (!handled.has(action.instanceId) && resolveDamageAction(next, packet, action)) {
        handled.add(action.instanceId);
      }
    });
    begun.forEach((action) => {
      if (!handled.has(action.instanceId) && resolveMovementAction(next, packet, action)) {
        handled.add(action.instanceId);
      }
    });
    begun.forEach((action) => {
      if (!handled.has(action.instanceId) && resolveCompletionAction(next, packet, action)) {
        handled.add(action.instanceId);
      }
    });
    begun.forEach((action) => {
      if (!handled.has(action.instanceId)) {
        logEvent(
          next,
          packet,
          action,
          "completed",
          "Action completed with no additional LS-01 state change",
          ["no-op"],
        );
      }
      next.resolution.results[action.instanceId] = {
        status: "completed",
      };
    });

    const pendingConditional = [...conditional];
    while (pendingConditional.length > 0) {
      let progressed = false;
      for (
        let index = pendingConditional.length - 1;
        index >= 0;
        index -= 1
      ) {
        const action = pendingConditional[index];
        const dependency =
          next.resolution.results[action.dependsOnActionInstanceId];
        if (!dependency) continue;
        pendingConditional.splice(index, 1);
        progressed = true;
        const legality = actionStartLegal(next, action);
        if (!legality.ok) {
          invalidateBeforeBegin(next, packet, action, legality.reason);
          continue;
        }
        markPrimaryClaim(next, action);
        let handled = false;
        const response = resolveResponseAction(next, packet, action);
        handled = response.handled;
        if (!handled) handled = resolveProtectionAction(next, packet, action);
        if (!handled) handled = resolveDamageAction(next, packet, action);
        if (!handled) handled = resolveMovementAction(next, packet, action);
        if (!handled) handled = resolveCompletionAction(next, packet, action);
        if (!handled) {
          logEvent(
            next,
            packet,
            action,
            "completed",
            "Conditional action completed with no additional LS-01 state change",
            ["causal-conditional"],
          );
        }
        next.resolution.results[action.instanceId] = { status: "completed" };
      }
      if (!progressed) {
        pendingConditional.forEach((action) =>
          invalidateBeforeBegin(
            next,
            packet,
            action,
            "Projected causal prerequisite could not complete before this packet",
          ),
        );
        pendingConditional.length = 0;
      }
    }
  }

  next.encounter.resolutionComplete = true;
  next.stageLabel = `Loose Signal Crossing · Cycle ${next.encounter.cycle} resolved`;
  pushEvidence(next, "resolution_completed", {
    cycle: next.encounter.cycle,
    packetCount: packets.length,
    actionCount: actions.length,
  });
  return next;
}

function allEnteredThreatsClear(encounter) {
  return encounter.enteredEnemyIds.every((enemyId) =>
    ENTERED_CLEAR_STATUSES.has(encounter.enemies[enemyId].status),
  );
}

function addRazorActuatorIfEligible(state) {
  const intact = state.encounter.enteredEnemyIds
    .map((enemyId) => state.encounter.enemies[enemyId])
    .find(
      (enemy) =>
        ENTERED_CLEAR_STATUSES.has(enemy.status) && enemy.intactActuator,
    );
  if (!intact) return;
  const recipient = state.seats.find(
    (seat) =>
      seat.packages.reduce((sum, item) => sum + item.slots, 0) <
      CORE_RULES.exposedPackageSlots,
  );
  if (!recipient) {
    state.encounter.packagesOnMap.push({
      id: "razor-actuator",
      name: "Razor Actuator",
      slots: 1,
      position: "far-platform",
      ownerSeatId: null,
    });
    return;
  }
  if (!recipient.packages.some((item) => item.id === "razor-actuator")) {
    recipient.packages.push({
      id: "razor-actuator",
      name: "Razor Actuator",
      slots: 1,
      ownerSeatId: recipient.id,
      exposed: true,
    });
  }
}

function discardCommittedCards(seat) {
  for (const cardId of seat.committedCards) {
    const index = seat.hand.indexOf(cardId);
    if (index >= 0) {
      seat.hand.splice(index, 1);
      seat.discard.push(cardId);
    }
  }
  seat.committedCards = [];
}

function drawAtSettle(seat) {
  const drawn = [];
  for (
    let index = 0;
    index < CORE_RULES.drawPerSettle && seat.drawIndex < seat.deck.length;
    index += 1
  ) {
    const cardId = seat.deck[seat.drawIndex];
    seat.drawIndex += 1;
    seat.hand.push(cardId);
    drawn.push(cardId);
  }
  return drawn;
}

function settleReinforcement(state) {
  const c = state.encounter.enemies["skimmer-c"];
  if (
    state.encounter.release.validated ||
    state.encounter.reinforcementPrevented ||
    c.status !== "pending"
  ) {
    return null;
  }
  const arrivalAfterSettle = state.seats.length === 1 ? 2 : 1;
  if (state.encounter.cycle === arrivalAfterSettle) {
    c.status = "active";
    c.entered = true;
    state.encounter.enteredEnemyIds.push(c.id);
    return c.id;
  }
  return null;
}

export function settleCycle(state) {
  if (
    state.stage !== "loose-signal" ||
    !state.encounter?.resolutionComplete
  ) {
    return state;
  }
  const next = clone(state);
  const cycle = next.encounter.cycle;

  next.seats.forEach((seat) => {
    const refund = next.encounter.refundsPending[seat.id] ?? 0;
    const returnedReserve = seat.plan.reduce((sum, action) => {
      if (!action.contingencyReserve) return sum;
      const result = next.resolution.results[action.instanceId];
      const triggered =
        result?.status === "invalidated_before_begin" &&
        [
          "fallback-guard",
          "controlled-withdrawal",
          "emergency-disconnect",
        ].includes(action.attachedCardId);
      return sum + (triggered ? 0 : action.contingencyReserve);
    }, 0);
    seat.command += refund + returnedReserve;
    discardCommittedCards(seat);
    seat.temporaryGuard = 0;
    seat.flags.braced = false;
    seat.flags.anchorLock = 0;
    seat.flags.backtrack = null;
    seat.flags.accessSevered = false;
    seat.flags.emergencyDisconnectTriggeredFor = null;
    if (seat.flags.pendingOutputDisruption) {
      const amount = seat.flags.pendingOutputDisruption;
      if (seat.armorId === "insulated-shell" && !seat.insulatedShellUsed) {
        seat.insulatedShellUsed = true;
      } else {
        seat.disruption += amount;
      }
      seat.flags.pendingOutputDisruption = 0;
    }
  });

  const resealSuppressed =
    next.encounter.shutter.resealSuppressedUntilCycle !== null &&
    next.encounter.shutter.resealSuppressedUntilCycle > cycle;
  if (
    next.encounter.shutter.state === "open-until-settle" &&
    !resealSuppressed
  ) {
    next.encounter.shutter.state = "closed";
    logEvent(
      next,
      { lane: "Settle", tempo: 0 },
      {
        baseId: "reseal-response",
        actorEnemyId: "shutter-dependency",
        targetId: "shutter-console",
      },
      "completed",
      "Reseal Response closed the shutter before Release validation",
      ["settle", "system-response"],
    );
  }

  if (next.encounter.release.pendingValidation) {
    const shutterOpen = next.encounter.shutter.state !== "closed";
    const threatsClear = allEnteredThreatsClear(next.encounter);
    if (shutterOpen && threatsClear) {
      next.encounter.release.validated = true;
      next.encounter.release.thresholdOpen = true;
      next.encounter.release.blockedReason = "";
      addRazorActuatorIfEligible(next);
      logEvent(
        next,
        { lane: "Settle", tempo: 0 },
        {
          baseId: "release-validation",
          actorEnemyId: "world",
          targetId: "threshold",
        },
        "completed",
        "Release validated; Threshold opened after the current resolution",
        ["settle", "objective", "segment-complete"],
      );
    } else {
      next.encounter.release.blockedReason = !shutterOpen
        ? "Shutter resealed before validation"
        : "Entered hostile pressure remains active";
      logEvent(
        next,
        { lane: "Settle", tempo: 0 },
        {
          baseId: "release-validation",
          actorEnemyId: "world",
          targetId: "threshold",
        },
        "blocked",
        next.encounter.release.blockedReason,
        ["settle", "objective", "source-rule"],
      );
    }
  }

  const reinforcementId = settleReinforcement(next);
  if (reinforcementId) {
    logEvent(
      next,
      { lane: "Settle", tempo: 0 },
      {
        baseId: "reinforcement-arrival",
        actorEnemyId: reinforcementId,
        targetId: "upper-trace-rail",
      },
      "completed",
      `${next.encounter.enemies[reinforcementId].name} entered and acts next cycle`,
      ["settle", "visible-concurrency"],
    );
  }

  next.seats.forEach((seat) => {
    if (seat.compromised && seat.rescueSettlesRemaining !== null) {
      seat.rescueSettlesRemaining -= 1;
      if (seat.rescueSettlesRemaining <= 0) {
        seat.flags.evacuated = true;
        seat.disruption += 2;
      }
    }
  });

  if (next.encounter.release.thresholdOpen) {
    next.stage = "segment-settle";
    next.stageLabel = "Loose Signal complete · Segment Settle";
    next.seats.forEach((seat) => {
      seat.plan = [];
      seat.locked = false;
    });
    pushEvidence(next, "segment_complete", {
      cycle,
      survey: next.encounter.marker.surveyAvailable,
      shutter: next.encounter.shutter.intact ? "Intact" : "Damaged",
      packages: next.seats.flatMap((seat) =>
        seat.packages.map((item) => ({ ownerSeatId: seat.id, packageId: item.id })),
      ),
    });
    return next;
  }

  next.encounter.cycle += 1;
  next.encounter.resolutionComplete = false;
  next.encounter.refundsPending = Object.fromEntries(
    next.seats.map((seat) => [seat.id, 0]),
  );
  next.resolution = null;
  next.seats.forEach((seat) => {
    const before = seat.command;
    const uncapped = before + CORE_RULES.commandIncome;
    seat.command = Math.min(CORE_RULES.commandCap, uncapped);
    const overflow = Math.max(0, uncapped - CORE_RULES.commandCap);
    const drawn = drawAtSettle(seat);
    seat.plan = [];
    seat.locked = false;
    seat.lockError = "";
    if (overflow) {
      next.warnings.push(`${seat.label} lost ${overflow} Command to the 32 cap.`);
    }
    if (seat.hand.length > CORE_RULES.retainLimit) {
      next.warnings.push(
        `${seat.label} must discard to ${CORE_RULES.retainLimit} before locking the next plan.`,
      );
    }
    pushEvidence(next, "settle_income_draw", {
      seatId: seat.id,
      commandBefore: before,
      income: CORE_RULES.commandIncome,
      commandAfter: seat.command,
      overflow,
      drawn,
    });
  });
  next.stageLabel = `Loose Signal Crossing · Cycle ${next.encounter.cycle} planning`;
  pushEvidence(next, "settle_completed", {
    cycle,
    nextCycle: next.encounter.cycle,
  });
  return next;
}

export function discardCard(state, seatId, cardId) {
  const next = clone(state);
  const seat = next.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.locked || seat.hand.length <= CORE_RULES.retainLimit) {
    return state;
  }
  const index = seat.hand.indexOf(cardId);
  if (index < 0) return state;
  seat.hand.splice(index, 1);
  seat.discard.push(cardId);
  pushEvidence(next, "card_discarded_to_limit", { seatId, cardId });
  return next;
}

export function chooseSegmentDecision(state, decision) {
  if (state.stage !== "segment-settle") return state;
  const allowed = ["continue", "retreat", "extract-record"];
  if (!allowed.includes(decision)) return state;
  const next = clone(state);
  next.segmentDecision = decision;
  next.stage = "complete";
  next.stageLabel =
    decision === "continue"
      ? "Evidence boundary reached · Quiet Shift is outside this PR"
      : decision === "retreat"
        ? "Private resettable profile · retreat recorded"
        : "Private resettable profile · extraction evidence recorded";
  pushEvidence(next, "segment_decision", {
    decision,
    protectionAvailable:
      "No protected Safe Node claims exist in this segment; carried Packages remain exposed.",
  });
  return next;
}

export function getFocuses(state) {
  if (!state.encounter) return [];
  const positionFocuses = Object.values(POSITIONS).map((position) => ({
    id: position.id,
    name: position.name,
    kind: position.kind,
    x: position.x,
    y: position.y,
    status:
      position.id === "frontier-marker"
        ? state.encounter.marker.dislodged
          ? "lost"
          : `${state.encounter.marker.integrity} Integrity`
        : position.id === "shutter-console"
          ? state.encounter.shutter.state
          : position.id === "relay-cache"
            ? state.encounter.cache.destroyed
              ? "destroyed"
              : state.encounter.cache.recovered
                ? "recovered"
                : state.encounter.cache.exposed
                  ? "exposed"
                  : "sealed"
            : position.id === "threshold"
              ? state.encounter.release.thresholdOpen
                ? "open"
                : "closed"
              : "available",
  }));
  const enemyFocuses = Object.values(state.encounter.enemies).map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    kind: "Enemy",
    x:
      enemy.id === "skimmer-a"
        ? 59
        : enemy.id === "skimmer-b"
          ? 23
          : 39,
    y: enemy.id === "skimmer-a" ? 53 : 14,
    status: enemy.status,
    guard: enemy.guard,
    condition: enemy.condition,
  }));
  const seatFocuses = state.seats.map((seat, index) => ({
    id: seat.id,
    name: seat.label,
    kind: "Character",
    x: (POSITIONS[seat.position]?.x ?? 25) + index * 4,
    y: (POSITIONS[seat.position]?.y ?? 40) + index * 4,
    status: seat.compromised ? "Compromised" : focusLabel(state, seat.position),
    guard: seat.guard + seat.temporaryGuard,
    condition: seat.condition,
  }));
  return [...positionFocuses, ...enemyFocuses, ...seatFocuses];
}

export function getLayeredIntents(state) {
  if (!state.encounter) return [];
  return Object.values(state.encounter.enemies)
    .filter((enemy) => enemy.status === "active")
    .map((enemy) => {
      const preview = currentEnemyIntentPreview(state, enemy.id);
      if (enemy.id === "skimmer-a") {
        return preview
          ? {
              enemyId: enemy.id,
              enemy: enemy.name,
              layer: "Conditional",
              intent: preview.name,
              trigger: "Earliest projected crossing to Far Platform",
              target: preview.targetSeatId
                ? findSeat(state, preview.targetSeatId)?.label
                : "Crossing actor",
              consequence:
                "3 Impact, Force 1; unresolved edge Force may become 1 collision Impact",
              timing: `${preview.lane} / ${preview.tempo}`,
              certainty:
                "Confirmed response relationship; standalone timing is modeled inside the crossing packet because the source omits it",
            }
          : {
              enemyId: enemy.id,
              enemy: enemy.name,
              layer: "Conditional",
              intent: "Crossing Intercept held",
              trigger: "A Far Platform crossing is projected",
              target: "Earliest crossing actor",
              consequence: "3 Impact, Force 1, edge collision pressure",
              timing: "Matches crossing packet",
              certainty: "Confirmed trigger; no target exists yet",
            };
      }
      if (enemy.id === "skimmer-b") {
        const access = earliestAccessAction(state);
        return {
          enemyId: enemy.id,
          enemy: enemy.name,
          layer: "Conditional",
          intent: access ? "Access Clamp" : "Marker Clamp",
          trigger: access
            ? "A shutter, release, or cache action is declared"
            : "No shutter, release, or cache action is declared",
          target: access
            ? findSeat(state, access.actorSeatId)?.label
            : "Frontier Marker",
          consequence: access
            ? "2 Impact, Force 1; compact Far Platform may convert Force to collision Impact"
            : "2 Impact, Force 1; an unlocked Marker is dislodged",
          timing: "Standard / 5",
          certainty: "Confirmed conditional rule",
        };
      }
      return {
        enemyId: enemy.id,
        enemy: enemy.name,
        layer: "Locked by visible selector",
        intent: "Razor Pass",
        trigger: "Active this cycle",
        target:
          findSeat(state, preview?.targetSeatId)?.label ??
          "Major Package carrier → nearest exposed character → Tie Order",
        consequence: "3 Impact",
        timing: "Fast / 7",
        certainty: "Confirmed selector and visible Tie Order",
      };
    });
}

export function resultSummary(state) {
  if (!state.encounter) return null;
  return {
    cycle: state.encounter.cycle,
    releaseValidated: state.encounter.release.validated,
    releaseBlockedReason: state.encounter.release.blockedReason,
    survey: state.encounter.marker.surveyAvailable ? "Preserved" : "Lost",
    markerIntegrity: state.encounter.marker.integrity,
    shutter: state.encounter.shutter.intact ? "Intact" : "Damaged",
    shutterState: state.encounter.shutter.state,
    fullEnteredThreatClear: allEnteredThreatsClear(state.encounter),
    enemies: Object.values(state.encounter.enemies).map((enemy) => ({
      id: enemy.id,
      status: enemy.status,
      guard: enemy.guard,
      condition: enemy.condition,
    })),
    seats: state.seats.map((seat) => ({
      id: seat.id,
      build: getBuild(seat.buildId).name,
      command: seat.command,
      condition: seat.condition,
      guard: seat.guard,
      disruption: seat.disruption,
      position: focusLabel(state, seat.position),
      majorState: seat.majorState?.name ?? "None",
      packages: seat.packages.map((item) => item.name),
      compromised: seat.compromised,
    })),
    packagesOnMap: state.encounter.packagesOnMap,
    protectedPackages:
      "None — protected Safe Node claims begin after Quiet Shift and are outside this PR.",
  };
}

export function compareToPaperExpectation(state) {
  const expected = state.expectedPaperResult;
  if (!expected || !state.encounter) return [];
  const summary = resultSummary(state);
  const primarySeat = summary.seats[0];
  const comparisons = [];
  if (expected.cycles !== undefined) {
    comparisons.push({
      field: "Cycles",
      expected: expected.cycles,
      observed: summary.cycle,
      match: expected.cycles === summary.cycle,
    });
  }
  if (expected.condition !== undefined) {
    comparisons.push({
      field: "Final Condition",
      expected: expected.condition,
      observed: primarySeat.condition,
      match: expected.condition === primarySeat.condition,
    });
  }
  if (expected.command !== undefined) {
    comparisons.push({
      field: "Command carried",
      expected: expected.command,
      observed: primarySeat.command,
      match: expected.command === primarySeat.command,
    });
  }
  if (expected.survey !== undefined) {
    comparisons.push({
      field: "Survey",
      expected: expected.survey,
      observed: summary.survey,
      match: expected.survey === summary.survey,
    });
  }
  if (expected.shutter !== undefined) {
    comparisons.push({
      field: "Shutter",
      expected: expected.shutter,
      observed: summary.shutter,
      match: expected.shutter === summary.shutter,
    });
  }
  return comparisons;
}

export {
  APPROACHES,
  ARMOR,
  BUILDS,
  CARDS,
  CORE_RULES,
  LOADOUTS,
  POSITIONS,
  PROFILES,
  RIGS,
  WEAPONS,
};
