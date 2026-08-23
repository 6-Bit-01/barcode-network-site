import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getLiveOverlayRuntimeState, resetWheelCeremonyStateForNewSession } from "@/lib/live-overlay";
import { attachQueueLiveTiming } from "@/lib/queue-live-timing";
import { resolveQueueArchiveSessionId } from "@/lib/queue-admin-session-target";
import { archiveCurrentQueueSession, clearArchivedQueueSessions, getRadioQueueState, normalizeTrackLimitPerArtist, setQueueOpen, startNewQueueSession, activateQueueSession, updatePriorityUpgradeSettings, updateQueueSessionProvenance, updateRadioTrack, updateSponsorBreakState, updateSubmissionCooldownSettings } from "@/lib/queue";
import { isQueueSessionBnlPublicationStatus, isQueueSessionPurpose } from "@/lib/queue-types";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
  const now = new Date();
  const [state, runtimeState] = await Promise.all([getRadioQueueState(sessionId), getLiveOverlayRuntimeState()]);
  const { playerSync, overlayState } = runtimeState;
  return NextResponse.json(attachQueueLiveTiming(state, playerSync, overlayState, now));
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "setOpen") {
    await setQueueOpen(Boolean(body.isOpen));
    return NextResponse.json(await getRadioQueueState());
  }
  if (body.action === "startSession") {
    if (body.purpose !== undefined && !isQueueSessionPurpose(body.purpose)) {
      return NextResponse.json({ error: "Invalid queue session purpose." }, { status: 400 });
    }
    if (body.bnlPublicationStatus !== undefined && !isQueueSessionBnlPublicationStatus(body.bnlPublicationStatus)) {
      return NextResponse.json({ error: "Invalid BNL publication status." }, { status: 400 });
    }
    if (body.purpose !== "live_broadcast" && body.bnlPublicationStatus !== undefined && body.bnlPublicationStatus !== "private") {
      return NextResponse.json({ error: "Only live broadcast sessions can approve BNL publication." }, { status: 400 });
    }
    const skipGameTapTarget = Number(body.skipGameTapTarget);
    const queueCapacity = Number(body.queueCapacity);
    const submissionCooldownSeconds = Number(body.submissionCooldownSeconds);
    const priorityPriceCents = Number(body.priorityUpgradePriceCents);
    const safePriorityPriceCents = Number.isFinite(priorityPriceCents) ? Math.max(0, Math.round(priorityPriceCents)) : undefined;
    const priorityPaidRequested = body.priorityUpgradesEnabled === true || body.priorityUpgradePaymentsEnabled === true;
    const priorityPaidEnabled = priorityPaidRequested && (safePriorityPriceCents ?? 0) > 0;
    const state = await startNewQueueSession({
      title: typeof body.title === "string" ? body.title : undefined,
      showDate: typeof body.showDate === "string" ? body.showDate : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      purpose: isQueueSessionPurpose(body.purpose) ? body.purpose : undefined,
      bnlPublicationStatus: isQueueSessionBnlPublicationStatus(body.bnlPublicationStatus) ? body.bnlPublicationStatus : undefined,
      trackLimitPerArtist: normalizeTrackLimitPerArtist(body.trackLimitPerArtist),
      queueCapacity: Number.isFinite(queueCapacity) && queueCapacity > 0 ? queueCapacity : undefined,
      skipGameTapTarget: Number.isFinite(skipGameTapTarget) && skipGameTapTarget > 0 ? skipGameTapTarget : undefined,
      submissionCooldownSeconds: Number.isFinite(submissionCooldownSeconds) ? submissionCooldownSeconds : undefined,
      priorityUpgradesEnabled: priorityPaidEnabled,
      priorityUpgradeLabel: typeof body.priorityUpgradeLabel === "string" ? body.priorityUpgradeLabel : undefined,
      priorityUpgradeInstructions: typeof body.priorityUpgradeInstructions === "string" ? body.priorityUpgradeInstructions : undefined,
      priorityUpgradePriceCents: safePriorityPriceCents,
      priorityUpgradeCurrency: typeof body.priorityUpgradeCurrency === "string" ? body.priorityUpgradeCurrency : undefined,
      priorityUpgradePaymentsEnabled: priorityPaidEnabled,
    });
    await resetWheelCeremonyStateForNewSession();
    return NextResponse.json(state);
  }
  if (body.action === "updateSubmissionCooldownSettings") {
    const submissionCooldownSeconds = Number(body.submissionCooldownSeconds);
    return NextResponse.json(await updateSubmissionCooldownSettings({ submissionCooldownSeconds: Number.isFinite(submissionCooldownSeconds) ? submissionCooldownSeconds : undefined }));
  }
  if (body.action === "updateSessionProvenance") {
    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json({ error: "Queue session ID is required." }, { status: 400 });
    }
    if (!isQueueSessionPurpose(body.purpose)) {
      return NextResponse.json({ error: "Invalid queue session purpose." }, { status: 400 });
    }
    if (!isQueueSessionBnlPublicationStatus(body.bnlPublicationStatus)) {
      return NextResponse.json({ error: "Invalid BNL publication status." }, { status: 400 });
    }
    if (body.purpose !== "live_broadcast" && body.bnlPublicationStatus !== "private") {
      return NextResponse.json({ error: "Only live broadcast sessions can approve BNL publication." }, { status: 400 });
    }
    try {
      return NextResponse.json(await updateQueueSessionProvenance({
        sessionId: body.sessionId,
        purpose: body.purpose,
        bnlPublicationStatus: body.bnlPublicationStatus,
      }));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Queue session provenance could not be updated." },
        { status: 404 },
      );
    }
  }
  if (body.action === "updatePriorityUpgradeSettings") {
    const priorityPriceCents = Number(body.priceCents);
    const safePriorityPriceCents = Number.isFinite(priorityPriceCents) ? Math.max(0, Math.round(priorityPriceCents)) : undefined;
    const priorityPaidRequested = body.enabled === true || body.paymentsEnabled === true;
    const priorityPaidEnabled = priorityPaidRequested && (safePriorityPriceCents ?? 0) > 0;
    return NextResponse.json(await updatePriorityUpgradeSettings({
      enabled: priorityPaidEnabled,
      label: typeof body.label === "string" ? body.label : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      priceCents: safePriorityPriceCents,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      paymentsEnabled: priorityPaidEnabled,
    }));
  }
  if (body.action === "updateSponsorBreakState" && ["start", "complete", "skip", "reset"].includes(body.sponsorAction)) return NextResponse.json(await updateSponsorBreakState(body.sponsorAction));
  if (body.action === "archiveSession") {
    try {
      const requestedSessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const current = await getRadioQueueState(requestedSessionId || undefined);
      const targetSessionId = resolveQueueArchiveSessionId(current, requestedSessionId || null);
      if (!targetSessionId) return NextResponse.json(current);
      if (!current.isCurrentSession || current.session?.sessionId !== targetSessionId) {
        await activateQueueSession(targetSessionId);
      }
      return NextResponse.json(await archiveCurrentQueueSession());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Broadcast session could not be ended." },
        { status: 409 },
      );
    }
  }
  if (body.action === "clearArchive") {
    if (body.confirmation !== "Delete the archive") {
      return NextResponse.json({ error: "Confirmation text must exactly match: Delete the archive" }, { status: 400 });
    }
    return NextResponse.json(await clearArchivedQueueSessions());
  }
  if (body.action === "activateSession" && typeof body.sessionId === "string") return NextResponse.json(await activateQueueSession(body.sessionId));
  if (body.action === "viewSession" && typeof body.sessionId === "string") return NextResponse.json(await getRadioQueueState(body.sessionId));
  if (["pullNext", "pullWheelChosen", "pullFreeTransmission", "startShow", "addWheelSpinOwed", "addSimulationFreeTrack", "addSimulationPaidPriority", "addSimulationCheckoutPending", "addSimulationPaymentFailed", "addSimulationHeldPriority", "clearSimulationTracks"].includes(body.action)) return NextResponse.json(await updateRadioTrack("", body.action));
  if (["load", "finish", "skip", "remove", "priority", "regular", "wheel", "moveBack", "spotlight", "removeSpotlight", "restoreRegular", "restorePriority", "markPriorityManual", "markPriorityRequested", "markPriorityCheckoutPending", "pausePriority", "resumePriority"].includes(body.action) && typeof body.id === "string") {
    return NextResponse.json(await updateRadioTrack(body.id, body.action));
  }
  return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
}
