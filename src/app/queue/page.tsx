/* eslint-disable react/jsx-no-comment-textnodes */
import { RadioQueueForm } from "@/components/RadioQueueForm";

export const metadata = {
  title: "BARCODE Radio Queue | BARCODE Network",
  description: "Submit a track to the BARCODE Radio live queue.",
};

export default function QueuePage() {
  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">// BARCODE RADIO</p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground mb-4"><span className="text-accent text-glow">Live Queue</span> Intake</h1>
          <p className="max-w-2xl text-sm sm:text-base text-muted">Submit a link or upload an MP3/WAV for the weekly BARCODE Radio control room. New tracks enter the Regular Queue.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <RadioQueueForm />
      </section>
    </main>
  );
}
