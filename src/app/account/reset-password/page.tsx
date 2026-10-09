import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MemberAccount } from "@/components/MemberAccount";
import { getMemberServiceConfiguration } from "@/lib/member-service";
export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
 const {token}=await searchParams;
 if((await headers()).get("host") === "barcode-network.com") redirect(`https://www.barcode-network.com/account/reset-password${typeof token === "string" ? `?token=${encodeURIComponent(token)}` : ""}`);
 if(!getMemberServiceConfiguration()) return <p className="mx-auto max-w-xl">Accounts are temporarily unavailable. Please try again shortly.</p>;
 return <MemberAccount initialMode="reset" resetToken={typeof token==="string"&&/^[A-Za-z0-9_-]{1,512}$/.test(token)?token:undefined} />;
}
