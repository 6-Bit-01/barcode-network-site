import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import {
  PRIORITY_SIGNAL_RECOVERY_WINDOW,
  PrioritySignalRecoveryInventoryError,
  listPrioritySignalRecoveryCheckoutSessions,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const PRIORITY_SIGNAL_SOURCE = "barcode-radio-priority-signal";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    return NextResponse.json({
      error: "Stripe is not configured.",
      reason: "stripe_not_configured",
      readOnly: true,
      complete: false,
      partialResultsReturned: false,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }

  if (!/^(?:sk|rk)_live_/.test(stripeKey)) {
    return NextResponse.json({
      error: "Live Stripe is not configured.",
      reason: "stripe_live_mode_not_configured",
      readOnly: true,
      complete: false,
      partialResultsReturned: false,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const inventory = await listPrioritySignalRecoveryCheckoutSessions();
    return NextResponse.json({
      readOnly: true,
      complete: true,
      truncated: false,
      source: PRIORITY_SIGNAL_SOURCE,
      window: PRIORITY_SIGNAL_RECOVERY_WINDOW,
      sessionListCalls: inventory.sessionListCalls,
      lineItemListCalls: inventory.lineItemListCalls,
      count: inventory.sessions.length,
      sessions: inventory.sessions,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({
      error: "Priority Signal recovery inventory could not be collected.",
      reason: "stripe_inventory_unavailable",
      readOnly: true,
      complete: false,
      partialResultsReturned: false,
      sessionListCalls: error instanceof PrioritySignalRecoveryInventoryError ? error.sessionListCalls : null,
      lineItemListCalls: error instanceof PrioritySignalRecoveryInventoryError ? error.lineItemListCalls : null,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
