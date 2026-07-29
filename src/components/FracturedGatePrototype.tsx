"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  BOARD_FOCUSES,
  BOARD_TILES,
  BUILDS,
  CARDS,
  CORE_RULES,
  advanceEnemyTurn,
  availableCommand,
  availableEnemyCommand,
  beginEnemyTurn,
  changeFracturedGateBuild,
  createFracturedGateState,
  discardToRetain,
  getAvailableContextCards,
  getCompatibleCards,
  getContextActions,
  getFocusDetails,
  getFocusGuidance,
  getMissionGuidance,
  getPositionCoordinates,
  getReachableTiles,
  getResponseOptions,
  performAction,
  previewAction,
  refocusCards,
  resetFracturedGate,
  resolveEnemyAction,
  type FracturedGateRecord,
  type FracturedGateState,
} from "@/lib/barcode-world/fractured-gate-engine.mjs";
import styles from "./FracturedGatePrototype.module.css";

type PositionedStyle = CSSProperties & {
  "--x": string;
  "--y": string;
};

const OBJECT_ORDER = [
  "west-exit",
  "field-cache",
  "upper-crossing",
  "cracked-divider",
  "gate-actuator",
  "lift-relay",
  "service-gap",
  "defensive-bollard",
  "gate",
];

const OBJECT_VISUALS: Record<
  string,
  { glyph: string; short: string; kind: string; badge: string }
> = {
  "west-exit": {
    glyph: "↤",
    short: "EXIT",
    kind: "exit",
    badge: "RETREAT",
  },
  "field-cache": {
    glyph: "◇",
    short: "CACHE",
    kind: "cache",
    badge: "OPTIONAL",
  },
  "upper-crossing": {
    glyph: "⌁",
    short: "BROKEN SPAN",
    kind: "opening",
    badge: "ROUTE",
  },
  "cracked-divider": {
    glyph: "╫",
    short: "DIVIDER",
    kind: "terrain",
    badge: "TERRAIN",
  },
  "gate-actuator": {
    glyph: "A",
    short: "ACTUATOR",
    kind: "system",
    badge: "DEVICE",
  },
  "lift-relay": {
    glyph: "L",
    short: "LIFT RELAY",
    kind: "system",
    badge: "DEVICE",
  },
  "service-gap": {
    glyph: "⇥",
    short: "SERVICE GAP",
    kind: "opening",
    badge: "CLOSED ROUTE",
  },
  "defensive-bollard": {
    glyph: "B",
    short: "BOLLARD",
    kind: "system",
    badge: "DEVICE",
  },
  gate: {
    glyph: "G",
    short: "FRACTURED GATE",
    kind: "objective",
    badge: "MISSION TARGET",
  },
};

const ENEMY_VISUALS: Record<
  string,
  { glyph: string; short: string; role: string }
> = {
  breacher: {
    glyph: "BR",
    short: "BREACHER",
    role: "ENEMY · GATE THREAT",
  },
  guard: {
    glyph: "GD",
    short: "GUARD",
    role: "ENEMY · PROTECTOR",
  },
  controller: {
    glyph: "EC",
    short: "CONTROLLER",
    role: "ENEMY · SYSTEMS UNIT",
  },
  pressure: {
    glyph: "PR",
    short: "PRESSURE",
    role: "ENEMY · RANGED FLANKER",
  },
};

const BUILD_SOURCES: Record<
  string,
  {
    focusId: string;
    title: string;
    major: string;
    minor: string;
    physical: string;
  }
