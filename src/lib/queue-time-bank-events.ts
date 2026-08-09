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

export type QueueTimeBankEventKind = "submission" | "completion" | "removal" | "duration" | "wheel" | "commercial" | "pace" | "combined";

export interface QueueTimeBankEvent {
  kind: QueueTimeBankEventKind;
  label: string;
  bankDeltaSeconds: number;
}

const MEANINGFUL_DELTA_SECONDS = 30;
const MEANINGFUL_PACE_DELTA_SECONDS = 60;

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
  if (!material(bankDeltaSeconds)) return null;

  if (current.completedPlayableCount > previous.completedPlayableCount) {
    return { kind: "completion", label: bankDeltaSeconds > 0 ? "TRACK FINISHED" : "SEGMENT OVERRUN", bankDeltaSeconds };
  }
  if (current.removedCount > previous.removedCount) {
    return { kind: "removal", label: "TRACK REMOVED", bankDeltaSeconds };
  }
  if (current.wheelSpinsOwed !== previous.wheelSpinsOwed || current.wheelSecondsBudgeted !== previous.wheelSecondsBudgeted) {
    const label = current.wheelSpinsOwed > previous.wheelSpinsOwed ? "WHEEL OWED" : "WHEEL RESOLVED";
    return { kind: "wheel", label, bankDeltaSeconds };
  }
  if (current.sponsorStatus !== previous.sponsorStatus) {
    return { kind: "commercial", label: bankDeltaSeconds > 0 ? "COMMERCIAL CLEARED" : "COMMERCIAL TIMING", bankDeltaSeconds };
  }
  if (current.activePlayableCount > previous.activePlayableCount) {
    return { kind: "submission", label: "NEW SUBMISSION", bankDeltaSeconds };
  }
  if (current.knownDurationCount !== previous.knownDurationCount) {
    return { kind: "duration", label: bankDeltaSeconds > 0 ? "SHORT TRACK" : "LONG TRACK", bankDeltaSeconds };
  }
  return null;
}

export function deriveQueuePaceBankEvent(previousBankSeconds: number, current: QueueTimeBankObservation): QueueTimeBankEvent | null {
  if (!current.isLive) return null;
  const bankDeltaSeconds = finiteDelta(current.bankSeconds, previousBankSeconds);
  if (Math.abs(bankDeltaSeconds) < MEANINGFUL_PACE_DELTA_SECONDS) return null;
  return { kind: "pace", label: bankDeltaSeconds > 0 ? "PACE RECOVERY" : "TRANSITION OVERRUN", bankDeltaSeconds };
}

export function combineQueueTimeBankEvents(previous: QueueTimeBankEvent, current: QueueTimeBankEvent): QueueTimeBankEvent {
  return {
    kind: previous.kind === current.kind ? current.kind : "combined",
    label: previous.kind === current.kind && previous.label === current.label ? current.label : "QUEUE UPDATE",
    bankDeltaSeconds: previous.bankDeltaSeconds + current.bankDeltaSeconds,
  };
}
