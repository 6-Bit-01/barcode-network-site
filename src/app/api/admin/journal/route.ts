import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import {
  enqueueJournalRunRequest,
  getJournalControlRedis,
  readJournalControlState,
  sanitizeJournalAutomationConfig,
  writeJournalAutomationConfig,
  type JournalCadence,
} from "@/lib/bnl-journal-control-store";
import {
  listBNLJournalAdminEntries,
  listJournalEntryControlAudit,
  updateJournalEntryControl,
} from "@/lib/bnl-journal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [key, ...value] = cookie.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) return json({ error: "Unauthorized" }, 401);
  const redis = getJournalControlRedis();
  if (!redis)
    return json(
      {
        error: "Journal controls require Redis persistence.",
        reason: "persistence_unavailable",
      },
      503,
    );
  try {
    const [state, entries, entryControlAudit] = await Promise.all([
      readJournalControlState(redis),
      listBNLJournalAdminEntries(redis),
      listJournalEntryControlAudit(redis),
    ]);
    if (!entries.ok)
      return json(
        { error: "Journal entries are unavailable.", reason: "read_failed" },
        503,
      );
    return json({
      ...state,
      entries: entries.value,
      entryControlAudit,
      persisted: true,
    });
  } catch (error) {
    console.error("[admin/journal] read failed:", error);
    return json(
      { error: "Journal control state is unavailable.", reason: "read_failed" },
      503,
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) return json({ error: "Unauthorized" }, 401);
  const redis = getJournalControlRedis();
  if (!redis)
    return json(
      {
        error: "Journal controls require Redis persistence.",
        reason: "persistence_unavailable",
      },
      503,
    );
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (body.action === "updateConfig") {
      const config = sanitizeJournalAutomationConfig(body.config);
      const raw = body.config as Record<string, unknown> | null;
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).length !== 3 ||
        typeof raw.journalAutoPublishEnabled !== "boolean" ||
        typeof raw.journalDailyEnabled !== "boolean" ||
        typeof raw.journalWeeklyEnabled !== "boolean"
      )
        return json({ error: "Invalid Journal automation config." }, 400);
      const stored = await writeJournalAutomationConfig(config, redis);
      return json({ ok: true, config: stored, persisted: true });
    }

    if (body.action === "requestRun") {
      const cadence = body.cadence as JournalCadence;
      if (cadence !== "daily" && cadence !== "weekly")
        return json({ error: "Invalid Journal cadence." }, 400);
      const queued = await enqueueJournalRunRequest(cadence, redis);
      if (!queued)
        return json(
          { error: "Journal run queue is unavailable.", reason: "queue_failed" },
          503,
        );
      return json({
        ok: true,
        request: queued.request,
        idempotent: queued.idempotent,
        persisted: true,
      });
    }

    if (body.action === "updateEntryControl") {
      if (
        typeof body.entryId !== "string" ||
        typeof body.publicVisible !== "boolean" ||
        typeof body.memoryEligible !== "boolean"
      )
        return json({ error: "Invalid Journal entry control." }, 400);
      const result = await updateJournalEntryControl(
        body.entryId,
        body.publicVisible,
        body.memoryEligible,
        redis,
      );
      if (!result.ok && result.missing)
        return json({ error: "Journal entry not found." }, 404);
      if (!result.ok)
        return json(
          { error: "Journal entry control is unavailable." },
          503,
        );
      return json({ ok: true, control: result.control, persisted: true });
    }

    return json({ error: "Invalid action." }, 400);
  } catch (error) {
    console.error("[admin/journal] mutation failed:", error);
    return json(
      {
        error: "Journal control mutation failed.",
        reason: "mutation_failed",
      },
      503,
    );
  }
}
