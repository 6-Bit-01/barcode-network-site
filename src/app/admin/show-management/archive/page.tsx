import { AdminQueueArchive } from "@/components/AdminQueueArchive";

export const metadata = {
  title: "Queue Archive | BARCODE Admin",
};

export default function ShowManagementArchivePage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: BARCODE RADIO</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Queue</span> Archive</h1>
          <p className="text-sm text-muted mt-3">Review archived sessions and manage archive cleanup.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <AdminQueueArchive />
      </section>
    </main>
  );
}
