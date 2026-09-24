import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requestCookieValue } from "@/lib/auth";

// A browser capability for its own submissions, independent of Discord/accounts.
export const QUEUE_OWNER_COOKIE = "barcode_queue_owner";
const valid = (value: string | null | undefined): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function queueOwnerHash(request: Request): string | null {
  const token = requestCookieValue(request, QUEUE_OWNER_COOKIE);
  return valid(token) ? hash(token) : null;
}

export function queueSubmissionOwner(request: Request) {
  const existing = requestCookieValue(request, QUEUE_OWNER_COOKIE);
  const token = valid(existing) ? existing : randomBytes(32).toString("hex");
  return {
    hash: hash(token),
    attach(response: NextResponse) {
      if (!valid(existing)) response.cookies.set(QUEUE_OWNER_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
  };
}
