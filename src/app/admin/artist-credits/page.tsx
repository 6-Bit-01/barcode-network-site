import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";
import { ArtistCreditReview } from "@/components/ArtistCreditReview";
export const metadata = { title: "Artist credit corrections | BARCODE Admin" };
export default function ArtistCreditsPage() { return <main className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-28"><OwnerWorkspaceNavigation section="artists" tool="Artist credit corrections" /><ArtistCreditReview /></main>; }
