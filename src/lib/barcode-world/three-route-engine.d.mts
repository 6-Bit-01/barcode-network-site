export type CardCategory = "movement" | "defense" | "offense" | "special";
export type ThreeRoutePhase = "planning" | "round-review" | "result";
export type CardKind = "action" | "modifier" | "context";
export type EnemyDifficulty = "basic" | "standard" | "tactical";
export type ThreeRoutePlayerPolicy =
  | "deliberate"
  | "objective"
  | "aggressive"
  | "defensive"
  | "random"
  | "first-legal";

export interface ThreeRouteCard {
  id: string;
  designId: string;
  name: string;
  category: CardCategory;
  cost: number;
  effect: string;
  targetRule: string;
  baseChance: number;
  impact: number;
  guard: number;
  power: number;
  range: number;
  move: boolean;
  status: string | null;
  kind: CardKind;
  compatibleCategories: CardCategory[];
  chanceModifier: number;
  impactModifier: number;
  guardModifier: number;
  drawOnSuccess: number;
  restore: number;
  contextFeature: string | null;
  control: number;
  requiresPreparation: boolean;
  requiresSecuredZone: boolean;
  copy: number;
  context: boolean;
}

export interface TheaterZone {
  id: string;
  name: string;
  x: number;
  y: number;
  exit?: boolean;
  cover?: boolean;
  feature?: string;
}

export interface TheaterObject {
  id: string;
  name: string;
  zoneId: string;
  feature: string;
  integrity?: number;
  maxIntegrity?: number;
}

export interface TheaterEnemy {
  id: string;
  name: string;
  role: string;
  positionId: string;
  hp: number;
  maxHp: number;
  guard: number;
  scanned: boolean;
  suppressed: boolean;
}

export interface ThreeRouteScenario {
  id: string;
  name: string;
  shortName: string;
  location: string;
  objective: string;
  zones: TheaterZone[];
  edges: Array<[string, string]>;
  objects: TheaterObject[];
  exits: string[];
  playerStart: string;
  enemies: TheaterEnemy[];
  contextCardIds: string[];
  objectiveGoal: number;
  defendedObjectId: string | null;
  enemyPlan: {
    primaryTarget: "player" | "defended-object" | "block-exit";
    aggression: number;
    objectiveWeight: number;
    fieldDisruption: boolean;
  };
  mission: {
    win: string;
    lose: string;
    exit: string;
    tactical: string;
    eliminationVictory: boolean;
    objectiveVictory: boolean;
    controlVictory: boolean;
    controlDefeat: boolean;
    roundLimit: number | null;
    timeoutResult: string;
    timeoutWinner: "player" | "enemy" | null;
    timeoutOutcome: "timeout" | "holdout" | "defense";
    exitOutcome: "withdrawal" | "victory";
    exitRequiresSecured: boolean;
    objectiveResult: string;
    enemyObjectiveResult: string;
  };
  feed: {
    roundStart: Partial<Record<CardCategory, number>>;
    drawUsedCategoryOnSuccess: number;
    emptyPoolFallback: number;
    breakDrawPerCategory: number;
  };
}

export interface CategoryPool {
  category: CardCategory;
  available: ThreeRouteCard[];
  drawPile: ThreeRouteCard[];
  discard: ThreeRouteCard[];
  reshuffles: number;
}

export interface RouteTarget {
  kind: "zone" | "enemy" | "object" | "self" | "plan";
  id: string;
  name: string;
  zoneId: string;
  feature?: string;
}

export interface RouteForecast {
  chance: number;
  impact: number;
  guard: number;
  restore: number;
  control: number;
  drawOnSuccess: number;
  successLabel: string;
  failureLabel: string;
}

export interface ThreeRouteChoice {
  id: string;
  lane: number;
  card: ThreeRouteCard;
  target: RouteTarget;
  actionName: string;
  expectedStartId: string;
  forecast: RouteForecast;
  modifier: boolean;
  prerequisiteLabel: string | null;
}

export interface PlanStep {
  id: string;
  order: number;
  card: ThreeRouteCard;
  target: RouteTarget;
  actionName: string;
  expectedStartId: string;
  forecast: RouteForecast;
  modifiers: ThreeRouteCard[];
}

