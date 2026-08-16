import {
  getQueueHistoricalEvidenceChainSummary,
} from "@/lib/queue-historical-evidence-repository";

import {
  historicalEvidenceErrorResponse,
  historicalEvidenceJson,
  historicalEvidenceUnauthorizedResponse,
  isHistoricalEvidenceAdmin,
} from "./_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    if (!(await isHistoricalEvidenceAdmin())) {
      return historicalEvidenceUnauthorizedResponse();
    }
    return historicalEvidenceJson(await getQueueHistoricalEvidenceChainSummary());
  } catch (error) {
    return historicalEvidenceErrorResponse(error);
  }
}
