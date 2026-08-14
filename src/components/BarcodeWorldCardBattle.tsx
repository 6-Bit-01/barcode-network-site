"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  type RoundReview,
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

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function pressureOutcome(review: RoundReview) {
  if (review.pressureDelta > 0) return `YOU GAIN ${review.pressureDelta} PRESSURE`;
  if (review.pressureDelta < 0) return `BREACHER GAINS ${Math.abs(review.pressureDelta)} PRESSURE`;
  return "PRESSURE HOLDS";
}

function pressureLead(pressure: number) {
  if (pressure > 0) return `YOU LEAD BY ${pressure}`;
  if (pressure < 0) return `BREACHER LEADS BY ${Math.abs(pressure)}`;
  return "THE LINE IS EVEN";
}

function laneStory(review: RoundReview | null, lane: number) {
  const events = review?.events.filter((entry) => entry.lane === lane) ?? [];
  const action = events.find((entry) => ["clash", "direct-pressure"].includes(entry.type)) ?? null;
  const destroyedPlayer = events.some((entry) => entry.type === "destroy" && entry.side === "player");
  const destroyedEnemy = events.some((entry) => entry.type === "destroy" && entry.side === "enemy");
  const setup = events.filter((entry) => ["play", "outflank", "replace", "enemy-entry"].includes(entry.type));
  const consequences = events.filter((entry) => (
    ["card-effect", "destroy", "break-clear"].includes(entry.type)
  ));
  let label = "NO ACTION";
  let tone: "player" | "enemy" | "neutral" = "neutral";
  if (action?.type === "direct-pressure" && action.side === "player") {
    label = "YOU PRESS UNBLOCKED";
    tone = "player";
  } else if (action?.type === "direct-pressure" && action.side === "enemy") {
    label = "BREACHER PRESSES UNBLOCKED";
    tone = "enemy";
  } else if (action?.type === "clash") {
    if (destroyedEnemy && !destroyedPlayer) {
      label = "CLASH · ENEMY DESTROYED";
      tone = "player";
    } else if (destroyedPlayer && !destroyedEnemy) {
      label = "CLASH · YOUR CARD DESTROYED";
      tone = "enemy";
    } else if (destroyedPlayer && destroyedEnemy) {
      label = "CLASH · BOTH DESTROYED";
    } else {
      label = "CLASH · BOTH HOLD";
    }
  }
  if (action && events.some((entry) => entry.type === "break-clear")) {
    label += " · THEN BREAK CLEARS";
  }
  return {
    action,
    consequences,
    detail: action?.detail ?? "No card acts and this lane adds no Pressure.",
    label,
    setup,
    tone,
  };
}

function projectionConclusion(review: RoundReview) {
  if (review.winner === "player") return "This reaches +5: you win before any Break.";
  if (review.winner === "enemy") return "This reaches -5: the Breacher wins before any Break.";
  if (review.breakTriggered) return `Break will trigger at ${signed(review.pressureAfter)}: every active card clears, but Pressure stays.`;
  if (review.events.some((entry) => entry.type === "break-rearm")) return "Break will re-arm because Pressure returned to the center.";
  return "No Break will trigger.";
}

function resolvedConclusion(review: RoundReview) {
  if (review.winner === "player") return "You reached +5 and won before any Break.";
  if (review.winner === "enemy") return "The Breacher reached -5 and won before any Break.";
  if (review.breakTriggered) return `Break triggered: every active card cleared and Pressure stayed at ${signed(review.pressureAfter)}.`;
  if (review.events.some((entry) => entry.type === "break-rearm")) return "Break re-armed because Pressure returned to the center.";
  return "No Break triggered.";
}

function roundAnnouncement(review: RoundReview) {
  const movement = review.pressureDelta > 0
    ? `You gained ${review.pressureDelta} Pressure`
    : review.pressureDelta < 0
      ? `The Breacher gained ${Math.abs(review.pressureDelta)} Pressure`
      : "Pressure held";
  return `Round ${review.round} resolved. ${movement}, from ${signed(review.pressureBefore)} to ${signed(review.pressureAfter)}. ${resolvedConclusion(review)}`;
}

function displayedEventDetail(event: BattleEvent, projected: boolean) {
  if (projected && event.sceneCue === "scout-draw") {
    return "Scout Route will draw one card if destroyed; its identity stays hidden until Resolve.";
  }
  return event.detail;
}

