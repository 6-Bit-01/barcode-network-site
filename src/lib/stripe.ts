// ============================================================
// STRIPE HELPERS
// ============================================================

import Stripe from "stripe";
import { TIERS } from "./queue-types";
import type { PriorityGiftAttribution, QueueTier } from "./queue-types";

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
const SIGNAL_HOLD_SOURCE = "barcode-radio-signal-hold";

const PRIORITY_RECOVERY_START_SECONDS = Date.parse("2026-08-14T07:00:00.000Z") / 1000;
const PRIORITY_RECOVERY_END_SECONDS = Date.parse("2026-08-15T10:23:00.000Z") / 1000;
const PRIORITY_RECOVERY_PAGE_LIMIT = 100;
const PRIORITY_RECOVERY_MAX_SESSION_PAGES = 100;
const PRIORITY_RECOVERY_MAX_LINE_ITEM_PAGES = 10;
const PRIORITY_RECOVERY_MAX_API_CALLS = 500;
const PRIORITY_RECOVERY_MAX_ID_LENGTH = 500;
const PRIORITY_RECOVERY_MAX_DESCRIPTION_LENGTH = 2_000;

export const PRIORITY_SIGNAL_RECOVERY_WINDOW = {
  startInclusive: "2026-08-14T07:00:00.000Z",
  endInclusive: "2026-08-15T10:23:00.000Z",
} as const;

export interface PrioritySignalRecoveryCheckoutSession {
  sessionId: string;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  created: string;
  metadata: {
    source: typeof PRIORITY_SIGNAL_SOURCE;
    trackId: string | null;
    queueSessionId: string | null;
  };
  lineItems: Array<{
    description: string;
    descriptionSource: "product_description" | "line_item_description";
  }>;
}

export interface PrioritySignalRecoveryInventory {
  sessions: PrioritySignalRecoveryCheckoutSession[];
  sessionListCalls: number;
  lineItemListCalls: number;
}

export class PrioritySignalRecoveryInventoryError extends Error {
  readonly sessionListCalls: number;
  readonly lineItemListCalls: number;

  constructor(sessionListCalls: number, lineItemListCalls: number) {
    super("Stripe Priority Signal recovery inventory is incomplete.");
    this.sessionListCalls = sessionListCalls;
    this.lineItemListCalls = lineItemListCalls;
  }
}

function exactRecoveryText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > maxLength) throw new Error("Stripe recovery text exceeded the safety bound.");
  return value;
}

function requiredRecoveryId(value: unknown): string {
  const id = exactRecoveryText(value, PRIORITY_RECOVERY_MAX_ID_LENGTH);
  if (!id) throw new Error("Stripe recovery pagination returned an invalid identifier.");
  return id;
}

function recoveryLineItemEvidence(lineItem: Stripe.LineItem): {
  description: string;
  descriptionSource: "product_description" | "line_item_description";
} | null {
  const product = lineItem.price?.product;
  if (product && typeof product === "object" && "description" in product) {
    const productDescription = exactRecoveryText(product.description, PRIORITY_RECOVERY_MAX_DESCRIPTION_LENGTH);
    if (productDescription) {
      return {
        description: productDescription,
        descriptionSource: "product_description",
      };
    }
  }
  const lineItemDescription = exactRecoveryText(lineItem.description, PRIORITY_RECOVERY_MAX_DESCRIPTION_LENGTH);
  return lineItemDescription
    ? {
        description: lineItemDescription,
        descriptionSource: "line_item_description",
      }
    : null;
}

/**
 * Read-only, incident-specific inventory of Priority Signal Checkout Sessions.
 *
 * The time window, source filter, page sizes, and safety ceilings are fixed so
 * this cannot become a general Stripe data browser. Returned values are built
 * from an explicit allowlist and intentionally omit customer and payment data.
 */
