export const SOURCE_REVISION =
  "BARCODE_WORLD_PLAYTEST_READY_VERTICAL_SLICE_SOURCE_PACK_2026-07-26";

export const CORE_RULES = Object.freeze({
  commandStart: 16,
  commandIncome: 16,
  commandCap: 32,
  paidActionCap: 4,
  ordinaryRepositionPerPhase: 1,
  condition: 12,
  majorSetupCost: 7,
  minorFoundationCost: 6,
  majorPayoffCost: 8,
  deckSize: 12,
  openingHand: 5,
  drawPerSettle: 2,
  retainLimit: 7,
  exposedPackageSlots: 2,
  normalImmediateChoices: 4,
  exceptionalImmediateChoices: 5,
});

export const DISCIPLINES = Object.freeze({
  battle: {
    id: "battle",
    name: "Battle",
    state: "Battle Advantage",
    awareness:
      "Reads hostile Commitments, collision paths, threatened destinations, and direct consequences.",
    minor: {
      id: "contest",
      name: "Contest",
      cost: 6,
      lane: "Inherited",
      tempo: null,
      tag: "Instant",
    },
    setup: {
      id: "answer-commitment",
      name: "Answer Commitment",
      cost: 7,
      lane: "Inherited",
      tempo: null,
      tag: "Instant",
    },
    payoff: {
      id: "convert-advantage",
      name: "Convert Advantage",
      cost: 8,
      lane: "Standard",
      tempo: 5,
      tag: "Instant",
    },
  },
  exploration: {
    id: "exploration",
    name: "Exploration",
    state: "Prepared Route",
    awareness:
      "Reads Openings, destinations, recurrence, landing pressure, pursuit, rescue, and extraction geometry.",
    minor: {
      id: "cross-opening",
      name: "Cross Opening",
      cost: 6,
      lane: "Standard",
      tempo: 5,
      tag: "Transit",
    },
    setup: {
      id: "prepare-route",
      name: "Prepare Route",
      cost: 7,
      lane: "Standard",
      tempo: 4,
      tag: "Instant",
    },
    payoff: {
      id: "exploit-route",
      name: "Exploit Route",
      cost: 8,
      lane: "Standard",
      tempo: 5,
      tag: "Transit",
    },
  },
  hacking: {
    id: "hacking",
    name: "Hacking",
    state: "Temporary Control",
    awareness:
      "Reads Dependencies, access points, automatic responses, connected components, reserves, and bounded Outputs.",
    minor: {
      id: "suppress-response",
      name: "Suppress Response",
      cost: 6,
      lane: "Fast",
      tempo: 6,
      tag: "Instant",
    },
    setup: {
      id: "establish-control",
      name: "Establish Control",
      cost: 7,
      lane: "Standard",
      tempo: 3,
      tag: "Sustained",
    },
    payoff: {
      id: "execute-output",
      name: "Execute Output",
      cost: 8,
      lane: "Standard",
      tempo: 6,
      tag: "Sustained",
    },
  },
});

