import { PublicIcon } from "@/components/PublicIcon";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — BARCODE Network",
  description:
    "Contact BARCODE Network for support, legal questions, privacy requests, copyright/takedown notices, security reports, and accessibility feedback.",
  alternates: { canonical: "/contact" },
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
    <div className="public-page">
      <section className="public-section">
        <div className="public-container">
          <p className="public-kicker">
            BARCODE NETWORK
          </p>
          <h1 className="public-title">
            Contact
          </h1>
          <p className="public-intro">
            Support, legal questions, privacy requests, copyright/takedown notices,
            security reports, and accessibility feedback all route here.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="public-card">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.3em] text-accent">
              BARCODE Network
            </h2>
            <PublicIcon name="mail" className="public-icon mb-5" />
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

          <div className="public-card">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.3em] text-foreground">
              Contact Reasons
            </h2>
            <ul className="grid gap-3 text-sm text-muted sm:grid-cols-2 sm:text-base">
              {contactReasons.map((reason) => (
                <li key={reason} className="flex items-center gap-3 py-2">
                  <PublicIcon name="check" className="h-4 w-4 shrink-0 text-accent" />{reason}
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
              className="public-button mt-6"
            >
              Legal / Privacy
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
