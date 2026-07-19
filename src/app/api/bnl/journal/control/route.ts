import { NextResponse } from "next/server";
import { authenticateBNLJournalRequest } from "@/lib/bnl-journal-contract";
import {
  claimJournalRunRequest,
  getJournalControlRedis,
  readJournalControlState,
  reportJournalRun,
  writeJournalTelemetry,
} from "@/lib/bnl-journal-control-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function isAuthorized(req: Request) {
  return authenticateBNLJournalRequest(req.headers.get("x-api-key"));
}

function unavailable() {
  return json(
    {
      error: "Journal automation persistence is unavailable.",
      reason: "persistence_unavailable",
    },
    503,
  );
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const redis = getJournalControlRedis();
  if (!redis) return unavailable();
  try {
    const state = await readJournalControlState(redis);
    return json({
      contractVersion: 1,
      ...state.config,
      ...state,
      persisted: true,
    });
  } catch (error) {
    console.error("[bnl/journal/control] read failed:", error);
    return unavailable();
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);
  const redis = getJournalControlRedis();
  if (!redis) return unavailable();
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (body.action === "claimRunRequest") {
      const claimed = await claimJournalRunRequest(
        typeof body.requestId === "string" ? body.requestId : "",
        typeof body.claimedAt === "string" ? body.claimedAt : "",
        typeof body.claimToken === "string" ? body.claimToken : "",
        redis,
      );
      if (!claimed) return json({ error: "Run request not found." }, 404);
      if ("conflict" in claimed)
        return json(
          {
            error: "Run request was claimed by another worker.",
            reason: "already_claimed",
          },
          409,
        );
      return json({
        ok: true,
        request: claimed.request,
        idempotent: claimed.idempotent,
        reclaimed: claimed.reclaimed,
        persisted: true,
      });
    }

    if (body.action === "reportRun") {
      const run = await reportJournalRun(body.run, redis);
      if (!run) return json({ error: "Invalid Journal run report." }, 400);
      return json({ ok: true, run, persisted: true });
    }

    if (body.action === "heartbeat") {
      const telemetry = await writeJournalTelemetry(body.telemetry, redis);
      if (!telemetry)
        return json({ error: "Invalid Journal telemetry." }, 400);
      return json({ ok: true, telemetry, persisted: true });
    }

    return json({ error: "Invalid action." }, 400);
  } catch (error) {
    console.error("[bnl/journal/control] mutation failed:", error);
    return unavailable();
  }
}
