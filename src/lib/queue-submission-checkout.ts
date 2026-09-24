import { clearPriorityCheckoutOwnerToken, getOrCreatePriorityCheckoutOwnerToken } from "@/lib/priority-checkout-client";
import { clearSignalHoldCheckoutOwnerToken, getOrCreateSignalHoldCheckoutOwnerToken } from "@/lib/signal-hold-checkout-client";
import { PRIORITY_DISCLOSURE_TEXT, PRIORITY_TERMS_VERSION, SIGNAL_HOLD_DISCLOSURE_TEXT, SIGNAL_HOLD_TERMS_VERSION } from "@/lib/queue-types";

// Intake has already accepted the track. A checkout failure must never send it
// through submission again or imply that payment/protection was confirmed.
export async function startQueueSubmissionCheckout({ choice, sessionId, trackId, submitterToken }: {
  choice: "priority" | "signal_hold";
  sessionId: string;
  trackId: string;
  submitterToken: string;
}): Promise<{ url: string | null; message: string }> {
  const signalHold = choice === "signal_hold";
  const label = signalHold ? "Signal Hold" : "Priority";
  try {
    const checkoutOwnerToken = signalHold
      ? getOrCreateSignalHoldCheckoutOwnerToken(sessionId, trackId)
      : getOrCreatePriorityCheckoutOwnerToken(sessionId, trackId);
    const acceptance = signalHold
      ? { acceptedSignalHoldTerms: true, signalHoldTermsVersion: SIGNAL_HOLD_TERMS_VERSION, signalHoldDisclosureText: SIGNAL_HOLD_DISCLOSURE_TEXT }
      : { acceptedPriorityTerms: true, priorityTermsVersion: PRIORITY_TERMS_VERSION, priorityDisclosureText: PRIORITY_DISCLOSURE_TEXT };
    const response = await fetch(signalHold ? "/api/queue/signal-hold-checkout" : "/api/queue/priority-checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, trackId, submitterToken, checkoutOwnerToken, ...acceptance }),
      signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && typeof payload.url === "string" && payload.url) return { url: payload.url, message: "Checkout started. Payment is not confirmed yet." };
    if (payload.code === "checkout_owned_elsewhere") {
      if (signalHold) clearSignalHoldCheckoutOwnerToken(sessionId, trackId);
      else clearPriorityCheckoutOwnerToken(sessionId, trackId);
    }
    return { url: null, message: `Your song was accepted. ${payload.error || `${label} checkout could not be started.`} Check your track in the queue before trying payment again; do not resubmit the song.` };
  } catch {
    return { url: null, message: `Your song was accepted, but ${label} checkout could not be confirmed. Refresh the queue and check your track before trying payment again; do not resubmit the song.` };
  }
}
