"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { MemberAccessNavigation } from "@/components/MemberAccessNavigation";
import { MemberRadioHistory } from "@/components/MemberRadioHistory";

type Member = { id: string; name: string; email: string; emailVerified: boolean };
type Mode = "signin" | "signup" | "recovery" | "reset";
const labels: Record<Mode,string> = { signin:"Sign in", signup:"Create account", recovery:"Recover your account", reset:"Choose a new password" };
const fieldClass = "w-full rounded border border-border bg-background px-3 py-3 text-foreground focus:outline-2 focus:outline-accent";
async function accountRequest(path: string, body?: object, signal?: AbortSignal) {
  const response = await fetch(`/api/member/auth/${path}`, { method:body ? "POST" : "GET", headers:body ? {"content-type":"application/json"} : undefined, body:body ? JSON.stringify(body) : undefined, credentials:"same-origin", cache:"no-store", signal });
  const data = await response.json();
  if (!response.ok) {
    const message = data.code === "NAME_UNAVAILABLE" ? "That display name is unavailable. Choose another name." : data.code === "INVALID_NAME" ? "Use a display name of 1–80 visible characters. Staff and system names are reserved." : response.status === 429 ? "Too many attempts. Please wait before trying again." : data.code === "EMAIL_NOT_VERIFIED" ? "Verify your email before signing in. You can request another link below." : path === "sign-in/email" ? "Unable to sign in. Check your email and password." : response.status >= 500 ? "Accounts are temporarily unavailable. Please try again shortly." : "That request could not be completed. Check your details or request a fresh email link.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}
export function MemberAccount({ initialMode="signin", resetToken }: { initialMode?:Mode; resetToken?:string }) {
  const [mode,setMode] = useState<Mode>(initialMode);
  const [member,setMember] = useState<Member|null>(null);
  const [checking,setChecking] = useState(initialMode !== "reset");
  const [busy,setBusy] = useState(false);
  const [email,setEmail] = useState("");
  const [name,setName] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  useEffect(() => {
    if (initialMode === "reset") return;
    const controller = new AbortController();
    accountRequest("get-session",undefined,controller.signal).then(data => {setMember(data?.user ?? null);setName(data?.user?.name ?? "");}).catch(reason => {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Accounts are temporarily unavailable.");}).finally(() => {if (!controller.signal.aborted) setChecking(false);});
    return () => controller.abort();
  },[initialMode]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);setError("");setMessage("");
    try {await action();} catch(reason) {if (reason instanceof Error && "status" in reason && (reason.status === 401 || reason.status === 403)) {setMember(null);setName("");setPassword("");} setError(reason instanceof Error ? reason.message : "Please try again shortly.");} finally {setBusy(false);}
  }
  async function refresh() {const data=await accountRequest("get-session");setMember(data?.user ?? null);setName(data?.user?.name ?? "");}
  function changeMode(next:Mode) {setMode(next);setPassword("");setMessage("");setError("");}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      if (mode === "signup") {
        await accountRequest("sign-up/email",{email,password,name});setPassword("");setMessage("Check your email for a verification link. Your account activates after you verify your email.");
      } else if (mode === "signin") {
        await accountRequest("sign-in/email",{email,password});setPassword("");await refresh();
      } else if (mode === "recovery") {
        await accountRequest("request-password-reset",{email});setMessage("If this email has an account, we will send a password reset link. Check your inbox and spam folder.");
      } else {
        await accountRequest("reset-password",{token:resetToken,newPassword:password});setPassword("");setMessage("Your password has been reset and previous sessions have been signed out.");setMode("signin");
      }
    });
  }
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-5 sm:p-8" aria-label="BARCODE account">
      <p className="public-kicker">BARCODE Network</p>
      <h1 className="mt-2 text-3xl font-bold">{member ? "Your account" : labels[mode]}</h1>
      <p className="mt-3 text-muted">A private account, activated by email verification. Music submissions remain open to guests.</p>
      <div role="status" aria-live="polite" className="mt-4 text-sm">{checking ? "Checking your session…" : message}</div>
      {error && <p role="alert" className="mt-3 rounded border border-danger p-3 text-sm text-danger">{error}</p>}
      {!checking && member ? (
        <div className="mt-5 space-y-5">
          <p><span className="text-accent">Member · Active</span><br />{member.email}</p>
          <p className="break-all text-xs text-muted">BARCODE ID: {member.id}</p>
          <MemberAccessNavigation key={member.id} memberId={member.id} />
          <MemberRadioHistory key={member.id} memberId={member.id} />
          <form onSubmit={event => {event.preventDefault();void perform(async () => {await accountRequest("update-user",{name});await refresh();setMessage("Display name saved.");});}} className="space-y-3">
            <label className="block text-sm">Display name<input className={`${fieldClass} mt-2`} value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="nickname" /></label>
            <p className="text-xs text-muted">Display names are unique. You can change yours while keeping the same BARCODE ID.</p>
            <button className="btn-primary" disabled={busy}>Save display name</button>
          </form>
          <div className="flex flex-wrap gap-3 border-t border-border pt-5">
            <button className="btn-secondary" disabled={busy} onClick={() => void perform(async () => {await accountRequest("sign-out",{});setMember(null);setMessage("Signed out.");})}>Sign out</button>
            <button className="btn-secondary" disabled={busy} onClick={() => void perform(async () => {await accountRequest("revoke-sessions",{});await accountRequest("sign-out",{});setMember(null);setMessage("All sessions have been signed out.");})}>Sign out all devices</button>
            <button className="btn-secondary" disabled={busy} onClick={() => void perform(async () => {await accountRequest("request-password-reset",{email:member.email});setMessage("If this email has an account, we will send a password reset link.");})}>Reset password</button>
          </div>
          <p className="text-sm text-muted">For account help or a privacy request, <a href="mailto:thebarcodenetwork@gmail.com" className="text-accent underline">contact BARCODE Network</a>.</p>
        </div>
      ) : !checking && (
        <>
          {mode === "reset" && !resetToken ? <p className="mt-4">This reset link is missing or invalid. <Link href="/account" className="text-accent underline">Request a new link</Link>.</p> : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              {mode === "signup" && <label className="block text-sm">Display name<input className={`${fieldClass} mt-2`} value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" maxLength={80} required /></label>}
              {mode === "signup" && <p className="text-xs text-muted">Choose a unique display name. You can change it later; staff and system names are reserved.</p>}
              {mode !== "reset" && <label className="block text-sm">Email<input className={`${fieldClass} mt-2`} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required /></label>}
              {mode !== "recovery" && <label className="block text-sm">{mode === "reset" ? "New password" : "Password"}<input className={`${fieldClass} mt-2`} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signin" ? undefined : 12} maxLength={128} required /></label>}
              {(mode === "signup" || mode === "reset") && <p className="text-xs text-muted">Use at least 12 characters.</p>}
              {mode === "signup" && <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-1" /><span>I am at least 13 and agree to the <Link href="/legal#terms" className="text-accent underline">Terms</Link> and <Link href="/legal#privacy" className="text-accent underline">Privacy Policy</Link>.</span></label>}
              <button className="btn-primary" disabled={busy}>{busy ? "Please wait…" : labels[mode]}</button>
            </form>
          )}
          {mode !== "reset" && <div className="mt-5 flex flex-wrap gap-4 text-sm">
            {mode !== "signin" && <button className="text-accent underline" disabled={busy} onClick={() => changeMode("signin")}>Sign in</button>}
            {mode !== "signup" && <button className="text-accent underline" disabled={busy} onClick={() => changeMode("signup")}>Create account</button>}
            {mode !== "recovery" && <button className="text-accent underline" disabled={busy} onClick={() => changeMode("recovery")}>Forgot password?</button>}
          </div>}
          {mode !== "reset" && <button className="mt-5 text-sm text-accent underline" disabled={busy || !email.trim()} onClick={() => void perform(async () => {await accountRequest("send-verification-email",{email});setMessage("If verification is needed, we will send a fresh link. Check your inbox and spam folder.");})}>Resend verification email</button>}
        </>
      )}
      <p className="mt-6 border-t border-border pt-4 text-xs text-muted">Your account details and security emails stay private. They are excluded from BNL&apos;s public memory and publications.</p>
    </section>
  );
}
