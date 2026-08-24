const SIGNAL_HOLD_CHECKOUT_OWNER_STORAGE_PREFIX = "barcode-radio-signal-hold-checkout-owner";
const SIGNAL_HOLD_CHECKOUT_OWNER_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function storageKey(sessionId: string, trackId: string): string {
  return `${SIGNAL_HOLD_CHECKOUT_OWNER_STORAGE_PREFIX}:${sessionId}:${trackId}`;
}

function generateOwnerToken(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getSignalHoldCheckoutOwnerToken(sessionId: string, trackId: string): string {
  if (typeof window === "undefined") return "";
  try {
    const key = storageKey(sessionId, trackId);
    const token = window.localStorage.getItem(key)?.trim() ?? "";
    if (token && !SIGNAL_HOLD_CHECKOUT_OWNER_TOKEN_PATTERN.test(token)) {
      window.localStorage.removeItem(key);
      return "";
    }
    return token;
  } catch {
    return "";
  }
}

export function getOrCreateSignalHoldCheckoutOwnerToken(sessionId: string, trackId: string): string {
  const existing = getSignalHoldCheckoutOwnerToken(sessionId, trackId);
  if (existing) return existing;
  const token = generateOwnerToken();
  try {
    window.localStorage.setItem(storageKey(sessionId, trackId), token);
  } catch {
    // Checkout can still start; this browser simply cannot resume it after navigation.
  }
  return token;
}

export function clearSignalHoldCheckoutOwnerToken(sessionId: string, trackId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(sessionId, trackId));
  } catch {
    // The server-side ownership check remains authoritative.
  }
}
