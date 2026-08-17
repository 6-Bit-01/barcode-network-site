"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  CARD_BATTLE_RULES,
  CARD_BATTLE_SCENARIOS,
  createCardBattleState,
  getLaneForecast,
  getPlacementPreview,
  placePlayerCard,
  replayNewShuffle,
  replaySameState,
  resolveRound,
  startNextRound,
  undoPlayerAction,
  type CardBattleScenario,
  type CardBattleState,
  type CardInstance,
  type LaneForecast,
  type LaneResult,
  type RoundReview,
} from "@/lib/barcode-world/card-battle-engine.mjs";
import styles from "./BarcodeWorldCardBattle.module.css";

const LANES = Array.from({ length: CARD_BATTLE_RULES.lanes }, (_, index) => index);
const PRESSURE_VALUES = Array.from({ length: 11 }, (_, index) => index - 5);

const TYPE_MARKS: Record<string, string> = {
  attack: "ATK",
  defend: "DEF",
  maneuver: "MOV",
  modifier: "MOD",
  preparation: "PREP",
  reaction: "REACT",
  finisher: "FIN",
  recovery: "REC",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function chanceTone(chance: number | null) {
  if (chance === null) return "open";
  if (chance < 45) return "low";
  if (chance < 70) return "medium";
  return "high";
}

function scenarioSources(scenario: CardBattleScenario) {
  const policy = scenario.replenishment;
  return [
    policy.roundStartDraw > 0 ? `AUTO ${policy.roundStartDraw}` : null,
    policy.contestedSuccessDraw > 0 ? `CONTEST ${policy.contestedSuccessDraw}` : null,
    policy.successfulComboDraw > 0 ? `COMBO ${policy.successfulComboDraw}` : null,
    policy.fearUnlockDraw > 0 ? `FEAR ${policy.fearUnlockDraw}` : null,
    policy.pressureUnlockDraw > 0 ? `+${policy.pressureUnlockAt} ${policy.pressureUnlockDraw}` : null,
    "CARD EFFECTS",
  ].filter((entry): entry is string => Boolean(entry));
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={styles.typeBadge} data-type={type}>
      {TYPE_MARKS[type] ?? type.toUpperCase()}
    </span>
  );
}

