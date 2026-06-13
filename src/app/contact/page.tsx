import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — BARCODE Network",
  description:
    "Contact BARCODE Network for support, legal questions, privacy requests, copyright/takedown notices, security reports, and accessibility feedback.",
};

const contactReasons = [
  "Support",
  "Legal questions",
  "Privacy requests",
  "Copyright / takedown notices",
  "Security reports",
  "Accessibility feedback",
];

export default function ContactPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
          <p className="mb-4 text-xs uppercase tracking-[0.5em] text-muted">
            BARCODE NETWORK
          </p>
          <h1 className="max-w-4xl text-3xl font-black uppercase tracking-[0.16em] text-foreground sm:text-5xl">
            Contact
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
            Support, legal questions, privacy requests, copyright/takedown notices,
            security reports, and accessibility feedback all route here.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_1.2fr]">
          <div className="border border-border bg-surface p-6 sm:p-8">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.3em] text-accent">
              BARCODE Network
            </h2>
            <address className="not-italic text-sm leading-7 text-muted sm:text-base">
              10650 SE 174th St
              <br />
              Renton, WA 98055
              <br />
              <a
                href="mailto:thebarcodenetwork@gmail.com"
                className="text-accent underline-offset-4 hover:underline"
              >
                thebarcodenetwork@gmail.com
              </a>
            </address>
          </div>

          <div className="border border-border bg-background p-6 sm:p-8">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.3em] text-foreground">
              Contact Reasons
            </h2>
            <ul className="grid gap-3 text-sm text-muted sm:grid-cols-2 sm:text-base">
              {contactReasons.map((reason) => (
                <li key={reason} className="border border-border bg-surface/60 p-3">
                  {reason}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-7 text-muted">
              For terms, queue submission rules, Priority Signal terms, privacy,
              copyright, security, accessibility, and dimensional operating
              conditions, review the Legal Center.
            </p>
            <Link
              href="/legal"
              className="mt-6 inline-flex border border-accent px-4 py-3 text-xs uppercase tracking-[0.25em] text-accent transition-colors hover:bg-accent hover:text-background"
            >
              Legal / Privacy
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