const UNIVERSAL_CARDS = {
  "fallback-guard": {
    id: "fallback-guard",
    name: "Fallback Guard",
    kind: "Contingency",
    cost: 4,
    compatibility: ["paid"],
    text: "If the primary invalidates before beginning, gain 3 temporary Guard and Brace against one visible direct Commitment.",
  },
  "covering-step": {
    id: "covering-step",
    name: "Covering Step",
    kind: "Modifier",
    cost: 2,
    compatibility: ["reposition", "additional-movement"],
    text: "After successful movement, gain 2 temporary Guard against the first ranged or line attack before Settle.",
  },
  "field-patch": {
    id: "field-patch",
    name: "Field Patch",
    kind: "Action",
    cost: 8,
    lane: "Slow",
    tempo: 3,
    tag: "Sustained",
    compatibility: ["standalone"],
    text: "Self or adjacent non-Compromised ally restores 3 Condition. Once per character per encounter. Cannot Stabilize.",
  },
  "emergency-drag": {
    id: "emergency-drag",
    name: "Emergency Drag",
    kind: "Action",
    cost: 8,
    lane: "Standard",
    tempo: 4,
    tag: "Transit",
    compatibility: ["standalone"],
    text: "Move the user and an adjacent willing ally, Compromised ally, or one-slot Package one ordinary adjacent position.",
  },
  "hand-signal": {
    id: "hand-signal",
    name: "Hand Signal",
    kind: "Team Modifier",
    cost: 0,
    compatibility: ["assist"],
    partyOnly: true,
    text: "Assist may target a visible ally within two connected positions and resolves Fast / 6.",
  },
  "objective-brace": {
    id: "objective-brace",
    name: "Objective Brace",
    kind: "Preparation",
    cost: 2,
    compatibility: [
      "work-objective",
      "stabilize-plate",
      "complete-release",
    ],
    text: "Ignore the first visible direct interruption that would cancel Work or remove its completed Work before Settle.",
  },
  "last-exit": {
    id: "last-exit",
    name: "Last Exit",
    kind: "Modifier",
    cost: 4,
    compatibility: ["standard-extract"],
    text: "Secure one exposed one-slot Package if Extract succeeds.",
  },
  "linked-effort": {
    id: "linked-effort",
    name: "Linked Effort",
    kind: "Team Modifier",
    cost: 2,
    compatibility: ["assist"],
    partyOnly: true,
    text: "If both actions resolve, the supported ally gains 2 temporary Guard until Settle.",
  },
};

const BATTLE_CARDS = {
  "brace-through": {
    id: "brace-through",
    name: "Brace Through",
    kind: "Modifier",
    cost: 2,
    compatibility: ["contest", "answer-commitment"],
    text: "+1 Force resistance against that Commitment; gain 2 temporary Guard if still at the contact point.",
  },
  "extended-intercept": {
    id: "extended-intercept",
    name: "Extended Intercept",
    kind: "Modifier",
    cost: 2,
    compatibility: ["contest", "answer-commitment"],
    text: "Meet the Commitment from one additional ordinary position away and move to contact. Cannot cross a special Opening.",
  },
  "controlled-withdrawal": {
    id: "controlled-withdrawal",
    name: "Controlled Withdrawal",
    kind: "Contingency",
    cost: 4,
    compatibility: ["attack", "contest", "answer-commitment"],
    text: "If the target leaves and the primary invalidates, move to a declared adjacent fallback and gain 1 temporary Guard.",
  },
  "press-the-break": {
    id: "press-the-break",
    name: "Press the Break",
    kind: "Modifier",
    cost: 2,
    compatibility: ["convert-advantage"],
    text: "Choose Crush (+2 Guard Break), Drive (+1 Force), or Finish (+2 Impact when the target is projected at zero Guard).",
  },
  "hold-the-edge": {
    id: "hold-the-edge",
    name: "Hold the Edge",
    kind: "Preparation",
    cost: 2,
    compatibility: ["answer-commitment"],
    text: "The resulting Advantage survives the first ordinary move or one-position forced shift while the confrontation remains valid.",
  },
  "pass-the-opening": {
    id: "pass-the-opening",
    name: "Pass the Opening",
    kind: "Team Modifier",
    cost: 2,
    compatibility: ["convert-advantage"],
    partyOnly: true,
    text: "A visible ally within two positions may Reposition into newly legal adjacent space after displacement or breach.",
  },
};

