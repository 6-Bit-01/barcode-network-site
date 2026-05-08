/* eslint-disable react/jsx-no-comment-textnodes */
import { PublicQueueGateway } from "@/components/PublicQueueGateway";

export const metadata = {
  title: "BARCODE Radio Queue | BARCODE Network",
  description: "BARCODE Radio public queue gateway.",
};

export default function QueuePage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">// BARCODE RADIO</p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground mb-4"><span className="text-accent text-glow">Queue</span> Gateway</h1>
          <p className="max-w-2xl text-sm sm:text-base text-muted">Waiting room for the current BARCODE Radio broadcast queue. Submissions unlock only when admin opens the session.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <PublicQueueGateway />
      </section>
    </main>
  );
}
