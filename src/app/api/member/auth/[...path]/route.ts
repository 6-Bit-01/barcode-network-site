import { proxyMemberRequest } from "@/lib/member-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyMemberRequest(request, path.join("/"));
}
export const GET = handler;
export const POST = handler;