export interface EnemyIntent {
  id: string;
  actorId: string;
  kind: "attack" | "advance" | "guard" | "disrupt" | "objective";
  name: string;
  targetId: string;
  destinationId: string;
  chance: number;
  impact: number;
  pressure: number;
  reason: string;
  score: number;
  candidateCount: number;
  difficulty: EnemyDifficulty;
  order: number;
}

export interface TheaterSnapshot {
  playerPositionId: string;
  playerCondition: number;
  playerMaxCondition: number;
  playerGuard: number;
  playerPower: number;
  playerExposed: boolean;
  enemies: TheaterEnemy[];
  objectiveProgress: number;
  objectIntegrity: Record<string, number>;
  protectedObjectId: string | null;
  preparedObjectIds: string[];
  pressure: number;
}

export interface ResolutionEvent {
  id: string;
  round: number;
  phase: "player" | "enemy" | "settle";
  index: number;
  title: string;
  detail: string;
  actorId: string;
  targetId: string | null;
  success: boolean;
  chance: number | null;
  roll: number | null;
  before: TheaterSnapshot;
  after: TheaterSnapshot;
  sceneCue: string;
}

export interface CardGrant {
  category: CardCategory;
  label: string;
  requested: number;
  actual: number;
}

export interface ThreeRouteResult {
  winner: "player" | "enemy" | null;
  outcome: "victory" | "objective" | "withdrawal" | "extraction" | "pressure" | "compromised" | "timeout" | "holdout" | "defense";
  title: string;
  reason: string;
}

export interface ThreeRouteReview {
  round: number;
  conditionBefore: number;
  conditionAfter: number;
  conditionDelta: number;
  pressureBefore: number;
  pressureAfter: number;
  pressureDelta: number;
  breakTriggered: boolean;
  events: ResolutionEvent[];
  grants: CardGrant[];
  result: ThreeRouteResult | null;
}

export interface ProjectedTheater {
  playerPositionId: string;
  playerCondition: number;
  playerMaxCondition: number;
  playerGuard: number;
  playerPower: number;
  playerExposed: boolean;
  flankBonus: boolean;
  enemies: TheaterEnemy[];
  objectiveProgress: number;
  objectIntegrity: Record<string, number>;
  protectedObjectId: string | null;
  preparedObjectIds: string[];
  pressure: number;
  exitCompleted: boolean;
}

export interface ThreeRouteState {
  version: "0.4";
  source: string;
  baseSeed: string;
  seed: string;
  shuffleIndex: number;
  scenarioId: string;
  scenario: ThreeRouteScenario;
  enemyDifficulty: EnemyDifficulty;
  round: number;
  phase: ThreeRoutePhase;
  pressure: number;
  breakArmed: boolean;
  result: ThreeRouteResult | null;
  notice: string;
  player: {
    positionId: string;
    condition: number;
    maxCondition: number;
    guard: number;
    power: number;
    exposed: boolean;
    flankBonus: boolean;
    reserve: number;
    pools: Record<CardCategory, CategoryPool>;
    plan: PlanStep[];
  };
  enemies: TheaterEnemy[];
  enemyIntents: EnemyIntent[];
  objectiveProgress: number;
  objectIntegrity: Record<string, number>;
  protectedObjectId: string | null;
  preparedObjectIds: string[];
  usedContextCardIds: string[];
  pendingActions: Array<Record<string, unknown>>;
  currentReview: ThreeRouteReview | null;
  currentRoundGrant: CardGrant[];
  history: ThreeRouteReview[];
  playerActionSequence: number;
}

export interface ThreeRouteSimulation {
  version: "0.4";
  scenarioId: string;
  policy: ThreeRoutePlayerPolicy;
  enemyDifficulty: EnemyDifficulty;
  battles: number;
  maxRounds: number;
  playerWins: number;
  enemyWins: number;
  retreats: number;
  unfinished: number;
  rounds: number[];
  actions: number;
  commandPointsSpent: number;
  contextCardsUsed: number;
  firstRoundWins: number;
  stalledBattles: number;
  invalidatedActions: number;
  enemyIntents: number;
  enemySuccesses: number;
  meaningfulEnemyActions: number;
  playerHealthLost: number;
  objectIntegrityLost: number;
  enemyIntentKinds: Record<string, number>;
  outcomeCounts: Record<string, number>;
  categoryUses: Record<CardCategory, number>;
  averageRounds: number;
  playerWinRate: number;
  enemyMeaningfulRate: number;
}

