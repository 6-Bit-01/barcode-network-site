import { proxyMemberArtistRequest } from "@/lib/member-artists";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return proxyMemberArtistRequest(request, "owner/artists/action"); }
