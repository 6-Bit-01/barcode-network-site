import Link from "next/link";
import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Legal / Privacy — BARCODE Network",
  description:
    "BARCODE Network Legal Center, including Terms of Use, Queue Submission Terms, Priority Signal Terms, Privacy Policy, copyright, security, accessibility, and contact information.",
};

const legalDocumentPath = path.join(
  process.cwd(),
  "docs/legal/BARCODE_NETWORK_LEGAL_CENTER_2026-06-13.md",
);

const anchorByHeading: Record<string, string> = {
  "Terms of Use": "terms",
  "Queue Submission Terms": "queue-submission",
  "Priority Signal Terms": "priority-signal",
  "Privacy Policy": "privacy",
  "Copyright / Takedown Policy": "copyright",
  "Security Contact / Responsible Disclosure": "security",
  "Accessibility Statement": "accessibility",
  "Dimensional Operating Conditions": "dimensional-operating-conditions",
  Contact: "contact",
};

const legalNavigation = [
  ["Terms", "#terms"],
  ["Queue Submission", "#queue-submission"],
  ["Priority Signal", "#priority-signal"],
  ["Privacy", "#privacy"],
  ["Copyright", "#copyright"],
  ["Security", "#security"],
  ["Accessibility", "#accessibility"],
  ["Dimensional Conditions", "#dimensional-operating-conditions"],
  ["Contact", "#contact"],
];

function stripMarkdown(text: string) {
  return text.replace(/\*\*/g, "").trim();
}

function slugify(text: string) {
  return stripMarkdown(text)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headingId(text: string) {
  const cleanText = stripMarkdown(text);
  return anchorByHeading[cleanText] ?? slugify(cleanText);
}

function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }

      return part;
    });
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${index}`} className="my-10 border-border" />);
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = stripMarkdown(headingMatch[2]);
      const id = headingId(text);

      if (level === 1) {
        blocks.push(
          <h1
            key={`heading-${index}`}
            id={id}
            className="scroll-mt-28 pt-6 text-2xl font-bold uppercase tracking-[0.18em] text-accent sm:text-4xl"
          >
            {text}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2
            key={`heading-${index}`}
            id={id}
            className="scroll-mt-28 pt-8 text-xl font-bold uppercase tracking-[0.12em] text-foreground sm:text-2xl"
          >
            {text}
          </h2>,
        );
      } else {
        blocks.push(
          <h3
            key={`heading-${index}`}
            id={id}
            className="scroll-mt-28 pt-6 text-base font-bold uppercase tracking-[0.1em] text-foreground"
          >
            {text}
          </h3>,
        );
      }

      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      const startIndex = index;

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }

      blocks.push(
        <ul
          key={`list-${startIndex}`}
          className="ml-5 list-disc space-y-2 text-sm leading-7 text-muted sm:text-base"
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    const startIndex = index;

    while (index < lines.length) {
      const paragraphLine = lines[index].trim();

      if (
        !paragraphLine ||
        /^#{1,4}\s+/.test(paragraphLine) ||
        paragraphLine.startsWith("- ") ||
        /^-{3,}$/.test(paragraphLine)
      ) {
        break;
      }

      paragraphLines.push(paragraphLine.replace(/ {2}$/, ""));
      index += 1;
    }

    blocks.push(
      <p
        key={`paragraph-${startIndex}`}
        className="text-sm leading-7 text-muted sm:text-base"
      >
        {renderInline(paragraphLines.join(" "))}
      </p>,
    );
  }

  return blocks;
}

function readLegalDocument() {
  return readFileSync(legalDocumentPath, "utf8");
}

export default function LegalPage() {
  const legalMarkdown = readLegalDocument();

  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
          <p className="mb-4 text-xs uppercase tracking-[0.5em] text-muted">
            BARCODE NETWORK
          </p>
          <h1 className="max-w-4xl text-3xl font-black uppercase tracking-[0.16em] text-foreground sm:text-5xl">
            Legal / Privacy
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
            Terms, queue submission rules, Priority Signal terms, privacy,
            copyright, security, accessibility, dimensional operating conditions,
            and contact information.
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-surface/40">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-5 sm:px-6">
          {legalNavigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="border border-border px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <article className="mx-auto max-w-5xl space-y-5 px-4 py-12 sm:px-6 sm:py-16">
          {renderMarkdown(legalMarkdown)}
        </article>
      </section>
    </div>
  );
}
