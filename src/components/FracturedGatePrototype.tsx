"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  DIRECTOR_BUILD,
  DIRECTOR_CARDS,
  DIRECTOR_OBJECTS,
  DIRECTOR_RULES,
  DIRECTOR_TILES,
  advanceDirectorEnemyTurn,
  beginDirectorEnemyTurn,
  createDirectorState,
  getDirectorCardTargets,
  getDirectorContextAction,
  getDirectorFocusPosition,
  getDirectorIntentTargetPosition,
  getDirectorObjectAction,
  getDirectorObjective,
  getDirectorReachableTiles,
  getDirectorReaction,
  getDirectorScreenPosition,
  getDirectorTilePolygon,
  moveDirectorPlayer,
  playDirectorCard,
  previewDirectorCard,
  resetDirectorState,
  resolveDirectorReaction,
  useDirectorContextAction as activateDirectorContextAction,
  useDirectorObject as activateDirectorObject,
  type DirectorRecord,
  type DirectorState,
} from "@/lib/barcode-world/fractured-gate-director-engine.mjs";
import styles from "./FracturedGatePrototype.module.css";

type BoardStyle = CSSProperties & {
  "--board-x": string;
  "--board-y": string;
};

const ENEMY_ORDER = ["ram", "warden", "jammer", "sniper"];
const CARD_ORDER = [
  "bitcrush",
  "shunt",
  "skip-step",
  "firewall",
  "overload",
];
const OBJECT_ORDER = [
  "divider",
  "anchor-a",
  "anchor-b",
  "cell",
  "cache",
  "exit",
  "gate",
];

const ENEMY_COPY: Record<
  string,
  { role: string; glyph: string; tempoColor: string }
> = {
  ram: { role: "GATE BREAKER", glyph: "▶", tempoColor: "orange" },
  warden: { role: "DISPLACER", glyph: "⬢", tempoColor: "red" },
  jammer: { role: "ANCHOR DRAIN", glyph: "⌁", tempoColor: "violet" },
  sniper: { role: "HIGH TRACE", glyph: "⌖", tempoColor: "cyan" },
};

const OBJECT_PURPOSE: Record<string, string> = {
  "anchor-a": "Optional: powers the high bridge shortcut.",
  "anchor-b": "Optional: turns the lower track into a weapon.",
  cell: "Rupture it to blast nearby units.",
  divider: "Crash an enemy through it to earn a new route.",
  cache: "Recover Signal before the Gate collapses.",
  exit: "Retreat ends this battle.",
  gate: "Reach it, start the lock, and survive the assault.",
};

function terrainCue(
  tile: DirectorRecord,
  game: DirectorState,
): { label: string; effect: string } {
  if (Number(tile.elevation ?? 0) > 0) {
    return { label: "HIGH GROUND", effect: "LONGER, HARDER RANGED FIRE" };
  }
  if (Number(tile.cover ?? 0) >= 2) {
    return { label: "HARD COVER", effect: "BREAKS MOST TRACE FIRE" };
  }
  if (Number(tile.cover ?? 0) === 1) {
    return { label: "HALF COVER", effect: "SOFTENS TRACE FIRE" };
  }
  if (tile.terrain === "rubble") {
    return { label: "RUBBLE", effect: "SLOWS THE PATH" };
  }
  if (tile.terrain === "track") {
    return anchorIsPowered(game, "anchor-b")
      ? { label: "LIVE TRACK", effect: "FREE FLOW · PUSH STUNS" }
      : { label: "COLD TRACK", effect: "POWER ANCHOR II" };
  }
  if (tile.terrain === "bridge") {
    return anchorIsPowered(game, "anchor-a")
      ? { label: "HARDLIGHT BRIDGE", effect: "UPPER SHORTCUT" }
      : { label: "BRIDGE OFFLINE", effect: "POWER ANCHOR I" };
  }
  if (Number(tile.elevation ?? 0) < 0) {
    return { label: "SERVICE TRENCH", effect: "LOW TRACE PROFILE" };
  }
  return { label: "CLEAR FLOOR", effect: "FULL STRIDE" };
}

function positionStyle(positionId: string, offsetY = 0): BoardStyle {
  const position = getDirectorScreenPosition(positionId);
  return {
    "--board-x": `${position.x}%`,
    "--board-y": `${position.y + offsetY}%`,
  };
}

function tilePolygon(positionId: string) {
  const raw = getDirectorTilePolygon(positionId) as unknown;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((point) =>
        Array.isArray(point)
          ? `${point[0]},${point[1]}`
          : `${point.x},${point.y}`,
      )
      .join(" ");
  }
  if (raw && typeof raw === "object" && "points" in raw) {
    return String((raw as { points: unknown }).points);
  }
  return "";
}

function tempoGlyph(tempo?: string) {
  if (tempo?.toLowerCase() === "fast") return ">>>";
  if (tempo?.toLowerCase() === "standard") return ">>";
  return ">";
}

function objectiveProgress(objective: DirectorRecord) {
  const step = Math.max(1, Number(objective.step ?? 1));
  return [1, 2, 3].map((candidate) =>
    candidate < step ? "done" : candidate === step ? "active" : "waiting",
  );
}

