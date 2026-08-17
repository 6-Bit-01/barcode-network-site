import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getQueueSessionShowLog, getQueueSessionShowLogCsv } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

function privateHeaders(filename?: string): Record<string, string> {
  return {
    "cache-control": "private, no-store",
    ...(filename ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
  };
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders() });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  try {
    if (format === "csv") {
      const { filename, csv } = await getQueueSessionShowLogCsv(sessionId);
      return new Response(csv, {
        headers: {
          ...privateHeaders(filename),
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }

    const log = await getQueueSessionShowLog(sessionId);
    return NextResponse.json(log, {
      headers: privateHeaders(`barcode-radio-show-log-${log.session.showDate}.json`),
    });
  } catch (error) {
    const missing = error instanceof Error && error.message === "Queue session not found.";
    return NextResponse.json(
      { error: missing ? "Queue session not found." : "Show log unavailable." },
      { status: missing ? 404 : 503, headers: privateHeaders() },
    );
  }
}
