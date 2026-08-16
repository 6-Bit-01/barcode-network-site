import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createPrioritySignalCheckoutSession } from "@/lib/stripe";
import { createPriorityGiftAttribution, markPriorityUpgradeCheckoutPending, queueOperationErrorResponse, requestPriorityCheckout } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCheckoutOwnerToken(value: unknown): string {
  const token = cleanText(value);
  return /^[a-zA-Z0-9_-]{32,160}$/.test(token) ? token : "";
}

export function hashPriorityCheckoutOwnerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function storedCheckoutBelongsToRequester(
  track: { priorityUpgradeCheckoutOwnerTokenHash?: string | null },
  checkoutOwnerToken: string,
): boolean {
  const storedHash = cleanText(track.priorityUpgradeCheckoutOwnerTokenHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(storedHash) || !checkoutOwnerToken) return false;
  const requesterHash = hashPriorityCheckoutOwnerToken(checkoutOwnerToken);
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(requesterHash, "hex"));
}

const PRIORITY_DEPTH_UNAVAILABLE_MESSAGE = "Priority Signal opens once the broadcast line has enough active transmissions to overtake.";
const MIN_PRIORITY_ACTIVE_DEPTH = 2;
const PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE = "Priority Signal checkout is temporarily unavailable. Please try again later.";
const SAFE_PRIORITY_CHECKOUT_VALIDATION_ERRORS = new Map<string, number>([
  ["Gifted Priority attribution disclosure is required for another artist's track. Refresh the queue and try again.", 400],
  ["Priority Signal checkout requires acknowledgement of the Priority Signal disclosure.", 400],
  ["Gifted Priority attribution disclosure mismatch. Refresh the queue and try again.", 400],
  ["Priority Signal upgrades are available only while this broadcast session is active.", 409],
  ["Priority Signal upgrades are unavailable for this broadcast.", 409],
  ["Priority Signal upgrade price is not configured yet.", 409],
  ["Priority Signal Upgrade is not available for this track.", 409],
]);

function priorityCheckoutDependencyUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const candidate = error as { code?: unknown; statusCode?: unknown; type?: unknown };
  const statusCode = typeof candidate?.statusCode === "number" ? candidate.statusCode : 0;
  const code = typeof candidate?.code === "string" ? candidate.code.toUpperCase() : "";
  const type = typeof candidate?.type === "string" ? candidate.type : "";
  return statusCode === 429
    || statusCode >= 500
    || type.startsWith("Stripe")
    || ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT"].includes(code);
}

function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function storedCheckoutStillUsable(track: { priorityUpgradeStatus?: string | null; priorityUpgradeCheckoutUrl?: string | null; priorityUpgradeCheckoutSessionId?: string | null; priorityUpgradeCheckoutExpiresAt?: string | null }): boolean {
  if (track.priorityUpgradeStatus !== "checkout_pending") return false;
  if (!track.priorityUpgradeCheckoutUrl || !track.priorityUpgradeCheckoutSessionId) return false;
  if (!track.priorityUpgradeCheckoutExpiresAt) return false;
  const expiresAt = new Date(track.priorityUpgradeCheckoutExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
}

export async function POST(req: Request) {
  try {
    if (!stripeReady()) return NextResponse.json({ error: PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const trackId = cleanText(body.trackId);
    const sessionId = cleanText(body.sessionId);
    if (!trackId || !sessionId) return NextResponse.json({ error: "Priority Signal Upgrade is not available for this track." }, { status: 400 });
    const checkoutOwnerToken = cleanCheckoutOwnerToken(body.checkoutOwnerToken);
    if (!checkoutOwnerToken) return NextResponse.json({ error: "Priority Signal checkout ownership could not be verified. Refresh the queue and try again." }, { status: 400 });
    const priorityAcceptance = {
      acceptedPriorityTerms: body.acceptedPriorityTerms === true,
      priorityTermsVersion: cleanText(body.priorityTermsVersion),
      priorityDisclosureText: cleanText(body.priorityDisclosureText),
    };

    const checkoutRequest = await requestPriorityCheckout(trackId, sessionId, priorityAcceptance);
    const submitterToken = cleanText(body.submitterToken).slice(0, 120);
    const requesterOwnsTrack = Boolean(submitterToken && checkoutRequest.track.submitterToken && submitterToken === checkoutRequest.track.submitterToken);
    if (!requesterOwnsTrack && body.priorityGift !== true) throw new Error("Gifted Priority attribution disclosure is required for another artist's track. Refresh the queue and try again.");
    if (storedCheckoutStillUsable(checkoutRequest.track)) {
      if (!storedCheckoutBelongsToRequester(checkoutRequest.track, checkoutOwnerToken)) {
        return NextResponse.json({ error: "Priority Signal checkout is already in progress for this track. Only the person who started it can resume it.", code: "checkout_owned_elsewhere" }, { status: 409 });
      }
      return NextResponse.json({ url: checkoutRequest.track.priorityUpgradeCheckoutUrl, sessionId: checkoutRequest.track.priorityUpgradeCheckoutSessionId, message: "Payment confirmation may take a moment." });
    }
    if (checkoutRequest.session.activeCount < MIN_PRIORITY_ACTIVE_DEPTH) return NextResponse.json({ error: PRIORITY_DEPTH_UNAVAILABLE_MESSAGE }, { status: 409 });

    const priorityGiftAttribution = !requesterOwnsTrack
      ? createPriorityGiftAttribution({
        attributionVersion: cleanText(body.priorityGiftAttributionVersion),
        attributionDisclosureText: cleanText(body.priorityGiftAttributionDisclosureText),
        supporterName: cleanText(body.priorityGiftSupporterName),
      }, checkoutRequest.track.submittedArtistName ?? checkoutRequest.track.artist)
      : null;

    const checkout = await createPrioritySignalCheckoutSession({
      trackId,
      queueSessionId: checkoutRequest.session.sessionId,
      artist: checkoutRequest.track.submittedArtistName ?? checkoutRequest.track.artist,
      title: checkoutRequest.track.submittedSongTitle ?? checkoutRequest.track.title,
      amountCents: checkoutRequest.amountCents,
      currency: checkoutRequest.currency,
      label: checkoutRequest.label,
      priorityGiftAttribution,
    });
    await markPriorityUpgradeCheckoutPending(trackId, checkoutRequest.session.sessionId, { provider: "stripe", checkoutSessionId: checkout.sessionId, checkoutUrl: checkout.url, checkoutCreatedAt: checkout.createdAt, checkoutExpiresAt: checkout.expiresAt, checkoutOwnerTokenHash: hashPriorityCheckoutOwnerToken(checkoutOwnerToken), priorityAcceptance, priorityGiftAttribution });
    return NextResponse.json({ url: checkout.url, sessionId: checkout.sessionId, message: "Payment confirmation may take a moment." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const validationStatus = SAFE_PRIORITY_CHECKOUT_VALIDATION_ERRORS.get(message);
    if (validationStatus) return NextResponse.json({ error: message }, { status: validationStatus });

    const queueFailure = queueOperationErrorResponse(error, PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE);
    if (queueFailure.payload.code !== "queue_operation_failed") {
      return NextResponse.json(queueFailure.payload, { status: queueFailure.status });
    }

    return NextResponse.json(
      { error: PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE, code: "priority_checkout_unavailable" },
      { status: priorityCheckoutDependencyUnavailable(error) ? 503 : 500 },
    );
  }
}
