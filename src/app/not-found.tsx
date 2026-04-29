import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-14 min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-4">
        <div className="font-mono">
          <p className="text-xs uppercase tracking-[0.5em] text-danger mb-4">
            {"// ERROR 404"}
          </p>
          <h1 className="text-6xl font-bold text-foreground mb-2">
            <span className="text-danger text-glow-red">SIGNAL</span> LOST
          </h1>
          <p className="text-sm text-muted mt-4">
            The requested frequency does not exist in our database.
            The transmission may have been redacted, relocated, or was never authorized.
          </p>
        </div>

        <div className="bg-surface border border-border p-4 font-mono text-left">
          <p className="text-xs text-muted mb-2">&gt; BARCODE_NETWORK // ROUTE_LOOKUP</p>
          <p className="text-xs text-danger">&gt; ERROR: PATH_NOT_FOUND</p>
          <p className="text-xs text-muted">&gt; STATUS: 404 // NO MATCH IN ROUTING TABLE</p>
          <p className="text-xs text-accent mt-2">
            &gt; REDIRECTING TO KNOWN FREQUENCIES...<span className="cursor-blink">_</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all text-center"
          >
            Return Home
          </Link>
          <Link
            href="/database"
            className="px-6 py-3 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all text-center"
          >
            Search Database
          </Link>
        </div>
      </div>
    </div>
  );
}