function CardFace({
  affordable = true,
  card,
  selected = false,
}: {
  affordable?: boolean;
  card: CardInstance;
  selected?: boolean;
}) {
  return (
    <article
      className={styles.card}
      data-affordable={affordable ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-type={card.type}
    >
      <div className={styles.cardTop}>
        <TypeBadge type={card.type} />
        <span className={styles.cardCost} aria-label={`${card.cost} Reserve`}>
          <b>{card.cost}</b><small>R</small>
        </span>
      </div>
      <strong className={styles.cardName}>{card.name}</strong>
      <p className={styles.cardEffect}>{card.effect}</p>
      <span className={styles.cardSerial}>BW/{card.designId.toUpperCase()}/{card.copy}</span>
    </article>
  );
}

function StackCard({ card, index, side }: { card: CardInstance; index: number; side: "player" | "enemy" }) {
  return (
    <span
      className={styles.stackCard}
      data-side={side}
      data-type={card.type}
      style={{ "--stack-index": index } as CSSProperties}
    >
      <TypeBadge type={card.type} />
      <b>{card.name}</b>
      <small>{card.cost}R</small>
    </span>
  );
}

function ProbabilityBar({ forecast }: { forecast: LaneForecast }) {
  if (!forecast.playerMove || forecast.chance === null) {
    return (
      <div className={styles.openForecast}>
        <span>{forecast.enemyMove ? "UNCONTESTED" : "OPEN LANE"}</span>
        <b>{forecast.failureLabel}</b>
      </div>
    );
  }
  const tone = chanceTone(forecast.chance);
  return (
    <div className={styles.forecast} data-tone={tone}>
      <div className={styles.chanceLine}>
        <strong>{forecast.chance}%</strong>
        <span>SUCCESS</span>
      </div>
      <div
        aria-label={`${forecast.chance} percent success chance`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={forecast.chance}
        className={styles.chanceTrack}
        role="meter"
      >
        <span style={{ width: `${forecast.chance}%` }} />
      </div>
      <div className={styles.outcomePair}>
        <span data-outcome="success"><b>SUCCESS</b>{forecast.successLabel}</span>
        <span data-outcome="failure"><b>FAIL</b>{forecast.failureLabel}</span>
      </div>
    </div>
  );
}

function PressureTrack({ pressure, breakArmed }: { pressure: number; breakArmed: boolean }) {
  const position = ((pressure + 5) / 10) * 100;
  return (
    <section className={styles.pressurePanel} aria-labelledby="pressure-title">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>SHARED PRESSURE</span>
          <strong id="pressure-title">BREACHER ← {signed(pressure)} → YOU</strong>
        </div>
        <span className={styles.breakBadge} data-armed={breakArmed ? "true" : "false"}>
          BREAK {breakArmed ? "ARMED" : "SPENT"}
        </span>
      </div>
      <div className={styles.pressureScroll}>
        <div
          aria-label={`Pressure ${signed(pressure)}`}
          aria-valuemax={5}
          aria-valuemin={-5}
          aria-valuenow={pressure}
          className={styles.pressureTrack}
          role="meter"
        >
          <span className={styles.pressureNeedle} style={{ left: `${position}%` }}>
            {signed(pressure)}
          </span>
          {PRESSURE_VALUES.map((value) => (
            <span
              className={styles.pressureTick}
              data-break={Math.abs(value) === 3 ? "true" : "false"}
              data-current={value === pressure ? "true" : "false"}
              key={value}
            >
              <i />
              <b>{Math.abs(value) === 5 ? (value < 0 ? "LOSS" : "WIN") : signed(value)}</b>
            </span>
          ))}
        </div>
      </div>
      <p className={styles.trackRule}>
        ±5 ENDS BATTLE · CROSS ±3 TO REFILL / CLEAR · PRESSURE STAYS
      </p>
    </section>
  );
}

function StatusBar({ game }: { game: CardBattleState }) {
  const reservePercent = (game.player.reserve / CARD_BATTLE_RULES.commandCap) * 100;
  return (
    <section className={styles.statusBar} aria-label="Battle status">
      <div className={styles.roundStatus}>
        <span>ROUND</span>
        <strong>{String(game.round).padStart(2, "0")}</strong>
      </div>
      <div className={styles.reserveStatus}>
        <div><span>RESERVE</span><strong>{game.player.reserve}<small> / {CARD_BATTLE_RULES.commandCap}</small></strong></div>
        <div className={styles.reserveTrack}><span style={{ width: `${reservePercent}%` }} /></div>
      </div>
      <dl className={styles.zoneStatus}>
        <div><dt>DECK</dt><dd>{game.player.drawPile.length}</dd></div>
        <div><dt>RACK</dt><dd>{game.player.hand.length}/6</dd></div>
        <div><dt>DISCARD</dt><dd>{game.player.discard.length}</dd></div>
      </dl>
      <div className={styles.conditionStatus}>
        <span data-active={game.player.conditions.charge ? "true" : "false"}>CHARGE</span>
        <span data-active={game.enemy.conditions.fear ? "true" : "false"}>FEAR</span>
      </div>
    </section>
  );
}

function ScenarioStrip({ game }: { game: CardBattleState }) {
  return (
    <section className={styles.scenarioStrip} aria-label="Scenario card feed">
      <div>
        <span className={styles.eyebrow}>SCENARIO FEED</span>
        <strong>{game.scenario.name}</strong>
        <p>{game.scenario.rule}</p>
      </div>
      <div className={styles.sourceChips} aria-label="Active replenishment sources">
        {scenarioSources(game.scenario).map((source) => <span key={source}>{source}</span>)}
      </div>
      {(game.currentRoundGrant.automaticCards > 0 || game.currentRoundGrant.reserveBonus > 0) && (
        <span className={styles.roundGrant}>
          THIS ROUND · {game.currentRoundGrant.automaticCards > 0 ? `+${game.currentRoundGrant.automaticCards} CARDS` : ""}
          {game.currentRoundGrant.automaticCards > 0 && game.currentRoundGrant.reserveBonus > 0 ? " · " : ""}
          {game.currentRoundGrant.reserveBonus > 0 ? `+${game.currentRoundGrant.reserveBonus} RESERVE` : ""}
        </span>
      )}
    </section>
  );
}

function LaneBoard({
  boardRef,
  game,
  onChooseLane,
  selectedCard,
}: {
  boardRef: RefObject<HTMLElement | null>;
  game: CardBattleState;
  onChooseLane: (lane: number) => void;
  selectedCard: CardInstance | null;
}) {
  return (
    <section
      aria-labelledby="lane-board-title"
      className={styles.boardPanel}
      id="battle-board"
      ref={boardRef}
      tabIndex={-1}
    >
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>FOUR-LANE CONTEST</span>
          <strong id="lane-board-title">BUILD THE MOVE</strong>
        </div>
        <span className={styles.boardPrompt}>
          {selectedCard ? `PLACE ${selectedCard.name.toUpperCase()}` : "SELECT A CARD BELOW"}
        </span>
      </div>
      <div className={styles.oddsLegend}>
        <span data-tone="low">LOW</span>
        <span data-tone="medium">MID</span>
        <span data-tone="high">HIGH</span>
        <p>COLOR SHOWS THIS ROLL&apos;S ODDS—NOT THE MOVE&apos;S STRATEGIC VALUE.</p>
      </div>
      <div className={styles.laneScroll}>
        <div className={styles.lanes}>
          {LANES.map((lane) => {
            const stack = game.player.lanes[lane];
            const intent = game.enemyPreview.lanes[lane];
            const currentForecast = getLaneForecast(game, lane);
            const placement = selectedCard
              ? getPlacementPreview(game, selectedCard.id, lane)
              : null;
            const forecast = placement?.legal && placement.forecast
              ? placement.forecast
              : currentForecast;
            const legal = Boolean(selectedCard && placement?.legal);
            const move = forecast?.playerMove;
            return (
              <article
                className={styles.lane}
                data-legal={legal ? "true" : "false"}
                data-selected={selectedCard ? "true" : "false"}
                key={lane}
              >
                <header className={styles.laneHead}>
                  <span>LANE {lane + 1}</span>
                  <b>{intent ? "LOCKED" : "OPEN"}</b>
                </header>
                <div className={styles.intentZone}>
                  <span className={styles.zoneLabel}>BREACHER INTENT</span>
                  {intent ? (
                    <>
                      <div className={styles.stackCards} data-count={intent.cards.length}>
                        {intent.cards.map((entry, index) => (
                          <StackCard card={entry} index={index} key={entry.id} side="enemy" />
                        ))}
                      </div>
                      <strong className={styles.moveName}>{intent.move.name}</strong>
                    </>
                  ) : <span className={styles.emptyZone}>NO INTENT</span>}
                </div>
                <div className={styles.contestZone}>
                  {forecast && <ProbabilityBar forecast={forecast} />}
                </div>
                <button
                  aria-label={legal
                    ? `Add ${selectedCard?.name} to Lane ${lane + 1}, creating ${move?.name}`
                    : `Lane ${lane + 1}${placement?.reason ? `: ${placement.reason}` : ""}`}
                  className={styles.playerZone}
                  disabled={!legal}
                  onClick={() => onChooseLane(lane)}
                  type="button"
                >
                  <span className={styles.zoneLabel}>YOUR STACK · {stack.length}/{CARD_BATTLE_RULES.maxStack}</span>
                  {stack.length > 0 ? (
                    <div className={styles.stackCards} data-count={stack.length}>
                      {stack.map((entry, index) => (
                        <StackCard card={entry} index={index} key={entry.id} side="player" />
                      ))}
                      {legal && selectedCard && (
                        <span className={styles.ghostCard}>+ {selectedCard.name}</span>
                      )}
                    </div>
                  ) : legal && selectedCard ? (
                    <span className={styles.addCard}>+ {selectedCard.name}</span>
                  ) : (
                    <span className={styles.emptyZone}>EMPTY</span>
                  )}
                  <strong className={styles.moveName}>{move?.name ?? (legal ? selectedCard?.name : "—")}</strong>
                  {selectedCard && !legal && (
                    <small className={styles.illegalReason}>{placement?.reason ?? "INCOMPATIBLE"}</small>
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

function CardRack({
  game,
  onSelect,
  selectedCardId,
}: {
  game: CardBattleState;
  onSelect: (cardId: string) => void;
  selectedCardId: string | null;
}) {
  const emptySlots = Math.max(0, CARD_BATTLE_RULES.handSize - game.player.hand.length);
  return (
    <section className={styles.rackPanel} aria-labelledby="rack-title">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>SIX-SLOT RACK</span>
          <strong id="rack-title">YOUR CARDS</strong>
        </div>
        <span className={styles.rackPrompt}>TAP CARD → TAP LANE</span>
      </div>
      <div className={styles.rackScroll}>
        <div className={styles.rack}>
          {game.player.hand.map((entry) => {
            const affordable = entry.cost <= game.player.reserve;
            const selected = entry.id === selectedCardId;
            return (
              <button
                aria-label={`${selected ? "Deselect" : "Select"} ${entry.name}, ${entry.type}, cost ${entry.cost} Reserve. ${entry.effect}`}
                aria-pressed={selected}
                className={styles.cardButton}
                data-affordable={affordable ? "true" : "false"}
                disabled={!affordable}
                key={entry.id}
                onClick={() => onSelect(entry.id)}
                type="button"
              >
                <CardFace affordable={affordable} card={entry} selected={selected} />
              </button>
            );
          })}
          {Array.from({ length: emptySlots }, (_, index) => (
            <div className={styles.emptySlot} key={`empty-${index}`}>
              <span>EMPTY SLOT</span>
              <b>WAITING FOR GRANT</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function laneResultTitle(result: LaneResult) {
  if (!result.playerMove && !result.enemyMove) return "IDLE";
  if (!result.playerMove) return "UNCONTESTED";
  return result.success ? "SUCCESS" : "FAILURE";
}

function LaneResultCard({ result }: { result: LaneResult }) {
  const tone = !result.playerMove && !result.enemyMove
    ? "neutral"
    : result.success
      ? "success"
      : "failure";
  return (
    <li className={styles.resultLane} data-outcome={tone}>
      <div>
        <span>LANE {result.lane + 1}</span>
        <strong>{laneResultTitle(result)}</strong>
      </div>
      <p>
        <b>{result.playerMove?.name ?? "OPEN"}</b>
        <span>vs</span>
        <b>{result.enemyMove?.name ?? "OPEN"}</b>
      </p>
      {result.chance !== null ? (
        <div className={styles.rollReadout}>
          <span>{result.chance}% ODDS</span>
          <span>ROLL {result.roll}</span>
        </div>
      ) : <div className={styles.rollReadout}><span>NO ROLL</span></div>}
      <strong className={styles.laneDelta}>{signed(result.pressure)} PRESSURE</strong>
    </li>
  );
}

function RoundResolution({
  game,
  onNextRound,
  onReplayNew,
  onReplaySame,
  resolutionRef,
}: {
  game: CardBattleState;
  onNextRound: () => void;
  onReplayNew: () => void;
  onReplaySame: () => void;
  resolutionRef: RefObject<HTMLElement | null>;
}) {
  const review = game.currentReview;
  if (!review) return null;
  const resultTitle = game.result
    ? game.result.winner === "player" ? "LINE HELD" : "LINE BREACHED"
    : review.breakTriggered ? "PRESSURE BREAK" : "ROUND RESOLVED";
  const replenishment = review.replenishment;
  return (
    <section className={styles.reviewPanel} ref={resolutionRef} tabIndex={-1}>
      <p aria-atomic="true" aria-live="polite" className={styles.srOnly} role="status">
        Round {review.round} resolved. Pressure moved from {signed(review.pressureBefore)} to {signed(review.pressureAfter)}.
      </p>
      <div className={styles.reviewHero} data-winner={game.result?.winner ?? "none"}>
        <span className={styles.eyebrow}>ROUND {String(review.round).padStart(2, "0")}</span>
        <h2>{resultTitle}</h2>
        <strong>{signed(review.pressureBefore)} → {signed(review.pressureAfter)}</strong>
        <p>NET {signed(review.pressureDelta)} PRESSURE</p>
      </div>
      <ol className={styles.resultLanes}>
        {review.laneResults.map((entry) => <LaneResultCard key={entry.lane} result={entry} />)}
      </ol>
      <div className={styles.replenishmentResult}>
        <span className={styles.eyebrow}>CARD FEED</span>
        <strong>{replenishment?.playerDrawn ?? 0} GRANTED</strong>
        <div className={styles.sourceChips}>
          {replenishment?.sources.length
            ? replenishment.sources.map((source, index) => (
              <span key={`${source.type}-${index}`}>{source.label} · {source.requested}</span>
            ))
            : <span>NO GRANT</span>}
        </div>
      </div>
      <div className={styles.reviewActions}>
        {game.phase === "round-review" ? (
          <button className={styles.primaryButton} onClick={onNextRound} type="button">
            BEGIN ROUND {game.round + 1}
          </button>
        ) : (
          <>
            <button className={styles.primaryButton} onClick={onReplaySame} type="button">REPLAY SAME STATE</button>
            <button className={styles.secondaryButton} onClick={onReplayNew} type="button">NEW SHUFFLE</button>
          </>
        )}
      </div>
      <details className={styles.eventDetails}>
        <summary>CAUSAL EVENT LOG</summary>
        <ol>
          {review.events.map((entry) => (
            <li key={entry.id}>
              <span>{entry.lane === null ? "SYSTEM" : `L${entry.lane + 1}`}</span>
              <div><strong>{entry.title}</strong><p>{entry.detail}</p></div>
            </li>
          ))}
        </ol>
      </details>
      {game.history.length > 1 && (
        <details className={styles.eventDetails}>
          <summary>PRIOR ROUNDS · {game.history.length - 1}</summary>
          <div className={styles.priorRounds}>
            {game.history.slice(0, -1).reverse().map((entry: RoundReview) => (
              <span key={entry.round}>R{entry.round} · {signed(entry.pressureBefore)}→{signed(entry.pressureAfter)}</span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Options({
  game,
  onReducedMotion,
  onResetNew,
  onResetSame,
  onScenario,
  reducedMotion,
}: {
  game: CardBattleState;
  onReducedMotion: (value: boolean) => void;
  onResetNew: () => void;
  onResetSame: () => void;
  onScenario: (scenarioId: string) => void;
  reducedMotion: boolean;
}) {
  return (
    <details className={styles.options}>
      <summary>OPTIONS / TEST SCENARIO</summary>
      <div className={styles.optionsBody}>
        <label>
          <span>REPLENISHMENT RECIPE</span>
          <select onChange={(event) => onScenario(event.target.value)} value={game.scenarioId}>
            {CARD_BATTLE_SCENARIOS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {entry.shortName}</option>
            ))}
          </select>
        </label>
        <p>{game.scenario.rule}</p>
        <label className={styles.checkboxLabel}>
          <input
            checked={reducedMotion}
            onChange={(event) => onReducedMotion(event.target.checked)}
            type="checkbox"
          />
          <span>REDUCE MOTION</span>
        </label>
        <code>{game.seed}</code>
        <div className={styles.optionActions}>
          <button className={styles.secondaryButton} onClick={onResetSame} type="button">RESET SAME STATE</button>
          <button className={styles.secondaryButton} onClick={onResetNew} type="button">NEW SHUFFLE</button>
        </div>
      </div>
    </details>
  );
}

export function BarcodeWorldCardBattle() {
  const [game, setGame] = useState<CardBattleState>(() => createCardBattleState());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const boardRef = useRef<HTMLElement>(null);
  const resolutionRef = useRef<HTMLElement>(null);
  const selectedCard = useMemo(
    () => game.player.hand.find((entry) => entry.id === selectedCardId) ?? null,
    [game.player.hand, selectedCardId],
  );

  useEffect(() => {
    if (!game.currentReview) return;
    const target = resolutionRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [game.currentReview, reducedMotion]);

  function clearSelection() {
    setSelectedCardId(null);
  }

  function reset(next: CardBattleState) {
    setGame(next);
    clearSelection();
  }

  function selectCard(cardId: string) {
    setSelectedCardId((current) => current === cardId ? null : cardId);
    window.requestAnimationFrame(() => {
      boardRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function chooseLane(lane: number) {
    if (!selectedCard) return;
    const preview = getPlacementPreview(game, selectedCard.id, lane);
    if (!preview.legal) return;
    setGame((current) => placePlayerCard(current, selectedCard.id, lane));
    clearSelection();
  }

  return (
    <div className={cx(styles.shell, reducedMotion && styles.reducedMotion)}>
      <a className={styles.skipLink} href="#battle-controls">SKIP TO CONTROLS</a>
      <main className={styles.main}>
        <header className={styles.masthead}>
          <div className={styles.identity}>
            <span className={styles.barcodeMark} aria-hidden="true" />
            <div>
              <p>BARCODE WORLD · PRIVATE BATTLE RESEARCH</p>
              <h1>STACK / RESOLVE</h1>
              <span>FOUR LANES · SIX CARDS · VARIABLE FEED</span>
            </div>
          </div>
          <div className={styles.prototypeBadges}>
            <span>v0.2</span><span>UNLISTED</span><span>IN MEMORY</span>
          </div>
        </header>

        <StatusBar game={game} />
        <ScenarioStrip game={game} />
        <PressureTrack breakArmed={game.breakArmed} pressure={game.pressure} />

        {game.currentReview ? (
          <RoundResolution
            game={game}
            onNextRound={() => reset(startNextRound(game))}
            onReplayNew={() => reset(replayNewShuffle(game))}
            onReplaySame={() => reset(replaySameState(game))}
            resolutionRef={resolutionRef}
          />
        ) : (
          <>
            <LaneBoard
              boardRef={boardRef}
              game={game}
              onChooseLane={chooseLane}
              selectedCard={selectedCard}
            />
            <CardRack game={game} onSelect={selectCard} selectedCardId={selectedCardId} />
            <div className={styles.controlRail} id="battle-controls">
              <button
                className={styles.secondaryButton}
                disabled={game.pendingPlayerActions.length === 0}
                onClick={() => {
                  setGame((current) => undoPlayerAction(current));
                  clearSelection();
                }}
                type="button"
              >
                UNDO LAST
              </button>
              <div className={styles.controlState} aria-live="polite">
                <span>{game.pendingPlayerActions.length} STAGED</span>
                <p>{game.notice}</p>
              </div>
              <button
                aria-label="Resolve all four lanes"
                className={styles.primaryButton}
                onClick={() => {
                  setGame((current) => resolveRound(current));
                  clearSelection();
                }}
                type="button"
              >
                RESOLVE
              </button>
            </div>
          </>
        )}

        <Options
          game={game}
          onReducedMotion={setReducedMotion}
          onResetNew={() => reset(replayNewShuffle(game))}
          onResetSame={() => reset(replaySameState(game))}
          onScenario={(scenarioId) => reset(createCardBattleState(game.baseSeed, scenarioId))}
          reducedMotion={reducedMotion}
        />
      </main>
    </div>
  );
}
