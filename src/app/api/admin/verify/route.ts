// GET /api/admin/verify — Check if current user has valid admin cookie
// Returns 200 if authenticated, 401 if not

import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user: admin.sub, role: admin.role, permissions: admin.permissions });
}