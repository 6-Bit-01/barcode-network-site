import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getQueueRecoveryStatus, importHistoricalQueueSessions, restoreQueueFromDurableSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

function failureReason(error: unknown): { message: string; status: number } {
  const message = error instanceof Error ? error.message : "Queue recovery failed.";
  if (/confirmation/i.test(message)) return { message, status: 400 };
  if (/newer revision|inconsistent|changed before restore|aligned revision 0|must be aligned/i.test(message)) return { message, status: 409 };
  if (/not configured|no verified durable|not a valid HTTPS Redis endpoint|must use a different Redis endpoint|queue recovery isolation checks/i.test(message)) {
    return { message, status: 503 };
  }
  if (/historical queue capture|capture\.|admin queue state|show dates|repeats (?:a session|track)|conflicting loadedTrack|too many queue records/i.test(message)) {
    return { message, status: 400 };
  }
  return { message: "Queue recovery failed.", status: 500 };
}

function configurationPresence() {
  const pairStatus = (url: string | undefined, token: string | undefined): "complete" | "partial" | "missing" => {
    const hasUrl = Boolean(url?.trim());
    const hasToken = Boolean(token?.trim());
    if (hasUrl && hasToken) return "complete";
    if (hasUrl || hasToken) return "partial";
    return "missing";
  };
  return {
    durableSnapshot: process.env.BLOB_READ_WRITE_TOKEN?.trim() ? "configured" : "missing",
    dedicatedQueueRedis: pairStatus(process.env.QUEUE_REDIS_REST_URL, process.env.QUEUE_REDIS_REST_TOKEN),
    sharedRedisFallback: pairStatus(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN),
  };
}

function diagnosticFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/max requests limit exceeded/i.test(message)) return "request_quota_exceeded";
  if (/url|protocol|absolute|redis/i.test(message)) return "redis_client_configuration_error";
  if (/blob|snapshot/i.test(message)) return "durable_snapshot_error";
  return "unexpected_diagnostic_error";
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  try {
    return NextResponse.json(await getQueueRecoveryStatus(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    // This endpoint is the last-resort read-only incident diagnostic. Never
    // replace dependency evidence with a framework-generated blank 500 page.
    return NextResponse.json({
      error: "Queue recovery status could not be collected.",
      reason: "diagnostic_unavailable",
      failureCode: diagnosticFailureCode(error),
      configuration: configurationPresence(),
      readOnly: true,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "restoreDurableSnapshot") {
      const result = await restoreQueueFromDurableSnapshot({
        dryRun: body.dryRun !== false,
        confirmation: typeof body.confirmation === "string" ? body.confirmation : undefined,
      });
      return NextResponse.json(result, { headers: NO_STORE_HEADERS });
    }
    if (body.action === "importHistoricalSessions") {
      const result = await importHistoricalQueueSessions({
        capture: body.capture,
        dryRun: body.dryRun !== false,
        confirmation: typeof body.confirmation === "string" ? body.confirmation : undefined,
      });
      return NextResponse.json(result, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: "Unknown queue recovery action." }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (error) {
    const failure = failureReason(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status, headers: NO_STORE_HEADERS });
  }
}