function primaryLaneEvent(
  game: CardBattleState,
  lane: number,
  projection: RoundReview | null,
) {
  const review = game.currentReview ?? projection;
  const story = laneStory(review, lane);
  if (story.action) return story.action;
  const events = review?.events ?? game.pendingEvents;
  const globalEvent = [...events]
    .reverse()
    .find((entry) => entry.lane === null && ["break", "victory"].includes(entry.type));
  return [...events].reverse().find((entry) => entry.lane === lane) ?? globalEvent ?? null;
}

function previewAt(game: CardBattleState, lane: number) {
  if (game.phase !== "player-action") return null;
  return game.enemyPreview.placements.find((placement) => placement.lane === lane) ?? null;
}

function BattleScene({
  game,
  projection,
}: {
  game: CardBattleState;
  projection: RoundReview | null;
}) {
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
            const reaction = primaryLaneEvent(game, lane, projection);
            const story = laneStory(game.currentReview ?? projection, lane);
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
                <span className={styles.reaction}>
                  {story.action ? story.label : reaction?.title ?? (preview ? "ENEMY STANCE LOCKED" : "READING THE LINE")}
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
        <span className={styles.breakStatus}>{pressureLead(game.pressure)}</span>
      </div>
      <p className={styles.pressureRule} id="pressure-rule">Unblocked Power moves Pressure. Reach +5 to win; -5 loses.</p>
      <div className={styles.pressureScroll}>
        <div
          aria-describedby="pressure-rule pressure-break-rule"
          aria-label={`Pressure ${signed(game.pressure)}. ${pressureLead(game.pressure)}.`}
          aria-valuemax={5}
          aria-valuemin={-5}
          aria-valuenow={game.pressure}
          className={styles.pressureTrack}
          role="meter"
        >
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
      <p className={styles.breakRule} id="pressure-break-rule">
        {game.breakArmed
          ? "Break is armed: crossing +3 or -3 clears every active card; Pressure stays where it moved."
          : "Break is spent: it re-arms only when Pressure returns to -2 through +2."}
      </p>
    </section>
  );
}

