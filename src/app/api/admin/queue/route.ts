import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { archiveCurrentQueueSession, getRadioQueueState, setQueueOpen, startNewQueueSession, activateQueueSession, updatePriorityUpgradeSettings, updateRadioTrack, updateSubmissionCooldownSettings } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
  return NextResponse.json(await getRadioQueueState(sessionId));
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "setOpen") {
    await setQueueOpen(Boolean(body.isOpen));
    return NextResponse.json(await getRadioQueueState());
  }
  if (body.action === "startSession") {
    const trackLimitPerArtist = Number(body.trackLimitPerArtist);
    const skipGameTapTarget = Number(body.skipGameTapTarget);
    const queueCapacity = Number(body.queueCapacity);
    const submissionCooldownSeconds = Number(body.submissionCooldownSeconds);
    const priorityPriceCents = Number(body.priorityUpgradePriceCents);
    const safePriorityPriceCents = Number.isFinite(priorityPriceCents) ? Math.max(0, Math.round(priorityPriceCents)) : undefined;
    const priorityPaidRequested = body.priorityUpgradesEnabled === true || body.priorityUpgradePaymentsEnabled === true;
    const priorityPaidEnabled = priorityPaidRequested && (safePriorityPriceCents ?? 0) > 0;
    return NextResponse.json(await startNewQueueSession({
      title: typeof body.title === "string" ? body.title : undefined,
      showDate: typeof body.showDate === "string" ? body.showDate : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      trackLimitPerArtist: Number.isFinite(trackLimitPerArtist) && trackLimitPerArtist > 0 ? trackLimitPerArtist : undefined,
      queueCapacity: Number.isFinite(queueCapacity) && queueCapacity > 0 ? queueCapacity : undefined,
      skipGameTapTarget: Number.isFinite(skipGameTapTarget) && skipGameTapTarget > 0 ? skipGameTapTarget : undefined,
      submissionCooldownSeconds: Number.isFinite(submissionCooldownSeconds) ? submissionCooldownSeconds : undefined,
      priorityUpgradesEnabled: priorityPaidEnabled,
      priorityUpgradeLabel: typeof body.priorityUpgradeLabel === "string" ? body.priorityUpgradeLabel : undefined,
      priorityUpgradeInstructions: typeof body.priorityUpgradeInstructions === "string" ? body.priorityUpgradeInstructions : undefined,
      priorityUpgradePriceCents: safePriorityPriceCents,
      priorityUpgradeCurrency: typeof body.priorityUpgradeCurrency === "string" ? body.priorityUpgradeCurrency : undefined,
      priorityUpgradePaymentsEnabled: priorityPaidEnabled,
    }));
  }
  if (body.action === "updateSubmissionCooldownSettings") {
    const submissionCooldownSeconds = Number(body.submissionCooldownSeconds);
    return NextResponse.json(await updateSubmissionCooldownSettings({ submissionCooldownSeconds: Number.isFinite(submissionCooldownSeconds) ? submissionCooldownSeconds : undefined }));
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
  if (body.action === "archiveSession") return NextResponse.json(await archiveCurrentQueueSession());
  if (body.action === "activateSession" && typeof body.sessionId === "string") return NextResponse.json(await activateQueueSession(body.sessionId));
  if (body.action === "viewSession" && typeof body.sessionId === "string") return NextResponse.json(await getRadioQueueState(body.sessionId));
  if (["pullNext", "startShow", "addWheelSpinOwed", "addSimulationFreeTrack", "addSimulationPaidPriority", "addSimulationCheckoutPending", "addSimulationPaymentFailed", "addSimulationHeldPriority", "clearSimulationTracks"].includes(body.action)) return NextResponse.json(await updateRadioTrack("", body.action));
  if (["load", "finish", "remove", "priority", "regular", "wheel", "moveBack", "spotlight", "removeSpotlight", "restoreRegular", "restorePriority", "markPriorityManual", "markPriorityRequested", "markPriorityCheckoutPending", "pausePriority", "resumePriority"].includes(body.action) && typeof body.id === "string") {
    return NextResponse.json(await updateRadioTrack(body.id, body.action));
  }
  return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
}
