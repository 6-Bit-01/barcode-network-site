import type { QueueState } from "./queue-types";

export const SPONSOR_BREAK_DURATION_SECONDS = 11 * 60;

type SponsorBreakQueueState = Pick<QueueState, "session"> | null | undefined;
type LocalCommercialStartResponse = Pick<Response, "ok" | "status"> & Partial<Pick<Response, "json">>;

class ConfirmedCommercialRejection extends Error {}

async function playerReply(response: LocalCommercialStartResponse): Promise<Record<string, unknown>> {
  const body: unknown = await response.json?.().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function playerMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === "string" && body.message.trim()
    ? body.message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 600)
    : fallback;
}

export async function requireLocalCommercialPlayer(
  probe: () => Promise<LocalCommercialStartResponse>,
): Promise<void> {
  const response = await probe();
  const body = await playerReply(response);
  if (response.status === 404 || body.protocol !== "barcode_commercial_start_v1") throw new Error("Update the separate BARCODE Commercial Player to 1.0.25 or later, then retry. The sponsor timer was not started.");
  if (!response.ok || body.ready !== true || body.playerConnected !== true) throw new Error(playerMessage(body, `Commercial Player preflight returned ${response.status}`));
}

export function isSponsorBreakStartAcknowledged(state: SponsorBreakQueueState): boolean {
  const session = state?.session;
  if (session?.sponsorBreakStatus !== "running") return false;
  if (typeof session.sponsorBreakStartedAt !== "string" || !session.sponsorBreakStartedAt.trim()) return false;
  return Number.isFinite(Date.parse(session.sponsorBreakStartedAt));
}

export async function launchLocalCommercialBreakIfAcknowledged(
  state: SponsorBreakQueueState,
  launch: () => Promise<LocalCommercialStartResponse>,
): Promise<"not_acknowledged" | "started"> {
  if (!isSponsorBreakStartAcknowledged(state)) return "not_acknowledged";
  const response = await launch();
  const body = await playerReply(response);
  if (!response.ok && body.started === false) throw new ConfirmedCommercialRejection(playerMessage(body, `Commercial Player returned ${response.status}`));
  if (!response.ok || body.started !== true) throw new Error(playerMessage(body, `Commercial Player did not confirm playback (HTTP ${response.status}).`));
  return "started";
}

export async function startSponsorBreakWithLocalPlayer(input: {
  probe: () => Promise<LocalCommercialStartResponse>;
  startWebsite: () => Promise<SponsorBreakQueueState>;
  launch: () => Promise<LocalCommercialStartResponse>;
  cancelRejectedStart: (attempt: { sessionId: string; startedAt: string }) => Promise<SponsorBreakQueueState>;
}): Promise<"not_acknowledged" | "started"> {
  try {
    await requireLocalCommercialPlayer(input.probe);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "Commercial Player is unavailable."} No sponsor timer was started. Check the separate Commercial Player and its saved Studio source.`);
  }
  const state = await input.startWebsite();
  if (!isSponsorBreakStartAcknowledged(state)) return "not_acknowledged";
  try {
    return await launchLocalCommercialBreakIfAcknowledged(state, input.launch);
  } catch (error) {
    let timerCancelled = false;
    if (error instanceof ConfirmedCommercialRejection && state?.session?.sessionId && state.session.sponsorBreakStartedAt) {
      const repaired = await input.cancelRejectedStart({ sessionId: state.session.sessionId, startedAt: state.session.sponsorBreakStartedAt }).catch(() => null);
      timerCancelled = repaired?.session?.sessionId === state.session.sessionId && !repaired.session.sponsorBreakStartedAt && repaired.session.sponsorBreakStatus !== "running";
    }
    const detail = error instanceof Error ? error.message : "Commercial Player did not confirm playback.";
    throw new Error(timerCancelled
      ? `${detail} The rejected start's sponsor timer was cancelled. Correct the player issue and retry.`
      : `${detail} The website timer is still running or its state is uncertain. Check the existing commercial source before retrying or resetting the sponsor timer.`);
  }
}
