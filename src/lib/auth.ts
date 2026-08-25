// ============================================================
// AUTH — Simple JWT-based admin authentication
// ============================================================
// Uses HMAC-SHA256 for signing. No external deps.
// Cookie: barcode_admin (HttpOnly, Secure, SameSite=Lax)
// ============================================================

const COOKIE_NAME = "barcode_admin";
const TOKEN_TTL = 60 * 60 * 24; // 24 hours in seconds
const FOREGROUND_OVERLAY_TOKEN_TTL = 60 * 60 * 12;
type AuthTokenSubject = "admin" | "foreground_overlay";
const STUDIO_OVERLAY_TOKEN_SUBJECT = "studio_overlay";

// --------------- HMAC helpers (Web Crypto) ---------------

async function getKey(): Promise<CryptoKey> {
  const isProduction = process.env.NODE_ENV === "production";
  const secret = process.env.JWT_SECRET || process.env.QUEUE_API_KEY || (!isProduction ? "dev-fallback-secret" : "");
  if (!secret) throw new Error("Admin auth is not configured.");
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
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

// --------------- Token creation/verification ---------------

async function createToken(subject: AuthTokenSubject, ttlSeconds: number): Promise<string> {
  const key = await getKey();
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })).buffer as ArrayBuffer);
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: subject,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      })
    ).buffer as ArrayBuffer
  );
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
}

async function verifyToken(token: string, expectedSubject: AuthTokenSubject): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const key = await getKey();
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64urlDecode(parts[2]);

    const valid = await crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data));
    if (!valid) return false;

    // Check expiration
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;

    return payload.sub === expectedSubject;
  } catch {
    return false;
  }
}

export async function createAdminToken(): Promise<string> {
  return createToken("admin", TOKEN_TTL);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  return verifyToken(token, "admin");
}

export function requestCookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const cookie of cookieHeader.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");
    if (key !== name) continue;
    const value = valueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

export async function verifyAdminRequest(request: Request): Promise<boolean> {
  const token = requestCookieValue(request, COOKIE_NAME);
  return token ? verifyAdminToken(token) : false;
}

export async function createForegroundOverlayToken(): Promise<string> {
  return createToken("foreground_overlay", FOREGROUND_OVERLAY_TOKEN_TTL);
}

export async function verifyForegroundOverlayToken(token: string): Promise<boolean> {
  return verifyToken(token, "foreground_overlay");
}

// A deterministic, overlay-only capability lets TikTok Studio keep one saved
// URL across shows. Rotating JWT_SECRET/QUEUE_API_KEY revokes it. It has no
// expiry by design and can never pass admin-token verification.
export async function createStudioOverlayToken(): Promise<string> {
  const key = await getKey();
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })).buffer as ArrayBuffer);
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ sub: STUDIO_OVERLAY_TOKEN_SUBJECT, v: 1 })).buffer as ArrayBuffer);
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
}

export async function verifyStudioOverlayToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const key = await getKey();
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64urlDecode(parts[2]);
    const valid = await crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    return payload.sub === STUDIO_OVERLAY_TOKEN_SUBJECT && payload.v === 1;
  } catch {
    return false;
  }
}

export function getAdminPassword(): string {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_PASSWORD) throw new Error("Admin auth is not configured.");
    return process.env.ADMIN_PASSWORD;
  }
  return process.env.ADMIN_PASSWORD || "barcode2026";
}

export { COOKIE_NAME, TOKEN_TTL, FOREGROUND_OVERLAY_TOKEN_TTL };
