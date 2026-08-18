import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeWorldCardBattle } from "@/components/BarcodeWorldCardBattle";
import { shouldHideBarcodeWorldPlaytest } from "@/lib/barcode-world/playtest-access.mjs";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  if (shouldHideBarcodeWorldPlaytest()) {
    return {
      title: "Not Found",
      robots: {
        index: false,
        follow: false,
        noarchive: true,
        nocache: true,
      },
    };
  }
  return {
    title: "Three-Route Theater · Private BARCODE World v0.3",
    description:
      "Private, deterministic BARCODE World prototype linking reusable card categories to one readable battle theater.",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default function BarcodeWorldPlaytestPage() {
  if (shouldHideBarcodeWorldPlaytest()) {
    notFound();
  }

  return <BarcodeWorldCardBattle />;
}
