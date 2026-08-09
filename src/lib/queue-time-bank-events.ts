export interface QueueTimeBankObservation {
  sessionId: string | null;
  bankSeconds: number;
  activePlayableCount: number;
  completedPlayableCount: number;
  removedCount: number;
  knownDurationCount: number;
  wheelSpinsOwed: number;
  wheelSecondsBudgeted: number;
  sponsorStatus: string;
  isLive: boolean;
}

export type QueueTimeBankEventKind = "submission" | "completion" | "removal" | "duration" | "wheel" | "commercial" | "pace";

export interface QueueTimeBankEvent {
  kind: QueueTimeBankEventKind;
  label: string;
  bankDeltaSeconds: number;
}

const MEANINGFUL_DELTA_SECONDS = 30;

function finiteDelta(current: number, previous: number): number {
  const delta = Math.round(current - previous);
  return Number.isFinite(delta) ? delta : 0;
}

function material(delta: number): boolean {
  return Math.abs(delta) >= MEANINGFUL_DELTA_SECONDS;
}

export function deriveQueueTimeBankEvent(previous: QueueTimeBankObservation, current: QueueTimeBankObservation): QueueTimeBankEvent | null {
  if (!previous.sessionId || previous.sessionId !== current.sessionId) return null;
  const bankDeltaSeconds = finiteDelta(current.bankSeconds, previous.bankSeconds);

  if (current.completedPlayableCount > previous.completedPlayableCount && material(bankDeltaSeconds)) {
    return { kind: "completion", label: bankDeltaSeconds > 0 ? "TRACK CLEARED" : "SEGMENT OVERRUN", bankDeltaSeconds };
  }
  if (current.removedCount > previous.removedCount && material(bankDeltaSeconds)) {
    return { kind: "removal", label: "TRACK REMOVED", bankDeltaSeconds };
  }
  if (current.activePlayableCount > previous.activePlayableCount && material(bankDeltaSeconds)) {
    return { kind: "submission", label: "NEW SUBMISSION", bankDeltaSeconds };
  }
  if (current.knownDurationCount !== previous.knownDurationCount && material(bankDeltaSeconds)) {
    return { kind: "duration", label: "TRACK LENGTH LOCKED", bankDeltaSeconds };
  }
  if ((current.wheelSpinsOwed !== previous.wheelSpinsOwed || current.wheelSecondsBudgeted !== previous.wheelSecondsBudgeted) && material(bankDeltaSeconds)) {
    return { kind: "wheel", label: "WHEEL TIMING", bankDeltaSeconds };
  }
  if (current.sponsorStatus !== previous.sponsorStatus && material(bankDeltaSeconds)) {
    return { kind: "commercial", label: "COMMERCIAL TIMING", bankDeltaSeconds };
  }
  return null;
}

export function deriveQueuePaceBankEvent(previousBankSeconds: number, current: QueueTimeBankObservation): QueueTimeBankEvent | null {
  if (!current.isLive) return null;
  const bankDeltaSeconds = finiteDelta(current.bankSeconds, previousBankSeconds);
  if (Math.abs(bankDeltaSeconds) < 60) return null;
  return { kind: "pace", label: bankDeltaSeconds > 0 ? "PACE RECOVERY" : "TRANSITION OVERRUN", bankDeltaSeconds };
}
