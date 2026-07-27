"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  BOARD_FOCUSES,
  BUILDS,
  CARDS,
  CORE_RULES,
  advanceResolution,
  availableCommand,
  changeFracturedGateBuild,
  createFracturedGateState,
  discardToRetain,
  displaySnapshot,
  getCompatibleCards,
  getContextActionGroups,
  getPositionCoordinates,
  lockPlan,
  paidActionCount,
  previewAction,
  projectPlan,
  queueAction,
  refocusCards,
  removePlanAction,
  reorderPlanAction,
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
  "entry",
  "lower-cover",
  "lower-yard",
  "assault",
  "impact-rush",
  "cracked-divider",
  "upper-walk",
  "field-cache",
  "service-gap",
  "gate-actuator",
  "gate-platform",
  "gate",
];

const LANE_NAMES = ["Fast", "Standard", "Slow"];

function buildFor(buildId: string) {
  return BUILDS.find((build: FracturedGateRecord) => build.id === buildId) ??
    BUILDS[0];
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

function focusStatus(
  focusId: string,
  snapshot: FracturedGateRecord,
) {
  switch (focusId) {
    case "player":
      return `${snapshot.condition} Condition · ${snapshot.guard} Guard`;
    case "assault":
      return `${titleCase(snapshot.enemy.status)} · ${snapshot.enemy.condition} Condition`;
    case "impact-rush":
      return snapshot.flags.rushBlocked
        ? "Confirmed · projected blocked"
        : "Confirmed · Gate −1 Stability";
    case "cracked-divider":
    case "breach":
      return titleCase(snapshot.divider.status);
    case "gate-actuator":
      return snapshot.actuator.controlled
        ? `${titleCase(snapshot.actuator.mode)} Control active`
        : "Idle · local access";
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
      return snapshot.lift.deployed ? "Deployed until Settle" : "Projected";
    case "regulator":
      return titleCase(snapshot.enemy.regulator);
    default:
      return BOARD_FOCUSES[focusId]?.kind ?? "";
  }
}

function phaseLabel(game: FracturedGateState) {
  if (game.phase === "resolution") {
    const index = game.resolution?.visibleLaneIndex ?? -1;
    return index >= 0 ? `${LANE_NAMES[index]} resolution` : "Plan locked";
  }
  if (game.phase === "settle") return "Settle";
  if (game.phase === "result") return "Results";
  return "Planning";
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
  targetingChoice,
  projection,
  onFocus,
}: {
  game: FracturedGateState;
  selectedFocus: string;
  targetingChoice: FracturedGateChoice | null;
  projection: FracturedGateRecord | null;
  onFocus: (focusId: string) => void;
}) {
  const snapshot = displaySnapshot(game);
  const legalTargets = new Set<string>(
    (targetingChoice?.legalTargets ?? []) as string[],
  );
  const visible = new Set(CORE_FOCUS_ORDER);
  const projectedSnapshot = projection?.finalSnapshot ?? snapshot;

  if (
    projectedSnapshot.divider.status === "breached" ||
    snapshot.divider.status === "breached"
  ) {
    visible.add("breach");
  }
  if (
    projectedSnapshot.upperRoute.prepared ||
    snapshot.upperRoute.prepared
  ) {
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
    projectedSnapshot.enemy.regulator === "exposed" ||
    snapshot.enemy.regulator === "exposed"
  ) {
    visible.add("regulator");
  }
  for (const focusId of legalTargets) visible.add(focusId);

  const playerPosition = getPositionCoordinates(snapshot.position);
  const ghostPosition = projection?.ghostPosition
    ? getPositionCoordinates(projection.ghostPosition)
    : null;
  const pathPoints = (projection?.movementPath ?? [])
    .map((positionId: string) => getPositionCoordinates(positionId))
    .map((point: { x: number; y: number }) => `${point.x * 10},${point.y * 6.2}`)
    .join(" ");

  const boardFocuses = [...visible]
    .filter((focusId) => BOARD_FOCUSES[focusId])
    .filter((focusId) => focusId !== "player");

  return (
    <section
      className={styles.board}
      aria-label="The Fractured Gate tactical board"
      data-testid="fractured-gate-board"
    >
      <svg
        className={styles.boardArt}
        viewBox="0 0 1000 620"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="yard-fill" x1="0" x2="1">
            <stop offset="0" stopColor="#101a22" />
            <stop offset="1" stopColor="#192630" />
          </linearGradient>
          <linearGradient id="walk-fill" x1="0" x2="1">
            <stop offset="0" stopColor="#1a262c" />
            <stop offset="1" stopColor="#23343b" />
          </linearGradient>
          <linearGradient id="gate-fill" x1="0" x2="1">
            <stop offset="0" stopColor="#17252d" />
            <stop offset="1" stopColor="#203d42" />
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

        <rect width="1000" height="620" fill="#070b10" />
        <path
          d="M70 350 L210 335 L510 315 L790 300 L925 275 L930 500 L710 520 L420 500 L130 475 Z"
          fill="url(#yard-fill)"
          stroke="#334752"
          strokeWidth="3"
        />
        <path
          d="M170 175 L430 105 L665 135 L775 215 L650 250 L435 220 L245 260 Z"
          fill="url(#walk-fill)"
          stroke="#50636a"
          strokeWidth="3"
        />
        <path
          d="M720 250 L930 220 L975 430 L760 470 L685 395 Z"
          fill="url(#gate-fill)"
          stroke="#3a7774"
          strokeWidth="4"
        />
        <path
          d="M210 335 L245 260 M250 360 L300 245 M295 380 L350 230"
          stroke="#56666d"
          strokeWidth="9"
          opacity="0.75"
        />
        <path
          d="M505 315 L585 395 L650 360 L585 290 Z"
          fill="#2c2525"
          stroke="#9d6759"
          strokeWidth="4"
          strokeDasharray="14 8"
        />
        <path
          d="M565 220 L650 250 L690 330"
          fill="none"
          stroke="#53656d"
          strokeWidth="5"
          strokeDasharray="10 12"
        />
        <path
          d="M585 405 L630 485 L710 470 L680 390 Z"
          fill="#111a20"
          stroke="#4edfff"
          strokeWidth="3"
          opacity="0.7"
        />
        <path
          d="M515 348 C 610 320, 710 300, 870 285"
          fill="none"
          stroke="#ff8a5c"
          strokeWidth="8"
          strokeDasharray="20 13"
          markerEnd="url(#intent-arrow)"
          opacity={
            snapshot.enemy.status === "active" ||
            snapshot.enemy.status === "staggered" ||
            snapshot.enemy.status === "pinned"
              ? 0.9
              : 0.22
          }
        />
        <circle
          cx="875"
          cy="285"
          r="38"
          fill="none"
          stroke="#ff8a5c"
          strokeWidth="4"
          opacity="0.6"
        />
        <path
          d="M930 220 L970 205 L990 420 L975 430"
          fill="none"
          stroke={snapshot.gate.status === "failed" ? "#ff6474" : "#52ff9b"}
          strokeWidth="11"
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
        {projection?.collision ? (
          <g
            transform={
              projection.collision === "cracked-divider"
                ? "translate(590 395)"
                : "translate(510 345)"
            }
            className={styles.collisionMark}
          >
            <path
              d="M-24 0 L-7 -7 L0 -27 L8 -8 L28 0 L8 8 L0 28 L-8 8 Z"
              fill="#ffc857"
            />
            <circle r="42" fill="none" stroke="#ffc857" strokeWidth="3" />
          </g>
        ) : null}
        <text x="320" y="450" className={styles.areaLabel}>
          LOWER YARD
        </text>
        <text x="320" y="145" className={styles.areaLabel}>
          UPPER WALK
        </text>
        <text x="760" y="420" className={styles.areaLabel}>
          GATE PLATFORM
        </text>
      </svg>

      <button
        type="button"
        className={`${styles.playerPiece} ${
          selectedFocus === "player" ? styles.selectedPiece : ""
        } ${legalTargets.has("player") ? styles.legalTarget : ""}`}
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
        const selected = selectedFocus === focusId;
        const target = legalTargets.has(focusId);
        const enemyInactive =
          focusId === "assault" &&
          !["active", "staggered", "pinned"].includes(snapshot.enemy.status);
        const classNames = [
          styles.boardFocus,
          styles[`focus_${focus.kind}`],
          selected ? styles.selectedFocus : "",
          target ? styles.legalTarget : "",
          enemyInactive ? styles.inactiveFocus : "",
          ["breach", "upper-route", "service-route", "service-lift", "regulator"].includes(
            focusId,
          )
            ? styles.projectedFocus
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            type="button"
            key={focusId}
            className={classNames}
            style={
              {
                "--x": `${focus.x}%`,
                "--y": `${focus.y}%`,
              } as PositionedStyle
            }
            onClick={() => onFocus(focusId)}
            aria-pressed={selected}
            aria-label={`${focus.name}. ${focusStatus(focusId, projectedSnapshot)}`}
            data-focus-id={focusId}
          >
            {target ? <span className={styles.targetCue}>TARGET</span> : null}
            <strong>{focus.name}</strong>
            <small>{focusStatus(focusId, projectedSnapshot)}</small>
          </button>
        );
      })}

      <div className={styles.intentLegend} aria-hidden="true">
        <span>CONFIRMED</span>
        Impact Rush → Gate
      </div>

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
    </section>
  );
}

