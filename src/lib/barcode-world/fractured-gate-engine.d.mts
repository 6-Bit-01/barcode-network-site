/* eslint-disable @typescript-eslint/no-explicit-any -- Pure MJS engine is shared with Node's test runner. */

export type FracturedGateRecord = Record<string, any>;
export type FracturedGateState = FracturedGateRecord;
export type FracturedGateChoice = FracturedGateRecord;

export const FRACTURED_GATE_SOURCE: string;
export const RESULT_TYPES: string[];
export const BOARD_FOCUSES: Record<string, any>;
export const FRACTURED_GATE_ACTIONS: Record<string, any>;
export const BUILDS: any[];
export const CARDS: Record<string, any>;
export const CORE_RULES: Record<string, any>;
export const POSITION_NAMES: Record<string, string>;

export function createFracturedGateState(
  buildId?: string,
): FracturedGateState;
export function resetFracturedGate(
  state: FracturedGateState,
): FracturedGateState;
export function changeFracturedGateBuild(
  state: FracturedGateState,
  buildId: string,
): FracturedGateState;
export function availableCommand(state: FracturedGateState): number;
export function paidActionCount(state: FracturedGateState): number;
export function getContextActionGroups(
  state: FracturedGateState,
  focusId: string,
): FracturedGateRecord[];
export function getCompatibleCards(
  state: FracturedGateState,
  actionId: string,
): string[];
export function previewAction(
  state: FracturedGateState,
  actionId: string,
  targetId: string,
  cardId?: string | null,
): FracturedGateRecord;
export function queueAction(
  state: FracturedGateState,
  actionId: string,
  targetId: string,
  cardId?: string | null,
): FracturedGateState;
export function removePlanAction(
  state: FracturedGateState,
  instanceId: string,
): FracturedGateState;
export function reorderPlanAction(
  state: FracturedGateState,
  instanceId: string,
  direction: number,
): FracturedGateState;
export function refocusCards(
  state: FracturedGateState,
  cardIds: string[],
): FracturedGateState;
export function discardToRetain(
  state: FracturedGateState,
  cardId: string,
): FracturedGateState;
export function projectPlan(
  state: FracturedGateState,
): FracturedGateRecord;
export function lockPlan(
  state: FracturedGateState,
): FracturedGateState;
export function advanceResolution(
  state: FracturedGateState,
): FracturedGateState;
export function settleRound(
  state: FracturedGateState,
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
