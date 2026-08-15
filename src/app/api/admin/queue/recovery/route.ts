import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getQueueRecoveryStatus, restoreQueueFromDurableSnapshot } from "@/lib/queue";

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
  if (/newer revision|inconsistent|changed before restore/i.test(message)) return { message, status: 409 };
  if (/not configured|no verified durable/i.test(message)) return { message, status: 503 };
  return { message: "Queue recovery failed.", status: 500 };
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  return NextResponse.json(await getQueueRecoveryStatus(), { headers: NO_STORE_HEADERS });
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "restoreDurableSnapshot") {
    return NextResponse.json({ error: "Unknown queue recovery action." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  try {
    const result = await restoreQueueFromDurableSnapshot({
      dryRun: body.dryRun !== false,
      confirmation: typeof body.confirmation === "string" ? body.confirmation : undefined,
    });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const failure = failureReason(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status, headers: NO_STORE_HEADERS });
  }
}
