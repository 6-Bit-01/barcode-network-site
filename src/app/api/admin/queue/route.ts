import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getRadioQueueState, setQueueOpen, updateRadioTrack } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getRadioQueueState());
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "setOpen") {
    return NextResponse.json({ publicStatus: await setQueueOpen(Boolean(body.isOpen)) });
  }
  if (["finish", "remove", "priority", "spotlight"].includes(body.action) && typeof body.id === "string") {
    return NextResponse.json(await updateRadioTrack(body.id, body.action));
  }
  return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
}
