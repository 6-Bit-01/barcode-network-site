import { put } from "@vercel/blob";

import {
  QueueHistoricalEvidenceError,
  auditQueueHistoricalEvidenceChain,
  prepareQueueHistoricalEvidenceImport,
  requireQueueHistoricalEvidenceBlobToken,
  type PreparedQueueHistoricalEvidenceImport,
  type QueueHistoricalEvidenceImportPlan,
  type QueueHistoricalEvidenceImportRequest,
  type QueueHistoricalEvidenceReadDependencies,
} from "./queue-historical-evidence-repository";

export interface QueueHistoricalEvidenceApplyRequest extends QueueHistoricalEvidenceImportRequest {
  confirmation: unknown;
}

interface HistoricalEvidencePutResult {
  pathname: string;
}

export interface QueueHistoricalEvidenceWriteDependencies
  extends QueueHistoricalEvidenceReadDependencies {
  putBlob?: (pathname: string, body: string, options: {
    access: "private";
    addRandomSuffix: false;
    allowOverwrite: false;
    contentType: "application/json";
    cacheControlMaxAge: 60;
    token: string;
  }) => Promise<HistoricalEvidencePutResult>;
}

export interface QueueHistoricalEvidenceAppendResult
  extends Omit<QueueHistoricalEvidenceImportPlan, "dryRun" | "alreadyPresent"> {
  dryRun: false;
  appended: boolean;
  alreadyPresent: boolean;
}

function defaultPutBlob(pathname: string, body: string, options: {
  access: "private";
  addRandomSuffix: false;
  allowOverwrite: false;
  contentType: "application/json";
  cacheControlMaxAge: 60;
  token: string;
}): Promise<HistoricalEvidencePutResult> {
  return put(pathname, body, options) as Promise<HistoricalEvidencePutResult>;
}

function conflict(code: string, message: string): QueueHistoricalEvidenceError {
  return new QueueHistoricalEvidenceError(code, 409, message);
}

function unavailable(code: string, message: string, cause?: unknown): QueueHistoricalEvidenceError {
  return new QueueHistoricalEvidenceError(
    code,
    503,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function resultFromPrepared(
  prepared: PreparedQueueHistoricalEvidenceImport,
  outcome: "appended" | "already_present",
): QueueHistoricalEvidenceAppendResult {
  return {
    ...prepared.plan,
    dryRun: false,
    canApply: true,
    appended: outcome === "appended",
    alreadyPresent: outcome === "already_present",
  };
}

function samePreparedImport(
  first: PreparedQueueHistoricalEvidenceImport,
  second: PreparedQueueHistoricalEvidenceImport,
): boolean {
  return first.plan.bundleDigest === second.plan.bundleDigest
    && first.plan.previousBundleDigest === second.plan.previousBundleDigest
    && first.plan.canonicalShowDate === second.plan.canonicalShowDate
    && first.plan.requiredConfirmation === second.plan.requiredConfirmation
    && first.targetPathname === second.targetPathname
    && first.canonicalJson === second.canonicalJson;
}

async function reconcileAppendOutcome(
  prepared: PreparedQueueHistoricalEvidenceImport,
  dependencies: QueueHistoricalEvidenceWriteDependencies,
  writeReturnedSuccessfully: boolean,
  writeError?: unknown,
): Promise<QueueHistoricalEvidenceAppendResult> {
  let audit;
  try {
    audit = await auditQueueHistoricalEvidenceChain(dependencies);
  } catch (error) {
    throw unavailable(
      "historical_evidence_append_outcome_unknown",
      "The historical evidence append outcome could not be verified safely.",
      error,
    );
  }

  const successor = audit.entries.find(
    (entry) => entry.ledger.previousBundleDigest === prepared.plan.previousBundleDigest,
  );
  if (successor?.ledger.bundleDigest === prepared.plan.bundleDigest) {
    if (successor.canonicalJson !== prepared.canonicalJson) {
      throw unavailable(
        "historical_evidence_append_outcome_unknown",
        "The stored historical evidence digest does not have the expected canonical bytes.",
      );
    }
    return resultFromPrepared(
      prepared,
      writeReturnedSuccessfully ? "appended" : "already_present",
    );
  }
  if (successor) {
    throw conflict(
      "historical_evidence_successor_conflict",
      "Another historical evidence bundle already occupies the requested predecessor key.",
    );
  }
  if (writeReturnedSuccessfully) {
    throw unavailable(
      "historical_evidence_append_outcome_unknown",
      "The Blob write returned successfully but the append could not be found during re-audit.",
    );
  }
  throw unavailable(
    "historical_evidence_append_failed",
    "The historical evidence append failed without creating a successor.",
    writeError,
  );
}

export async function appendQueueHistoricalEvidence(
  input: QueueHistoricalEvidenceApplyRequest,
  dependencies: QueueHistoricalEvidenceWriteDependencies = {},
): Promise<QueueHistoricalEvidenceAppendResult> {
  const initial = await prepareQueueHistoricalEvidenceImport(input, dependencies);
  if (typeof input.confirmation !== "string" || input.confirmation !== initial.plan.requiredConfirmation) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_confirmation_required",
      400,
      "The confirmation must exactly match the current historical evidence import plan.",
    );
  }
  if (initial.plan.alreadyPresent) return resultFromPrepared(initial, "already_present");
  if (!initial.plan.canApply) {
    throw conflict(
      "historical_evidence_stale_predecessor",
      "The submitted predecessor is not the currently observed historical evidence head.",
    );
  }

  // Re-read the entire chain and revalidate the submitted canonical ledger
  // immediately before the sole create-only write. The dry-run result and the
  // first observation above are never treated as authority for applying.
  const prepared = await prepareQueueHistoricalEvidenceImport(input, dependencies);
  if (!samePreparedImport(initial, prepared)) {
    throw conflict(
      "historical_evidence_plan_changed",
      "The historical evidence import plan changed before the append.",
    );
  }
  if (prepared.plan.alreadyPresent) return resultFromPrepared(prepared, "already_present");
  if (!prepared.plan.canApply) {
    throw conflict(
      "historical_evidence_stale_predecessor",
      "The submitted predecessor is not the currently observed historical evidence head.",
    );
  }

  const putBlob = dependencies.putBlob ?? defaultPutBlob;
  const token = requireQueueHistoricalEvidenceBlobToken();
  try {
    const stored = await putBlob(prepared.targetPathname, prepared.canonicalJson, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      token,
    });
    if (!stored || stored.pathname !== prepared.targetPathname) {
      return reconcileAppendOutcome(prepared, dependencies, true);
    }
  } catch (error) {
    return reconcileAppendOutcome(prepared, dependencies, false, error);
  }

  return reconcileAppendOutcome(prepared, dependencies, true);
}
