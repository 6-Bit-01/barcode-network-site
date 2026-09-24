import { createDiscordConnectionService } from "@/lib/discord-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return createDiscordConnectionService().get(request); }
export async function POST(request: Request) { return createDiscordConnectionService().post(request); }