function anchorIsPowered(game: DirectorState, objectId: string) {
  return Boolean(game.anchors?.[objectId]?.powered);
}

function objectIsGone(game: DirectorState, objectId: string) {
  if (objectId === "cell") {
    return game.cell?.active === false || game.cell?.ruptured === true;
  }
  if (objectId === "divider") {
    return (
      game.divider?.active === false ||
      game.divider?.breached === true ||
      game.divider?.destroyed === true
    );
  }
  if (objectId === "cache") {
    return (
      game.cache?.active === false ||
      game.cache?.carried === true ||
      game.cache?.recovered === true
    );
  }
  return false;
}

function handleSvgKey(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
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
        <span>ACTIVE BUILD</span>
        <strong>{DIRECTOR_BUILD.name}</strong>
      </div>

      <div
        className={styles.objectiveHud}
        aria-label="Reach the Gate, start the lock, and survive the primary assault"
      >
        <div className={styles.objectiveTrack} aria-hidden="true">
          <span data-state={progress[0]}>
            <i>→</i>
            <b>REACH GATE</b>
          </span>
          <em>→</em>
          <span data-state={progress[1]}>
            <i>G</i>
            <b>START LOCK</b>
          </span>
          <em>→</em>
          <span data-state={progress[2]}>
            <i>!</i>
            <b>SURVIVE ASSAULT</b>
          </span>
        </div>
        <strong className={styles.objectiveNow}>{objective.title}</strong>
      </div>

      <div className={styles.statusHud}>
        <div>
          <span>TURN</span>
          <strong>{game.turn}</strong>
        </div>
        <div>
          <span>YOU</span>
          <strong>{game.player.hp}</strong>
          <small>/{game.player.maxHp}</small>
        </div>
        <div className={styles.gatePips}>
          <span>GATE</span>
          <b>
            {Array.from(
              { length: Number(game.gate.maxIntegrity ?? 3) },
              (_, index) => (
                <i
                  key={index}
                  data-filled={
                    index < Number(game.gate.integrity ?? 0) ? "true" : "false"
                  }
                />
              ),
            )}
          </b>
        </div>
      </div>

      <button
        type="button"
        className={styles.pauseButton}
        onClick={onPause}
        aria-label="Pause and show controls"
      >
        <span />
        <span />
      </button>
    </header>
  );
}

