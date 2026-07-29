/* eslint-disable @typescript-eslint/no-explicit-any -- Pure MJS engine is shared with Node's test runner. */

export type FracturedGateRecord = Record<string, any>;
export type FracturedGateState = FracturedGateRecord;

export const FRACTURED_GATE_SOURCE: string;
export const RESULT_TYPES: string[];
export const BOARD_FOCUSES: Record<string, any>;
export const BOARD_TILES: Record<string, any>;
export const FRACTURED_GATE_ACTIONS: Record<string, any>;
export const BUILDS: any[];
export const CARDS: Record<string, any>;
export const ENEMY_CARDS: Record<string, any>;
export const ENEMY_DECKS: Record<string, string[]>;
export const ENEMY_DEFINITIONS: Record<string, any>;
export const CORE_RULES: Record<string, any>;

export function createFracturedGateState(
  buildId?: string,
  seed?: string,
): FracturedGateState;
export function resetFracturedGate(
  state: FracturedGateState,
): FracturedGateState;
export function changeFracturedGateBuild(
  state: FracturedGateState,
  buildId: string,
): FracturedGateState;
export function availableCommand(state: FracturedGateState): number;
export function availableEnemyCommand(state: FracturedGateState): number;
export function getReachableTiles(
  state: FracturedGateState,
): Record<string, any>;
export function getContextActions(
  state: FracturedGateState,
  focusId: string,
): FracturedGateRecord[];
export function getContextActionGroups(
  state: FracturedGateState,
  focusId: string,
): FracturedGateRecord[];
export function getCompatibleCards(
  state: FracturedGateState,
  actionId: string,
): string[];
export function getAvailableContextCards(
  state: FracturedGateState,
  actionId?: string | null,
): string[];
export function previewAction(
  state: FracturedGateState,
  actionId: string,
  targetId: string,
  cardId?: string | null,
): FracturedGateRecord;
export function performAction(
  state: FracturedGateState,
  actionId: string,
  targetId: string,
  cardId?: string | null,
): FracturedGateState;
export function beginEnemyTurn(
  state: FracturedGateState,
): FracturedGateState;
export function advanceEnemyTurn(
  state: FracturedGateState,
): FracturedGateState;
export function getResponseOptions(
  state: FracturedGateState,
): FracturedGateRecord[];
export function resolveEnemyAction(
  state: FracturedGateState,
  responseId?: string | null,
): FracturedGateState;
export function refocusCards(
  state: FracturedGateState,
  cardIds: string[],
): FracturedGateState;
export function discardToRetain(
  state: FracturedGateState,
  cardId: string,
): FracturedGateState;
export function displaySnapshot(
  state: FracturedGateState,
): FracturedGateRecord;
export function getPositionCoordinates(
  positionId: string,
): { x: number; y: number };
export function getActionDefinition(
  actionId: string,
): FracturedGateRecord | null;
export function getFocusDetails(
  state: FracturedGateState,
  focusId: string,
): FracturedGateRecord | null;
export function getMissionGuidance(
  state: FracturedGateState,
): FracturedGateRecord;
export function getFocusGuidance(
  state: FracturedGateState,
  focusId: string,
): FracturedGateRecord | null;
export function tempoComparisonForRoute(
  route: string,
  poweredFeed?: string,
  baseTempo?: number,
  opponentTempo?: number,
): FracturedGateRecord;
