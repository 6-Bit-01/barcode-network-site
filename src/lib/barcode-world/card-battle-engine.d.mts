export type CardSide = "player" | "enemy";
export type BattlePhase = "setup" | "player-action" | "round-review" | "result";
export type CardType =
  | "attack"
  | "defend"
  | "maneuver"
  | "modifier"
  | "preparation"
  | "reaction"
  | "finisher"
  | "recovery";

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  effect: string;
  ability: string;
  accuracy: number;
  impact: number;
  resistance: number;
  guard: number;
  drawOnSuccess: number;
}

export interface CardInstance extends CardDefinition {
  designId: string;
  side: CardSide;
  copy: number;
}

export interface ScenarioReplenishment {
  roundStartDraw: number;
  contestedSuccessDraw: number;
  successfulComboDraw: number;
  fearUnlockDraw: number;
  pressureUnlockDraw: number;
  pressureUnlockAt: number;
  emptyRackFallback: number;
  breakRefill: number;
  enemyReplenishment: number;
}

export interface CardBattleScenario {
  id: string;
  name: string;
  shortName: string;
  rule: string;
  openingHand: number;
  reservePerRoundBonus: number;
  replenishment: ScenarioReplenishment;
}

export interface CompiledMove {
  side: CardSide;
  name: string;
  cards: CardInstance[];
  cost: number;
  accuracy: number;
  impact: number;
  resistance: number;
  guard: number;
  drawOnSuccess: number;
  category: CardType;
  appliesFear: boolean;
  setsCharge: boolean;
  usesCharge: boolean;
  usesFear: boolean;
  matchup: Record<string, number>;
  signature: string;
}

export interface BattleEvent {
  id: string;
  round: number;
  type: string;
  title: string;
  detail: string;
  sceneCue: string;
  lane: number | null;
  side: string;
  actionId: string | null;
}

export interface EnemyIntent {
  lane: number;
  cards: CardInstance[];
  move: CompiledMove;
  cost: number;
  score: number;
}

export interface LaneForecast {
  lane: number;
  playerMove: CompiledMove | null;
  enemyMove: CompiledMove | null;
  chance: number | null;
  successPressure: number;
  failurePressure: number;
  successLabel: string;
  failureLabel: string;
}

export interface PlacementPreview {
  legal: boolean;
  reason: string;
  lane: number;
  card: CardInstance | null;
  forecast: LaneForecast | null;
}

export interface LaneResult extends LaneForecast {
  roll: number | null;
  success: boolean | null;
  pressure: number;
}

export interface ReplenishmentSource {
  type: "automatic" | "outcome" | "unlock" | "card" | "fallback" | "break";
  label: string;
  requested: number;
}

export interface ReplenishmentResult {
  contestedSuccess: boolean;
  comboSuccess: boolean;
  cardEffectDraws: number;
  unlockDraws: number;
  outcomeDraws: number;
  fallbackDraws: number;
  sources: ReplenishmentSource[];
  requested: number;
  playerDrawn: number;
  enemyDrawn: number;
}

export interface RoundReview {
  round: number;
  pressureBefore: number;
  pressureAfter: number;
  pressureDelta: number;
  breakTriggered: boolean;
  winner: CardSide | null;
  replenishment: ReplenishmentResult | null;
  laneResults: LaneResult[];
  events: BattleEvent[];
}

export interface BattleConditions {
  charge?: boolean;
  chargeLane?: number | null;
  fear?: boolean;
}

export interface BattleSideState {
  reserve: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  lanes?: CardInstance[][];
  conditions: BattleConditions;
}

