import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MemberAccount } from "@/components/MemberAccount";
import { getMemberServiceConfiguration } from "@/lib/member-service";
export default async function AccountPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
 const {error}=await searchParams;
 if((await headers()).get("host") === "barcode-network.com") redirect("https://www.barcode-network.com/account");
 if(!getMemberServiceConfiguration()) return <section className="mx-auto max-w-xl p-6"><h1 className="text-3xl font-bold">Accounts are not available yet</h1><p className="mt-4">You can still participate in BARCODE Radio as a guest.</p><Link href="/radio" className="btn-primary mt-5">BARCODE Radio</Link></section>;
 return <>{error && <p role="alert" className="mx-auto mb-4 max-w-xl rounded border border-danger p-3">That verification link is invalid or expired. Request a fresh link below.</p>}<MemberAccount /></>;
}
