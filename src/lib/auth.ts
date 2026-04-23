// ============================================================
// AUTH — Simple JWT-based admin authentication
// ============================================================
// Uses HMAC-SHA256 for signing. No external deps.
// Cookie: barcode_admin (HttpOnly, Secure, SameSite=Lax)
// ============================================================

const COOKIE_NAME = "barcode_admin";
const TOKEN_TTL = 60 * 60 * 24; // 24 hours in seconds

// --------------- HMAC helpers (Web Crypto) ---------------

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET || process.env.QUEUE_API_KEY || "dev-fallback-secret";
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

export async function createAdminToken(): Promise<string> {
  const key = await getKey();
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })).buffer as ArrayBuffer);
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
      })
    ).buffer as ArrayBuffer
  );
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
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

    return payload.sub === "admin";
  } catch {
    return false;
  }
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "barcode2026";
}

export { COOKIE_NAME, TOKEN_TTL };