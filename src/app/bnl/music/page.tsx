import { BNLDiscography } from "@/components/BNLDiscography";
import { listPublicBallads } from "@/lib/bnl-ballads-store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "BNL-01 Discography",
  description: "The released music of BNL-01: songs, creative direction, credits and the broadcasts behind the work.",
  alternates: { canonical: "/bnl/music" },
};

export default async function BNLDiscographyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [catalog, params] = await Promise.all([
    listPublicBallads().then(releases => ({ releases, unavailable: false })).catch(() => ({ releases: [], unavailable: true })),
    searchParams,
  ]);
  return <BNLDiscography {...catalog} query={typeof params.q === "string" ? params.q.slice(0, 200) : ""} />;
}