const EXPLORATION_CARDS = {
  "safe-landing": {
    id: "safe-landing",
    name: "Safe Landing",
    kind: "Modifier",
    cost: 2,
    compatibility: ["cross-opening", "cross-plate", "follow-route", "exploit-route"],
    text: "Ignore up to 2 crossing or landing Impact and 1 landing Force.",
  },
  "carry-line": {
    id: "carry-line",
    name: "Carry Line",
    kind: "Modifier",
    cost: 2,
    compatibility: [
      "reposition",
      "cross-opening",
      "cross-plate",
      "follow-route",
      "exploit-route",
    ],
    text: "A legal carried Package or Assist relationship does not reduce or cancel movement.",
  },
  "backtrack-marker": {
    id: "backtrack-marker",
    name: "Backtrack Marker",
    kind: "Preparation",
    cost: 2,
    compatibility: ["cross-opening", "follow-route", "exploit-route"],
    text: "Mark the origin and expose Backtrack — 4, Standard / 5 before Settle while the same Opening remains legal.",
  },
  "route-capacity": {
    id: "route-capacity",
    name: "Route Capacity",
    kind: "Modifier",
    cost: 4,
    compatibility: ["prepare-route"],
    text: "Add one allied Follow passage or one recurrence when the Opening is authored as recurring.",
  },
  "destination-claim": {
    id: "destination-claim",
    name: "Destination Claim",
    kind: "Preparation",
    cost: 2,
    compatibility: ["prepare-route"],
    text: "One observed destination feature survives one ordinary environmental shift or closure before Exploit.",
  },
  "broken-map": {
    id: "broken-map",
    name: "Broken Map",
    kind: "Contingency",
    cost: 4,
    compatibility: ["prepare-route", "exploit-route"],
    text: "Redirect to one declared observed alternate destination if the primary becomes illegal and the Opening remains legal.",
  },
};

const HACKING_CARDS = {
  "clean-buffer": {
    id: "clean-buffer",
    name: "Clean Buffer",
    kind: "Modifier",
    cost: 2,
    compatibility: [
      "basic-interface",
      "suppress-response",
      "establish-control",
      "execute-output",
    ],
    text: "Ignore the first applicable 1 Disruption or 2 system-origin Impact caused directly by the action.",
  },
  "delay-stack": {
    id: "delay-stack",
    name: "Delay Stack",
    kind: "Modifier",
    cost: 2,
    compatibility: ["suppress-response", "basic-interface"],
    text: "Move a Basic Interface response one lane later, or delay a Suppressed response until after the next Settle.",
  },
  "emergency-disconnect": {
    id: "emergency-disconnect",
    name: "Emergency Disconnect",
    kind: "Contingency",
    cost: 4,
    compatibility: [
      "basic-interface",
      "suppress-response",
      "establish-control",
      "execute-output",
    ],
    text: "Abort before the parent begins, sever access, and ignore one named system response. Access is unavailable until next planning phase.",
  },
  "chained-output": {
    id: "chained-output",
    name: "Chained Output",
    kind: "Modifier",
    cost: 4,
    compatibility: ["execute-output"],
    text: "Execute one secondary Chainable Output from the same Dependency after the primary.",
  },
  "quiet-rewrite": {
    id: "quiet-rewrite",
    name: "Quiet Rewrite",
    kind: "Modifier",
    cost: 2,
    compatibility: ["establish-control"],
    text: "Delay the first alert, lockout, or hostile response caused by establishing Control until after Settle.",
  },
  "trace-echo": {
    id: "trace-echo",
    name: "Trace Echo",
    kind: "Preparation",
    cost: 2,
    compatibility: ["execute-output"],
    text: "Confirm the next response from one affected component and reduce the next eligible Scan or Basic Interface by 2, minimum 4.",
  },
};

export const CARDS = Object.freeze({
  ...UNIVERSAL_CARDS,
  ...BATTLE_CARDS,
  ...EXPLORATION_CARDS,
  ...HACKING_CARDS,
});