> = {
  "battle-exploration": {
    focusId: "cracked-divider",
    title: "Force → usable breach",
    major: "Battle creates opposed physical contact.",
    minor: "Exploration converts the changed geometry into a route.",
    physical: "Breacher + Cracked Divider",
  },
  "exploration-battle": {
    focusId: "upper-crossing",
    title: "Natural route → defended landing",
    major: "Exploration prepares real handholds across the broken span.",
    minor: "Battle protects or contests the landing.",
    physical: "Broken Upper Span",
  },
  "battle-hacking": {
    focusId: "breacher",
    title: "Contact → exposed hardware",
    major: "Battle exposes the Breacher's impact regulator.",
    minor: "Hacking suppresses its automatic reset.",
    physical: "Breacher regulator",
  },
  "hacking-battle": {
    focusId: "gate-actuator",
    title: "Local Control → physical Output",
    major: "Hacking establishes temporary Actuator Control.",
    minor: "Battle holds access and converts the bollard into force.",
    physical: "Gate Actuator + defensive bollard",
  },
  "exploration-hacking": {
    focusId: "service-gap",
    title: "Physical relationship → held opening",
    major: "Exploration prepares the obscured service relationship.",
    minor: "Hacking suppresses the connected shutter.",
    physical: "Service Gap + shutter",
  },
  "hacking-exploration": {
    focusId: "lift-relay",
    title: "System Output → temporary geometry",
    major: "Hacking aligns the local service lift.",
    minor: "Exploration reads the safe crossing and reset window.",
    physical: "Lift Relay + upper gap",
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

function positionStyle(positionId: string): PositionedStyle {
  const point = getPositionCoordinates(positionId);
  return {
    "--x": `${point.x}%`,
    "--y": `${point.y}%`,
  };
}

function phaseCopy(game: FracturedGateState) {
  if (game.phase === "player") {
    const mission = getMissionGuidance(game);
    return {
      kicker: "YOUR TURN",
      title: mission.nextTitle,
      text: mission.nextText,
    };
  }
  if (game.phase === "discard") {
    return {
      kicker: "RETAIN SEVEN",
      title: "Choose what leaves the hand.",
      text: "Draw completed automatically. Discard until seven cards remain.",
    };
  }
  if (game.phase === "enemy" && game.pendingEnemyAction) {
    return {
      kicker: "ENEMY ACTION REVEALED",
      title: `${game.enemies[game.pendingEnemyAction.actorId].name} begins ${
        game.pendingEnemyAction.name
      }.`,
      text:
        "The action, target, route, and Tempo are visible now because the action has begun. Choose a legal Response or let it resolve.",
    };
  }
  if (game.phase === "enemy") {
    return {
      kicker: "ENEMY TURN",
      title: "The formation is evaluating the changed battlefield.",
      text:
        "No path, target, card, or destination is shown before an enemy action begins unless a skill has revealed a current read.",
    };
  }
  return {
    kicker: "BATTLE COMPLETE",
    title: game.result?.title ?? "Result",
    text: game.result?.cause ?? "Inspect the battle-local result.",
  };
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
      className={styles.gatePips}
      aria-label={`Gate ${stability} of 3 Stability, ${status}`}
    >
      {[1, 2, 3].map((pip) => (
        <i
          key={pip}
          className={pip <= stability ? styles.pipFull : styles.pipEmpty}
          aria-hidden="true"
        />
      ))}
      <b>{stability}/3</b>
    </span>
  );
}

function MissionBrief({ game }: { game: FracturedGateState }) {
  const mission = getMissionGuidance(game);
  return (
    <section className={styles.missionBrief} aria-label="Mission briefing">
      <div className={styles.missionMain}>
        <span>PRIMARY MISSION</span>
        <strong>{mission.objective}</strong>
        <p>
          Reach the <b>GATE</b> marker on the east side, begin{" "}
          <b>Stabilize Gate</b>, then keep that Slow Work alive through the
          Enemy Turn.
        </p>
      </div>
      <div className={styles.missionOutcomes}>
        <div>
          <span>WIN</span>
          <p>{mission.win}</p>
        </div>
        <div>
          <span>LOSE</span>
          <p>{mission.lose}</p>
        </div>
        <div>
          <span>OPTIONAL</span>
          <p>{mission.optional}</p>
        </div>
      </div>
      <div className={styles.missionNow}>
        <span>RIGHT NOW</span>
        <strong>{mission.nextTitle}</strong>
        <p>{mission.nextText}</p>
      </div>
    </section>
  );
}

function TurnDirector({ game }: { game: FracturedGateState }) {
  const copy = phaseCopy(game);
  return (
    <section
      className={styles.turnDirector}
      aria-label="Current battle phase"
      aria-live="polite"
    >
      <div>
        <span>{copy.kicker}</span>
        <strong>{copy.title}</strong>
        <p>{copy.text}</p>
      </div>
      <aside>
        <span>ENEMY INTENT</span>
        <strong>
          {game.currentEnemyReveal
            ? `${game.enemies[game.currentEnemyReveal.actorId].name}: ${
                game.currentEnemyReveal.name
              }`
            : "HIDDEN UNTIL REVEALED"}
        </strong>
        <small>
          Enemy roles and visible state remain readable. Their decisions are
          not permanent forecasts.
        </small>
      </aside>
    </section>
  );
}

function BattleBoard({
  game,
  selectedFocus,
  preview,
  onFocus,
}: {
  game: FracturedGateState;
  selectedFocus: string;
  preview: FracturedGateRecord | null;
  onFocus: (focusId: string) => void;
}) {
  const reachable = getReachableTiles(game);
  const playerPath = new Set(preview?.path ?? []);
  const revealedEnemyPath = new Set(
    game.currentEnemyReveal?.path && game.phase === "enemy"
      ? game.currentEnemyReveal.path
      : [],
  );
  const activeSource = BUILD_SOURCES[game.buildId].focusId;

  return (
    <section className={styles.boardPanel}>
      <div className={styles.boardHeader}>
        <div>
          <span>TACTICAL FIELD</span>
          <strong>
            Reach the east-side GATE before its Stability falls to zero.
          </strong>
        </div>
        <p>
          Select anything to identify it. Purple marks your optional build
          source; red pieces are enemies.
        </p>
      </div>
      <div className={styles.boardViewport}>
        <div
          className={styles.board}
          aria-label="The Fractured Gate tactical board"
        >
          <div className={styles.gateStructure} aria-hidden="true">
            <span />
            <span />
            <strong>GATE</strong>
          </div>
          <div className={styles.upperStructure} aria-hidden="true" />
          <div className={styles.trenchStructure} aria-hidden="true" />
          <div className={styles.trackLine} aria-hidden="true" />

          {Object.values(BOARD_TILES).map((tile: FracturedGateRecord) => {
            const isReachable = Boolean(reachable[tile.id]);
            const onPlayerPath = playerPath.has(tile.id);
            const onEnemyPath = revealedEnemyPath.has(tile.id);
            const occupied =
              game.player.position === tile.id ||
              Object.values(
                game.enemies as Record<string, FracturedGateRecord>,
              ).some(
                (enemy) =>
                  enemy.status !== "disabled" && enemy.position === tile.id,
              );
            return (
              <button
                key={tile.id}
                type="button"
                data-terrain={tile.terrain}
                className={[
                  styles.tile,
                  styles[`terrain_${tile.terrain}`],
                  tile.cover ? styles.coverTile : "",
                  isReachable ? styles.reachableTile : "",
                  selectedFocus === tile.id ? styles.selectedTile : "",
                  onPlayerPath ? styles.playerPathTile : "",
                  onEnemyPath ? styles.revealedEnemyPathTile : "",
                  occupied ? styles.occupiedTile : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={positionStyle(tile.id)}
                aria-label={`${tile.name}; ${titleCase(tile.terrain)}${
                  tile.cover ? "; cover" : ""
                }${
                  isReachable
                    ? `; reachable for ${reachable[tile.id].cost} movement`
                    : ""
                }`}
                onClick={() => onFocus(tile.id)}
              >
                <span aria-hidden="true" />
                {isReachable && game.phase === "player" ? (
                  <b>{reachable[tile.id].cost}</b>
                ) : null}
                {onEnemyPath ? <em>REVEALED</em> : null}
              </button>
            );
          })}

          {OBJECT_ORDER.map((focusId) => {
            const focus = BOARD_FOCUSES[focusId];
            const visual = OBJECT_VISUALS[focusId];
            const isOpenRoute =
              (focusId === "cracked-divider" &&
                game.divider.status === "breached") ||
              (focusId === "upper-crossing" &&
                game.upperCrossing.prepared) ||
              (focusId === "service-gap" &&
                game.serviceGap.shutter === "open");
            const hidden =
              (focusId === "field-cache" &&
                game.cache.status !== "present") ||
              (focusId === "defensive-bollard" &&
                game.bollard.status === "broken");
            if (hidden) return null;
            return (
              <button
                key={focusId}
                type="button"
                className={[
                  styles.objectMarker,
                  styles[`object_${visual.kind}`],
                  isOpenRoute ? styles.openRouteMarker : "",
                  selectedFocus === focusId ? styles.selectedFocus : "",
                  activeSource === focusId ? styles.buildSource : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={positionStyle(focus.tileId)}
                aria-label={`${focus.name}; ${getFocusDetails(game, focusId)?.status}`}
                onClick={() => onFocus(focusId)}
              >
                <span>{visual.glyph}</span>
                <strong>{visual.short}</strong>
                <small>
                  {activeSource === focusId ? "YOUR BUILD SOURCE" : visual.badge}
                </small>
              </button>
            );
          })}

          {Object.entries(
            game.enemies as Record<string, FracturedGateRecord>,
          ).map(
            ([enemyId, enemy]) => {
              const visual = ENEMY_VISUALS[enemyId];
              const isActing =
                game.currentEnemyReveal?.actorId === enemyId &&
                game.phase === "enemy";
              return (
                <button
                  key={enemyId}
                  type="button"
                  className={[
                    styles.enemyPiece,
                    styles[`enemy_${enemyId}`],
                    selectedFocus === enemyId ? styles.selectedPiece : "",
                    enemy.status === "disabled" ? styles.disabledPiece : "",
                    isActing ? styles.actingPiece : "",
                    activeSource === enemyId ? styles.buildSourcePiece : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={positionStyle(enemy.position)}
                  aria-label={`${enemy.name}; ${enemy.status}; ${enemy.condition} Condition; ${enemy.guard} Guard`}
                  onClick={() => onFocus(enemyId)}
                >
                  <span>{visual.glyph}</span>
                  <strong>{visual.short}</strong>
                  <small>
                    {visual.role}
                    <br />C {enemy.condition} · G {enemy.guard}
                  </small>
                  {isActing ? <em>ACTING</em> : null}
                </button>
              );
            },
          )}

          <button
            type="button"
            className={[
              styles.playerPiece,
              selectedFocus === "player" ? styles.selectedPiece : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={positionStyle(game.player.position)}
            aria-label={`Player; ${game.player.condition} Condition; ${game.player.guard} Guard`}
            onClick={() => onFocus("player")}
          >
            <span>6</span>
            <strong>PLAYER</strong>
            <small>
              C {game.player.condition} · G {game.player.guard}
            </small>
          </button>

          {game.lastClash ? (
            <div
              className={styles.clashBanner}
              role="status"
              aria-live="assertive"
            >
              <span>{game.lastClash.title}</span>
              <strong>{game.lastClash.participants}</strong>
              <p>{game.lastClash.summary}</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.boardLegend} aria-label="Battlefield legend">
        <span><i className={styles.legendReachable} /> Reachable now</span>
        <span><i className={styles.legendPath} /> Selected route</span>
        <span><i className={styles.legendEnemy} /> Revealed enemy action only</span>
        <span><i className={styles.legendBuild} /> Current build source</span>
      </div>
    </section>
  );
}

function BuildSourceCard({
  game,
  onFocus,
}: {
  game: FracturedGateState;
  onFocus: (focusId: string) => void;
}) {
  const source = BUILD_SOURCES[game.buildId];
  return (
    <button
      type="button"
      className={styles.buildSourceCard}
      onClick={() => onFocus(source.focusId)}
    >
      <span>CURRENT BUILD SOURCE</span>
      <strong>{source.title}</strong>
      <p>{source.physical}</p>
      <small>Revealed by Major: {source.major}</small>
      <small>Enabled by Minor: {source.minor}</small>
    </button>
  );
}

function SelectionPanel({
  game,
  focusId,
  selectedActionId,
  attachedCard,
  preview,
  onAction,
  onCard,
  onExecute,
}: {
  game: FracturedGateState;
  focusId: string;
  selectedActionId: string | null;
  attachedCard: string | null;
  preview: FracturedGateRecord | null;
  onAction: (actionId: string) => void;
  onCard: (cardId: string | null) => void;
  onExecute: () => void;
}) {
  const focus = getFocusDetails(game, focusId);
  const guidance = getFocusGuidance(game, focusId);
  const actions = getContextActions(game, focusId);
  const compatible = selectedActionId
    ? getCompatibleCards(game, selectedActionId)
    : [];
  const contextCards = selectedActionId
    ? getAvailableContextCards(game, selectedActionId)
    : [];
  if (!focus || !guidance) return null;

  return (
    <section className={styles.selectionPanel}>
      <div className={styles.panelHeading}>
        <span>SELECTED · {guidance.typeLabel}</span>
        <strong>{focus.name}</strong>
      </div>
      <b className={styles.focusStatus}>{focus.status}</b>
      <div className={styles.focusGuidance}>
        <div>
          <span>WHAT IT IS</span>
          <p>{guidance.what}</p>
        </div>
        <div>
          <span>WHY IT MATTERS</span>
          <p>{guidance.why}</p>
        </div>
        <div>
          <span>HOW TO USE OR ANSWER IT</span>
          <p>{guidance.how}</p>
        </div>
        <div className={styles.guidanceRisk}>
          <span>RISK / TRADEOFF</span>
          <p>{guidance.risk}</p>
        </div>
      </div>
      {focus.intel ? (
        <div className={styles.intelRead}>
          <span>REVEALED BY HACKING</span>
          <strong>{focus.intel.text}</strong>
          <small>{focus.intel.caveat}</small>
        </div>
      ) : null}

      {game.phase === "player" ? (
        <>
          <div className={styles.actionHeading}>
            <span>
              {actions.length
                ? "ACTIONS FROM YOUR CURRENT POSITION"
                : "NO DIRECT ACTION HERE NOW"}
            </span>
          </div>
          <div className={styles.contextActions}>
            {actions.length ? (
              actions.map((action: FracturedGateRecord) => (
                <button
                  key={action.id}
                  type="button"
                  className={
                    selectedActionId === action.id ? styles.activeAction : ""
                  }
                  disabled={!action.legal}
                  onClick={() => onAction(action.id)}
                >
                  <span>
                    {action.kind} · {action.cost} Command
                  </span>
                  <strong>{action.name}</strong>
                  <p>{action.description}</p>
                  <small>
                    {action.legal
                      ? `AVAILABLE · ${action.band} ${action.tempo}`
                      : `NOT READY · ${action.reason}`}
                  </small>
                </button>
              ))
            ) : (
              <p className={styles.noActions}>
                Inspectable physical source. No build-specific or baseline
                action is legal here now.
              </p>
            )}
          </div>

          {selectedActionId && (compatible.length || contextCards.length) ? (
            <div className={styles.modifierPicker}>
              <span>OPTIONAL CARD / CONTEXT</span>
              <div>
                {[...compatible, ...contextCards].map((cardId) => (
                  <button
                    key={cardId}
                    type="button"
                    className={
                      attachedCard === cardId ? styles.activeModifier : ""
                    }
                    onClick={() =>
                      onCard(attachedCard === cardId ? null : cardId)
                    }
                  >
                    <strong>{cardName(cardId)}</strong>
                    <small>
                      {CARDS[cardId].role} · +{CARDS[cardId].cost} Command
                    </small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {preview ? (
            <div
              className={styles.preview}
              aria-label="Action preview"
              data-testid="action-preview"
            >
              <div className={styles.previewTop}>
                <div>
                  <span>BEFORE YOU COMMIT</span>
                  <strong>{preview.action.name}</strong>
                </div>
                <strong>
                  {preview.legal
                    ? `${preview.totalCost} Command`
                    : "BLOCKED"}
                </strong>
              </div>
              {preview.legal ? (
                <>
                  <div className={styles.tempoRead}>
                    <span>TEMPO</span>
                    <strong>
                      {preview.tempo.band} {preview.tempo.score} ·{" "}
                      {preview.tempo.relation}
                    </strong>
                    {preview.tempo.routeReason ? (
                      <small>{preview.tempo.routeReason}</small>
                    ) : null}
                    <small>
                      Concealed factors: {preview.tempo.unknownFactors}
                    </small>
                  </div>
                  <ul>
                    <li>{preview.action.description}</li>
                    {preview.expected.map((line: string) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {preview.risks.length ? (
                    <div className={styles.riskBox}>
                      <span>WHAT CAN GO WRONG</span>
                      {preview.risks.map((risk: string) => (
                        <p key={risk}>{risk}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.executeBar}>
                    <small>
                      After: {preview.remainingCommand}/32 Command
                      {selectedActionId === "move"
                        ? ` · ${
                            game.movementRemaining - preview.movementCost
                          } movement`
                        : ""}
                    </small>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={onExecute}
                    >
                      EXECUTE NOW
                    </button>
                  </div>
                </>
              ) : (
                <p className={styles.previewError}>{preview.error}</p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ResponsePanel({
  game,
  onRespond,
}: {
  game: FracturedGateState;
  onRespond: (responseId: string | null) => void;
}) {
  const pending = game.pendingEnemyAction;
  if (!pending) return null;
  const options = getResponseOptions(game);
  return (
    <section className={styles.responsePanel} aria-label="Response window">
      <div className={styles.panelHeading}>
        <span>RESPONSE WINDOW</span>
        <strong>{pending.name}</strong>
      </div>
      <p>
        {game.enemies[pending.actorId].name} revealed a {pending.band}{" "}
        {pending.tempo} action targeting {titleCase(pending.targetId)}.
      </p>
      <div className={styles.responseOptions}>
        {options.map((option: FracturedGateRecord) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onRespond(option.id)}
          >
            <span>
              {option.band} {option.tempo} · {option.cost} Command
            </span>
            <strong>{option.name}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.declineButton}
        onClick={() => onRespond(null)}
      >
        LET ACTION RESOLVE
      </button>
    </section>
  );
}

function LocalResolution({ game }: { game: FracturedGateState }) {
  if (!game.lastExchange) return null;
  return (
    <section className={styles.localResolution} aria-label="Local Tempo result">
      <div className={styles.panelHeading}>
        <span>LOCAL TEMPO RESULT</span>
        <strong>{game.lastExchange.action}</strong>
      </div>
      <div className={styles.tempoPair}>
        <div>
          <span>Action</span>
          <strong>{game.lastExchange.actionTempo}</strong>
        </div>
        <div>
          <span>Relation</span>
          <strong>{titleCase(game.lastExchange.relation)}</strong>
        </div>
        <div>
          <span>Response</span>
          <strong>
            {game.lastExchange.response
              ? `${game.lastExchange.response} · ${
                  game.lastExchange.responseTempo
                }`
              : "None"}
          </strong>
        </div>
      </div>
      <p>{game.lastExchange.summary}</p>
    </section>
  );
}

function HandPanel({
  game,
  selectedActionId,
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
  selectedActionId: string | null;
  attachedCard: string | null;
  refocusMode: boolean;
  refocusSelection: string[];
  onCard: (cardId: string) => void;
  onBeginRefocus: () => void;
  onCancelRefocus: () => void;
  onCommitRefocus: () => void;
  onDiscard: (cardId: string) => void;
}) {
  const compatible = new Set(
    selectedActionId ? getCompatibleCards(game, selectedActionId) : [],
  );
  const responseIds = new Set(
    getResponseOptions(game)
      .map((option: FracturedGateRecord) => option.cardId)
      .filter(Boolean),
  );
  return (
    <section className={styles.handPanel} aria-label="Prepared card hand">
      <div className={styles.handHeading}>
        <div>
          <span>PREPARED HAND</span>
          <strong>
            {game.hand.length} cards · Deck{" "}
            {Math.max(0, game.deck.length - game.drawIndex)} · Discard{" "}
            {game.discard.length}
          </strong>
        </div>
        {game.phase === "player" ? (
          <div className={styles.handTools}>
            {!refocusMode ? (
              <button
                type="button"
                disabled={game.refocusUsed || game.command < 4}
                onClick={onBeginRefocus}
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
                  disabled={
                    refocusSelection.length < 1 ||
                    refocusSelection.length > 2
                  }
                  onClick={onCommitRefocus}
                >
                  REPLACE {refocusSelection.length}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {game.phase === "discard" ? (
        <p className={styles.retainNotice} role="alert">
          Draw complete. Choose {game.hand.length - CORE_RULES.retainLimit} card
          {game.hand.length - CORE_RULES.retainLimit === 1 ? "" : "s"} to
          discard.
        </p>
      ) : null}
      <div className={styles.cards}>
        {game.hand.map((cardId: string, index: number) => {
          const card = CARDS[cardId];
          const selectable =
            game.phase === "discard" ||
            refocusMode ||
            compatible.has(cardId) ||
            responseIds.has(cardId);
          return (
            <button
              key={`${cardId}-${index}`}
              type="button"
              className={[
                styles.card,
                compatible.has(cardId) ? styles.compatibleCard : "",
                responseIds.has(cardId) ? styles.responseCard : "",
                attachedCard === cardId ? styles.selectedCard : "",
                refocusSelection.includes(cardId)
                  ? styles.refocusCard
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!selectable}
              onClick={() =>
                game.phase === "discard"
                  ? onDiscard(cardId)
                  : onCard(cardId)
              }
            >
              <span>
                {card.role} · {card.cost} Command
              </span>
              <strong>{card.name}</strong>
              <p>{card.effect}</p>
              {compatible.has(cardId) ? <small>COMPATIBLE</small> : null}
              {responseIds.has(cardId) ? <small>RESPONSE READY</small> : null}
              {refocusSelection.includes(cardId) ? (
                <small>REFOCUS SELECTED</small>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BattleLog({ game }: { game: FracturedGateState }) {
  return (
    <section className={styles.logPanel}>
      <div className={styles.panelHeading}>
        <span>CAUSAL BATTLE LOG</span>
        <strong>Latest state changes</strong>
      </div>
      <ol>
        {[...game.log]
          .reverse()
          .slice(0, 12)
          .map((event: FracturedGateRecord) => (
            <li key={event.id}>
              <span>
                TURN {event.turn} · {event.side.toUpperCase()}
                {event.tempo ? ` · ${event.tempo}` : ""}
              </span>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              {event.opposedBy ? (
                <small>Opposed by: {event.opposedBy}</small>
              ) : null}
            </li>
          ))}
      </ol>
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
  if (!result) return null;
  return (
    <section className={styles.resultsPanel} aria-label="Battle Results">
      <span>BATTLE RESULTS</span>
      <h2>{result.title}</h2>
      <p>{result.cause}</p>
      <div className={styles.resultGrid}>
        <div>
          <span>Objective truth</span>
          <strong>{result.objective}</strong>
        </div>
        <div>
          <span>Player</span>
          <strong>{result.player}</strong>
        </div>
        <div>
          <span>Field Cache</span>
          <strong>{result.cache}</strong>
        </div>
        <div>
          <span>Environment</span>
          <strong>{result.environment}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Enemies</span>
          <strong>{result.enemies}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Turning point</span>
          <strong>{result.turningPoint}</strong>
        </div>
        <div className={styles.wideResult}>
          <span>Meaningful tradeoff</span>
          <strong>{result.tradeoff}</strong>
        </div>
      </div>
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
  const [selectedActionId, setSelectedActionId] = useState<string | null>(
    "guard",
  );
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
    if (
      game.phase !== "enemy" ||
      game.pendingEnemyAction ||
      game.result ||
      reducedMotion
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setGame((current) => advanceEnemyTurn(current)),
      950,
    );
    return () => window.clearTimeout(timer);
  }, [
    game.phase,
    game.pendingEnemyAction,
    game.result,
    game.log.length,
    game.enemyCommand,
    reducedMotion,
  ]);

  const preview = useMemo(() => {
    if (!selectedActionId || game.phase !== "player") return null;
    return previewAction(
      game,
      selectedActionId,
      selectedFocus,
      attachedCard,
    );
  }, [game, selectedActionId, selectedFocus, attachedCard]);

  function resetInteraction(nextFocus = "player") {
    setSelectedFocus(nextFocus);
    setSelectedActionId(null);
    setAttachedCard(null);
    setRefocusMode(false);
    setRefocusSelection([]);
  }

  function handleFocus(focusId: string) {
    setSelectedFocus(focusId);
    setAttachedCard(null);
    if (game.phase !== "player") {
      setSelectedActionId(null);
      return;
    }
    const actions = getContextActions(game, focusId);
    if (BOARD_TILES[focusId]) {
      setSelectedActionId(
        actions.find((action: FracturedGateRecord) => action.id === "move")
          ?.id ?? null,
      );
      return;
    }
    const firstLegal = actions.find(
      (action: FracturedGateRecord) => action.legal,
    );
    setSelectedActionId(firstLegal?.id ?? null);
  }

  function executeSelected() {
    if (!selectedActionId || !preview?.legal) return;
    const next = performAction(
      game,
      selectedActionId,
      selectedFocus,
      attachedCard,
    );
    setGame(next);
    setAttachedCard(null);
    if (next.phase === "result") {
      setSelectedActionId(null);
      return;
    }
    const nextActions = getContextActions(next, selectedFocus);
    const stillLegal = nextActions.find(
      (action: FracturedGateRecord) =>
        action.id === selectedActionId && action.legal,
    );
    setSelectedActionId(stillLegal ? selectedActionId : null);
  }

  function handleCard(cardId: string) {
    if (game.pendingEnemyAction) {
      const response = getResponseOptions(game).find(
        (candidate: FracturedGateRecord) => candidate.cardId === cardId,
      );
      if (response) {
        setGame((current) => resolveEnemyAction(current, response.id));
      }
      return;
    }
    if (refocusMode) {
      setRefocusSelection((current) =>
        current.includes(cardId)
          ? current.filter((candidate) => candidate !== cardId)
          : current.length < 2
            ? [...current, cardId]
            : current,
      );
      return;
    }
    if (
      selectedActionId &&
      getCompatibleCards(game, selectedActionId).includes(cardId)
    ) {
      setAttachedCard((current) => (current === cardId ? null : cardId));
    }
  }

  function commitRefocus() {
    const next = refocusCards(game, refocusSelection);
    setGame(next);
    if (!next.warning) {
      setRefocusMode(false);
      setRefocusSelection([]);
    }
  }

  function resetSameState() {
    setGame((current) => resetFracturedGate(current));
    resetInteraction();
  }

  const build = buildFor(game.buildId);
  const phase = phaseCopy(game);

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
            Save the Gate before the enemy squad collapses it.
          </p>
        </div>
        <div className={styles.boundaryBadges} aria-label="Prototype boundary">
          <span>PRIVATE DEV ROUTE</span>
          <span>SOLO TEST</span>
          <span>NONCANONICAL</span>
          <span>RESETTABLE</span>
        </div>
      </header>

      <MissionBrief game={game} />

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
            disabled={game.phase === "enemy"}
          >
            {BUILDS.map((candidate: FracturedGateRecord) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Movement test value: <strong>{build.movement}</strong> ·{" "}
          {build.movementReason}
        </p>
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
          className={styles.resetButton}
          onClick={resetSameState}
        >
          RESET SAME STATE
        </button>
      </section>

      <TurnDirector game={game} />

      <section className={styles.hud} aria-label="Battle status">
        <div>
          <span>Objective</span>
          <strong>Reach GATE → Stabilize → Survive Enemy Turn</strong>
        </div>
        <div>
          <span>Turn</span>
          <strong>
            {game.turn} · {phase.kicker}
          </strong>
        </div>
        <div>
          <span>Player Command</span>
          <strong>{availableCommand(game)} / 32</strong>
          <small>No paid-action count</small>
        </div>
        <div>
          <span>Enemy Squad Command</span>
          <strong>{availableEnemyCommand(game)} / 32</strong>
          <small>Shared by four bodies</small>
        </div>
        <div>
          <span>Movement</span>
          <strong>
            {game.movementRemaining} / {game.movementMax}
          </strong>
          <small>Split around actions</small>
        </div>
        <div>
          <span>Condition · Guard</span>
          <strong>
            {game.player.condition} · {game.player.guard}
          </strong>
        </div>
        <div>
          <span>Gate Stability</span>
          <GatePips
            stability={game.gate.stability}
            status={game.gate.status}
          />
        </div>
        <div>
          <span>Prepared cards</span>
          <strong>{game.hand.length} in hand</strong>
          <small>
            Deck {Math.max(0, game.deck.length - game.drawIndex)} · Discard{" "}
            {game.discard.length}
          </small>
        </div>
      </section>

      {game.warning ? (
        <p className={styles.warning} role="alert">
          {game.warning}
        </p>
      ) : null}

      {game.phase !== "result" ? (
        <>
          <div className={styles.battleLayout}>
            <BattleBoard
              game={game}
              selectedFocus={selectedFocus}
              preview={preview}
              onFocus={handleFocus}
            />
            <aside className={styles.commandRail}>
              <BuildSourceCard game={game} onFocus={handleFocus} />
              {game.pendingEnemyAction ? (
                <ResponsePanel
                  game={game}
                  onRespond={(responseId) =>
                    setGame((current) =>
                      resolveEnemyAction(current, responseId),
                    )
                  }
                />
              ) : (
                <SelectionPanel
                  game={game}
                  focusId={selectedFocus}
                  selectedActionId={selectedActionId}
                  attachedCard={attachedCard}
                  preview={preview}
                  onAction={(actionId) => {
                    setSelectedActionId(actionId);
                    setAttachedCard(null);
                  }}
                  onCard={setAttachedCard}
                  onExecute={executeSelected}
                />
              )}
              <LocalResolution game={game} />
              <div className={styles.turnControls}>
                {game.phase === "player" ? (
                  <>
                    <p>
                      Ending your turn lets the enemy squad act. Unspent
                      Command stays available for legal Responses and banks
                      forward.
                    </p>
                    <button
                      type="button"
                      data-testid="end-turn"
                      className={styles.endTurnButton}
                      onClick={() => {
                        setGame((current) => beginEnemyTurn(current));
                        resetInteraction();
                      }}
                    >
                      END TURN · ENEMIES ACT NEXT · BANK {game.command}
                    </button>
                  </>
                ) : null}
                {game.phase === "enemy" &&
                !game.pendingEnemyAction &&
                reducedMotion ? (
                  <button
                    type="button"
                    data-testid="advance-enemy"
                    className={styles.endTurnButton}
                    onClick={() =>
                      setGame((current) => advanceEnemyTurn(current))
                    }
                  >
                    REVEAL NEXT ENEMY ACTION
                  </button>
                ) : null}
                {game.phase === "enemy" && !reducedMotion ? (
                  <p>
                    Enemy actions advance automatically. Enable Reduce motion
                    for manual stepping.
                  </p>
                ) : null}
              </div>
            </aside>
          </div>

          <HandPanel
            game={game}
            selectedActionId={selectedActionId}
            attachedCard={attachedCard}
            refocusMode={refocusMode}
            refocusSelection={refocusSelection}
            onCard={handleCard}
            onBeginRefocus={() => {
              setRefocusMode(true);
              setRefocusSelection([]);
              setAttachedCard(null);
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
          <BattleLog game={game} />
        </>
      ) : (
        <>
          <ResultsPanel game={game} onReset={resetSameState} />
          <BattleLog game={game} />
        </>
      )}

      <footer className={styles.prototypeFooter}>
        <p>
          Implementation evidence only. Command values, movement allowances,
          damage, AI weights, and pacing remain prototype tuning.
        </p>
        <p>
          No account, API, reward, progression, memory, queue, BNL, canon, or
          persistent-world connection.
        </p>
      </footer>
    </main>
  );
}
