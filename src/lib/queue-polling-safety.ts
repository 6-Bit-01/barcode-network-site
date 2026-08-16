export function queuePollingRequestIsCurrent(input: {
  requestSequence: number;
  latestRequestSequence: number;
}): boolean {
  return input.requestSequence === input.latestRequestSequence;
}

export function queuePollingSnapshotMayApply(input: {
  requestSequence: number;
  latestRequestSequence: number;
  responseRevision: number;
  latestAppliedRevision: number;
}): boolean {
  return queuePollingRequestIsCurrent(input)
    && Number.isFinite(input.responseRevision)
    && input.responseRevision >= input.latestAppliedRevision;
}
