/* eslint-disable @typescript-eslint/no-explicit-any -- MJS engine boundary shared with Node's test runner. */

export type GreyboxRecord = Record<string, any>;
export type GreyboxState = GreyboxRecord;
export type GreyboxAction = GreyboxRecord;

export const APPROACHES: Record<string, any>;
export const ARMOR: Record<string, any>;
export const BUILDS: any[];
export const CARDS: Record<string, any>;
export const CORE_RULES: Record<string, any>;
export const LOADOUTS: Record<string, any>;
export const POSITIONS: Record<string, any>;
export const PROFILES: any[];
export const RIGS: Record<string, any>;
export const WEAPONS: Record<string, any>;

export function createGreyboxState(profileId?: string): GreyboxState;
export function resetGreybox(state: GreyboxState): GreyboxState;
export function loadProfile(
  state: GreyboxState,
  profileId: string,
): GreyboxState;
export function updatePreparation(
  state: GreyboxState,
  seatId: string,
  changes: Record<string, unknown>,
): GreyboxState;
export function beginOutskirts(state: GreyboxState): GreyboxState;
export function inspectApproach(
  state: GreyboxState,
  approachId: string,
  seatId?: string,
): GreyboxState;
export function selectApproachResult(
  state: GreyboxState,
  approachId: string,
  resultId: string,
  resolverSeatId: string,
): GreyboxState;
export function setApproachConfirmation(
  state: GreyboxState,
  seatId: string,
  confirmed: boolean,
): GreyboxState;
export function commitApproach(state: GreyboxState): GreyboxState;
export function selectSeat(
  state: GreyboxState,
  seatId: string,
): GreyboxState;
export function selectFocus(
  state: GreyboxState,
  seatId: string,
  focusId: string,
): GreyboxState;
export function seatCommandAvailable(seat: any): number;
export function getImmediateActionGroups(
  state: GreyboxState,
  seatId: string,
  focusId: string,
): any[];
export function queueAction(
  state: GreyboxState,
  seatId: string,
  candidate: GreyboxAction,
): GreyboxState;
export function removeAction(
  state: GreyboxState,
  seatId: string,
  actionInstanceId: string,
): GreyboxState;
export function attachCard(
  state: GreyboxState,
  seatId: string,
  actionInstanceId: string,
  cardId: string,
): GreyboxState;
export function detachCard(
  state: GreyboxState,
  seatId: string,
  actionInstanceId: string,
): GreyboxState;
export function setClaimMode(
  state: GreyboxState,
  seatId: string,
  actionInstanceId: string,
  claimMode: string,
): GreyboxState;
export function setConsent(
  state: GreyboxState,
  ownerSeatId: string,
  actionInstanceId: string,
  granted: boolean,
): GreyboxState;
export function compatibleCardsForAction(seat: any, action: any): any[];
export function lockSeatPlan(
  state: GreyboxState,
  seatId: string,
): GreyboxState;
export function unlockSeatPlan(
  state: GreyboxState,
  seatId: string,
): GreyboxState;
export function canResolvePlans(state: GreyboxState): boolean;
export function resolvePlans(state: GreyboxState): GreyboxState;
export function settleCycle(state: GreyboxState): GreyboxState;
export function discardCard(
  state: GreyboxState,
  seatId: string,
  cardId: string,
): GreyboxState;
export function chooseSegmentDecision(
  state: GreyboxState,
  decision: string,
): GreyboxState;
export function getFocuses(state: GreyboxState): any[];
export function getLayeredIntents(state: GreyboxState): any[];
export function resultSummary(state: GreyboxState): any;
export function compareToPaperExpectation(state: GreyboxState): any[];
