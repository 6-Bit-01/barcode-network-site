import { NextResponse } from "next/server";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";
import { getQueueState, updateQueueTrack } from "@/lib/queue";
import type { QueueAdminAction } from "@/lib/queue-types";

export const dynamic = "force-dynamic";

async function requireAdmin(req: Request): Promise<boolean> {
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
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getQueueState());
  } catch (error) {
    console.error("[admin/queue:get]", error);
    return NextResponse.json({ error: "Queue unavailable" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "") as QueueAdminAction;
    const id = String(body.id ?? "");
    const queueOpen = typeof body.queueOpen === "boolean" ? body.queueOpen : undefined;

    if (!action) return NextResponse.json({ error: "Action is required" }, { status: 400 });
    if (action !== "setOpen" && !id) return NextResponse.json({ error: "Track id is required" }, { status: 400 });

    const state = await updateQueueTrack(id, action, queueOpen);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof Error && error.message === "TRACK_NOT_FOUND") {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    console.error("[admin/queue:patch]", error);
    return NextResponse.json({ error: "Queue action failed" }, { status: 500 });
  }
}
