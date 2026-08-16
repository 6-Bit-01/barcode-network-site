/* eslint-disable react/jsx-no-comment-textnodes */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicQueueSession } from "@/components/PublicQueueSession";
import { getPublicQueueSnapshot } from "@/lib/queue";

export const metadata = {
  title: "BARCODE Radio Broadcast Queue | BARCODE Network",
};

export default async function QueueSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const snapshot = await getPublicQueueSnapshot();
  const activeSessionId = snapshot.session.sessionId;
  const hasCurrentActiveSession = snapshot.session.status !== "archived" && snapshot.session.broadcastPhase !== "ended";
  if (!hasCurrentActiveSession) {
    return (
      <main className="pt-14 min-h-screen">
        <section className="border-b border-border noise-bg">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
            <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// BARCODE RADIO</p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Broadcast</span> Queue</h1>
          </div>
        </section>
        <section className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
          <div className="border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted">No active public session is accepting submissions right now.</p>
            <Link href="/queue" className="mt-4 inline-block border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Back to Queue</Link>
          </div>
        </section>
      </main>
    );
  }
  if (sessionId !== activeSessionId) redirect(`/queue/${activeSessionId}`);
  return (
    <main className="pt-14 min-h-screen">
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-0 sm:px-6">
        <PublicQueueSession sessionId={sessionId} />
      </section>
    </main>
  );
}