export async function listPrioritySignalRecoveryCheckoutSessions(): Promise<PrioritySignalRecoveryInventory> {
  let sessionListCalls = 0;
  let lineItemListCalls = 0;
  let totalApiCalls = 0;

  const beforeApiCall = () => {
    if (totalApiCalls >= PRIORITY_RECOVERY_MAX_API_CALLS) {
      throw new Error("Stripe recovery API call limit reached before completion.");
    }
    totalApiCalls += 1;
  };

  try {
    const stripe = getStripe();
    const matchingSessions: Stripe.Checkout.Session[] = [];
    const seenSessionIds = new Set<string>();
    const seenSessionCursors = new Set<string>();
    let startingAfter: string | undefined;

    for (let pageNumber = 0; pageNumber < PRIORITY_RECOVERY_MAX_SESSION_PAGES; pageNumber += 1) {
      beforeApiCall();
      sessionListCalls += 1;
      const page = await stripe.checkout.sessions.list({
        created: {
          gte: PRIORITY_RECOVERY_START_SECONDS,
          lte: PRIORITY_RECOVERY_END_SECONDS,
        },
        limit: PRIORITY_RECOVERY_PAGE_LIMIT,
        starting_after: startingAfter,
      });

      for (const session of page.data) {
        const sessionId = requiredRecoveryId(session.id);
        if (session.livemode !== true) {
          throw new Error("Stripe recovery received non-live Checkout Session data.");
        }
        if (seenSessionIds.has(sessionId)) {
          throw new Error("Stripe recovery returned a duplicate Checkout Session.");
        }
        seenSessionIds.add(sessionId);
        if (session.metadata?.source === PRIORITY_SIGNAL_SOURCE) matchingSessions.push(session);
      }

      if (!page.has_more) {
        break;
      }

      const nextCursor = page.data.length > 0
        ? requiredRecoveryId(page.data[page.data.length - 1]?.id)
        : null;
      if (!nextCursor || seenSessionCursors.has(nextCursor)) {
        throw new Error("Stripe Checkout Session pagination did not advance.");
      }
      seenSessionCursors.add(nextCursor);
      startingAfter = nextCursor;

      if (pageNumber === PRIORITY_RECOVERY_MAX_SESSION_PAGES - 1) {
        throw new Error("Stripe Checkout Session pagination exceeded its safety bound.");
      }
    }

    const sessions: PrioritySignalRecoveryCheckoutSession[] = [];
    for (const session of matchingSessions) {
      const lineItems: PrioritySignalRecoveryCheckoutSession["lineItems"] = [];
      const seenLineItemIds = new Set<string>();
      const seenLineItemCursors = new Set<string>();
      let lineItemStartingAfter: string | undefined;

      for (let pageNumber = 0; pageNumber < PRIORITY_RECOVERY_MAX_LINE_ITEM_PAGES; pageNumber += 1) {
        beforeApiCall();
        lineItemListCalls += 1;
        const page = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: PRIORITY_RECOVERY_PAGE_LIMIT,
          starting_after: lineItemStartingAfter,
          expand: ["data.price.product"],
        });

        for (const lineItem of page.data) {
          const lineItemId = requiredRecoveryId(lineItem.id);
          if (seenLineItemIds.has(lineItemId)) {
            throw new Error("Stripe recovery returned a duplicate line item.");
          }
          seenLineItemIds.add(lineItemId);
          const evidence = recoveryLineItemEvidence(lineItem);
          if (evidence) lineItems.push(evidence);
        }

        if (!page.has_more) {
          break;
        }

        const nextCursor = page.data.length > 0
          ? requiredRecoveryId(page.data[page.data.length - 1]?.id)
          : null;
        if (!nextCursor || seenLineItemCursors.has(nextCursor)) {
          throw new Error("Stripe line-item pagination did not advance.");
        }
        seenLineItemCursors.add(nextCursor);
        lineItemStartingAfter = nextCursor;

        if (pageNumber === PRIORITY_RECOVERY_MAX_LINE_ITEM_PAGES - 1) {
          throw new Error("Stripe line-item pagination exceeded its safety bound.");
        }
      }

      if (!Number.isFinite(session.created)) {
        throw new Error("Stripe recovery returned an invalid creation time.");
      }
      const created = new Date(session.created * 1000);
      if (!Number.isFinite(created.getTime())) {
        throw new Error("Stripe recovery returned an invalid creation time.");
      }

      sessions.push({
        sessionId: requiredRecoveryId(session.id),
        status: exactRecoveryText(session.status, 100),
        paymentStatus: exactRecoveryText(session.payment_status, 100),
        amountTotal: typeof session.amount_total === "number" && Number.isSafeInteger(session.amount_total)
          ? session.amount_total
          : null,
        currency: exactRecoveryText(session.currency, 100),
        created: created.toISOString(),
        metadata: {
          source: PRIORITY_SIGNAL_SOURCE,
          trackId: exactRecoveryText(session.metadata?.trackId, PRIORITY_RECOVERY_MAX_ID_LENGTH),
          queueSessionId: exactRecoveryText(session.metadata?.queueSessionId, PRIORITY_RECOVERY_MAX_ID_LENGTH),
        },
        lineItems,
      });
    }

    sessions.sort((left, right) => left.created.localeCompare(right.created) || left.sessionId.localeCompare(right.sessionId));
    return { sessions, sessionListCalls, lineItemListCalls };
  } catch {
    throw new PrioritySignalRecoveryInventoryError(sessionListCalls, lineItemListCalls);
  }
}

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
  priorityGiftAttribution,
}: {
  trackId: string;
  queueSessionId: string;
  artist: string;
  title: string;
  amountCents: number;
  currency: string;
  label: string;
  priorityGiftAttribution?: PriorityGiftAttribution | null;
}): Promise<{ url: string; sessionId: string; createdAt: string; expiresAt: string | null }> {
  const stripe = getStripe();
  const origin = getSiteUrl();
  const metadata = {
    trackId,
    queueSessionId,
    source: PRIORITY_SIGNAL_SOURCE,
    ...(priorityGiftAttribution ? {
      priorityGiftAttributionVersion: priorityGiftAttribution.version,
      priorityGiftSupporterName: priorityGiftAttribution.supporterName,
      priorityGiftRecipientName: priorityGiftAttribution.recipientName,
      priorityGiftCapturedAt: priorityGiftAttribution.capturedAt,
    } : {}),
  };

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

export async function createSignalHoldCheckoutSession({
  trackId,
  queueSessionId,
  artist,
  title,
  amountCents,
  currency,
}: {
  trackId: string;
  queueSessionId: string;
  artist: string;
  title: string;
  amountCents: number;
  currency: string;
}): Promise<{ url: string; sessionId: string; createdAt: string; expiresAt: string | null }> {
  const stripe = getStripe();
  const origin = getSiteUrl();
  const metadata = {
    trackId,
    queueSessionId,
    source: SIGNAL_HOLD_SOURCE,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: "Signal Hold",
            description: `${artist} — ${title}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/queue/${encodeURIComponent(queueSessionId)}?signalHold=processing`,
    cancel_url: `${origin}/queue/${encodeURIComponent(queueSessionId)}?signalHold=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return {
    url: session.url,
    sessionId: session.id,
    createdAt: new Date(session.created * 1000).toISOString(),
    expiresAt: typeof session.expires_at === "number" ? new Date(session.expires_at * 1000).toISOString() : null,
  };
}

export function isSignalHoldCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.source === SIGNAL_HOLD_SOURCE;
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
