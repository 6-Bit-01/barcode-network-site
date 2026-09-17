import Link from "next/link";
import { redirect } from "next/navigation";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
export const dynamic = "force-dynamic";
export const metadata = { title: "Broadcast Ballads | BNL-01", description: "BNL-01 turns BARCODE Radio broadcasts into original songs. Find each released Ballad with its show in the Broadcast Archive." };
export default async function BroadcastBallads({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  if (show) redirect(`${broadcastArchiveShowHref(show)}#broadcast-ballad`);
  return <main className="mx-auto min-h-screen max-w-3xl px-4 pb-20 pt-28"><p className="text-xs uppercase tracking-widest text-accent">Written by BNL-01</p><h1 className="mt-4 text-4xl font-black text-foreground">Broadcast Ballads</h1><p className="mt-5 text-lg leading-relaxed text-muted">Every broadcast leaves something behind. BNL turns its music, moments and community stories into an original song.</p><p className="mt-4 text-sm leading-relaxed text-muted">Each released Ballad belongs to its broadcast. Open a show in the Broadcast Archive and look for “This broadcast’s Ballad” to listen, read the lyrics and explore the artists behind the references.</p><Link href="/radio/archive" className="mt-8 inline-block rounded border border-accent px-5 py-3 font-bold text-accent">Explore the Broadcast Archive →</Link></main>;
}
