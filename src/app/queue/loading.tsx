export default function QueueLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section className="border border-border bg-surface p-6" role="status" aria-live="polite">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Queue signal loading</p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Reading BARCODE Radio queue state</h1>
        <p className="mt-3 text-sm text-muted">The public queue is syncing. This does not mean submissions are closed.</p>
      </section>
    </main>
  );
}
