import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { auditRedisCapacity, cleanupSupersededSourceFileArchives, isStorageCapacityExceededError } from "@/lib/redis-capacity-audit";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((c) => { const [k, ...v] = c.trim().split("="); return [k, v.join("=")]; }));
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

function publicError(error: unknown) {
  if (isStorageCapacityExceededError(error)) return { error: "Redis storage capacity exceeded.", reason: "storage_capacity_exceeded" };
  return { error: "Storage recovery request failed.", reason: "storage_recovery_failed" };
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  try {
    const report = await auditRedisCapacity();
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(publicError(error), { status: isStorageCapacityExceededError(error) ? 507 : 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "cleanupSupersededSourceFileArchives" || body?.confirmation !== "CLEAN SUPERSEDED SOURCE FILE ARCHIVES") {
    return NextResponse.json({ error: "Explicit confirmation required.", reason: "confirmation_required" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  try {
    const report = await cleanupSupersededSourceFileArchives();
    return NextResponse.json(report, { status: report.ok ? 200 : 207, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(publicError(error), { status: isStorageCapacityExceededError(error) ? 507 : 500, headers: NO_STORE_HEADERS });
  }
}
