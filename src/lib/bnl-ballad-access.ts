import "server-only";
import { verifyAdminRequest } from "./auth";
import { lookupMemberAccess } from "./member-access";

const canonicalOrigin = "https://www.barcode-network.com";

// Ballads accepts the existing show login or current Owner account authority.
// Keep this bridge scoped: Crew tools do not grant Ballad publication access.
export async function verifyBalladAdminRequest(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const readOnly = request.method === "GET" || request.method === "HEAD";
  if (origin !== null && origin !== url.origin) return false;
  if (!readOnly && origin !== url.origin) return false;

  if (await verifyAdminRequest(request)) return true;
  if (url.origin !== canonicalOrigin) return false;
  try {
    const result = await lookupMemberAccess(request.headers.get("cookie") ?? "");
    return result.ok && result.data.access.owner;
  } catch {
    return false;
  }
}