const DECKS = {
  "battle-exploration": [
    "fallback-guard",
    "objective-brace",
    "brace-through",
    "hold-the-edge",
    "safe-landing",
    "covering-step",
    "extended-intercept",
    "field-patch",
    "controlled-withdrawal",
    "press-the-break",
    "carry-line",
    "last-exit",
  ],
  "exploration-battle": [
    "fallback-guard",
    "objective-brace",
    "safe-landing",
    "destination-claim",
    "brace-through",
    "covering-step",
    "route-capacity",
    "field-patch",
    "backtrack-marker",
    "controlled-withdrawal",
    "broken-map",
    "last-exit",
  ],
  "battle-hacking": [
    "fallback-guard",
    "objective-brace",
    "brace-through",
    "hold-the-edge",
    "clean-buffer",
    "covering-step",
    "extended-intercept",
    "field-patch",
    "controlled-withdrawal",
    "press-the-break",
    "delay-stack",
    "last-exit",
  ],
  "hacking-battle": [
    "fallback-guard",
    "objective-brace",
    "clean-buffer",
    "quiet-rewrite",
    "brace-through",
    "covering-step",
    "emergency-disconnect",
    "field-patch",
    "chained-output",
    "controlled-withdrawal",
    "trace-echo",
    "last-exit",
  ],
  "exploration-hacking": [
    "fallback-guard",
    "objective-brace",
    "safe-landing",
    "destination-claim",
    "clean-buffer",
    "covering-step",
    "route-capacity",
    "field-patch",
    "backtrack-marker",
    "delay-stack",
    "broken-map",
    "last-exit",
  ],
  "hacking-exploration": [
    "fallback-guard",
    "objective-brace",
    "clean-buffer",
    "quiet-rewrite",
    "safe-landing",
    "covering-step",
    "emergency-disconnect",
    "field-patch",
    "chained-output",
    "carry-line",
    "trace-echo",
    "last-exit",
  ],
};

export const BUILDS = Object.freeze(
  [
    ["battle", "exploration", "Confrontation creates space."],
    ["exploration", "battle", "Space is established first; confrontation preserves it."],
    ["battle", "hacking", "Confrontation exposes a system."],
    ["hacking", "battle", "Control is established first; confrontation preserves access."],
    ["exploration", "hacking", "A natural Route exists first; Hacking delays its closure."],
    ["hacking", "exploration", "A Hacking Output creates temporary geometry to cross."],
  ].map(([major, minor, identity]) => {
    const id = `${major}-${minor}`;
    return {
      id,
      name: `${DISCIPLINES[major].name} / ${DISCIPLINES[minor].name}`,
      major,
      minor,
      identity,
      deck: DECKS[id],
    };
  }),
);

export const WEAPONS = Object.freeze({
  "needle-carbine": {
    id: "needle-carbine",
    name: "Needle Carbine",
    range: 4,
    lane: "Standard",
    tempo: 6,
    impact: 4,
    guardBreak: 0,
    force: 0,
    technique: {
      id: "hold-line",
      name: "Hold Line",
      cost: 6,
      lane: "Fast",
      tempo: 5,
      tag: "Instant",
      text: "Select a line up to four positions. The first hostile crossing before Settle receives a 3-Impact Needle attack.",
    },
  },
  breaker: {
    id: "breaker",
    name: "Breaker",
    range: 1,
    lane: "Slow",
    tempo: 5,
    impact: 5,
    guardBreak: 2,
    force: 2,
    technique: {
      id: "drive-through",
      name: "Drive Through",
      cost: 8,
      lane: "Slow",
      tempo: 4,
      tag: "Instant",
      text: "Requires Braced or a stable adjacent Anchor. 5 Impact, 2 Guard Break, Force 3; may breach fragile cover.",
    },
  },
  "tether-lance": {
    id: "tether-lance",
    name: "Tether Lance",
    range: 2,
    lane: "Standard",
    tempo: 5,
    impact: 3,
    guardBreak: 0,
    force: 1,
    technique: {
      id: "anchor-tether",
      name: "Anchor Tether",
      cost: 6,
      lane: "Standard",
      tempo: 4,
      tag: "Instant",
      text: "Link a character, movable objective, or Package to a stable Anchor and reduce the first movement away by 2.",
    },
  },
  "pulse-blade": {
    id: "pulse-blade",
    name: "Pulse Blade",
    range: 1,
    lane: "Fast",
    tempo: 6,
    impact: 3,
    guardBreak: 0,
    force: 0,
    technique: {
      id: "phase-cut",
      name: "Phase Cut",
      cost: 8,
      lane: "Fast",
      tempo: 5,
      tag: "Instant",
      text: "Step, make a 3-Impact attack, then step. Cannot cross a special Opening.",
    },
  },
  "static-driver": {
    id: "static-driver",
    name: "Static Driver",
    range: 3,
    lane: "Standard",
    tempo: 5,
    impact: 2,
    guardBreak: 4,
    guardBreakBody: 0,
    force: 0,
    technique: {
      id: "ground-lock",
      name: "Ground Lock",
      cost: 8,
      lane: "Standard",
      tempo: 4,
      tag: "Instant",
      text: "If the machine target reaches zero Guard, it cannot restore Guard or conceal a component before next Settle.",
    },
  },
  "scatter-array": {
    id: "scatter-array",
    name: "Scatter Array",
    range: 2,
    lane: "Standard",
    tempo: 4,
    impact: 3,
    guardBreak: 0,
    force: 0,
    technique: {
      id: "clear-lane",
      name: "Clear Lane",
      cost: 8,
      lane: "Slow",
      tempo: 4,
      tag: "Instant",
      text: "3 Impact and Force 1 through a short cone; destroys light cover without ally or Package discrimination.",
    },
  },
});

