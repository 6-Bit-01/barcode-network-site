"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BOARD_FOCUSES,
  BOARD_TILES,
  BUILDS,
  CARDS,
  CORE_RULES,
  advanceResolution,
  availableCommand,
  availableEnemyCommand,
  changeFracturedGateBuild,
  createFracturedGateState,
  discardToRetain,
  displaySnapshot,
  getAvailableContextCards,
  getCompatibleCards,
  getContextActionGroups,
  getPositionCoordinates,
  passPriority,
  paidActionCount,
  pivotOpenAction,
  previewAction,
  projectPlan,
  queueAction,
  refocusCards,
  resetFracturedGate,
  settleRound,
  type FracturedGateChoice,
  type FracturedGateRecord,
  type FracturedGateState,
} from "@/lib/barcode-world/fractured-gate-engine.mjs";
import styles from "./FracturedGatePrototype.module.css";

type PositionedStyle = CSSProperties & {
  "--x": string;
  "--y": string;
};

const CORE_FOCUS_ORDER = [
  "west-exit",
  "cracked-divider",
  "gate-actuator",
  "defensive-bollard",
  "service-gap",
  "upper-crossing",
  "lift-relay",
  "field-cache",
  "gate",
  "breacher",
  "guard",
  "controller",
  "pressure",
  "breacher-intent",
];

const LANE_NAMES = ["Fast", "Standard", "Slow"];
const BATTLE_PHASES = [
  "Observe",
  "Plan actions",
  "Commit plans",
  "Action phase",
  "Aftermath",
  "Results",
];

const MARKER_VISUALS: Record<
  string,
  { glyph: string; short: string; relationship?: string }
> = {
  "west-exit": { glyph: "↤", short: "EXIT", relationship: "Retreat route" },
  "cracked-divider": {
    glyph: "╫",
    short: "DIVIDER",
    relationship: "Brittle cover + conduit",
  },
  "gate-actuator": {
    glyph: "A",
    short: "ACTUATOR",
    relationship: "Powers track + bollard",
  },
  "defensive-bollard": {
    glyph: "B",
    short: "BOLLARD",
    relationship: "Redirects physical force",
  },
  "service-gap": {
    glyph: "⇥",
    short: "SERVICE GAP",
    relationship: "Shutter-controlled route",
  },
  "upper-crossing": {
    glyph: "⌁",
    short: "UPPER GAP",
    relationship: "Natural crossing",
  },
  "lift-relay": {
    glyph: "L",
    short: "LIFT RELAY",
    relationship: "Creates temporary bridge",
  },
  "field-cache": {
    glyph: "◇",
    short: "CACHE",
    relationship: "Optional package",
  },
  gate: { glyph: "G", short: "GATE", relationship: "Protect + stabilize" },
  breacher: { glyph: "BR", short: "BREACHER", relationship: "Gate pressure" },
  guard: { glyph: "GD", short: "GUARD", relationship: "Protects + intercepts" },
  controller: {
    glyph: "CT",
    short: "CONTROLLER",
    relationship: "Opposes machinery",
  },
  pressure: {
    glyph: "PR",
    short: "PRESSURE",
    relationship: "Flank + route denial",
  },
  "breacher-intent": {
    glyph: "!",
    short: "IMPACT LINE",
    relationship: "Breacher → Gate",
  },
  breach: { glyph: "↔", short: "BREACH", relationship: "Two-way opening" },
  "upper-route": {
    glyph: "↗",
    short: "UPPER ROUTE",
    relationship: "Prepared crossing",
  },
  "service-route": {
    glyph: "⇢",
    short: "SERVICE ROUTE",
    relationship: "Prepared rear route",
  },
  "service-lift": {
    glyph: "⇈",
    short: "LIFT BRIDGE",
    relationship: "Returns after the exchange",
  },
  regulator: {
    glyph: "R",
    short: "REGULATOR",
    relationship: "Exposed impact hardware",
  },
};

type BuildOpportunity = {
  focusId: string;
  title: string;
  instruction: string;
  revealed: string;
  enabled: string;
  actionLabel: string | null;
  ready: boolean;
  reason: string | null;
};

type PhaseGuide = {
  phaseIndex: number;
  kicker: string;
  title: string;
  instruction: string;
  detail: string;
};

type ActionIntent = "Attack" | "Defend" | "Use" | null;

const ACTION_INTENT_FOCUSES = [
  "player",
  "breacher",
  "guard",
  "controller",
  "pressure",
  "breacher-intent",
  "gate",
  "field-cache",
  "gate-actuator",
  "defensive-bollard",
  "service-gap",
  "upper-crossing",
  "lift-relay",
  "breach",
  "upper-route",
  "service-route",
  "service-lift",
  "regulator",
];

const ENEMY_VISUALS: Record<
  string,
  { icon: string; role: string; intent: string }
> = {
  breacher: {
    icon: "⟫",
    role: "IMPACT",
    intent: "Drives the Gate",
  },
  guard: {
    icon: "⬢",
    role: "GUARD",
    intent: "Protects the lane",
  },
  controller: {
    icon: "⌘",
    role: "CONTROL",
    intent: "Contests machinery",
  },
  pressure: {
    icon: "➤",
    role: "FLANK",
    intent: "Denies routes",
  },
};

function buildFor(buildId: string) {
  return (
    BUILDS.find((build: FracturedGateRecord) => build.id === buildId) ??
    BUILDS[0]
  );
}

