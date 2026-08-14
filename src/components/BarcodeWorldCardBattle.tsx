"use client";

import { useState } from "react";
import {
  createCardBattleState,
  cancelOutflank,
  placePlayerCard,
  replayNewShuffle,
  replaySameState,
  resolveRound,
  returnPlayerCard,
  startNextRound,
  undoPlayerAction,
  useOutflank as applyOutflank,
  type ActiveCard,
  type BattleEvent,
  type CardBattleState,
  type CardInstance,
} from "@/lib/barcode-world/card-battle-engine.mjs";
import styles from "./BarcodeWorldCardBattle.module.css";

const PRESSURE_VALUES = Array.from({ length: 11 }, (_, index) => index - 5);
const LANES = Array.from({ length: 4 }, (_, index) => index);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function effectiveShownPower(card: CardInstance | ActiveCard) {
  if (!("currentHealth" in card)) return card.power;
  return card.power + card.powerBonus + card.temporaryPowerBonus;
}

function isActive(card: CardInstance | ActiveCard): card is ActiveCard {
  return "currentHealth" in card;
}

function CardFace({
  card,
  side,
  stateLabel,
  selected = false,
}: {
  card: CardInstance | ActiveCard;
  side: "player" | "enemy";
  stateLabel: string;
  selected?: boolean;
}) {
  const active = isActive(card);
  const health = active ? `${card.currentHealth}/${card.maxHealth}` : String(card.health);
  return (
    <div
      className={cx(styles.card, side === "enemy" && styles.enemyCard)}
      data-selected={selected ? "true" : "false"}
      data-card={card.designId}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardName}>{card.name}</span>
        <span className={styles.cost} aria-label={`${card.cost} Command`}>
          {card.cost}
        </span>
      </div>
      <div className={styles.stats}>
        <span>Power {effectiveShownPower(card)}</span>
        <span className={active && card.currentHealth < card.maxHealth ? styles.damage : undefined}>
          Health {health}
        </span>
      </div>
      <p className={styles.ability}>{card.ability}</p>
      <span className={styles.cardState}>{stateLabel}</span>
    </div>
  );
}

function CommandPips({ value }: { value: number }) {
  return (
    <div className={styles.commandPips} aria-label={`${value} of 6 Command`}>
      {Array.from({ length: 6 }, (_, index) => (
        <span
          aria-hidden="true"
          className={styles.commandPip}
          data-filled={index < value ? "true" : "false"}
          key={index}
        />
      ))}
    </div>
  );
}

function latestLaneEvent(game: CardBattleState, lane: number) {
  const events = game.currentReview?.events ?? game.pendingEvents;
  const globalEvent = [...events]
    .reverse()
    .find((entry) => entry.lane === null && ["break", "victory"].includes(entry.type));
  return [...events].reverse().find((entry) => entry.lane === lane) ?? globalEvent ?? null;
}

function previewAt(game: CardBattleState, lane: number) {
  if (game.phase !== "player-action") return null;
  return game.enemyPreview.placements.find((placement) => placement.lane === lane) ?? null;
}

