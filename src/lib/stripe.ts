// ============================================================
// STRIPE HELPERS
// ============================================================

import Stripe from "stripe";
import { TIERS } from "./queue-types";
import type { QueueTier } from "./queue-types";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  return secret;
}


const PRIORITY_SIGNAL_SOURCE = "barcode-radio-priority-signal";

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://barcode-network.com").replace(/\/$/, "");
}

export async function createPrioritySignalCheckoutSession({
  trackId,
  queueSessionId,
  artist,
  title,
  amountCents,
  currency,
  label,
}: {
  trackId: string;
  queueSessionId: string;
  artist: string;
  title: string;
  amountCents: number;
  currency: string;
  label: string;
}): Promise<{ url: string; sessionId: string; createdAt: string; expiresAt: string | null }> {
  const stripe = getStripe();
  const origin = getSiteUrl();
  const metadata = { trackId, queueSessionId, source: PRIORITY_SIGNAL_SOURCE };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: label || "Priority Signal Upgrade",
            description: `${artist} — ${title}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/queue/${encodeURIComponent(queueSessionId)}?priority=processing`,
    cancel_url: `${origin}/queue/${encodeURIComponent(queueSessionId)}?priority=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return {
    url: session.url,
    sessionId: session.id,
    createdAt: new Date(session.created * 1000).toISOString(),
    expiresAt: typeof session.expires_at === "number" ? new Date(session.expires_at * 1000).toISOString() : null,
  };
}

export function isPrioritySignalCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.source === PRIORITY_SIGNAL_SOURCE;
}

/** Create a Stripe checkout session for a queue request */
export async function createCheckoutSession({
  tier,
  artist,
  title,
  link,
}: {
  tier: QueueTier;
  artist: string;
  title: string;
  link: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const tierConfig = TIERS[tier];
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://barcode-network.com";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: tierConfig.price,
          product_data: {
            name: `BARCODE Queue — ${tierConfig.name}`,
            description: `${artist} — ${title}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      tier,
      artist,
      title,
      link,
      system: "barcode-queue",
    },
    success_url: `${origin}/queue/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/queue?cancelled=true`,
  });

  return {
    url: session.url!,
    sessionId: session.id,
  };
}

/** Retrieve a checkout session */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId);
}

/** Create a Stripe checkout session for a tier upgrade (pay the difference) */
export async function createUpgradeCheckoutSession({
  entryId,
  currentTier,
  targetTier,
  amount,
  artist,
  title,
}: {
  entryId: string;
  currentTier: QueueTier;
  targetTier: QueueTier;
  amount: number;
  artist: string;
  title: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://barcode-network.com";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `BARCODE Queue — Upgrade to ${TIERS[targetTier].name}`,
            description: `${artist} — ${title} (${TIERS[currentTier].name} → ${TIERS[targetTier].name})`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      entryId,
      currentTier,
      targetTier,
      artist,
      title,
      system: "barcode-upgrade",
    },
    success_url: `${origin}/queue/success?session_id={CHECKOUT_SESSION_ID}&upgrade=true`,
    cancel_url: `${origin}/queue?cancelled=true`,
  });

  return {
    url: session.url!,
    sessionId: session.id,
  };
}

/** Construct and verify a webhook event */
export async function constructWebhookEvent(
  body: string,
  signature: string,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  const secret = getStripeWebhookSecret();
  return stripe.webhooks.constructEvent(body, signature, secret);
}