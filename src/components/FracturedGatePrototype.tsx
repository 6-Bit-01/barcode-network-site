"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  DIRECTOR_CARDS,
  DIRECTOR_OBJECTS,
  DIRECTOR_TILES,
  advanceDirectorEnemyTurn,
  beginDirectorEnemyTurn,
  createDirectorState,
  getDirectorCardTargets,
  getDirectorFocusPosition,
  getDirectorIntentTargetPosition,
  getDirectorObjectAction,
  getDirectorObjective,
  getDirectorReachableTiles,
  getDirectorScreenPosition,
  moveDirectorPlayer,
  playDirectorCard,
  previewDirectorCard,
  resetDirectorState,
  useDirectorObject as activateDirectorObject,
  type DirectorRecord,
  type DirectorState,
} from "@/lib/barcode-world/fractured-gate-director-engine.mjs";
import styles from "./FracturedGatePrototype.module.css";

type BoardStyle = CSSProperties & {
  "--board-x": string;
  "--board-y": string;
};

const ENEMY_ORDER = ["ram", "warden", "jammer"];
const CARD_ORDER = [
  "quick-shot",
  "force-push",
  "dash-strike",
  "guard-pulse",
  "overload",
];

const ENEMY_COPY: Record<string, { label: string; className: string }> = {
  ram: { label: "GATE BREAKER", className: "ram" },
  warden: { label: "BLOCKER", className: "warden" },
  jammer: { label: "ANCHOR DRAIN", className: "jammer" },
};

function positionStyle(positionId: string, offsetY = 0): BoardStyle {
  const position = getDirectorScreenPosition(positionId);
  return {
    "--board-x": `${position.x}%`,
    "--board-y": `${position.y + offsetY}%`,
  };
}

function healthPips(current: number, maximum: number) {
  return Array.from({ length: maximum }, (_, index) => index < current);
}

function objectiveProgress(objective: DirectorRecord) {
  if (objective.step === 4) return ["done", "done", "done", "active"];
  return [1, 2, 3, 4].map((step) =>
    step < objective.step ? "done" : step === objective.step ? "active" : "",
  );
}

function TacticalHud({
  game,
  onPause,
}: {
  game: DirectorState;
  onPause: () => void;
}) {
  const objective = getDirectorObjective(game);
  const progress = objectiveProgress(objective);
  return (
    <header className={styles.tacticalHud}>
      <div className={styles.identity}>
        <span>BARCODE WORLD</span>
        <strong>FRACTURED GATE</strong>
      </div>

      <div className={styles.objectiveHud} aria-label="Current objective">
        <div className={styles.objectiveSteps} aria-hidden="true">
          {progress.map((status, index) => (
            <i key={index} data-status={status}>
              {index + 1}
            </i>
          ))}
        </div>
        <div>
          <span>OBJECTIVE</span>
          <strong>{objective.title}</strong>
          <small>{objective.short}</small>
        </div>
      </div>

      <div className={styles.resourceHud}>
        <div aria-label={`Turn ${game.turn}`}>
          <span>TURN</span>
          <strong>{game.turn}</strong>
        </div>
        <div aria-label={`${game.player.hp} of ${game.player.maxHp} health`}>
          <span>SIGNAL</span>
          <strong>{game.player.hp}</strong>
          <small>/{game.player.maxHp}</small>
        </div>
      </div>

      <button
        type="button"
        className={styles.pauseButton}
        onClick={onPause}
        aria-label="Pause and help"
      >
        <span />
        <span />
      </button>
    </header>
  );
}

function IntentLines({ game }: { game: DirectorState }) {
  return (
    <svg
      className={styles.intentLines}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="intent-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      {game.intents.map((intent: DirectorRecord) => {
        const enemy = game.enemies[intent.actorId];
        if (!enemy || enemy.hp <= 0) return null;
        const targetPosition = getDirectorIntentTargetPosition(game, intent);
        if (!targetPosition) return null;
        const from = getDirectorScreenPosition(enemy.position);
        const to = getDirectorScreenPosition(targetPosition);
        return (
          <line
            key={intent.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            data-actor={intent.actorId}
            data-status={intent.status}
            markerEnd="url(#intent-arrow)"
          />
        );
      })}
    </svg>
  );
}

