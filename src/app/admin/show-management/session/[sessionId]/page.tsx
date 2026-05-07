/* eslint-disable react/jsx-no-comment-textnodes */
import { AdminFinishedSessionReview } from "@/components/AdminFinishedSessionReview";

export const metadata = {
  title: "Finished Session Review | BARCODE Admin",
};

export default async function FinishedSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: BARCODE RADIO</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Finished</span> Session</h1>
          <p className="text-sm text-muted mt-3">Read-only session report, song records, submitter contacts, and export access.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <AdminFinishedSessionReview sessionId={sessionId} />
      </section>
    </main>
  );
}
