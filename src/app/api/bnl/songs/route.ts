import { authenticateBNLJournalRequest } from "@/lib/bnl-journal-contract";
import { proxyMemberSongWorkerRequest } from "@/lib/member-tools";
export const runtime="nodejs"; export const dynamic="force-dynamic";
function handle(request:Request) {
 if(!authenticateBNLJournalRequest(request.headers.get("x-api-key")))return Response.json({code:"AUTH_REQUIRED"},{status:401,headers:{"cache-control":"private, no-store"}});
 return proxyMemberSongWorkerRequest(request);
}
export const GET=handle; export const POST=handle;