function IntentBadge({
  game,
  enemyId,
}: {
  game: DirectorState;
  enemyId: string;
}) {
  const enemy = game.enemies[enemyId];
  const intent = game.intents.find(
    (candidate: DirectorRecord) => candidate.actorId === enemyId,
  );
  if (!intent || enemy.hp <= 0) return null;
  return (
    <div
      className={styles.intentBadge}
      style={positionStyle(enemy.position, -8)}
      data-actor={enemyId}
      data-status={intent.status}
      aria-label={`${enemy.name} intent: ${intent.name}, ${intent.tempo}`}
    >
      <span>{intent.glyph}</span>
      <div>
        <strong>{intent.name}</strong>
        <small>
          {intent.tempo.toUpperCase()} · {intent.detail}
        </small>
      </div>
    </div>
  );
}

function Tile({
  tile,
  reachable,
  targeted,
  selected,
  onClick,
}: {
  tile: DirectorRecord;
  reachable: DirectorRecord | null;
  targeted: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tile}
      data-terrain={tile.terrain}
      data-reachable={Boolean(reachable) ? "true" : "false"}
      data-targeted={targeted ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-cover={tile.cover ? "true" : "false"}
      style={positionStyle(tile.id)}
      onClick={onClick}
      aria-label={`${tile.terrain} tile${
        tile.cover ? ", cover" : ""
      }${reachable ? `, reachable in ${reachable.cost}` : ""}`}
    >
      <span />
      {reachable ? <b>{reachable.cost}</b> : null}
      {tile.cover ? <i>◢</i> : null}
      {tile.terrain === "rail" ? <em>ϟ</em> : null}
    </button>
  );
}

function PlayerPiece({
  game,
  selected,
  onClick,
}: {
  game: DirectorState;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.playerPiece}
      data-selected={selected ? "true" : "false"}
      style={positionStyle(game.player.position)}
      onClick={onClick}
      aria-label={`Player, ${game.player.hp} health, ${game.player.shield} shield`}
    >
      <span>6</span>
      <strong>YOU</strong>
      <div className={styles.unitBars}>
        <i
          style={{
            width: `${(game.player.hp / game.player.maxHp) * 100}%`,
          }}
        />
        {game.player.shield ? <b>+{game.player.shield}</b> : null}
      </div>
    </button>
  );
}

function EnemyPiece({
  game,
  enemyId,
  selected,
  targetable,
  onClick,
  onHover,
}: {
  game: DirectorState;
  enemyId: string;
  selected: boolean;
  targetable: boolean;
  onClick: () => void;
  onHover: (active: boolean) => void;
}) {
  const enemy = game.enemies[enemyId];
  const copy = ENEMY_COPY[enemyId];
  const disabled = enemy.hp <= 0;
  if (disabled) return null;
  return (
    <button
      type="button"
      className={styles.enemyPiece}
      data-enemy={copy.className}
      data-selected={selected ? "true" : "false"}
      data-targetable={targetable ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      style={positionStyle(enemy.position)}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`${enemy.name}, ${copy.label}, ${enemy.hp} of ${enemy.maxHp} health`}
    >
      <span>{enemy.glyph}</span>
      <strong>{enemy.name}</strong>
      <small>{copy.label}</small>
      <div className={styles.unitBars}>
        <i style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
        {enemy.shield ? <b>+{enemy.shield}</b> : null}
      </div>
    </button>
  );
}

