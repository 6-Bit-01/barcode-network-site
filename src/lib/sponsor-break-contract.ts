import type { QueueState } from "./queue-types";

export const SPONSOR_BREAK_DURATION_SECONDS = 11 * 60;

type SponsorBreakQueueState = Pick<QueueState, "session"> | null | undefined;
type LocalCommercialStartResponse = Pick<Response, "ok" | "status">;

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
  if (!response.ok) throw new Error(`Audio Bridge returned ${response.status}`);
  return "started";
}
