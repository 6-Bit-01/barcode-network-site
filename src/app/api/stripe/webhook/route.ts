import { NextResponse } from "next/server";
import Stripe from "stripe";
import { markPriorityUpgradePaidFromStripe } from "@/lib/queue";
import { constructWebhookEvent, isPrioritySignalCheckoutSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function metadataText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function paymentIdForSession(session: Stripe.Checkout.Session): string {
  return typeof session.payment_intent === "string" ? session.payment_intent : session.id;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await constructWebhookEvent(rawBody, signature);
  } catch (error) {
    console.error("Stripe webhook verification failed", error);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") return NextResponse.json({ received: true });

  const session = event.data.object as Stripe.Checkout.Session;
  if (!isPrioritySignalCheckoutSession(session)) return NextResponse.json({ received: true, ignored: true });
  if (session.payment_status !== "paid") return NextResponse.json({ received: true, ignored: "unpaid_checkout" });

  const trackId = metadataText(session.metadata?.trackId);
  const queueSessionId = metadataText(session.metadata?.queueSessionId);
  if (!trackId || !queueSessionId) return NextResponse.json({ received: true, ignored: "missing_metadata" });

  const amountCents = typeof session.amount_total === "number" ? session.amount_total : 0;
  const currency = metadataText(session.currency) || "usd";
  const result = await markPriorityUpgradePaidFromStripe(trackId, queueSessionId, {
    paymentId: paymentIdForSession(session),
    amountCents,
    currency,
    paidAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  });

  return NextResponse.json({ received: true, result });
}
