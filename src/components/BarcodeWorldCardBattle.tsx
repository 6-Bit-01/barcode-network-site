"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  CARD_CATEGORIES,
  THREE_ROUTE_RULES,
  THREE_ROUTE_SCENARIOS,
  chooseThreeRoute,
  createThreeRouteState,
  cycleThreeRouteCategory,
  getThreeRouteChoices,
  getVisibleCategoryCards,
  projectPlannedTheater,
  replayNewThreeRouteShuffle,
  replaySameThreeRouteState,
  resolveThreeRouteRound,
  startNextThreeRouteRound,
  undoThreeRouteChoice,
  type CardCategory,
  type ProjectedTheater,
  type ResolutionEvent,
  type RouteTarget,
  type ThreeRouteCard,
  type ThreeRouteChoice,
  type ThreeRouteState,
} from "@/lib/barcode-world/three-route-engine.mjs";
import styles from "./BarcodeWorldCardBattle.module.css";

const ROUTE_SLOTS = Array.from(
  { length: THREE_ROUTE_RULES.choiceLanes },
  (_, index) => index,
);

const CATEGORY_LABELS: Record<CardCategory, string> = {
  movement: "Movement",
  defense: "Defense",
  offense: "Offense",
  special: "Special",
};

const CATEGORY_DETAILS: Record<CardCategory, { purpose: string; cue: string }> = {
  movement: {
    purpose: "Position, approach, flank, or retreat.",
    cue: "WHERE CAN I GO?",
  },
  defense: {
    purpose: "Guard, evade, protect, or answer intent.",
    cue: "WHAT CAN I SAVE?",
  },
  offense: {
    purpose: "Strike, suppress, counter, or finish.",
    cue: "WHAT CAN I BREAK?",
  },
  special: {
    purpose: "Prepare, inspect, modify, or use the scene.",
    cue: "WHAT CAN I CHANGE?",
  },
};