export interface CardBattleState {
  version: "0.2";
  source: string;
  scenario: CardBattleScenario;
  scenarioId: string;
  baseSeed: string;
  seed: string;
  shuffleIndex: number;
  round: number;
  phase: BattlePhase;
  pressure: number;
  breakArmed: boolean;
  result: { winner: CardSide; round: number; pressure: number; reason: string } | null;
  notice: string;
  player: BattleSideState & { lanes: CardInstance[][] };
  enemy: BattleSideState;
  enemyPreview: { round: number; locked: boolean; lanes: Array<EnemyIntent | null> };
  pendingPlayerActions: Array<Record<string, unknown>>;
  pendingEvents: BattleEvent[];
  currentReview: RoundReview | null;
  currentRoundGrant: { automaticCards: number; reserveBonus: number };
  history: RoundReview[];
  unlocks: { fearDrawClaimed: boolean; pressureDrawClaimed: boolean };
  rng: { playerReshuffles: number; enemyReshuffles: number };
  eventSequence: number;
  playerActionSequence: number;
}

export interface SimulationResult {
  version: "0.2";
  scenarioId: string;
  battles: number;
  maxRounds: number;
  playerWins: number;
  enemyWins: number;
  unfinished: number;
  breaks: number;
  attempts: number;
  successes: number;
  cardsDrawn: number;
  namedCombos: Record<string, number>;
  rounds: number[];
  averageRounds: number;
  averageCardsDrawn: number;
  minRounds: number;
  maxRoundsObserved: number;
  successRate: number;
}

export const CARD_BATTLE_SOURCE: string;
export const CARD_TYPES: ReadonlyArray<CardType>;
export const CARD_BATTLE_RULES: Readonly<Record<string, number>>;
export const CARD_BATTLE_SCENARIOS: ReadonlyArray<Readonly<CardBattleScenario>>;
export const DEFAULT_CARD_BATTLE_SCENARIO_ID: string;
export const CARD_BATTLE_SCENARIO: Readonly<CardBattleScenario>;
export const PLAYER_CARD_DEFINITIONS: Readonly<Record<string, Readonly<CardDefinition>>>;
export const ENEMY_CARD_DEFINITIONS: Readonly<Record<string, Readonly<CardDefinition>>>;
export const PLAYER_LOADOUT_COUNTS: Readonly<Record<string, number>>;
export const ENEMY_LOADOUT_COUNTS: Readonly<Record<string, number>>;
export const ENEMY_AI_TUNING: Readonly<Record<string, number>>;
export const PLAYER_DECK: ReadonlyArray<Readonly<CardInstance>>;
export const ENEMY_DECK: ReadonlyArray<Readonly<CardInstance>>;

export function getCardBattleScenario(scenarioId?: string): Readonly<CardBattleScenario>;
export function deterministicShuffle<T>(items: T[], seed: string): T[];
export function deterministicContestRoll(seed: string, round: number, lane: number): number;
export function createCardBattleState(seed?: string, scenarioId?: string): CardBattleState;
export function replaySameState(state: CardBattleState): CardBattleState;
export function replayNewShuffle(state: CardBattleState): CardBattleState;
export function compileMove(
  cards: CardInstance[],
  side?: CardSide,
  context?: { lane?: number; chargeLane?: number | null; chargeReady?: boolean },
): CompiledMove | null;
export function contestChance(
  playerMove: CompiledMove | null,
  enemyMove: CompiledMove | null,
  state: CardBattleState,
): number;
export function getLaneForecast(state: CardBattleState, lane: number): LaneForecast | null;
export function getPlacementPreview(
  state: CardBattleState,
  cardId: string,
  lane: number,
): PlacementPreview;
export function planEnemyIntents(state: CardBattleState): EnemyIntent[];
export function placePlayerCard(state: CardBattleState, cardId: string, lane: number): CardBattleState;
export function returnPlayerCard(state: CardBattleState, cardId: string): CardBattleState;
export function undoPlayerAction(state: CardBattleState): CardBattleState;
export function resolveRound(state: CardBattleState): CardBattleState;
export function startNextRound(state: CardBattleState): CardBattleState;
export function runDeterministicSimulation(options?: {
  battles?: number;
  seedPrefix?: string;
  maxRounds?: number;
  scenarioId?: string;
}): SimulationResult;
