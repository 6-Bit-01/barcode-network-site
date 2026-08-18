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

function interfaceCopy(value: string) {
  return value.replaceAll("Reserve", "Command Points");
}

function eventPhaseLabel(phase: ResolutionEvent["phase"]) {
  if (phase === "player") return "YOUR ACTIONS";
  if (phase === "enemy") return "ENEMY RESPONSE";
  return "ROUND RESULT";
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
        <span id="pressure-title">CONTROL <small>POSITION · NOT HEALTH</small></span>
        <strong>{signed(boundedPressure)}</strong>
        <span className={styles.breakState}>{breakArmed ? "BREAK ARMED" : "BREAK SPENT"}</span>
      </div>
      <div
        aria-label={`Battle control ${boundedPressure}. Break ${breakArmed ? "armed" : "spent"}.`}
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

function CommandPointDisplay({
  current,
  previewCard,
}: {
  current: number;
  previewCard: ThreeRouteCard | null;
}) {
  const previewCost = previewCard?.cost ?? 0;
  const projected = Math.max(0, current - previewCost);
  const label = previewCard
    ? `Command Points ${current}. Placing ${previewCard.name} costs ${previewCost} and leaves ${projected}.`
    : `Command Points ${current} of ${THREE_ROUTE_RULES.reserveCap}.`;

  return (
    <div
      aria-label={label}
      className={styles.commandPoints}
      data-preview={previewCard ? "true" : "false"}
      role="status"
    >
      <span className={styles.commandPointLabel}>COMMAND POINTS</span>
      <strong className={styles.commandPointAmount}>
        {current}<small>/{THREE_ROUTE_RULES.reserveCap}</small>
      </strong>
      {previewCard ? (
        <span className={styles.commandPointDelta}>
          <b>− {previewCost}</b>
          <small>{current} → {projected} IF PLACED</small>
        </span>
      ) : <small className={styles.commandPointReady}>AVAILABLE</small>}
    </div>
  );
}

function CardFace({
  card,
  availability,
  usable,
}: {
  card: ThreeRouteCard;
  availability: string;
  usable: boolean;
}) {
  return (
    <span className={styles.card} data-category={card.category}>
      <span className={styles.cardTop}>
        <span className={styles.categoryBadge}>{CATEGORY_LABELS[card.category]}</span>
        <span aria-label={`Costs ${card.cost} Command Points`} className={styles.cardCost}>
          <b>− {card.cost}</b><small>CP</small>
        </span>
      </span>
      <strong className={styles.cardName}>{card.name}</strong>
      <span>{card.effect}</span>
      <span className={styles.cardAvailability} data-usable={usable ? "true" : "false"}>{availability}</span>
      {card.context ? <span className={styles.contextTag}>CONTEXT · TEMPORARY</span> : null}
      {card.kind === "modifier" ? <span className={styles.modifierTag}>MODIFIER</span> : null}
    </span>
  );
}

function intentLabel(
  intent: ThreeRouteState["enemyIntents"][number] | undefined,
  fallback: string,
) {
  if (!intent) return fallback;
  if (intent.impact > 0) return `${intent.name} · ${intent.impact} IMPACT`;
  if (intent.pressure > 0) return `${intent.name} · CONTROL -${intent.pressure}`;
  return intent.name;
}

function HealthMeter({
  value,
  maximum,
  enemy = false,
  label,
}: {
  value: number;
  maximum: number;
  enemy?: boolean;
  label: string;
}) {
  const percentage = maximum > 0 ? Math.max(0, Math.min(100, (value / maximum) * 100)) : 0;
  return (
    <span
      aria-label={`${label}: ${value} of ${maximum} health`}
      aria-valuemax={maximum}
      aria-valuemin={0}
      aria-valuenow={value}
      className={styles.healthMeter}
      data-critical={value > 0 && value <= Math.ceil(maximum * 0.25) ? "true" : "false"}
      data-enemy={enemy ? "true" : "false"}
      role="meter"
    >
      <i style={{ width: `${percentage}%` }} />
    </span>
  );
}

function cardAvailability(game: ThreeRouteState, card: ThreeRouteCard) {
  if (card.cost > game.player.reserve) {
    return { usable: false, label: `NEEDS ${card.cost} COMMAND POINTS` };
  }
  if (
    card.kind !== "modifier" &&
    game.player.plan.length >= THREE_ROUTE_RULES.maxPlanSteps
  ) {
    return { usable: false, label: "PLAN FULL" };
  }
  const routeCount = getThreeRouteChoices(game, card.id).length;
  if (routeCount === 0) {
    return { usable: false, label: "NOT USABLE HERE" };
  }
  return {
    usable: true,
    label: `USABLE HERE · ${routeCount} TARGET${routeCount === 1 ? "" : "S"}`,
  };
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
  focusedChoiceId,
  selectedCard,
  onChoose,
}: {
  game: ThreeRouteState;
  choices: ThreeRouteChoice[];
  projected: ProjectedTheater;
  activeEvent: ResolutionEvent | null;
  focusedChoiceId: string | null;
  selectedCard: ThreeRouteCard | null;
  onChoose: (choice: ThreeRouteChoice) => void;
}) {
  const { scenario } = game;
  const zoneMap = useMemo(
    () => new Map(scenario.zones.map((zone) => [zone.id, zone])),
    [scenario.zones],
  );
  const eventSnapshot = activeEvent?.after;
  const playerPositionId = eventSnapshot?.playerPositionId ?? game.player.positionId;
  const playerCondition = eventSnapshot?.playerCondition ?? game.player.condition;
  const playerMaximum = eventSnapshot?.playerMaxCondition ?? game.player.maxCondition;
  const playerGuard = eventSnapshot?.playerGuard ?? game.player.guard;
  const playerPower = eventSnapshot?.playerPower ?? game.player.power;
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
          <li data-active={!activeEvent && game.phase === "planning"}>1 · BUILD YOUR PLAN</li>
          <li data-active={activeEvent?.phase === "player"}>2 · YOUR ACTIONS</li>
          <li data-active={activeEvent?.phase === "enemy"}>3 · ENEMY RESPONSE</li>
          <li data-active={activeEvent?.phase === "settle" || game.phase !== "planning"}>4 · ROUND RESULT</li>
        </ol>
      </div>

      <div className={styles.combatHud} aria-label="Wayfinder combat status. Zero health means Compromised.">
        <article className={styles.playerHud} data-critical={playerCondition <= 3 ? "true" : "false"}>
          <header>
            <strong>YOU · WAYFINDER</strong>
            <b>HEALTH {playerCondition}/{playerMaximum}</b>
          </header>
          <div className={styles.hudStatusRow}>
            <HealthMeter label="Wayfinder" maximum={playerMaximum} value={playerCondition} />
            <span>GUARD <b>{playerGuard}</b></span>
            <span>POWER <b>{playerPower}</b></span>
            <span>AT <b>{playerZone.name}</b></span>
          </div>
        </article>
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
              data-preview={route?.id === focusedChoiceId ? "true" : "false"}
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
              data-preview={route?.id === focusedChoiceId ? "true" : "false"}
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
          data-preview={selfChoice?.id === focusedChoiceId ? "true" : "false"}
          data-target={selfChoice ? "true" : "false"}
          disabled={!selfChoice}
          onClick={() => selfChoice && onChoose(selfChoice)}
          style={zoneStyle(playerZone.x, playerZone.y)}
          type="button"
        >
          <span className={styles.wayfinderFigure} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.actorLabel}>
            <b>YOU · {playerCondition}/{playerMaximum} HP</b>
            <HealthMeter label="Wayfinder" maximum={playerMaximum} value={playerCondition} />
          </span>
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
              data-preview={route?.id === focusedChoiceId ? "true" : "false"}
              data-target={route ? "true" : "false"}
              disabled={!route}
              key={enemy.id}
              onClick={() => route && onChoose(route)}
              style={{ ...zoneStyle(zone.x, zone.y), "--actor-index": index } as CSSProperties}
              type="button"
            >
              <span className={styles.enemyFigure} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.actorLabel}>
                <b>{enemy.name} · {enemy.hp}/{enemy.maxHp} HP</b>
                <HealthMeter enemy label={enemy.name} maximum={enemy.maxHp} value={enemy.hp} />
                <small>{intentLabel(intent, enemy.role)}{enemy.guard > 0 ? ` · GUARD ${enemy.guard}` : ""}</small>
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
              data-preview={choice.id === focusedChoiceId ? "true" : "false"}
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
            <span>{eventPhaseLabel(activeEvent.phase)} · {activeEvent.index + 1}</span>
            <strong>{activeEvent.title}</strong>
            <p>{interfaceCopy(activeEvent.detail)}</p>
          </div>
        ) : (
          <p>
            {selectedCard
              ? <><b>{selectedCard.name.toUpperCase()} SELECTED</b> · A/B/C MARK ITS LEGAL THEATER TARGETS.</>
              : interfaceCopy(game.notice)}
          </p>
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
  const [focusedChoiceId, setFocusedChoiceId] = useState<string | null>(null);
  const [showFirstTurnGuide, setShowFirstTurnGuide] = useState(true);

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
  const availabilityByCardId = useMemo(() => {
    const entries = CARD_CATEGORIES.flatMap((category) =>
      visibleByCategory[category].map((card) => [card.id, cardAvailability(game, card)] as const),
    );
    return new Map(entries);
  }, [game, visibleByCategory]);
  const choices = selectedCard ? getThreeRouteChoices(game, selectedCard.id) : [];
  const plannedProjection = projectPlannedTheater(game);
  const activeEvent = pendingResolution?.currentReview?.events[resolutionEventIndex] ?? null;

  const projected: ProjectedTheater = activeEvent
    ? {
        playerPositionId: activeEvent.after.playerPositionId,
        playerCondition: activeEvent.after.playerCondition,
        playerMaxCondition: activeEvent.after.playerMaxCondition,
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
    setActiveCategory(null);
    setFocusedChoiceId(null);
  }

  function resolvePlan() {
    if (pendingResolution || game.player.plan.length === 0) return;
    const resolved = resolveThreeRouteRound(game);
    if (!resolved.currentReview) {
      setGame(resolved);
      return;
    }
    setSelectedCardId(null);
    setFocusedChoiceId(null);
    setResolutionEventIndex(0);
    setPendingResolution(resolved);
  }

  function resetScenario(scenarioId: string) {
    setSelectedCardId(null);
    setActiveCategory(null);
    setFocusedChoiceId(null);
    setShowFirstTurnGuide(true);
    setPendingResolution(null);
    setResolutionEventIndex(0);
    setGame(createThreeRouteState(`barcode-world-v0.3:${scenarioId}`, scenarioId));
  }

  const currentPressure = activeEvent?.after.pressure ?? game.pressure;
  const phaseLabel = pendingResolution
    ? activeEvent?.phase === "player"
      ? "YOUR ACTIONS"
      : activeEvent?.phase === "enemy"
        ? "ENEMY RESPONSE"
        : "ROUND RESULT"
    : game.phase === "planning"
      ? "BUILD YOUR PLAN"
      : game.phase === "result"
        ? "BATTLE COMPLETE"
        : "ROUND RESULT";

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
          focusedChoiceId={focusedChoiceId}
          game={game}
          onChoose={choose}
          projected={projected}
          selectedCard={pendingResolution ? null : selectedCard}
        />

        <div className={styles.statusBar} aria-label="Current round status">
          <strong>{phaseLabel}</strong>
          <span>ROUND <b>{game.round}</b></span>
          <span>PLAN <b>{game.player.plan.length}/{THREE_ROUTE_RULES.maxPlanSteps}</b></span>
          <CommandPointDisplay current={game.player.reserve} previewCard={pendingResolution ? null : selectedCard} />
        </div>

        {showFirstTurnGuide && game.round === 1 && game.phase === "planning" && !pendingResolution ? (
          <section className={styles.firstTurnGuide} aria-label="First turn guide">
            <span>ONE WAYFINDER · HEALTH 0 = COMPROMISED</span>
            <p>1 CATEGORY · 2 CARD · 3 THEATER TARGET · THEN ACT OUT THE PLAN</p>
            <button onClick={() => setShowFirstTurnGuide(false)} type="button">GOT IT</button>
          </section>
        ) : null}

        <PressureTrack pressure={currentPressure} breakArmed={game.breakArmed} />

        {pendingResolution && activeEvent ? (
          <section className={styles.resolvingPanel} aria-live="polite">
            <span>RESOLUTION {resolutionEventIndex + 1}/{pendingResolution.currentReview?.events.length}</span>
            <strong>{activeEvent.phase === "settle" ? "ROUND RESOLVES AFTER BOTH SIDES" : "ROUND NOT YET RESOLVED"}</strong>
          </section>
        ) : null}

        {game.phase === "planning" && !pendingResolution ? (
          <>
            <section className={styles.planDock} aria-labelledby="plan-title">
              <div className={styles.planDockHead}>
                <div>
                  <span className={styles.eyebrow}>PLAN · {game.player.plan.length}/{THREE_ROUTE_RULES.maxPlanSteps}</span>
                  <h2 id="plan-title">{game.player.plan.length === 0 ? "BUILD AN ACTION CHAIN" : "PROJECTED ACTION CHAIN"}</h2>
                </div>
                <div className={styles.controlRail}>
                  <button className={styles.secondaryButton} disabled={game.pendingActions.length === 0} onClick={() => { setSelectedCardId(null); setActiveCategory(null); setGame((current) => undoThreeRouteChoice(current)); }} type="button">UNDO</button>
                  <button className={styles.primaryButton} disabled={game.player.plan.length === 0} onClick={resolvePlan} type="button">ACT OUT PLAN</button>
                </div>
              </div>
              <div className={styles.planChain}>
                {ROUTE_SLOTS.map((slot) => {
                  const step = game.player.plan[slot];
                  const spentCommandPoints = step
                    ? step.card.cost + step.modifiers.reduce((total, modifier) => total + modifier.cost, 0)
                    : 0;
                  return step ? (
                    <article className={styles.planStep} data-category={step.card.category} key={step.id}>
                      <div className={styles.planStepTop}>
                        <span>STEP {slot + 1}</span>
                        <b>− {spentCommandPoints} CP</b>
                      </div>
                      <strong>{step.actionName}</strong>
                      <small>{step.forecast.chance}% · {step.target.name}</small>
                      {step.modifiers.length > 0 ? <p>+ {step.modifiers.map((modifier) => modifier.name).join(" + ")}</p> : null}
                    </article>
                  ) : <div className={styles.emptyPlanStep} key={slot}><span>STEP {slot + 1}</span><b>OPEN</b></div>;
                })}
              </div>
            </section>

            <section
              className={styles.poolsPanel}
              data-mode={selectedCard ? "selected" : activeCategory ? "cards" : "categories"}
              id="battle-controls"
              aria-labelledby="pools-title"
            >
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.sectionNumber}>01 · CHOOSE A CARD</span>
                  <span className={styles.eyebrow}>{selectedCard ? "CARD SELECTED" : activeCategory ? "CATEGORY OPEN" : "FOUR SEPARATE CARD POOLS"}</span>
                  <h2 id="pools-title">{selectedCard ? "READY TO TARGET" : activeCategory ? `${CATEGORY_LABELS[activeCategory]} CARDS` : "YOUR CARD LIBRARY"}</h2>
                </div>
                <p>{selectedCard ? "The library is condensed while you choose a physical target." : activeCategory ? "Every ready card remains available in this pool." : "Choose a category. Counts show what is ready and usable now."}</p>
              </div>

              {selectedCard ? (
                <div className={styles.selectedCardBar} data-category={selectedCard.category}>
                  <span className={styles.categoryBadge}>{CATEGORY_LABELS[selectedCard.category]}</span>
                  <div>
                    <strong>{selectedCard.name}</strong>
                    <small>{selectedCard.effect}</small>
                  </div>
                  <span className={styles.selectedCardCommandCost}>
                    <b>− {selectedCard.cost} CP</b>
                    <small>{game.player.reserve} → {game.player.reserve - selectedCard.cost}</small>
                  </span>
                  <span className={styles.selectedCardStats}>{choices.length} TARGET{choices.length === 1 ? "" : "S"}</span>
                  <button className={styles.secondaryButton} onClick={() => setSelectedCardId(null)} type="button">CHANGE CARD</button>
                </div>
              ) : (
                <>
                  <div className={styles.categoryGrid}>
                    {CARD_CATEGORIES.map((category) => {
                      const visibleCards = visibleByCategory[category];
                      const contextCount = visibleCards.filter((card) => card.context).length;
                      const usableCount = visibleCards.filter((card) => availabilityByCardId.get(card.id)?.usable).length;
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
                            setSelectedCardId(null);
                          }}
                          type="button"
                        >
                          <span className={styles.categorySummary}>
                            <strong>{CATEGORY_LABELS[category]}</strong>
                            <small>{isOpen ? "CLOSE CARDS" : CATEGORY_DETAILS[category].cue}</small>
                          </span>
                          <span className={styles.categoryCounts}>
                            <b>{visibleCards.length} READY</b>
                            <span>{usableCount} USABLE{contextCount ? ` · ${contextCount} CONTEXT` : ""}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeCategory ? (() => {
                const category = activeCategory;
                const pool = game.player.pools[category];
                const visibleCards = visibleByCategory[category];
                const usableCount = visibleCards.filter((card) => availabilityByCardId.get(card.id)?.usable).length;
                return (
                  <section
                    className={styles.categoryDrawer}
                    data-category={category}
                    id={`category-cards-${category}`}
                  >
                    <header>
                      <div>
                        <span>{CATEGORY_LABELS[category]}</span>
                        <strong>{visibleCards.length} READY · {usableCount} USABLE HERE</strong>
                        <small>{pool.drawPile.length} DRAW · {pool.discard.length} DISCARD{visibleCards.some((card) => card.context) ? " · CONTEXT ACTIVE" : ""}</small>
                      </div>
                      <button
                        className={styles.cycleButton}
                        disabled={game.player.reserve < 1 || pool.available.length === 0}
                        onClick={() => { setSelectedCardId(null); setGame((current) => cycleThreeRouteCategory(current, category)); }}
                        title="Spend 1 Command Point to cycle the first general card"
                        type="button"
                      >CYCLE · −1 CP</button>
                    </header>
                    <div className={styles.poolCards}>
                      {visibleCards.map((card) => {
                        const availability = availabilityByCardId.get(card.id) ?? { usable: false, label: "NOT USABLE HERE" };
                        return (
                          <button
                            aria-pressed={selectedCardId === card.id}
                            className={styles.cardButton}
                            data-selected={selectedCardId === card.id ? "true" : "false"}
                            disabled={!availability.usable}
                            key={card.id}
                            onClick={() => {
                              setFocusedChoiceId(null);
                              setSelectedCardId((current) => current === card.id ? null : card.id);
                            }}
                            type="button"
                          >
                            <CardFace availability={availability.label} card={card} usable={availability.usable} />
                          </button>
                        );
                      })}
                      {visibleCards.length === 0 ? <div className={styles.emptyPool}>NO AVAILABLE CARDS<br /><small>Wait for a grant or reshuffle.</small></div> : null}
                    </div>
                  </section>
                );
                  })() : (
                    <p className={styles.categoryInstruction}>CHOOSE A CATEGORY TO SEE EVERY READY CARD.</p>
                  )}
                </>
              )}
            </section>

            {selectedCard ? (
              <section className={styles.routeBoard} aria-labelledby="routes-title">
                <div className={styles.sectionHead}>
                  <div>
                    <span className={styles.sectionNumber}>02 · CHOOSE A TARGET</span>
                    <span className={styles.eyebrow}>NEUTRAL CHOICE LANES</span>
                    <h2 id="routes-title">{selectedCard.name} · {choices.length} LEGAL TARGET{choices.length === 1 ? "" : "S"}</h2>
                  </div>
                  <p>A/B/C mark the card’s current physical options in the theater.</p>
                </div>
                <div className={styles.routeGrid}>
                  {ROUTE_SLOTS.map((slot) => {
                    const choice = choices[slot];
                    return choice ? (
                      <button
                        className={styles.routeChoice}
                        data-route={slot}
                        key={choice.id}
                        onBlur={() => setFocusedChoiceId(null)}
                        onClick={() => choose(choice)}
                        onFocus={() => setFocusedChoiceId(choice.id)}
                        onMouseEnter={() => setFocusedChoiceId(choice.id)}
                        onMouseLeave={() => setFocusedChoiceId(null)}
                        type="button"
                      >
                        <span className={styles.routeTop}><b>{ROUTE_LABELS[slot]}</b><span>{choice.target.kind.toUpperCase()}</span></span>
                        <span className={styles.routeCommandCost}>
                          <b>− {selectedCard.cost} CP</b>
                          <small>{game.player.reserve} → {game.player.reserve - selectedCard.cost}</small>
                        </span>
                        <strong>{choice.actionName}</strong>
                        {choice.prerequisiteLabel ? <small className={styles.prerequisite}>{choice.prerequisiteLabel}</small> : null}
                        <ProbabilityMeter choice={choice} />
                      </button>
                    ) : (
                      <div className={styles.emptyRoute} data-route={slot} key={slot}>
                        <span>{ROUTE_LABELS[slot]}</span>
                        <strong>NO LEGAL TARGET</strong>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.oddsNote}>Percentages are immediate odds, not promises. Earlier failures can invalidate later actions.</p>
              </section>
            ) : null}
          </>
        ) : null}

        {!pendingResolution && game.currentReview ? (
          <section className={styles.reviewPanel} aria-labelledby="review-title">
            <div className={styles.reviewHead}>
              <div>
                <span className={styles.eyebrow}>{game.result ? "BATTLE COMPLETE" : "ROUND RESOLVED"}</span>
                <h2 id="review-title">{game.result?.reason ?? `HEALTH ${game.currentReview.conditionBefore} → ${game.currentReview.conditionAfter} · CONTROL ${signed(game.currentReview.pressureBefore)} → ${signed(game.currentReview.pressureAfter)}`}</h2>
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
            {game.currentReview.grants.length > 0 || game.currentReview.breakTriggered ? (
              <div className={styles.grantStrip}>
                {game.currentReview.grants.map((grant, index) => <span key={`${grant.category}-${index}`}>{grant.label} · {CATEGORY_LABELS[grant.category]} +{grant.actual}</span>)}
                {game.currentReview.breakTriggered ? <span>PRESSURE BREAK · ALL CATEGORIES CHECKED</span> : null}
              </div>
            ) : null}
            <details className={styles.roundDetails}>
              <summary>ROUND DETAILS · {game.currentReview.events.length} EVENTS</summary>
              <div className={styles.visibleRecap}>
                {game.currentReview.events.map((event) => (
                  <article data-phase={event.phase} key={event.id}>
                    <span>{eventPhaseLabel(event.phase)}</span><strong>{event.title}</strong><p>{interfaceCopy(event.detail)}</p>
                  </article>
                ))}
              </div>
              <details className={styles.eventDetails}>
                <summary>DETERMINISTIC EVENT RECORD</summary>
                <pre>{JSON.stringify(game.currentReview.events.map(({ id, phase, title, chance, roll, success }) => ({ id, phase, title, chance, roll, success })), null, 2)}</pre>
              </details>
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
            <div className={styles.prototypeMeta}>
              <span>ENGINE · {game.source}</span>
              <span>SEED · {game.seed}</span>
              <span>NO PERSISTENCE · NO PRODUCTION EXPOSURE</span>
            </div>
          </div>
        </details>
      </main>
    </div>
  );
}

export default BarcodeWorldCardBattle;
