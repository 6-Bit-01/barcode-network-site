import type { Metadata } from "next";
import { BroadcastDeck } from "@/components/BroadcastDeck";

export const metadata: Metadata = {
  title: "The Broadcast Deck | BARCODE Radio",
  description: "The live BARCODE Radio show companion for Now Playing, the queue feed, Wheel movement, show progress, and your browser's submissions.",
  alternates: { canonical: "/radio/deck" },
};

export default function BroadcastDeckPage() {
  return (
    <main className="min-h-screen pt-14">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <BroadcastDeck />
      </section>
    </main>
  );
}
