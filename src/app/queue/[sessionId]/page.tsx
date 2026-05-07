/* eslint-disable react/jsx-no-comment-textnodes */
import { PublicQueueSession } from "@/components/PublicQueueSession";

export const metadata = {
  title: "BARCODE Radio Broadcast Queue | BARCODE Network",
};

export default async function QueueSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// BARCODE RADIO</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Broadcast</span> Queue</h1>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <PublicQueueSession sessionId={sessionId} />
      </section>
    </main>
  );
}