function BoardMesh({
  game,
  selectedCard,
  reachable,
  targets,
  preview,
  hoveredTile,
  onTile,
  onTileHover,
}: {
  game: DirectorState;
  selectedCard: string | null;
  reachable: DirectorRecord;
  targets: Set<string>;
  preview: DirectorRecord | null;
  hoveredTile: string | null;
  onTile: (tileId: string) => void;
  onTileHover: (tileId: string | null) => void;
}) {
  const path = new Set<string>(
    hoveredTile && reachable[hoveredTile]?.path
      ? reachable[hoveredTile].path
      : [],
  );
  const previewFootprint = new Set<string>(
    Array.isArray(preview?.footprint) ? preview.footprint : [],
  );
  const previewPath = new Set<string>(
    Array.isArray(preview?.path) ? preview.path : [],
  );
  const tileHalfWidth = Number(DIRECTOR_RULES.tileHalfWidth ?? 4);
  const tileHalfHeight = Number(DIRECTOR_RULES.tileHalfHeight ?? 3.2);
  const tiles = Object.values(
    DIRECTOR_TILES as Record<string, DirectorRecord>,
  ).sort(
      (left, right) =>
        Number(left.elevation ?? 0) - Number(right.elevation ?? 0) ||
        getDirectorScreenPosition(left.id).y -
          getDirectorScreenPosition(right.id).y,
  );

  return (
    <svg
      className={styles.boardMesh}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="The Fractured Gate tactical board"
    >
      <defs>
        <linearGradient id="yard-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#172630" />
          <stop offset=".55" stopColor="#0c171e" />
          <stop offset="1" stopColor="#152028" />
        </linearGradient>
        <linearGradient id="catwalk-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#243941" />
          <stop offset="1" stopColor="#101c22" />
        </linearGradient>
        <linearGradient id="trench-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#09242d" />
          <stop offset=".5" stopColor="#07151c" />
          <stop offset="1" stopColor="#102a30" />
        </linearGradient>
        <filter id="tile-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation=".28" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern
          id="hazard-stripes"
          width="2"
          height="2"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="1" height="2" fill="rgba(255,209,102,.25)" />
        </pattern>
      </defs>

      <g className={styles.terrainFaces} aria-hidden="true">
        {tiles
          .filter((tile) => Number(tile.elevation ?? 0) > 0)
          .map((tile) => {
            const point = getDirectorScreenPosition(tile.id);
            const depth =
              tileHalfHeight * 0.68 * Number(tile.elevation ?? 1);
            return (
              <g
                key={`face-${tile.id}`}
                data-elevation={tile.elevation}
              >
                <path
                  d={`M ${point.x - tileHalfWidth} ${point.y}
                      L ${point.x} ${point.y + tileHalfHeight}
                      L ${point.x} ${point.y + tileHalfHeight + depth}
                      L ${point.x - tileHalfWidth} ${point.y + depth} Z`}
                />
                <path
                  d={`M ${point.x + tileHalfWidth} ${point.y}
                      L ${point.x} ${point.y + tileHalfHeight}
                      L ${point.x} ${point.y + tileHalfHeight + depth}
                      L ${point.x + tileHalfWidth} ${point.y + depth} Z`}
                />
              </g>
            );
          })}
      </g>

      <g className={styles.tiles}>
        {tiles.map((tile) => {
          const isReachable =
            !selectedCard &&
            game.phase === "player" &&
            Boolean(reachable[tile.id]);
          const isTarget = Boolean(selectedCard && targets.has(tile.id));
          const actionable =
            tile.walkable !== false && (isReachable || isTarget);
          const coverKind = tile.blocksSight
            ? "full"
            : Number(tile.cover ?? 0) >= 2
              ? "heavy"
              : tile.cover
                ? "half"
                : "none";
          const label = [
            String(tile.terrain ?? "floor"),
            Number(tile.elevation ?? 0) > 0 ? "high ground" : "",
            Number(tile.elevation ?? 0) < 0 ? "lower trench" : "",
            tile.cover ? `${tile.cover} cover` : "",
            isReachable ? "reachable" : "",
            isTarget ? `target for ${DIRECTOR_CARDS[selectedCard!]?.name}` : "",
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <g
              key={tile.id}
              className={styles.tileHit}
              role="button"
              tabIndex={actionable ? 0 : -1}
              aria-label={label}
              aria-disabled={!actionable}
              data-terrain={tile.terrain}
              data-elevation={tile.elevation ?? 0}
              data-cover={coverKind}
              data-sight={tile.blocksSight ? "blocked" : "open"}
              data-walkable={tile.walkable === false ? "false" : "true"}
              data-powered={
                tile.terrain === "bridge"
                  ? anchorIsPowered(game, "anchor-a")
                    ? "true"
                    : "false"
                  : tile.terrain === "track"
                    ? anchorIsPowered(game, "anchor-b")
                      ? "true"
                      : "false"
                    : undefined
              }
              data-reachable={isReachable ? "true" : "false"}
              data-targeted={isTarget ? "true" : "false"}
              data-path={path.has(tile.id) ? "true" : "false"}
              data-preview={
                previewFootprint.has(tile.id) ? "true" : "false"
              }
              data-preview-path={
                previewPath.has(tile.id) ? "true" : "false"
              }
              onClick={() => actionable && onTile(tile.id)}
              onKeyDown={(event) =>
                actionable && handleSvgKey(event, () => onTile(tile.id))
              }
              onMouseEnter={() =>
                (isReachable || isTarget) && onTileHover(tile.id)
              }
              onMouseLeave={() => onTileHover(null)}
              onFocus={() =>
                (isReachable || isTarget) && onTileHover(tile.id)
              }
              onBlur={() => onTileHover(null)}
            >
              <polygon points={tilePolygon(tile.id)} />
            </g>
          );
        })}
      </g>

      <g className={styles.hazardMarks} aria-hidden="true">
        {tiles
          .filter((tile) =>
            ["hazard", "rail", "conduit", "coolant", "track"].includes(
              tile.terrain,
            ),
          )
          .map((tile) => (
            <polygon
              key={`hazard-${tile.id}`}
              points={tilePolygon(tile.id)}
              data-powered={
                anchorIsPowered(game, "anchor-b") ? "true" : "false"
              }
            />
          ))}
      </g>

      <g className={styles.coverGeometry} aria-hidden="true">
        {tiles
          .filter((tile) => tile.cover || tile.blocksSight)
          .map((tile) => {
            const point = getDirectorScreenPosition(tile.id);
            return (
              <g
                key={`cover-${tile.id}`}
                transform={`translate(${point.x} ${point.y - 0.45})`}
                data-cover={
                  tile.blocksSight
                    ? "full"
                    : Number(tile.cover ?? 0) >= 2
                      ? "heavy"
                      : "half"
                }
              >
                <path d="M -1.8 0 L 0 -1 L 1.8 0 L 0 1 Z" />
                <path d="M -1.8 0 L 0 1 L 0 2.45 L -1.8 1.35 Z" />
                <path d="M 1.8 0 L 0 1 L 0 2.45 L 1.8 1.35 Z" />
              </g>
            );
          })}
      </g>
    </svg>
  );
}

