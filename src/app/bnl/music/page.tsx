import { BNLDiscography } from "@/components/BNLDiscography";
import { catalogFilters } from "@/lib/ballad-catalog";
import { listPublicBallads } from "@/lib/bnl-ballads-store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "BNL-01 Discography",
  description: "The released music of BNL-01: songs, creative direction, credits and the broadcasts behind the work.",
  alternates: { canonical: "/bnl/music" },
};

export default async function BNLDiscographyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [catalog, params] = await Promise.all([
    listPublicBallads().then(releases => ({ releases, unavailable: false })).catch(() => ({ releases: [], unavailable: true })),
    searchParams,
  ]);
  return <BNLDiscography {...catalog} filters={catalogFilters(params)} />;
}
