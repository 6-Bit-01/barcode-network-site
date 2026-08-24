import type { Metadata } from "next";
import { BroadcastArchive } from "@/components/BroadcastArchive";
import type { BroadcastArchiveView } from "@/lib/broadcast-archive";
import { getPublicQueueStats } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "The Broadcast Archive | BARCODE Radio",
  description: "Search BARCODE Radio after-show history by show, artist, track, submitting TikTok handle, and public music link.",
  alternates: { canonical: "/radio/archive" },
};

export default async function BroadcastArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; show?: string; artist?: string }>;
}) {
  const [stats, params] = await Promise.all([getPublicQueueStats(), searchParams]);
  const initialView: BroadcastArchiveView = params.view === "artists" ? "artists" : "shows";
  return (
    <main className="min-h-screen pt-14">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <BroadcastArchive
          initialStats={stats}
          initialView={initialView}
          initialShowId={typeof params.show === "string" ? params.show : ""}
          initialArtistKey={typeof params.artist === "string" ? params.artist : ""}
        />
      </section>
    </main>
  );
}
