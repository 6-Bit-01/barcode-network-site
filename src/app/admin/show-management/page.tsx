/* eslint-disable react/jsx-no-comment-textnodes */
import { AdminShowManagement } from "@/components/AdminShowManagement";

export const metadata = {
  title: "Show Management | BARCODE Admin",
};

export default function ShowManagementPage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: BARCODE RADIO</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Show</span> Management</h1>
          <p className="text-sm text-muted mt-3">Start sessions, open submissions, and review archived show queues.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <AdminShowManagement />
      </section>
    </main>
  );
}
