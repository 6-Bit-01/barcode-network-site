import { BNLBalladWorkspace } from "@/components/BNLBalladWorkspace";
export const metadata = { title: "BNL Broadcast Ballads | BARCODE Admin" };
export default async function BalladAdmin({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  return <main className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-28 sm:px-6"><BNLBalladWorkspace initialShowId={show} /></main>;
}
