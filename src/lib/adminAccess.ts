import { AdminPermission, AdminTokenPayload, COOKIE_NAME, parseAdminToken } from "@/lib/auth";

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [k, ...v] = c.split("=");
        return [k, v.join("=")];
      })
  );
}

export async function getAdminFromRequest(req: Request): Promise<AdminTokenPayload | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = parseCookies(cookieHeader)[COOKIE_NAME];
  if (!token) return null;
  return parseAdminToken(token);
}

export async function requireAdminPermission(req: Request, permission: AdminPermission): Promise<AdminTokenPayload | null> {
  const admin = await getAdminFromRequest(req);
  if (!admin) return null;
  return admin.permissions.includes(permission) ? admin : null;
}
