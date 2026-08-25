/* eslint-disable react/jsx-no-comment-textnodes */
import Link from "next/link";
import { AdminRadioQueueControl } from "@/components/AdminRadioQueueControl";

export const metadata = {
  title: "BARCODE Radio Queue Control | Admin",
};

export default function AdminQueuePage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">// ADMIN: BARCODE RADIO</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Queue</span> Control</h1>
              <p className="text-xs text-muted mt-1">Live-show lane control, moderation actions, runtime estimates, and source preview player.</p>
            </div>
            <Link href="/admin/queue/broadcast-test" className="border border-cyan-200/55 px-3 py-2 text-center text-xs font-black uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background">Private Broadcast Test</Link>
          </div>
        </div>
      </section>
      <section className="w-full max-w-none px-4 sm:px-6 py-5">
        <AdminRadioQueueControl />
      </section>
    </main>
  );
}
