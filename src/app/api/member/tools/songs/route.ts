import { proxyMemberSongRequest } from "@/lib/member-tools";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export const GET=(request:Request)=>proxyMemberSongRequest(request);
export const POST=(request:Request)=>proxyMemberSongRequest(request);