export const ARMOR = Object.freeze({
  "mobile-weave": {
    id: "mobile-weave",
    name: "Mobile Weave",
    guardCap: 4,
    forceResistance: 0,
    text: "Ignore the first difficult-terrain surcharge each planning phase.",
  },
  "brace-frame": {
    id: "brace-frame",
    name: "Brace Frame",
    guardCap: 7,
    forceResistance: 1,
    text: "+1 Force resistance. Lock Frame — 4 Braces against every visible direct Commitment.",
  },
  "insulated-shell": {
    id: "insulated-shell",
    name: "Insulated Shell",
    guardCap: 5,
    forceResistance: 0,
    text: "Ignore the first point of system backlash or encounter-action Disruption each encounter.",
  },
  "recovery-mesh": {
    id: "recovery-mesh",
    name: "Recovery Mesh",
    guardCap: 4,
    forceResistance: 0,
    text: "The first Field Patch or Stabilization affecting the wearer restores +1 Condition.",
  },
});

export const RIGS = Object.freeze({
  "traversal-line": {
    id: "traversal-line",
    name: "Traversal Line",
    action: {
      id: "line-move",
      name: "Line Move",
      cost: 4,
      lane: "Standard",
      tempo: 6,
      tag: "Transit",
    },
    text: "Move through up to two connected ordinary positions; cannot cross a special Opening or carry a Major Package.",
  },
  "anchor-rig": {
    id: "anchor-rig",
    name: "Anchor Rig",
    action: {
      id: "anchor-lock",
      name: "Anchor Lock",
      cost: 4,
      lane: "Fast",
      tempo: 5,
      tag: "Instant",
    },
    text: "Prevent the first 2 Force before Settle. Ends on voluntary movement.",
  },
  "interface-shield": {
    id: "interface-shield",
    name: "Interface Shield",
    action: {
      id: "protected-access",
      name: "Protected Access",
      cost: 4,
      lane: "Fast",
      tempo: 5,
      tag: "Instant",
    },
    text: "The first direct hit does not invalidate one declared Interface or Hacking action solely because damage occurred.",
  },
  "signal-lens": {
    id: "signal-lens",
    name: "Signal Lens",
    action: null,
    text: "The first Scan may reveal two related authored facts or improve one uncertain fact by two bands.",
  },
});

export const LOADOUTS = Object.freeze({
  A: {
    id: "A",
    name: "Baseline Mobility",
    activeWeapon: "needle-carbine",
    reserveWeapon: "pulse-blade",
    armor: "mobile-weave",
    rig: "traversal-line",
  },
  B: {
    id: "B",
    name: "Hold and Collision",
    activeWeapon: "tether-lance",
    reserveWeapon: "breaker",
    armor: "brace-frame",
    rig: "anchor-rig",
  },
  C: {
    id: "C",
    name: "System Pressure",
    activeWeapon: "static-driver",
    reserveWeapon: "needle-carbine",
    armor: "insulated-shell",
    rig: "interface-shield",
  },
  D: {
    id: "D",
    name: "Survey and Recovery",
    activeWeapon: "needle-carbine",
    reserveWeapon: "tether-lance",
    armor: "recovery-mesh",
    rig: "signal-lens",
  },
});

