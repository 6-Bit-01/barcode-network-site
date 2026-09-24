import Link from "next/link";
import { DiscordConnection } from "@/components/DiscordConnection";

export const metadata = { title: "Connect Discord | BARCODE Network", robots: { index: false, follow: false } };
export default async function DiscordConnectionPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const messages: Record<string, string> = {
    cancelled: "Connection cancelled. You can keep submitting music without it.",
    expired: "That connection attempt expired or was already used. Please start again.",
    unavailable: "Discord connection could not be completed. Please try again.",
  };
  return <main className="mx-auto min-h-[65vh] max-w-2xl space-y-5 px-4 pb-12 pt-24">
    <p className="text-xs uppercase tracking-widest text-accent">BARCODE Network</p>
    <h1 className="text-3xl font-bold">Connect with the community</h1>
    {messages[result ?? ""] && <p role="status" className="text-muted">{messages[result ?? ""]}</p>}
    <DiscordConnection />
    <Link href="/radio/deck" className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4">Return to the Broadcast Deck →</Link>
  </main>;
}
