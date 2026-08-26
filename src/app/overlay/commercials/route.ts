const LOCAL_COMMERCIAL_PLAYER_URL = "http://127.0.0.1:43120/commercials";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Location: LOCAL_COMMERCIAL_PLAYER_URL,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
