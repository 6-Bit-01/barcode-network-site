"use client";
import Link from "next/link";
export default function AccountError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Account access is temporarily unavailable</h1><p className="mt-4">Your changes have not been confirmed. Please retry or return to your account.</p><div className="mt-5 flex gap-3"><button className="btn-primary" onClick={reset}>Retry</button><Link href="/account" className="btn-secondary">My account</Link></div></section>;
}
