import { proxyMemberAccessRequest } from "@/lib/member-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export function POST(request: Request) { return proxyMemberAccessRequest(request, "owner/accounts/action"); }
