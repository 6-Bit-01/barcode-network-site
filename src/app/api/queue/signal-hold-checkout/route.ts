import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createSignalHoldCheckoutSession } from "@/lib/stripe";
import { getPublicQueueSnapshot, markSignalHoldCheckoutPending, requestSignalHoldCheckout } from "@/lib/queue";
import { resolveQueueRequestAccess } from "@/lib/queue-rehearsal-access";
import { QUEUE_OPERATIONAL_UNAVAILABLE_CODE, QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE } from "@/lib/queue-production";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanCheckoutOwnerToken(value: unknown): string {
  const token = cleanText(value);
  return /^[a-zA-Z0-9_-]{32,160}$/.test(token) ? token : "";
}

export function hashSignalHoldCheckoutOwnerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function storedSignalHoldCheckoutBelongsToRequester(
  track: { signalHoldCheckoutOwnerTokenHash?: string | null },
  checkoutOwnerToken: string,
): boolean {
  const storedHash = cleanText(track.signalHoldCheckoutOwnerTokenHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(storedHash) || !checkoutOwnerToken) return false;
  const requesterHash = hashSignalHoldCheckoutOwnerToken(checkoutOwnerToken);
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(requesterHash, "hex"));
}

function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function storedCheckoutStillUsable(track: {
  signalHoldStatus?: string | null;
  signalHoldCheckoutUrl?: string | null;
  signalHoldCheckoutSessionId?: string | null;
  signalHoldCheckoutExpiresAt?: string | null;
}): boolean {
  if (track.signalHoldStatus !== "checkout_pending") return false;
  if (!track.signalHoldCheckoutUrl || !track.signalHoldCheckoutSessionId) return false;
  if (!track.signalHoldCheckoutExpiresAt) return false;
  const expiresAt = new Date(track.signalHoldCheckoutExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
}

function queueUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE, code: QUEUE_OPERATIONAL_UNAVAILABLE_CODE },
    { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const trackId = cleanText(body.trackId);
    const sessionId = cleanText(body.sessionId);
    if (!trackId || !sessionId) return NextResponse.json({ error: "Signal Hold is not available for this track." }, { status: 400 });
    const snapshot = await getPublicQueueSnapshot(sessionId);
    const access = await resolveQueueRequestAccess(req, snapshot.session, snapshot.sessionActive === true);
    if (!access.authorized) return queueUnavailableResponse();
    if (!stripeReady()) return NextResponse.json({ error: "Signal Hold checkout is temporarily unavailable. Please try again later." }, { status: 503 });
    if (snapshot.session?.sessionId !== sessionId || (snapshot.session.purpose !== "live_broadcast" && !access.isAdmin && !access.hasRehearsalAccess)) {
      return NextResponse.json({ error: "Signal Hold is not available for this track." }, { status: 409 });
    }
    const checkoutOwnerToken = cleanCheckoutOwnerToken(body.checkoutOwnerToken);
    if (!checkoutOwnerToken) return NextResponse.json({ error: "Signal Hold checkout ownership could not be verified. Refresh the queue and try again." }, { status: 400 });
    const signalHoldAcceptance = {
      acceptedSignalHoldTerms: body.acceptedSignalHoldTerms === true,
      signalHoldTermsVersion: cleanText(body.signalHoldTermsVersion),
      signalHoldDisclosureText: cleanText(body.signalHoldDisclosureText),
    };

    const checkoutRequest = await requestSignalHoldCheckout(trackId, sessionId, signalHoldAcceptance);
    const submitterToken = cleanText(body.submitterToken).slice(0, 120);
    const requesterOwnsTrack = Boolean(submitterToken && checkoutRequest.track.submitterToken && submitterToken === checkoutRequest.track.submitterToken);
    if (!requesterOwnsTrack) throw new Error("Signal Hold is available only for your own submitted track. Refresh the queue and try again.");
    if (storedCheckoutStillUsable(checkoutRequest.track)) {
      if (!storedSignalHoldCheckoutBelongsToRequester(checkoutRequest.track, checkoutOwnerToken)) {
        return NextResponse.json({ error: "Signal Hold checkout is already in progress for this track. Only the person who started it can resume it.", code: "checkout_owned_elsewhere" }, { status: 409 });
      }
      return NextResponse.json({ url: checkoutRequest.track.signalHoldCheckoutUrl, sessionId: checkoutRequest.track.signalHoldCheckoutSessionId, message: "Payment confirmation may take a moment. Signal Hold is not active yet." });
    }

    const checkout = await createSignalHoldCheckoutSession({
      trackId,
      queueSessionId: checkoutRequest.session.sessionId,
      artist: checkoutRequest.track.submittedArtistName ?? checkoutRequest.track.artist,
      title: checkoutRequest.track.submittedSongTitle ?? checkoutRequest.track.title,
      amountCents: checkoutRequest.amountCents,
      currency: checkoutRequest.currency,
    });
    await markSignalHoldCheckoutPending(trackId, checkoutRequest.session.sessionId, {
      provider: "stripe",
      checkoutSessionId: checkout.sessionId,
      checkoutUrl: checkout.url,
      checkoutCreatedAt: checkout.createdAt,
      checkoutExpiresAt: checkout.expiresAt,
      checkoutOwnerTokenHash: hashSignalHoldCheckoutOwnerToken(checkoutOwnerToken),
      signalHoldAcceptance,
    });
    return NextResponse.json({ url: checkout.url, sessionId: checkout.sessionId, message: "Payment confirmation may take a moment. Signal Hold is not active yet." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signal Hold checkout is unavailable.";
    const status = message.includes("temporarily") ? 503 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
