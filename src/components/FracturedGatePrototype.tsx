"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "./FracturedGatePrototype.module.css";
import {
  BOARD_FOCUSES,
  BOARD_TILES,
  BUILDS,
  CARDS,
  actionSlotsUsed,
  advanceResolution,
  changeFracturedGateBuild,
  chooseResponse,
  createFracturedGateState,
  getActiveRouteFocuses,
  getBuildDefinition,
  getCompatibleCards,
  getContextActionGroups,
  getPositionCoordinates,
  getProjectedPosition,
  getReachableTiles,
  lockPlan,
  movementRemaining,
  movementSpent,
  previewAction,
  projectPlan,
  queueAction,
  queueMove,
  removePlanStep,
  resetFracturedGate,
  settleRound,
  type FracturedGateChoice,
  type FracturedGateState,
} from "@/lib/barcode-world/fractured-gate-engine.mjs";

const FOCUS_ORDER = [
  "west-exit",
  "cracked-divider",
  "upper-crossing",
  "powered-track",
  "trace-relay",
  "field-cache",
  "gate",
  "ram",
  "trace",
  "jammer",
];

const PHASES = [
  ["planning", "READ & PLAN"],
  ["response", "EARNED RESPONSE"],
  ["resolution", "RESOLVE"],
  ["settle", "SETTLE"],
  ["result", "RESULTS"],
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function cardName(cardId: string) {
  return CARDS[cardId]?.name ?? cardId;
}

function pointFor(game: FracturedGateState, focusId: string) {
  if (focusId === "player") return getPositionCoordinates(getProjectedPosition(game));
  if (game.enemies[focusId]) return getPositionCoordinates(game.enemies[focusId].position);
  return getPositionCoordinates(focusId);
}

function focusTile(game: FracturedGateState, focusId: string) {
  if (focusId === "player") return getProjectedPosition(game);
  if (game.enemies[focusId]) return game.enemies[focusId].position;
  return BOARD_FOCUSES[focusId]?.tileId ?? null;
}

function PhaseDirector({ game }: { game: FracturedGateState }) {
  const active = Math.max(0, PHASES.findIndex(([id]) => id === game.phase));
  const copy: Record<string, [string, string]> = {
    planning: ["Read the two visible enemy actions. Then build your turn.", "Movement can be split before, between, or after two actions."],
    response: ["Your setup created a real Response.", "Choose the sacrifice earned by the physical board state."],
    resolution: ["The locked plan is resolving.", "Watch the same deterministic causal chain used by Preview."],
    settle: ["The exchange is complete.", "Review what changed, replenish the hand, and continue."],
    result: ["The battle has a result.", "Check the turning point and tradeoff against the final board."],
  };
  return (
    <section className={styles.phaseDirector} aria-label="Current battle phase">
      <ol className={styles.phaseTrack}>
        {PHASES.map(([id, label], index) => (
          <li className={cx(index === active && styles.currentPhase, index < active && styles.completedPhase)} key={id}>
            <span>{index + 1}</span>{label}
          </li>
        ))}
      </ol>
      <div className={styles.nowPanel}>
        <b>NOW</b>
        <div><strong>{copy[game.phase][0]}</strong><p>{copy[game.phase][1]}</p></div>
      </div>
    </section>
  );
}

function EnemyPlan({ game }: { game: FracturedGateState }) {
  const { commitment, support, idle } = game.enemyIntent;
  return (
    <section className={styles.enemyPlan} aria-label="Visible enemy plan">
      <article className={styles.commitmentCard}>
        <header><span>PRIMARY COMMITMENT</span><b>{commitment.confidence}</b></header>
        <strong>{commitment.actor} · {commitment.label}</strong>
        <p>{commitment.text}</p>
        <small>{commitment.timing} · TARGET: {commitment.target}</small>
      </article>
      <article className={styles.supportCard}>
        <header><span>SUPPORT ACTION</span><b>{support.confidence}</b></header>
        <strong>{support.actor} · {support.label}</strong>
        <p>{support.text}</p>
        <small>{support.timing} · TARGET: {support.target}</small>
      </article>
      <article className={styles.idleCard}>
        <span>THIRD ENEMY</span>
        <strong>{idle.actor}</strong>
        <p>{idle.text}</p>
      </article>
    </section>
  );
}

function BattleBoard({
  game,
  selectedFocus,
  moveMode,
  onFocus,
  onMove,
}: {
  game: FracturedGateState;
  selectedFocus: string;
  moveMode: boolean;
  onFocus: (id: string) => void;
  onMove: (id: string) => void;
}) {
  const build = getBuildDefinition(game.buildId);
  const reachable = getReachableTiles(game);
  const routeFocuses = getActiveRouteFocuses(game);
  const projected = getProjectedPosition(game);
  const visibleFocuses = [...FOCUS_ORDER, ...routeFocuses];
  const planPath = useMemo(() => {
    const points = [game.position];
    for (const step of game.plan) {
      if (step.kind === "move" || step.kind === "context-move") {
        for (const id of step.path.slice(1)) points.push(id);
      }
    }
    return points.map((id) => {
      const point = getPositionCoordinates(id);
      return point.x + "," + point.y;
    }).join(" ");
  }, [game.plan, game.position]);
  const commitmentTarget = focusTile(game, game.enemyIntent.commitment.targetId);
  const supportTarget = focusTile(game, game.enemyIntent.support.targetId);
  const commitmentFrom = pointFor(game, game.enemyIntent.commitment.actorId);
  const commitmentTo = pointFor(game, game.enemyIntent.commitment.targetId);
  const supportFrom = pointFor(game, game.enemyIntent.support.actorId);
  const supportTo = pointFor(game, game.enemyIntent.support.targetId);

  return (
    <section className={styles.boardFrame}>
      <header className={styles.boardHeader}>
        <div><span>THE FRACTURED GATE</span><strong>BREACHFLOW / LIVE TACTICAL SPACE</strong></div>
        <div className={styles.boardCues}><span>◆ FREE MOVE</span><span>◇ TARGET</span><span>▰ CURRENT BUILD LINE</span></div>
      </header>
      <div className={styles.boardViewport}>
        <div className={cx(styles.board, moveMode && styles.movementMode)} aria-label="The Fractured Gate tactical board" role="group">
          <span className={cx(styles.zoneLabel, styles.upperLabel)}>UPPER WALK</span>
          <span className={cx(styles.zoneLabel, styles.lowerLabel)}>LOWER YARD</span>
          <span className={cx(styles.zoneLabel, styles.gateLabel)}>GATE PLATFORM</span>
          <span className={cx(styles.zoneLabel, styles.exitLabel)}>WEST EXIT</span>
          <svg className={styles.boardLines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="commitArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" className={styles.commitArrow} /></marker>
              <marker id="supportArrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" className={styles.supportArrow} /></marker>
            </defs>
            <path className={styles.powerTrackLine} d="M24 72 L51 72 L66 72 L74 62" vectorEffect="non-scaling-stroke" />
            {planPath && <polyline className={styles.planPath} points={planPath} vectorEffect="non-scaling-stroke" />}
            <line className={styles.commitmentLine} x1={commitmentFrom.x} y1={commitmentFrom.y} x2={commitmentTo.x} y2={commitmentTo.y} markerEnd="url(#commitArrow)" vectorEffect="non-scaling-stroke" />
            <line className={styles.supportLine} x1={supportFrom.x} y1={supportFrom.y} x2={supportTo.x} y2={supportTo.y} markerEnd="url(#supportArrow)" vectorEffect="non-scaling-stroke" />
          </svg>

          <div className={styles.tileLayer}>
            {Object.values(BOARD_TILES).map((tile) => {
              const legal = Boolean(reachable[tile.id]);
              const threatened = tile.id === commitmentTarget || tile.id === supportTarget;
              return (
                <button
                  type="button"
                  key={tile.id}
                  data-terrain={tile.terrain}
                  className={cx(styles.boardTile, styles["terrain_" + tile.terrain], legal && styles.legalTile, moveMode && legal && styles.freeMoveTile, selectedFocus === tile.id && styles.selectedTile, threatened && styles.threatenedTile)}
                  style={{ "--x": tile.boardX + "%", "--y": tile.boardY + "%" } as CSSProperties}
                  onClick={() => moveMode && legal ? onMove(tile.id) : onFocus(tile.id)}
                  aria-label={tile.name + (legal ? " · FREE movement destination" : "") + (threatened ? " · ENEMY PRESSURE" : "")}
                >
                  <span className={styles.tileDiamond} aria-hidden="true"><i /></span>
                  {moveMode && legal && <small className={styles.tileCost}>{reachable[tile.id].cost}</small>}
                </button>
              );
            })}
          </div>

          {visibleFocuses.map((focusId) => {
            const focus = BOARD_FOCUSES[focusId];
            if (!focus) return null;
            const enemy = game.enemies[focusId];
            const point = enemy ? getPositionCoordinates(enemy.position) : getPositionCoordinates(focusId);
            const buildSource = build.sourceFocusId === focusId;
            const route = focus.kind === "route";
            const objectStatus =
              focusId === "cracked-divider"
                ? game.divider.status === "breached"
                  ? "BREACHED · ROUTE OPEN"
                  : "CRACKED · LOAD BEARING"
                : focusId === "powered-track"
                  ? game.track.direction.toUpperCase() + "BOUND · " + (game.track.rewritten ? "REWRITTEN" : "POWERED")
                  : focusId === "field-cache"
                    ? game.cache.carried
                      ? "CARRIED"
                      : "OPTIONAL RECOVERY"
                    : focusId === "gate"
                      ? game.gate.locked
                        ? "LOCKED"
                        : game.gate.stability + "/3 STABILITY"
                      : null;
            const passThrough = moveMode && Boolean(reachable[focus.tileId]) && !enemy && !route;
            return (
              <button
                type="button"
                key={focusId}
                className={cx(styles.boardFocus, styles["focus_" + focus.kind], selectedFocus === focusId && styles.selectedFocus, buildSource && styles.buildSource, route && styles.routeFocus, focusId === "cracked-divider" && game.divider.status === "breached" && styles.breachedDivider, focusId === "field-cache" && game.cache.carried && styles.carryingCache, focusId === "gate" && game.gate.locked && styles.lockedGate, passThrough && styles.movementPassThrough)}
                style={{ "--x": point.x + "%", "--y": point.y + "%" } as CSSProperties}
                onClick={() => onFocus(focusId)}
                aria-label={focus.name + (enemy ? " · Condition " + enemy.condition + " · Guard " + enemy.guard : "") + (buildSource ? " · CURRENT BUILD LINE" : "")}
              >
                <span className={styles.markerGlyph} aria-hidden="true">{enemy ? focus.name.charAt(0) : route ? "↗" : focus.kind === "objective" ? "⌁" : focus.kind === "cache" ? "▣" : focus.kind === "exit" ? "←" : "◆"}</span>
                <span className={styles.markerLabel}>
                  <strong>{focus.name}</strong>
                  <small>{enemy ? "CND " + enemy.condition + " · GRD " + enemy.guard + " · " + enemy.status.toUpperCase() : route ? "ONE USE · MOVE" : objectStatus ?? focus.kind.toUpperCase()}</small>
                </span>
                {buildSource && <b className={styles.buildCue}>BUILD SOURCE</b>}
              </button>
            );
          })}

          <button
            type="button"
            className={cx(styles.playerPiece, selectedFocus === "player" && styles.selectedPiece)}
            style={{ "--x": getPositionCoordinates(game.position).x + "%", "--y": getPositionCoordinates(game.position).y + "%" } as CSSProperties}
            onClick={() => onFocus("player")}
            aria-label={"Player · Condition " + game.condition + " · Protection " + game.protection}
          >
            <span className={styles.playerCore}>01</span>
            <span className={styles.playerLabel}>PLAYER<small>CND {game.condition} · PRT {game.protection}</small></span>
          </button>
          {projected !== game.position && (
            <div className={styles.ghostPiece} style={{ "--x": getPositionCoordinates(projected).x + "%", "--y": getPositionCoordinates(projected).y + "%" } as CSSProperties}>
              <span>01</span><small>PROJECTED</small>
            </div>
          )}
          <div className={styles.intentLegend}><span>— COMMITMENT</span><span>-- SUPPORT</span><small>Declared targets · no hidden third attack</small></div>
        </div>
      </div>
    </section>
  );
}

function ContextPanel({
  game,
  selectedFocus,
  selectedChoice,
  selectedCard,
  moveMode,
  onMoveMode,
  onChoice,
  onCard,
  onAdd,
}: {
  game: FracturedGateState;
  selectedFocus: string;
  selectedChoice: FracturedGateChoice | null;
  selectedCard: string | null;
  moveMode: boolean;
  onMoveMode: () => void;
  onChoice: (choice: FracturedGateChoice) => void;
  onCard: (id: string | null) => void;
  onAdd: () => void;
}) {
  const focus = BOARD_FOCUSES[selectedFocus] ?? BOARD_TILES[selectedFocus] ?? { name: "Tactical space", kind: "position", description: "Select a board piece or object." };
  const groups = getContextActionGroups(game, selectedFocus);
  const compatible = selectedChoice ? getCompatibleCards(game, selectedChoice.id) : [];
  const preview = selectedChoice ? previewAction(game, selectedChoice.id, selectedChoice.targetId, selectedCard) : null;
  return (
    <section className={styles.contextPanel}>
      <header className={styles.contextHeader}><span>SELECTED · {String(focus.kind).toUpperCase()}</span><strong>{focus.name}</strong><p>{focus.description ?? focus.name}</p></header>
      {moveMode && <div className={styles.moveNotice}><span>MOVE RANGE ACTIVE</span><strong>Choose a green FREE tile on the board.</strong><p>Movement does not use an action slot and may be split.</p></div>}
      <div className={styles.actionGroups}>
        {groups.map((group) => (
          <div key={group.parent}>
            <span>{group.parent}</span>
            {group.choices.map((choice: FracturedGateChoice) => (
              <button type="button" key={choice.id + choice.targetId} className={selectedChoice?.id === choice.id ? styles.selectedAction : ""} disabled={!choice.legal} onClick={() => choice.moveMode ? onMoveMode() : onChoice(choice)}>
                <strong>{choice.label}</strong><small>{choice.legal ? choice.description : choice.reason}</small>
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <p className={styles.contextEmpty}>Select a visible piece, route, object, objective, exit, or your player.</p>}
      </div>
      {preview && (
        <div className={styles.previewPanel}>
          <header><span>CONFIRMED PREVIEW</span><b>#{preview.signature}</b></header>
          <strong>{preview.title}</strong>
          {!preview.legal ? <p className={styles.previewError}>{preview.reason}</p> : <><ul>{preview.expected.map((line: string) => <li key={line}>{line}</li>)}</ul><p className={styles.risk}><span>RISK</span>{preview.risk}</p></>}
          {compatible.length > 0 && (
            <div className={styles.compatibleCards}><span>OPTIONAL CARD · NO COST</span>{compatible.map((id: string) => <button type="button" key={id} className={selectedCard === id ? styles.selectedMiniCard : ""} onClick={() => onCard(selectedCard === id ? null : id)}>{cardName(id)}</button>)}</div>
          )}
          <button type="button" className={styles.addButton} disabled={!preview.legal} onClick={onAdd}>ADD TO PLAN</button>
        </div>
      )}
    </section>
  );
}

function PlanTray({ game, onRemove, onLock }: { game: FracturedGateState; onRemove: (id: string) => void; onLock: () => void }) {
  const projection = projectPlan(game);
  return (
    <section className={styles.planTray}>
      <header><div><span>PLAN TRAY</span><strong>{movementSpent(game)}/6 movement · {actionSlotsUsed(game)}/2 actions</strong></div><b>PREVIEW #{projection.signature}</b></header>
      <ol className={styles.planChain}>
        {game.plan.map((step: FracturedGateChoice, index: number) => (
          <li key={step.instanceId}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.label}</strong><small>{step.kind === "action" ? "ACTION" : step.movement + " MOVEMENT"} · {step.timing}{step.cardId ? " · " + cardName(step.cardId) : ""}</small></div><button type="button" onClick={() => onRemove(step.instanceId)} aria-label={"Remove " + step.label + " and dependent steps"}>REMOVE</button></li>
        ))}
        {!game.plan.length && <li className={styles.emptyPlan}><span>00</span><div><strong>No player steps planned.</strong><small>The visible enemy plan will still resolve.</small></div></li>}
      </ol>
      <div className={styles.planForecast}><div><span>EXPECTED</span><ul>{projection.expected.slice(0, 4).map((line: string) => <li key={line}>{line}</li>)}</ul></div><p><span>MAIN RISK</span>{projection.risk}</p></div>
      <button type="button" className={styles.lockButton} onClick={onLock}>LOCK PLAN</button>
    </section>
  );
}

function Hand({ game }: { game: FracturedGateState }) {
  const planned = new Set(game.plan.map((step: FracturedGateChoice) => step.cardId).filter(Boolean));
  return (
    <section className={styles.handPanel}>
      <header><div><span>PREPARED HAND · FIVE VISIBLE CARDS</span><strong>Cards vary a decision. They never unlock the build.</strong></div><b>DECK {game.deck.length} · DISCARD {game.discard.length}</b></header>
      <div className={styles.cards}>{game.hand.map((id: string) => <article className={cx(styles.card, planned.has(id) && styles.plannedCard)} key={id}><header><span>{CARDS[id].kind}</span>{planned.has(id) && <b>PLANNED</b>}</header><strong>{CARDS[id].name}</strong><p>{CARDS[id].text}</p><small>NO COST · OPTIONAL MODIFIER</small></article>)}</div>
    </section>
  );
}

function ResponsePanel({ game, onChoose }: { game: FracturedGateState; onChoose: (id: string) => void }) {
  if (!game.response) return null;
  return <section className={styles.responsePanel} aria-live="assertive"><b>EARNED RESPONSE</b><span>CONTACT PAUSED · NO ACTION SLOT OR CARD REQUIRED</span><h2>{game.response.title}</h2><p>{game.response.text}</p><div>{game.response.options.map((option: FracturedGateChoice) => <button type="button" key={option.id} onClick={() => onChoose(option.id)}><strong>{option.label}</strong><small>{option.text}</small></button>)}</div></section>;
}

function ResolutionPanel({ game, reducedMotion, onAdvance }: { game: FracturedGateState; reducedMotion: boolean; onAdvance: () => void }) {
  const resolution = game.resolution;
  if (!resolution) return null;
  const current = resolution.cursor >= 0 ? resolution.events[resolution.cursor] : null;
  return (
    <section className={styles.resolutionPanel} aria-live="polite">
      <header><div><span>DETERMINISTIC RESOLUTION</span><strong>LOCKED #{resolution.signature}</strong></div><b>{Math.max(0, resolution.cursor + 1)} / {resolution.events.length}</b></header>
      <div className={styles.timingRail}>{["YOU ACT FIRST", "CONTACT", "ENEMY ACTS FIRST"].map((timing) => <span className={current?.timing === timing ? styles.activeTiming : ""} key={timing}>{timing}</span>)}</div>
      <article className={styles.currentEvent}><span>{current ? current.actor + " · " + current.timing : "PLANS LOCKED"}</span><strong>{current?.title ?? "Resolution ready."}</strong><p>{current?.detail ?? "The board will advance through every visible causal event."}</p></article>
      <ol className={styles.eventList}>{resolution.events.map((event: FracturedGateChoice, index: number) => <li className={cx(index === resolution.cursor && styles.currentEventRow, index < resolution.cursor && styles.pastEventRow)} key={event.id}><span>{event.timing}</span><strong>{event.title}</strong></li>)}</ol>
      <button type="button" className={styles.advanceButton} onClick={onAdvance}>{reducedMotion ? "RESOLVE NEXT EVENT" : "ADVANCE NOW"}</button>
      {!reducedMotion && <small>Auto-advancing · enable Reduce motion for manual control.</small>}
    </section>
  );
}

function ReviewLog({ game }: { game: FracturedGateState }) {
  return <details className={styles.reviewLog}><summary>Review exact causal log</summary><ol>{game.review.map((event: FracturedGateChoice, index: number) => <li key={event.round + "-" + index}><span>TURN {event.round} · {event.timing}</span><strong>{event.actor} · {event.title}</strong><p>{event.detail}</p></li>)}</ol></details>;
}

function SettlePanel({ game, onSettle }: { game: FracturedGateState; onSettle: () => void }) {
  return <section className={styles.settlePanel}><span>EXCHANGE RESOLVED</span><h2>Settle the board.</h2><div className={styles.settleGrid}><div><span>GATE</span><strong>{game.gate.stability}/3 STABILITY</strong></div><div><span>PLAYER</span><strong>CND {game.condition} · PRT {game.protection}</strong></div><div><span>DIVIDER</span><strong>{game.divider.status.toUpperCase()}</strong></div><div><span>CACHE</span><strong>{game.cache.carried ? "CARRIED" : "UNRECOVERED"}</strong></div></div><ReviewLog game={game} /><button type="button" className={styles.settleButton} onClick={onSettle}>SETTLE TURN</button></section>;
}

function ResultsPanel({ game, onReset }: { game: FracturedGateState; onReset: () => void }) {
  const result = game.result;
  if (!result) return null;
  return (
    <section className={styles.resultsPanel}>
      <span>BATTLE RESULT</span><h2>{result.type}</h2><p className={styles.resultReason}>{result.reason}</p>
      <div className={styles.resultGrid}><div><span>OBJECTIVE</span><strong>{result.objective}</strong></div><div><span>PLAYER</span><strong>{result.player}</strong></div><div><span>FIELD CACHE</span><strong>{result.cache}</strong></div><div><span>LOCATION</span><strong>{result.location}</strong></div></div>
      <div className={styles.enemyResults}>{result.enemies.map((enemy: FracturedGateChoice) => <div key={enemy.name}><span>{enemy.name}</span><strong>{enemy.status.toUpperCase()}</strong><small>CONDITION {enemy.condition}</small></div>)}</div>
      <article className={styles.turningPoint}><span>TURNING POINT</span><strong>{result.turningPoint}</strong></article>
      <article className={styles.tradeoff}><span>TRADEOFF</span><strong>{result.tradeoff}</strong></article>
      <ReviewLog game={game} /><button type="button" className={styles.resetResultButton} onClick={onReset}>RESET SAME INITIAL STATE</button>
    </section>
  );
}

export function FracturedGatePrototype() {
  const [game, setGame] = useState<FracturedGateState>(() => createFracturedGateState());
  const [selectedFocus, setSelectedFocus] = useState("player");
  const [selectedChoice, setSelectedChoice] = useState<FracturedGateChoice | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (game.phase !== "resolution" || reducedMotion || !game.resolution || game.resolution.cursor >= game.resolution.events.length - 1) return;
    const timer = window.setTimeout(() => setGame((current) => advanceResolution(current)), 1050);
    return () => window.clearTimeout(timer);
  }, [game.phase, game.resolution, reducedMotion]);

  useEffect(() => {
    setSelectedChoice(null);
    setSelectedCard(null);
    setMoveMode(false);
    if (game.phase === "planning") setSelectedFocus("player");
  }, [game.phase, game.round]);

  function selectFocus(id: string) {
    setSelectedFocus(id);
    setSelectedChoice(null);
    setSelectedCard(null);
    setMoveMode(false);
  }

  function reset() {
    setGame((current) => resetFracturedGate(current));
    selectFocus("player");
  }

  const build = getBuildDefinition(game.buildId);
  return (
    <main className={cx(styles.shell, reducedMotion && styles.reducedMotion)}>
      <header className={styles.prototypeHeader}>
        <div><span>BARCODE WORLD · BATTLE MODE PROOF</span><h1>THE FRACTURED GATE</h1><p>Breachflow prototype · one tactical board · one visible Commitment + one support action</p></div>
        <div className={styles.boundaryBadges}><span>PRIVATE</span><span>SOLO</span><span>RESETTABLE</span><span>NONCANONICAL</span><span>IN MEMORY</span></div>
      </header>
      <section className={styles.testShell}>
        <label><span>ORDERED BUILD</span><select value={game.buildId} disabled={game.phase !== "planning" || game.round !== 1 || game.plan.length > 0} onChange={(event) => setGame((current) => changeFracturedGateBuild(current, event.target.value))}>{BUILDS.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
        <div><span>TEST SEED</span><strong>{game.seed}</strong></div>
        <label className={styles.motionToggle}><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /><span>Reduce motion</span></label>
        <button type="button" className={styles.resetButton} onClick={reset}>RESET</button>
      </section>
      <PhaseDirector game={game} />
      <section className={styles.hud}>
        <div><span>OBJECTIVE</span><strong>LOCK THE FRACTURED GATE</strong></div>
        <div><span>TURN</span><strong>{String(game.round).padStart(2, "0")}</strong></div>
        <div><span>MOVEMENT</span><div className={styles.movementPips} aria-label={movementRemaining(game) + " of 6 movement pips remain"}>{Array.from({ length: 6 }, (_, index) => <i className={index < movementRemaining(game) ? styles.livePip : styles.spentPip} key={index} />)}</div></div>
        <div><span>ACTIONS</span><div className={styles.actionSlots} aria-label={actionSlotsUsed(game) + " of 2 action slots planned"}>{Array.from({ length: 2 }, (_, index) => <i className={index < actionSlotsUsed(game) ? styles.filledSlot : styles.openSlot} key={index}>{index < actionSlotsUsed(game) ? "SET" : "OPEN"}</i>)}</div></div>
        <div><span>PLAYER</span><strong>CND {game.condition} · PRT {game.protection}</strong></div>
        <div><span>GATE STABILITY</span><div className={styles.gatePips} aria-label={"Gate Stability " + game.gate.stability + " of 3"}>{Array.from({ length: 3 }, (_, index) => <i className={index < game.gate.stability ? styles.livePip : styles.spentPip} key={index} />)}</div></div>
      </section>
      <EnemyPlan game={game} />
      <section className={styles.buildLine}><div><span>CURRENT BUILD LINE</span><strong>{build.name}</strong></div><p>{build.line}</p><small>SOURCE: {build.sourceLabel} · Guaranteed outside the hand</small></section>
      {game.warning && <p className={styles.warning} role="alert">{game.warning}</p>}

      <section className={styles.battleLayout}>
        <div className={styles.boardColumn}>
          <BattleBoard game={game} selectedFocus={selectedFocus} moveMode={moveMode} onFocus={selectFocus} onMove={(destination) => { setGame(queueMove(game, destination)); selectFocus("player"); }} />
          <section className={styles.equipmentStrip}>
            <div><span>WEAPON</span><strong>NEEDLE CARBINE</strong><small>Strike · guaranteed</small></div>
            <div><span>PROTECTION</span><strong>BARRIER MESH</strong><small>Guard Position · guaranteed</small></div>
            <div><span>RIG</span><strong>FIELD RIG</strong><small>Stabilize · guaranteed</small></div>
            <div><span>BUILD</span><strong>{build.short}</strong><small>Source-bound · outside hand</small></div>
          </section>
        </div>
        <aside className={styles.commandRail}>
          {game.phase === "planning" && <ContextPanel game={game} selectedFocus={selectedFocus} selectedChoice={selectedChoice} selectedCard={selectedCard} moveMode={moveMode} onMoveMode={() => { setMoveMode(true); setSelectedChoice(null); setSelectedCard(null); }} onChoice={(choice) => { setSelectedChoice(choice); setSelectedCard(null); setMoveMode(false); }} onCard={setSelectedCard} onAdd={() => { if (!selectedChoice) return; setGame(queueAction(game, selectedChoice.id, selectedChoice.targetId, selectedCard)); setSelectedChoice(null); setSelectedCard(null); }} />}
          {game.phase === "response" && <ResponsePanel game={game} onChoose={(id) => setGame((current) => chooseResponse(current, id))} />}
          {game.phase === "resolution" && <ResolutionPanel game={game} reducedMotion={reducedMotion} onAdvance={() => setGame((current) => advanceResolution(current))} />}
          {game.phase === "settle" && <SettlePanel game={game} onSettle={() => setGame((current) => settleRound(current))} />}
          {game.phase === "result" && <ResultsPanel game={game} onReset={reset} />}
        </aside>
      </section>
      {game.phase === "planning" && <><PlanTray game={game} onRemove={(id) => setGame((current) => removePlanStep(current, id))} onLock={() => setGame((current) => lockPlan(current))} /><Hand game={game} /></>}
      {game.phase !== "planning" && game.phase !== "result" && game.review.length > 0 && <section className={styles.reviewOutside}><ReviewLog game={game} /></section>}
      <footer className={styles.prototypeFooter}><p>Current position: <strong>{game.position}</strong> · Projected: <strong>{getProjectedPosition(game)}</strong></p><p>This prototype writes to no account, progression, inventory, reward, canon, shared history, queue, BNL, Memory, Journal, or live system.</p></footer>
    </main>
  );
}
