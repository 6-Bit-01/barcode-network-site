import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BroadcastArchive } from "@/components/BroadcastArchive";
import { BroadcastDeck } from "@/components/BroadcastDeck";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import type { BroadcastArchiveView } from "@/lib/broadcast-archive";
import {
  getQueueAdminPreviewReadback,
  getQueueAdminPreviewStats,
  getRadioQueueState,
} from "@/lib/queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Private Broadcast Test | BARCODE Radio Admin",
  description: "Owner-only queue, Broadcast Deck, Archive, and persisted-data verification.",
  robots: { index: false, follow: false, nocache: true },
};

function pageHref(
  sessionId: string,
  surface: "deck" | "archive",
  selection: { view?: BroadcastArchiveView; show?: string; artist?: string } = {},
): string {
  const params = new URLSearchParams({ sessionId, surface });
  if (selection.view) params.set("view", selection.view);
  if (selection.show) params.set("show", selection.show);
  if (selection.artist) params.set("artist", selection.artist);
  return `/admin/queue/broadcast-test?${params.toString()}`;
}

function shortDigest(value: string): string {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

export default async function PrivateBroadcastTestPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string; surface?: string; view?: string; show?: string; artist?: string }>;
}) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !(await verifyAdminToken(token))) redirect("/admin");

  const [state, params] = await Promise.all([getRadioQueueState(), searchParams]);
  const sessions = (state.sessions ?? (state.session ? [state.session] : []))
    .filter((session) => session.purpose !== "live_broadcast");
  const selectedSession = sessions.find((session) => session.sessionId === params.sessionId)
    ?? sessions.find((session) => session.sessionId === state.session?.sessionId)
    ?? sessions[0]
    ?? null;
  const surface = params.surface === "archive" ? "archive" : "deck";
  const initialView: BroadcastArchiveView = params.view === "artists" ? "artists" : "shows";

  const preview = selectedSession
    ? await Promise.all([
      getQueueAdminPreviewStats(selectedSession.sessionId),
      getQueueAdminPreviewReadback(selectedSession.sessionId),
    ])
    : null;
  const stats = preview?.[0] ?? null;
  const readback = preview?.[1] ?? null;
  const digestMatches = Boolean(stats && readback && stats.sourceDigest === readback.sourceDigest);

  const selectedId = selectedSession?.sessionId ?? "";
  const deckHref = selectedId ? pageHref(selectedId, "deck") : "/admin/queue/broadcast-test";
  const archiveHref = selectedId ? pageHref(selectedId, "archive") : "/admin/queue/broadcast-test";
  const previewApi = selectedId ? `/api/admin/queue/broadcast-preview?sessionId=${encodeURIComponent(selectedId)}` : "";
  const queueHref = selectedSession && selectedSession.status !== "archived" && selectedSession.broadcastPhase !== "ended"
    ? `/queue/${encodeURIComponent(selectedSession.sessionId)}`
    : "/admin/queue";

  return (
    <main className="min-h-screen pt-14">
      <section className="border-b-2 border-cyan-200 bg-cyan-200/10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-cyan-200">PRIVATE BROADCAST TEST</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Queue → Deck → Archive verification</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">Run a rehearsal, simulation, or internal test through the real persisted queue. The selected session is readable here, while public queue, Live Now, Broadcast Deck, and Broadcast Archive surfaces remain dark.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/queue" className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Queue Control</Link>
            {selectedId && <Link href={deckHref} className={`${surface === "deck" ? "border-[#ffaa00] bg-[#ffaa00] text-background" : "border-[#ffaa00]/55 text-[#ffaa00]"} border px-3 py-2 text-xs font-black uppercase tracking-widest`}>Deck Preview</Link>}
            {selectedId && <Link href={archiveHref} className={`${surface === "archive" ? "border-violet-300 bg-violet-300 text-background" : "border-violet-300/55 text-violet-200"} border px-3 py-2 text-xs font-black uppercase tracking-widest`}>Archive Preview</Link>}
            {selectedId && queueHref.startsWith("/queue/") && <Link href={queueHref} className="border border-accent px-3 py-2 text-xs font-black uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Test Queue</Link>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 border border-border bg-surface p-4 lg:grid-cols-[minmax(16rem,0.6fr)_minmax(0,1.4fr)] lg:items-end">
          <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input type="hidden" name="surface" value={surface} />
            <label>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.24em] text-muted">Persisted queue session</span>
              <select name="sessionId" defaultValue={selectedId} className="w-full border border-border bg-background px-3 py-3 text-sm text-foreground">
                {sessions.map((session) => <option key={session.sessionId} value={session.sessionId}>{session.showDate} · {session.title} · {session.purpose} · {session.status}</option>)}
              </select>
            </label>
            <button type="submit" className="border border-foreground px-4 py-3 text-xs font-black uppercase tracking-widest text-foreground hover:bg-foreground hover:text-background sm:self-end">Read session</button>
          </form>

          {readback ? <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            <ReadbackMetric label="Store revision" value={readback.storeRevision} />
            <ReadbackMetric label="Saved tracks" value={readback.savedTrackCount} />
            <ReadbackMetric label="Simulation" value={readback.simulationTrackCount} />
            <ReadbackMetric label="Show-log events" value={readback.showLogEventCount} />
          </div> : <p className="text-sm text-muted">No persisted private test sessions are available.</p>}
        </section>

        {readback && stats && <details className="border border-border bg-surface p-4" open>
          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.25em] text-foreground">Persistence readback</summary>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <ReadbackField label="Authority" value={readback.readAuthority} />
            <ReadbackField label="Purpose / status" value={`${readback.sessionPurpose} / ${readback.sessionStatus}`} />
            <ReadbackField label="Provenance revision" value={String(readback.sessionProvenanceRevision)} />
            <ReadbackField label="Digest match" value={digestMatches ? "YES" : "NO — refresh"} tone={digestMatches ? "good" : "bad"} />
            <ReadbackField label="Source updated" value={readback.sourceUpdatedAt} />
            <ReadbackField label="Fresh read" value={readback.readAt} />
            <ReadbackField label="Projection digest" value={shortDigest(stats.sourceDigest)} />
            <ReadbackField label="Public disposition" value={readback.sessionPurpose === "live_broadcast" ? "Live-purpose rules apply" : "Excluded from public surfaces/archive"} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">The digest compares this page&apos;s Archive projection with a separate fresh queue-store read. A mismatch means the queue changed between reads; refresh before treating the evidence as final.</p>
        </details>}

        {!selectedSession || !stats ? (
          <section className="border border-border bg-surface p-8 text-center text-sm text-muted">Create a rehearsal, simulation, or internal-test queue session in Queue Control, then return here.</section>
        ) : surface === "archive" ? (
          <BroadcastArchive
            initialStats={stats}
            initialView={initialView}
            initialShowId={typeof params.show === "string" ? params.show : ""}
            initialArtistKey={typeof params.artist === "string" ? params.artist : ""}
            refreshEndpoint={`${previewApi}&kind=stats`}
            archiveBaseHref={archiveHref}
            deckHref={deckHref}
            queueHref={queueHref}
            previewMode
          />
        ) : (
          <BroadcastDeck
            queueEndpoint={`${previewApi}&kind=snapshot`}
            statsEndpoint={`${previewApi}&kind=stats`}
            archiveHref={archiveHref}
            queueHrefOverride={queueHref}
            previewMode
          />
        )}
      </section>
    </main>
  );
}

function ReadbackMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-background p-3"><p className="text-[9px] uppercase tracking-widest text-muted">{label}</p><p className="mt-2 font-mono text-lg font-black text-foreground">{value}</p></div>;
}

function ReadbackField({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-200" : tone === "bad" ? "text-danger" : "text-foreground";
  return <div className="border border-border bg-background/55 p-3"><p className="text-[9px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-2 break-words font-mono ${toneClass}`}>{value}</p></div>;
}
