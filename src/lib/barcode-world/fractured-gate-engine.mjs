import {
  BUILDS as SOURCE_BUILDS,
  CARDS as SOURCE_CARDS,
} from "./constants.mjs";

export const FRACTURED_GATE_SOURCE =
  "BARCODE_WORLD_FRACTURED_GATE_ALTERNATING_TURN_OWNER_REVISION_2026-07-28";

export const RESULT_TYPES = Object.freeze([
  "Fast Secure",
  "Clean Secure",
  "Recovery Secure",
  "Gate Secure",
  "Gate Lost",
  "Controlled Retreat",
  "Defeated",
]);

export const CORE_RULES = Object.freeze({
  commandStart: 16,
  commandIncome: 16,
  commandCap: 32,
  deckSize: 12,
  openingHand: 5,
  drawPerTurn: 2,
  retainLimit: 7,
  refocusCost: 4,
  refocusLimit: 2,
  weaponRange: 2,
  noPaidActionLimit: true,
});

const BUILD_MOVEMENT = Object.freeze({
  "battle-exploration": {
    allowance: 6,
    reason: "Exploration Minor adds one route-aware movement point.",
  },
  "exploration-battle": {
    allowance: 7,
    reason: "Exploration Major supplies the strongest route-aware movement.",
  },
  "battle-hacking": {
    allowance: 5,
    reason: "Battle Major and Hacking Minor use the baseline field-rig movement.",
  },
  "hacking-battle": {
    allowance: 5,
    reason: "Hacking Major and Battle Minor use the baseline field-rig movement.",
  },
  "exploration-hacking": {
    allowance: 7,
    reason: "Exploration Major supplies the strongest route-aware movement.",
  },
  "hacking-exploration": {
    allowance: 6,
    reason: "Exploration Minor adds one route-aware movement point.",
  },
});

export const BUILDS = Object.freeze(
  SOURCE_BUILDS.map((build) => ({
    ...build,
    movement: BUILD_MOVEMENT[build.id].allowance,
    movementReason: BUILD_MOVEMENT[build.id].reason,
  })),
);

const CARD_OVERRIDES = Object.freeze({
  "fallback-guard": {
    role: "Response",
    compatibility: ["enemy-physical", "enemy-ranged"],
    tempo: 8,
    effect: "Establish 5 Guard before the incoming action when Tempo permits.",
  },
  "objective-brace": {
    role: "Modifier",
    compatibility: ["stabilize-gate"],
    tempoDelta: 0,
    effect: "Protect Gate Work from the first direct interruption.",
  },
  "brace-through": {
    role: "Modifier",
    compatibility: [
      "attack",
      "break-divider",
      "expose-regulator",
      "bollard-output",
    ],
    tempoDelta: 0,
    effect: "Add 2 Impact and hold the contact point.",
  },
  "hold-the-edge": {
    role: "Response",
    compatibility: ["enemy-physical", "enemy-objective"],
    tempo: 6,
    effect: "Brace the current tile and prevent the first forced movement.",
  },
  "safe-landing": {
    role: "Modifier",
    compatibility: ["move", "prepare-upper-crossing", "deploy-lift"],
    tempoDelta: 1,
    effect: "Protect the selected landing and preserve its movement link.",
  },
  "destination-claim": {
    role: "Modifier",
    compatibility: [
      "prepare-upper-crossing",
      "prepare-service-gap",
      "deploy-lift",
    ],
    tempoDelta: 0,
    effect: "Keep the chosen destination legal through one ordinary shift.",
  },
  "clean-buffer": {
    role: "Modifier",
    compatibility: [
      "scan-intent",
      "suppress-reset",
      "establish-actuator",
      "suppress-shutter",
      "align-lift",
    ],
    tempoDelta: 1,
    effect: "Ignore the first connected-system disruption.",
  },
  "quiet-rewrite": {
    role: "Modifier",
    compatibility: ["establish-actuator", "align-lift"],
    tempoDelta: 1,
    effect: "Delay the first hostile system response.",
  },
  "covering-step": {
    role: "Modifier",
    compatibility: ["move"],
    tempoDelta: 0,
    effect: "Gain 2 Guard after the movement finishes.",
  },
  "extended-intercept": {
    role: "Modifier",
    compatibility: ["attack", "break-divider", "expose-regulator"],
    tempoDelta: 1,
    effect: "Extend a physical contact by one tile.",
  },
  "controlled-withdrawal": {
    role: "Response",
    compatibility: ["enemy-physical"],
    tempo: 7,
    effect: "Step to a legal adjacent fallback after contact.",
  },
  "emergency-disconnect": {
    role: "Response",
    compatibility: ["enemy-system"],
    tempo: 8,
    effect: "Sever the current system access before a hostile operation.",
  },
  "field-patch": {
    role: "Action",
    compatibility: ["field-patch"],
    tempo: 3,
    effect: "Restore 3 Condition. Once per encounter.",
  },
  "last-exit": {
    role: "Modifier",
    compatibility: ["leave"],
    tempoDelta: 0,
    effect: "Carry the Field Cache through a legal retreat.",
  },
});

export const CARDS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(SOURCE_CARDS).map(([id, card]) => [
      id,
      {
        ...card,
        role: CARD_OVERRIDES[id]?.role ?? "Modifier",
        compatibility:
          CARD_OVERRIDES[id]?.compatibility ?? card.compatibility ?? [],
        tempo: CARD_OVERRIDES[id]?.tempo ?? card.tempo ?? null,
        tempoDelta: CARD_OVERRIDES[id]?.tempoDelta ?? 0,
        effect: CARD_OVERRIDES[id]?.effect ?? card.text,
      },
    ]),
  ),
  "follow-through": {
    id: "follow-through",
    name: "Follow Through",
    kind: "Context Extension",
    role: "Context",
    cost: 1,
    compatibility: [
      "attack",
      "break-divider",
      "expose-regulator",
      "bollard-output",
    ],
    tempoDelta: 1,
    effect:
      "A clear uninterrupted approach accelerates this physical contact once.",
    context: true,
  },
});