function Anchor({
  game,
  objectId,
  selected,
  onClick,
}: {
  game: DirectorState;
  objectId: string;
  selected: boolean;
  onClick: () => void;
}) {
  const object = DIRECTOR_OBJECTS[objectId];
  const powered = game.anchors[objectId].powered;
  return (
    <button
      type="button"
      className={styles.anchor}
      data-powered={powered ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={positionStyle(object.position)}
      onClick={onClick}
      aria-label={`${object.name}, ${powered ? "powered" : "offline"}`}
    >
      <span>{object.glyph}</span>
      <strong>{powered ? "ONLINE" : "ANCHOR"}</strong>
      <i />
    </button>
  );
}

function PowerCell({
  game,
  selected,
  targetable,
  onClick,
  onHover,
}: {
  game: DirectorState;
  selected: boolean;
  targetable: boolean;
  onClick: () => void;
  onHover: (active: boolean) => void;
}) {
  if (!game.cell.active) {
    return (
      <div
        className={styles.cellRuptured}
        style={positionStyle(DIRECTOR_OBJECTS.cell.position)}
        aria-label="Power Cell detonated"
      >
        ×
      </div>
    );
  }
  return (
    <button
      type="button"
      className={styles.powerCell}
      data-selected={selected ? "true" : "false"}
      data-targetable={targetable ? "true" : "false"}
      style={positionStyle(DIRECTOR_OBJECTS.cell.position)}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label="Power Cell, volatile environmental target"
    >
      <span>ϟ</span>
      <strong>POWER CELL</strong>
      <i />
    </button>
  );
}

function Gate({ game, selected, onClick }: {
  game: DirectorState;
  selected: boolean;
  onClick: () => void;
}) {
  const bothPowered = Object.values(
    game.anchors as Record<string, DirectorRecord>,
  ).every(
    (anchor: DirectorRecord) => anchor.powered,
  );
  return (
    <button
      type="button"
      className={styles.gate}
      data-powered={bothPowered ? "true" : "false"}
      data-sealing={game.gate.sealing ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={positionStyle(DIRECTOR_OBJECTS.gate.position)}
      onClick={onClick}
      aria-label={`Fractured Gate, ${game.gate.integrity} integrity${
        game.gate.sealing ? ", sealing" : ""
      }`}
    >
      <span />
      <span />
      <i />
      <strong>{game.gate.sealing ? "SEALING" : "GATE"}</strong>
      <div>
        {healthPips(game.gate.integrity, game.gate.maxIntegrity).map(
          (filled, index) => (
            <b key={index} data-filled={filled ? "true" : "false"} />
          ),
        )}
      </div>
    </button>
  );
}

function FocusPopover({
  game,
  focusId,
  onUseObject,
}: {
  game: DirectorState;
  focusId: string | null;
  onUseObject: (objectId: string) => void;
}) {
  if (!focusId) return null;
  const position = getDirectorFocusPosition(game, focusId);
  if (!position) return null;

  const enemy = game.enemies[focusId];
  if (enemy) {
    const intent = game.intents.find(
      (candidate: DirectorRecord) => candidate.actorId === focusId,
    );
    return (
      <div className={styles.focusPopover} style={positionStyle(position, 8)}>
        <span>{ENEMY_COPY[focusId].label}</span>
        <strong>
          {enemy.name} · {enemy.hp}/{enemy.maxHp}
        </strong>
        <small>
          {intent?.status === "canceled"
            ? `${intent.name} INTERRUPTED`
            : `${intent?.name ?? "NO INTENT"} · ${intent?.tempo ?? ""}`}
        </small>
      </div>
    );
  }

  if (focusId === "cell") {
    return (
      <div className={styles.focusPopover} style={positionStyle(position, 8)}>
        <span>ENVIRONMENT</span>
        <strong>POWER CELL</strong>
        <small>OVERLOAD IT · BLAST RADIUS 2</small>
      </div>
    );
  }

  const action = getDirectorObjectAction(game, focusId);
  const object = DIRECTOR_OBJECTS[focusId];
  if (!action || !object) return null;
  return (
    <div className={styles.focusPopover} style={positionStyle(position, 9)}>
      <span>{focusId === "gate" ? "MISSION TARGET" : "GATE CIRCUIT"}</span>
      <strong>{object.name}</strong>
      <button
        type="button"
        disabled={!action.legal}
        onClick={() => onUseObject(focusId)}
      >
        {action.label}
        {action.cost ? ` · ${action.cost}` : ""}
      </button>
      {!action.legal ? <small>{action.reason}</small> : null}
    </div>
  );
}

function BattleStage({
  game,
  selectedCard,
  selectedFocus,
  hoveredTarget,
  onTile,
  onFocus,
  onTarget,
  onHoverTarget,
  onUseObject,
}: {
  game: DirectorState;
  selectedCard: string | null;
  selectedFocus: string | null;
  hoveredTarget: string | null;
  onTile: (tileId: string) => void;
  onFocus: (focusId: string) => void;
  onTarget: (focusId: string) => void;
  onHoverTarget: (focusId: string | null) => void;
  onUseObject: (objectId: string) => void;
}) {
  const reachable = getDirectorReachableTiles(game);
  const targets = new Set(
    selectedCard ? getDirectorCardTargets(game, selectedCard) : [],
  );
  const objective = getDirectorObjective(game);
  const activeIntent = game.phase === "enemy"
    ? game.intents[game.enemyCursor]
    : null;

  return (
    <section
      className={styles.battleStage}
      aria-label="The Fractured Gate tactical board"
      data-phase={game.phase}
    >
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.fringeFog} aria-hidden="true" />
      <div className={styles.boardCamera}>
        <svg
          className={styles.powerCables}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {["anchor-a", "anchor-b"].map((anchorId) => {
            const start = getDirectorScreenPosition(
              DIRECTOR_OBJECTS[anchorId].position,
            );
            const end = getDirectorScreenPosition(
              DIRECTOR_OBJECTS.gate.position,
            );
            return (
              <path
                key={anchorId}
                d={`M ${start.x} ${start.y} C ${start.x + 14} ${start.y}, ${
                  end.x - 14
                } ${end.y}, ${end.x} ${end.y}`}
                data-powered={
                  game.anchors[anchorId].powered ? "true" : "false"
                }
              />
            );
          })}
        </svg>

        <IntentLines game={game} />

        {Object.values(DIRECTOR_TILES).map((tile: DirectorRecord) => (
          <Tile
            key={tile.id}
            tile={tile}
            reachable={
              !selectedCard && game.phase === "player"
                ? reachable[tile.id] ?? null
                : null
            }
            targeted={false}
            selected={selectedFocus === tile.id}
            onClick={() => onTile(tile.id)}
          />
        ))}

        <div
          className={styles.missionBeacon}
          style={positionStyle(DIRECTOR_OBJECTS.gate.position, -18)}
          data-sealing={game.gate.sealing ? "true" : "false"}
        >
          <span>{objective.step < 3 ? "LOCKED" : objective.title}</span>
        </div>

        {ENEMY_ORDER.map((enemyId) => (
          <IntentBadge key={enemyId} game={game} enemyId={enemyId} />
        ))}

        {["anchor-a", "anchor-b"].map((objectId) => (
          <Anchor
            key={objectId}
            game={game}
            objectId={objectId}
            selected={selectedFocus === objectId}
            onClick={() => onFocus(objectId)}
          />
        ))}

        <PowerCell
          game={game}
          selected={selectedFocus === "cell"}
          targetable={targets.has("cell")}
          onClick={() =>
            targets.has("cell") ? onTarget("cell") : onFocus("cell")
          }
          onHover={(active) =>
            onHoverTarget(active && targets.has("cell") ? "cell" : null)
          }
        />

        <Gate
          game={game}
          selected={selectedFocus === "gate"}
          onClick={() => onFocus("gate")}
        />

        {ENEMY_ORDER.map((enemyId) => (
          <EnemyPiece
            key={enemyId}
            game={game}
            enemyId={enemyId}
            selected={selectedFocus === enemyId}
            targetable={targets.has(enemyId)}
            onClick={() =>
              targets.has(enemyId) ? onTarget(enemyId) : onFocus(enemyId)
            }
            onHover={(active) =>
              onHoverTarget(active && targets.has(enemyId) ? enemyId : null)
            }
          />
        ))}

        <PlayerPiece
          game={game}
          selected={selectedFocus === "player"}
          onClick={() => onFocus("player")}
        />

        <FocusPopover
          game={game}
          focusId={selectedFocus}
          onUseObject={onUseObject}
        />

        {activeIntent ? (
          <div
            className={styles.enemyActionFlash}
            key={`${activeIntent.id}-${game.enemyCursor}`}
            data-actor={activeIntent.actorId}
          >
            <span>{activeIntent.glyph}</span>
            <strong>{activeIntent.name}</strong>
          </div>
        ) : null}
      </div>

      <div
        className={styles.eventToast}
        key={game.lastEvent.id}
        data-tone={game.lastEvent.tone}
        role="status"
        aria-live="polite"
      >
        <strong>{game.lastEvent.text}</strong>
        {game.lastEvent.detail ? <span>{game.lastEvent.detail}</span> : null}
      </div>

      {selectedCard ? (
        <div className={styles.targetCue}>
          <span>{DIRECTOR_CARDS[selectedCard].glyph}</span>
          <strong>
            {hoveredTarget
              ? "SELECT AGAIN TO EXECUTE"
              : selectedCard === "overload"
                ? "CHOOSE ENEMY OR POWER CELL"
                : "CHOOSE A GLOWING ENEMY"}
          </strong>
          <button
            type="button"
            onClick={() => onFocus(selectedFocus ?? "player")}
          >
            CANCEL
          </button>
        </div>
      ) : game.phase === "player" && game.moveAvailable ? (
        <div className={styles.firstMoveCue}>
          MOVE · CLICK A BLUE DIAMOND
        </div>
      ) : null}
    </section>
  );
}

function PreviewRibbon({
  game,
  selectedCard,
  hoveredTarget,
}: {
  game: DirectorState;
  selectedCard: string | null;
  hoveredTarget: string | null;
}) {
  const preview =
    selectedCard && hoveredTarget
      ? previewDirectorCard(game, selectedCard, hoveredTarget)
      : null;
  if (!preview?.legal || !selectedCard) return null;
  const card = DIRECTOR_CARDS[selectedCard];
  return (
    <div className={styles.previewRibbon} role="status">
      <span>{card.glyph}</span>
      <strong>{preview.summary}</strong>
      {preview.relation ? (
        <b data-interrupts={preview.interrupts ? "true" : "false"}>
          {preview.relation}
        </b>
      ) : null}
    </div>
  );
}

function CardDock({
  game,
  selectedCard,
  hoveredTarget,
  onCard,
  onEndTurn,
  onAdvanceEnemy,
  reducedMotion,
}: {
  game: DirectorState;
  selectedCard: string | null;
  hoveredTarget: string | null;
  onCard: (cardId: string) => void;
  onEndTurn: () => void;
  onAdvanceEnemy: () => void;
  reducedMotion: boolean;
}) {
  return (
    <footer className={styles.commandDock}>
      <PreviewRibbon
        game={game}
        selectedCard={selectedCard}
        hoveredTarget={hoveredTarget}
      />
      <div className={styles.commandCore} aria-label="Command">
        <span>CMD</span>
        <strong>{game.command}</strong>
        <div>
          {Array.from({ length: 8 }, (_, index) => (
            <i
              key={index}
              data-filled={index * 4 < game.command ? "true" : "false"}
            />
          ))}
        </div>
      </div>
      <div className={styles.cards} aria-label="Tactical cards">
        {CARD_ORDER.map((cardId) => {
          const card = DIRECTOR_CARDS[cardId];
          const used = Boolean(game.cardUses[cardId]);
          const unaffordable = game.command < card.cost;
          const noTarget =
            card.target !== "self" &&
            !used &&
            !unaffordable &&
            getDirectorCardTargets(game, cardId).length === 0;
          const disabled =
            game.phase !== "player" ||
            used ||
            unaffordable ||
            noTarget;
          return (
            <button
              key={cardId}
              type="button"
              className={styles.card}
              data-selected={selectedCard === cardId ? "true" : "false"}
              data-used={used ? "true" : "false"}
              data-tempo={card.tempo.toLowerCase()}
              disabled={disabled}
              onClick={() => onCard(cardId)}
              aria-label={`${card.name}, ${card.cost} Command, ${card.tempo}, ${card.short}`}
            >
              <b>{card.cost}</b>
              <span>{card.glyph}</span>
              <strong>{card.name}</strong>
              <small>
                {unaffordable
                  ? `NEED ${card.cost - game.command} CMD`
                  : noTarget
                    ? "NO TARGET IN RANGE"
                    : card.short}
              </small>
              <em>
                {used
                  ? "USED"
                  : unaffordable
                    ? "LOW CMD"
                    : noTarget
                      ? "OUT OF RANGE"
                      : card.tempo.toUpperCase()}
              </em>
            </button>
          );
        })}
      </div>
      <div className={styles.turnButtonSlot}>
        {game.phase === "player" ? (
          <button
            type="button"
            className={styles.endTurnButton}
            onClick={onEndTurn}
            data-testid="end-turn"
          >
            <span>ENEMIES ACT</span>
            <strong>END TURN</strong>
            <small>BANK {game.command} CMD</small>
          </button>
        ) : reducedMotion && game.phase === "enemy" ? (
          <button
            type="button"
            className={styles.endTurnButton}
            onClick={onAdvanceEnemy}
            data-testid="advance-enemy"
          >
            <span>ENEMY TURN</span>
            <strong>NEXT ACTION</strong>
          </button>
        ) : (
          <div className={styles.enemyTurnLock}>
            <span>ENEMY TURN</span>
            <strong>RESOLVING</strong>
          </div>
        )}
      </div>
    </footer>
  );
}

function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <section
      className={styles.introOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Mission start"
    >
      <div className={styles.introSignal} aria-hidden="true">
        <i>I</i>
        <span>+</span>
        <i>II</i>
        <b>→</b>
        <strong>G</strong>
      </div>
      <p>PRIVATE · SOLO · RESETTABLE</p>
      <h1>SAVE THE GATE</h1>
      <div className={styles.introMission}>
        <span>POWER 2 ANCHORS</span>
        <b>→</b>
        <span>REACH THE GATE</span>
        <b>→</b>
        <span>SURVIVE 1 ENEMY TURN</span>
      </div>
      <small>RAM breaks the Gate after three Slow smashes.</small>
      <button type="button" onClick={onStart}>
        DROP IN
      </button>
    </section>
  );
}