function CircuitLayer({ game }: { game: DirectorState }) {
  const gate = getDirectorScreenPosition(DIRECTOR_OBJECTS.gate.position);
  const upperPowered = anchorIsPowered(game, "anchor-a");
  const lowerPowered = anchorIsPowered(game, "anchor-b");

  return (
    <svg
      className={styles.circuitLayer}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="circuit-pulse"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      {["anchor-a", "anchor-b"].map((anchorId) => {
        const anchor = getDirectorScreenPosition(
          DIRECTOR_OBJECTS[anchorId].position,
        );
        return (
          <path
            key={anchorId}
            className={styles.cable}
            d={`M ${anchor.x} ${anchor.y}
                C ${anchor.x + 10} ${anchor.y - 1},
                  ${gate.x - 12} ${gate.y + (anchorId === "anchor-a" ? -2 : 2)},
                  ${gate.x} ${gate.y}`}
            data-powered={anchorIsPowered(game, anchorId) ? "true" : "false"}
          />
        );
      })}
      <path
        className={styles.bridge}
        d={`M ${getDirectorScreenPosition(DIRECTOR_OBJECTS["anchor-a"].position).x + 2}
            ${getDirectorScreenPosition(DIRECTOR_OBJECTS["anchor-a"].position).y + 2}
            L ${gate.x - 5} ${gate.y - 1}`}
        data-powered={upperPowered ? "true" : "false"}
      />
      <path
        className={styles.track}
        d={`M ${getDirectorScreenPosition(DIRECTOR_OBJECTS["anchor-b"].position).x + 2}
            ${getDirectorScreenPosition(DIRECTOR_OBJECTS["anchor-b"].position).y}
            L ${gate.x - 4} ${gate.y + 3}`}
        data-powered={lowerPowered ? "true" : "false"}
      />
    </svg>
  );
}

