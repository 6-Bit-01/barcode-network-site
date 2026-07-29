/* eslint-disable @typescript-eslint/no-explicit-any */

export type DirectorRecord = Record<string, any>;
export type DirectorState = DirectorRecord;

export const DIRECTOR_SOURCE: string;
export const DIRECTOR_RULES: DirectorRecord;
export const DIRECTOR_BUILD: DirectorRecord;
export const DIRECTOR_TILES: Record<string, DirectorRecord>;
export const DIRECTOR_OBJECTS: Record<string, DirectorRecord>;
export const DIRECTOR_CARDS: Record<string, DirectorRecord>;

export function createDirectorState(seed?: string): DirectorState;
export function resetDirectorState(state: DirectorState): DirectorState;
export function planDirectorIntents(state: DirectorState): DirectorRecord[];
export function getDirectorReachableTiles(
  state: DirectorState,
): Record<string, DirectorRecord>;
export function moveDirectorPlayer(
  state: DirectorState,
  destination: string,
): DirectorState;
export function getDirectorCardTargets(
  state: DirectorState,
  cardId: string,
): string[];
export function getDirectorCardCost(
  state: DirectorState,
  cardId: string,
): number;
export function previewDirectorCard(
  state: DirectorState,
  cardId: string,
  targetId: string,
): DirectorRecord | null;
export function playDirectorCard(
  state: DirectorState,
  cardId: string,
  targetId: string,
): DirectorState;
export function getDirectorObjectAction(
  state: DirectorState,
  objectId: string,
): DirectorRecord | null;
export function useDirectorObject(
  state: DirectorState,
  objectId: string,
): DirectorState;
export function getDirectorContextAction(
  state: DirectorState,
): DirectorRecord | null;
export function useDirectorContextAction(
  state: DirectorState,
): DirectorState;
export function getDirectorObjective(state: DirectorState): DirectorRecord;
export function beginDirectorEnemyTurn(state: DirectorState): DirectorState;
export function advanceDirectorEnemyTurn(state: DirectorState): DirectorState;
export function getDirectorReaction(
  state: DirectorState,
): DirectorRecord | null;
export function resolveDirectorReaction(
  state: DirectorState,
  choice: "intercept" | "decline",
): DirectorState;
export function getDirectorFocusPosition(
  state: DirectorState,
  focusId: string,
): string | null;
export function getDirectorIntentTargetPosition(
  state: DirectorState,
  intent: DirectorRecord,
): string | null;
export function getDirectorScreenPosition(
  positionId: string,
): { x: number; y: number };
export function getDirectorTilePolygon(positionId: string): string;
export function hasDirectorLineOfSight(
  state: DirectorState,
  fromId: string,
  toId: string,
): boolean;
export function getDirectorBattleSnapshot(
  state: DirectorState,
): DirectorRecord;