export const POSITIONS = Object.freeze({
  "frontier-marker": {
    id: "frontier-marker",
    name: "Frontier Marker",
    x: 7,
    y: 36,
    kind: "Anchor",
    capacity: 1,
  },
  "entry-shelf": {
    id: "entry-shelf",
    name: "Entry Shelf",
    x: 28,
    y: 36,
    kind: "Position",
    capacity: 3,
  },
  "shutter-console": {
    id: "shutter-console",
    name: "Shutter Console",
    x: 51,
    y: 36,
    kind: "Infrastructure",
    capacity: 1,
  },
  "upper-trace-rail": {
    id: "upper-trace-rail",
    name: "Upper Trace Rail",
    x: 30,
    y: 8,
    kind: "Enemy line",
    capacity: 3,
  },
  "broken-lane-lip": {
    id: "broken-lane-lip",
    name: "Broken-Lane Lip",
    x: 35,
    y: 61,
    kind: "Opening",
    capacity: 2,
  },
  "far-platform": {
    id: "far-platform",
    name: "Far Platform",
    x: 65,
    y: 61,
    kind: "Position",
    capacity: 2,
  },
  "release-socket": {
    id: "release-socket",
    name: "Release Socket",
    x: 80,
    y: 47,
    kind: "Objective",
    capacity: 1,
  },
  "relay-cache": {
    id: "relay-cache",
    name: "Relay Cache",
    x: 85,
    y: 67,
    kind: "Package source",
    capacity: 1,
  },
  threshold: {
    id: "threshold",
    name: "Threshold",
    x: 70,
    y: 88,
    kind: "Exit",
    capacity: 3,
  },
});

export const ORDINARY_EDGES = Object.freeze([
  ["frontier-marker", "entry-shelf"],
  ["upper-trace-rail", "entry-shelf"],
  ["entry-shelf", "shutter-console"],
  ["entry-shelf", "broken-lane-lip"],
  ["far-platform", "threshold"],
]);

export const SPECIAL_EDGE = Object.freeze({
  id: "natural-opening",
  name: "Natural Opening / Maintenance Plate",
  origin: "broken-lane-lip",
  destination: "far-platform",
  clearance: ["Character", "One-slot"],
  capacity: 1,
});

const PAPER_EXPECTED_SOLO = {
  "battle-exploration": {
    cycles: 3,
    condition: 10,
    command: 9,
    survey: "Lost",
    shutter: "Damaged",
    namedResult: "Skimmer A removed",
  },
  "exploration-battle": {
    cycles: 2,
    condition: 12,
    command: 3,
    survey: "Preserved",
    shutter: "Damaged",
    namedResult: "fastest baseline",
  },
  "battle-hacking": {
    cycles: 3,
    condition: 6,
    command: 3,
    survey: "Preserved",
    shutter: "Intact",
    namedResult: "Skimmer B removed",
  },
  "hacking-battle": {
    cycles: 3,
    condition: 3,
    command: 1,
    survey: "Preserved",
    shutter: "Intact",
    namedResult: "Relay Needle",
  },
  "exploration-hacking": {
    cycles: 3,
    condition: 7,
    command: 7,
    survey: "Preserved",
    shutter: "Intact",
    namedResult: "clean Route result",
  },
  "hacking-exploration": {
    cycles: 3,
    condition: 10,
    command: 7,
    survey: "Preserved",
    shutter: "Intact",
    namedResult: "reinforcement prevented",
  },
};

function seat(id, build, loadout = "A") {
  return { id, build, loadout, primaryPriority: "Complete", secondaryPriority: "Survey" };
}

