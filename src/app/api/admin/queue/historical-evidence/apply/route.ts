import { appendQueueHistoricalEvidence } from "@/lib/queue-historical-evidence-import";

import {
  assertHistoricalEvidenceRequestKeys,
  historicalEvidenceErrorResponse,
  historicalEvidenceJson,
  historicalEvidenceUnauthorizedResponse,
  isHistoricalEvidenceAdmin,
  readHistoricalEvidenceJsonBody,
} from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Keep this gate before body parsing as well as before repository access.
  try {
    if (!(await isHistoricalEvidenceAdmin())) {
      return historicalEvidenceUnauthorizedResponse();
    }
    const body = await readHistoricalEvidenceJsonBody(request);
    assertHistoricalEvidenceRequestKeys(body, [
      "ledger",
      "operatorAttestedEvidenceSha256ById",
      "confirmation",
    ]);
    const result = await appendQueueHistoricalEvidence({
      ledger: body.ledger,
      operatorAttestedEvidenceSha256ById: body.operatorAttestedEvidenceSha256ById,
      confirmation: body.confirmation,
    });
    return historicalEvidenceJson(result, result.appended ? 201 : 200);
  } catch (error) {
    return historicalEvidenceErrorResponse(error);
  }
}
