"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BNLRelayTimestamp, formatTransmissionTime } from "@/components/BNLRelayTimestamp";
import { clearTerminalSession } from "@/components/TerminalLogin";
import { useBNLStatus } from "@/components/useBNLStatus";

export type ArchiveDossier = { id: string; name: string; category: string; status: string; role: string; clearance: string; origin: string; summary: string; tags: string[]; slug: string };
export type ArchiveTransmission = { slug: string; title: string; date: string; author: string; excerpt: string; tags: string[] };
export type ArchiveRelease = { title: string; date: string; status: string; description: string };
export type ArchiveRadio = { description: string; schedule: { day: string; queueOpens: string; showBegins: string; firstTrack: string; notice: string }; links: { radio: string; submit: string; submitLabel: string; submitExternal: boolean; discord: string; live: string } };
export type ArchiveStats = { totalCount: number; activeCount: number; restrictedCount: number; publicCount: number };
export type ArchiveBNLRelay = { message: string; currentDirective: string; publishedAt: string };
export type ArchiveBNLJournalEntry = { entryId: string; entryKind: string; title: string; excerpt: string; publishedAt: string; href: string };
export type ArchivePayload = { dossiers: ArchiveDossier[]; transmissions: ArchiveTransmission[]; releases: ArchiveRelease[]; radio: ArchiveRadio; stats: ArchiveStats; bnl: { relays: ArchiveBNLRelay[]; relaysUnavailable: boolean; journalEntries: ArchiveBNLJournalEntry[]; journalUnavailable: boolean } };

type Entry = { id: number; command?: string; node: ReactNode; variant?: "normal" | "breach"; liveStatus?: boolean };
const buttons = ["HELP", "MAP", "ORIGINS", "STATUS", "BNL-01", "RELAYS", "BNL LOG", "BNL HUB", "DATABASE", "WHOIS 6 BIT", "TRANSMISSIONS", "RADIO", "RELEASES", "CLEAR", "LOCK"];
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const seq = () => Math.floor(Date.now() / 1000).toString(16).toUpperCase();

