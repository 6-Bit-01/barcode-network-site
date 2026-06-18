import type { DossierSourceFileRefreshRequest } from "@/lib/dossier-workflow";
import type { DossierSourceFileWorkflowContextReadModel } from "@/lib/dossier-workflow-store";
import { safeOriginHost } from "@/lib/trusted-requesting-site-origin";

export type BnlSourceFileImmediateRefreshStatus =
  | "success"
  | "failed"
  | "skipped"
  | "timeout"
  | "unavailable";

export type BnlSourceFileImmediateRefreshResult = {
  ok: boolean;
  status: BnlSourceFileImmediateRefreshStatus;
  recommendationId?: string;
  failureReason?: string;
  callbackBaseSent?: boolean;
  callbackBaseHost?: string;
  sourceFileWorkflowContextSent?: boolean;
  sourceFileWorkflowContextCounts?: Record<string, number>;
};

export type BnlSourceFileImmediateRefreshInput = {
  request: DossierSourceFileRefreshRequest;
  source?: string;
  timeoutMs?: number;
  requestingSiteOrigin?: string;
  sourceFileWorkflowContext?: DossierSourceFileWorkflowContextReadModel;
};

const DEFAULT_REFRESH_NOW_TIMEOUT_MS = 25_000;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timeoutFromEnv(): number {
  const raw = process.env.BNL_SOURCE_FILE_REFRESH_NOW_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REFRESH_NOW_TIMEOUT_MS;
  return Math.min(Math.max(parsed, 1_000), 30_000);
}

function recommendationIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  return (
    stringValue(record.recommendationId) ??
    stringValue(record.completedByRecommendationId) ??
    stringValue(record.id) ??
    (record.recommendation && typeof record.recommendation === "object"
      ? stringValue((record.recommendation as Record<string, unknown>).id)
      : undefined)
  );
}

function failureReasonFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  return (
    stringValue(record.failureReason) ??
    stringValue(record.reason) ??
    stringValue(record.error) ??
    stringValue(record.message)
  );
}

function contextCounts(context: DossierSourceFileWorkflowContextReadModel | undefined): Record<string, number> | undefined {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : 0,
    ]),
  );
}

export async function refreshBnlSourceFileNow(
  input: BnlSourceFileImmediateRefreshInput,
): Promise<BnlSourceFileImmediateRefreshResult> {
  const url = process.env.BNL_SOURCE_FILE_REFRESH_NOW_URL?.trim();
  const token = process.env.BNL_SOURCE_FILE_REFRESH_TOKEN?.trim();
  if (!url || !token) {
    return {
      ok: false,
      status: "unavailable",
      failureReason: "BNL immediate refresh is not configured.",
      callbackBaseSent: false,
    };
  }

  const callbackBaseUrl = stringValue(input.requestingSiteOrigin);
  const callbackDiagnostics = {
    callbackBaseSent: Boolean(callbackBaseUrl),
    ...(callbackBaseUrl
      ? { callbackBaseHost: safeOriginHost(callbackBaseUrl) }
      : {}),
  };
  const sourceFileWorkflowContext = input.sourceFileWorkflowContext;
  const workflowContextDiagnostics = {
    sourceFileWorkflowContextSent: Boolean(sourceFileWorkflowContext),
    ...(sourceFileWorkflowContext
      ? { sourceFileWorkflowContextCounts: contextCounts(sourceFileWorkflowContext) }
      : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? timeoutFromEnv(),
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-BNL-REFRESH-TOKEN": token,
      },
      body: JSON.stringify({
        requestId: input.request.id,
        candidateId: input.request.candidateId,
        subjectName: input.request.subjectName,
        normalizedSubjectKey: input.request.normalizedSubjectKey,
        reason: input.request.reason,
        caseReportMissing: input.request.caseReportMissing === true,
        requiresCaseReportBackfill:
          input.request.requiresCaseReportBackfill === true,
        source: input.source ?? input.request.requestSource,
        ...(callbackBaseUrl
          ? {
              siteCallbackBaseUrl: callbackBaseUrl,
              requestingSiteOrigin: callbackBaseUrl,
              sourceFileArchiveCallbackBaseUrl: callbackBaseUrl,
            }
          : {}),
        ...(sourceFileWorkflowContext
          ? { sourceFileWorkflowContext }
          : {}),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    const recommendationId = recommendationIdFromPayload(payload);
    const failureReason = failureReasonFromPayload(payload);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status === 503 ? "unavailable" : "failed",
        recommendationId,
        failureReason:
          failureReason ?? `BNL immediate refresh returned HTTP ${response.status}.`,
        ...callbackDiagnostics,
        ...workflowContextDiagnostics,
      };
    }

    const payloadStatus =
      payload && typeof payload === "object"
        ? stringValue((payload as Record<string, unknown>).status)
        : undefined;
    if (payloadStatus === "skipped") {
      return {
        ok: false,
        status: "skipped",
        recommendationId,
        failureReason,
        ...callbackDiagnostics,
        ...workflowContextDiagnostics,
      };
    }
    if (payloadStatus === "failed") {
      return {
        ok: false,
        status: "failed",
        recommendationId,
        failureReason,
        ...callbackDiagnostics,
        ...workflowContextDiagnostics,
      };
    }

    return {
      ok: true,
      status: "success",
      recommendationId,
      failureReason,
      ...callbackDiagnostics,
      ...workflowContextDiagnostics,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: "timeout",
        failureReason: "BNL immediate refresh timed out.",
        ...callbackDiagnostics,
        ...workflowContextDiagnostics,
      };
    }
    return {
      ok: false,
      status: "unavailable",
      failureReason:
        error instanceof Error
          ? error.message
          : "BNL immediate refresh could not be reached.",
      ...callbackDiagnostics,
      ...workflowContextDiagnostics,
    };
  } finally {
    clearTimeout(timeout);
  }
}