const ROUTE_LABELS = ["ROUTE A", "ROUTE B", "ROUTE C"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function chanceTone(chance: number) {
  if (chance < 45) return "low";
  if (chance < 70) return "medium";
  return "high";
}

function zoneStyle(x: number, y: number): CSSProperties {
  return { "--zone-x": `${x}%`, "--zone-y": `${y}%` } as CSSProperties;
}

function PressureTrack({ pressure, breakArmed }: { pressure: number; breakArmed: boolean }) {
  const boundedPressure = Math.max(-5, Math.min(5, pressure));
  const position = ((boundedPressure + 5) / 10) * 100;
  return (
    <section className={styles.pressurePanel} aria-labelledby="pressure-title">
      <div className={styles.pressureHead}>
        <span id="pressure-title">BATTLE PRESSURE</span>
        <strong>{signed(boundedPressure)}</strong>
      </div>
      <div
        aria-label={`Battle pressure ${boundedPressure}. Break ${breakArmed ? "armed" : "spent"}.`}
        aria-valuemax={5}
        aria-valuemin={-5}
        aria-valuenow={boundedPressure}
        className={styles.pressureMeter}
        role="meter"
      >
        <span className={styles.pressureZero} />
        <span className={styles.breakNegative}>−3</span>
        <span className={styles.breakPositive}>+3</span>
        <span className={styles.pressureNeedle} style={{ left: `${position}%` }} />
      </div>
      <div className={styles.pressureEnds}>
        <span>HOSTILE CONTROL</span>
        <span>{breakArmed ? "BREAK ARMED" : "BREAK SPENT"}</span>
        <span>WAYFINDER CONTROL</span>
      </div>
    </section>
  );
}

function ProbabilityMeter({ choice }: { choice: ThreeRouteChoice }) {
  const tone = chanceTone(choice.forecast.chance);
  return (
    <div className={styles.forecast} data-tone={tone}>
      <div className={styles.forecastHead}>
        <strong>{choice.forecast.chance}%</strong>
        <span>SUCCESS</span>
      </div>
      <div
        aria-label={`${choice.forecast.chance} percent success chance`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={choice.forecast.chance}
        className={styles.probabilityMeter}
        role="meter"
      >
        <span style={{ width: `${choice.forecast.chance}%` }} />
      </div>
      <p><b>SUCCESS</b>{choice.forecast.successLabel}</p>
      <p><b>FAILURE</b>{choice.forecast.failureLabel}</p>
    </div>
  );
}

function CardFace({ card }: { card: ThreeRouteCard }) {
  return (
    <span className={styles.card} data-category={card.category}>
      <span className={styles.cardTop}>
        <span className={styles.categoryBadge}>{CATEGORY_LABELS[card.category]}</span>
        <span className={styles.cardCost}>{card.cost}<small>R</small></span>
      </span>
      <strong className={styles.cardName}>{card.name}</strong>
      <span>{card.effect}</span>
      <span className={styles.cardSerial}>BW/{card.designId.toUpperCase()}/{card.copy}</span>
      {card.context ? <span className={styles.contextTag}>CONTEXT · TEMPORARY</span> : null}
      {card.kind === "modifier" ? <span className={styles.modifierTag}>MODIFIER</span> : null}
    </span>
  );
}

function findChoiceForTarget(
  choices: ThreeRouteChoice[],
  target: RouteTarget,
) {
  return choices.find(
    (choice) => choice.target.kind === target.kind && choice.target.id === target.id,
  );
}

function BattleTheater({
  game,
  choices,
  projected,
  activeEvent,
  onChoose,
}: {
  game: ThreeRouteState;
  choices: ThreeRouteChoice[];
  projected: ProjectedTheater;
  activeEvent: ResolutionEvent | null;
  onChoose: (choice: ThreeRouteChoice) => void;
}) {
  const { scenario } = game;
  const zoneMap = useMemo(
    () => new Map(scenario.zones.map((zone) => [zone.id, zone])),
    [scenario.zones],
  );
  const eventSnapshot = activeEvent?.after;
  const playerPositionId = eventSnapshot?.playerPositionId ?? game.player.positionId;
  const enemies = eventSnapshot?.enemies ?? game.enemies;
  const playerZone = zoneMap.get(playerPositionId) ?? scenario.zones[0];
  const projectedZone = zoneMap.get(projected.playerPositionId) ?? playerZone;
  const selfChoice = choices.find((choice) => choice.target.kind === "self");

  return (
    <section
      className={styles.theater}
      data-cue={activeEvent?.sceneCue ?? "planning"}
      aria-labelledby="theater-title"
    >
      <div className={styles.theaterHead}>
        <div>
          <span className={styles.eyebrow}>CONNECTED BATTLE THEATER</span>
          <h2 id="theater-title">{scenario.location}</h2>
          <p>{scenario.objective}</p>
        </div>
        <ol className={styles.sequence} aria-label="Round sequence">
          <li data-active={!activeEvent && game.phase === "planning"}>1 · PLAYER PLAN</li>
          <li data-active={activeEvent?.phase === "player"}>2 · PLAYER ACTS</li>
          <li data-active={activeEvent?.phase === "enemy"}>3 · ENEMY ACTS</li>
          <li data-active={activeEvent?.phase === "settle" || game.phase !== "planning"}>4 · SETTLE</li>
        </ol>
      </div>

      <div className={styles.battlefield}>
        <svg className={styles.edgeLayer} aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          {scenario.edges.map(([fromId, toId]) => {
            const from = zoneMap.get(fromId);
            const to = zoneMap.get(toId);
            if (!from || !to) return null;
            return <line key={`${fromId}-${toId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
          {!activeEvent && game.player.plan.filter(
            (step) => step.card.move && step.target.kind === "zone",
          ).map((step) => {
            const from = zoneMap.get(step.expectedStartId);
            const to = zoneMap.get(step.target.zoneId);
            if (!from || !to || from.id === to.id) return null;
            return (
              <line
                className={styles.projectedLine}
                key={step.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
            );
          })}
        </svg>

        <div className={styles.theaterLegend} aria-label="Theater map legend">
          <span><i data-kind="path" />PHYSICAL PATH</span>
          <span><i data-kind="target" />LEGAL TARGET</span>
          <span><i data-kind="projection" />PROJECTED MOVE</span>
        </div>

        {scenario.zones.map((zone) => {
          const route = choices.find(
            (choice) => choice.target.kind === "zone" && choice.target.id === zone.id,
          );
          return (
            <button
              aria-label={route ? `${zone.name}, ${ROUTE_LABELS[route.lane]}` : zone.name}
              className={styles.zone}
              data-cover={zone.cover ? "true" : "false"}
              data-exit={zone.exit ? "true" : "false"}
              data-target={route ? "true" : "false"}
              disabled={!route}
              key={zone.id}
              onClick={() => route && onChoose(route)}
              style={zoneStyle(zone.x, zone.y)}
              type="button"
            >
              <span>{zone.name}</span>
              <small>{zone.exit ? "EXIT" : zone.feature ? zone.feature.toUpperCase() : zone.cover ? "COVER" : "POSITION"}</small>
            </button>
          );
        })}

        {scenario.objects.map((objectValue, index) => {
          const zone = zoneMap.get(objectValue.zoneId);
          const target: RouteTarget = {
            kind: "object",
            id: objectValue.id,
            name: objectValue.name,
            zoneId: objectValue.zoneId,
            feature: objectValue.feature,
          };
          const route = findChoiceForTarget(choices, target);
          if (!zone) return null;
          return (
            <button
              aria-label={route ? `${objectValue.name}, ${ROUTE_LABELS[route.lane]}` : objectValue.name}
              className={styles.objectMarker}
              data-target={route ? "true" : "false"}
              disabled={!route}
              key={objectValue.id}
              onClick={() => route && onChoose(route)}
              style={{ ...zoneStyle(zone.x, zone.y), "--object-index": index } as CSSProperties}
              type="button"
            >
              <span>◇</span>{objectValue.name}
            </button>
          );
        })}

        <button
          aria-label={selfChoice ? `Wayfinder, ${ROUTE_LABELS[selfChoice.lane]}` : "Wayfinder"}
          className={styles.wayfinderActor}
          data-target={selfChoice ? "true" : "false"}
          disabled={!selfChoice}
          onClick={() => selfChoice && onChoose(selfChoice)}
          style={zoneStyle(playerZone.x, playerZone.y)}
          type="button"
        >
          <span className={styles.wayfinderFigure} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.actorLabel}><b>WAYFINDER</b><small>{eventSnapshot?.playerGuard ?? game.player.guard} GUARD · {eventSnapshot?.playerPower ?? game.player.power} POWER</small></span>
        </button>

        {!activeEvent && projectedZone.id !== playerZone.id ? (
          <span className={styles.projectedWayfinder} style={zoneStyle(projectedZone.x, projectedZone.y)}>
            <span aria-hidden="true">◇</span>
            <b>PROJECTED</b>
          </span>
        ) : null}

        {enemies.filter((enemy) => enemy.hp > 0).map((enemy, index) => {
          const zone = zoneMap.get(enemy.positionId);
          const target: RouteTarget = {
            kind: "enemy",
            id: enemy.id,
            name: enemy.name,
            zoneId: enemy.positionId,
          };
          const route = findChoiceForTarget(choices, target);
          const intent = game.enemyIntents.find((entry) => entry.actorId === enemy.id);
          if (!zone) return null;
          return (
            <button
              aria-label={route ? `${enemy.name}, ${ROUTE_LABELS[route.lane]}` : `${enemy.name}, ${enemy.hp} health`}
              className={styles.enemyActor}
              data-target={route ? "true" : "false"}
              disabled={!route}
              key={enemy.id}
              onClick={() => route && onChoose(route)}
              style={{ ...zoneStyle(zone.x, zone.y), "--actor-index": index } as CSSProperties}
              type="button"
            >
              <span className={styles.enemyFigure} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.actorLabel}>
                <b>{enemy.name}</b>
                <small>{intent?.name ?? enemy.role}</small>
                <span className={styles.healthPips} aria-hidden="true">
                  {Array.from({ length: enemy.maxHp }, (_, pip) => <i data-full={pip < enemy.hp} key={pip} />)}
                </span>
              </span>
            </button>
          );
        })}

        {!activeEvent && choices.map((choice) => {
          const zone = zoneMap.get(choice.target.zoneId);
          if (!zone || choice.target.kind === "plan") return null;
          return (
            <span
              className={styles.routeMarker}
              data-route={choice.lane}
              key={`marker-${choice.id}`}
              style={zoneStyle(zone.x, zone.y)}
            >
              {String.fromCharCode(65 + choice.lane)}
            </span>
          );
        })}
      </div>

      <div className={styles.theaterFooter}>
        {activeEvent ? (
          <div className={styles.eventBanner} aria-live="assertive">
            <span>{activeEvent.phase.toUpperCase()} · {activeEvent.index + 1}</span>
            <strong>{activeEvent.title}</strong>
            <p>{activeEvent.detail}</p>
          </div>
        ) : (
          <p>{game.notice}</p>
        )}
      </div>
    </section>
  );
}

export function BarcodeWorldCardBattle() {
  const [game, setGame] = useState<ThreeRouteState>(() => createThreeRouteState());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<ThreeRouteState | null>(null);
  const [resolutionEventIndex, setResolutionEventIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CardCategory | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const visibleByCategory = useMemo(
    () => Object.fromEntries(
      CARD_CATEGORIES.map((category) => [category, getVisibleCategoryCards(game, category)]),
    ) as Record<CardCategory, ThreeRouteCard[]>,
    [game],
  );
  const selectedCard = selectedCardId
    ? CARD_CATEGORIES.flatMap((category) => visibleByCategory[category]).find((card) => card.id === selectedCardId) ?? null
    : null;
  const choices = selectedCard ? getThreeRouteChoices(game, selectedCard.id) : [];
  const plannedProjection = projectPlannedTheater(game);
  const activeEvent = pendingResolution?.currentReview?.events[resolutionEventIndex] ?? null;

  const projected: ProjectedTheater = activeEvent
    ? {
        playerPositionId: activeEvent.after.playerPositionId,
        playerGuard: activeEvent.after.playerGuard,
        playerPower: activeEvent.after.playerPower,
        playerExposed: activeEvent.after.playerExposed,
        flankBonus: false,
        enemies: activeEvent.after.enemies,
        objectiveProgress: activeEvent.after.objectiveProgress,
        protectedObjectId: null,
        scannedObjectIds: [],
        pressure: activeEvent.after.pressure,
        retreatCompleted: false,
      }
    : plannedProjection;

  useEffect(() => {
    if (!pendingResolution?.currentReview) return;
    const events = pendingResolution.currentReview.events;
    const timer = window.setTimeout(() => {
      if (resolutionEventIndex < events.length - 1) {
        setResolutionEventIndex((index) => index + 1);
      } else {
        setGame(pendingResolution);
        setPendingResolution(null);
        setResolutionEventIndex(0);
      }
    }, reducedMotion ? 350 : activeEvent?.phase === "settle" ? 1200 : 1550);
    return () => window.clearTimeout(timer);
  }, [activeEvent?.phase, pendingResolution, reducedMotion, resolutionEventIndex]);

  useEffect(() => {
    if (selectedCardId && !selectedCard) setSelectedCardId(null);
  }, [selectedCard, selectedCardId]);

  function choose(choice: ThreeRouteChoice) {
    if (!selectedCard || pendingResolution) return;
    setGame((current) => chooseThreeRoute(current, selectedCard.id, choice.id));
    setSelectedCardId(null);
  }

  function resolvePlan() {
    if (pendingResolution || game.player.plan.length === 0) return;
    const resolved = resolveThreeRouteRound(game);
    if (!resolved.currentReview) {
      setGame(resolved);
      return;
    }
    setSelectedCardId(null);
    setResolutionEventIndex(0);
    setPendingResolution(resolved);
  }

  function resetScenario(scenarioId: string) {
    setSelectedCardId(null);
    setActiveCategory(null);
    setPendingResolution(null);
    setResolutionEventIndex(0);
    setGame(createThreeRouteState(`barcode-world-v0.3:${scenarioId}`, scenarioId));
  }

  const currentPressure = activeEvent?.after.pressure ?? game.pressure;
  const phaseLabel = pendingResolution
    ? activeEvent?.phase === "player"
      ? "PLAYER ACTIONS"
      : activeEvent?.phase === "enemy"
        ? "ENEMY ACTIONS"
        : "ROUND SETTLING"
    : game.phase === "planning"
      ? "PLANNING"
      : game.phase === "result"
        ? "BATTLE COMPLETE"
        : "ROUND SETTLED";

  return (
    <div className={cx(styles.shell, reducedMotion && styles.reducedMotion)}>
      <a className={styles.skipLink} href="#battle-controls">Skip to battle controls</a>
      <main className={styles.main}>
        <header className={styles.masthead}>
          <div className={styles.identity}>
            <span className={styles.barcodeMark} aria-hidden="true" />
            <div>
              <span className={styles.eyebrow}>BARCODE WORLD · PRIVATE BATTLE RESEARCH</span>
              <h1>THREE-ROUTE THEATER</h1>
              <p>ONE PHYSICAL BATTLE · CATEGORY CARD LIBRARY · THREE CHOICES</p>
            </div>
          </div>
          <div className={styles.prototypeBadges}>
            <span>v0.3</span><span>UNLISTED</span><span>IN MEMORY</span>
          </div>
        </header>

        <BattleTheater
          activeEvent={activeEvent}
          choices={pendingResolution ? [] : choices}
          game={game}
          onChoose={choose}
          projected={projected}
        />

        <div className={styles.statusBar}>
          <span>ROUND <b>{game.round}</b></span>
          <span>STATE <b>{phaseLabel}</b></span>
          <span>RESERVE <b>{game.player.reserve}</b></span>
          <span>HOSTILES <b>{game.enemies.filter((enemy) => enemy.hp > 0).length}</b></span>
          <span>PLAN <b>{game.player.plan.length}/{THREE_ROUTE_RULES.maxPlanSteps}</b></span>
        </div>

        <PressureTrack pressure={currentPressure} breakArmed={game.breakArmed} />

        {pendingResolution && activeEvent ? (
          <section className={styles.resolvingPanel} aria-live="polite">
            <span>RESOLUTION {resolutionEventIndex + 1}/{pendingResolution.currentReview?.events.length}</span>
            <strong>{activeEvent.phase === "settle" ? "ROUND RESOLVES AFTER BOTH SIDES" : "ROUND NOT YET RESOLVED"}</strong>
          </section>
        ) : null}

        {game.phase === "planning" && !pendingResolution ? (
          <>
            <section className={styles.poolsPanel} id="battle-controls" aria-labelledby="pools-title">
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionNumber}>01 · CHOOSE A CATEGORY</span>
                  <span className={styles.eyebrow}>FOUR SEPARATE CARD POOLS</span>
                  <h2 id="pools-title">YOUR CARD LIBRARY</h2>
                </div>
                <p>Open one category, then choose from several reusable cards. The category is not a lane.</p>
              </div>
              <div className={styles.categoryGrid}>
                {CARD_CATEGORIES.map((category, index) => {
                  const pool = game.player.pools[category];
                  const visibleCards = visibleByCategory[category];
                  const contextCount = visibleCards.filter((card) => card.context).length;
                  const preview = visibleCards.slice(0, 3).map((card) => card.name).join(" · ");
                  const extra = Math.max(0, visibleCards.length - 3);
                  const isOpen = activeCategory === category;
                  return (
                    <button
                      aria-controls={`category-cards-${category}`}
                      aria-expanded={isOpen}
                      className={styles.categorySelector}
                      data-category={category}
                      data-open={isOpen ? "true" : "false"}
                      key={category}
                      onClick={() => {
                        setActiveCategory((current) => current === category ? null : category);
                        if (activeCategory !== category) setSelectedCardId(null);
                      }}
                      type="button"
                    >
                      <span className={styles.categoryIndex}>{String(index + 1).padStart(2, "0")}</span>
                      <span className={styles.categorySummary}>
                        <strong>{CATEGORY_LABELS[category]}</strong>
                        <small>{CATEGORY_DETAILS[category].purpose}</small>
                      </span>
                      <span className={styles.categoryCounts}>
                        <b>{visibleCards.length}<small> READY</small></b>
                        <span>{pool.drawPile.length} DECK · {pool.discard.length} DISCARD{contextCount ? ` · ${contextCount} CONTEXT` : ""}</span>
                      </span>
                      <span className={styles.categoryPreview}>{preview}{extra ? ` · +${extra} MORE` : ""}</span>
                      <span className={styles.categoryCue}>{isOpen ? "CLOSE CARDS" : CATEGORY_DETAILS[category].cue}</span>
                    </button>
                  );
                })}
              </div>

              {activeCategory ? (() => {
                const category = activeCategory;
                const pool = game.player.pools[category];
                const visibleCards = visibleByCategory[category];
                return (
                  <section
                    className={styles.categoryDrawer}
                    data-category={category}
                    id={`category-cards-${category}`}
                  >
                    <header>
                      <div>
                        <span>{CATEGORY_LABELS[category]} · {visibleCards.length} AVAILABLE</span>
                        <strong>{CATEGORY_DETAILS[category].purpose}</strong>
                        <small>{pool.drawPile.length} DRAW · {pool.discard.length} DISCARD · NO AUTOMATIC PLACEMENT REFILL</small>
                      </div>
                      <button
                        className={styles.cycleButton}
                        disabled={game.player.reserve < 1 || pool.available.length === 0}
                        onClick={() => { setSelectedCardId(null); setGame((current) => cycleThreeRouteCategory(current, category)); }}
                        title="Spend 1 Reserve to cycle the first general card"
                        type="button"
                      >CYCLE · 1R</button>
                    </header>
                    <div className={styles.poolCards}>
                      {visibleCards.map((card) => (
                        <button
                          aria-pressed={selectedCardId === card.id}
                          className={styles.cardButton}
                          data-selected={selectedCardId === card.id ? "true" : "false"}
                          disabled={card.cost > game.player.reserve}
                          key={card.id}
                          onClick={() => setSelectedCardId((current) => current === card.id ? null : card.id)}
                          type="button"
                        >
                          <CardFace card={card} />
                        </button>
                      ))}
                      {visibleCards.length === 0 ? <div className={styles.emptyPool}>NO AVAILABLE CARDS<br /><small>Wait for a grant or reshuffle.</small></div> : null}
                    </div>
                  </section>
                );
              })() : (
                <p className={styles.categoryInstruction}>TAP MOVEMENT, DEFENSE, OFFENSE, OR SPECIAL TO OPEN ITS AVAILABLE CARDS.</p>
              )}
            </section>

            <section className={styles.routeBoard} aria-labelledby="routes-title">
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionNumber}>02 · CHOOSE A TARGET</span>
                  <span className={styles.eyebrow}>NEUTRAL CHOICE LANES</span>
                  <h2 id="routes-title">{selectedCard ? `${selectedCard.name} · LEGAL TARGETS` : "SELECT A CARD TO OPEN THREE ROUTES"}</h2>
                </div>
                <p>Cards have categories. Routes do not. The theater highlights targets; its fixed paths remain the physical map.</p>
              </div>
              <div className={styles.routeGrid}>
                {ROUTE_SLOTS.map((slot) => {
                  const choice = choices[slot];
                  return choice ? (
                    <button
                      className={styles.routeChoice}
                      data-route={slot}
                      key={choice.id}
                      onClick={() => choose(choice)}
                      type="button"
                    >
                      <span className={styles.routeTop}><b>{ROUTE_LABELS[slot]}</b><span>{choice.target.kind.toUpperCase()}</span></span>
                      <strong>{choice.actionName}</strong>
                      {choice.prerequisiteLabel ? <small className={styles.prerequisite}>{choice.prerequisiteLabel}</small> : null}
                      <ProbabilityMeter choice={choice} />
                    </button>
                  ) : (
                    <div className={styles.emptyRoute} data-route={slot} key={slot}>
                      <span>{ROUTE_LABELS[slot]}</span>
                      <strong>{selectedCard ? "NO LEGAL TARGET" : "AWAITING CARD"}</strong>
                      <p>{selectedCard ? "The current projected position cannot use this route." : "Open a category and select a card above."}</p>
                    </div>
                  );
                })}
              </div>
              <p className={styles.oddsNote}>Displayed percentages are immediate odds, not promises. A failed movement can invalidate later position-dependent actions.</p>
            </section>

            <section className={styles.planPanel} aria-labelledby="plan-title">
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionNumber}>03 · REVIEW THE PLAN</span>
                  <span className={styles.eyebrow}>ONE WAYFINDER · SEQUENTIAL PLAN</span>
                  <h2 id="plan-title">PROJECTED ACTION CHAIN</h2>
                </div>
                <div className={styles.controlRail}>
                  <button className={styles.secondaryButton} disabled={game.pendingActions.length === 0} onClick={() => { setSelectedCardId(null); setGame((current) => undoThreeRouteChoice(current)); }} type="button">UNDO LAST</button>
                  <button className={styles.primaryButton} disabled={game.player.plan.length === 0} onClick={resolvePlan} type="button">ACT OUT PLAN</button>
                </div>
              </div>
              <div className={styles.planChain}>
                {ROUTE_SLOTS.map((slot) => {
                  const step = game.player.plan[slot];
                  return step ? (
                    <article className={styles.planStep} data-category={step.card.category} key={step.id}>
                      <span>STEP {slot + 1}</span>
                      <strong>{step.actionName}</strong>
                      <small>{step.forecast.chance}% · FROM {game.scenario.zones.find((zone) => zone.id === step.expectedStartId)?.name ?? step.expectedStartId}</small>
                      {step.modifiers.length > 0 ? <p>MOD · {step.modifiers.map((modifier) => modifier.name).join(" + ")}</p> : null}
                    </article>
                  ) : <div className={styles.emptyPlanStep} key={slot}><span>STEP {slot + 1}</span><b>OPEN</b></div>;
                })}
              </div>
            </section>
          </>
        ) : null}

        {!pendingResolution && game.currentReview ? (
          <section className={styles.reviewPanel} aria-labelledby="review-title">
            <div className={styles.reviewHead}>
              <div>
                <span className={styles.eyebrow}>{game.result ? "BATTLE COMPLETE" : "ROUND RESOLVED"}</span>
                <h2 id="review-title">{game.result?.reason ?? `PRESSURE ${signed(game.currentReview.pressureBefore)} → ${signed(game.currentReview.pressureAfter)}`}</h2>
              </div>
              <div className={styles.reviewActions}>
                {game.phase === "round-review" ? <button className={styles.primaryButton} onClick={() => setGame((current) => startNextThreeRouteRound(current))} type="button">NEXT ROUND</button> : null}
                {game.phase === "result" ? (
                  <>
                    <button className={styles.secondaryButton} onClick={() => setGame((current) => replaySameThreeRouteState(current))} type="button">REPLAY SAME STATE</button>
                    <button className={styles.primaryButton} onClick={() => setGame((current) => replayNewThreeRouteShuffle(current))} type="button">NEW SHUFFLE</button>
                  </>
                ) : null}
              </div>
            </div>
            <div className={styles.grantStrip}>
              {game.currentReview.grants.length > 0
                ? game.currentReview.grants.map((grant, index) => <span key={`${grant.category}-${index}`}>{grant.label} · {CATEGORY_LABELS[grant.category]} +{grant.actual}</span>)
                : <span>NO CARD GRANT THIS ROUND</span>}
              {game.currentReview.breakTriggered ? <span>PRESSURE BREAK · ALL CATEGORIES CHECKED</span> : null}
            </div>
            <div className={styles.visibleRecap}>
              {game.currentReview.events.map((event) => (
                <article data-phase={event.phase} key={event.id}>
                  <span>{event.phase.toUpperCase()}</span><strong>{event.title}</strong><p>{event.detail}</p>
                </article>
              ))}
            </div>
            <details className={styles.eventDetails}>
              <summary>VIEW DETERMINISTIC EVENT RECORD</summary>
              <pre>{JSON.stringify(game.currentReview.events.map(({ id, phase, title, chance, roll, success }) => ({ id, phase, title, chance, roll, success })), null, 2)}</pre>
            </details>
          </section>
        ) : null}

        <details className={styles.options}>
          <summary>PROTOTYPE OPTIONS &amp; SCENARIOS</summary>
          <div className={styles.optionsBody}>
            <label className={styles.checkboxLabel}>
              <input checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} type="checkbox" />
              Reduce theater motion
            </label>
            <div className={styles.optionActions}>
              {THREE_ROUTE_SCENARIOS.map((scenario) => (
                <button aria-pressed={game.scenarioId === scenario.id} key={scenario.id} onClick={() => resetScenario(scenario.id)} type="button">
                  <b>{scenario.name}</b><small>{scenario.shortName}</small>
                </button>
              ))}
            </div>
          </div>
        </details>

        <footer className={styles.controlState}>
          <span>ENGINE · {game.source}</span>
          <span>SEED · {game.seed}</span>
          <span>NO PERSISTENCE · NO PRODUCTION EXPOSURE</span>
        </footer>
      </main>
    </div>
  );
}

export default BarcodeWorldCardBattle;
