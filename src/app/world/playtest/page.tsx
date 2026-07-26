import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeWorldGreybox } from "@/components/BarcodeWorldGreybox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BARCODE World Deterministic Greybox",
  description:
    "Private development-only evidence equipment for the Outskirts to Loose Signal BARCODE World slice.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export default function BarcodeWorldPlaytestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BarcodeWorldGreybox />;
}
