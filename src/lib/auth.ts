// ============================================================
// AUTH — JWT-based admin authentication
// ============================================================

const COOKIE_NAME = "barcode_admin";
const TOKEN_TTL = 60 * 60 * 24; // 24 hours in seconds

export type AdminRole = "super_admin" | "producer";
export type AdminPermission = "live:read" | "live:write";

export type AdminTokenPayload = {
  sub: "admin";
  role: AdminRole;
  permissions: AdminPermission[];
  iat: number;
  exp: number;
};

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET || process.env.QUEUE_API_KEY || "dev-fallback-secret";
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getDefaultPermissions(role: AdminRole): AdminPermission[] {
  if (role === "super_admin") {
    return ["live:read", "live:write"];
  }
  return ["live:read", "live:write"];
}

export async function createAdminToken(role: AdminRole = "super_admin"): Promise<string> {
  const key = await getKey();
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })).buffer as ArrayBuffer);
  const payloadObj: AdminTokenPayload = {
    sub: "admin",
    role,
    permissions: getDefaultPermissions(role),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
  };
  const payload = base64url(new TextEncoder().encode(JSON.stringify(payloadObj)).buffer as ArrayBuffer);
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
}

export async function parseAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const key = await getKey();
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64urlDecode(parts[2]);

    const valid = await crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1]))) as AdminTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.sub !== "admin") return null;
    if (!Array.isArray(payload.permissions)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  return Boolean(await parseAdminToken(token));
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "barcode2026";
}

export { COOKIE_NAME, TOKEN_TTL };
