/* eslint-disable react/jsx-no-comment-textnodes */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicQueueSession } from "@/components/PublicQueueSession";
import { getPublicQueueSnapshot } from "@/lib/queue";
import { queuePublicSnapshotIsArchived } from "@/lib/queue-public-view-state";

export const metadata = {
  title: "BARCODE Radio Broadcast Queue | BARCODE Network",
};

function isMissingQueueSession(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "queue_session_not_found");
}

function isQueueReadUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "queue_storage_configuration_invalid" || code === "queue_storage_unavailable" || code === "queue_state_unavailable" || code === "queue_state_conflict";
}

function activeSessionId(snapshot: Awaited<ReturnType<typeof getPublicQueueSnapshot>>): string | null {
  if (!snapshot.session || queuePublicSnapshotIsArchived(snapshot)) return null;
  return snapshot.session.sessionId;
}

function EmptyQueueSessionPage() {
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
          <p className="text-sm text-muted">No public session exists at this address right now.</p>
          <Link href="/queue" className="mt-4 inline-block border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Back to Queue</Link>
        </div>
      </section>
    </main>
  );
}

function QueueSessionShell({ sessionId }: { sessionId: string }) {
  return (
    <main className="pt-14 min-h-screen">
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-0 sm:px-6">
        <PublicQueueSession sessionId={sessionId} />
      </section>
    </main>
  );
}

export default async function QueueSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  let snapshot: Awaited<ReturnType<typeof getPublicQueueSnapshot>>;
  try {
    snapshot = await getPublicQueueSnapshot(sessionId);
  } catch (error) {
    if (isQueueReadUnavailable(error)) return <QueueSessionShell sessionId={sessionId} />;
    if (!isMissingQueueSession(error)) throw error;
    let currentSnapshot: Awaited<ReturnType<typeof getPublicQueueSnapshot>>;
    try {
      currentSnapshot = await getPublicQueueSnapshot();
    } catch (currentError) {
      if (isQueueReadUnavailable(currentError)) return <QueueSessionShell sessionId={sessionId} />;
      throw currentError;
    }
    const currentSessionId = activeSessionId(currentSnapshot);
    if (currentSessionId) redirect(`/queue/${currentSessionId}`);
    return <EmptyQueueSessionPage />;
  }

  if (!snapshot.session) return <EmptyQueueSessionPage />;
  if (!queuePublicSnapshotIsArchived(snapshot)) {
    let currentSnapshot: Awaited<ReturnType<typeof getPublicQueueSnapshot>>;
    try {
      currentSnapshot = await getPublicQueueSnapshot();
    } catch (error) {
      if (isQueueReadUnavailable(error)) return <QueueSessionShell sessionId={sessionId} />;
      throw error;
    }
    const currentSessionId = activeSessionId(currentSnapshot);
    if (currentSessionId && currentSessionId !== sessionId) redirect(`/queue/${currentSessionId}`);
  }
  return <QueueSessionShell sessionId={sessionId} />;
}
