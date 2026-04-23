// POST /api/admin/auth — Authenticate admin, set JWT cookie
// POST body: { password: string }
// DELETE — Logout (clear cookie)

import { NextResponse } from "next/server";
import { createAdminToken, getAdminPassword, COOKIE_NAME, TOKEN_TTL } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password || password !== getAdminPassword()) {
      return NextResponse.json({ error: "ACCESS DENIED" }, { status: 401 });
    }

    const token = await createAdminToken();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TOKEN_TTL,
    });

    return res;
  } catch (error) {
    console.error("[admin/auth] error:", error);
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}