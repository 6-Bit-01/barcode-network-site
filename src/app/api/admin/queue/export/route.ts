import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getQueueSessionSubmissionsCsv, getQueueSessionSubmitterList } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const format = url.searchParams.get("format") ?? "csv";

  if (format === "json") {
    return NextResponse.json(await getQueueSessionSubmitterList(sessionId));
  }

  const { filename, csv } = await getQueueSessionSubmissionsCsv(sessionId);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