function BattleScene({ game }: { game: CardBattleState }) {
  return (
    <section className={styles.scene} aria-labelledby="battle-scene-title">
      <div className={styles.sceneHeader}>
        <div>
          <p className={styles.sectionLabel}>Physical confrontation</p>
          <strong id="battle-scene-title">THE CARDS BECOME ACTION</strong>
        </div>
        <span className={styles.microLabel}>Wayfinder ↔ Breacher</span>
      </div>
      <div className={styles.sceneScroll}>
        <div className={styles.sceneLanes}>
          {LANES.map((lane) => {
            const preview = previewAt(game, lane);
            const enemyCard = preview?.card ?? game.enemy.lanes[lane];
            const playerCard = game.player.lanes[lane];
            const reaction = latestLaneEvent(game, lane);
            return (
              <div
                className={styles.sceneLane}
                data-scene-cue={reaction?.sceneCue ?? "watching"}
                data-lane={lane + 1}
                key={lane}
              >
                <span className={styles.laneNumber}>LANE {lane + 1}</span>
                <span
                  aria-label={enemyCard ? `Breacher performs ${enemyCard.name}` : "Breacher watches this lane"}
                  className={cx(styles.fighter, styles.enemyFighter)}
                  data-design={enemyCard?.designId ?? "watching"}
                  role="img"
                />
                <span className={cx(styles.actorCard, styles.enemyCardLabel)}>
                  {enemyCard?.name ?? "BREACHER WATCHING"}
                </span>
                <span
                  aria-label={playerCard ? `Wayfinder performs ${playerCard.name}` : "Wayfinder watches this lane"}
                  className={cx(styles.fighter, styles.playerFighter)}
                  data-design={playerCard?.designId ?? "watching"}
                  role="img"
                />
                <span className={cx(styles.actorCard, styles.playerCardLabel)}>
                  {playerCard?.name ?? "WAYFINDER READY"}
                </span>
                <span className={styles.reaction} aria-live="polite">
                  {reaction?.title ?? (preview ? "ENEMY STANCE LOCKED" : "READING THE LINE")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatusPanel({
  game,
  reducedMotion,
  onReducedMotion,
}: {
  game: CardBattleState;
  reducedMotion: boolean;
  onReducedMotion: (enabled: boolean) => void;
}) {
  return (
    <aside className={styles.statusPanel} aria-label="Battle status">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionLabel}>Current state</p>
          <strong>ROUND {String(game.round).padStart(2, "0")}</strong>
        </div>
        <span className={styles.microLabel}>{game.phase.replaceAll("-", " ")}</span>
      </div>
      <div className={styles.statusGrid}>
        <div className={styles.stat}>
          <span>BATTLE / EXPLORATION</span>
          <strong>{game.player.command} COMMAND</strong>
          <CommandPips value={game.player.command} />
        </div>
        <div className={styles.stat}>
          <span>BREACHER</span>
          <strong>{game.enemy.command} BANKED</strong>
          <CommandPips value={game.enemy.command} />
        </div>
      </div>
      <div className={styles.zoneCounts}>
        <div className={styles.zoneCount}><span>Deck</span><strong>{game.player.drawPile.length}</strong></div>
        <div className={styles.zoneCount}><span>Hand</span><strong>{game.player.hand.length}</strong></div>
        <div className={styles.zoneCount}><span>Discard</span><strong>{game.player.discard.length}</strong></div>
      </div>
      <div>
        <p className={styles.microLabel}>Deterministic seed</p>
        <code className={styles.seed}>{game.seed}</code>
      </div>
      <label className={styles.motionToggle}>
        <input
          checked={reducedMotion}
          onChange={(event) => onReducedMotion(event.target.checked)}
          type="checkbox"
        />
        <span>Reduce motion — preserve every causal cue</span>
      </label>
    </aside>
  );
}

function PressureTrack({ game }: { game: CardBattleState }) {
  const needle = 4.5 + ((game.pressure + 5) / 10) * 91;
  return (
    <section className={styles.pressurePanel} aria-label="Pressure track">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionLabel}>Shared battle pressure</p>
          <strong>ENEMY -5 ← HOLD THE CENTER → +5 PLAYER</strong>
        </div>
        <span className={styles.breakStatus}>
          BREAK <strong>{game.breakArmed ? "ARMED" : "DISARMED"}</strong>
        </span>
      </div>
      <div className={styles.pressureScroll}>
        <div className={styles.pressureTrack}>
          <span className={styles.pressureNeedle} style={{ left: `${needle}%` }}>
            {game.pressure > 0 ? `+${game.pressure}` : game.pressure}
          </span>
          {PRESSURE_VALUES.map((value) => (
            <span
              className={styles.pressureTick}
              data-break={Math.abs(value) === 3 ? "true" : "false"}
              data-current={value === game.pressure ? "true" : "false"}
              key={value}
            >
              <span>
                {value === -5 ? "ENEMY -5" : value === 5 ? "+5 PLAYER" : Math.abs(value) === 3 ? `${value > 0 ? "+" : ""}${value} BREAK` : value > 0 ? `+${value}` : value}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function EnemyPreview({ game }: { game: CardBattleState }) {
  return (
    <section className={styles.previewPanel} aria-labelledby="enemy-preview-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionLabel}>ENEMY PREVIEW</p>
          <strong id="enemy-preview-title">EXACT PLACEMENTS · PUBLIC BEFORE YOU ACT</strong>
        </div>
        <span className={styles.locked}>◆ LOCKED</span>
      </div>
      <div className={styles.previewCards}>
        {game.enemyPreview.placements.length === 0 ? (
          <div className={styles.previewCard}>
            <span>NO PLACEMENT LOCKED</span>
            <strong>BREACHER BANKS COMMAND</strong>
            <small>The seeded decision is locked and cannot change.</small>
          </div>
        ) : game.enemyPreview.placements.map((placement) => (
          <div className={styles.previewCard} key={placement.cardId}>
            <span>LANE {placement.lane + 1} · COST {placement.cost}</span>
            <strong>{placement.card.name}</strong>
            <small>{placement.card.power} Power · {placement.card.health} Health</small>
            <small>{placement.replacesCardId ? "REPLACES ACTIVE CARD" : "ENTERS OPEN LANE"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Board({
  game,
  selectedCard,
  outflankMode,
  outflankFrom,
  onLane,
}: {
  game: CardBattleState;
  selectedCard: CardInstance | null;
  outflankMode: boolean;
  outflankFrom: number | null;
  onLane: (lane: number) => void;
}) {
  const actionable = game.phase === "player-action" && Boolean(selectedCard || outflankMode);
  return (
    <section className={styles.boardPanel} aria-label="Four lane card battle">
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.sectionLabel}>Four fixed lanes</p>
          <strong>BREACHER ABOVE · BATTLE / EXPLORATION BELOW</strong>
        </div>
        <span className={styles.microLabel}>ALL LANES RESOLVE SIMULTANEOUSLY</span>
      </div>
      <div className={styles.boardScroller}>
        <div className={styles.board}>
          {LANES.map((lane) => {
            const preview = previewAt(game, lane);
            const enemyActive = game.enemy.lanes[lane];
            const playerActive = game.player.lanes[lane];
            const selectingSource = outflankMode && outflankFrom === null;
            const eligibleSource = Boolean(playerActive && playerActive.enteredRound < game.round);
            const eligibleDestination = outflankMode && outflankFrom !== null && !playerActive && lane !== outflankFrom;
            const latestPendingAction = game.pendingPlayerActions.at(-1);
            const pendingPlayerCard = Boolean(playerActive && latestPendingAction?.type === "play" && latestPendingAction.card?.id === playerActive.id);
            const pendingOutflank = Boolean(game.outflank.pending && latestPendingAction?.type === "outflank" && playerActive?.id === game.outflank.pending.cardId && lane === game.outflank.pending.toLane);
            const laneEnabled = game.phase === "player-action" && (
              pendingPlayerCard || pendingOutflank ||
              (actionable && (Boolean(selectedCard) || (selectingSource ? eligibleSource : eligibleDestination)))
            );
            let actionLabel = "OPEN LANE";
            if (pendingPlayerCard) actionLabel = `Return ${playerActive?.name} from Lane ${lane + 1} to hand`;
            else if (pendingOutflank) actionLabel = `Cancel Outflank for ${playerActive?.name}`;
            else if (selectedCard) actionLabel = `${playerActive ? "Replace with" : "Play"} ${selectedCard.name} in Lane ${lane + 1}`;
            else if (selectingSource && eligibleSource) actionLabel = `Choose ${playerActive?.name} in Lane ${lane + 1} to Outflank`;
            else if (eligibleDestination) actionLabel = `Outflank into open Lane ${lane + 1}`;
            return (
              <article className={styles.lane} key={lane}>
                <div className={styles.laneHeading}>
                  <span>LANE {lane + 1}</span>
                  <span>{preview ? "PREVIEWED" : enemyActive ? "BLOCKED" : "OPEN"}</span>
                </div>
                <div className={styles.slot} data-state={preview || enemyActive ? "occupied" : "open"}>
                  {preview ? (
                    <>
                      <CardFace card={preview.card} side="enemy" stateLabel="LOCKED PREVIEW" />
                      {enemyActive && <span className={styles.cardState}>ACTIVE UNDER PREVIEW: {enemyActive.name} {enemyActive.currentHealth}/{enemyActive.maxHealth}</span>}
                    </>
                  ) : enemyActive ? (
                    <CardFace card={enemyActive} side="enemy" stateLabel={`ACTIVE · ROUND ${enemyActive.enteredRound}`} />
                  ) : "OPEN ENEMY LANE"}
                </div>
                <div className={styles.versus}>OPPOSED CLASH / DIRECT PRESS</div>
                <button
                  aria-label={actionLabel}
                  className={styles.laneTarget}
                  data-state={playerActive ? "occupied" : "open"}
                  disabled={!laneEnabled}
                  onClick={() => onLane(lane)}
                  type="button"
                >
                  {playerActive ? (
                    <CardFace
                      card={playerActive}
                      side="player"
                      stateLabel={pendingPlayerCard ? "PLAYED THIS ROUND · TAP TO RETURN" : pendingOutflank ? "OUTFLANKED · TAP TO CANCEL" : outflankFrom === lane ? "OUTFLANK SOURCE" : `ACTIVE · ROUND ${playerActive.enteredRound}`}
                      selected={pendingPlayerCard || pendingOutflank || outflankFrom === lane}
                    />
                  ) : (
                    <span>{eligibleDestination ? "OUTFLANK DESTINATION" : selectedCard ? `PLACE ${selectedCard.name}` : "OPEN LANE"}</span>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Hand({
  game,
  selectedCardId,
  onSelect,
}: {
  game: CardBattleState;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}) {
  return (
    <section className={styles.handPanel} aria-labelledby="hand-title">
      <div className={styles.handHeader}>
        <div>
          <p className={styles.sectionLabel}>Your hand</p>
          <strong id="hand-title">SELECT A CARD → SELECT A LANE</strong>
        </div>
        <span className={styles.microLabel}>{game.player.hand.length} CARDS · NO HAND LIMIT</span>
      </div>
      <p className={styles.instructions}>Every card shows Command cost, Power, Health, and one ability. Occupied friendly lanes may be replaced.</p>
      <div className={styles.hand}>
        {game.player.hand.map((card) => {
          const affordable = card.cost <= game.player.command;
          const selected = card.id === selectedCardId;
          return (
            <button
              aria-label={`${selected ? "Deselect" : "Select"} ${card.name}, cost ${card.cost}, Power ${card.power}, Health ${card.health}`}
              aria-pressed={selected}
              className={styles.handButton}
              disabled={game.phase !== "player-action" || !affordable}
              key={card.id}
              onClick={() => onSelect(card.id)}
              type="button"
            >
              <CardFace card={card} side="player" stateLabel={affordable ? "READY" : "NEEDS COMMAND"} selected={selected} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Review({ game }: { game: CardBattleState }) {
  const review = game.currentReview;
  if (!review) return null;
  return (
    <section className={styles.reviewPanel} aria-live="polite">
      <div className={styles.reviewHeader}>
        <div>
          <p className={styles.sectionLabel}>Causal round review</p>
          <strong>ROUND {review.round} · PRESSURE {review.pressureBefore} → {review.pressureAfter}</strong>
        </div>
        <span className={styles.microLabel}>{review.breakTriggered ? "PRESSURE BREAK" : review.winner ? "RESULT" : "CLASH COMPLETE"}</span>
      </div>
      <ol className={styles.reviewList}>
        {review.events.map((entry) => <ReviewEvent event={entry} key={entry.id} />)}
      </ol>
      {game.history.length > 1 && (
        <details className={styles.historyDetails}>
          <summary>Review prior rounds ({game.history.length - 1})</summary>
          {game.history.slice(0, -1).reverse().map((round) => (
            <div key={round.round}>
              <p className={styles.microLabel}>ROUND {round.round} · {round.pressureBefore} → {round.pressureAfter}</p>
              <ol className={styles.reviewList}>
                {round.events.map((entry) => <ReviewEvent event={entry} key={entry.id} />)}
              </ol>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function ReviewEvent({ event }: { event: BattleEvent }) {
  return (
    <li className={styles.reviewEvent} data-scene-cue={event.sceneCue}>
      <span>{event.lane === null ? event.type : `Lane ${event.lane + 1} · ${event.type}`}</span>
      <div>
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
      </div>
    </li>
  );
}

function Result({
  game,
  onSame,
  onNew,
}: {
  game: CardBattleState;
  onSame: () => void;
  onNew: () => void;
}) {
  if (!game.result) return null;
  const playerWon = game.result.winner === "player";
  return (
    <section className={styles.resultPanel} aria-live="assertive">
      <p className={styles.sectionLabel}>FINAL RESULT · ROUND {game.result.round}</p>
      <h2>{playerWon ? "LINE HELD" : "LINE BREACHED"}</h2>
      <p>{playerWon ? "Battle / Exploration reached +5 Pressure." : "The Breacher reached -5 Pressure."}</p>
      <p>{game.result.reason} Final Pressure: {game.result.pressure}.</p>
      <div className={styles.resultActions}>
        <button className={styles.primaryButton} onClick={onSame} type="button">Replay Same State</button>
        <button className={styles.secondaryButton} onClick={onNew} type="button">Replay New Shuffle</button>
      </div>
    </section>
  );
}

export function BarcodeWorldCardBattle() {
  const [game, setGame] = useState<CardBattleState>(() => createCardBattleState());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [outflankMode, setOutflankMode] = useState(false);
  const [outflankFrom, setOutflankFrom] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const selectedCard = game.player.hand.find((card) => card.id === selectedCardId) ?? null;

  function clearSelection() {
    setSelectedCardId(null);
    setOutflankMode(false);
    setOutflankFrom(null);
  }

  function selectCard(cardId: string) {
    setSelectedCardId((current) => current === cardId ? null : cardId);
    setOutflankMode(false);
    setOutflankFrom(null);
  }

  function chooseLane(lane: number) {
    const active = game.player.lanes[lane];
    const pendingPlay = active && game.pendingPlayerActions.some((action) => action.type === "play" && action.card?.id === active.id);
    const pendingOutflank = active && game.outflank.pending?.cardId === active.id && game.outflank.pending.toLane === lane;
    if (!selectedCard && !outflankMode && pendingPlay) {
      setGame((current) => returnPlayerCard(current, active.id));
      return;
    }
    if (!selectedCard && !outflankMode && pendingOutflank) {
      setGame((current) => cancelOutflank(current));
      return;
    }
    if (selectedCard) {
      setGame((current) => placePlayerCard(current, selectedCard.id, lane));
      setSelectedCardId(null);
      return;
    }
    if (!outflankMode) return;
    if (outflankFrom === null) {
      setOutflankFrom(lane);
      return;
    }
    setGame((current) => applyOutflank(current, outflankFrom, lane));
    setOutflankMode(false);
    setOutflankFrom(null);
  }

  function resetWith(next: CardBattleState) {
    setGame(next);
    clearSelection();
  }

  return (
    <div className={cx(styles.shell, reducedMotion && styles.reducedMotion)}>
      <a className={styles.skipLink} href="#card-battle-controls">Skip to battle controls</a>
      <main className={styles.main} id="card-battle-main">
        <header className={styles.masthead}>
          <div>
            <p className={styles.kicker}>BARCODE WORLD · BATTLE MODE RESEARCH v0.1</p>
            <h1 className={styles.title}>PRESSURE / CONTROL</h1>
            <p className={styles.subtitle}>Cards direct the Wayfinder. The scene performs the real confrontation. Four lanes, one shared line, no tactical grid.</p>
          </div>
          <div className={styles.badges} aria-label="Prototype boundaries">
            {["UNLISTED PREVIEW", "SOLO", "RESETTABLE", "NONCANONICAL", "IN MEMORY"].map((badge) => <span className={styles.badge} key={badge}>{badge}</span>)}
          </div>
        </header>

        <div className={styles.topGrid}>
          <BattleScene game={game} />
          <StatusPanel game={game} onReducedMotion={setReducedMotion} reducedMotion={reducedMotion} />
        </div>
        <PressureTrack game={game} />
        {game.phase === "player-action" && <EnemyPreview game={game} />}
        <Board
          game={game}
          onLane={chooseLane}
          outflankFrom={outflankFrom}
          outflankMode={outflankMode}
          selectedCard={selectedCard}
        />
        {game.phase === "player-action" && <Hand game={game} onSelect={selectCard} selectedCardId={selectedCardId} />}

        <div className={styles.controlRail} id="card-battle-controls">
          {game.phase === "player-action" ? (
            <>
              <button
                aria-pressed={outflankMode}
                className={styles.majorButton}
                disabled={game.outflank.used}
                onClick={() => {
                  setOutflankMode((current) => !current);
                  setOutflankFrom(null);
                  setSelectedCardId(null);
                }}
                type="button"
              >
                Outflank · {game.outflank.used ? "Used" : "Ready"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={game.pendingPlayerActions.length === 0}
                onClick={() => {
                  setGame((current) => undoPlayerAction(current));
                  clearSelection();
                }}
                type="button"
              >
                Undo Last Action
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => {
                  setGame((current) => resolveRound(current));
                  clearSelection();
                }}
                type="button"
              >
                Resolve Round
              </button>
            </>
          ) : game.phase === "round-review" ? (
            <button
              className={styles.primaryButton}
              onClick={() => {
                setGame((current) => startNextRound(current));
                clearSelection();
              }}
              type="button"
            >
              Begin Round {game.round + 1}
            </button>
          ) : null}
          <p className={styles.controlHint} aria-live="polite">{game.notice}</p>
        </div>

        <Review game={game} />
        <Result
          game={game}
          onNew={() => resetWith(replayNewShuffle(game))}
          onSame={() => resetWith(replaySameState(game))}
        />
        {!game.result && (
          <div className={styles.resetRail} aria-label="Reset controls">
            <span>IN-MEMORY RESET</span>
            <button
              className={styles.secondaryButton}
              onClick={() => resetWith(replaySameState(game))}
              type="button"
            >
              Reset · Same State
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => resetWith(replayNewShuffle(game))}
              type="button"
            >
              Reset · New Shuffle
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
