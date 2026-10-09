import { getMemberRadioHistoryResponse } from "@/lib/member-radio-routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) { return getMemberRadioHistoryResponse(request); }
