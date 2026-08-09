import { isQueueProductionEnabled } from "./queue-production";
import { queueSessionBnlPublicationAccess } from "./queue-types";
import type { QueueSessionSummary } from "./queue-types";

export function isForegroundQueueProjectionPublic(
  env: NodeJS.ProcessEnv,
  session: Pick<QueueSessionSummary, "purpose" | "bnlPublicationStatus"> | null | undefined,
): boolean {
  return isQueueProductionEnabled(env) && queueSessionBnlPublicationAccess(session).publicCopyCandidates;
}