function IntentLines({ game }: { game: DirectorState }) {
  return (
    <svg
      className={styles.intentLayer}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {ENEMY_ORDER.map((enemyId) => (
          <marker
            key={enemyId}
            id={`intent-${enemyId}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        ))}
      </defs>

      {game.intents.map((intent: DirectorRecord) => {
        const enemy = game.enemies[intent.actorId];
        if (!enemy || enemy.hp <= 0) return null;
        const target = getDirectorIntentTargetPosition(game, intent);
        if (!target) return null;
        const route = Array.isArray(intent.path)
          ? intent.path
          : [enemy.position, target];
        const points = route
          .map((positionId: string) => getDirectorScreenPosition(positionId))
          .map((point: { x: number; y: number }) => `${point.x},${point.y}`)
          .join(" ");
        const targetPolygon = DIRECTOR_TILES[target]
          ? tilePolygon(target)
          : null;

        return (
          <g
            key={intent.id}
            data-actor={intent.actorId}
            data-status={intent.status}
            data-priority={intent.priority}
          >
            {Array.isArray(intent.affectedTiles)
              ? intent.affectedTiles.map((tileId: string) => (
                  <polygon
                    key={`${intent.id}-${tileId}`}
                    className={styles.intentZone}
                    points={tilePolygon(tileId)}
                  />
                ))
              : null}
            {targetPolygon ? (
              <polygon className={styles.intentZone} points={targetPolygon} />
            ) : null}
            <polyline
              className={styles.intentPath}
              points={points}
              markerEnd={`url(#intent-${intent.actorId})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

function PlayerPiece({
  game,
  selected,
  impacted,
  onClick,
}: {
  game: DirectorState;
  selected: boolean;
  impacted: boolean;
  onClick: () => void;
}) {
  const carryingCache =
    game.cache?.carried === true || game.player?.carryingCache === true;
  return (
    <button
      type="button"
      className={styles.playerPiece}
      data-selected={selected ? "true" : "false"}
      data-braced={game.player.braced ? "true" : "false"}
      data-jammed={game.player.jammed ? "true" : "false"}
      data-impact={impacted ? game.lastEvent.id : undefined}
      style={positionStyle(game.player.position)}
      onClick={onClick}
      aria-label={`Player, ${game.player.hp} Signal${
        game.player.braced ? ", Firewall active" : ""
      }${game.player.jammed ? ", jammed" : ""}`}
    >
      <i className={styles.unitShadow} />
      <span className={styles.playerSilhouette}>
        <b>6</b>
      </span>
      <strong>YOU</strong>
      <div className={styles.unitBars}>
        <i
          style={{
            width: `${(game.player.hp / game.player.maxHp) * 100}%`,
          }}
        />
      </div>
      {game.player.braced ? <em>FIREWALL</em> : null}
      {game.player.jammed ? <em data-tone="jammed">JAMMED</em> : null}
      {carryingCache ? <small>◆</small> : null}
    </button>
  );
}

function EnemyPiece({
  game,
  enemyId,
  selected,
  targetable,
  impacted,
  onClick,
  onHover,
}: {
  game: DirectorState;
  enemyId: string;
  selected: boolean;
  targetable: boolean;
  impacted: boolean;
  onClick: () => void;
  onHover: (active: boolean) => void;
}) {
  const enemy = game.enemies[enemyId];
  const copy = ENEMY_COPY[enemyId];
  if (!enemy || enemy.hp <= 0 || !copy) return null;
  const intent = game.intents.find(
    (candidate: DirectorRecord) => candidate.actorId === enemyId,
  );

  return (
    <button
      type="button"
      className={styles.enemyPiece}
      data-enemy={enemyId}
      data-selected={selected ? "true" : "false"}
      data-targetable={targetable ? "true" : "false"}
      data-impact={impacted ? game.lastEvent.id : undefined}
      style={positionStyle(enemy.position)}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`${enemy.name}, ${copy.role}, ${enemy.hp} of ${enemy.maxHp} health${
        intent ? `, intends ${intent.name} at ${intent.tempo} Tempo` : ""
      }`}
    >
      <i className={styles.unitShadow} />
      <span className={styles.enemySilhouette}>{enemy.glyph ?? copy.glyph}</span>
      <strong>{enemy.name}</strong>
      <small>{copy.role}</small>
      <div className={styles.unitBars}>
        <i style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
      </div>
      {intent ? (
        <em
          className={styles.intentChip}
          data-status={intent.status}
          data-tone={copy.tempoColor}
        >
          <b>{tempoGlyph(intent.tempo)}</b>
          {intent.name}
        </em>
      ) : null}
    </button>
  );
}

function ObjectPiece({
  game,
  objectId,
  selected,
  targetable,
  impacted,
  onClick,
  onHover,
}: {
  game: DirectorState;
  objectId: string;
  selected: boolean;
  targetable: boolean;
  impacted: boolean;
  onClick: () => void;
  onHover: (active: boolean) => void;
}) {
  const object = DIRECTOR_OBJECTS[objectId];
  if (!object) return null;
  const gone = objectIsGone(game, objectId);
  const powered =
    objectId === "anchor-a" || objectId === "anchor-b"
      ? anchorIsPowered(game, objectId)
      : false;

  if (gone) {
    return (
      <div
        className={styles.objectAftermath}
        data-object={objectId}
        style={positionStyle(object.position)}
        aria-label={`${object.name} ${
          objectId === "cache" ? "recovered" : "breached"
        }`}
      >
        <span>{objectId === "cache" ? "◆" : "×"}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.objectPiece}
      data-object={objectId}
      data-powered={powered ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-targetable={targetable ? "true" : "false"}
      data-sealing={game.gate?.sealing && objectId === "gate" ? "true" : "false"}
      data-impact={impacted ? game.lastEvent.id : undefined}
      style={positionStyle(object.position)}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`${object.name}${
        powered ? ", powered" : ""
      }, ${OBJECT_PURPOSE[objectId] ?? "battlefield object"}`}
    >
      <i className={styles.objectShadow} />
      <span>{object.glyph}</span>
      <strong>{object.name}</strong>
      {objectId === "gate" ? (
        <div className={styles.gateLocks} aria-hidden="true">
          {Array.from(
            { length: Number(game.gate.maxIntegrity ?? 3) },
            (_, index) => (
              <b
                key={index}
                data-filled={
                  index < Number(game.gate.integrity ?? 0) ? "true" : "false"
                }
              />
            ),
          )}
        </div>
      ) : null}
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
  if (!focusId || focusId === "player" || DIRECTOR_TILES[focusId]) return null;
  const position = getDirectorFocusPosition(game, focusId);
  if (!position) return null;

  const enemy = game.enemies[focusId];
  if (enemy) {
    const intent = game.intents.find(
      (candidate: DirectorRecord) => candidate.actorId === focusId,
    );
    return (
      <div className={styles.focusPopover} style={positionStyle(position, 8)}>
        <strong>{ENEMY_COPY[focusId]?.role ?? enemy.role}</strong>
        <span>
          {intent?.status === "canceled"
            ? "INTERRUPTED"
            : `${tempoGlyph(intent?.tempo)} ${intent?.name ?? "NO INTENT"}`}
        </span>
      </div>
    );
  }

  const object = DIRECTOR_OBJECTS[focusId];
  if (!object) return null;
  const action = getDirectorObjectAction(game, focusId);
  return (
    <div className={styles.focusPopover} style={positionStyle(position, 9)}>
      <strong>{OBJECT_PURPOSE[focusId] ?? object.name}</strong>
      {action ? (
        <button
          type="button"
          disabled={!action.legal}
          onClick={() => onUseObject(focusId)}
        >
          {action.legal ? action.label : action.reason}
        </button>
      ) : null}
    </div>
  );
}

function ContextActionPiece({
  game,
  onUse,
}: {
  game: DirectorState;
  onUse: () => void;
}) {
  const action = getDirectorContextAction(game);
  if (!action) return null;
  return (
    <button
      type="button"
      className={styles.contextActionPiece}
      style={positionStyle(action.sourcePosition, 10)}
      disabled={!action.legal}
      onClick={onUse}
      aria-label={`${action.label}. ${action.detail}`}
    >
      <span>BATTLE ↘ EXPLORATION</span>
      <strong>{action.label}</strong>
      <small>{action.legal ? "EARNED MOVE · NO ACTION" : action.reason}</small>
    </button>
  );
}

function BattleStage({
  game,
  selectedCard,
  selectedFocus,
  hoveredTarget,
  impactTarget,
  onTile,
  onFocus,
  onTarget,
  onHoverTarget,
  onUseObject,
  onUseContext,
}: {
  game: DirectorState;
  selectedCard: string | null;
  selectedFocus: string | null;
  hoveredTarget: string | null;
  impactTarget: string | null;
  onTile: (tileId: string) => void;
  onFocus: (focusId: string) => void;
  onTarget: (focusId: string) => void;
  onHoverTarget: (focusId: string | null) => void;
  onUseObject: (objectId: string) => void;
  onUseContext: () => void;
}) {
  const reachable = getDirectorReachableTiles(game);
  const targets = new Set(
    selectedCard ? getDirectorCardTargets(game, selectedCard) : [],
  );
  const activeIntent =
    game.phase === "enemy" ? game.intents[game.enemyCursor] : null;
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const hoveredMove =
    hoveredTile && reachable[hoveredTile]
      ? {
          ...terrainCue(DIRECTOR_TILES[hoveredTile], game),
        }
      : null;
  const cardPreview =
    selectedCard && hoveredTarget
      ? previewDirectorCard(game, selectedCard, hoveredTarget)
      : null;

  function chooseTile(tileId: string) {
    if (selectedCard && targets.has(tileId)) {
      onTarget(tileId);
      return;
    }
    onTile(tileId);
  }

  function chooseObject(objectId: string) {
    if (selectedCard && targets.has(objectId)) {
      onTarget(objectId);
      return;
    }
    onFocus(objectId);
  }

  return (
    <section
      className={styles.battleStage}
      aria-label="The Fractured Gate tactical board"
      data-phase={game.phase}
      data-event-tone={game.lastEvent?.tone}
    >
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.boardScroller}>
        <div className={styles.boardCamera}>
          <BoardMesh
            game={game}
            selectedCard={selectedCard}
            reachable={reachable}
            targets={targets}
            preview={cardPreview}
            hoveredTile={hoveredTile}
            onTile={chooseTile}
            onTileHover={(tileId) => {
              setHoveredTile(tileId);
              onHoverTarget(tileId && targets.has(tileId) ? tileId : null);
            }}
          />
          <CircuitLayer game={game} />
          <IntentLines game={game} />

          {OBJECT_ORDER.map((objectId) => (
            <ObjectPiece
              key={`${objectId}-${
                impactTarget === objectId ? game.lastEvent.id : "steady"
              }`}
              game={game}
              objectId={objectId}
              selected={selectedFocus === objectId}
              targetable={targets.has(objectId)}
              impacted={impactTarget === objectId}
              onClick={() => chooseObject(objectId)}
              onHover={(active) =>
                onHoverTarget(active && targets.has(objectId) ? objectId : null)
              }
            />
          ))}

          {ENEMY_ORDER.map((enemyId) => (
            <EnemyPiece
              key={`${enemyId}-${
                impactTarget === enemyId ? game.lastEvent.id : "steady"
              }`}
              game={game}
              enemyId={enemyId}
              selected={selectedFocus === enemyId}
              targetable={targets.has(enemyId)}
              impacted={impactTarget === enemyId}
              onClick={() =>
                targets.has(enemyId) ? onTarget(enemyId) : onFocus(enemyId)
              }
              onHover={(active) =>
                onHoverTarget(active && targets.has(enemyId) ? enemyId : null)
              }
            />
          ))}

          <PlayerPiece
            key={
              impactTarget === "player"
                ? game.lastEvent.id
                : "player-steady"
            }
            game={game}
            selected={selectedFocus === "player"}
            impacted={impactTarget === "player"}
            onClick={() => onFocus("player")}
          />

          <FocusPopover
            game={game}
            focusId={selectedFocus}
            onUseObject={onUseObject}
          />
          <ContextActionPiece game={game} onUse={onUseContext} />

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
              ? "TARGET PREVIEW · CLICK TO EXECUTE"
              : `${DIRECTOR_CARDS[selectedCard].shape} · SELECT GLOWING TARGET`}
          </strong>
          <button type="button" onClick={() => onFocus("player")}>
            ×
            <span className={styles.srOnly}>Cancel card</span>
          </button>
        </div>
      ) : game.phase === "player" && game.movementRemaining > 0 ? (
        hoveredMove ? (
          <div className={styles.terrainCue}>
            <strong>{hoveredMove.label}</strong>
            <span>
              {hoveredMove.effect}
            </span>
          </div>
        ) : (
          <div className={styles.firstMoveCue}>
            MOVE ANYTIME · BLUE CELLS
          </div>
        )
      ) : null}
    </section>
  );
}

function readableRelation(relation?: string) {
  if (relation === "YOU FIRST") return "BEATS THREAT";
  if (relation === "TOGETHER") return "CLASH";
  if (relation === "ENEMY FIRST") return "THREAT LANDS FIRST";
  return relation ?? "";
}

function CardDock({
  game,
  selectedCard,
  hoveredTarget,
  onCard,
  onEndTurn,
  onAdvanceEnemy,
  onReaction,
  reducedMotion,
}: {
  game: DirectorState;
  selectedCard: string | null;
  hoveredTarget: string | null;
  onCard: (cardId: string) => void;
  onEndTurn: () => void;
  onAdvanceEnemy: () => void;
  onReaction: (choice: "intercept" | "decline") => void;
  reducedMotion: boolean;
}) {
  const preview =
    selectedCard && hoveredTarget
      ? previewDirectorCard(game, selectedCard, hoveredTarget)
      : null;
  const reaction = getDirectorReaction(game);

  return (
    <footer className={styles.actionDock}>
      {preview?.legal && selectedCard ? (
        <div className={styles.previewRibbon} role="status">
          <span>{DIRECTOR_CARDS[selectedCard].glyph}</span>
          <strong>{preview.summary}</strong>
          {preview.relation ? (
            <b data-interrupts={preview.interrupts ? "true" : "false"}>
              {readableRelation(preview.relation)}
            </b>
          ) : null}
        </div>
      ) : null}

      <div
        className={styles.motionCore}
        aria-label={`${game.movementRemaining} movement remains`}
      >
        <span>FLUID MOVE</span>
        <div aria-hidden="true">
          {Array.from(
            { length: Number(DIRECTOR_RULES.movementPerTurn) },
            (_, index) => (
              <i
                key={index}
                data-filled={
                  index < Math.ceil(Number(game.movementRemaining))
                    ? "true"
                    : "false"
                }
              />
            ),
          )}
        </div>
        <small>BEFORE · BETWEEN · AFTER</small>
      </div>

      {reaction ? (
        <div className={styles.reactionBar} role="alert">
          <div>
            <span>RESPONSE OPEN</span>
            <strong>{reaction.title}</strong>
            <small>{reaction.detail}</small>
          </div>
          <button
            type="button"
            data-choice="intercept"
            onClick={() => onReaction("intercept")}
          >
            <b>↯</b>
            <strong>INTERCEPT</strong>
            <small>{reaction.interceptEffect}</small>
          </button>
          <button
            type="button"
            data-choice="decline"
            onClick={() => onReaction("decline")}
          >
            <strong>LET IT LAND</strong>
            <small>{reaction.declineEffect}</small>
          </button>
        </div>
      ) : (
        <div className={styles.cards} aria-label="Tactical actions">
          {CARD_ORDER.map((cardId) => {
            const card = DIRECTOR_CARDS[cardId];
            if (!card) return null;
            const used = Boolean(game.cardUses?.[cardId]);
            const actionsSpent = game.actionsRemaining <= 0;
            const jammed =
              game.player.jammed && cardId === "skip-step";
            const noTarget =
              card.target !== "self" &&
              !used &&
              !actionsSpent &&
              !jammed &&
              getDirectorCardTargets(game, cardId).length === 0;
            const disabled =
              game.phase !== "player" ||
              used ||
              actionsSpent ||
              jammed ||
              noTarget;

            return (
              <button
                key={cardId}
                type="button"
                className={styles.card}
                data-card={cardId}
                data-selected={selectedCard === cardId ? "true" : "false"}
                data-used={used ? "true" : "false"}
                data-tempo={card.tempo.toLowerCase()}
                disabled={disabled}
                onClick={() => onCard(cardId)}
                aria-label={`${card.name}, ${card.shape}, ${card.short}, source ${card.source}`}
              >
                <b>{String(card.shape).slice(0, 3)}</b>
                <span>{card.glyph}</span>
                <strong>{card.name}</strong>
                <small>
                  {actionsSpent
                    ? "ACTIONS SPENT"
                    : jammed
                      ? "BLOCKED BY STATIC"
                      : noTarget
                        ? "NO LEGAL TARGET"
                        : card.short}
                </small>
                <em>{used ? "USED" : card.source}</em>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.turnButtonSlot}>
        <div
          className={styles.actionMeter}
          aria-label={`${game.actionsRemaining} of two actions remain`}
        >
          <span>ACTIONS</span>
          <b aria-hidden="true">
            {[0, 1].map((index) => (
              <i
                key={index}
                data-filled={
                  index < Number(game.actionsRemaining) ? "true" : "false"
                }
              />
            ))}
          </b>
        </div>
        {game.phase === "player" ? (
          <button
            type="button"
            className={styles.endTurnButton}
            onClick={onEndTurn}
            data-testid="end-turn"
          >
            <span>PRIMARY + SUPPORT</span>
            <strong>END TURN</strong>
            <small>ENEMIES COMMIT</small>
          </button>
        ) : game.phase === "reaction" ? (
          <div className={styles.enemyTurnLock} data-response="true">
            <span>YOUR RESPONSE</span>
            <strong>CHOOSE</strong>
          </div>
        ) : reducedMotion && game.phase === "enemy" ? (
          <button
            type="button"
            className={styles.endTurnButton}
            onClick={onAdvanceEnemy}
            data-testid="advance-enemy"
          >
            <span>ENEMY COMMITMENT</span>
            <strong>NEXT</strong>
          </button>
        ) : (
          <div className={styles.enemyTurnLock}>
            <span>ENEMY COMMITMENT</span>
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
      <div>
        <p>BARCODE WORLD</p>
        <h1>FRACTURED GATE</h1>
        <div className={styles.introSequence} aria-hidden="true">
          <span>⚔</span>
          <b>→</b>
          <span>⌁</span>
          <b>→</b>
          <strong>G</strong>
        </div>
        <small>
          REACH THE GATE → START THE LOCK → SURVIVE THE ASSAULT
        </small>
        <b className={styles.buildGrammar}>
          BATTLE → EXPLORATION
          <i>IMPACT CREATES OPENINGS · OPENINGS BECOME ROUTES</i>
        </b>
        <span className={styles.srOnly}>
          SAVE THE GATE. Anchors are optional route tools. RAM destroys one
          Gate lock whenever its smash lands.
        </span>
        <button type="button" onClick={onStart}>
          DROP IN
        </button>
      </div>
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
      aria-label="Pause and controls"
    >
      <div>
        <span>PAUSED</span>
        <h2>FIELD KEYS</h2>
        <div className={styles.helpGrid}>
          <p>
            <b>◇</b>
            <span>MOVE</span>
          </p>
          <p>
            <b>▣</b>
            <span>COVER</span>
          </p>
          <p>
            <b>↯</b>
            <span>INTENT</span>
          </p>
          <p>
            <b>ϟ</b>
            <span>HAZARD</span>
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => onMotion(event.target.checked)}
          />
          Reduce motion / manual enemy actions
        </label>
        <div className={styles.pauseActions}>
          <button type="button" onClick={onReset}>
            RESET
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
  const powered = ["anchor-a", "anchor-b"].filter((id) =>
    anchorIsPowered(game, id),
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
        <span>
          {game.result.type === "victory"
            ? "SIGNAL LOCK"
            : game.result.type === "retreat"
              ? "TACTICAL WITHDRAWAL"
              : "BATTLE LOST"}
        </span>
        <h2>{game.result.title}</h2>
        <p>{game.result.cause}</p>
        <div className={styles.resultStats}>
          <b>TURN {game.turn}</b>
          <b>
            GATE {game.gate.integrity}/{game.gate.maxIntegrity}
          </b>
          <b>ROUTE TOOLS {powered}/2</b>
        </div>
        <button type="button" onClick={onReset} data-testid="reset-result">
          REPLAY
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
  const [impactTarget, setImpactTarget] = useState<string | null>(null);
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
    const intent = game.intents[game.enemyCursor];
    const timer = window.setTimeout(
      () => {
        setImpactTarget(intent?.targetId ?? null);
        setGame((current) => advanceDirectorEnemyTurn(current));
      },
      680,
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
    game.intents,
  ]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedCard) {
        setSelectedCard(null);
        setHoveredTarget(null);
        setSelectedFocus("player");
      } else if (!intro && !game.result) {
        setPaused((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.result, intro, selectedCard]);

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
      setImpactTarget("player");
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
    setImpactTarget(focusId);
    setGame((current) => playDirectorCard(current, selectedCard, focusId));
    clearSelection(focusId);
  }

  function handleFocus(focusId: string) {
    if (selectedCard) {
      setSelectedCard(null);
      setHoveredTarget(null);
    }
    setSelectedFocus((current) => (current === focusId ? null : focusId));
  }

  function handleTile(tileId: string) {
    if (selectedCard || game.phase !== "player") return;
    const reachable = getDirectorReachableTiles(game);
    if (reachable[tileId]) {
      setGame((current) => moveDirectorPlayer(current, tileId));
      clearSelection("player");
    }
  }

  function handleUseObject(objectId: string) {
    setImpactTarget(objectId);
    setGame((current) => activateDirectorObject(current, objectId));
    clearSelection(objectId);
  }

  function handleUseContext() {
    setImpactTarget("divider");
    setGame((current) => activateDirectorContextAction(current));
    clearSelection("player");
  }

  function handleReaction(choice: "intercept" | "decline") {
    const reaction = getDirectorReaction(game);
    setImpactTarget(
      choice === "intercept" ? reaction?.actorId ?? null : null,
    );
    setGame((current) => resolveDirectorReaction(current, choice));
    clearSelection(null);
  }

  function handleEndTurn() {
    clearSelection(null);
    setImpactTarget(null);
    setGame((current) => beginDirectorEnemyTurn(current));
  }

  function handleReset() {
    setGame((current) => resetDirectorState(current));
    setIntro(false);
    setPaused(false);
    setImpactTarget(null);
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
          impactTarget={impactTarget}
          onTile={handleTile}
          onFocus={handleFocus}
          onTarget={handleTarget}
          onHoverTarget={setHoveredTarget}
          onUseObject={handleUseObject}
          onUseContext={handleUseContext}
        />
        <CardDock
          game={game}
          selectedCard={selectedCard}
          hoveredTarget={hoveredTarget}
          onCard={handleCard}
          onEndTurn={handleEndTurn}
          onAdvanceEnemy={() => {
            setImpactTarget(
              game.intents[game.enemyCursor]?.targetId ?? null,
            );
            setGame((current) => advanceDirectorEnemyTurn(current));
          }}
          onReaction={handleReaction}
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
