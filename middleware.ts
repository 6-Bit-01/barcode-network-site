// ============================================================
// MIDDLEWARE — Admin auth gate + free submission rate limiting
// ============================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Rate limit: /api/queue/free ----
  if (pathname === "/api/queue/free" && req.method === "POST") {
    // Simple sliding-window rate limit via Upstash (handled in the route itself
    // since middleware edge runtime has limitations with Redis client).
    // We add a rate-limit identifier header for the route handler to use.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const res = NextResponse.next();
    res.headers.set("x-rate-limit-ip", ip);
    return res;
  }

  // ---- Admin page protection ----
  if (pathname.startsWith("/admin")) {
    // Allow the auth API endpoint through
    if (pathname.startsWith("/api/admin/auth")) {
      return NextResponse.next();
    }

    // Check for admin cookie
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      // No cookie → render the page (client component will show login form)
      return NextResponse.next();
    }

    // Verify token
    const valid = await verifyAdminToken(token);
    if (!valid) {
      // Invalid/expired token → clear it and continue (will show login form)
      const res = NextResponse.next();
      res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/queue/free",
  ],
};