function PauseOverlay({
  reducedMotion,
  onMotion,
  onReset,
  onClose,
}: {
  reducedMotion: boolean;
  onMotion: (value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className={styles.pauseOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Pause and help"
    >
      <div>
        <span>PAUSED</span>
        <h2>HOW TO PLAY</h2>
        <div className={styles.helpGrid}>
          <p>
            <b>◇</b>
            <span>Click a blue diamond to move.</span>
          </p>
          <p>
            <b>▣</b>
            <span>Click a card, then a glowing target.</span>
          </p>
          <p>
            <b>⚡</b>
            <span>Faster cards interrupt slower intents.</span>
          </p>
          <p>
            <b>G</b>
            <span>Power both Anchors, then hold the Gate.</span>
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => onMotion(event.target.checked)}
          />
          Manual enemy actions / reduce motion
        </label>
        <div className={styles.pauseActions}>
          <button type="button" onClick={onReset}>
            RESET BATTLE
          </button>
          <button type="button" onClick={onClose}>
            RESUME
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultOverlay({
  game,
  onReset,
}: {
  game: DirectorState;
  onReset: () => void;
}) {
  if (!game.result) return null;
  const powered = Object.values(
    game.anchors as Record<string, DirectorRecord>,
  ).filter(
    (anchor: DirectorRecord) => anchor.powered,
  ).length;
  return (
    <section
      className={styles.resultOverlay}
      data-result={game.result.type}
      role="dialog"
      aria-modal="true"
      aria-label="Battle result"
    >
      <div>
        <span>{game.result.type === "victory" ? "SIGNAL LOCK" : "BATTLE LOST"}</span>
        <h2>{game.result.title}</h2>
        <p>{game.result.cause}</p>
        <div className={styles.resultStats}>
          <div>
            <span>TURN</span>
            <strong>{game.turn}</strong>
          </div>
          <div>
            <span>GATE</span>
            <strong>
              {game.gate.integrity}/{game.gate.maxIntegrity}
            </strong>
          </div>
          <div>
            <span>ANCHORS</span>
            <strong>{powered}/2</strong>
          </div>
        </div>
        <button type="button" onClick={onReset} data-testid="reset-result">
          REPLAY SAME BATTLE
        </button>
      </div>
    </section>
  );
}

export function FracturedGatePrototype() {
  const [game, setGame] = useState(() => createDirectorState());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string | null>("player");
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const interactionLocked = intro || paused || Boolean(game.result);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setCoarsePointer(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (
      intro ||
      paused ||
      reducedMotion ||
      game.phase !== "enemy" ||
      game.result
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setGame((current) => advanceDirectorEnemyTurn(current)),
      760,
    );
    return () => window.clearTimeout(timer);
  }, [
    intro,
    paused,
    reducedMotion,
    game.phase,
    game.enemyCursor,
    game.lastEvent.id,
    game.result,
  ]);

  const cardTargets = useMemo(
    () =>
      new Set(
        selectedCard ? getDirectorCardTargets(game, selectedCard) : [],
      ),
    [game, selectedCard],
  );

  function clearSelection(nextFocus: string | null = "player") {
    setSelectedCard(null);
    setHoveredTarget(null);
    setSelectedFocus(nextFocus);
  }

  function handleCard(cardId: string) {
    if (game.phase !== "player") return;
    const card = DIRECTOR_CARDS[cardId];
    if (card.target === "self") {
      setGame((current) => playDirectorCard(current, cardId, "player"));
      clearSelection("player");
      return;
    }
    setSelectedCard((current) => (current === cardId ? null : cardId));
    setSelectedFocus(null);
    setHoveredTarget(null);
  }

  function handleTarget(focusId: string) {
    if (!selectedCard || !cardTargets.has(focusId)) {
      setSelectedFocus(focusId);
      return;
    }
    if (coarsePointer && hoveredTarget !== focusId) {
      setHoveredTarget(focusId);
      setSelectedFocus(focusId);
      return;
    }
    setGame((current) =>
      playDirectorCard(current, selectedCard, focusId),
    );
    clearSelection(focusId);
  }

  function handleFocus(focusId: string) {
    if (selectedCard) {
      setSelectedCard(null);
      setHoveredTarget(null);
    }
    setSelectedFocus((current) =>
      current === focusId ? null : focusId,
    );
  }

  function handleTile(tileId: string) {
    if (selectedCard || game.phase !== "player") return;
    const reachable = getDirectorReachableTiles(game);
    if (reachable[tileId]) {
      setGame((current) => moveDirectorPlayer(current, tileId));
      clearSelection("player");
      return;
    }
  }

  function handleUseObject(objectId: string) {
    setGame((current) => activateDirectorObject(current, objectId));
    clearSelection(objectId);
  }

  function handleEndTurn() {
    clearSelection(null);
    setGame((current) => beginDirectorEnemyTurn(current));
  }

  function handleReset() {
    setGame((current) => resetDirectorState(current));
    setIntro(false);
    setPaused(false);
    clearSelection("player");
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={styles.battleShell}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <div
        className={styles.gameLayer}
        inert={interactionLocked ? true : undefined}
        aria-hidden={interactionLocked ? "true" : undefined}
      >
        <TacticalHud game={game} onPause={() => setPaused(true)} />
        <BattleStage
          game={game}
          selectedCard={selectedCard}
          selectedFocus={selectedFocus}
          hoveredTarget={hoveredTarget}
          onTile={handleTile}
          onFocus={handleFocus}
          onTarget={handleTarget}
          onHoverTarget={setHoveredTarget}
          onUseObject={handleUseObject}
        />
        <CardDock
          game={game}
          selectedCard={selectedCard}
          hoveredTarget={hoveredTarget}
          onCard={handleCard}
          onEndTurn={handleEndTurn}
          onAdvanceEnemy={() =>
            setGame((current) => advanceDirectorEnemyTurn(current))
          }
          reducedMotion={reducedMotion}
        />
      </div>

      {intro ? <IntroOverlay onStart={() => setIntro(false)} /> : null}
      {paused ? (
        <PauseOverlay
          reducedMotion={reducedMotion}
          onMotion={setReducedMotion}
          onReset={handleReset}
          onClose={() => setPaused(false)}
        />
      ) : null}
      <ResultOverlay game={game} onReset={handleReset} />

    </main>
  );
}