function EnemyPreview({
  game,
  projection,
}: {
  game: CardBattleState;
  projection: RoundReview;
}) {
  return (
    <section className={styles.previewPanel} aria-labelledby="enemy-preview-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionLabel}>ENEMY PREVIEW</p>
          <strong id="enemy-preview-title">{"BREACHER'S LOCKED PLAN"}</strong>
        </div>
        <span className={styles.locked}>◆ LOCKED</span>
      </div>
      <p className={styles.instructions}>Every Breacher card that will act is shown here—new entries and cards already on the line.</p>
      {game.enemyPreview.placements.length === 0 && (
        <p className={styles.previewNotice}><strong>NO PLACEMENT LOCKED.</strong> The Breacher banks Command, but its existing cards still attack.</p>
      )}
      <div className={styles.previewCards}>
        {LANES.map((lane) => {
          const placement = previewAt(game, lane);
          const active = game.enemy.lanes[lane];
          const actingCard = placement?.card ?? active;
          const story = laneStory(projection, lane);
          return (
            <article className={styles.previewCard} data-tone={story.tone} key={lane}>
              <span>LANE {lane + 1} · {placement ? "ENTERS THIS ROUND" : active ? "REMAINS ACTIVE" : "NO BREACHER CARD"}</span>
              <strong>{actingCard?.name ?? "OPEN BREACHER LANE"}</strong>
              {actingCard && (
                <small>
                  {isActive(actingCard) ? "CURRENT" : "PRINTED"} {effectiveShownPower(actingCard)} Power · {isActive(actingCard) ? `${actingCard.currentHealth}/${actingCard.maxHealth}` : actingCard.health} Health
                </small>
              )}
              {actingCard && <small>{actingCard.ability}</small>}
              {placement?.replacesCardId && active && <small>REPLACES {active.name}</small>}
              <span className={styles.previewOutcome}>IF RESOLVED NOW · {story.label}</span>
              <small>{story.detail}</small>
              {story.consequences.map((entry) => <small key={entry.id}><b>{entry.title}.</b> {displayedEventDetail(entry, true)}</small>)}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Board({
  game,
  selectedCard,
  currentProjection,
  laneChoiceProjections,
  outflankMode,
  outflankFrom,
  onLane,
}: {
  game: CardBattleState;
  selectedCard: CardInstance | null;
  currentProjection: RoundReview | null;
  laneChoiceProjections: Array<RoundReview | null>;
  outflankMode: boolean;
  outflankFrom: number | null;
  onLane: (lane: number) => void;
}) {
  const actionable = game.phase === "player-action" && Boolean(selectedCard || outflankMode);
  const selectedInstruction = selectedCard
    ? `SELECTED: ${selectedCard.name} — choose where it fights or presses.`
    : outflankMode
      ? outflankFrom === null
        ? "OUTFLANK READY — choose a friendly survivor."
        : `OUTFLANK SOURCE: LANE ${outflankFrom + 1} — choose an open destination.`
      : "SELECT A CARD ABOVE, THEN COMPARE WHAT EACH LANE WILL DO.";
  return (
    <section className={styles.boardPanel} aria-label="Four lane card battle">
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.sectionLabel}>Four fixed lanes</p>
          <strong>{game.phase === "player-action" ? "CHOOSE WHERE THIS CARD ACTS" : "BOARD AFTER RESOLUTION"}</strong>
        </div>
        <span className={styles.microLabel}>ALL LANES RESOLVE SIMULTANEOUSLY</span>
      </div>
      {game.phase === "player-action" && <p className={styles.selectedBanner}>{selectedInstruction}</p>}
      {game.phase === "player-action" && <p className={styles.instructions}>Forecast damage and Pressure already include blocked, unblocked, entry, and printed card abilities.</p>}
      <p className={styles.swipeCue}>SWIPE LANES →</p>
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
            const candidateProjection = laneChoiceProjections[lane];
            const shownProjection = candidateProjection ?? currentProjection;
            const story = laneStory(shownProjection, lane);
            const forecastId = `lane-${lane + 1}-forecast`;
            const outflankProjection = Boolean(candidateProjection && !selectedCard && outflankFrom !== null);
            const sourceStory = outflankProjection && outflankFrom !== null
              ? laneStory(candidateProjection, outflankFrom)
              : null;
            const forecastLabel = candidateProjection
              ? outflankProjection ? "IF OUTFLANKED HERE" : "IF PLACED HERE"
              : "IF RESOLVED NOW";
            return (
              <article className={styles.lane} key={lane}>
                <div className={styles.laneHeading}>
                  <span>LANE {lane + 1}</span>
                  <span>{preview ? "ENEMY ENTERING" : enemyActive ? "ENEMY ACTIVE" : "NO ENEMY"}</span>
                </div>
                <div className={styles.slot} data-state={preview || enemyActive ? "occupied" : "open"}>
                  {preview ? (
                    <>
                      <CardFace card={preview.card} side="enemy" stateLabel="LOCKED PREVIEW · PRINTED STATS" />
                      {enemyActive && <span className={styles.cardState}>ACTIVE UNDER PREVIEW: {enemyActive.name} {enemyActive.currentHealth}/{enemyActive.maxHealth}</span>}
                    </>
                  ) : enemyActive ? (
                    <CardFace card={enemyActive} side="enemy" stateLabel={`ACTIVE · CURRENT STATS · ROUND ${enemyActive.enteredRound}`} />
                  ) : "OPEN ENEMY LANE"}
                </div>
                <div className={styles.laneForecast} data-tone={story.tone} id={forecastId}>
                  <span>{forecastLabel}</span>
                  <strong>{story.label}</strong>
                  <p>{story.detail}</p>
                  {story.consequences.map((entry) => <small key={entry.id}><b>{entry.title}.</b> {displayedEventDetail(entry, true)}</small>)}
                  {selectedCard && <small><b>YOUR ABILITY:</b> {selectedCard.ability}</small>}
                  {sourceStory && outflankFrom !== null && (
                    <small><b>LEAVES LANE {outflankFrom + 1}:</b> {sourceStory.label}. {sourceStory.detail}</small>
                  )}
                  {candidateProjection && (
                    <small>
                      Pressure {signed(candidateProjection.pressureBefore)} → {signed(candidateProjection.pressureAfter)} ({signed(candidateProjection.pressureDelta)}). {projectionConclusion(candidateProjection)}
                    </small>
                  )}
                  {selectedCard && playerActive && <small>Playing here replaces {playerActive.name}.</small>}
                </div>
                <button
                  aria-describedby={forecastId}
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
              aria-disabled={!affordable}
              aria-label={`${selected ? "Deselect" : "Select"} ${card.name}, cost ${card.cost}, Power ${card.power}, Health ${card.health}`}
              aria-pressed={selected}
              className={styles.handButton}
              data-affordable={affordable ? "true" : "false"}
              key={card.id}
              onClick={() => {
                if (game.phase === "player-action" && affordable) onSelect(card.id);
              }}
              type="button"
            >
              <CardFace card={card} side="player" stateLabel={affordable ? "READY · PRINTED STATS" : "NEEDS COMMAND · PRINTED STATS"} selected={selected} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LaneOutcomeRows({
  battleState = null,
  projected = false,
  review,
}: {
  battleState?: CardBattleState | null;
  projected?: boolean;
  review: RoundReview;
}) {
  return (
    <ol className={styles.outcomeLanes}>
      {LANES.map((lane) => {
        const story = laneStory(review, lane);
        const playerCard = battleState?.player.lanes[lane] ?? null;
        const enemyCard = battleState
          ? previewAt(battleState, lane)?.card ?? battleState.enemy.lanes[lane]
          : null;
        return (
          <li className={styles.outcomeLane} data-tone={story.tone} key={lane}>
            <span>LANE {lane + 1}</span>
            <div>
              <strong>{story.label}</strong>
              <p>{story.detail}</p>
              {story.setup.map((entry) => (
                <small key={entry.id}><b>{entry.title}.</b> {displayedEventDetail(entry, projected)}</small>
              ))}
              {playerCard && <small><b>YOU · {playerCard.name}:</b> {playerCard.ability}</small>}
              {enemyCard && <small><b>BREACHER · {enemyCard.name}:</b> {enemyCard.ability}</small>}
              {story.consequences.map((entry) => (
                <small key={entry.id}><b>{entry.title}.</b> {displayedEventDetail(entry, projected)}</small>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PlanningSummary({
  game,
  review,
}: {
  game: CardBattleState;
  review: RoundReview;
}) {
  return (
    <section className={styles.planningPanel} aria-labelledby="planning-summary-title">
      <div className={styles.reviewHeader}>
        <div>
          <p className={styles.sectionLabel}>Current battle forecast</p>
          <strong id="planning-summary-title">IF YOU RESOLVE NOW</strong>
        </div>
        <span className={styles.microLabel}>EXACT · ALL FOUR LANES</span>
      </div>
      <div className={styles.outcomeLead} data-tone={review.pressureDelta > 0 ? "player" : review.pressureDelta < 0 ? "enemy" : "neutral"}>
        <strong>{pressureOutcome(review)}</strong>
        <span>Pressure {signed(review.pressureBefore)} → {signed(review.pressureAfter)} ({signed(review.pressureDelta)})</span>
      </div>
      <LaneOutcomeRows battleState={game} projected review={review} />
      <p className={styles.conclusion}>{projectionConclusion(review)}</p>
    </section>
  );
}

function RoundResolution({
  game,
  resolvedSetup,
  onNextRound,
  resolutionRef,
}: {
  game: CardBattleState;
  resolvedSetup: CardBattleState | null;
  onNextRound: () => void;
  resolutionRef: RefObject<HTMLElement | null>;
}) {
  const review = game.currentReview;
  if (!review) return null;
  const pressureSources = review.events.filter((entry) => (
    entry.type === "direct-pressure" ||
    (entry.type === "card-effect" && entry.sceneCue === "linebreaker-pressure")
  ));
  return (
    <section
      className={styles.reviewPanel}
      id="card-battle-controls"
      ref={resolutionRef}
      tabIndex={-1}
    >
      <p aria-atomic="true" aria-live="polite" className={styles.srOnly} role="status">
        {roundAnnouncement(review)}
      </p>
      <div className={styles.reviewHeader}>
        <div>
          <p className={styles.sectionLabel}>WHAT JUST HAPPENED</p>
          <strong>ROUND {String(review.round).padStart(2, "0")} RESOLVED · ALL FOUR LANES AT ONCE</strong>
        </div>
        <span className={styles.microLabel}>{review.breakTriggered ? "PRESSURE BREAK" : review.winner ? "RESULT" : "CLASH COMPLETE"}</span>
      </div>
      <div className={styles.outcomeLead} data-tone={review.pressureDelta > 0 ? "player" : review.pressureDelta < 0 ? "enemy" : "neutral"}>
        <strong>{pressureOutcome(review)}</strong>
        <span>Pressure {signed(review.pressureBefore)} → {signed(review.pressureAfter)} ({signed(review.pressureDelta)})</span>
      </div>
      <LaneOutcomeRows battleState={resolvedSetup} review={review} />
      <div className={styles.pressureMath}>
        <p className={styles.sectionLabel}>WHY PRESSURE MOVED</p>
        {pressureSources.length > 0 ? (
          <ul>
            {pressureSources.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.side === "enemy" ? "BREACHER" : "YOU"}: {entry.title}</strong>
                <span>{entry.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Every occupied lane was blocked; no lane added direct or printed Pressure.</p>
        )}
        <strong className={styles.netPressure}>APPLIED NET {signed(review.pressureDelta)} · PRESSURE {signed(review.pressureBefore)} → {signed(review.pressureAfter)}</strong>
      </div>
      <p className={styles.conclusion}>{resolvedConclusion(review)}</p>
      {game.phase === "round-review" && (
        <button className={styles.primaryButton} onClick={onNextRound} type="button">
          Begin Round {game.round + 1}
        </button>
      )}
      <details className={styles.historyDetails}>
        <summary>Round details</summary>
        <ol className={styles.reviewList}>
          {review.events.map((entry) => <ReviewEvent event={entry} key={entry.id} />)}
        </ol>
      </details>
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
    <section className={styles.resultPanel}>
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
  const [resolvedSetup, setResolvedSetup] = useState<CardBattleState | null>(null);
  const resolutionRef = useRef<HTMLElement>(null);
  const selectedCard = game.player.hand.find((card) => card.id === selectedCardId) ?? null;
  const currentProjection = useMemo(() => (
    game.phase === "player-action" ? resolveRound(game).currentReview : game.currentReview
  ), [game]);
  const laneChoiceProjections = useMemo(() => LANES.map((lane) => {
    if (game.phase !== "player-action") return null;
    if (selectedCard) {
      return resolveRound(placePlayerCard(game, selectedCard.id, lane)).currentReview;
    }
    if (outflankMode && outflankFrom !== null && lane !== outflankFrom && !game.player.lanes[lane]) {
      return resolveRound(applyOutflank(game, outflankFrom, lane)).currentReview;
    }
    return null;
  }), [game, outflankFrom, outflankMode, selectedCard]);

  useEffect(() => {
    if (!game.currentReview || !["round-review", "result"].includes(game.phase)) return;
    const target = resolutionRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      const osReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: reducedMotion || osReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [game.currentReview, game.phase, reducedMotion]);

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
    setResolvedSetup(null);
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
          <BattleScene game={game} projection={currentProjection} />
          <StatusPanel game={game} onReducedMotion={setReducedMotion} reducedMotion={reducedMotion} />
        </div>
        <PressureTrack game={game} />
        {game.phase === "player-action" && currentProjection && <EnemyPreview game={game} projection={currentProjection} />}
        {game.phase === "player-action" && currentProjection && <PlanningSummary game={game} review={currentProjection} />}
        {game.currentReview && (
          <RoundResolution
            game={game}
            key={game.currentReview.round}
            onNextRound={() => {
              setGame((current) => startNextRound(current));
              setResolvedSetup(null);
              clearSelection();
            }}
            resolvedSetup={resolvedSetup}
            resolutionRef={resolutionRef}
          />
        )}
        <Result
          game={game}
          onNew={() => resetWith(replayNewShuffle(game))}
          onSame={() => resetWith(replaySameState(game))}
        />
        {game.phase === "player-action" && <Hand game={game} onSelect={selectCard} selectedCardId={selectedCardId} />}
        <Board
          currentProjection={currentProjection}
          game={game}
          laneChoiceProjections={laneChoiceProjections}
          onLane={chooseLane}
          outflankFrom={outflankFrom}
          outflankMode={outflankMode}
          selectedCard={selectedCard}
        />

        {game.phase === "player-action" && (
          <div className={styles.controlRail} id="card-battle-controls">
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
                  setResolvedSetup(game);
                  setGame((current) => resolveRound(current));
                  clearSelection();
                }}
                type="button"
              >
                RESOLVE ALL FOUR LANES
              </button>
            </>
            <p className={styles.controlHint}>{game.notice}</p>
          </div>
        )}
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