function ContextPanel({
  game,
  focusId,
  selectedParent,
  targetingChoice,
  onParent,
  onChoice,
  onCancelTarget,
}: {
  game: FracturedGateState;
  focusId: string;
  selectedParent: string | null;
  targetingChoice: FracturedGateChoice | null;
  onParent: (parent: string) => void;
  onChoice: (choice: FracturedGateChoice) => void;
  onCancelTarget: () => void;
}) {
  const groups = getContextActionGroups(game, focusId);
  const focus = BOARD_FOCUSES[focusId] ?? BOARD_FOCUSES.player;
  const activeGroup =
    groups.find((group: FracturedGateRecord) => group.parent === selectedParent) ??
    null;

  return (
    <aside className={styles.contextPanel} aria-label="Context actions">
      <p className={styles.eyebrow}>Selected · {focus.kind}</p>
      <h2>{focus.name}</h2>
      <p className={styles.contextDescription}>{focus.description}</p>

      {targetingChoice ? (
        <div className={styles.targetingNotice} role="status">
          <span>Choose target</span>
          <strong>{targetingChoice.label}</strong>
          <p>Select a dashed TARGET directly on the board.</p>
          <button type="button" onClick={onCancelTarget}>
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
              Choose one parent action. Legal mechanics appear only when this
              selection makes them relevant.
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
  onAdd,
}: {
  game: FracturedGateState;
  targetingChoice: FracturedGateChoice | null;
  targetId: string | null;
  attachedCard: string | null;
  preview: FracturedGateRecord | null;
  planProjection: FracturedGateRecord | null;
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
            {targetingChoice.cost + (attachedCard ? CARDS[attachedCard].cost : 0)}{" "}
            Command
            {attachedCard ? ` · ${cardName(attachedCard)}` : ""}
          </span>
          <button type="button" data-testid="add-to-plan" onClick={onAdd}>
            ADD TO PLAN
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
  onRemove,
  onReorder,
  onLock,
}: {
  game: FracturedGateState;
  projection: FracturedGateRecord | null;
  onRemove: (instanceId: string) => void;
  onReorder: (instanceId: string, direction: number) => void;
  onLock: () => void;
}) {
  const count = paidActionCount(game);
  const density =
    count <= 2 ? "Normal" : count === 3 ? "Pressured" : "Exceptional";
  return (
    <section className={styles.planPanel} aria-label="Current plan">
      <div className={styles.planTopline}>
        <div>
          <p className={styles.eyebrow}>Readable plan chain</p>
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
          {game.plan.map((action: FracturedGateRecord, index: number) => (
            <li key={action.instanceId}>
              <span className={styles.planTiming}>{action.lane}</span>
              <strong>{action.label}</strong>
              <small>
                {action.targetName} · {action.totalCost} Command
                {action.cardName ? ` · ${action.cardName}` : ""}
              </small>
              <div className={styles.planEdit}>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onReorder(action.instanceId, -1)}
                  aria-label={`Move ${action.label} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === game.plan.length - 1}
                  onClick={() => onReorder(action.instanceId, 1)}
                  aria-label={`Move ${action.label} later`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(action.instanceId)}
                  aria-label={`Remove ${action.label}`}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.emptyPlan}>
          No large empty slots. Add only the actions your plan needs.
        </p>
      )}

      <div className={styles.lockBar}>
        <span>
          {projection
            ? `Preview #${projection.signature}`
            : "Preview updates before Lock"}
        </span>
        <button
          type="button"
          data-testid="lock-plan"
          onClick={onLock}
          disabled={!game.plan.length && !game.refocusRecord}
        >
          LOCK PLAN
        </button>
      </div>
    </section>
  );
}

function Hand({
  game,
  compatibleCards,
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
    game.plan.map((action: FracturedGateRecord) => action.cardId).filter(Boolean),
  );
  const overRetain = game.hand.length > CORE_RULES.retainLimit;
  return (
    <section className={styles.handPanel} aria-label="Prepared card hand">
      <div className={styles.handHeading}>
        <div>
          <p className={styles.eyebrow}>Prepared hand</p>
          <h2>
            {game.hand.length} CARDS · DECK {game.deck.length - game.drawIndex} ·
            DISCARD {game.discard.length}
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
        {game.hand.map((cardId: string) => {
          const card = CARDS[cardId];
          const compatible = compatibleCards.has(cardId);
          const planned = plannedCards.has(cardId);
          const selected = attachedCard === cardId;
          const refocusSelected = refocusSelection.includes(cardId);
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
              onClick={() => (overRetain ? onDiscard(cardId) : onCard(cardId))}
              disabled={planned && !overRetain}
              aria-pressed={selected || refocusSelected}
            >
              <span className={styles.cardTop}>
                <strong>{card.name}</strong>
                <small>{card.cost}</small>
              </span>
              <span className={styles.cardKind}>{card.kind}</span>
              <p>{card.text}</p>
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
          <h2>{packet ? "Watch the board change." : "Resolution is ready."}</h2>
        </div>
        <button
          type="button"
          data-testid="advance-resolution"
          onClick={onAdvance}
        >
          {index < 2 ? "ADVANCE NOW" : "FINISH RESOLUTION"}
        </button>
      </div>
      {packet ? (
        <ul className={styles.packetEvents}>
          {packet.events.length ? (
            packet.events.map((event: FracturedGateRecord, eventIndex: number) => (
              <li key={`${event.instanceId}-${eventIndex}`}>
                <strong>{event.title}</strong>
                <span>{event.detail}</span>
              </li>
            ))
          ) : (
            <li>
              <strong>No action in this lane</strong>
              <span>The lane remains visible; nothing is silently skipped.</span>
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

function SettlePanel({
  game,
  onSettle,
}: {
  game: FracturedGateState;
  onSettle: () => void;
}) {
  const summary = game.settleSummary;
  return (
    <section className={styles.settlePanel}>
      <div className={styles.settleHeading}>
        <div>
          <p className={styles.eyebrow}>Round settled</p>
          <h2>Read the consequence, then continue.</h2>
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
          <dt>Assault</dt>
          <dd>{titleCase(summary.enemyStatus)}</dd>
        </div>
        <div>
          <dt>Divider</dt>
          <dd>{titleCase(summary.dividerStatus)}</dd>
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
          <dt>Refund at Settle</dt>
          <dd>{summary.refunds}</dd>
        </div>
      </dl>
      <ReviewLog game={game} />
      <button
        type="button"
        data-testid="settle-round"
        className={styles.primaryButton}
        onClick={onSettle}
      >
        SETTLE
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
          <span>Enemy state</span>
          <strong>{result.enemy}</strong>
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
  const [targetingChoice, setTargetingChoice] =
    useState<FracturedGateChoice | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [attachedCard, setAttachedCard] = useState<string | null>(null);
  const [refocusMode, setRefocusMode] = useState(false);
  const [refocusSelection, setRefocusSelection] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (game.phase !== "resolution" || reducedMotion) return;
    const timer = window.setTimeout(
      () => setGame((current) => advanceResolution(current)),
      1100,
    );
    return () => window.clearTimeout(timer);
  }, [
    game.phase,
    game.resolution?.visibleLaneIndex,
    reducedMotion,
  ]);

  const planProjection = useMemo(
    () => (game.plan.length ? projectPlan(game) : null),
    [game],
  );
  const preview = useMemo(
    () =>
      targetingChoice && targetId
        ? previewAction(game, targetingChoice.id, targetId, attachedCard)
        : null,
    [game, targetingChoice, targetId, attachedCard],
  );
  const activeProjection =
    preview?.legal ? preview.projection : planProjection;
  const compatibleCards = useMemo(
    () =>
      new Set(
        targetingChoice
          ? getCompatibleCards(game, targetingChoice.id)
          : [],
      ),
    [game, targetingChoice],
  );
  const build = buildFor(game.buildId);

  function clearDraft() {
    setTargetingChoice(null);
    setTargetId(null);
    setAttachedCard(null);
  }

  function resetInteraction() {
    setSelectedFocus("player");
    setSelectedParent(null);
    clearDraft();
    setRefocusMode(false);
    setRefocusSelection([]);
  }

  function handleFocus(focusId: string) {
    if (
      game.phase === "planning" &&
      targetingChoice?.legalTargets.includes(focusId)
    ) {
      setTargetId(focusId);
      return;
    }
    setSelectedFocus(focusId);
    setSelectedParent(game.phase === "planning" ? null : "Inspect");
    clearDraft();
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
    const next = queueAction(
      game,
      targetingChoice.id,
      targetId,
      attachedCard,
    );
    setGame(next);
    if (next.plan.length > game.plan.length) {
      clearDraft();
      setSelectedParent(null);
    }
  }

  function handleCard(cardId: string) {
    if (refocusMode) {
      if (game.plan.some((action: FracturedGateRecord) => action.cardId === cardId)) {
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
      className={`${styles.shell} ${
        reducedMotion ? styles.reducedMotion : ""
      }`}
    >
      <header className={styles.prototypeHeader}>
        <div>
          <p className={styles.eyebrow}>
            BARCODE World · private Battle Mode proof
          </p>
          <h1>THE FRACTURED GATE</h1>
          <p>
            Select → choose → target → preview → plan → lock → watch → settle
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

      <section className={styles.hud} aria-label="Battle status">
        <div>
          <span>Objective</span>
          <strong>Stabilize the Gate</strong>
        </div>
        <div>
          <span>Round · phase</span>
          <strong>
            {game.round} · {phaseLabel(game)}
          </strong>
        </div>
        <div>
          <span>Command</span>
          <strong>
            {availableCommand(game)} / {CORE_RULES.commandCap}
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
      </section>

      {game.warning ? (
        <p className={styles.warning} role="alert">
          {game.warning}
        </p>
      ) : null}

      <div className={styles.battleLayout}>
        <BattleBoard
          game={game}
          selectedFocus={selectedFocus}
          targetingChoice={targetingChoice}
          projection={activeProjection}
          onFocus={handleFocus}
        />
        <ContextPanel
          game={game}
          focusId={selectedFocus}
          selectedParent={selectedParent}
          targetingChoice={targetingChoice}
          onParent={setSelectedParent}
          onChoice={handleChoice}
          onCancelTarget={clearDraft}
        />
      </div>

      {game.phase === "planning" ? (
        <>
          <PreviewPanel
            game={game}
            targetingChoice={targetingChoice}
            targetId={targetId}
            attachedCard={attachedCard}
            preview={preview}
            planProjection={planProjection}
            onAdd={addDraft}
          />
          <PlanChain
            game={game}
            projection={planProjection}
            onRemove={(instanceId) =>
              setGame((current) => removePlanAction(current, instanceId))
            }
            onReorder={(instanceId, direction) =>
              setGame((current) =>
                reorderPlanAction(current, instanceId, direction),
              )
            }
            onLock={() => {
              clearDraft();
              setGame((current) => lockPlan(current));
            }}
          />
          <Hand
            game={game}
            compatibleCards={compatibleCards}
            attachedCard={attachedCard}
            refocusMode={refocusMode}
            refocusSelection={refocusSelection}
            onCard={handleCard}
            onBeginRefocus={() => {
              clearDraft();
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
          onAdvance={() =>
            setGame((current) => advanceResolution(current))
          }
        />
      ) : null}

      {game.phase === "settle" ? (
        <SettlePanel
          game={game}
          onSettle={() => {
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