export const ENEMY_CARDS = Object.freeze({
  "set-guard": {
    id: "set-guard",
    name: "Set Guard",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "impact-counter": {
    id: "impact-counter",
    name: "Impact Counter",
    cost: 4,
    tempo: 5,
    band: "Standard",
  },
  "driving-ram": {
    id: "driving-ram",
    name: "Driving Ram",
    cost: 8,
    tempo: 5,
    band: "Standard",
  },
  "slip-angle": {
    id: "slip-angle",
    name: "Slip Angle",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
  "anchor-down": {
    id: "anchor-down",
    name: "Anchor Down",
    cost: 5,
    tempo: 7,
    band: "Fast",
  },
  "follow-pressure": {
    id: "follow-pressure",
    name: "Follow Pressure",
    cost: 5,
    tempo: 5,
    band: "Standard",
  },
  "breaker-coil": {
    id: "breaker-coil",
    name: "Breaker Coil",
    cost: 2,
    tempo: 5,
    band: "Standard",
  },
  "seize-breach": {
    id: "seize-breach",
    name: "Seize Breach",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "recover-stance": {
    id: "recover-stance",
    name: "Recover Stance",
    cost: 4,
    tempo: 3,
    band: "Slow",
  },
  "crushing-return": {
    id: "crushing-return",
    name: "Crushing Return",
    cost: 8,
    tempo: 3,
    band: "Slow",
  },
  "last-push": {
    id: "last-push",
    name: "Last Push",
    cost: 8,
    tempo: 5,
    band: "Standard",
  },
  "breacher-withdrawal": {
    id: "breacher-withdrawal",
    name: "Controlled Withdrawal",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
  "shield-link": {
    id: "shield-link",
    name: "Shield Link",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "body-block": {
    id: "body-block",
    name: "Body Block",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "vault-intercept": {
    id: "vault-intercept",
    name: "Vault Intercept",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  "brace-line": {
    id: "brace-line",
    name: "Brace Line",
    cost: 5,
    tempo: 6,
    band: "Standard",
  },
  "cover-advance": {
    id: "cover-advance",
    name: "Cover Advance",
    cost: 4,
    tempo: 5,
    band: "Standard",
  },
  "anchor-swap": {
    id: "anchor-swap",
    name: "Anchor Swap",
    cost: 5,
    tempo: 7,
    band: "Fast",
  },
  "guard-relay": {
    id: "guard-relay",
    name: "Guard Relay",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "pushback-screen": {
    id: "pushback-screen",
    name: "Pushback Screen",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "hold-platform": {
    id: "hold-platform",
    name: "Hold Platform",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "intercept-route": {
    id: "intercept-route",
    name: "Intercept Route",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  "recover-link": {
    id: "recover-link",
    name: "Recover Link",
    cost: 4,
    tempo: 3,
    band: "Slow",
  },
  "guard-withdrawal": {
    id: "guard-withdrawal",
    name: "Controlled Withdrawal",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
  "emergency-reset": {
    id: "emergency-reset",
    name: "Emergency Reset",
    cost: 4,
    tempo: 6,
    band: "Fast",
  },
  "purge-control": {
    id: "purge-control",
    name: "Purge Control",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "charge-debris": {
    id: "charge-debris",
    name: "Charge Debris",
    cost: 5,
    tempo: 7,
    band: "Fast",
  },
  "seal-gap": {
    id: "seal-gap",
    name: "Seal Gap",
    cost: 5,
    tempo: 5,
    band: "Standard",
  },
  "lift-recall": {
    id: "lift-recall",
    name: "Lift Recall",
    cost: 5,
    tempo: 6,
    band: "Fast",
  },
  "static-tax": {
    id: "static-tax",
    name: "Static Tax",
    cost: 4,
    tempo: 6,
    band: "Fast",
  },
  "bollard-override": {
    id: "bollard-override",
    name: "Bollard Override",
    cost: 5,
    tempo: 6,
    band: "Fast",
  },
  "cut-power": {
    id: "cut-power",
    name: "Cut Power",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "reconnect-line": {
    id: "reconnect-line",
    name: "Reconnect Line",
    cost: 5,
    tempo: 3,
    band: "Slow",
  },
  "false-read": {
    id: "false-read",
    name: "False Read",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "gate-desync": {
    id: "gate-desync",
    name: "Gate Desync",
    cost: 8,
    tempo: 3,
    band: "Slow",
  },
  "emergency-shutdown": {
    id: "emergency-shutdown",
    name: "Emergency Shutdown",
    cost: 7,
    tempo: 3,
    band: "Slow",
  },
  cutoff: {
    id: "cutoff",
    name: "Cutoff",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "needle-volley": {
    id: "needle-volley",
    name: "Needle Volley",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  "feint-route": {
    id: "feint-route",
    name: "Feint Route",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
  "pressure-vault-intercept": {
    id: "pressure-vault-intercept",
    name: "Vault Intercept",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  pursuit: {
    id: "pursuit",
    name: "Pursuit",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  "exit-pressure": {
    id: "exit-pressure",
    name: "Exit Pressure",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  "mark-target": {
    id: "mark-target",
    name: "Mark Target",
    cost: 4,
    tempo: 7,
    band: "Fast",
  },
  "deny-cache": {
    id: "deny-cache",
    name: "Deny Cache",
    cost: 5,
    tempo: 7,
    band: "Fast",
  },
  "harrier-step": {
    id: "harrier-step",
    name: "Harrier Step",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
  "pinning-shot": {
    id: "pinning-shot",
    name: "Pinning Shot",
    cost: 6,
    tempo: 7,
    band: "Fast",
  },
  "flank-run": {
    id: "flank-run",
    name: "Flank Run",
    cost: 6,
    tempo: 5,
    band: "Standard",
  },
  withdraw: {
    id: "withdraw",
    name: "Withdraw",
    cost: 4,
    tempo: 8,
    band: "Fast",
  },
});

const ENEMY_DECKS = Object.freeze({
  breacher: [
    "set-guard",
    "impact-counter",
    "driving-ram",
    "slip-angle",
    "anchor-down",
    "follow-pressure",
    "breaker-coil",
    "seize-breach",
    "recover-stance",
    "crushing-return",
    "last-push",
    "breacher-withdrawal",
  ],
  guard: [
    "shield-link",
    "body-block",
    "vault-intercept",
    "brace-line",
    "cover-advance",
    "anchor-swap",
    "guard-relay",
    "pushback-screen",
    "hold-platform",
    "intercept-route",
    "recover-link",
    "guard-withdrawal",
  ],
  controller: [
    "emergency-reset",
    "purge-control",
    "charge-debris",
    "seal-gap",
    "lift-recall",
    "static-tax",
    "bollard-override",
    "cut-power",
    "reconnect-line",
    "false-read",
    "gate-desync",
    "emergency-shutdown",
  ],
  pressure: [
    "cutoff",
    "needle-volley",
    "feint-route",
    "pressure-vault-intercept",
    "pursuit",
    "exit-pressure",
    "mark-target",
    "deny-cache",
    "harrier-step",
    "pinning-shot",
    "flank-run",
    "withdraw",
  ],
});

const ROW_FLOORS = Object.freeze([
  [1, 4, 12],
  [2, 3, 13],
  [3, 2, 14],
  [4, 1, 15],
  [5, 1, 15],
  [6, 1, 15],
  [7, 1, 15],
  [8, 2, 15],
  [9, 3, 14],
  [10, 4, 13],
  [11, 5, 12],
]);

const PHYSICAL_GAPS = new Set(["8,1", "8,2", "8,3"]);
const WALKABLE_COORDS = [];
for (const [y, start, end] of ROW_FLOORS) {
  for (let x = start; x <= end; x += 1) {
    if (!PHYSICAL_GAPS.has(`${x},${y}`)) WALKABLE_COORDS.push([x, y]);
  }
}

const coordKey = (x, y) => `${x},${y}`;
const tileId = (x, y) => `tile-${x}-${y}`;
const coordFromTile = (id) => {
  const match = /^tile-(\d+)-(\d+)$/.exec(id ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const WALKABLE = new Set(WALKABLE_COORDS.map(([x, y]) => coordKey(x, y)));

const RUBBLE = new Set([
  "5,5",
  "6,5",
  "7,5",
  "6,6",
  "7,6",
  "8,6",
]);
const POWERED_TRACK = new Set([
  "4,8",
  "5,8",
  "6,8",
  "7,8",
  "8,8",
  "9,8",
  "10,8",
]);
const COVER = new Set([
  "4,4",
  "6,4",
  "7,7",
  "9,6",
  "11,4",
  "12,7",
]);

function pointToPercent(x, y) {
  return {
    x: 50 + (x - y - 2.5) * 4.4,
    y: 8 + (x + y - 5) * 3.5,
  };
}

function terrainAt(x, y) {
  const key = coordKey(x, y);
  if (RUBBLE.has(key)) return "rubble";
  if (POWERED_TRACK.has(key)) return "powered";
  if (y <= 3) return "upper";
  if (y >= 9) return "trench";
  if (x >= 12 && y >= 4 && y <= 7) return "platform";
  return "floor";
}

export const BOARD_TILES = Object.freeze(
  Object.fromEntries(
    WALKABLE_COORDS.map(([x, y]) => {
      const id = tileId(x, y);
      const point = pointToPercent(x, y);
      return [
        id,
        {
          id,
          x,
          y,
          boardX: point.x,
          boardY: point.y,
          terrain: terrainAt(x, y),
          cover: COVER.has(coordKey(x, y)),
          name: `Floor diamond ${x},${y}`,
        },
      ];
    }),
  ),
);

function focusAt(id, name, kind, x, y, description, extra = {}) {
  const point = pointToPercent(x, y);
  return {
    id,
    name,
    kind,
    tileId: tileId(x, y),
    x: point.x,
    y: point.y,
    description,
    ...extra,
  };
}

export const BOARD_FOCUSES = Object.freeze({
  "west-exit": focusAt(
    "west-exit",
    "West Exit",
    "exit",
    1,
    6,
    "The physical retreat route behind the player.",
  ),
  "cracked-divider": focusAt(
    "cracked-divider",
    "Cracked Divider",
    "terrain",
    11,
    5,
    "Brittle load-bearing cover with a powered conduit.",
  ),
  "gate-actuator": focusAt(
    "gate-actuator",
    "Gate Actuator",
    "machinery",
    10,
    8,
    "A local console connected to the track and defensive bollard.",
  ),
  "defensive-bollard": focusAt(
    "defensive-bollard",
    "Defensive Bollard",
    "machinery",
    13,
    6,
    "A retractable force redirector beside the Gate approach.",
  ),
  "service-gap": focusAt(
    "service-gap",
    "Service Gap",
    "opening",
    9,
    10,
    "An obscured physical relationship with a connected shutter.",
  ),
  "upper-crossing": focusAt(
    "upper-crossing",
    "Broken Upper Span",
    "opening",
    7,
    2,
    "A real broken span with unstable natural handholds.",
  ),
  "lift-relay": focusAt(
    "lift-relay",
    "Lift Relay",
    "machinery",
    6,
    10,
    "A local relay that can align the service lift with the upper gap.",
  ),
  "field-cache": focusAt(
    "field-cache",
    "Field Cache",
    "cache",
    6,
    2,
    "Optional battle-local recovery. It creates no permanent reward.",
  ),
  gate: focusAt(
    "gate",
    "Fractured Gate",
    "objective",
    15,
    5,
    "Stabilize this structure before its three Stability is lost.",
  ),
});

const OBJECT_BLOCKERS = new Set([
  "tile-11-5",
  "tile-10-8",
  "tile-13-6",
  "tile-9-10",
  "tile-7-2",
  "tile-6-10",
  "tile-6-2",
  "tile-15-5",
]);

const ENEMY_DEFINITIONS = Object.freeze({
  breacher: {
    id: "breacher",
    name: "Breacher",
    role: "Physical Gate pressure",
    position: "tile-10-5",
    condition: 12,
    guard: 2,
    movement: 3,
  },
  guard: {
    id: "guard",
    name: "Guard",
    role: "Protection and interception",
    position: "tile-13-5",
    condition: 11,
    guard: 5,
    movement: 3,
  },
  controller: {
    id: "controller",
    name: "Controller",
    role: "Machinery, closure, and reset",
    position: "tile-12-8",
    condition: 9,
    guard: 2,
    movement: 3,
  },
  pressure: {
    id: "pressure",
    name: "Pressure",
    role: "Flank, Cache, and exit pressure",
    position: "tile-10-2",
    condition: 9,
    guard: 1,
    movement: 4,
  },
});

export const FRACTURED_GATE_ACTIONS = Object.freeze({
  move: {
    id: "move",
    name: "Move here",
    cost: 0,
    tempo: 7,
    band: "Fast",
    kind: "Movement",
    description:
      "Spend skill-based movement across connected floor diamonds. Movement may be split around paid actions.",
  },
  attack: {
    id: "attack",
    name: "Needle attack",
    cost: 5,
    tempo: 6,
    band: "Standard",
    kind: "Action",
    description:
      "A deterministic range-two weapon action. Weapon heat prevents repeating it this turn.",
  },
  guard: {
    id: "guard",
    name: "Establish Guard",
    cost: 4,
    tempo: 7,
    band: "Fast",
    kind: "Action",
    description: "Replace the current Guard state with 6 Guard.",
  },
  "scan-intent": {
    id: "scan-intent",
    name: "Scan behavior",
    cost: 4,
    tempo: 8,
    band: "Fast",
    kind: "Hacking",
    description:
      "Reveal one enemy's current priority read. The read may change if the board changes before End Turn.",
  },
  "break-divider": {
    id: "break-divider",
    name: "Drive into Divider",
    cost: 7,
    tempo: 6,
    band: "Standard",
    kind: "Battle → Exploration",
    description:
      "Create physical contact at the Divider; Exploration converts the breach into usable geometry.",
  },
  "prepare-upper-crossing": {
    id: "prepare-upper-crossing",
    name: "Prepare natural crossing",
    cost: 7,
    tempo: 5,
    band: "Standard",
    kind: "Exploration → Battle",
    description:
      "Prepare the physical handholds. Battle can then protect the contested landing.",
  },
  "expose-regulator": {
    id: "expose-regulator",
    name: "Expose regulator",
    cost: 7,
    tempo: 6,
    band: "Standard",
    kind: "Battle → Hacking",
    description:
      "Use contact to expose the Breacher's reset hardware.",
  },
  "suppress-reset": {
    id: "suppress-reset",
    name: "Suppress regulator reset",
    cost: 6,
    tempo: 7,
    band: "Fast",
    kind: "Battle → Hacking",
    description: "Convert the exposed hardware into a lasting disable.",
  },
  "establish-actuator": {
    id: "establish-actuator",
    name: "Establish Actuator Control",
    cost: 7,
    tempo: 5,
    band: "Standard",
    kind: "Hacking → Battle",
    description:
      "Take temporary local Control. The bollard remains a separate Output.",
  },
  "bollard-output": {
    id: "bollard-output",
    name: "Execute bollard Output",
    cost: 8,
    tempo: 6,
    band: "Standard",
    kind: "Hacking → Battle",
    description:
      "Spend Control to pin or redirect a hostile beside the bollard.",
  },
  "prepare-service-gap": {
    id: "prepare-service-gap",
    name: "Prepare service relationship",
    cost: 7,
    tempo: 5,
    band: "Standard",
    kind: "Exploration → Hacking",
    description:
      "Reveal and prepare the real under-walk opening without defeating its shutter.",
  },
  "suppress-shutter": {
    id: "suppress-shutter",
    name: "Suppress service shutter",
    cost: 6,
    tempo: 7,
    band: "Fast",
    kind: "Exploration → Hacking",
    description:
      "Hold the connected shutter open and make the prepared route traversable.",
  },
  "align-lift": {
    id: "align-lift",
    name: "Align service lift",
    cost: 7,
    tempo: 5,
    band: "Standard",
    kind: "Hacking → Exploration",
    description: "Establish local lift Control at the physical relay.",
  },
  "deploy-lift": {
    id: "deploy-lift",
    name: "Deploy lift bridge",
    cost: 8,
    tempo: 5,
    band: "Standard",
    kind: "Hacking → Exploration",
    description:
      "Create temporary upper geometry; Exploration identifies the safe crossing window.",
  },
  "stabilize-gate": {
    id: "stabilize-gate",
    name: "Stabilize Gate",
    cost: 6,
    tempo: 3,
    band: "Slow",
    kind: "Objective",
    description:
      "Slow Gate Work. A faster direct interruption can delay it unless it is protected.",
  },
  "pickup-cache": {
    id: "pickup-cache",
    name: "Recover Field Cache",
    cost: 4,
    tempo: 5,
    band: "Standard",
    kind: "Recovery",
    description: "Carry the optional one-slot battle-local Cache.",
  },
  leave: {
    id: "leave",
    name: "Leave battle",
    cost: 0,
    tempo: 8,
    band: "Fast",
    kind: "Retreat",
    description:
      "Use the physical West Exit and record the unresolved objective truth.",
  },
  "field-patch": {
    id: "field-patch",
    name: "Field Patch",
    cost: 8,
    tempo: 3,
    band: "Slow",
    kind: "Card action",
    description: "Restore 3 Condition. Once per encounter.",
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getBuild(buildId) {
  return BUILDS.find((build) => build.id === buildId) ?? BUILDS[0];
}

function makeEnemy(definition) {
  const deck = ENEMY_DECKS[definition.id];
  return {
    ...definition,
    maxCondition: definition.condition,
    status: "active",
    deck: [...deck],
    hand: deck.slice(0, CORE_RULES.openingHand),
    discard: [],
    drawIndex: CORE_RULES.openingHand,
  };
}

function appendLog(state, side, title, detail, extra = {}) {
  const nextId = (state.eventCounter ?? 0) + 1;
  state.eventCounter = nextId;
  state.log.push({
    id: `${state.turn}-${nextId}`,
    turn: state.turn,
    side,
    title,
    detail,
    ...extra,
  });
  if (state.log.length > 80) state.log = state.log.slice(-80);
}

function initialState(buildId, seed) {
  const build = getBuild(buildId);
  const deck = [...build.deck];
  const state = {
    source: FRACTURED_GATE_SOURCE,
    seed,
    buildId: build.id,
    phase: "player",
    turn: 1,
    command: CORE_RULES.commandStart,
    enemyCommand: CORE_RULES.commandStart,
    enemyTurnsCompleted: 0,
    movementMax: build.movement,
    movementRemaining: build.movement,
    player: {
      position: "tile-2-6",
      condition: 12,
      maxCondition: 12,
      guard: 2,
      weaponReady: true,
      cache: false,
      status: "ready",
    },
    gate: {
      stability: 3,
      status: "unstable",
      workDelayed: false,
      work: null,
    },
    divider: {
      status: "cracked",
      conduit: "neutral",
    },
    actuator: {
      controlled: false,
      spent: false,
      feed: "east",
    },
    bollard: {
      status: "retracted",
    },
    upperCrossing: {
      prepared: false,
      protected: false,
    },
    serviceGap: {
      prepared: false,
      shutter: "closed",
    },
    lift: {
      controlled: false,
      deployed: false,
    },
    cache: {
      status: "present",
    },
    enemies: Object.fromEntries(
      Object.entries(ENEMY_DEFINITIONS).map(([id, enemy]) => [
        id,
        makeEnemy(enemy),
      ]),
    ),
    deck,
    hand: deck.slice(0, CORE_RULES.openingHand),
    discard: [],
    drawIndex: CORE_RULES.openingHand,
    refocusUsed: false,
    actionUses: {},
    enemyActionUses: {},
    lastApproach: null,
    contextFollowThrough: false,
    revealedIntel: {},
    pendingEnemyAction: null,
    currentEnemyReveal: null,
    lastExchange: null,
    lastClash: null,
    turnSummary: null,
    result: null,
    warning: "",
    eventCounter: 0,
    log: [],
  };
  appendLog(
    state,
    "system",
    "Your turn",
    `Movement ${build.movement} from ${build.name}; Command 16/32. Enemy intent is hidden.`,
  );
  return state;
}

export function createFracturedGateState(
  buildId = "battle-exploration",
  seed = "FG-ALT-01",
) {
  return initialState(buildId, seed);
}

export function resetFracturedGate(state) {
  return initialState(state.buildId, state.seed);
}

export function changeFracturedGateBuild(state, buildId) {
  return initialState(buildId, state.seed);
}

export function availableCommand(state) {
  return state.command;
}

export function availableEnemyCommand(state) {
  return state.enemyCommand;
}

function activeEnemyAt(state, position) {
  return Object.values(state.enemies).find(
    (enemy) => enemy.status !== "disabled" && enemy.position === position,
  );
}

function isObjectBlocked(state, id) {
  if (id === "tile-11-5" && state.divider.status === "breached") return false;
  if (id === "tile-9-10" && state.serviceGap.shutter === "open") return false;
  if (id === "tile-7-2" && state.upperCrossing.prepared) return false;
  return OBJECT_BLOCKERS.has(id);
}

function specialNeighbors(state, id) {
  const links = [];
  if (state.upperCrossing.prepared) {
    if (id === "tile-7-2") links.push("tile-9-2");
    if (id === "tile-9-2") links.push("tile-7-2");
  }
  if (state.serviceGap.shutter === "open") {
    if (id === "tile-9-10") links.push("tile-13-8");
    if (id === "tile-13-8") links.push("tile-9-10");
  }
  if (state.lift.deployed) {
    if (id === "tile-7-1") links.push("tile-9-1");
    if (id === "tile-9-1") links.push("tile-7-1");
  }
  return links;
}

function edgeBlocked(state, from, to) {
  const dividerEdge = new Set(["tile-10-5", "tile-11-5"]);
  return (
    state.divider.status !== "breached" &&
    dividerEdge.has(from) &&
    dividerEdge.has(to)
  );
}

function neighbors(state, id, options = {}) {
  const point = coordFromTile(id);
  if (!point) return [];
  const [x, y] = point;
  const candidates = [
    tileId(x + 1, y),
    tileId(x - 1, y),
    tileId(x, y + 1),
    tileId(x, y - 1),
    ...specialNeighbors(state, id),
  ];
  return candidates.filter((candidate) => {
    const coords = coordFromTile(candidate);
    if (!coords || !WALKABLE.has(coordKey(coords[0], coords[1]))) return false;
    if (edgeBlocked(state, id, candidate)) return false;
    if (!options.ignoreObjects && isObjectBlocked(state, candidate)) return false;
    if (!options.ignoreActors) {
      const enemy = activeEnemyAt(state, candidate);
      if (enemy && candidate !== options.destination) return false;
      if (
        options.forEnemy &&
        candidate === state.player.position &&
        candidate !== options.destination
      ) {
        return false;
      }
    }
    return true;
  });
}

function terrainCost(id) {
  return BOARD_TILES[id]?.terrain === "rubble" ? 2 : 1;
}

function shortestPaths(state, start, budget, options = {}) {
  const best = new Map([[start, { cost: 0, path: [start] }]]);
  const queue = [start];
  while (queue.length) {
    queue.sort((left, right) => best.get(left).cost - best.get(right).cost);
    const current = queue.shift();
    const currentData = best.get(current);
    for (const candidate of neighbors(state, current, options)) {
      const special = !coordFromTile(current) || !coordFromTile(candidate)
        ? false
        : Math.abs(
            coordFromTile(current)[0] - coordFromTile(candidate)[0],
          ) +
            Math.abs(
              coordFromTile(current)[1] - coordFromTile(candidate)[1],
            ) >
          1;
      const cost = currentData.cost + (special ? 2 : terrainCost(candidate));
      if (cost > budget) continue;
      if (!best.has(candidate) || cost < best.get(candidate).cost) {
        best.set(candidate, {
          cost,
          path: [...currentData.path, candidate],
        });
        queue.push(candidate);
      }
    }
  }
  return best;
}

function shortestPathTo(state, start, destination, options = {}) {
  const paths = shortestPaths(state, start, 40, {
    ...options,
    destination,
  });
  return paths.get(destination)?.path ?? null;
}

export function getReachableTiles(state) {
  if (state.phase !== "player") return {};
  const paths = shortestPaths(
    state,
    state.player.position,
    state.movementRemaining,
  );
  return Object.fromEntries(
    [...paths.entries()]
      .filter(([id]) => id !== state.player.position)
      .map(([id, value]) => [id, value]),
  );
}

function pathDistance(state, from, to, options = {}) {
  const path = shortestPathTo(state, from, to, {
    ignoreObjects: true,
    ignoreActors: true,
    ...options,
  });
  return path ? path.length - 1 : Number.POSITIVE_INFINITY;
}

function within(state, from, to, range) {
  return pathDistance(state, from, to) <= range;
}

function focusTile(state, focusId) {
  if (BOARD_TILES[focusId]) return focusId;
  if (BOARD_FOCUSES[focusId]) return BOARD_FOCUSES[focusId].tileId;
  if (state.enemies[focusId]) return state.enemies[focusId].position;
  if (focusId === "player") return state.player.position;
  return null;
}

function buildHas(state, discipline) {
  const build = getBuild(state.buildId);
  return build.major === discipline || build.minor === discipline;
}

function exactBuild(state, id) {
  return state.buildId === id;
}

function actionCard(state, cardId) {
  if (!cardId) return null;
  if (cardId === "follow-through") {
    return state.contextFollowThrough ? CARDS[cardId] : null;
  }
  return state.hand.includes(cardId) ? CARDS[cardId] : null;
}

function cardCompatible(actionId, card) {
  return card?.compatibility?.includes(actionId) ?? false;
}

function actionTotalCost(actionId, cardId) {
  const action = FRACTURED_GATE_ACTIONS[actionId];
  const card = cardId ? CARDS[cardId] : null;
  return (action?.cost ?? 0) + (card?.cost ?? 0);
}

function specificActionError(state, actionId, targetId) {
  const playerTile = state.player.position;
  const targetTile = focusTile(state, targetId);
  const targetEnemy = state.enemies[targetId];
  switch (actionId) {
    case "move": {
      const reachable = getReachableTiles(state)[targetId];
      return reachable ? null : "That diamond is outside the remaining movement allowance.";
    }
    case "attack":
      if (!targetEnemy || targetEnemy.status === "disabled") {
        return "Choose an active enemy.";
      }
      if (!state.player.weaponReady) {
        return "Weapon heat prevents another basic attack this turn.";
      }
      return within(state, playerTile, targetEnemy.position, CORE_RULES.weaponRange)
        ? null
        : "Target is outside the range-two weapon line.";
    case "guard":
      return state.actionUses.guard
        ? "Guard has already been established this turn."
        : null;
    case "scan-intent":
      if (!buildHas(state, "hacking")) return "Hacking is not part of this build.";
      if (!targetEnemy || targetEnemy.status === "disabled") {
        return "Choose an active enemy.";
      }
      return state.actionUses[`scan-${targetId}`]
        ? "That enemy has already been scanned this turn."
        : null;
    case "break-divider":
      if (!exactBuild(state, "battle-exploration")) {
        return "This ordered build does not create that force-to-route conversion.";
      }
      if (state.divider.status === "breached") return "The Divider is already breached.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["cracked-divider"].tileId,
        1,
      )
        ? null
        : "Move adjacent to the Cracked Divider.";
    case "prepare-upper-crossing":
      if (!exactBuild(state, "exploration-battle")) {
        return "This ordered build does not prepare and defend the upper landing.";
      }
      if (state.upperCrossing.prepared) return "The upper crossing is already prepared.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["upper-crossing"].tileId,
        1,
      )
        ? null
        : "Move adjacent to the broken upper span.";
    case "expose-regulator":
      if (!exactBuild(state, "battle-hacking")) {
        return "This ordered build does not expose that combat hardware.";
      }
      if (targetId !== "breacher" || targetEnemy?.status === "disabled") {
        return "Choose the active Breacher.";
      }
      if (state.revealedIntel.regulatorExposed) return "The regulator is already exposed.";
      return within(state, playerTile, targetEnemy.position, 1)
        ? null
        : "Physical contact with the Breacher is required.";
    case "suppress-reset":
      if (!exactBuild(state, "battle-hacking")) {
        return "This ordered build cannot convert the exposed regulator.";
      }
      if (!state.revealedIntel.regulatorExposed) {
        return "Expose the Breacher's regulator first.";
      }
      return within(state, playerTile, state.enemies.breacher.position, 2)
        ? null
        : "Move within two diamonds of the exposed regulator.";
    case "establish-actuator":
      if (!exactBuild(state, "hacking-battle")) {
        return "This ordered build does not establish and hold Actuator Control.";
      }
      if (state.actuator.controlled) return "Actuator Control is already active.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["gate-actuator"].tileId,
        1,
      )
        ? null
        : "Physical access beside the Gate Actuator is required.";
    case "bollard-output":
      if (!exactBuild(state, "hacking-battle")) {
        return "This ordered build cannot convert Actuator Control into physical force.";
      }
      if (!state.actuator.controlled || state.actuator.spent) {
        return "Establish unused Actuator Control first.";
      }
      if (!targetEnemy || targetEnemy.status === "disabled") {
        return "Choose an active enemy beside the defensive bollard.";
      }
      return within(
        state,
        targetEnemy.position,
        BOARD_FOCUSES["defensive-bollard"].tileId,
        2,
      )
        ? null
        : "The selected enemy is outside the bollard's local reach.";
    case "prepare-service-gap":
      if (!exactBuild(state, "exploration-hacking")) {
        return "This ordered build does not prepare the service relationship.";
      }
      if (state.serviceGap.prepared) return "The service relationship is already prepared.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["service-gap"].tileId,
        1,
      )
        ? null
        : "Move adjacent to the obscured service opening.";
    case "suppress-shutter":
      if (!exactBuild(state, "exploration-hacking")) {
        return "This ordered build cannot suppress that closure.";
      }
      if (!state.serviceGap.prepared) return "Prepare the service relationship first.";
      if (state.serviceGap.shutter === "open") return "The shutter is already held open.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["service-gap"].tileId,
        1,
      )
        ? null
        : "Remain beside the service opening.";
    case "align-lift":
      if (!exactBuild(state, "hacking-exploration")) {
        return "This ordered build does not align and read the service lift.";
      }
      if (state.lift.controlled) return "Lift Control is already active.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["lift-relay"].tileId,
        1,
      )
        ? null
        : "Physical access beside the Lift Relay is required.";
    case "deploy-lift":
      if (!exactBuild(state, "hacking-exploration")) {
        return "This ordered build cannot create that temporary geometry.";
      }
      if (!state.lift.controlled) return "Align the service lift first.";
      return state.lift.deployed ? "The lift bridge is already deployed." : null;
    case "stabilize-gate":
      if (state.gate.status === "stabilized") return "The Gate is already stabilized.";
      if (state.gate.status === "working") {
        return "Gate Work is already active through the next Enemy Turn.";
      }
      return within(
        state,
        playerTile,
        BOARD_FOCUSES.gate.tileId,
        1,
      )
        ? null
        : "Move adjacent to the Fractured Gate.";
    case "pickup-cache":
      if (state.cache.status !== "present") return "The Field Cache is no longer here.";
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["field-cache"].tileId,
        1,
      )
        ? null
        : "Move adjacent to the Field Cache.";
    case "leave":
      return within(
        state,
        playerTile,
        BOARD_FOCUSES["west-exit"].tileId,
        1,
      )
        ? null
        : "Return to the physical West Exit.";
    case "field-patch":
      if (state.actionUses.fieldPatch) return "Field Patch is once per encounter.";
      if (state.player.condition >= state.player.maxCondition) {
        return "Condition is already full.";
      }
      return null;
    default:
      return targetTile ? null : "Choose a legal battlefield target.";
  }
}

function validateAction(state, actionId, targetId, cardId = null) {
  if (state.phase !== "player") {
    return "Actions are available only during Your Turn.";
  }
  const action = FRACTURED_GATE_ACTIONS[actionId];
  if (!action) return "Unknown action.";
  const card = actionCard(state, cardId);
  if (cardId && !card) return "That card is not currently available.";
  if (card && !cardCompatible(actionId, card)) {
    return `${card.name} is not compatible with ${action.name}.`;
  }
  const cost = actionTotalCost(actionId, cardId);
  if (cost > state.command) {
    return `${cost} Command is required; ${state.command} remains.`;
  }
  return specificActionError(state, actionId, targetId);
}

function routeKind(path) {
  const terrains = new Set(
    (path ?? []).slice(1).map((id) => BOARD_TILES[id]?.terrain),
  );
  if (terrains.has("rubble")) return "rubble";
  if (terrains.has("powered")) return "powered";
  if (
    path?.length > 2 &&
    [...terrains].every((terrain) => ["floor", "platform"].includes(terrain))
  ) {
    return "clear";
  }
  return "mixed";
}

export function tempoComparisonForRoute(
  route,
  poweredFeed = "east",
  baseTempo = 5,
  opponentTempo = 6,
) {
  let modifier = 0;
  let reason = "No route modifier.";
  if (route === "clear") {
    modifier = 1;
    reason = "The uninterrupted clear approach preserves momentum.";
  } else if (route === "rubble") {
    modifier = -2;
    reason = "Rubble breaks the movement-to-action link.";
  } else if (route === "powered" && poweredFeed === "east") {
    modifier = 2;
    reason = "The powered service track accelerates the eastbound approach.";
  } else if (route === "powered") {
    modifier = -1;
    reason = "The powered track is feeding against the approach.";
  }
  const player = Math.max(1, Math.min(9, baseTempo + modifier));
  const relation =
    player > opponentTempo
      ? "player-first"
      : player < opponentTempo
        ? "enemy-first"
        : "simultaneous";
  return {
    route,
    player,
    enemy: opponentTempo,
    relation,
    playerBand: tempoBand(player),
    enemyBand: tempoBand(opponentTempo),
    reason,
  };
}

function tempoBand(score) {
  if (score >= 7) return "Fast";
  if (score >= 4) return "Standard";
  return "Slow";
}

function projectedEnemyResponse(state, actionId, targetId) {
  const target = state.enemies[targetId];
  const candidates = [];
  if (
    ["attack", "break-divider", "expose-regulator"].includes(actionId) &&
    target
  ) {
    const responseId =
      target.id === "breacher"
        ? "impact-counter"
        : target.id === "guard"
          ? "brace-line"
          : null;
    if (
      responseId &&
      target.hand.includes(responseId) &&
      ENEMY_CARDS[responseId].cost <= state.enemyCommand
    ) {
      candidates.push({
        actorId: target.id,
        cardId: responseId,
        ...ENEMY_CARDS[responseId],
      });
    }
  }
  if (
    ["suppress-reset", "establish-actuator", "suppress-shutter", "align-lift"].includes(
      actionId,
    )
  ) {
    const cardId =
      actionId === "suppress-shutter" ? "seal-gap" : "emergency-reset";
    const controller = state.enemies.controller;
    if (
      controller.status !== "disabled" &&
      controller.hand.includes(cardId) &&
      ENEMY_CARDS[cardId].cost <= state.enemyCommand
    ) {
      candidates.push({
        actorId: "controller",
        cardId,
        ...ENEMY_CARDS[cardId],
      });
    }
  }
  return candidates[0] ?? null;
}

function actionTempo(state, actionId, cardId) {
  const action = FRACTURED_GATE_ACTIONS[actionId];
  const card = cardId ? CARDS[cardId] : null;
  let score = action.tempo + (card?.tempoDelta ?? 0);
  let route = null;
  let routeReason = null;
  if (
    ["attack", "break-divider", "expose-regulator", "bollard-output"].includes(
      actionId,
    ) &&
    state.lastApproach
  ) {
    route = state.lastApproach.kind;
    const comparison = tempoComparisonForRoute(
      route,
      state.actuator.feed,
      score,
      6,
    );
    score = comparison.player;
    routeReason = comparison.reason;
  }
  return {
    score: Math.max(1, Math.min(9, score)),
    band: tempoBand(score),
    route,
    routeReason,
  };
}

export function getCompatibleCards(state, actionId) {
  return state.hand.filter((cardId) =>
    cardCompatible(actionId, CARDS[cardId]),
  );
}

export function getAvailableContextCards(state, actionId = null) {
  if (
    state.contextFollowThrough &&
    (!actionId || cardCompatible(actionId, CARDS["follow-through"]))
  ) {
    return ["follow-through"];
  }
  return [];
}

function actionExpectedText(actionId, targetId) {
  const targetName =
    BOARD_FOCUSES[targetId]?.name ??
    ENEMY_DEFINITIONS[targetId]?.name ??
    BOARD_TILES[targetId]?.name ??
    "the selected target";
  const lines = {
    move: `Move to ${targetName} using the highlighted connected route.`,
    attack: `Resolve a deterministic weapon action against ${targetName}.`,
    guard: "Replace current Guard with a 6-Guard stance.",
    "scan-intent":
      "Reveal a current AI priority read, not a permanent path prediction.",
    "break-divider":
      "Break the Divider through physical contact and create a two-way route.",
    "prepare-upper-crossing":
      "Prepare the natural upper crossing; it remains physically contestable.",
    "expose-regulator":
      "Expose the Breacher's regulator through physical contact.",
    "suppress-reset":
      "Suppress the exposed regulator and keep the Breacher disabled.",
    "establish-actuator":
      "Take temporary local Control without automatically firing the bollard.",
    "bollard-output":
      "Spend Actuator Control to pin or redirect the selected enemy.",
    "prepare-service-gap":
      "Prepare the real service relationship without bypassing its shutter.",
    "suppress-shutter":
      "Hold the physical shutter open and enable the service route.",
    "align-lift":
      "Take temporary Control of the service lift relay.",
    "deploy-lift":
      "Create a temporary capacity-one bridge across the upper gap.",
    "stabilize-gate":
      "Begin Slow Gate Work. It completes only after surviving the next Enemy Turn.",
    "pickup-cache": "Carry the optional Field Cache.",
    leave: "Leave through the West Exit with the objective unresolved.",
    "field-patch": "Restore 3 Condition.",
  };
  return lines[actionId] ?? `Use ${targetName}.`;
}

export function previewAction(state, actionId, targetId, cardId = null) {
  const error = validateAction(state, actionId, targetId, cardId);
  const action = FRACTURED_GATE_ACTIONS[actionId];
  if (error || !action) {
    return {
      legal: false,
      error: error ?? "Unknown action.",
      actionId,
      targetId,
    };
  }
  const totalCost = actionTotalCost(actionId, cardId);
  const tempo = actionTempo(state, actionId, cardId);
  const response = projectedEnemyResponse(state, actionId, targetId);
  const relation = response
    ? tempo.score > response.tempo
      ? "You likely act first"
      : tempo.score < response.tempo
        ? "Enemy likely acts first"
        : "Contact is likely simultaneous"
    : "No visible local opposition";
  let path = [];
  let movementCost = 0;
  if (actionId === "move") {
    const movement = getReachableTiles(state)[targetId];
    path = movement.path;
    movementCost = movement.cost;
  }
  return {
    legal: true,
    actionId,
    targetId,
    cardId,
    action,
    totalCost,
    remainingCommand: state.command - totalCost,
    tempo: {
      ...tempo,
      relation,
      unknownFactors: response ? 1 : 0,
    },
    path,
    movementCost,
    expected: [
      actionExpectedText(actionId, targetId),
      cardId ? `${CARDS[cardId].name}: ${CARDS[cardId].effect}` : null,
    ].filter(Boolean),
    risks: [
      response
        ? "One concealed legal enemy response may alter the local resolution."
        : null,
      actionId === "move" && routeKind(path) === "rubble"
        ? "Rubble costs extra movement and slows the next linked physical action."
        : null,
      actionId === "stabilize-gate" && cardId !== "objective-brace"
        ? "Unprotected Slow Work must survive the next adaptive Enemy Turn."
        : null,
      actionId === "stabilize-gate" && cardId === "objective-brace"
        ? "Objective Brace ignores the first direct interruption during the next Enemy Turn."
        : null,
    ].filter(Boolean),
    signature: stableHash({
      seed: state.seed,
      turn: state.turn,
      state: displaySnapshot(state),
      actionId,
      targetId,
      cardId,
      response: Boolean(response),
    }),
  };
}

function spendCard(state, cardId) {
  if (!cardId || cardId === "follow-through") return;
  const index = state.hand.indexOf(cardId);
  if (index >= 0) {
    state.hand.splice(index, 1);
    state.discard.push(cardId);
  }
}

function spendEnemyCard(state, actorId, cardId) {
  const actor = state.enemies[actorId];
  const index = actor.hand.indexOf(cardId);
  if (index >= 0) {
    actor.hand.splice(index, 1);
    actor.discard.push(cardId);
  }
}

function impact(target, amount) {
  const absorbed = Math.min(target.guard, amount);
  target.guard -= absorbed;
  const conditionLoss = Math.max(0, amount - absorbed);
  target.condition = Math.max(0, target.condition - conditionLoss);
  return { absorbed, conditionLoss };
}

function disableIfNeeded(enemy) {
  if (enemy.condition <= 0) {
    enemy.status = "disabled";
    enemy.guard = 0;
  }
}

function revealIntelForEnemy(state, enemyId) {
  const enemy = state.enemies[enemyId];
  const priorities = {
    breacher:
      within(state, enemy.position, state.player.position, 1)
        ? "Current read: attack the blocking player."
        : "Current read: advance toward the Gate unless the board changes.",
    guard:
      pathDistance(state, state.player.position, BOARD_FOCUSES.gate.tileId) <= 5
        ? "Current read: intercept the player's Gate approach."
        : "Current read: preserve the Breacher's protection.",
    controller: state.actuator.controlled
      ? "Current read: purge the player's Actuator Control."
      : state.divider.status === "breached"
        ? "Current read: exploit the exposed Divider conduit."
        : "Current read: preserve connected machinery options.",
    pressure:
      pathDistance(state, enemy.position, state.player.position) <= 5
        ? "Current read: apply ranged pressure."
        : "Current read: reposition toward a flank, Cache, or retreat line.",
  };
  state.revealedIntel[enemyId] = {
    turn: state.turn,
    text: priorities[enemyId],
    caveat: "This is a skill-revealed current read, not a locked path.",
  };
}

function applyPlayerEffect(state, actionId, targetId, cardId) {
  const boosted = cardId === "brace-through";
  switch (actionId) {
    case "move": {
      const movement = getReachableTiles(state)[targetId];
      state.player.position = targetId;
      state.movementRemaining -= movement.cost;
      const kind = routeKind(movement.path);
      state.lastApproach = {
        path: movement.path,
        kind,
        cost: movement.cost,
      };
      state.contextFollowThrough =
        kind === "clear" && movement.path.length >= 3;
      if (cardId === "covering-step") state.player.guard += 2;
      return {
        title: "Movement complete",
        detail: `${movement.cost} movement spent across ${kind} terrain; ${state.movementRemaining} remains.`,
      };
    }
    case "attack": {
      const enemy = state.enemies[targetId];
      const result = impact(enemy, boosted ? 6 : 4);
      state.player.weaponReady = false;
      disableIfNeeded(enemy);
      return {
        title: `${enemy.name} struck`,
        detail: `${result.absorbed} Guard absorbed; ${result.conditionLoss} Condition lost.`,
      };
    }
    case "guard":
      state.player.guard = Math.max(state.player.guard, 6);
      state.actionUses.guard = true;
      return {
        title: "Guard established",
        detail: "6 Guard is active. Repeating Guard would not stack another state.",
      };
    case "scan-intent":
      revealIntelForEnemy(state, targetId);
      state.actionUses[`scan-${targetId}`] = true;
      return {
        title: `${state.enemies[targetId].name} behavior scanned`,
        detail: state.revealedIntel[targetId].text,
      };
    case "break-divider": {
      state.divider.status = "breached";
      state.contextFollowThrough = false;
      const result = impact(state.enemies.breacher, boosted ? 6 : 4);
      state.enemies.breacher.status =
        state.enemies.breacher.condition > 0 ? "staggered" : "disabled";
      return {
        title: "Divider breached",
        detail: `Physical contact opened a two-way route and cost the Breacher ${result.conditionLoss} Condition.`,
      };
    }
    case "prepare-upper-crossing":
      state.upperCrossing.prepared = true;
      state.upperCrossing.protected = true;
      return {
        title: "Upper crossing prepared",
        detail: "Natural handholds now connect the broken span; the landing remains contestable.",
      };
    case "expose-regulator": {
      state.revealedIntel.regulatorExposed = true;
      const result = impact(state.enemies.breacher, boosted ? 5 : 3);
      disableIfNeeded(state.enemies.breacher);
      return {
        title: "Regulator exposed",
        detail: `Battle contact exposed real reset hardware and dealt ${result.conditionLoss} Condition.`,
      };
    }
    case "suppress-reset":
      state.revealedIntel.regulatorSuppressed = true;
      state.enemies.breacher.status = "off-balance";
      return {
        title: "Regulator reset suppressed",
        detail: "The Breacher cannot automatically recover its physical stance.",
      };
    case "establish-actuator":
      state.actuator.controlled = true;
      state.actuator.spent = false;
      return {
        title: "Actuator Control established",
        detail: "Local Control is active; the bollard remains a separate paid Output.",
      };
    case "bollard-output": {
      const enemy = state.enemies[targetId];
      state.actuator.spent = true;
      state.bollard.status = "extended";
      enemy.status = "pinned";
      const result = impact(enemy, boosted ? 6 : 4);
      disableIfNeeded(enemy);
      return {
        title: `${enemy.name} pinned at the bollard`,
        detail: `The bounded Output dealt ${result.conditionLoss} Condition and spent Actuator Control.`,
      };
    }
    case "prepare-service-gap":
      state.serviceGap.prepared = true;
      return {
        title: "Service relationship prepared",
        detail: "The real opening is known, but its connected shutter is still closed.",
      };
    case "suppress-shutter":
      state.serviceGap.shutter = "open";
      return {
        title: "Service shutter suppressed",
        detail: "The prepared physical route is now traversable by either side.",
      };
    case "align-lift":
      state.lift.controlled = true;
      return {
        title: "Service lift aligned",
        detail: "Lift Output is available; no geometry has moved yet.",
      };
    case "deploy-lift":
      state.lift.deployed = true;
      state.lift.controlled = false;
      return {
        title: "Lift bridge deployed",
        detail: "A temporary capacity-one upper crossing now exists.",
      };
    case "stabilize-gate":
      state.gate.status = "working";
      state.gate.workDelayed = false;
      state.gate.work = {
        startedTurn: state.turn,
        position: state.player.position,
        protected: cardId === "objective-brace",
      };
      return {
        title: "Gate Work started",
        detail:
          cardId === "objective-brace"
            ? "Slow Work is active through the Enemy Turn; Objective Brace protects its first direct interruption."
            : "Slow Work is active and unprotected through the next Enemy Turn.",
      };
    case "pickup-cache":
      state.cache.status = "carried";
      state.player.cache = true;
      return {
        title: "Field Cache recovered",
        detail: "The one-slot battle-local Cache is now carried.",
      };
    case "leave":
      return {
        title: "West Exit used",
        detail: "The player left while the Gate and enemy formation remained unresolved.",
      };
    case "field-patch":
      state.player.condition = Math.min(
        state.player.maxCondition,
        state.player.condition + 3,
      );
      state.actionUses.fieldPatch = true;
      return {
        title: "Field Patch applied",
        detail: `Condition restored to ${state.player.condition}/${state.player.maxCondition}.`,
      };
    default:
      return { title: "Action resolved", detail: "The battlefield updated." };
  }
}

function applyEnemyResponse(state, response, actionId, cardId) {
  const actor = state.enemies[response.actorId];
  switch (response.cardId) {
    case "impact-counter": {
      const result = impact(state.player, 3);
      return {
        title: "Impact Counter",
        detail: `${actor.name} returned contact for ${result.conditionLoss} Condition after Guard.`,
      };
    }
    case "brace-line":
      actor.guard += 4;
      return {
        title: "Brace Line",
        detail: `${actor.name} established 4 Guard against the incoming force.`,
      };
    case "emergency-reset":
      if (cardId === "clean-buffer" || cardId === "quiet-rewrite") {
        return {
          title: "Emergency Reset buffered",
          detail: `${CARDS[cardId].name} prevented the first connected-system interruption.`,
        };
      }
      if (actionId === "suppress-reset") {
        state.revealedIntel.regulatorExposed = false;
      }
      if (actionId === "establish-actuator") state.actuator.controlled = false;
      if (actionId === "align-lift") state.lift.controlled = false;
      return {
        title: "Emergency Reset",
        detail: "Controller reset the exposed source before the slower operation completed.",
        invalidates:
          actionId === "suppress-reset" ||
          actionId === "establish-actuator" ||
          actionId === "align-lift",
      };
    case "seal-gap":
      if (cardId === "clean-buffer") {
        return {
          title: "Seal Gap buffered",
          detail: "Clean Buffer absorbed the connected shutter response.",
        };
      }
      state.serviceGap.shutter = "closed";
      return {
        title: "Seal Gap",
        detail: "Controller triggered the physical shutter.",
        invalidates: actionId === "suppress-shutter",
      };
    case "static-tax":
      state.gate.workDelayed = true;
      return {
        title: "Static Tax",
        detail:
          cardId === "objective-brace"
            ? "Objective Brace held legal access through the delay."
            : "The faster connected response delayed unprotected Gate Work.",
        invalidates: cardId !== "objective-brace",
      };
    default:
      return {
        title: response.name,
        detail: `${actor.name} used a legal local response.`,
      };
  }
}

function resultForSecure(state) {
  if (state.player.cache) return "Recovery Secure";
  const activeOnPlatform = Object.values(state.enemies).some(
    (enemy) =>
      enemy.status !== "disabled" &&
      BOARD_TILES[enemy.position]?.terrain === "platform",
  );
  if (
    state.divider.status !== "breached" &&
    !activeOnPlatform &&
    state.player.condition > 0
  ) {
    return "Clean Secure";
  }
  if (state.turn <= 3) return "Fast Secure";
  return "Gate Secure";
}

function buildResult(state, title, cause) {
  const enemies = Object.values(state.enemies)
    .map(
      (enemy) =>
        `${enemy.name}: ${enemy.status}, ${enemy.condition}/${enemy.maxCondition} Condition`,
    )
    .join(" · ");
  const tradeoffs = [];
  if (state.divider.status === "breached") tradeoffs.push("Divider breached");
  if (state.bollard.status !== "retracted") {
    tradeoffs.push(`bollard ${state.bollard.status}`);
  }
  if (!state.player.cache && state.cache.status === "present") {
    tradeoffs.push("Field Cache left behind");
  }
  if (state.gate.stability < 3) {
    tradeoffs.push(`Gate ended at ${state.gate.stability}/3 Stability`);
  }
  if (!tradeoffs.length) tradeoffs.push("No major infrastructure sacrifice");
  return {
    title,
    cause,
    objective:
      state.gate.status === "stabilized"
        ? `Gate stabilized at ${state.gate.stability}/3 Stability`
        : `Gate ${state.gate.status} at ${state.gate.stability}/3 Stability`,
    player: `${state.player.condition}/${state.player.maxCondition} Condition · ${state.player.guard} Guard`,
    enemies,
    cache: state.player.cache
      ? "Recovered and carried"
      : state.cache.status === "present"
        ? "Not recovered"
        : state.cache.status,
    environment: `Divider ${state.divider.status} · Actuator ${
      state.actuator.controlled ? "controlled" : "neutral"
    } · Bollard ${state.bollard.status}`,
    turningPoint:
      state.log
        .filter((event) => event.side !== "system")
        .at(-1)?.title ?? cause,
    tradeoff: tradeoffs.join(" · "),
  };
}

function endWithResult(state, title, cause) {
  state.phase = "result";
  state.pendingEnemyAction = null;
  state.result = buildResult(state, title, cause);
  appendLog(state, "system", title, cause);
}

function checkImmediateResult(state) {
  if (state.gate.status === "stabilized") {
    endWithResult(
      state,
      resultForSecure(state),
      "Gate Work completed before another enemy action.",
    );
    return true;
  }
  if (state.gate.stability <= 0) {
    state.gate.status = "lost";
    endWithResult(
      state,
      "Gate Lost",
      "Gate Stability reached zero before stabilization.",
    );
    return true;
  }
  if (state.player.condition <= 0) {
    state.player.status = "compromised";
    if (state.player.cache) {
      state.player.cache = false;
      state.cache.status = "dropped";
    }
    endWithResult(
      state,
      "Defeated",
      "The solo player became Compromised with no ally rescue in this proof.",
    );
    return true;
  }
  return false;
}

export function performAction(state, actionId, targetId, cardId = null) {
  const error = validateAction(state, actionId, targetId, cardId);
  if (error) {
    const rejected = clone(state);
    rejected.warning = error;
    return rejected;
  }
  const next = clone(state);
  next.warning = "";
  next.lastExchange = null;
  next.lastClash = null;
  const action = FRACTURED_GATE_ACTIONS[actionId];
  const totalCost = actionTotalCost(actionId, cardId);
  const tempo = actionTempo(next, actionId, cardId);
  const response = projectedEnemyResponse(next, actionId, targetId);
  next.command -= totalCost;
  spendCard(next, cardId);
  if (cardId === "follow-through") next.contextFollowThrough = false;

  let responseResult = null;
  let actionResult = null;
  let relation = "unopposed";
  if (response) {
    next.enemyCommand -= response.cost;
    spendEnemyCard(next, response.actorId, response.cardId);
    relation =
      tempo.score > response.tempo
        ? "player-first"
        : tempo.score < response.tempo
          ? "enemy-first"
          : "simultaneous";
    if (relation === "enemy-first") {
      responseResult = applyEnemyResponse(next, response, actionId, cardId);
      if (!responseResult.invalidates) {
        actionResult = applyPlayerEffect(next, actionId, targetId, cardId);
      }
    } else if (relation === "player-first") {
      actionResult = applyPlayerEffect(next, actionId, targetId, cardId);
      if (next.enemies[response.actorId]?.status !== "disabled") {
        responseResult = applyEnemyResponse(next, response, actionId, cardId);
      }
    } else {
      const before = clone(next);
      actionResult = applyPlayerEffect(next, actionId, targetId, cardId);
      const responseState = clone(before);
      responseResult = applyEnemyResponse(
        responseState,
        response,
        actionId,
        cardId,
      );
      next.player = responseState.player;
      next.gate.workDelayed =
        next.gate.workDelayed || responseState.gate.workDelayed;
      if (responseResult.invalidates && cardId !== "objective-brace") {
        next.gate.status = before.gate.status;
        next.actuator = before.actuator;
        next.serviceGap = before.serviceGap;
        next.lift = before.lift;
        next.revealedIntel = before.revealedIntel;
      }
    }
  } else {
    actionResult = applyPlayerEffect(next, actionId, targetId, cardId);
  }

  if (actionId === "leave") {
    endWithResult(
      next,
      "Controlled Retreat",
      "The player used the West Exit before securing the Gate.",
    );
    return next;
  }

  const meaningfulContact =
    response &&
    [
      "attack",
      "break-divider",
      "expose-regulator",
      "bollard-output",
      "stabilize-gate",
    ].includes(actionId);
  next.lastExchange = {
    side: "player",
    action: action.name,
    actionTempo: `${tempo.band} ${tempo.score}`,
    response: response?.name ?? null,
    responseTempo: response
      ? `${tempoBand(response.tempo)} ${response.tempo}`
      : null,
    relation,
    summary:
      relation === "enemy-first"
        ? [responseResult?.detail, actionResult?.detail]
            .filter(Boolean)
            .join(" ")
        : relation === "simultaneous"
          ? `Simultaneous: ${[actionResult?.detail, responseResult?.detail]
              .filter(Boolean)
              .join(" ")}`
          : [actionResult?.detail, responseResult?.detail]
              .filter(Boolean)
              .join(" "),
  };
  if (meaningfulContact) {
    next.lastClash = {
      title: "CLASH",
      participants: `Player × ${next.enemies[response.actorId].name}`,
      relation,
      summary: next.lastExchange.summary,
    };
  }
  appendLog(
    next,
    "player",
    actionResult?.title ?? action.name,
    next.lastExchange.summary || action.description,
    {
      tempo: next.lastExchange.actionTempo,
      opposedBy: response?.name ?? null,
      clash: meaningfulContact,
    },
  );
  checkImmediateResult(next);
  return next;
}

export function getContextActions(state, focusId) {
  const ids = [];
  if (BOARD_TILES[focusId]) ids.push("move");
  if (focusId === "player") {
    ids.push("guard");
    if (
      state.hand.includes("field-patch") &&
      state.player.condition < state.player.maxCondition
    ) {
      ids.push("field-patch");
    }
  }
  if (state.enemies[focusId]) {
    ids.push("attack");
    if (buildHas(state, "hacking")) ids.push("scan-intent");
    if (focusId === "breacher" && exactBuild(state, "battle-hacking")) {
      ids.push(
        state.revealedIntel.regulatorExposed
          ? "suppress-reset"
          : "expose-regulator",
      );
    }
    if (
      exactBuild(state, "hacking-battle") &&
      state.actuator.controlled
    ) {
      ids.push("bollard-output");
    }
  }
  if (
    focusId === "cracked-divider" &&
    exactBuild(state, "battle-exploration")
  ) {
    ids.push("break-divider");
  }
  if (
    focusId === "upper-crossing" &&
    exactBuild(state, "exploration-battle")
  ) {
    ids.push("prepare-upper-crossing");
  }
  if (
    focusId === "gate-actuator" &&
    exactBuild(state, "hacking-battle")
  ) {
    ids.push("establish-actuator");
  }
  if (
    focusId === "service-gap" &&
    exactBuild(state, "exploration-hacking")
  ) {
    ids.push(
      state.serviceGap.prepared
        ? "suppress-shutter"
        : "prepare-service-gap",
    );
  }
  if (
    focusId === "lift-relay" &&
    exactBuild(state, "hacking-exploration")
  ) {
    ids.push(state.lift.controlled ? "deploy-lift" : "align-lift");
  }
  if (focusId === "gate") ids.push("stabilize-gate");
  if (focusId === "field-cache") ids.push("pickup-cache");
  if (focusId === "west-exit") ids.push("leave");
  return ids.map((id) => {
    const action = FRACTURED_GATE_ACTIONS[id];
    const error = validateAction(state, id, focusId);
    return {
      ...action,
      legal: !error,
      reason: error,
      targetId: focusId,
    };
  });
}

export function getContextActionGroups(state, focusId) {
  return [
    {
      parent: "Context",
      choices: getContextActions(state, focusId),
    },
  ];
}

function enemyCardAvailable(state, actorId, cardId) {
  const card = ENEMY_CARDS[cardId];
  return (
    state.enemies[actorId].status !== "disabled" &&
    state.enemies[actorId].hand.includes(cardId) &&
    card.cost <= state.enemyCommand
  );
}

function pathToward(state, actorId, destination, movement) {
  const actor = state.enemies[actorId];
  const path = shortestPathTo(state, actor.position, destination, {
    forEnemy: true,
  });
  if (!path) return [actor.position];
  const steps = [path[0]];
  let spent = 0;
  for (const id of path.slice(1)) {
    const cost = terrainCost(id);
    if (spent + cost > movement) break;
    steps.push(id);
    spent += cost;
  }
  return steps;
}

function enemyCandidates(state) {
  const candidates = [];
  const add = (candidate) => {
    if (state.enemyActionUses[candidate.onceKey]) return;
    if (candidate.cost > state.enemyCommand) return;
    candidates.push(candidate);
  };
  const breacher = state.enemies.breacher;
  const guard = state.enemies.guard;
  const controller = state.enemies.controller;
  const pressure = state.enemies.pressure;
  const playerNearGate =
    pathDistance(state, state.player.position, BOARD_FOCUSES.gate.tileId) <= 5;

  if (
    breacher.status !== "disabled" &&
    within(state, breacher.position, state.player.position, 1)
  ) {
    add({
      id: "breacher-strike",
      actorId: "breacher",
      name: "Breaker strike",
      cardId: enemyCardAvailable(state, "breacher", "driving-ram")
        ? "driving-ram"
        : null,
      cost: enemyCardAvailable(state, "breacher", "driving-ram") ? 8 : 6,
      tempo: 5,
      band: "Standard",
      targetId: "player",
      targetType: "player",
      path: [breacher.position],
      onceKey: "breacher-physical",
      score: 130,
      responseType: "enemy-physical",
    });
  } else if (
    breacher.status !== "disabled" &&
    enemyCardAvailable(state, "breacher", "driving-ram")
  ) {
    const path = pathToward(
      state,
      "breacher",
      "tile-14-5",
      breacher.movement,
    );
    add({
      id: "breacher-rush",
      actorId: "breacher",
      name: "Driving Ram",
      cardId: "driving-ram",
      cost: 8,
      tempo: 5,
      band: "Standard",
      targetId: "gate",
      targetType: "objective",
      path,
      onceKey: "breacher-physical",
      score: 92 + (3 - state.gate.stability) * 12,
      responseType: playerNearGate ? "enemy-objective" : null,
    });
  }

  if (
    guard.status !== "disabled" &&
    breacher.status !== "disabled" &&
    breacher.guard < 5 &&
    enemyCardAvailable(state, "guard", "shield-link")
  ) {
    add({
      id: "guard-cover",
      actorId: "guard",
      name: "Shield Link",
      cardId: "shield-link",
      cost: 4,
      tempo: 7,
      band: "Fast",
      targetId: "breacher",
      targetType: "ally",
      path: [guard.position],
      onceKey: "guard-protection",
      score: 102,
      responseType: null,
    });
  }

  if (
    guard.status !== "disabled" &&
    playerNearGate &&
    enemyCardAvailable(state, "guard", "body-block")
  ) {
    const path = pathToward(
      state,
      "guard",
      state.player.position,
      guard.movement,
    );
    add({
      id: "guard-intercept",
      actorId: "guard",
      name: "Body Block",
      cardId: "body-block",
      cost: 6,
      tempo: 5,
      band: "Standard",
      targetId: "player",
      targetType: "player",
      path,
      onceKey: "guard-intercept",
      score: 112,
      responseType:
        path.at(-1) &&
        pathDistance(state, path.at(-1), state.player.position) <= 1
          ? "enemy-physical"
          : null,
    });
  }

  if (
    controller.status !== "disabled" &&
    state.gate.status === "working" &&
    enemyCardAvailable(state, "controller", "static-tax")
  ) {
    add({
      id: "controller-static-tax",
      actorId: "controller",
      name: "Static Tax",
      cardId: "static-tax",
      cost: 4,
      tempo: 6,
      band: "Fast",
      targetId: "gate",
      targetType: "system",
      path: [controller.position],
      onceKey: "controller-system",
      score: 160,
      responseType: "enemy-system",
    });
  } else if (
    controller.status !== "disabled" &&
    state.actuator.controlled &&
    enemyCardAvailable(state, "controller", "purge-control")
  ) {
    add({
      id: "controller-purge",
      actorId: "controller",
      name: "Purge Control",
      cardId: "purge-control",
      cost: 6,
      tempo: 5,
      band: "Standard",
      targetId: "gate-actuator",
      targetType: "system",
      path: [controller.position],
      onceKey: "controller-system",
      score: 150,
      responseType: "enemy-system",
    });
  } else if (
    controller.status !== "disabled" &&
    state.divider.status === "breached" &&
    state.divider.conduit === "neutral" &&
    enemyCardAvailable(state, "controller", "charge-debris")
  ) {
    add({
      id: "controller-charge",
      actorId: "controller",
      name: "Charge Debris",
      cardId: "charge-debris",
      cost: 5,
      tempo: 7,
      band: "Fast",
      targetId: "cracked-divider",
      targetType: "system",
      path: [controller.position],
      onceKey: "controller-system",
      score: 94,
      responseType: "enemy-system",
    });
  } else if (
    controller.status !== "disabled" &&
    state.turn >= 2 &&
    enemyCardAvailable(state, "controller", "gate-desync")
  ) {
    add({
      id: "controller-desync",
      actorId: "controller",
      name: "Gate Desync",
      cardId: "gate-desync",
      cost: 8,
      tempo: 3,
      band: "Slow",
      targetId: "gate",
      targetType: "objective",
      path: [controller.position],
      onceKey: "controller-system",
      score: 74 + (3 - state.gate.stability) * 10,
      responseType: playerNearGate ? "enemy-objective" : null,
    });
  }

  if (
    pressure.status !== "disabled" &&
    within(state, pressure.position, state.player.position, 5) &&
    enemyCardAvailable(state, "pressure", "needle-volley")
  ) {
    add({
      id: "pressure-volley",
      actorId: "pressure",
      name: "Needle Volley",
      cardId: "needle-volley",
      cost: 6,
      tempo: 7,
      band: "Fast",
      targetId: "player",
      targetType: "player",
      path: [pressure.position],
      onceKey: "pressure-action",
      score: 104,
      responseType: "enemy-ranged",
    });
  } else if (
    pressure.status !== "disabled" &&
    enemyCardAvailable(state, "pressure", "cutoff")
  ) {
    const destination =
      state.player.cache || state.cache.status !== "present"
        ? "tile-3-6"
        : "tile-7-2";
    const path = pathToward(
      state,
      "pressure",
      destination,
      pressure.movement,
    );
    add({
      id: "pressure-flank",
      actorId: "pressure",
      name: "Cutoff",
      cardId: "cutoff",
      cost: 4,
      tempo: 7,
      band: "Fast",
      targetId: state.player.cache ? "west-exit" : "field-cache",
      targetType: "position",
      path,
      onceKey: "pressure-action",
      score: 66,
      responseType: null,
    });
  }
  return candidates;
}

function chooseEnemyAction(state) {
  const candidates = enemyCandidates(state);
  if (!candidates.length) return null;
  const bankScore = state.enemyCommand <= 6 ? 68 : 48;
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      tie: stableHash({
        seed: state.seed,
        turn: state.turn,
        history: state.log.map((event) => event.title),
        id: candidate.id,
      }),
    }))
    .sort((left, right) => right.score - left.score || left.tie.localeCompare(right.tie));
  return ranked[0].score > bankScore ? ranked[0] : null;
}

export function beginEnemyTurn(state) {
  if (state.phase !== "player" || state.result) return state;
  const next = clone(state);
  if (next.enemyTurnsCompleted > 0) {
    next.enemyCommand = Math.min(
      CORE_RULES.commandCap,
      next.enemyCommand + CORE_RULES.commandIncome,
    );
  }
  next.phase = "enemy";
  next.enemyActionUses = {};
  next.pendingEnemyAction = null;
  next.currentEnemyReveal = null;
  next.lastExchange = null;
  next.lastClash = null;
  next.warning = "";
  appendLog(
    next,
    "system",
    "Enemy turn",
    "The formation is evaluating the player's final position. No path or target was forecast.",
  );
  return next;
}

export function getResponseOptions(state) {
  const pending = state.pendingEnemyAction;
  if (!pending) return [];
  const options = [];
  const responseCards = state.hand.filter((cardId) => {
    const card = CARDS[cardId];
    return (
      card.role === "Response" &&
      card.compatibility.includes(pending.responseType) &&
      card.cost <= state.command
    );
  });
  for (const cardId of responseCards) {
    const card = CARDS[cardId];
    options.push({
      id: cardId,
      name: card.name,
      cost: card.cost,
      tempo: card.tempo,
      band: tempoBand(card.tempo),
      cardId,
      description: card.effect,
    });
  }
  if (
    ["enemy-physical", "enemy-ranged", "enemy-objective"].includes(
      pending.responseType,
    ) &&
    state.command >= 4
  ) {
    options.push({
      id: "brace-response",
      name: "Brace",
      cost: 4,
      tempo: 6,
      band: "Standard",
      cardId: null,
      description:
        "Guaranteed Battle Mode response: establish 4 Guard before contact when Tempo permits.",
    });
  }
  return options;
}

function applyPlayerResponse(state, response) {
  if (!response) return { title: "No Response", detail: "The enemy action proceeds." };
  state.command -= response.cost;
  spendCard(state, response.cardId);
  if (response.id === "fallback-guard") {
    state.player.guard = Math.max(state.player.guard, 5);
    return {
      title: "Fallback Guard",
      detail: "5 Guard established before the incoming action.",
    };
  }
  if (response.id === "hold-the-edge") {
    state.player.guard = Math.max(state.player.guard, 4);
    state.actionUses.holdEdgeResponse = true;
    return {
      title: "Hold the Edge",
      detail: "The player braces the current tile against forced movement.",
    };
  }
  if (response.id === "controlled-withdrawal") {
    state.player.guard = Math.max(state.player.guard, 2);
    return {
      title: "Controlled Withdrawal",
      detail: "The player prepares a legal adjacent fallback after contact.",
    };
  }
  if (response.id === "emergency-disconnect") {
    state.actuator.controlled = false;
    state.lift.controlled = false;
    return {
      title: "Emergency Disconnect",
      detail: "The player severs access before the hostile system operation.",
      cancelsSystem: true,
    };
  }
  state.player.guard = Math.max(state.player.guard, 4);
  return {
    title: "Brace",
    detail: "4 Guard established before contact.",
  };
}

function applyEnemyAction(state, action) {
  const actor = state.enemies[action.actorId];
  if (action.path?.length > 1) actor.position = action.path.at(-1);
  switch (action.id) {
    case "guard-cover":
      state.enemies.breacher.guard += 4;
      return {
        title: "Shield Link established",
        detail: "Guard gave the Breacher 4 Guard.",
      };
    case "breacher-rush": {
      if (within(state, actor.position, BOARD_FOCUSES.gate.tileId, 1)) {
        state.gate.stability = Math.max(0, state.gate.stability - 1);
        return {
          title: "Breacher hit the Gate",
          detail: `Driving Ram reached the objective. Gate Stability is ${state.gate.stability}/3.`,
        };
      }
      return {
        title: "Breacher advanced",
        detail: "Driving Ram closed distance but did not reach the Gate.",
      };
    }
    case "breacher-strike": {
      const result = impact(state.player, 6);
      return {
        title: "Breacher struck the player",
        detail: `${result.absorbed} Guard absorbed; ${result.conditionLoss} Condition lost.`,
      };
    }
    case "guard-intercept": {
      if (within(state, actor.position, state.player.position, 1)) {
        const result = impact(state.player, 4);
        return {
          title: "Guard intercepted",
          detail: `${result.absorbed} Guard absorbed; ${result.conditionLoss} Condition lost.`,
        };
      }
      return {
        title: "Guard closed the Gate lane",
        detail: "Body Block changed the player's physical approach.",
      };
    }
    case "controller-purge":
      state.actuator.controlled = false;
      state.actuator.spent = false;
      return {
        title: "Actuator Control purged",
        detail: "Controller used the connected console after the player's final position was known.",
      };
    case "controller-static-tax":
      if (state.gate.work?.protected) {
        state.gate.work.protected = false;
        return {
          title: "Objective Brace held",
          detail:
            "Static Tax consumed Objective Brace, but Gate Work remains active.",
        };
      }
      state.gate.workDelayed = false;
      state.gate.work = null;
      state.gate.status = "unstable";
      return {
        title: "Gate Work interrupted",
        detail:
          "Static Tax directly interrupted the unprotected Slow Work before completion.",
      };
    case "controller-charge":
      state.divider.conduit = "charged";
      return {
        title: "Divider conduit charged",
        detail: "The exposed breach is now hazardous to occupants.",
      };
    case "controller-desync":
      state.gate.stability = Math.max(0, state.gate.stability - 1);
      return {
        title: "Gate Desync completed",
        detail: `The connected system reduced Gate Stability to ${state.gate.stability}/3.`,
      };
    case "pressure-volley": {
      const result = impact(state.player, 4);
      return {
        title: "Pressure fired Needle Volley",
        detail: `${result.absorbed} Guard absorbed; ${result.conditionLoss} Condition lost.`,
      };
    }
    case "pressure-flank":
      return {
        title: "Pressure changed the flank",
        detail: "Cutoff moved toward a Cache or retreat relationship now relevant to the board.",
      };
    default:
      return {
        title: action.name,
        detail: `${actor.name} completed a legal action.`,
      };
  }
}

function finalizeEnemyAction(state, action, response = null) {
  const actor = state.enemies[action.actorId];
  state.enemyCommand -= action.cost;
  if (action.cardId) spendEnemyCard(state, action.actorId, action.cardId);
  state.enemyActionUses[action.onceKey] = true;
  let responseResult = null;
  let actionResult = null;
  let relation = "unopposed";
  if (response) {
    relation =
      response.tempo > action.tempo
        ? "player-first"
        : response.tempo < action.tempo
          ? "enemy-first"
          : "simultaneous";
    if (relation === "player-first") {
      responseResult = applyPlayerResponse(state, response);
      if (!(responseResult.cancelsSystem && action.targetType === "system")) {
        actionResult = applyEnemyAction(state, action);
      }
    } else if (relation === "enemy-first") {
      actionResult = applyEnemyAction(state, action);
      if (state.player.condition > 0) {
        responseResult = applyPlayerResponse(state, response);
      }
    } else {
      responseResult = applyPlayerResponse(state, response);
      if (!(responseResult.cancelsSystem && action.targetType === "system")) {
        actionResult = applyEnemyAction(state, action);
      }
    }
  } else {
    actionResult = applyEnemyAction(state, action);
  }
  const physical = [
    "breacher-strike",
    "guard-intercept",
    "pressure-volley",
  ].includes(action.id);
  state.lastExchange = {
    side: "enemy",
    action: action.name,
    actor: actor.name,
    actionTempo: `${action.band} ${action.tempo}`,
    response: response?.name ?? null,
    responseTempo: response
      ? `${tempoBand(response.tempo)} ${response.tempo}`
      : null,
    relation,
    summary:
      relation === "player-first"
        ? [responseResult?.detail, actionResult?.detail]
            .filter(Boolean)
            .join(" ")
        : relation === "simultaneous"
          ? `Simultaneous: ${[actionResult?.detail, responseResult?.detail]
              .filter(Boolean)
              .join(" ")}`
          : [actionResult?.detail, responseResult?.detail]
              .filter(Boolean)
              .join(" "),
  };
  state.lastClash =
    physical && response
      ? {
          title: "CLASH",
          participants: `${actor.name} × Player`,
          relation,
          summary: state.lastExchange.summary,
        }
      : null;
  appendLog(
    state,
    "enemy",
    actionResult?.title ?? action.name,
    state.lastExchange.summary,
    {
      tempo: state.lastExchange.actionTempo,
      opposedBy: response?.name ?? null,
      clash: Boolean(state.lastClash),
    },
  );
  state.pendingEnemyAction = null;
  state.currentEnemyReveal = action;
  checkImmediateResult(state);
  return state;
}

function drawForActor(actor) {
  for (
    let count = 0;
    count < CORE_RULES.drawPerTurn && actor.drawIndex < actor.deck.length;
    count += 1
  ) {
    actor.hand.push(actor.deck[actor.drawIndex]);
    actor.drawIndex += 1;
  }
  while (actor.hand.length > CORE_RULES.retainLimit) {
    actor.discard.push(actor.hand.shift());
  }
}

function finishEnemyTurn(state) {
  const next = clone(state);
  let hazard = null;
  if (
    next.divider.conduit === "charged" &&
    ["tile-10-5", "tile-11-5"].includes(next.player.position)
  ) {
    const result = impact(next.player, 2);
    hazard = `Charged debris caused ${result.conditionLoss} Condition after Guard.`;
    appendLog(next, "environment", "Charged conduit", hazard);
  }
  if (next.lift.deployed) {
    next.lift.deployed = false;
    appendLog(
      next,
      "environment",
      "Service lift returned",
      "Temporary upper geometry reset after both sides acted.",
    );
  }
  if (checkImmediateResult(next)) return next;
  if (next.gate.status === "working") {
    const stillAtGate = within(
      next,
      next.player.position,
      BOARD_FOCUSES.gate.tileId,
      1,
    );
    if (stillAtGate && !next.gate.workDelayed) {
      next.gate.status = "stabilized";
      next.gate.work = null;
      endWithResult(
        next,
        resultForSecure(next),
        "Slow Gate Work survived the Enemy Turn and completed with legal access.",
      );
      return next;
    }
    next.gate.status = "unstable";
    next.gate.work = null;
    next.gate.workDelayed = false;
    appendLog(
      next,
      "system",
      "Gate Work canceled",
      stillAtGate
        ? "A direct interruption prevented the Slow Work from completing."
        : "The player no longer held physical access beside the Gate.",
    );
  }
  for (const enemy of Object.values(next.enemies)) {
    drawForActor(enemy);
    if (
      enemy.status === "staggered" &&
      !next.revealedIntel.regulatorSuppressed
    ) {
      enemy.status = "active";
    }
  }
  const drawn = [];
  for (
    let count = 0;
    count < CORE_RULES.drawPerTurn && next.drawIndex < next.deck.length;
    count += 1
  ) {
    const cardId = next.deck[next.drawIndex];
    next.drawIndex += 1;
    next.hand.push(cardId);
    drawn.push(cardId);
  }
  next.enemyTurnsCompleted += 1;
  next.turn += 1;
  next.command = Math.min(
    CORE_RULES.commandCap,
    next.command + CORE_RULES.commandIncome,
  );
  const build = getBuild(next.buildId);
  next.movementMax = Math.max(
    1,
    build.movement - (next.player.status === "off-balance" ? 1 : 0),
  );
  next.movementRemaining = next.movementMax;
  next.player.weaponReady = true;
  next.player.status = "ready";
  next.actionUses = {};
  next.refocusUsed = false;
  next.lastApproach = null;
  next.contextFollowThrough = false;
  next.pendingEnemyAction = null;
  next.currentEnemyReveal = null;
  next.enemyActionUses = {};
  next.turnSummary = {
    title: `Turn ${next.turn} begins`,
    command: `${next.command}/32`,
    movement: `${next.movementRemaining}/${next.movementMax}`,
    draw: drawn,
    hazard,
  };
  next.phase =
    next.hand.length > CORE_RULES.retainLimit ? "discard" : "player";
  appendLog(
    next,
    "system",
    next.phase === "discard" ? "Retain seven" : "Your turn",
    next.phase === "discard"
      ? `Draw ${drawn.length}; discard to seven before acting.`
      : `Command ${next.command}/32; movement ${next.movementRemaining}.`,
  );
  return next;
}

export function advanceEnemyTurn(state) {
  if (
    state.phase !== "enemy" ||
    state.pendingEnemyAction ||
    state.result
  ) {
    return state;
  }
  const next = clone(state);
  const action = chooseEnemyAction(next);
  if (!action) return finishEnemyTurn(next);
  next.currentEnemyReveal = action;
  const responses = action.responseType
    ? getResponseOptions({ ...next, pendingEnemyAction: action })
    : [];
  if (responses.length) {
    next.pendingEnemyAction = action;
    next.lastExchange = {
      side: "enemy",
      action: action.name,
      actor: next.enemies[action.actorId].name,
      actionTempo: `${action.band} ${action.tempo}`,
      response: null,
      relation: "response-window",
      summary:
        "The action, target, and path are now revealed. Choose a legal Response or let it resolve.",
    };
    appendLog(
      next,
      "enemy",
      `${next.enemies[action.actorId].name} begins ${action.name}`,
      "The action became visible only as it started.",
      { tempo: `${action.band} ${action.tempo}` },
    );
    return next;
  }
  return finalizeEnemyAction(next, action, null);
}

export function resolveEnemyAction(state, responseId = null) {
  if (state.phase !== "enemy" || !state.pendingEnemyAction) return state;
  const next = clone(state);
  let response = null;
  if (responseId) {
    response = getResponseOptions(next).find(
      (candidate) => candidate.id === responseId,
    );
    if (!response) {
      next.warning = "That Response is no longer legal.";
      return next;
    }
  }
  next.warning = "";
  return finalizeEnemyAction(next, next.pendingEnemyAction, response);
}

export function refocusCards(state, cardIds) {
  const next = clone(state);
  if (next.phase !== "player") {
    next.warning = "Refocus is available only during Your Turn.";
    return next;
  }
  const unique = [...new Set(cardIds)];
  if (!unique.length || unique.length > CORE_RULES.refocusLimit) {
    next.warning = "Choose one or two cards to Refocus.";
    return next;
  }
  if (next.refocusUsed) {
    next.warning = "Refocus has already been used this turn.";
    return next;
  }
  if (next.command < CORE_RULES.refocusCost) {
    next.warning = "Refocus requires 4 Command.";
    return next;
  }
  if (!unique.every((cardId) => next.hand.includes(cardId))) {
    next.warning = "Every selected card must be in hand.";
    return next;
  }
  next.command -= CORE_RULES.refocusCost;
  for (const cardId of unique) {
    const index = next.hand.indexOf(cardId);
    next.hand.splice(index, 1);
    next.discard.push(cardId);
  }
  const drawn = [];
  for (
    let count = 0;
    count < unique.length && next.drawIndex < next.deck.length;
    count += 1
  ) {
    const cardId = next.deck[next.drawIndex];
    next.drawIndex += 1;
    next.hand.push(cardId);
    drawn.push(cardId);
  }
  next.refocusUsed = true;
  next.warning = "";
  appendLog(
    next,
    "player",
    "Refocus",
    `Spent 4 Command; replaced ${unique.length} card${
      unique.length === 1 ? "" : "s"
    } and drew ${drawn.length}.`,
  );
  return next;
}

export function discardToRetain(state, cardId) {
  const next = clone(state);
  if (next.phase !== "discard" || !next.hand.includes(cardId)) return next;
  next.hand.splice(next.hand.indexOf(cardId), 1);
  next.discard.push(cardId);
  if (next.hand.length <= CORE_RULES.retainLimit) {
    next.phase = "player";
    appendLog(
      next,
      "system",
      "Your turn",
      `Retained seven. Command ${next.command}/32; movement ${next.movementRemaining}.`,
    );
  }
  return next;
}

export function displaySnapshot(state) {
  return {
    player: clone(state.player),
    enemies: clone(state.enemies),
    gate: clone(state.gate),
    divider: clone(state.divider),
    actuator: clone(state.actuator),
    bollard: clone(state.bollard),
    upperCrossing: clone(state.upperCrossing),
    serviceGap: clone(state.serviceGap),
    lift: clone(state.lift),
    cache: clone(state.cache),
  };
}

export function getPositionCoordinates(positionId) {
  const tile = BOARD_TILES[positionId];
  if (!tile) return pointToPercent(2, 6);
  return { x: tile.boardX, y: tile.boardY };
}

export function getActionDefinition(actionId) {
  return FRACTURED_GATE_ACTIONS[actionId] ?? null;
}

export function getFocusDetails(state, focusId) {
  if (focusId === "player") {
    return {
      id: "player",
      name: "Player",
      kind: "player",
      tileId: state.player.position,
      description:
        "One directly controlled solo character. No hidden companion or normalization.",
      status: `${state.player.condition}/${state.player.maxCondition} Condition · ${state.player.guard} Guard`,
    };
  }
  if (state.enemies[focusId]) {
    const enemy = state.enemies[focusId];
    return {
      id: enemy.id,
      name: enemy.name,
      kind: "enemy",
      tileId: enemy.position,
      description: enemy.role,
      status: `${enemy.status} · ${enemy.condition}/${enemy.maxCondition} Condition · ${enemy.guard} Guard`,
      intel: state.revealedIntel[focusId] ?? null,
    };
  }
  if (BOARD_TILES[focusId]) {
    const tile = BOARD_TILES[focusId];
    return {
      ...tile,
      kind: "tile",
      tileId: tile.id,
      description: `${
        tile.cover ? "Cover · " : ""
      }${tile.terrain} floor. Every ordinary move crosses a shared diamond edge.`,
      status:
        getReachableTiles(state)[tile.id]
          ? `${getReachableTiles(state)[tile.id].cost} movement`
          : "Outside current movement",
    };
  }
  const focus = BOARD_FOCUSES[focusId];
  if (!focus) return null;
  const statuses = {
    "west-exit": "Open retreat route",
    "cracked-divider": `${state.divider.status} · conduit ${state.divider.conduit}`,
    "gate-actuator": state.actuator.controlled
      ? `Controlled · ${state.actuator.spent ? "Output spent" : "Output ready"}`
      : "Neutral local system",
    "defensive-bollard": state.bollard.status,
    "service-gap": `${state.serviceGap.prepared ? "prepared" : "hidden"} · shutter ${state.serviceGap.shutter}`,
    "upper-crossing": state.upperCrossing.prepared
      ? "prepared and contestable"
      : "broken span",
    "lift-relay": state.lift.controlled
      ? "Control active"
      : state.lift.deployed
        ? "bridge deployed"
        : "neutral relay",
    "field-cache": state.cache.status,
    gate: `${state.gate.stability}/3 Stability · ${state.gate.status}`,
  };
  return { ...focus, status: statuses[focusId] };
}

const BUILD_SOURCE_GUIDANCE = Object.freeze({
  "battle-exploration": {
    focusId: "cracked-divider",
    name: "Cracked Divider",
    use: "Drive the Breacher into it to open a faster two-way route.",
  },
  "exploration-battle": {
    focusId: "upper-crossing",
    name: "Broken Upper Span",
    use: "Prepare its natural handholds to open an elevated approach.",
  },
  "battle-hacking": {
    focusId: "breacher",
    name: "Breacher",
    use: "Make contact to expose its regulator, then suppress the reset.",
  },
  "hacking-battle": {
    focusId: "gate-actuator",
    name: "Gate Actuator",
    use: "Take Control, then target an enemy near the bollard to fire the Output.",
  },
  "exploration-hacking": {
    focusId: "service-gap",
    name: "Service Gap",
    use: "Prepare the hidden opening, then suppress its shutter.",
  },
  "hacking-exploration": {
    focusId: "lift-relay",
    name: "Lift Relay",
    use: "Align the lift, then deploy it as a temporary upper bridge.",
  },
});

const ENEMY_GUIDANCE = Object.freeze({
  breacher: {
    typeLabel: "ENEMY UNIT",
    what: "The squad's close-range demolition unit.",
    why:
      "It is the most direct threat to the Gate and can force physical Clashes.",
    how:
      "Attack it, block its route, or use your build source against it. Hacking builds may Scan its current priority.",
    risk:
      "If ignored, it advances toward the Gate and can remove Stability.",
  },
  guard: {
    typeLabel: "ENEMY UNIT",
    what: "The squad's protector and interceptor.",
    why:
      "It shields the Breacher, controls the Gate approach, and can answer physical attacks.",
    how:
      "Strip its Guard, draw it away from the Breacher, or route around its interception lane.",
    risk:
      "Attacking through it can consume Command while the Breacher keeps advancing.",
  },
  controller: {
    typeLabel: "ENEMY UNIT — NOT A CONSOLE",
    what:
      "A hostile systems operator. This is an enemy character, not an object or control panel you operate.",
    why:
      "It resets Control, closes routes, weaponizes machinery, and can interrupt Slow Gate Work.",
    how:
      "Attack or Scan this enemy. Operable devices are separately labeled Actuator, Relay, Bollard, or Gate.",
    risk:
      "Leaving it active makes build routes less reliable and unprotected Gate Work easier to stop.",
  },
  pressure: {
    typeLabel: "ENEMY UNIT",
    what: "The squad's mobile ranged and flanking unit.",
    why:
      "It pressures exposed positions, the optional Cache, and the retreat line.",
    how:
      "Use cover, close distance, or force it to spend movement away from its firing lane.",
    risk:
      "Ignoring it can leave you exposed while you work on another threat.",
  },
});

const OBJECT_GUIDANCE = Object.freeze({
  "west-exit": {
    typeLabel: "RETREAT ROUTE",
    what: "The physical way out of the encounter.",
    why:
      "It lets you preserve the character when the Gate can no longer be saved.",
    how: "Stand beside it and choose Leave battle.",
    risk:
      "Retreat ends the battle immediately and records the Gate as unresolved.",
  },
  "field-cache": {
    typeLabel: "OPTIONAL RECOVERY",
    what: "A one-slot battle-local Cache. It is not the mission objective.",
    why:
      "Recovering it improves the battle result without granting persistent prototype rewards.",
    how: "Stand beside it and choose Recover Field Cache.",
    risk:
      "Detouring for it gives the enemy more time to pressure the Gate.",
  },
  "upper-crossing": {
    typeLabel: "BROKEN ROUTE",
    what: "A broken elevated span that can become a shortcut.",
    why:
      "Opening it creates a second approach and access to the upper landing.",
    how:
      "Exploration / Battle prepares the natural handholds. Hacking / Exploration can bridge the nearby gap through the Lift Relay.",
    risk:
      "The landing remains contestable and an opened route can be used by either side.",
  },
  "cracked-divider": {
    typeLabel: "TERRAIN / COVER",
    what: "Brittle cover blocking part of the central approach.",
    why:
      "Breaching it opens a faster two-way route and changes the battlefield geometry.",
    how:
      "Battle / Exploration can drive the Breacher into it from an adjacent position.",
    risk:
      "The breach helps enemies too, and the Controller can charge its exposed conduit.",
  },
  "gate-actuator": {
    typeLabel: "BATTLEFIELD DEVICE",
    what:
      "A physical console connected to the powered track and defensive bollard.",
    why:
      "Control of it enables a separate force Output from the bollard.",
    how:
      "Hacking / Battle must stand beside it and Establish Actuator Control. Then select an enemy near the Bollard and Execute bollard Output.",
    risk:
      "Control costs Command, can be purged by the enemy Controller, and the Output is spent after use.",
  },
  "lift-relay": {
    typeLabel: "BATTLEFIELD DEVICE",
    what: "A physical relay controlling the service lift.",
    why:
      "It can create temporary geometry across the upper gap.",
    how:
      "Hacking / Exploration must stand beside it, Align service lift, then Deploy lift bridge.",
    risk:
      "The bridge is temporary, capacity-limited, and can leave you isolated.",
  },
  "service-gap": {
    typeLabel: "CLOSED ROUTE",
    what: "A concealed lower opening blocked by a connected shutter.",
    why:
      "Opening it creates a protected service approach toward the Gate.",
    how:
      "Exploration / Hacking must first Prepare service relationship, then Suppress service shutter.",
    risk:
      "The Controller may seal it again, and once open either side can traverse it.",
  },
  "defensive-bollard": {
    typeLabel: "BATTLEFIELD DEVICE",
    what: "A retractable force redirector beside the Gate approach.",
    why:
      "It can pin or redirect an enemy occupying its local reach.",
    how:
      "Do not click the Bollard to fire it. Hacking / Battle first controls the Gate Actuator, then selects a nearby enemy and chooses Execute bollard Output.",
    risk:
      "Using it spends Actuator Control and changes the device's physical state.",
  },
  gate: {
    typeLabel: "PRIMARY OBJECTIVE",
    what: "The unstable structure you came here to save.",
    why:
      "Stabilizing it wins the encounter. If its three Stability reaches zero, the battle is lost.",
    how:
      "Reach an adjacent diamond, select the Gate, choose Stabilize Gate, then survive the following Enemy Turn while Work remains legal.",
    risk:
      "The Work is Slow. The enemy Controller can interrupt it unless Objective Brace or another legal defense protects it.",
  },
});

export function getMissionGuidance(state) {
  const source = BUILD_SOURCE_GUIDANCE[state.buildId];
  const gateReady =
    state.phase === "player" &&
    !specificActionError(state, "stabilize-gate", "gate");

  if (state.phase === "result") {
    return {
      objective: "Battle complete.",
      win: "The Gate was stabilized before it collapsed.",
      lose: "The Gate reached 0 Stability or the player was defeated.",
      optional: "The Cache and infrastructure affect only the battle result.",
      nextTitle: state.result?.title ?? "Inspect the result.",
      nextText: state.result?.cause ?? "Reset to replay the same initial state.",
      source,
    };
  }

  if (state.gate.status === "working") {
    return {
      objective: "Keep Gate Work alive through the Enemy Turn.",
      win:
        "Work completes after the enemy finishes if you still have legal Gate access.",
      lose: "Gate Stability reaches 0 or the player is defeated.",
      optional: "Held Command may pay for a legal defensive Response.",
      nextTitle: "Gate Work is active—prepare for interruption.",
      nextText:
        "End Turn when ready. Stay beside the Gate and preserve Command for a Response.",
      source,
    };
  }

  if (gateReady) {
    return {
      objective: "Stabilize the Gate before its three Stability reaches 0.",
      win: "Begin Gate Work and keep it legal through the Enemy Turn.",
      lose: "Gate Stability reaches 0 or the player is defeated.",
      optional: "The Cache and build route can improve the result but are not required.",
      nextTitle: "You are in position to start the objective.",
      nextText:
        "Select the Fractured Gate and choose Stabilize Gate. Objective Brace can protect its first direct interruption.",
      source,
    };
  }

  return {
    objective: "Stabilize the Gate before its three Stability reaches 0.",
    win:
      "Reach the Gate, begin Slow Gate Work, and keep it legal through the following Enemy Turn.",
    lose: "Gate Stability reaches 0 or the player is defeated.",
    optional: "The Field Cache and build route improve options but are not required.",
    nextTitle:
      state.gate.stability <= 1
        ? "The Gate is close to collapse—advance now."
        : "Advance east toward the GATE marker.",
    nextText: `${source.name} is your purple optional build opportunity: ${source.use} You may also fight or move around it.`,
    source,
  };
}

export function getFocusGuidance(state, focusId) {
  if (focusId === "player") {
    return {
      typeLabel: "YOUR CHARACTER",
      what: "The solo character you directly control.",
      why:
        "Position determines movement, range, object access, cover, and whether Gate Work remains legal.",
      how:
        "Select a highlighted diamond to move, or select a nearby enemy or object to see actions.",
      risk:
        "Spending all Command may leave no legal Response during the Enemy Turn.",
    };
  }

  if (state.enemies[focusId]) return ENEMY_GUIDANCE[focusId];

  if (BOARD_TILES[focusId]) {
    const tile = BOARD_TILES[focusId];
    return {
      typeLabel: tile.cover ? "MOVEMENT SPACE / COVER" : "MOVEMENT SPACE",
      what: `${tile.terrain === "rubble" ? "Rubble" : "Walkable"} floor diamond${
        tile.cover ? " with cover" : ""
      }.`,
      why:
        "Moving here changes range, routes, object access, and exposure.",
      how:
        "Choose Move here, inspect the highlighted path and remaining movement, then execute.",
      risk:
        tile.terrain === "rubble"
          ? "Rubble costs extra movement and slows the next linked physical action."
          : "Open positions may expose the character to ranged or physical pressure.",
    };
  }

  const guidance = OBJECT_GUIDANCE[focusId];
  if (!guidance) return null;

  const source = BUILD_SOURCE_GUIDANCE[state.buildId];
  if (source.focusId === focusId) {
    return {
      ...guidance,
      typeLabel: `${guidance.typeLabel} · YOUR BUILD SOURCE`,
      how: source.use,
    };
  }

  if (focusId === "defensive-bollard" && exactBuild(state, "hacking-battle")) {
    return {
      ...guidance,
      how: state.actuator.controlled
        ? "Actuator Control is ready. Select an enemy within the Bollard's local reach and choose Execute bollard Output."
        : guidance.how,
    };
  }

  return guidance;
}

export {
  ENEMY_DECKS,
  ENEMY_DEFINITIONS,
};
