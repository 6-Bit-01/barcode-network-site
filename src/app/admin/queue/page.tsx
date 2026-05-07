/* eslint-disable react/jsx-no-comment-textnodes */
import { AdminRadioQueueControl } from "@/components/AdminRadioQueueControl";

export const metadata = {
  title: "BARCODE Radio Queue Control | Admin",
};

export default function AdminQueuePage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: BARCODE RADIO</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Queue</span> Control</h1>
          <p className="text-sm text-muted mt-3">Live-show lane control, moderation actions, runtime estimates, and source preview player.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <AdminRadioQueueControl />
      </section>
    </main>
  );
}
