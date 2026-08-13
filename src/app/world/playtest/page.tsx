import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeWorldCardBattle } from "@/components/BarcodeWorldCardBattle";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  if (process.env.NODE_ENV === "production") {
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
    title: "Four-Lane Card Battle · Private BARCODE World Battle Mode Proof",
    description:
      "Private, deterministic, resettable, noncanonical BARCODE World card-battle prototype.",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default function BarcodeWorldPlaytestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BarcodeWorldCardBattle />;
}
