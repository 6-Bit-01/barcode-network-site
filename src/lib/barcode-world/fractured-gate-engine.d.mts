/* eslint-disable @typescript-eslint/no-explicit-any -- Pure MJS engine is shared with Node tests. */

export type FracturedGateRecord = Record<string, any>;
export type FracturedGateState = FracturedGateRecord;
export type FracturedGateChoice = FracturedGateRecord;

export const FRACTURED_GATE_SOURCE: string;
export const RESULT_TYPES: string[];
export const CORE_RULES: FracturedGateRecord;
export const CARDS: Record<string, FracturedGateRecord>;
export const BUILDS: FracturedGateRecord[];
export const BOARD_TILES: Record<string, FracturedGateRecord>;
export const BOARD_FOCUSES: Record<string, FracturedGateRecord>;
export const FRACTURED_GATE_ACTIONS: Record<string, FracturedGateRecord>;

export function createFracturedGateState(buildId?: string): FracturedGateState;
export function resetFracturedGate(state: FracturedGateState): FracturedGateState;
export function changeFracturedGateBuild(state: FracturedGateState, buildId: string): FracturedGateState;
export function getBuildDefinition(buildId: string): FracturedGateRecord;
export function movementSpent(state: FracturedGateState): number;
export function movementRemaining(state: FracturedGateState): number;
export function actionSlotsUsed(state: FracturedGateState): number;
export function getProjectedPosition(state: FracturedGateState): string;
export function getReachableTiles(state: FracturedGateState): Record<string, FracturedGateRecord>;
export function getCompatibleCards(state: FracturedGateState, actionId: string): string[];
export function getContextActionGroups(state: FracturedGateState, focusId: string): FracturedGateRecord[];
export function previewAction(state: FracturedGateState, actionId: string, targetId: string, cardId?: string | null): FracturedGateRecord;
export function projectPlan(state: FracturedGateState): FracturedGateRecord;
export function queueMove(state: FracturedGateState, destination: string): FracturedGateState;
export function queueAction(state: FracturedGateState, actionId: string, targetId: string, cardId?: string | null): FracturedGateState;
export function removePlanStep(state: FracturedGateState, instanceId: string): FracturedGateState;
export function lockPlan(state: FracturedGateState): FracturedGateState;
export function chooseResponse(state: FracturedGateState, responseId: string): FracturedGateState;
export function advanceResolution(state: FracturedGateState): FracturedGateState;
export function settleRound(state: FracturedGateState): FracturedGateState;
export function getActiveRouteFocuses(state: FracturedGateState): string[];
export function getPositionCoordinates(positionId: string): { x: number; y: number };
export function getActionDefinition(actionId: string): FracturedGateRecord | null;
