export type CardSide = "player" | "enemy";
export type BattlePhase = "setup" | "player-action" | "round-review" | "result";

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  power: number;
  health: number;
  ability: string;
}

export interface CardInstance extends CardDefinition {
  designId: string;
  side: CardSide;
  copy: number;
}

export interface ActiveCard extends CardInstance {
  maxHealth: number;
  currentHealth: number;
  powerBonus: number;
  healthBonus: number;
  temporaryPowerBonus: number;
  enteredRound: number;
  damageReductionAvailable: boolean;
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

export interface EnemyPlacement {
  card: CardInstance;
  cardId: string;
  designId: string;
  lane: number;
  cost: number;
  replacesCardId: string | null;
  score: number;
}

export interface RoundReview {
  round: number;
  pressureBefore: number;
  pressureAfter: number;
  pressureDelta: number;
  breakTriggered: boolean;
  winner: CardSide | null;
  events: BattleEvent[];
}

export interface BattleSideState {
  command: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  lanes: Array<ActiveCard | null>;
}

export interface CardBattleState {
  version: string;
  source: string;
  baseSeed: string;
  seed: string;
  shuffleIndex: number;
  round: number;
  phase: BattlePhase;
  pressure: number;
  breakArmed: boolean;
  result: { winner: CardSide; round: number; pressure: number; reason: string } | null;
  notice: string;
  player: BattleSideState;
  enemy: BattleSideState;
  enemyPreview: { round: number; locked: boolean; placements: EnemyPlacement[] };
  outflank: { used: boolean; pending: { actionId: string; cardId: string; fromLane: number; toLane: number } | null };
  pendingPlayerActions: Array<{
    type: "play" | "outflank";
    actionId: string;
    card?: CardInstance;
    cardId?: string;
    lane?: number;
    fromLane?: number;
    toLane?: number;
    handIndex?: number;
    commandBefore?: number;
    previousActive?: ActiveCard | null;
  }>;
  pendingEvents: BattleEvent[];
  currentReview: RoundReview | null;
  history: RoundReview[];
  rng: { playerReshuffles: number; enemyReshuffles: number };
  eventSequence: number;
  playerActionSequence: number;
}

export const CARD_BATTLE_SOURCE: string;
export const CARD_BATTLE_RULES: Readonly<Record<string, number>>;
export const PLAYER_CARD_DEFINITIONS: Readonly<Record<string, Readonly<CardDefinition>>>;
export const ENEMY_CARD_DEFINITIONS: Readonly<Record<string, Readonly<CardDefinition>>>;
export const ENEMY_AI_TUNING: Readonly<Record<string, number>>;
export const PLAYER_DECK: ReadonlyArray<Readonly<CardInstance>>;
export const ENEMY_DECK: ReadonlyArray<Readonly<CardInstance>>;

export function deterministicShuffle<T>(items: T[], seed: string): T[];
export function createCardBattleState(seed?: string): CardBattleState;
export function replaySameState(state: CardBattleState): CardBattleState;
export function replayNewShuffle(state: CardBattleState): CardBattleState;
export function planEnemyPlacements(state: CardBattleState): EnemyPlacement[];
export function placePlayerCard(state: CardBattleState, cardId: string, lane: number): CardBattleState;
export function returnPlayerCard(state: CardBattleState, cardId: string): CardBattleState;
export function useOutflank(state: CardBattleState, fromLane: number, toLane: number): CardBattleState;
export function cancelOutflank(state: CardBattleState): CardBattleState;
export function undoPlayerAction(state: CardBattleState): CardBattleState;
export function resolveRound(state: CardBattleState): CardBattleState;
export function startNextRound(state: CardBattleState): CardBattleState;
export function runDeterministicSimulation(options?: { battles?: number; seedPrefix?: string; maxRounds?: number }): {
  version: string;
  battles: number;
  maxRounds: number;
  playerWins: number;
  enemyWins: number;
  unfinished: number;
  breaks: number;
  rounds: number[];
  averageRounds: number;
  minRounds: number;
  maxRoundsObserved: number;
};