export function NetworkArchiveTerminal({ archive, restored, onLock }: { archive: ArchivePayload; restored: boolean; onLock: () => void }) {
  const { data: bnl, loading } = useBNLStatus();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>(() => [{ id: 1, node: <Intro archive={archive} restored={restored} /> }]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(2);
  const [scrollVersion, setScrollVersion] = useState(0);

  const bnlDossier = useMemo(() => archive.dossiers.find((d) => d.id === "BNL-01" || d.name.toUpperCase().includes("BNL-01")), [archive.dossiers]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      outputEndRef.current?.scrollIntoView({
        block: "end",
        behavior: reduceMotion ? "instant" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollVersion]);

  function push(command: string | undefined, node: ReactNode, variant: Entry["variant"] = "normal") {
    const id = idRef.current++;
    setEntries((prev) => [...prev, { id, command, node, variant, liveStatus: Boolean(command && ["STATUS", "BNL", "BNL-01"].includes(normalize(command))) }]);
    setScrollVersion((version) => version + 1);
  }

  function execute(raw: string) {
    const command = normalize(raw);
    if (!command) return;
    setHistory((prev) => [raw.trim(), ...prev.filter((item) => item !== raw.trim())].slice(0, 20));
    setHistoryIndex(null);
    setInput("");
    if (command === "CLEAR") { setEntries([{ id: idRef.current++, node: <Intro archive={archive} restored={false} compact /> }]); setScrollVersion((version) => version + 1); return; }
    if (command === "LOCK") { clearTerminalSession(); onLock(); return; }
    if (command === "HELP" || command === "?") return push(raw, <Help />);
    if (command === "MAP") return push(raw, <Map />);
    if (command === "ORIGINS") return push(raw, <Origins transmissions={archive.transmissions} />);
    if (command === "TRACE BNL-01" || command === "BNL-01" || command === "BNL") return push(raw, <TraceBNL data={bnl} loading={loading} dossier={bnlDossier} />);
    if (command === "LIST RELAYS" || command === "RELAYS") return push(raw, <RelayList relays={archive.bnl.relays} unavailable={archive.bnl.relaysUnavailable} />);
    if (command === "BNL LOG") return push(raw, <BNLLog entries={archive.bnl.journalEntries} unavailable={archive.bnl.journalUnavailable} />);
    if (command === "BNL HUB") return push(raw, <BNLHub />);
    if (command === "STATUS") return push(raw, <Status data={bnl} loading={loading} dossier={bnlDossier} />);
    if (command === "DATABASE" || command === "LIST DOSSIERS") return push(raw, <Database dossiers={archive.dossiers} stats={archive.stats} />);
    if (command.startsWith("WHOIS ")) return push(raw, <Whois query={raw.trim().slice(6)} dossiers={archive.dossiers} />);
    if (command.startsWith("SEARCH ")) return push(raw, <Search query={raw.trim().slice(7)} dossiers={archive.dossiers} transmissions={archive.transmissions} />);
    if (command === "TRANSMISSIONS" || command === "LIST TRANSMISSIONS") return push(raw, <Transmissions transmissions={archive.transmissions} />);
    if (command === "RADIO") return push(raw, <Radio radio={archive.radio} />);
    if (command === "RELEASES") return push(raw, <Releases releases={archive.releases} />);
    if (command === "BREACH") return push(raw, <Breach release={archive.releases.find((r) => r.title === "BARCODE: Signal Breach")} />, "breach");
    push(raw, <Block title="COMMAND NOT RECOGNIZED"><p>Command not recognized. Type HELP for public archive commands.</p></Block>);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") { event.preventDefault(); const next = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1); setHistoryIndex(next); setInput(history[next] ?? ""); }
    if (event.key === "ArrowDown") { event.preventDefault(); if (historyIndex === null) return; const next = historyIndex - 1; setHistoryIndex(next < 0 ? null : next); setInput(next < 0 ? "" : history[next] ?? ""); }
  }

  function onSubmit(event: FormEvent) { event.preventDefault(); execute(input); }

  return <div className="network-archive mx-auto flex h-[calc(100dvh-7rem)] min-h-[420px] max-h-[900px] max-w-7xl flex-col overflow-hidden border border-border bg-background/95 font-mono shadow-2xl shadow-black/40 max-[380px]:h-[calc(100dvh-5.5rem)] max-[380px]:min-h-[360px]">
    <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3">
      <div><p className="text-xs uppercase tracking-[0.35em] text-muted">BARCODE Network Archive Terminal</p><h1 className="text-lg font-bold uppercase tracking-[0.2em] text-foreground">Public Records Console</h1></div>
      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-widest"><span className="text-muted">PUBLIC OBSERVER</span><span className="flex items-center gap-2 text-accent"><span className="h-2 w-2 rounded-full bg-accent animate-status-blink" />BNL {loading ? "SYNC" : bnl.status}</span><button onClick={() => execute("LOCK")} className="border border-border px-3 py-2 text-muted hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/60">Lock Session</button></div>
    </div>
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex-none overflow-hidden border-b border-border bg-surface/30 p-3 md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r"><p className="mb-3 text-xs uppercase tracking-[0.3em] text-muted">Archive Index</p><div className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">{buttons.map((cmd) => <button key={cmd} onClick={() => execute(cmd)} className="shrink-0 border border-border bg-background/50 px-3 py-2 text-left text-xs uppercase tracking-wider text-foreground/75 transition hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/60">{cmd}</button>)}</div></aside>
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Terminal output">
        <div ref={outputRef} aria-live="polite" className="terminal-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain p-4 text-sm leading-relaxed sm:p-6">
          {entries.map((entry) => <section key={entry.id} className={`archive-output-reveal border-l pl-4 ${entry.variant === "breach" ? "border-red-500/60 bg-red-950/10" : "border-accent/25"}`}>{entry.command && <p className="mb-2 text-xs uppercase tracking-widest text-accent/80">[{seq()}] &gt; {entry.command}</p>}{entry.liveStatus ? <Status data={bnl} loading={loading} dossier={bnlDossier} /> : entry.node}</section>)}
          <div ref={outputEndRef} aria-hidden="true" />
        </div>
        <form onSubmit={onSubmit} className="flex-none border-t border-border bg-surface/70 p-3"><label htmlFor="archive-command" className="sr-only">Archive command</label><div className="flex items-center gap-2"><span className="text-accent">&gt;</span><input id="archive-command" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Type HELP, SEARCH signal, WHOIS EN-001..." className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40" /><button className="border border-accent/50 px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background focus:outline-none focus:ring-2 focus:ring-accent/60">Enter</button></div></form>
      </section>
    </div>
  </div>;
}

function Block({ title, children }: { title: string; children: ReactNode }) { return <div><h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-foreground">{title}</h2><div className="space-y-2 text-foreground/70">{children}</div></div>; }
function Intro({ archive, restored, compact = false }: { archive: ArchivePayload; restored: boolean; compact?: boolean }) { return <Block title={restored ? "SESSION RESTORED // PUBLIC OBSERVER" : "PUBLIC ARCHIVE SESSION ACTIVE"}><p>{compact ? "Visible history cleared. Prompt ready." : "Observer access accepted. Public dossiers, transmissions, releases, Radio records, and BNL relay status are indexed here."}</p><p className="text-muted">Indexed: {archive.stats.totalCount} dossiers {"//"} {archive.transmissions.length} transmissions {"//"} {archive.releases.length} releases. One unindexed node is detectable.</p><p>Type HELP or use the command buttons.</p></Block>; }
function Help() { return <Block title="HELP"><p>Type a command and press Enter, or use the touch commands. Commands are case-insensitive; extra spaces are ignored. Up/Down recalls command history.</p><p>Primary commands: HELP, MAP, ORIGINS, STATUS, TRACE BNL-01, LIST RELAYS, BNL LOG, BNL HUB, DATABASE, WHOIS &lt;name or ID&gt;, SEARCH &lt;term&gt;, TRANSMISSIONS, RADIO, RELEASES, CLEAR, LOCK.</p></Block>; }
function Map() { return <Block title="NETWORK MAP"><ul className="list-disc space-y-1 pl-5"><li>BARCODE: original four-member creative source.</li><li>BARCODE Network: apparatus and expanding world.</li><li>BARCODE Radio: live public broadcast.</li><li>Database: indexed people, entities, programs, and interfaces.</li><li>BNL-01: active liaison and relay layer.</li></ul></Block>; }
function Origins({ transmissions }: { transmissions: ArchiveTransmission[] }) { const signal = transmissions.find((t) => t.slug === "signal-origins"); return <Block title="ORIGINS // LAYERED RECORD"><h3 className="text-accent">CONFIRMED:</h3><ul className="list-disc pl-5"><li>BARCODE began as the four-member digital hip-hop collective of 6 Bit, DJ Floppydisc, Cache Back, and Mac Modem.</li><li>The music and original collective predate BARCODE Network.</li><li>The Network grew around the releases, live broadcasts, community, software, characters, and story.</li><li>6 Bit predates the Network infrastructure.</li></ul><h3 className="pt-2 text-yellow-400/80">DISPUTED:</h3><ul className="list-disc pl-5"><li>Network files conflict about how 6 Bit persists through the current system.</li><li>Some records describe acquisition or integration.</li><li>Their timestamps contradict the confirmed chronology.</li><li>These records remain unverified.</li></ul>{signal && <Link className="text-accent underline" href={`/transmissions/${signal.slug}`}>Open Signal Origins transmission →</Link>}</Block>; }
function lastTransmission(value: string | null) { return value ? formatTransmissionTime(value) : "No public transmission time is available."; }
function Status({ data, loading, dossier }: { data: import("@/components/bnl-status").BNLStatus; loading: boolean; dossier?: ArchiveDossier }) { return <Block title="BNL-01 // PUBLIC SIGNAL"><dl className="grid gap-2 sm:grid-cols-2"><KV k="link state" v={loading ? "Syncing public relay" : data.status} /><KV k="surface reading" v={data.message ?? "No public surface reading."} /><KV k="network posture" v={data.currentDirective ?? "No public network posture."} /><KV k="last transmission" v={lastTransmission(data.lastSeen)} /></dl>{dossier && <Link className="text-accent underline" href={`/database/${dossier.slug}`}>Open BNL dossier →</Link>}</Block>; }
function TraceBNL({ data, loading, dossier }: { data: import("@/components/bnl-status").BNLStatus; loading: boolean; dossier?: ArchiveDossier }) { return <Block title="TRACE BNL-01"><p>BNL-01 watches the public movement around BARCODE—what the community is discussing, what keeps returning, and what changes around the show—then turns what matters into relays and Journal entries.</p><dl className="grid gap-2 sm:grid-cols-2"><KV k="link state" v={loading ? "Syncing public relay" : data.status} /><KV k="surface reading" v={data.message ?? "No public surface reading."} /><KV k="network posture" v={data.currentDirective ?? "No public network posture."} /><KV k="last transmission" v={lastTransmission(data.lastSeen)} /></dl><p className="flex flex-wrap gap-3"><Link className="text-accent underline" href="/bnl">BNL-01 Hub</Link><a className="text-accent underline" href="https://discord.gg/barcode" target="_blank" rel="noreferrer">Talk with BNL in Discord</a><Link className="text-accent underline" href="/radio">BARCODE Radio</Link>{dossier && <Link className="text-accent underline" href={`/database/${dossier.slug}`}>BNL dossier</Link>}</p><p>Terminal reads approved public records. Speaking with BNL happens in Discord.</p></Block>; }
function RelayList({ relays, unavailable }: { relays: ArchiveBNLRelay[]; unavailable: boolean }) { if (unavailable) return <Block title="LIST RELAYS"><p>Public relay history is unavailable right now. Try again after the next sync.</p></Block>; if (!relays.length) return <Block title="LIST RELAYS"><p>No public BNL-01 relays have been published yet.</p></Block>; return <Block title="LIST RELAYS"><div className="space-y-4">{relays.slice(0, 20).map((entry, index) => <div key={`${entry.publishedAt}-${index}`}><p className="text-accent">Relay {index + 1} // <BNLRelayTimestamp value={entry.publishedAt} /></p><p>Surface reading: {entry.message}</p><p>Network posture: {entry.currentDirective}</p></div>)}</div></Block>; }
function BNLLog({ entries, unavailable }: { entries: ArchiveBNLJournalEntry[]; unavailable: boolean }) { if (unavailable) return <Block title="BNL LOG"><p>Public Journal entries are unavailable right now. Try again after the next sync.</p><Link className="text-accent underline" href="/journal">Open full Journal →</Link></Block>; if (!entries.length) return <Block title="BNL LOG"><p>No public Journal entries have been published yet.</p><Link className="text-accent underline" href="/journal">Open full Journal →</Link></Block>; return <Block title="BNL LOG"><div className="space-y-4">{entries.map((entry) => <div key={entry.entryId}><p className="text-accent">{entry.entryKind} // <BNLRelayTimestamp value={entry.publishedAt} /></p><p>{entry.title}</p><p>{entry.excerpt}</p><Link className="text-accent underline" href={entry.href}>Open entry →</Link></div>)}</div><Link className="text-accent underline" href="/journal">Open full Journal →</Link></Block>; }
function BNLHub() { return <Block title="BNL HUB"><p>The BNL-01 Hub is the site home for current signal, recent relays, Journal paths, Discord, Radio, Terminal, and dossier navigation.</p><Link className="text-accent underline" href="/bnl">Open BNL-01 Hub →</Link></Block>; }
function KV({ k, v }: { k: string; v: string }) { return <div><dt className="text-xs uppercase tracking-widest text-muted">{k}</dt><dd className="text-foreground/80">{v}</dd></div>; }
function Database({ dossiers, stats }: { dossiers: ArchiveDossier[]; stats: ArchiveStats }) { return <Block title="DATABASE // PUBLIC DOSSIERS"><p>{stats.totalCount} public entries indexed. Active: {stats.activeCount}. Public clearance: {stats.publicCount}. Restricted dossiers are public-facing summaries only.</p><div className="space-y-2">{dossiers.map((d) => <p key={d.id}><Link className="text-accent underline" href={`/database/${d.slug}`}>{d.id}</Link> {"//"} {d.name} {"//"} {d.category} {"//"} {d.status} {"//"} {d.role}</p>)}</div></Block>; }
function Whois({ query, dossiers }: { query: string; dossiers: ArchiveDossier[] }) { const q = query.toLowerCase().trim(); const matches = dossiers.filter((d) => d.id.toLowerCase() === q || d.name.toLowerCase() === q); const partial = matches.length ? matches : dossiers.filter((d) => `${d.id} ${d.name}`.toLowerCase().includes(q)); if (!q) return <Block title="WHOIS"><p>Usage: WHOIS &lt;name or ID&gt;</p></Block>; if (partial.length === 0) return <Block title="RECORD NOT FOUND"><p>No public dossier matched “{query}”. Try SEARCH {query}.</p></Block>; if (partial.length > 1 && matches.length === 0) return <Block title="MULTIPLE MATCHES">{partial.map((d) => <p key={d.id}>{d.id} {"//"} {d.name} {"//"} <Link className="text-accent underline" href={`/database/${d.slug}`}>open dossier</Link></p>)}</Block>; const d = partial[0]; return <Block title={`WHOIS ${d.id}`}><dl className="grid gap-2 sm:grid-cols-2"><KV k="name" v={d.name} /><KV k="category" v={d.category} /><KV k="role" v={d.role} /><KV k="status" v={d.status} /><KV k="clearance" v={d.clearance} /><KV k="origin" v={d.origin} /></dl><p>{d.summary}</p><Link className="text-accent underline" href={`/database/${d.slug}`}>Open full dossier →</Link></Block>; }
function Search({ query, dossiers, transmissions }: { query: string; dossiers: ArchiveDossier[]; transmissions: ArchiveTransmission[] }) { const q = query.toLowerCase().trim(); const ds = dossiers.filter((d) => [d.id, d.name, d.role, d.summary, ...d.tags].join(" ").toLowerCase().includes(q)).slice(0, 6); const ts = transmissions.filter((t) => [t.title, t.excerpt, t.author, ...t.tags].join(" ").toLowerCase().includes(q)).slice(0, 6); return <Block title="SEARCH RESULTS"><p>Query: {query || "EMPTY"}</p><h3 className="text-accent">DOSSIERS</h3>{ds.length ? ds.map((d) => <p key={d.id}>{d.id} {"//"} <Link className="text-accent underline" href={`/database/${d.slug}`}>{d.name}</Link> {"//"} {d.role}</p>) : <p>No dossier results.</p>}<h3 className="pt-2 text-accent">TRANSMISSIONS</h3>{ts.length ? ts.map((t) => <p key={t.slug}>TX {"//"} <Link className="text-accent underline" href={`/transmissions/${t.slug}`}>{t.title}</Link> {"//"} {t.excerpt}</p>) : <p>No transmission results.</p>}</Block>; }
function Transmissions({ transmissions }: { transmissions: ArchiveTransmission[] }) { return <Block title="TRANSMISSION ARCHIVE">{transmissions.map((t) => <p key={t.slug}><Link className="text-accent underline" href={`/transmissions/${t.slug}`}>{t.title}</Link> {"//"} {t.date} {"//"} {t.author}<br /><span className="text-muted">{t.excerpt}</span></p>)}</Block>; }
function Radio({ radio }: { radio: ArchiveRadio }) { return <Block title="BARCODE RADIO"><p>{radio.description}</p><p>{radio.schedule.day}: queue opens {radio.schedule.queueOpens}; show begins {radio.schedule.showBegins}; first track {radio.schedule.firstTrack}. {radio.schedule.notice}</p><p className="flex flex-wrap gap-3"><Link className="text-accent underline" href={radio.links.radio}>/radio</Link>{radio.links.submitExternal ? <a className="text-accent underline" href={radio.links.submit} target="_blank" rel="noreferrer">{radio.links.submitLabel}</a> : <Link className="text-accent underline" href={radio.links.submit}>{radio.links.submitLabel}</Link>}<a className="text-accent underline" href={radio.links.discord} target="_blank" rel="noreferrer">Discord</a><a className="text-accent underline" href={radio.links.live} target="_blank" rel="noreferrer">Live platform</a></p></Block>; }
function Releases({ releases }: { releases: ArchiveRelease[] }) { return <Block title="RELEASE CATALOG">{releases.map((r) => <p key={r.title}>{r.title} {"//"} {r.date} {"//"} {r.status}<br /><span className="text-muted">{r.description}</span></p>)}<Link className="text-accent underline" href="/releases">Open releases →</Link></Block>; }
function Breach({ release }: { release?: ArchiveRelease }) { return <Block title="SIGNAL BREACH // UNINDEXED FRAGMENT"><p className="text-red-300">██ record was not part of the public index ██ checksum degraded ██</p><p>{release?.title ?? "BARCODE: Signal Breach"}</p><p className="text-foreground/70">{release?.description ?? "Release description unavailable."}</p><Link className="text-accent underline" href="/releases">Open releases →</Link></Block>; }
