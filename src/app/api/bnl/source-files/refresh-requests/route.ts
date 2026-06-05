import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  listPendingDossierSourceFileRefreshRequests,
  updateDossierSourceFileRefreshRequestStatus,
} from "@/lib/dossier-workflow-store";
import type { DossierSourceFileRefreshRequestStatus } from "@/lib/dossier-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "private, no-store";
const BOT_MUTABLE_STATUSES = new Set<DossierSourceFileRefreshRequestStatus>([
  "claimed",
  "completed",
  "failed",
  "skipped",
]);

function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return req.headers.get("x-bnl-source-file-read-token")?.trim() ?? "";
}

function tokenMatches(providedToken: string): boolean {
  const expectedToken = process.env.BNL_SOURCE_FILE_READ_TOKEN?.trim() ?? "";
  if (!expectedToken || !providedToken) return false;
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
  const requests = await listPendingDossierSourceFileRefreshRequests(
    Number.isFinite(limit) ? limit : 25,
  );
  return NextResponse.json(
    {
      ok: true,
      scope: "bnl_source_file_refresh_requests",
      mutation: false,
      requests: requests.map((request) => ({
        id: request.id,
        candidateId: request.candidateId ?? null,
        subjectName: request.subjectName,
        normalizedSubjectKey: request.normalizedSubjectKey,
        reason: request.reason,
        priority: request.priority,
        requestedAt: request.requestedAt,
        requestSource: request.requestSource,
        notBeforeAt: request.notBeforeAt ?? null,
      })),
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}

export async function POST(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = stringValue(body.requestId ?? body.id);
  const status = stringValue(body.status) as DossierSourceFileRefreshRequestStatus;
  if (!requestId || !BOT_MUTABLE_STATUSES.has(status)) {
    return NextResponse.json(
      {
        ok: false,
        error: "requestId and a supported bot status are required",
        supportedStatuses: [...BOT_MUTABLE_STATUSES],
      },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }
  const request = await updateDossierSourceFileRefreshRequestStatus({
    requestId,
    status,
    completedByRecommendationId: stringValue(body.completedByRecommendationId) || undefined,
    failureReason: stringValue(body.failureReason) || undefined,
  });
  if (!request) {
    return NextResponse.json(
      { ok: false, error: "Refresh request was not found" },
      { status: 404, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      mutation: "internal_refresh_request_status_only",
      publishesPublicDossier: false,
      request,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