function cardName(cardId: string) {
  return CARDS[cardId]?.name ?? cardId;
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function positionLabel(positionId: string) {
  const tile = BOARD_TILES[positionId];
  return tile ? `space ${tile.x},${tile.y}` : titleCase(positionId);
}

function actionFocuses(
  game: FracturedGateState,
  parent: Exclude<ActionIntent, null>,
) {
  return ACTION_INTENT_FOCUSES.flatMap((focusId) => {
    const group = getContextActionGroups(game, focusId).find(
      (candidate: FracturedGateRecord) => candidate.parent === parent,
    );
    if (!group) return [];
    return [
      {
        focusId,
        ready: group.choices.some(
          (choice: FracturedGateChoice) => choice.legal,
        ),
      },
    ];
  });
}

function focusStatus(focusId: string, snapshot: FracturedGateRecord) {
  if (BOARD_TILES[focusId]) {
    const tile = BOARD_TILES[focusId];
    if (tile.terrain === "powered") {
      return `Powered service track · Gate Actuator feed ${titleCase(
        snapshot.poweredTrack.feed,
      )}`;
    }
    if (tile.terrain === "rubble") {
      return `Loose rubble · costs 2 movement · ${tile.x},${tile.y}`;
    }
    if (tile.terrain === "clear") {
      return `Clear approach lane · ${tile.x},${tile.y}`;
    }
    return `${titleCase(tile.terrain)} · ${tile.x},${tile.y}`;
  }
  if (snapshot.enemies?.[focusId]) {
    const enemy = snapshot.enemies[focusId];
    return `${titleCase(enemy.status)} · ${enemy.condition} Condition · ${enemy.guard} Guard`;
  }
  switch (focusId) {
    case "player":
      return `${snapshot.condition} Condition · ${snapshot.guard} Guard`;
    case "breacher-intent":
      return "Primary pressure · Gate impact if unopposed";
    case "cracked-divider":
    case "breach":
      return `${titleCase(snapshot.divider.status)} · conduit ${titleCase(snapshot.divider.conduit)}`;
    case "gate-actuator":
      return snapshot.actuator.controlled
        ? `${titleCase(snapshot.actuator.mode)} Control active`
        : "Idle · local access";
    case "defensive-bollard":
      return titleCase(snapshot.bollard.status);
    case "gate":
      return `${snapshot.gate.stability}/3 Stability · ${titleCase(snapshot.gate.status)}`;
    case "field-cache":
      return titleCase(snapshot.cache.status);
    case "upper-route":
      return snapshot.upperRoute.protected
        ? "Prepared · protected"
        : "Prepared";
    case "service-route":
      return snapshot.serviceRoute.closureSuppressed
        ? "Prepared · closure suppressed"
        : "Prepared";
    case "service-lift":
      return snapshot.lift.deployed
        ? "Deployed until this exchange ends"
        : "Projected";
    case "regulator":
      return snapshot.flags.regulatorExposed ? "Exposed" : "Shielded";
    default:
      return BOARD_FOCUSES[focusId]?.kind ?? "";
  }
}

function getBuildOpportunity(
  game: FracturedGateState,
  snapshot: FracturedGateRecord,
): BuildOpportunity {
  const build = buildFor(game.buildId);
  const major = titleCase(build.major);
  const minor = titleCase(build.minor);
  const opportunities: Record<
    string,
    { focusId: string; title: string; instruction: string }
  > = {
    "battle-exploration":
      snapshot.divider.status === "breached"
        ? {
            focusId: "defensive-bollard",
            title: "Turn the breach into a contact angle",
            instruction:
              "Battle created the opening. Exploration can now carry contact along its safe upper lip.",
          }
        : {
            focusId: "cracked-divider",
            title: "Break the Divider to create a route",
            instruction:
              "Approach on the clear lane, then answer the Breacher at this brittle, load-bearing cover.",
          },
    "exploration-battle": snapshot.upperRoute.prepared
      ? {
          focusId: "upper-crossing",
          title: "Protect the prepared landing",
          instruction:
            "Exploration established the route. Battle can preserve its capacity-one landing against interception.",
        }
      : {
          focusId: "upper-crossing",
          title: "Prepare the Upper Natural Crossing",
          instruction:
            "Exploration sees the handholds. Battle can later defend the east landing.",
        },
    "battle-hacking": snapshot.flags.regulatorExposed
      ? {
          focusId: "regulator",
          title: "Suppress the exposed regulator reset",
          instruction:
            "Battle exposed real hardware. Hacking can keep its automatic reset from erasing that advantage.",
        }
      : {
          focusId: "breacher",
          title: "Expose the Breacher’s impact regulator",
          instruction:
            "Meet the Breacher physically, then use Hacking on the hardware the collision reveals.",
        },
    "hacking-battle": snapshot.actuator.controlled
      ? {
          focusId: "defensive-bollard",
          title: "Convert Control into physical force",
          instruction:
            "Hacking owns the output. Battle must hold the access point and author where that force lands.",
        }
      : {
          focusId: "gate-actuator",
          title: "Take local control of the Gate Actuator",
          instruction:
            "Reach the visible actuator that powers both the service track and defensive bollard.",
        },
    "exploration-hacking": snapshot.serviceRoute.prepared
      ? {
          focusId: "service-gap",
          title: "Suppress the service shutter",
          instruction:
            "Exploration found the rear route. Hacking can delay the Controller-linked closure.",
        }
      : {
          focusId: "service-gap",
          title: "Prepare the concealed Service Gap",
          instruction:
            "Exploration reads the physical gap. Hacking can later keep its shutter open.",
        },
    "hacking-exploration":
      snapshot.actuator.controlled && snapshot.actuator.mode === "lift"
        ? {
            focusId: "service-lift",
            title: "Align and cross the temporary lift bridge",
            instruction:
              "Hacking created a movable output. Exploration reads its safe crossing and reset window.",
          }
        : {
            focusId: "lift-relay",
            title: "Establish Lift Relay Control",
            instruction:
              "Reach the powered relay. Exploration can turn its output into temporary geometry.",
          },
  };
  const opportunity =
    opportunities[game.buildId] ?? opportunities["battle-exploration"];
  const discipline = getContextActionGroups(game, opportunity.focusId).find(
    (group: FracturedGateRecord) => group.parent === "Discipline",
  );
  const choice = discipline?.choices[0] ?? null;
  return {
    ...opportunity,
    revealed: `${major} Major`,
    enabled: `${minor} Minor`,
    actionLabel: choice?.label ?? null,
    ready: Boolean(choice?.legal),
    reason: choice?.legal ? null : (choice?.reason ?? null),
  };
}

function getPhaseGuide({
  game,
  targetingChoice,
  targetId,
  selectedParent,
  actionIntent,
  pivotMode,
}: {
  game: FracturedGateState;
  targetingChoice: FracturedGateChoice | null;
  targetId: string | null;
  selectedParent: string | null;
  actionIntent: ActionIntent;
  pivotMode: boolean;
}): PhaseGuide {
  if (game.phase === "resolution") {
    const index = game.resolution?.visibleLaneIndex ?? -1;
    return {
      phaseIndex: 3,
      kicker: index < 0 ? "Plans revealed" : `${LANE_NAMES[index]} lane`,
      title:
        index < 0
          ? "Both plans are locked"
          : `${LANE_NAMES[index]} actions are resolving`,
      instruction:
        index < 0
          ? "Compare the final commitments, then begin the Action Phase."
          : "Watch positions, protection, machinery, and contact update on the battlefield.",
      detail:
        "Nothing may be added or retargeted now. Invalidated actions are explained in the battle review.",
    };
  }
  if (game.phase === "settle") {
    return {
      phaseIndex: 4,
      kicker: "Aftermath",
      title: "Review what the exchange changed",
      instruction:
        "Check damage, Gate pressure, enemy positions, terrain, cards, and Command before continuing.",
      detail:
        "Temporary outputs reset after this review. Persistent physical damage and opened routes remain.",
    };
  }
  if (game.phase === "result") {
    return {
      phaseIndex: 5,
      kicker: "Battle complete",
      title: "Review the result and tradeoff",
      instruction:
        "The result names the objective outcome, principal turning point, location consequence, and cost.",
      detail: "Reset returns the exact same deterministic opening state.",
    };
  }
  if (game.hand.length > CORE_RULES.retainLimit) {
    return {
      phaseIndex: 1,
      kicker: "Retain limit",
      title: `Discard ${game.hand.length - CORE_RULES.retainLimit} card${
        game.hand.length - CORE_RULES.retainLimit === 1 ? "" : "s"
      } before planning`,
      instruction:
        "Use the hand controls below. The battlefield remains readable, but no new action can be committed yet.",
      detail: `${CORE_RULES.retainLimit} prepared cards may be carried into Lock.`,
    };
  }
  if (pivotMode) {
    return {
      phaseIndex: 2,
      kicker: "One bounded change",
      title: "Pivot the newest Open action",
      instruction:
        "Choose a replacement action and target. Earlier solid commitments cannot be erased.",
      detail: game.playerPivotUsed
        ? "The player Pivot has already been used this allotment."
        : "The replacement locks immediately and returns priority to the enemy squad.",
    };
  }
  if (targetingChoice && !targetId) {
    return {
      phaseIndex: 1,
      kicker: "Targeting",
      title: `Choose a highlighted target for ${targetingChoice.label}`,
      instruction:
        targetingChoice.parent === "Move"
          ? "Select one glowing diamond. The map shows every legal destination; occupied or blocked spaces are not offered."
          : "Select the clearly marked actor, object, or battlefield position.",
      detail:
        targetingChoice.parent === "Move"
          ? `${targetingChoice.label}: ${targetingChoice.cost} Command · ${targetingChoice.description}`
          : "Targeting does not commit the action. You will preview it next.",
    };
  }
  if (targetingChoice && targetId) {
    return {
      phaseIndex: 1,
      kicker: "Preview",
      title: "Confirm the projected consequence",
      instruction:
        "Read the expected movement, important risk, Tempo, contact forecast, and skill attribution in the command rail.",
      detail:
        "Attach a compatible card only if it changes the plan you want, then Add to Plan.",
    };
  }
  if (game.priority !== "player") {
    return {
      phaseIndex: 2,
      kicker: "Enemy priority",
      title: "The enemy squad is committing",
      instruction:
        "Read its visible posture and remaining squad Command. Concealed cards stay concealed.",
      detail: "The squad uses its own real hands and cannot inspect yours.",
    };
  }
  if (actionIntent) {
    return {
      phaseIndex: 1,
      kicker: `${actionIntent} selection`,
      title:
        actionIntent === "Attack"
          ? "Choose an enemy on the battlefield"
          : actionIntent === "Defend"
            ? "Choose yourself or the threatened objective"
            : "Choose a marked objective or object",
      instruction:
        "Bright markers are available now. Dim markers still explain the position, range, or setup they require.",
      detail:
        "Selecting a marker opens its exact action and legality before anything is committed.",
    };
  }
  if (selectedParent === "Move") {
    return {
      phaseIndex: 1,
      kicker: game.plan.length ? "Continue or lock" : "Opening selection",
      title: "Choose how far you want to move",
      instruction:
        "Green diamonds are the one free Reposition. Cyan diamonds are reachable with the paid Advance.",
      detail: game.plan.length
        ? "You can add another action, inspect another focus, Pivot the newest action, or End Planning."
        : "Select Reposition or Advance in the command rail, then choose a glowing destination.",
    };
  }
  if (selectedParent) {
    return {
      phaseIndex: 1,
      kicker: "Action selection",
      title: `Choose a ${selectedParent} action`,
      instruction:
        "Only actions relevant to the selected battlefield focus are shown in the command rail.",
      detail:
        "Disabled actions name the physical position or setup they still require.",
    };
  }
  return {
    phaseIndex: game.plan.length ? 2 : 0,
    kicker: game.plan.length ? "Commitment decision" : "Read the battlefield",
    title: game.plan.length
      ? "Add, Pivot, or End Planning"
      : "Select your piece, an enemy, or a visible object",
    instruction:
      "Use the board itself. Enemy pressure, physical terrain, powered relationships, and your build opportunity are already marked.",
    detail:
      "Selecting a focus reveals only the actions that make physical and tactical sense there.",
  };
}

function PhaseDirector({
  game,
  guide,
  opportunity,
  onOpportunity,
}: {
  game: FracturedGateState;
  guide: PhaseGuide;
  opportunity: BuildOpportunity;
  onOpportunity: (focusId: string) => void;
}) {
  return (
    <section className={styles.phaseDirector} aria-label="Current battle phase">
      <ol className={styles.phaseTrack}>
        {BATTLE_PHASES.map((phase, index) => (
          <li
            key={phase}
            className={
              index === guide.phaseIndex
                ? styles.currentPhase
                : index < guide.phaseIndex
                  ? styles.completedPhase
                  : ""
            }
            aria-current={index === guide.phaseIndex ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {phase}
          </li>
        ))}
      </ol>
      <div className={styles.phaseInstruction} aria-live="polite">
        <div className={styles.phaseNumber}>
          <span>EXCHANGE {game.round}</span>
          <strong>{guide.kicker}</strong>
        </div>
        <div>
          <h2>{guide.title}</h2>
          <p>{guide.instruction}</p>
          <small>{guide.detail}</small>
        </div>
      </div>
      <button
        type="button"
        className={styles.opportunityCard}
        onClick={() => onOpportunity(opportunity.focusId)}
        data-testid="build-opportunity"
      >
        <span>
          CURRENT BUILD LINE ·{" "}
          {game.phase === "planning"
            ? opportunity.ready
              ? "ACTION READY"
              : "SETUP VISIBLE"
            : game.phase === "result"
              ? "RESULTING FIELD STATE"
              : "SOURCE IN VIEW"}
        </span>
        <strong>{opportunity.title}</strong>
        <p>{opportunity.instruction}</p>
        <small>
          Revealed by {opportunity.revealed} · Enabled by {opportunity.enabled}
        </small>
        <b>
          {game.phase !== "planning"
            ? "Select to inspect this source on the battlefield."
            : opportunity.ready
              ? `Select · ${opportunity.actionLabel}`
              : (opportunity.reason ?? "Select to inspect the required setup.")}
        </b>
      </button>
    </section>
  );
}

function ActionDock({
  game,
  projection,
  actionIntent,
  opportunity,
  onShortcut,
  onOpportunity,
  onPass,
}: {
  game: FracturedGateState;
  projection: FracturedGateRecord | null;
  actionIntent: ActionIntent;
  opportunity: BuildOpportunity;
  onShortcut: (parent: "Move" | "Attack" | "Defend" | "Use") => void;
  onOpportunity: (focusId: string) => void;
  onPass: () => void;
}) {
  if (game.phase !== "planning") return null;

  const snapshot = displaySnapshot(game);
  const projectedSnapshot = projection?.finalSnapshot ?? snapshot;
  const attackOptions = actionFocuses(game, "Attack");
  const defendOptions = actionFocuses(game, "Defend");
  const useOptions = actionFocuses(game, "Use");
  const attackReady = attackOptions.filter((option) => option.ready).length;
  const defendReady = defendOptions.filter((option) => option.ready).length;
  const useReady = useOptions.filter((option) => option.ready).length;
  const actionsDisabled =
    game.priority !== "player" || game.hand.length > CORE_RULES.retainLimit;
  const hasPlan = game.plan.length > 0 || Boolean(game.refocusRecord);
  const moved = projectedSnapshot.position !== snapshot.position;

  return (
    <section
      className={styles.actionDock}
      aria-label="Choose your next battle action"
    >
      <div className={styles.actionDockStatus} aria-live="polite">
        <span>
          {game.hand.length > CORE_RULES.retainLimit
            ? "RETAIN LIMIT"
            : game.priority === "player"
              ? game.plan.length
                ? `PLAN HAS ${game.plan.length} ACTION${
                    game.plan.length === 1 ? "" : "S"
                  }`
                : "YOUR PRIORITY"
              : "ENEMY COMMITTING"}
        </span>
        <strong>
          {game.hand.length > CORE_RULES.retainLimit
            ? "Discard down to seven cards before planning."
            : game.plan.length
              ? "Choose another action, use your build line, or End Planning."
              : "Choose an action. The board will show every relevant destination or target."}
        </strong>
        <small>
          Current · {positionLabel(snapshot.position)}
          {moved
            ? `  →  planned · ${positionLabel(projectedSnapshot.position)}`
            : " · no movement planned"}
          {moved
            ? " · the cyan ghost moves only when the Action Phase begins"
            : ""}
        </small>
      </div>

      <div className={styles.actionShortcuts}>
        <button
          type="button"
          data-action-shortcut="Move"
          className={actionIntent === null ? "" : styles.quietShortcut}
          disabled={actionsDisabled}
          onClick={() => onShortcut("Move")}
        >
          <span>01 · POSITION</span>
          <strong>MOVE</strong>
          <small>Show free and paid destinations</small>
        </button>
        <button
          type="button"
          data-action-shortcut="Attack"
          className={actionIntent === "Attack" ? styles.activeShortcut : ""}
          disabled={actionsDisabled}
          onClick={() => onShortcut("Attack")}
        >
          <span>02 · PRESSURE</span>
          <strong>ATTACK</strong>
          <small>
            {attackReady
              ? `${attackReady} enem${attackReady === 1 ? "y" : "ies"} in range`
              : "Choose an enemy to read required range"}
          </small>
        </button>
        <button
          type="button"
          data-action-shortcut="Defend"
          className={actionIntent === "Defend" ? styles.activeShortcut : ""}
          disabled={actionsDisabled}
          onClick={() => onShortcut("Defend")}
        >
          <span>03 · PROTECT</span>
          <strong>DEFEND</strong>
          <small>
            {defendReady > 1
              ? "Guard yourself or the objective"
              : "Guard now; objective defense unlocks in position"}
          </small>
        </button>
        <button
          type="button"
          data-action-shortcut="Use"
          className={actionIntent === "Use" ? styles.activeShortcut : ""}
          disabled={actionsDisabled}
          onClick={() => onShortcut("Use")}
        >
          <span>04 · INTERACT</span>
          <strong>USE OBJECT</strong>
          <small>
            {useReady
              ? `${useReady} usable now`
              : "Choose an objective or object to inspect"}
          </small>
        </button>
      </div>

      <button
        type="button"
        className={styles.buildShortcut}
        disabled={actionsDisabled}
        onClick={() => onOpportunity(opportunity.focusId)}
      >
        <span>
          BUILD TACTIC · {opportunity.ready ? "READY" : "SETUP VISIBLE"}
        </span>
        <strong>{opportunity.title}</strong>
        <small>
          {opportunity.ready
            ? opportunity.actionLabel
            : (opportunity.reason ?? opportunity.instruction)}
        </small>
      </button>

      <button
        type="button"
        className={styles.commitShortcut}
        data-testid="action-dock-lock"
        disabled={!hasPlan}
        onClick={onPass}
      >
        <span>{game.consecutivePasses}/2 PASSES</span>
        <strong>END PLANNING</strong>
        <small>Pass priority; two passes lock both plans</small>
      </button>
    </section>
  );
}

function GatePips({
  stability,
  status,
}: {
  stability: number;
  status: string;
}) {
  return (
    <span
      className={styles.pips}
      aria-label={`Gate Stability ${stability} of 3; ${status}`}
    >
      {[0, 1, 2].map((index) => (
        <span
          className={index < stability ? styles.pipFilled : styles.pipEmpty}
          key={index}
          aria-hidden="true"
        >
          {index < stability ? "●" : "○"}
        </span>
      ))}
    </span>
  );
}

function BattleBoard({
  game,
  selectedFocus,
  selectedParent,
  actionIntent,
  confirmedTarget,
  targetingChoice,
  projection,
  opportunity,
  onFocus,
  onShowMove,
  onOpportunity,
}: {
  game: FracturedGateState;
  selectedFocus: string;
  selectedParent: string | null;
  actionIntent: ActionIntent;
  confirmedTarget: string | null;
  targetingChoice: FracturedGateChoice | null;
  projection: FracturedGateRecord | null;
  opportunity: BuildOpportunity;
  onFocus: (focusId: string) => void;
  onShowMove: () => void;
  onOpportunity: (focusId: string) => void;
}) {
  const [showThreats, setShowThreats] = useState(true);
  const [showBuildLine, setShowBuildLine] = useState(true);
  const boardScrollRef = useRef<HTMLElement>(null);
  const snapshot = displaySnapshot(game);
  const legalTargets = new Set<string>(
    (targetingChoice?.legalTargets ?? []) as string[],
  );
  const intentFocuses = new Map<string, boolean>(
    actionIntent
      ? actionFocuses(game, actionIntent).map((item) => [
          item.focusId,
          item.ready,
        ])
      : [],
  );
  const visible = new Set(CORE_FOCUS_ORDER);
  const projectedSnapshot = projection?.finalSnapshot ?? snapshot;
  const movementGroup = getContextActionGroups(game, "player").find(
    (group: FracturedGateRecord) => group.parent === "Move",
  );
  const repositionTargets = new Set<string>(
    (movementGroup?.choices.find(
      (choice: FracturedGateChoice) => choice.id === "reposition",
    )?.legalTargets ?? []) as string[],
  );
  const advanceTargets = new Set<string>(
    (movementGroup?.choices.find(
      (choice: FracturedGateChoice) => choice.id === "advance",
    )?.legalTargets ?? []) as string[],
  );
  const showMoveGuide =
    game.phase === "planning" &&
    game.priority === "player" &&
    selectedFocus === "player" &&
    selectedParent === "Move" &&
    !targetingChoice;
  const opportunityTileId =
    BOARD_FOCUSES[opportunity.focusId]?.tileId ?? opportunity.focusId;

  useEffect(() => {
    const container = boardScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    const anchorId =
      actionIntent === "Attack"
        ? "breacher"
        : actionIntent === "Use"
          ? "gate"
          : actionIntent === "Defend"
            ? "player"
            : selectedFocus;
    const frame = window.requestAnimationFrame(() => {
      const target =
        container.querySelector<HTMLElement>(`[data-focus-id="${anchorId}"]`) ??
        container.querySelector<HTMLElement>(`[data-tile-id="${anchorId}"]`);
      if (!target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const desiredLeft =
        container.scrollLeft +
        targetRect.left -
        containerRect.left -
        (container.clientWidth - targetRect.width) / 2;
      container.scrollTo({
        left: Math.max(0, desiredLeft),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionIntent, selectedFocus, selectedParent]);

  if (
    projectedSnapshot.divider.status === "breached" ||
    snapshot.divider.status === "breached"
  ) {
    visible.add("breach");
  }
  if (projectedSnapshot.upperRoute.prepared || snapshot.upperRoute.prepared) {
    visible.add("upper-route");
  }
  if (
    projectedSnapshot.serviceRoute.prepared ||
    snapshot.serviceRoute.prepared
  ) {
    visible.add("service-route");
  }
  if (projectedSnapshot.lift.deployed || snapshot.lift.deployed) {
    visible.add("service-lift");
  }
  if (
    projectedSnapshot.flags.regulatorExposed ||
    snapshot.flags.regulatorExposed
  ) {
    visible.add("regulator");
  }
  for (const focusId of legalTargets) visible.add(focusId);

  const playerPosition = getPositionCoordinates(snapshot.position);
  const ghostPosition = projection?.ghostPosition
    ? getPositionCoordinates(projection.ghostPosition)
    : null;
  const svgPoint = (point: { x: number; y: number }) =>
    `${point.x * 10},${point.y * 6.2}`;
  const pathPoints = (projection?.movementPath ?? [])
    .map((positionId: string) => getPositionCoordinates(positionId))
    .map(svgPoint)
    .join(" ");
  const feedPoints = [
    "tile-3-7",
    "tile-4-7",
    "tile-5-7",
    "tile-6-7",
    "tile-7-7",
  ]
    .map((positionId) => getPositionCoordinates(positionId))
    .map(svgPoint)
    .join(" ");
  const actuatorPoint = BOARD_FOCUSES["gate-actuator"];
  const bollardPoint = BOARD_FOCUSES["defensive-bollard"];
  const dividerPoint = BOARD_FOCUSES["cracked-divider"];
  const gatePoint = BOARD_FOCUSES.gate;
  const breacherPoint = getPositionCoordinates(
    projectedSnapshot.enemies.breacher.position,
  );
  const intentPoints = [
    breacherPoint,
    getPositionCoordinates("tile-7-5"),
    dividerPoint,
    getPositionCoordinates("tile-9-5"),
    getPositionCoordinates("tile-10-5"),
    getPositionCoordinates("tile-11-5"),
    gatePoint,
  ]
    .map(svgPoint)
    .join(" ");
  const activeEnemyTiles = new Set<string>();
  for (const enemy of Object.values(
    projectedSnapshot.enemies,
  ) as FracturedGateRecord[]) {
    if (
      !["active", "staggered", "off-balance", "pinned"].includes(enemy.status)
    ) {
      continue;
    }
    const origin = BOARD_TILES[enemy.position];
    if (!origin) continue;
    for (const tile of Object.values(BOARD_TILES) as FracturedGateRecord[]) {
      if (
        Math.max(Math.abs(tile.x - origin.x), Math.abs(tile.y - origin.y)) <= 1
      ) {
        activeEnemyTiles.add(tile.id);
      }
    }
  }

  const boardFocuses = [...visible]
    .filter((focusId) => BOARD_FOCUSES[focusId])
    .filter((focusId) => focusId !== "player");

  return (
    <section
      ref={boardScrollRef}
      className={styles.board}
      aria-label="The Fractured Gate tactical board"
      data-testid="fractured-gate-board"
    >
      <div className={styles.boardViewport}>
        <div className={styles.boardTools}>
          <span>FRACTURED GATE · 62 PLAYABLE DIAMONDS · 4 ENEMIES</span>
          <div>
            <button
              type="button"
              className={showMoveGuide ? styles.activeBoardTool : ""}
              onClick={onShowMove}
              aria-pressed={showMoveGuide}
            >
              MOVE RANGE
            </button>
            <button
              type="button"
              className={showThreats ? styles.activeThreatTool : ""}
              onClick={() => setShowThreats((current) => !current)}
              aria-pressed={showThreats}
            >
              ENEMY PRESSURE
            </button>
            <button
              type="button"
              className={showBuildLine ? styles.activeBuildTool : ""}
              onClick={() => {
                setShowBuildLine((current) => !current);
                onOpportunity(opportunity.focusId);
              }}
              aria-pressed={showBuildLine}
            >
              BUILD LINE
            </button>
          </div>
        </div>
        <div className={styles.boardPanHint} aria-hidden="true">
          SCROLL BATTLEFIELD → 62 SPACES + GATE
        </div>

        <svg
          className={styles.boardArt}
          viewBox="0 0 1000 620"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="yard-fill" x1="0" x2="1">
              <stop offset="0" stopColor="#0d171f" />
              <stop offset="1" stopColor="#182832" />
            </linearGradient>
            <linearGradient id="walk-fill" x1="0" x2="1">
              <stop offset="0" stopColor="#17242b" />
              <stop offset="1" stopColor="#26363c" />
            </linearGradient>
            <linearGradient id="gate-fill" x1="0" x2="1">
              <stop offset="0" stopColor="#14272d" />
              <stop offset="1" stopColor="#1d3b3d" />
            </linearGradient>
            <marker
              id="intent-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff8a5c" />
            </marker>
            <filter id="soft-glow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="1000" height="620" fill="#060a0f" />
          <path
            className={styles.locationShell}
            d="M190 205 L325 205 L325 235 L512 258 L548 311 L518 365 L612 414 L612 486 L579 552 L193 552 L169 512 L194 455 L207 425 L52 425 L40 340 L178 330 L190 282 Z"
            fill="url(#yard-fill)"
            stroke="#334752"
            strokeWidth="3"
          />
          <path
            className={styles.locationShell}
            d="M260 62 L515 62 L546 112 L521 196 L286 208 L251 151 Z"
            fill="url(#walk-fill)"
            stroke="#50636a"
            strokeWidth="3"
          />
          <path
            className={styles.locationShell}
            d="M604 62 L875 62 L916 121 L897 206 L642 216 L598 160 Z"
            fill="url(#walk-fill)"
            stroke="#50636a"
            strokeWidth="3"
          />
          <path
            className={styles.locationShell}
            d="M604 209 L902 209 L956 260 L947 432 L910 477 L612 477 L577 421 L594 352 L571 305 Z"
            fill="url(#gate-fill)"
            stroke="#3a7774"
            strokeWidth="4"
          />
          <path
            className={styles.entryGangway}
            d="M48 355 L205 355 L242 387 L205 420 L48 410 Z"
            fill="none"
            stroke="#6c7b80"
            strokeWidth="9"
          />
          <path
            className={styles.brokenSpan}
            d="M506 193 L532 177 L548 193 M603 190 L623 174 L647 190"
            fill="none"
            stroke="#91a5aa"
            strokeWidth="8"
            strokeLinecap="square"
          />
          <polyline
            points={feedPoints}
            fill="none"
            stroke="#4edfff"
            strokeWidth="13"
            strokeLinecap="round"
            opacity="0.23"
          />
          <polyline
            points={`${svgPoint(actuatorPoint)} ${svgPoint(bollardPoint)}`}
            fill="none"
            stroke="#4edfff"
            strokeWidth="4"
            strokeDasharray="7 8"
            opacity="0.7"
          />
          <g
            className={styles.physicalGate}
            transform={`translate(${gatePoint.x * 10} ${gatePoint.y * 6.2})`}
          >
            <path
              d="M-48 58 L-48 -54 Q0 -84 48 -54 L48 58"
              fill="none"
              stroke="#5b8f84"
              strokeWidth="18"
            />
            <path
              d="M-29 58 L-29 -39 Q0 -58 29 -39 L29 58"
              fill="rgba(4, 10, 12, 0.9)"
              stroke="#63ff9f"
              strokeWidth="4"
              strokeDasharray="9 7"
            />
          </g>
          <g
            className={styles.physicalDivider}
            transform={`translate(${dividerPoint.x * 10} ${dividerPoint.y * 6.2})`}
          >
            <path
              d="M-42 -39 L-20 -34 L-8 -44 L7 -30 L24 -37 L43 -26 L36 38 L11 31 L-2 43 L-20 29 L-42 36 Z"
              fill="#273138"
              stroke="#94a5aa"
              strokeWidth="5"
            />
            <path
              d="M-8 -38 L3 -15 L-7 0 L9 18 L0 39"
              fill="none"
              stroke="#ff9b6a"
              strokeWidth="5"
            />
          </g>
          <g
            className={styles.physicalActuator}
            transform={`translate(${actuatorPoint.x * 10} ${actuatorPoint.y * 6.2})`}
          >
            <path
              d="M-29 -22 L18 -30 L32 -13 L27 27 L-22 31 L-34 12 Z"
              fill="#0c2631"
              stroke="#61dcff"
              strokeWidth="5"
            />
            <circle cx="-7" cy="-3" r="6" fill="#63ff9f" />
            <path
              d="M5 -9 L22 -12 M5 2 L21 0 M4 13 L17 12"
              stroke="#61dcff"
              strokeWidth="4"
            />
          </g>
          <g
            className={styles.physicalBollard}
            transform={`translate(${bollardPoint.x * 10} ${bollardPoint.y * 6.2})`}
          >
            <ellipse
              cy="-23"
              rx="18"
              ry="8"
              fill="#34515c"
              stroke="#61dcff"
              strokeWidth="4"
            />
            <path
              d="M-18 -23 L-14 26 Q0 37 14 26 L18 -23"
              fill="#1c333b"
              stroke="#61dcff"
              strokeWidth="4"
            />
          </g>
          <g
            className={styles.physicalCache}
            transform={`translate(${BOARD_FOCUSES["field-cache"].x * 10} ${
              BOARD_FOCUSES["field-cache"].y * 6.2
            })`}
          >
            <path
              d="M-26 -18 L2 -29 L29 -10 L23 25 L-10 31 L-31 9 Z"
              fill="#3d3214"
              stroke="#ffd166"
              strokeWidth="5"
            />
            <path
              d="M-8 -25 L-6 26 M-28 5 L26 -4"
              stroke="#a88631"
              strokeWidth="4"
            />
          </g>
          <g
            className={styles.physicalRelay}
            transform={`translate(${BOARD_FOCUSES["lift-relay"].x * 10} ${
              BOARD_FOCUSES["lift-relay"].y * 6.2
            })`}
          >
            <path
              d="M0 -31 L28 -14 L28 16 L0 32 L-28 16 L-28 -14 Z"
              fill="#102a34"
              stroke="#61dcff"
              strokeWidth="5"
            />
            <path
              d="M-12 10 L0 -15 L12 10 M-16 17 L16 17"
              fill="none"
              stroke="#c9a6ff"
              strokeWidth="5"
            />
          </g>
          <g
            className={styles.physicalServiceGap}
            transform={`translate(${BOARD_FOCUSES["service-gap"].x * 10} ${
              BOARD_FOCUSES["service-gap"].y * 6.2
            })`}
          >
            <path
              d="M-36 -19 L36 -19 L28 23 L-28 23 Z"
              fill="#03070a"
              stroke="#73878d"
              strokeWidth="5"
            />
            <path
              d="M-20 -15 L-12 19 M-2 -17 L5 19 M17 -17 L23 17"
              stroke="#3d4b50"
              strokeWidth="4"
            />
          </g>
          <polyline
            points={intentPoints}
            fill="none"
            stroke="#ff8a5c"
            strokeWidth="8"
            strokeDasharray="20 13"
            markerEnd="url(#intent-arrow)"
            opacity={showThreats ? 0.9 : 0.16}
          />
          <circle
            cx={gatePoint.x * 10}
            cy={gatePoint.y * 6.2}
            r="42"
            fill="none"
            stroke="#ff8a5c"
            strokeWidth="4"
            opacity={showThreats ? 0.65 : 0.14}
          />
          <path
            d={`M${gatePoint.x * 10 + 30} ${gatePoint.y * 6.2 - 75} L${
              gatePoint.x * 10 + 55
            } ${gatePoint.y * 6.2 + 75}`}
            fill="none"
            stroke={snapshot.gate.status === "failed" ? "#ff6474" : "#52ff9b"}
            strokeWidth="12"
            opacity="0.8"
            filter="url(#soft-glow)"
          />
          {pathPoints ? (
            <polyline
              points={pathPoints}
              fill="none"
              stroke="#4edfff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="14 10"
              className={styles.projectionPath}
            />
          ) : null}
          {projection?.contact ? (
            <g
              transform={`translate(${
                projection.contact.location === "Cracked Divider"
                  ? dividerPoint.x * 10
                  : projection.contact.location === "Defensive Bollard"
                    ? bollardPoint.x * 10
                    : gatePoint.x * 10
              } ${
                projection.contact.location === "Cracked Divider"
                  ? dividerPoint.y * 6.2
                  : projection.contact.location === "Defensive Bollard"
                    ? bollardPoint.y * 6.2
                    : gatePoint.y * 6.2
              })`}
              className={styles.collisionMark}
            >
              <path
                d="M-24 0 L-7 -7 L0 -27 L8 -8 L28 0 L8 8 L0 28 L-8 8 Z"
                fill="#ffc857"
              />
              <circle r="42" fill="none" stroke="#ffc857" strokeWidth="3" />
            </g>
          ) : null}
          <text x="290" y="86" className={styles.areaLabel}>
            UPPER WEST
          </text>
          <text x="650" y="86" className={styles.areaLabel}>
            UPPER EAST
          </text>
          <text x="215" y="526" className={styles.areaLabel}>
            LOWER YARD
          </text>
          <text x="700" y="452" className={styles.areaLabel}>
            GATE PLATFORM
          </text>
        </svg>

        <div
          className={styles.tileLayer}
          aria-label="Direct tactical tile selection"
        >
          {Object.values(BOARD_TILES).map((tile: FracturedGateRecord) => {
            const target = legalTargets.has(tile.id);
            const confirmed = confirmedTarget === tile.id;
            const selected = selectedFocus === tile.id;
            const freeMove = showMoveGuide && repositionTargets.has(tile.id);
            const paidMove =
              showMoveGuide &&
              advanceTargets.has(tile.id) &&
              !repositionTargets.has(tile.id);
            const threatened = showThreats && activeEnemyTiles.has(tile.id);
            const buildTile = showBuildLine && opportunityTileId === tile.id;
            const cue = confirmed
              ? "SET"
              : target
                ? targetingChoice?.id === "reposition"
                  ? "FREE"
                  : targetingChoice?.parent === "Move"
                    ? "MOVE"
                    : "TARGET"
                : freeMove
                  ? "FREE"
                  : paidMove
                    ? "ADV"
                    : "";
            const classNames = [
              styles.boardTile,
              styles[`terrain_${tile.terrain}`],
              target ? styles.legalTile : "",
              selected ? styles.selectedTile : "",
              freeMove ? styles.freeMoveTile : "",
              paidMove ? styles.advanceMoveTile : "",
              threatened ? styles.threatenedTile : "",
              buildTile ? styles.buildOpportunityTile : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                type="button"
                key={tile.id}
                className={classNames}
                style={
                  {
                    "--x": `${tile.boardX}%`,
                    "--y": `${tile.boardY}%`,
                  } as PositionedStyle
                }
                onClick={() => onFocus(tile.id)}
                aria-label={`${focusStatus(tile.id, projectedSnapshot)}. ${
                  confirmed
                    ? "Confirmed target."
                    : target
                      ? "Legal target."
                      : freeMove
                        ? "Legal free Reposition destination."
                        : paidMove
                          ? "Legal paid Advance destination."
                          : threatened
                            ? "Inside visible enemy control."
                            : "Inspect or select."
                }`}
                data-tile-id={tile.id}
                data-terrain={tile.terrain}
              >
                <span className={styles.tileDiamond} aria-hidden="true">
                  <i>
                    {tile.terrain === "powered"
                      ? "⚡"
                      : tile.terrain === "rubble"
                        ? "▲"
                        : tile.terrain === "clear"
                          ? "›"
                          : ""}
                  </i>
                </span>
                {cue ? <span className={styles.tileCue}>{cue}</span> : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`${styles.playerPiece} ${
            selectedFocus === "player" ? styles.selectedPiece : ""
          } ${legalTargets.has("player") ? styles.legalTarget : ""} ${
            intentFocuses.has("player") ? styles.intentSelectableFocus : ""
          } ${
            intentFocuses.get("player") === true ? styles.intentReadyFocus : ""
          }`}
          style={
            {
              "--x": `${playerPosition.x}%`,
              "--y": `${playerPosition.y}%`,
            } as PositionedStyle
          }
          onClick={() => onFocus("player")}
          aria-label={`Player at ${focusStatus("player", snapshot)}`}
          data-focus-id="player"
        >
          {intentFocuses.has("player") && !legalTargets.has("player") ? (
            <span className={styles.intentCue}>
              {intentFocuses.get("player") ? "READY" : "CHECK"}
            </span>
          ) : null}
          <span className={styles.pieceCore} aria-hidden="true">
            6
          </span>
          <span className={styles.pieceLabel}>YOU</span>
        </button>

        {ghostPosition &&
        (ghostPosition.x !== playerPosition.x ||
          ghostPosition.y !== playerPosition.y) ? (
          <div
            className={styles.ghostPiece}
            style={
              {
                "--x": `${ghostPosition.x}%`,
                "--y": `${ghostPosition.y}%`,
              } as PositionedStyle
            }
            aria-hidden="true"
          >
            <span>6</span>
            <small>PREVIEW</small>
          </div>
        ) : null}

        {boardFocuses.map((focusId) => {
          const focus = BOARD_FOCUSES[focusId];
          const marker = MARKER_VISUALS[focusId] ?? {
            glyph: "•",
            short: focus.name.toUpperCase(),
            relationship: focus.kind,
          };
          const selected = selectedFocus === focusId;
          const target = legalTargets.has(focusId);
          const confirmed = confirmedTarget === focusId;
          const intentSelectable = intentFocuses.has(focusId);
          const intentReady = intentFocuses.get(focusId) === true;
          const actor = focus.actorId
            ? projectedSnapshot.enemies?.[focus.actorId]
            : null;
          const enemyVisual = actor ? ENEMY_VISUALS[focus.actorId] : null;
          const actorPoint = actor
            ? getPositionCoordinates(actor.position)
            : null;
          const enemyInactive =
            Boolean(actor) &&
            !["active", "staggered", "off-balance", "pinned"].includes(
              actor.status,
            );
          const movementPassThrough =
            targetingChoice?.parent === "Move" &&
            legalTargets.has(focus.tileId) &&
            !target;
          const opportunityFocus =
            showBuildLine && focusId === opportunity.focusId;
          const classNames = [
            styles.boardFocus,
            styles[`focus_${focus.kind}`],
            actor ? styles[`enemy_${focus.actorId}`] : "",
            selected ? styles.selectedFocus : "",
            target ? styles.legalTarget : "",
            intentSelectable ? styles.intentSelectableFocus : "",
            intentSelectable && intentReady ? styles.intentReadyFocus : "",
            enemyInactive ? styles.inactiveFocus : "",
            movementPassThrough ? styles.movementPassThrough : "",
            opportunityFocus ? styles.buildOpportunityFocus : "",
            [
              "breach",
              "upper-route",
              "service-route",
              "service-lift",
              "regulator",
            ].includes(focusId)
              ? styles.projectedFocus
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          const conciseStatus = actor
            ? `${actor.condition} Condition · ${actor.guard} Guard`
            : focusId === "gate"
              ? `${projectedSnapshot.gate.stability}/3 Stability`
              : focusId === "gate-actuator"
                ? projectedSnapshot.actuator.controlled
                  ? `${titleCase(projectedSnapshot.actuator.mode)} Control`
                  : "Feed neutral"
                : focusId === "cracked-divider"
                  ? `${titleCase(projectedSnapshot.divider.status)} · conduit ${titleCase(
                      projectedSnapshot.divider.conduit,
                    )}`
                  : marker.relationship;
          return (
            <button
              type="button"
              key={focusId}
              className={classNames}
              style={
                {
                  "--x": `${actorPoint?.x ?? focus.x}%`,
                  "--y": `${actorPoint?.y ?? focus.y}%`,
                } as PositionedStyle
              }
              onClick={() => onFocus(focusId)}
              aria-pressed={selected}
              aria-label={`${focus.name}. ${focusStatus(
                focusId,
                projectedSnapshot,
              )}${
                enemyVisual
                  ? `. ${enemyVisual.role} role. ${enemyVisual.intent}.`
                  : ""
              }`}
              data-focus-id={focusId}
            >
              {target ? (
                <span className={styles.targetCue}>
                  {confirmed ? "CONFIRMED" : "TARGET"}
                </span>
              ) : null}
              {intentSelectable && !target ? (
                <span className={styles.intentCue}>
                  {intentReady ? "READY" : "CHECK"}
                </span>
              ) : null}
              {opportunityFocus ? (
                <span className={styles.buildCue}>YOUR BUILD</span>
              ) : null}
              <span className={styles.markerGlyph} aria-hidden="true">
                {enemyVisual?.icon ?? marker.glyph}
              </span>
              <span className={styles.markerLabel}>
                <strong>
                  {enemyVisual ? `ENEMY · ${marker.short}` : marker.short}
                </strong>
                <small>{conciseStatus}</small>
              </span>
            </button>
          );
        })}

        {game.phase === "resolution" ? (
          <div className={styles.resolutionVeil} aria-live="polite">
            <span>RESOLVING</span>
            <strong>
              {game.resolution.visibleLaneIndex >= 0
                ? LANE_NAMES[game.resolution.visibleLaneIndex]
                : "Plan locked"}
            </strong>
          </div>
        ) : null}
      </div>

      <div className={styles.enemyReadout} aria-label="Visible enemy intent">
        <span>ENEMY FORMATION · VISIBLE INTENT</span>
        <strong>Breacher → Fractured Gate</strong>
        <small>Guard · protects lane</small>
        <small>Controller · contests machinery</small>
        <small>Pressure · denies routes</small>
      </div>

      <div className={styles.terrainLegend} aria-label="Battlefield legend">
        <span className={styles.legendClear}>› CLEAR · ordinary cost</span>
        <span className={styles.legendRubble}>▲ RUBBLE · costs 2 movement</span>
        <span className={styles.legendPowered}>
          ⚡ SERVICE TRACK · powered by Gate Actuator · feed{" "}
          {titleCase(projectedSnapshot.poweredTrack.feed)}
        </span>
        <span className={styles.legendThreat}>
          RED · enemy control / intent
        </span>
        <span className={styles.legendBuild}>
          VIOLET · {buildFor(game.buildId).name} opportunity
        </span>
      </div>
    </section>
  );
}

function ContextPanel({
  game,
  focusId,
  selectedParent,
  actionIntent,
  targetingChoice,
  onParent,
  onChoice,
  onCancelTarget,
  onCancelIntent,
}: {
  game: FracturedGateState;
  focusId: string;
  selectedParent: string | null;
  actionIntent: ActionIntent;
  targetingChoice: FracturedGateChoice | null;
  onParent: (parent: string) => void;
  onChoice: (choice: FracturedGateChoice) => void;
  onCancelTarget: () => void;
  onCancelIntent: () => void;
}) {
  const groups = getContextActionGroups(game, focusId);
  const focus =
    BOARD_FOCUSES[focusId] ??
    (BOARD_TILES[focusId]
      ? {
          ...BOARD_TILES[focusId],
          kind: "tile",
          description:
            "A real tactical tile. Movement cost, occupancy, terrain, and contact are resolved on the hidden 13 × 9 scale.",
        }
      : BOARD_FOCUSES.player);
  const activeGroup =
    groups.find(
      (group: FracturedGateRecord) => group.parent === selectedParent,
    ) ?? null;

  return (
    <aside className={styles.contextPanel} aria-label="Context actions">
      <p className={styles.eyebrow}>Selected · {focus.kind}</p>
      <h2>{focus.name}</h2>
      <p className={styles.contextDescription}>{focus.description}</p>

      {game.phase !== "planning" ? (
        <div className={styles.phaseContextNotice} role="status">
          <span>
            {game.phase === "resolution"
              ? "Resolution · actions locked"
              : game.phase === "settle"
                ? "Aftermath · inspect changes"
                : "Battle complete · review"}
          </span>
          <strong>
            {game.phase === "resolution"
              ? "Watch the battlefield"
              : game.phase === "settle"
                ? "Compare the new state"
                : "No further battle actions"}
          </strong>
          <p>
            {game.phase === "resolution"
              ? "Use the timing controls below to advance. Nothing may be added or retargeted."
              : game.phase === "settle"
                ? "Select any visible actor or object to inspect it, then continue from the Aftermath panel below."
                : "Read the result and tradeoff below, or reset the same deterministic opening."}
          </p>
        </div>
      ) : targetingChoice ? (
        <div className={styles.targetingNotice} role="status">
          <span>Targeting · board is filtered</span>
          <strong>{targetingChoice.label}</strong>
          <p>
            Select one glowing legal destination or target directly on the
            battlefield.
          </p>
          <button type="button" onClick={onCancelTarget}>
            Cancel
          </button>
        </div>
      ) : actionIntent ? (
        <div className={styles.intentNotice} role="status">
          <span>{actionIntent} selection · board is marked</span>
          <strong>
            {actionIntent === "Attack"
              ? "Choose one of the four enemy pieces."
              : actionIntent === "Defend"
                ? "Choose your operative or a marked objective."
                : "Choose a marked objective or battlefield object."}
          </strong>
          <p>
            Bright markers are usable now. Dim markers remain selectable and
            explain the position or setup you still need.
          </p>
          <button type="button" onClick={onCancelIntent}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div
            className={styles.parentActions}
            aria-label="Context action categories"
          >
            {groups.map((group: FracturedGateRecord) => (
              <button
                type="button"
                key={group.parent}
                data-parent-action={group.parent}
                className={
                  selectedParent === group.parent ? styles.activeParent : ""
                }
                onClick={() => onParent(group.parent)}
                aria-pressed={selectedParent === group.parent}
              >
                {group.parent.toUpperCase()}
              </button>
            ))}
          </div>

          {activeGroup ? (
            <div className={styles.actionVariants}>
              {activeGroup.choices.map((choice: FracturedGateChoice) => (
                <button
                  type="button"
                  key={choice.id}
                  data-choice-id={choice.id}
                  disabled={!choice.legal}
                  onClick={() => onChoice(choice)}
                >
                  <span>
                    <strong>{choice.label}</strong>
                    <small>
                      {choice.immediate
                        ? "Details only"
                        : `${choice.cost} Command · ${choice.lane}${
                            choice.tempo ? ` / ${choice.tempo}` : ""
                          }`}
                    </small>
                  </span>
                  <p>{choice.legal ? choice.description : choice.reason}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.contextHint}>
              Choose an action family. The battlefield will then show every
              legal target, range, and relevant physical relationship.
            </p>
          )}
        </>
      )}

      <dl className={styles.inspectDetails}>
        <div>
          <dt>Status</dt>
          <dd>{focusStatus(focusId, displaySnapshot(game)) || "Available"}</dd>
        </div>
        <div>
          <dt>Build read</dt>
          <dd>{buildFor(game.buildId).identity}</dd>
        </div>
      </dl>
    </aside>
  );
}

function PreviewPanel({
  game,
  targetingChoice,
  targetId,
  attachedCard,
  preview,
  planProjection,
  pivotMode,
  onAdd,
}: {
  game: FracturedGateState;
  targetingChoice: FracturedGateChoice | null;
  targetId: string | null;
  attachedCard: string | null;
  preview: FracturedGateRecord | null;
  planProjection: FracturedGateRecord | null;
  pivotMode: boolean;
  onAdd: () => void;
}) {
  const shown = preview?.legal ? preview.projection : planProjection;
  const title =
    targetingChoice && targetId
      ? targetingChoice.label
      : game.plan.length
        ? "Plan projection"
        : "Preview";
  return (
    <section className={styles.previewPanel} aria-label="Confirmed preview">
      <div className={styles.previewHeading}>
        <div>
          <p className={styles.eyebrow}>Confirmed projection</p>
          <h2>{title}</h2>
        </div>
        {shown?.signature ? (
          <span className={styles.signature}>#{shown.signature}</span>
        ) : null}
      </div>

      {shown ? (
        <div className={styles.previewContent}>
          <div>
            <strong>Expected</strong>
            <ul>
              {(shown.expected.length
                ? shown.expected
                : ["No material board change is currently projected."]
              ).map((item: string, index: number) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div className={styles.riskBox}>
            <strong>Important risk</strong>
            <p>{shown.risk}</p>
          </div>
          {shown.contact ? (
            <div className={styles.contactForecast}>
              <strong>Contact risk · {shown.contact.risk}</strong>
              <span>{shown.contact.timing}</span>
              <span>Location · {shown.contact.location}</span>
              <span>
                Unknown · {shown.contact.unknown} concealed factor
                {shown.contact.unknown === 1 ? "" : "s"}
              </span>
              <p>{shown.contact.reason}</p>
              <details>
                <summary>Tempo details</summary>
                {shown.contact.details}
              </details>
            </div>
          ) : null}
          {shown.attribution ? (
            <div className={styles.skillAttribution}>
              <strong>
                {shown.attribution.action} · {shown.attribution.build}
              </strong>
              <span>Revealed by · {shown.attribution.revealed}</span>
              <span>Enabled by · {shown.attribution.enabled}</span>
              {shown.attribution.modified ? (
                <span>Modified by · {shown.attribution.modified}</span>
              ) : null}
              {shown.attribution.opposed ? (
                <span>Opposed by · {shown.attribution.opposed}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={styles.emptyPreview}>
          Select something on the board to see your options. Choose an action,
          then confirm its target directly on the board.
        </p>
      )}

      {targetingChoice && targetId && preview?.legal ? (
        <div className={styles.addBar}>
          <span>
            {targetingChoice.cost +
              (attachedCard ? CARDS[attachedCard].cost : 0)}{" "}
            Command
            {attachedCard ? ` · ${cardName(attachedCard)}` : ""}
          </span>
          <button type="button" data-testid="add-to-plan" onClick={onAdd}>
            {pivotMode ? "LOCK PIVOT" : "ADD TO PLAN"}
          </button>
        </div>
      ) : null}
      {preview && !preview.legal ? (
        <p className={styles.previewError}>{preview.error}</p>
      ) : null}
    </section>
  );
}

function PlanChain({
  game,
  projection,
  pivotMode,
  onBeginPivot,
  onCancelPivot,
  onPass,
}: {
  game: FracturedGateState;
  projection: FracturedGateRecord | null;
  pivotMode: boolean;
  onBeginPivot: () => void;
  onCancelPivot: () => void;
  onPass: () => void;
}) {
  const count = paidActionCount(game);
  const density =
    count <= 2 ? "Normal" : count === 3 ? "Pressured" : "Exceptional";
  const openAction = game.plan.find(
    (action: FracturedGateRecord) => action.status === "open",
  );
  return (
    <section className={styles.planPanel} aria-label="Current plan">
      <div className={styles.planTopline}>
        <div>
          <p className={styles.eyebrow}>
            Opposed planning ·{" "}
            {game.priority === "player" ? "your priority" : "enemy priority"}
          </p>
          <h2>
            PLAN · {count}/{CORE_RULES.paidActionCap} PAID
          </h2>
        </div>
        <div className={styles.planMeters}>
          <span>{density}</span>
          <strong>{availableCommand(game)} Command remains</strong>
        </div>
      </div>

      {game.refocusRecord ? (
        <div className={styles.refocusPlanStep}>
          <span>Planning</span>
          Refocus {game.refocusRecord.discarded.length} card
          {game.refocusRecord.discarded.length === 1 ? "" : "s"} · 4 Command
        </div>
      ) : null}

      {game.plan.length ? (
        <ol className={styles.planChain}>
          {game.plan.map((action: FracturedGateRecord) => (
            <li key={action.instanceId}>
              <span className={styles.planTiming}>{action.lane}</span>
              <strong>{action.label}</strong>
              <small>
                {action.targetName} · {action.totalCost} Command
                {action.cardName
                  ? ` · ${action.concealed ? "concealed modifier" : action.cardName}`
                  : ""}
              </small>
              <span
                className={
                  action.status === "open"
                    ? styles.openCommitment
                    : styles.solidCommitment
                }
              >
                {action.status === "open"
                  ? "NEWEST · MAY CHANGE ONCE"
                  : "SOLID COMMITMENT"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.emptyPlan}>
          No large empty slots. Add only the actions your plan needs.
        </p>
      )}

      <div className={styles.enemyPlan}>
        <div>
          <span>ENEMY SQUAD PLAN</span>
          <strong>
            {game.enemyPlan.length} commitment
            {game.enemyPlan.length === 1 ? "" : "s"} ·{" "}
            {availableEnemyCommand(game)} Command saved
          </strong>
        </div>
        <ul>
          {game.enemyPlan.map((action: FracturedGateRecord) => (
            <li key={action.instanceId}>
              <strong>{action.actorName}</strong>
              <span>{action.posture ?? action.label}</span>
              <small>
                {action.totalCost} Command
                {action.concealed || action.modifierCardId
                  ? " · concealed factor"
                  : ""}
              </small>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.pivotBar}>
        <span>
          Pivot · {game.playerPivotUsed ? "SPENT" : "AVAILABLE"} · newest action
          only
        </span>
        {pivotMode ? (
          <button type="button" onClick={onCancelPivot}>
            CANCEL PIVOT
          </button>
        ) : (
          <button
            type="button"
            onClick={onBeginPivot}
            disabled={!openAction || game.playerPivotUsed}
          >
            CHANGE NEWEST
          </button>
        )}
      </div>

      <div className={styles.lockBar}>
        <span>
          {projection
            ? `Preview #${projection.signature} · ${game.consecutivePasses}/2 passes`
            : "Two consecutive passes Lock both plans"}
        </span>
        <button
          type="button"
          data-testid="lock-plan"
          onClick={onPass}
          disabled={!game.plan.length && !game.refocusRecord}
        >
          END PLANNING
        </button>
      </div>
    </section>
  );
}

function Hand({
  game,
  compatibleCards,
  contextCards,
  attachedCard,
  refocusMode,
  refocusSelection,
  onCard,
  onBeginRefocus,
  onCancelRefocus,
  onCommitRefocus,
  onDiscard,
}: {
  game: FracturedGateState;
  compatibleCards: Set<string>;
  contextCards: string[];
  attachedCard: string | null;
  refocusMode: boolean;
  refocusSelection: string[];
  onCard: (cardId: string) => void;
  onBeginRefocus: () => void;
  onCancelRefocus: () => void;
  onCommitRefocus: () => void;
  onDiscard: (cardId: string) => void;
}) {
  const plannedCards = new Set(
    game.plan
      .map((action: FracturedGateRecord) => action.cardId)
      .filter(Boolean),
  );
  const overRetain = game.hand.length > CORE_RULES.retainLimit;
  const displayedCards = [...game.hand, ...contextCards];
  return (
    <section className={styles.handPanel} aria-label="Prepared card hand">
      <div className={styles.handHeading}>
        <div>
          <p className={styles.eyebrow}>Prepared hand</p>
          <h2>
            {game.hand.length} CARDS · DECK {game.deck.length - game.drawIndex}{" "}
            · DISCARD {game.discard.length}
          </h2>
        </div>
        <div className={styles.handTools}>
          {overRetain ? (
            <span className={styles.retainWarning}>
              RETAIN 7 · choose {game.hand.length - CORE_RULES.retainLimit} to
              discard
            </span>
          ) : null}
          {!refocusMode ? (
            <button
              type="button"
              onClick={onBeginRefocus}
              disabled={game.refocusUsed || availableCommand(game) < 4}
            >
              REFOCUS · 4
            </button>
          ) : (
            <>
              <button type="button" onClick={onCancelRefocus}>
                CANCEL
              </button>
              <button
                type="button"
                onClick={onCommitRefocus}
                disabled={
                  refocusSelection.length < 1 || refocusSelection.length > 2
                }
              >
                REPLACE {refocusSelection.length}
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.cards}>
        {displayedCards.map((cardId: string) => {
          const card = CARDS[cardId];
          const compatible = compatibleCards.has(cardId);
          const planned = plannedCards.has(cardId);
          const selected = attachedCard === cardId;
          const refocusSelected = refocusSelection.includes(cardId);
          const context = contextCards.includes(cardId);
          const classes = [
            styles.card,
            compatible ? styles.compatibleCard : "",
            selected ? styles.selectedCard : "",
            planned ? styles.plannedCard : "",
            refocusSelected ? styles.refocusSelected : "",
            !compatible && !refocusMode && !overRetain ? styles.quietCard : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              type="button"
              key={cardId}
              data-card-id={cardId}
              className={classes}
              onClick={() =>
                overRetain && !context ? onDiscard(cardId) : onCard(cardId)
              }
              disabled={planned && !overRetain}
              aria-pressed={selected || refocusSelected}
            >
              <span className={styles.cardTop}>
                <strong>{card.name}</strong>
                <small>{card.cost}</small>
              </span>
              <span className={styles.cardKind}>{card.kind}</span>
              <p>{card.text}</p>
              {context ? (
                <span className={styles.contextCue}>
                  SOURCE-BOUND · EXPIRES WITH CHAIN
                </span>
              ) : null}
              {compatible && !refocusMode ? (
                <span className={styles.compatibleCue}>COMPATIBLE</span>
              ) : null}
              {planned ? (
                <span className={styles.plannedCue}>IN PLAN</span>
              ) : null}
              {overRetain ? (
                <span className={styles.discardCue}>DISCARD</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ResolutionPanel({
  game,
  onAdvance,
}: {
  game: FracturedGateState;
  onAdvance: () => void;
}) {
  const index = game.resolution?.visibleLaneIndex ?? -1;
  const packet = index >= 0 ? game.resolution.packets[index] : null;
  const nextControl =
    index < 0
      ? "BEGIN FAST ACTIONS"
      : index < 2
        ? `RESOLVE ${LANE_NAMES[index + 1].toUpperCase()} ACTIONS`
        : "REVIEW AFTERMATH";
  return (
    <section className={styles.resolutionPanel} aria-live="polite">
      <div className={styles.lanes}>
        {LANE_NAMES.map((lane, laneIndex) => (
          <div
            key={lane}
            className={
              laneIndex === index
                ? styles.currentLane
                : laneIndex < index
                  ? styles.pastLane
                  : styles.futureLane
            }
          >
            <span>{laneIndex + 1}</span>
            <strong>{lane}</strong>
          </div>
        ))}
      </div>
      <div className={styles.packetReadout}>
        <div>
          <p className={styles.eyebrow}>
            {packet ? `${packet.lane} packet` : "Plan locked"}
          </p>
          <h2>
            {packet
              ? `${packet.lane} actions have resolved. Review the board.`
              : "The Action Phase is ready."}
          </h2>
        </div>
        <button
          type="button"
          data-testid="advance-resolution"
          onClick={onAdvance}
        >
          {nextControl}
        </button>
      </div>
      {packet ? (
        <ul className={styles.packetEvents}>
          {packet.events.length ? (
            packet.events.map(
              (event: FracturedGateRecord, eventIndex: number) => (
                <li key={`${event.instanceId}-${eventIndex}`}>
                  <strong>{event.title}</strong>
                  <span>{event.detail}</span>
                </li>
              ),
            )
          ) : (
            <li>
              <strong>No action in this lane</strong>
              <span>
                The lane remains visible; nothing is silently skipped.
              </span>
            </li>
          )}
        </ul>
      ) : null}
    </section>
  );
}

function ReviewLog({ game }: { game: FracturedGateState }) {
  return (
    <details className={styles.reviewLog}>
      <summary>REVIEW DETERMINISTIC CAUSAL LOG</summary>
      <ol>
        {game.review.map((event: FracturedGateRecord, index: number) => (
          <li key={`${event.instanceId}-${index}`}>
            <span>{event.lane}</span>
            <strong>{event.title}</strong>
            <p>{event.detail}</p>
            <small>{event.outcome}</small>
          </li>
        ))}
      </ol>
      {game.resolution?.signature ? (
        <p className={styles.reviewSignature}>
          Deterministic plan signature · #{game.resolution.signature}
        </p>
      ) : null}
    </details>
  );
}

function AftermathPanel({
  game,
  onContinue,
}: {
  game: FracturedGateState;
  onContinue: () => void;
}) {
  const summary = game.settleSummary;
  const snapshot = displaySnapshot(game);
  const nextPhase = settleRound(game).phase;
  return (
    <section className={styles.settlePanel} aria-label="Exchange aftermath">
      <div className={styles.settleHeading}>
        <div>
          <p className={styles.eyebrow}>
            Exchange {game.round} complete · Aftermath
          </p>
          <h2>Review the consequence before the battle continues.</h2>
        </div>
        <GatePips
          stability={summary.gateStability}
          status={summary.gateStatus}
        />
      </div>
      <dl className={styles.settleGrid}>
        <div>
          <dt>Player</dt>
          <dd>{summary.playerPosition}</dd>
        </div>
        <div>
          <dt>Enemy formation</dt>
          <dd>{summary.enemyStates.join(" · ")}</dd>
        </div>
        <div>
          <dt>Divider</dt>
          <dd>
            {titleCase(summary.dividerStatus)} · conduit{" "}
            {titleCase(snapshot.divider.conduit)}
          </dd>
        </div>
        <div>
          <dt>Gate Actuator</dt>
          <dd>
            {snapshot.actuator.controlled
              ? `${titleCase(snapshot.actuator.mode)} control`
              : "Neutral"}
          </dd>
        </div>
        <div>
          <dt>Defensive Bollard</dt>
          <dd>{titleCase(snapshot.bollard.status)}</dd>
        </div>
        <div>
          <dt>Powered service feed</dt>
          <dd>{titleCase(snapshot.poweredTrack.feed)}</dd>
        </div>
        <div>
          <dt>Cache</dt>
          <dd>{titleCase(summary.cacheStatus)}</dd>
        </div>
        <div>
          <dt>Command carried</dt>
          <dd>{summary.commandCarried}</dd>
        </div>
        <div>
          <dt>Squad Command carried</dt>
          <dd>{summary.enemyCommandCarried}</dd>
        </div>
        <div>
          <dt>West Exit</dt>
          <dd>{titleCase(summary.exitStatus)}</dd>
        </div>
        <div>
          <dt>Command refunded after exchange</dt>
          <dd>{summary.refunds}</dd>
        </div>
      </dl>
      <ReviewLog game={game} />
      <button
        type="button"
        data-testid="settle-round"
        className={styles.primaryButton}
        onClick={onContinue}
      >
        {nextPhase === "result"
          ? "VIEW BATTLE RESULTS"
          : `BEGIN EXCHANGE ${game.round + 1}`}
      </button>
    </section>
  );
}

function ResultsPanel({
  game,
  onReset,
}: {
  game: FracturedGateState;
  onReset: () => void;
}) {
  const result = game.result;
  return (
    <section className={styles.resultsPanel}>
      <p className={styles.eyebrow}>Battle Results</p>
      <h2>{result.type}</h2>
      <div className={styles.resultGrid}>
        <div>
          <span>Objective outcome</span>
          <strong>{result.objective}</strong>
        </div>
        <div>
          <span>Enemy formation</span>
          <strong>{result.enemies.join(" · ")}</strong>
        </div>
        <div>
          <span>Player state</span>
          <strong>{result.player}</strong>
        </div>
        <div>
          <span>Field Cache</span>
          <strong>{result.cache}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Location consequences</span>
          <strong>{result.location}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Principal turning point</span>
          <strong>{result.turningPoint}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Meaningful tradeoff</span>
          <strong>{result.tradeoff}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Why this title</span>
          <strong>{result.reason}</strong>
        </div>
      </div>
      <ReviewLog game={game} />
      <button
        type="button"
        data-testid="reset-result"
        className={styles.primaryButton}
        onClick={onReset}
      >
        RESET SAME INITIAL STATE
      </button>
    </section>
  );
}

export function FracturedGatePrototype() {
  const [game, setGame] = useState(() => createFracturedGateState());
  const [selectedFocus, setSelectedFocus] = useState("player");
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [actionIntent, setActionIntent] = useState<ActionIntent>(null);
  const [targetingChoice, setTargetingChoice] =
    useState<FracturedGateChoice | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [attachedCard, setAttachedCard] = useState<string | null>(null);
  const [refocusMode, setRefocusMode] = useState(false);
  const [refocusSelection, setRefocusSelection] = useState<string[]>([]);
  const [pivotMode, setPivotMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const planProjection = useMemo(
    () => (game.plan.length ? projectPlan(game) : null),
    [game],
  );
  const preview = useMemo(
    () =>
      targetingChoice && targetId
        ? previewAction(
            game,
            targetingChoice.id,
            targetId,
            attachedCard,
            pivotMode,
          )
        : null,
    [game, targetingChoice, targetId, attachedCard, pivotMode],
  );
  const activeProjection = preview?.legal ? preview.projection : planProjection;
  const compatibleCards = useMemo(
    () =>
      new Set(
        targetingChoice ? getCompatibleCards(game, targetingChoice.id) : [],
      ),
    [game, targetingChoice],
  );
  const contextCards = useMemo(
    () =>
      targetingChoice ? getAvailableContextCards(game, targetingChoice.id) : [],
    [game, targetingChoice],
  );
  const build = buildFor(game.buildId);
  const opportunity = getBuildOpportunity(
    game,
    activeProjection?.finalSnapshot ?? displaySnapshot(game),
  );
  const phaseGuide = getPhaseGuide({
    game,
    targetingChoice,
    targetId,
    selectedParent,
    actionIntent,
    pivotMode,
  });

  function clearDraft() {
    setTargetingChoice(null);
    setTargetId(null);
    setAttachedCard(null);
  }

  function resetInteraction() {
    setSelectedFocus("player");
    setSelectedParent(null);
    setActionIntent(null);
    clearDraft();
    setRefocusMode(false);
    setRefocusSelection([]);
    setPivotMode(false);
  }

  function handleFocus(focusId: string) {
    if (
      game.phase === "planning" &&
      targetingChoice?.legalTargets.includes(focusId)
    ) {
      setTargetId(focusId);
      return;
    }
    if (game.phase === "planning" && actionIntent) {
      const group = getContextActionGroups(game, focusId).find(
        (candidate: FracturedGateRecord) => candidate.parent === actionIntent,
      );
      if (group) {
        clearDraft();
        setSelectedFocus(focusId);
        setSelectedParent(actionIntent);
        setActionIntent(null);
        return;
      }
    }
    setActionIntent(null);
    setSelectedFocus(focusId);
    setSelectedParent(
      game.phase === "planning"
        ? focusId === "player"
          ? "Move"
          : null
        : "Inspect",
    );
    clearDraft();
  }

  function handleOpportunity(focusId: string) {
    clearDraft();
    setActionIntent(null);
    setSelectedFocus(focusId);
    const hasDiscipline = getContextActionGroups(game, focusId).some(
      (group: FracturedGateRecord) => group.parent === "Discipline",
    );
    setSelectedParent(hasDiscipline ? "Discipline" : null);
  }

  function handleShowMove() {
    clearDraft();
    setActionIntent(null);
    setSelectedFocus("player");
    setSelectedParent("Move");
  }

  function handleShortcut(parent: "Move" | "Attack" | "Defend" | "Use") {
    clearDraft();
    if (parent === "Move") {
      setActionIntent(null);
      setSelectedFocus("player");
      setSelectedParent(parent);
      return;
    }
    setSelectedFocus("player");
    setSelectedParent(null);
    setActionIntent(parent);
  }

  function handleParent(parent: string) {
    clearDraft();
    setActionIntent(null);
    setSelectedParent(parent);
  }

  function handlePass() {
    clearDraft();
    setActionIntent(null);
    setPivotMode(false);
    setGame((current) => passPriority(current));
  }

  function handleChoice(choice: FracturedGateChoice) {
    if (choice.immediate) {
      setSelectedParent("Inspect");
      clearDraft();
      return;
    }
    if (!choice.legal) return;
    setTargetingChoice(choice);
    setTargetId(null);
    setAttachedCard(null);
  }

  function addDraft() {
    if (!targetingChoice || !targetId || !preview?.legal) return;
    const wasMovement = targetingChoice.parent === "Move";
    const next = pivotMode
      ? pivotOpenAction(game, targetingChoice.id, targetId, attachedCard)
      : queueAction(game, targetingChoice.id, targetId, attachedCard);
    setGame(next);
    if (next !== game && !next.warning) {
      clearDraft();
      setActionIntent(null);
      setSelectedFocus(wasMovement ? "player" : targetId);
      setSelectedParent(null);
      setPivotMode(false);
    }
  }

  function handleCard(cardId: string) {
    if (refocusMode) {
      if (
        game.plan.some(
          (action: FracturedGateRecord) => action.cardId === cardId,
        )
      ) {
        return;
      }
      setRefocusSelection((current) =>
        current.includes(cardId)
          ? current.filter((candidate) => candidate !== cardId)
          : current.length < 2
            ? [...current, cardId]
            : current,
      );
      return;
    }
    if (!compatibleCards.has(cardId)) return;
    setAttachedCard((current) => (current === cardId ? null : cardId));
  }

  function commitRefocus() {
    const next = refocusCards(game, refocusSelection);
    setGame(next);
    if (next.refocusUsed) {
      setRefocusMode(false);
      setRefocusSelection([]);
    }
  }

  function resetSameState() {
    setGame((current) => resetFracturedGate(current));
    resetInteraction();
  }

  const display = displaySnapshot(game);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`${styles.shell} ${reducedMotion ? styles.reducedMotion : ""}`}
    >
      <header className={styles.prototypeHeader}>
        <div>
          <p className={styles.eyebrow}>
            BARCODE World · private Battle Mode proof
          </p>
          <h1>THE FRACTURED GATE</h1>
          <p>
            Observe → choose actions → preview → commit plans → watch the Action
            Phase → review the Aftermath
          </p>
        </div>
        <div className={styles.boundaryBadges} aria-label="Prototype boundary">
          <span>PRIVATE DEV ROUTE</span>
          <span>SOLO ONLY</span>
          <span>NONCANONICAL</span>
          <span>IN-MEMORY</span>
        </div>
      </header>

      <section className={styles.controlStrip} aria-label="Encounter controls">
        <label>
          <span>Ordered build</span>
          <select
            data-testid="build-select"
            value={game.buildId}
            onChange={(event) => {
              setGame(changeFracturedGateBuild(game, event.target.value));
              resetInteraction();
            }}
            disabled={game.phase === "resolution"}
          >
            {BUILDS.map((candidate: FracturedGateRecord) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <p>{build.identity}</p>
        <label className={styles.motionToggle}>
          <input
            data-testid="reduce-motion"
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />
          Reduce motion
        </label>
        <button
          type="button"
          data-testid="reset-encounter"
          className={styles.resetButton}
          onClick={resetSameState}
        >
          RESET SAME STATE
        </button>
      </section>

      <PhaseDirector
        game={game}
        guide={phaseGuide}
        opportunity={opportunity}
        onOpportunity={handleOpportunity}
      />

      <section className={styles.hud} aria-label="Battle status">
        <div>
          <span>Objective</span>
          <strong>Stabilize the Gate</strong>
        </div>
        <div>
          <span>Exchange · phase</span>
          <strong>
            {game.round} · {BATTLE_PHASES[phaseGuide.phaseIndex]}
          </strong>
        </div>
        <div>
          <span>Player Command</span>
          <strong>
            {availableCommand(game)} / {CORE_RULES.commandCap}
          </strong>
        </div>
        <div>
          <span>Enemy Squad Command</span>
          <strong>
            {availableEnemyCommand(game)} / {CORE_RULES.commandCap}
          </strong>
        </div>
        <div>
          <span>Condition · Guard</span>
          <strong>
            {display.condition} · {display.guard}
          </strong>
        </div>
        <div>
          <span>Major state</span>
          <strong>
            {display.majorState.name} · {titleCase(display.majorState.status)}
          </strong>
        </div>
        <div>
          <span>Gate Stability</span>
          <GatePips
            stability={display.gate.stability}
            status={display.gate.status}
          />
        </div>
        <div>
          <span>Primary pressure</span>
          <strong>
            {game.enemyPlan[0]?.posture ?? "Formation is reading the board"}
          </strong>
        </div>
      </section>

      {game.warning ? (
        <p className={styles.warning} role="alert">
          {game.warning}
        </p>
      ) : null}

      <ActionDock
        game={game}
        projection={activeProjection}
        actionIntent={actionIntent}
        opportunity={opportunity}
        onShortcut={handleShortcut}
        onOpportunity={handleOpportunity}
        onPass={handlePass}
      />

      <div className={styles.battleLayout}>
        <BattleBoard
          game={game}
          selectedFocus={selectedFocus}
          selectedParent={selectedParent}
          actionIntent={actionIntent}
          confirmedTarget={targetId}
          targetingChoice={targetingChoice}
          projection={activeProjection}
          opportunity={opportunity}
          onFocus={handleFocus}
          onShowMove={handleShowMove}
          onOpportunity={handleOpportunity}
        />
        <div className={styles.commandRail}>
          <ContextPanel
            game={game}
            focusId={selectedFocus}
            selectedParent={selectedParent}
            actionIntent={actionIntent}
            targetingChoice={targetingChoice}
            onParent={handleParent}
            onChoice={handleChoice}
            onCancelTarget={clearDraft}
            onCancelIntent={() => setActionIntent(null)}
          />
          {game.phase === "planning" ? (
            <PreviewPanel
              game={game}
              targetingChoice={targetingChoice}
              targetId={targetId}
              attachedCard={attachedCard}
              preview={preview}
              planProjection={planProjection}
              pivotMode={pivotMode}
              onAdd={addDraft}
            />
          ) : null}
        </div>
      </div>

      {game.phase === "planning" ? (
        <>
          <PlanChain
            game={game}
            projection={planProjection}
            pivotMode={pivotMode}
            onBeginPivot={() => {
              clearDraft();
              setActionIntent(null);
              setSelectedParent(null);
              setPivotMode(true);
            }}
            onCancelPivot={() => {
              clearDraft();
              setPivotMode(false);
            }}
            onPass={handlePass}
          />
          <Hand
            game={game}
            compatibleCards={compatibleCards}
            contextCards={contextCards}
            attachedCard={attachedCard}
            refocusMode={refocusMode}
            refocusSelection={refocusSelection}
            onCard={handleCard}
            onBeginRefocus={() => {
              clearDraft();
              setActionIntent(null);
              setRefocusMode(true);
            }}
            onCancelRefocus={() => {
              setRefocusMode(false);
              setRefocusSelection([]);
            }}
            onCommitRefocus={commitRefocus}
            onDiscard={(cardId) =>
              setGame((current) => discardToRetain(current, cardId))
            }
          />
        </>
      ) : null}

      {game.phase === "resolution" ? (
        <ResolutionPanel
          game={game}
          onAdvance={() => setGame((current) => advanceResolution(current))}
        />
      ) : null}

      {game.phase === "settle" ? (
        <AftermathPanel
          game={game}
          onContinue={() => {
            setGame((current) => settleRound(current));
            resetInteraction();
          }}
        />
      ) : null}

      {game.phase === "result" ? (
        <ResultsPanel game={game} onReset={resetSameState} />
      ) : null}

      <footer className={styles.prototypeFooter}>
        <p>
          Implementation evidence only. Automated checks cannot establish
          comprehension, balance, fun, accessibility, or replay value.
        </p>
        <p>
          No account, API, reward, progression, memory, queue, BNL, canon, or
          persistent-world connection.
        </p>
      </footer>
    </main>
  );
}