export const PROFILES = Object.freeze([
  ...BUILDS.map((build, index) => ({
    id: `LS-SOLO-${index + 1}`,
    name: `Solo · ${build.name}`,
    mode: "solo",
    seats: [seat("seat-1", build.id)],
    expected: PAPER_EXPECTED_SOLO[build.id],
  })),
  {
    id: "LS-DUO-MIXED",
    name: "Local duo · Exploration/Battle + Hacking/Battle",
    mode: "local-duo",
    seats: [
      seat("seat-1", "exploration-battle"),
      seat("seat-2", "hacking-battle"),
    ],
    expected: {
      cycles: 2,
      survey: "Preserved",
      shutter: "Intact",
      namedResult: "Relay Needle",
      sourceConflict:
        "The expected profile says all three Skimmers remain active at validation, but LS-01 §12 requires every entered Skimmer neutralized first.",
    },
  },
  {
    id: "LS-TRIO-MIXED",
    name: "Local trio · mixed disciplines",
    mode: "local-trio",
    seats: [
      seat("seat-1", "battle-exploration"),
      seat("seat-2", "exploration-hacking"),
      seat("seat-3", "hacking-battle"),
    ],
    expected: {
      cycles: 3,
      survey: "Preserved",
      shutter: "Intact",
      namedResult: "Relay Needle + Razor Actuator",
    },
  },
  {
    id: "LS-TRIO-DUP-EB",
    name: "Local trio · duplicate Exploration/Battle",
    mode: "local-trio",
    seats: [
      seat("seat-1", "exploration-battle"),
      seat("seat-2", "exploration-battle"),
      seat("seat-3", "exploration-battle"),
    ],
    expected: {
      cycles: 2,
      namedResult: "one Route owner; two Major weak phases",
    },
  },
  {
    id: "LS-DUO-DUP-HB",
    name: "Local duo · duplicate Hacking/Battle",
    mode: "local-duo",
    seats: [
      seat("seat-1", "hacking-battle"),
      seat("seat-2", "hacking-battle"),
    ],
    expected: {
      namedResult: "one Control owner; second Hacking Major contributes elsewhere",
    },
  },
  {
    id: "LS-RESCUE-GREEDY",
    name: "Local trio · greedy controller rescue",
    mode: "local-trio",
    seats: [
      seat("seat-1", "exploration-battle"),
      seat("seat-2", "hacking-battle"),
      seat("seat-3", "battle-exploration"),
    ],
    expected: {
      cycles: 4,
      namedResult: "Control lost; Stabilize + Assist sacrifice the cache line",
    },
  },
]);

export const APPROACHES = Object.freeze({
  "impact-scar": {
    id: "impact-scar",
    name: "Impact Scar",
    broad:
      "A roaming hostile is preparing to strike the Frontier Marker. A counterweight assembly sits behind the line.",
    major: {
      battle:
        "Confirmed: exact Commitment, collision path, Marker target, and intact confrontation opportunity.",
      exploration:
        "Confirmed: the collision closes this boundary after commitment; no alternate Route survives.",
      hacking:
        "Confirmed: no accessible Dependency controls the collision before commitment.",
    },
    results: ["exact", "ordinary"],
  },
  "folded-service-walk": {
    id: "folded-service-walk",
    name: "Folded Service Walk",
    broad:
      "An unstable side street overlaps the main path. Its true landing and collapse pressure are uncertain.",
    major: {
      battle:
        "Confirmed: no direct hostile Commitment owns this approach boundary.",
      exploration:
        "Confirmed: true landing, recurrence, safer entry, later anomaly access, and collapse pressure.",
      hacking:
        "Confirmed: the overlap is physical geometry, not a Dependency or command surface.",
    },
    results: ["folded"],
  },
  "mute-repeater": {
    id: "mute-repeater",
    name: "Mute Repeater",
    broad:
      "A damaged repeater is transmitting the party's arrival and preserving one route fact.",
    major: {
      battle:
        "Confirmed: destroying the hardware stops the signal but loses its preserved fact.",
      exploration:
        "Confirmed: the route fact is useful later, but the signal still calls reinforcement.",
      hacking:
        "Confirmed: reinforcement Dependency, preserved route fact, destructive alternative, and response relationship.",
    },
    results: ["preserved", "destroyed"],
  },
});

export function getBuild(buildId) {
  return BUILDS.find((build) => build.id === buildId);
}

export function getProfile(profileId) {
  return PROFILES.find((profile) => profile.id === profileId) ?? PROFILES[0];
}
