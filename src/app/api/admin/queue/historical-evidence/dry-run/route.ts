import { buildQueueHistoricalEvidenceImportPlan } from "@/lib/queue-historical-evidence-repository";

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
  // Authentication deliberately precedes request-body parsing and every Blob
  // call. An unauthorized caller cannot make this endpoint consume a body or
  // probe whether the private repository is configured.
  try {
    if (!(await isHistoricalEvidenceAdmin())) {
      return historicalEvidenceUnauthorizedResponse();
    }
    const body = await readHistoricalEvidenceJsonBody(request);
    assertHistoricalEvidenceRequestKeys(body, ["ledger", "operatorAttestedEvidenceSha256ById"]);
    const plan = await buildQueueHistoricalEvidenceImportPlan({
      ledger: body.ledger,
      operatorAttestedEvidenceSha256ById: body.operatorAttestedEvidenceSha256ById,
    });
    return historicalEvidenceJson(plan);
  } catch (error) {
    return historicalEvidenceErrorResponse(error);
  }
}