export const THREE_ROUTE_SOURCE: string;
export const THREE_ROUTE_AI_DIFFICULTIES: ReadonlyArray<EnemyDifficulty>;
export const THREE_ROUTE_PLAYER_POLICIES: ReadonlyArray<ThreeRoutePlayerPolicy>;
export const CARD_CATEGORIES: ReadonlyArray<CardCategory>;
export const THREE_ROUTE_RULES: Readonly<Record<string, number>>;
export const GENERAL_CARD_DEFINITIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export const CONTEXT_CARD_DEFINITIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export const CATEGORY_LOADOUTS: Readonly<Record<CardCategory, ReadonlyArray<string>>>;
export const THREE_ROUTE_SCENARIOS: ReadonlyArray<Readonly<ThreeRouteScenario>>;
export const DEFAULT_THREE_ROUTE_SCENARIO_ID: string;
export const THREE_ROUTE_SCENARIO: Readonly<ThreeRouteScenario>;

export function getThreeRouteScenario(scenarioId?: string): Readonly<ThreeRouteScenario>;
export function deterministicThreeRouteShuffle<T>(items: T[], seed: string): T[];
export function deterministicThreeRouteRoll(
  seed: string,
  round: number,
  phase: string,
  index: number,
): number;
export function connectedZoneIds(
  scenario: ThreeRouteScenario,
  zoneId: string,
): string[];
export function graphDistance(
  scenario: ThreeRouteScenario,
  startId: string,
  destinationId: string,
): number;
export function planThreeRouteEnemyIntents(
  state: ThreeRouteState,
  options?: { difficulty?: EnemyDifficulty },
): EnemyIntent[];
export function getVisibleCategoryCards(
  state: ThreeRouteState,
  category: CardCategory,
): ThreeRouteCard[];
export function getThreeRouteChoices(
  state: ThreeRouteState,
  cardId: string,
): ThreeRouteChoice[];
export function hasPlayableThreeRouteAction(state: ThreeRouteState): boolean;
export function projectPlannedTheater(state: ThreeRouteState): ProjectedTheater;
export function chooseThreeRoute(
  state: ThreeRouteState,
  cardId: string,
  choiceId: string,
): ThreeRouteState;
export function undoThreeRouteChoice(state: ThreeRouteState): ThreeRouteState;
export function cycleThreeRouteCategory(
  state: ThreeRouteState,
  category: CardCategory,
): ThreeRouteState;
export function resolveThreeRouteRound(state: ThreeRouteState): ThreeRouteState;
export function startNextThreeRouteRound(state: ThreeRouteState): ThreeRouteState;
export function createThreeRouteState(
  seed?: string,
  scenarioId?: string,
  options?: { enemyDifficulty?: EnemyDifficulty },
): ThreeRouteState;
export function replaySameThreeRouteState(state: ThreeRouteState): ThreeRouteState;
export function replayNewThreeRouteShuffle(state: ThreeRouteState): ThreeRouteState;
export function runThreeRouteSimulation(options?: {
  battles?: number;
  seedPrefix?: string;
  maxRounds?: number;
  scenarioId?: string;
  policy?: ThreeRoutePlayerPolicy;
  enemyDifficulty?: EnemyDifficulty;
}): ThreeRouteSimulation;
export function runThreeRouteLaboratory(options?: {
  battlesPerCell?: number;
  seedPrefix?: string;
  maxRounds?: number;
  scenarioIds?: string[];
  policies?: ThreeRoutePlayerPolicy[];
  difficulties?: EnemyDifficulty[];
}): {
  version: "0.4";
  battlesPerCell: number;
  maxRounds: number;
  cells: ThreeRouteSimulation[];
  comparisons: Array<{
    scenarioId: string;
    enemyDifficulty: EnemyDifficulty;
    deliberateWinRate: number;
    randomWinRate: number;
    intentionalAdvantage: number;
  }>;
};
