"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberAccessNavigation, fetchCurrentMemberAccess } from "@/components/MemberAccessNavigation";
import { MemberRadioHistory } from "@/components/MemberRadioHistory";
import { MEMBER_TERMS_VERSION } from "@/lib/member-terms";

type Member = { id: string; name: string; email: string; emailVerified: boolean };
type Mode = "signin" | "signup" | "recovery" | "reset";
type SignupStep = "details" | "terms" | "verification";
const labels: Record<Mode,string> = { signin:"Sign in", signup:"Create account", recovery:"Recover your account", reset:"Choose a new password" };
const pendingLabels: Record<Mode,string> = { signin:"Signing in…", signup:"Creating account…", recovery:"Requesting reset link…", reset:"Saving new password…" };
const buttonClass = "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass = `${buttonClass} border-accent bg-accent text-background hover:bg-accent-dim disabled:hover:bg-accent`;
const selectedChoiceClass = `${buttonClass} border-accent bg-accent/10 text-accent hover:bg-accent/15`;
const secondaryButtonClass = `${buttonClass} border-border-light bg-background text-foreground hover:border-accent hover:bg-surface-light disabled:hover:border-border-light disabled:hover:bg-background`;
const fieldClass = "w-full rounded-lg border border-border-light bg-background px-3 py-3 text-foreground focus:outline-2 focus:outline-accent disabled:opacity-60";
async function accountRequest(path: string, body?: object, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Account request cancelled.");
  const response = await fetch(`/api/member/auth/${path}`, { method:body ? "POST" : "GET", headers:body ? {"content-type":"application/json"} : undefined, body:body ? JSON.stringify(body) : undefined, credentials:"same-origin", cache:"no-store", signal });
  const data = await response.json();
  if (signal?.aborted) throw new Error("Account request cancelled.");
  if (!response.ok) {
    const message = data.code === "ACCOUNT_TERMS_REQUIRED" ? "Please review the current Terms and confirm you are at least 13 before creating an account." : data.code === "NAME_UNAVAILABLE" ? "That display name is unavailable. Choose another name." : data.code === "INVALID_NAME" ? "Use a display name of 1–80 visible characters. Staff and system names are reserved." : response.status === 429 ? "Too many attempts. Please wait before trying again." : data.code === "EMAIL_NOT_VERIFIED" ? "Verify your email before signing in. You can request another link below." : path === "sign-in/email" ? "Unable to sign in. Check your email and password." : response.status >= 500 ? "Accounts are temporarily unavailable. Please try again shortly." : "That request could not be completed. Check your details or request a fresh email link.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}
export function MemberAccount({ initialMode="signin", resetToken }: { initialMode?:Mode; resetToken?:string }) {
  const router = useRouter();
  const [mode,setMode] = useState<Mode>(initialMode);
  const [signupStep,setSignupStep] = useState<SignupStep>("details");
  const [termsAccepted,setTermsAccepted] = useState(false);
  const [member,setMember] = useState<Member|null>(null);
  const [checking,setChecking] = useState(initialMode !== "reset");
  const [pending,setPending] = useState("");
  const [email,setEmail] = useState("");
  const [name,setName] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const actionPending = useRef(false);
  const currentAction = useRef<AbortController|null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = Boolean(pending);
  const awaitingVerification = mode === "signup" && signupStep === "verification";
  useEffect(() => () => {
    currentAction.current?.abort();currentAction.current=null;actionPending.current=false;
  },[]);
  useEffect(() => {
    if (initialMode === "reset") return;
    const controller = new AbortController();
    accountRequest("get-session",undefined,controller.signal).then(data => {if (controller.signal.aborted) return;setMember(data?.user ?? null);setName(data?.user?.name ?? "");}).catch(reason => {if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Accounts are temporarily unavailable.");}).finally(() => {if (!controller.signal.aborted) setChecking(false);});
    return () => controller.abort();
  },[initialMode]);
  useEffect(() => {
    if (!checking) heading.current?.focus();
  },[checking,mode,signupStep,member?.id]);
  function isCurrentAction(signal: AbortSignal) {return !signal.aborted && currentAction.current?.signal === signal;}
  async function perform(pendingMessage: string, action: (signal: AbortSignal) => Promise<void>) {
    if (actionPending.current) return;
    const controller=new AbortController();currentAction.current=controller;
    actionPending.current=true;setPending(pendingMessage);setError("");setMessage("");
    try {await action(controller.signal);} catch(reason) {
      if (!isCurrentAction(controller.signal)) return;
      if (reason instanceof Error && "status" in reason && (reason.status === 401 || reason.status === 403)) {setMember(null);setName("");setPassword("");}
      setError(reason instanceof Error ? reason.message : "Please try again shortly.");
    } finally {
      if (currentAction.current === controller) {currentAction.current=null;actionPending.current=false;if (!controller.signal.aborted) setPending("");}
    }
  }
  async function refresh(signal: AbortSignal): Promise<Member|null> {
    const data=await accountRequest("get-session",undefined,signal);
    if (!isCurrentAction(signal)) return null;
    const currentMember=data?.user ?? null;setMember(currentMember);setName(currentMember?.name ?? "");return currentMember;
  }
  function changeMode(next:Mode) {if (actionPending.current || mode === next) return;setMode(next);setSignupStep("details");setTermsAccepted(false);setPassword("");setMessage("");setError("");}
  function resendVerification() {void perform("Requesting verification link…",async signal => {await accountRequest("send-verification-email",{email},signal);setMessage("Verification link requested. If verification is needed, check your inbox and spam folder.");});}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionPending.current || awaitingVerification) return;
    if (mode === "signup" && signupStep === "details") {
      setSignupStep("terms");setTermsAccepted(false);setMessage("");setError("");
      return;
    }
    if (mode === "signup" && !termsAccepted) {
      setError("Please review the current Terms and confirm you are at least 13 before creating an account.");
      return;
    }
    await perform(pendingLabels[mode],async signal => {
      if (mode === "signup") {
        await accountRequest("sign-up/email",{email,password,name,termsAccepted:true,termsVersion:MEMBER_TERMS_VERSION},signal);
        setPassword("");setTermsAccepted(false);setSignupStep("verification");setMessage("Signup request complete. Check your email for the next step.");
      } else if (mode === "signin") {
        await accountRequest("sign-in/email",{email,password},signal);setPassword("");
        const currentMember=await refresh(signal);
        if (!isCurrentAction(signal)) return;
        if (!currentMember) throw new Error("Your session could not be confirmed. Please sign in again.");
        setPending("Checking dashboard access…");
        const access=await fetchCurrentMemberAccess(currentMember.id,signal);
        if (!isCurrentAction(signal)) return;
        const dashboard=access?.access.owner ? "/account/owner" : access?.access.crew ? "/account/crew" : null;
        if (dashboard) {
          setMessage(`Signed in. Opening your ${access?.access.owner ? "Owner" : "Crew"} dashboard…`);
          router.replace(dashboard);
        } else {
          setMessage(access ? "Signed in. Your account is ready." : "Signed in. Your account is ready. Dashboard access could not be confirmed; try refreshing this page.");
        }
      } else if (mode === "recovery") {
        await accountRequest("request-password-reset",{email},signal);setMessage("Reset link requested. If this email has an account, check your inbox and spam folder.");
      } else {
        await accountRequest("reset-password",{token:resetToken,newPassword:password},signal);setPassword("");setMessage("Your password has been reset and previous sessions have been signed out.");setMode("signin");
      }
    });
  }
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-5 sm:p-8" aria-label="BARCODE account" aria-busy={busy || checking}>
      <p className="public-kicker">BARCODE Network</p>
      <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold focus:outline-none">{member ? "Your account" : awaitingVerification ? "Check your email" : mode === "signup" && signupStep === "terms" ? "Before you join the Network" : labels[mode]}</h1>
      <p id="account-help" className="mt-3 text-sm text-foreground/80">A private account, activated by email verification. Music submissions remain open to guests.</p>
      {!checking && member && <MemberAccessNavigation key={member.id} memberId={member.id} />}
      {!checking && !member && mode !== "reset" && !awaitingVerification && <div aria-label="Account access" className="mt-5 grid grid-cols-2 gap-3">
        <p className="col-span-2 text-xs font-semibold text-foreground/80">Choose how to continue</p>
        <button type="button" className={mode === "signin" ? selectedChoiceClass : secondaryButtonClass} aria-pressed={mode === "signin"} disabled={busy} onClick={() => changeMode("signin")}>Sign in</button>
        <button type="button" className={mode === "signup" ? selectedChoiceClass : secondaryButtonClass} aria-pressed={mode === "signup"} disabled={busy} onClick={() => changeMode("signup")}>Create account</button>
      </div>}
      {!checking && !member && mode === "signup" && <ol aria-label="Create account progress" className="mt-5 grid grid-cols-3 gap-2 text-xs">
        {([["details","1 · Details"],["terms","2 · Terms"],["verification","3 · Verify email"]] as const).map(([step,label]) => <li key={step} aria-current={signupStep === step ? "step" : undefined} className={`rounded border px-2 py-2 ${signupStep === step ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border-light text-foreground/70"}`}>{label}</li>)}
      </ol>}
      <div role="status" aria-live="polite" aria-atomic="true" className={`mt-4 text-sm ${(checking || pending || message) ? "rounded-lg border border-accent/40 bg-accent/5 p-3 text-foreground" : ""}`}>{checking ? "Checking your session…" : pending || message}</div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}
      {!checking && member ? (
        <div className="mt-5 space-y-5">
          <p><span className="text-accent">Member · Active</span><br />{member.email}</p>
          <p className="break-all text-xs text-muted">BARCODE ID: {member.id}</p>
          <MemberRadioHistory key={member.id} memberId={member.id} />
          <form onSubmit={event => {event.preventDefault();void perform("Saving display name…",async signal => {await accountRequest("update-user",{name},signal);await refresh(signal);if (!isCurrentAction(signal)) return;setMessage("Display name saved.");});}} className="space-y-3">
            <label className="block text-sm">Display name<input className={`${fieldClass} mt-2`} value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoComplete="nickname" disabled={busy} /></label>
            <p className="text-xs text-muted">Display names are unique. You can change yours while keeping the same BARCODE ID.</p>
            <button type="submit" className={primaryButtonClass} disabled={busy}>{pending === "Saving display name…" ? pending : "Save display name"}</button>
          </form>
          <div className="flex flex-wrap gap-3 border-t border-border pt-5">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void perform("Signing out…",async signal => {await accountRequest("sign-out",{},signal);setMember(null);setMessage("Signed out.");})}>{pending === "Signing out…" ? pending : "Sign out"}</button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void perform("Signing out all devices…",async signal => {await accountRequest("revoke-sessions",{},signal);await accountRequest("sign-out",{},signal);setMember(null);setMessage("All sessions have been signed out.");})}>{pending === "Signing out all devices…" ? pending : "Sign out all devices"}</button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void perform("Requesting reset link…",async signal => {await accountRequest("request-password-reset",{email:member.email},signal);setMessage("Reset link requested. If this email has an account, check your inbox and spam folder.");})}>{pending === "Requesting reset link…" ? pending : "Reset password"}</button>
          </div>
          <p className="text-sm text-muted">For account help or a privacy request, <a href="mailto:thebarcodenetwork@gmail.com" className="text-accent underline">contact BARCODE Network</a>.</p>
        </div>
      ) : !checking && (
        <>
          {awaitingVerification ? <div className="mt-5 space-y-4 rounded-lg border border-border-light bg-background p-4">
            <p className="text-sm">If this address can be registered, check <strong className="break-all">{email}</strong> for a verification link. Your account activates only after you open a valid link.</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground/80"><li>Check your inbox and spam folder.</li><li>Open the verification link to activate your account.</li><li>Return here and sign in.</li></ol>
            <p className="text-sm text-foreground/80">Already have an account? Sign in, or use Forgot password if you need a reset link.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => changeMode("signin")}>Sign in</button>
              <button type="button" className={secondaryButtonClass} disabled={busy || !email.trim()} onClick={resendVerification}>{pending === "Requesting verification link…" ? pending : "Request another verification link"}</button>
            </div>
            <p className="text-xs text-foreground/70">No link yet? You can request another above or <a href="mailto:thebarcodenetwork@gmail.com" className="text-accent underline">contact BARCODE Network</a>.</p>
          </div> : mode === "reset" && !resetToken ? <p className="mt-4">This reset link is missing or invalid. <Link href="/account" className="text-accent underline">Request a new link</Link>.</p> : (
            <form onSubmit={submit} aria-describedby="account-help" className="mt-5 space-y-4">
              {mode === "signup" && signupStep === "terms" ? (
                <>
                  <p className="rounded-lg border border-border-light bg-background p-3 text-sm">Reviewing Terms for <strong className="break-all">{email}</strong>. Select the agreement below, then create your account.</p>
                  <p className="text-sm">By signing up, you agree to the <Link href="/legal#terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">Terms of Use</Link> and acknowledge the <Link href="/legal#privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">Privacy Policy</Link>.</p>
                  <div className="space-y-3 rounded border border-border p-4 text-sm">
                    <p>One account. Several timelines. Verify your email in this one.</p>
                    <p>Your music stays yours. No interdimensional ownership transfer.</p>
                    <p className="text-muted">Member, Artist, Crew and Owner approvals are separate. Creating an account does not grant Artist, Crew or Owner access.</p>
                    <p className="text-muted">Do not share passwords or recovery links with BNL.</p>
                  </div>
                  <p className="text-xs text-muted">Terms version {MEMBER_TERMS_VERSION}. Read the <Link href="/legal#dimensional-operating-conditions" target="_blank" rel="noopener noreferrer" className="text-accent underline">Dimensional Operating Conditions</Link> for the Network&apos;s interdimensional fine print.</p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-light p-4 text-sm"><input type="checkbox" required className="mt-1 size-5 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" checked={termsAccepted} disabled={busy} onChange={event => {setTermsAccepted(event.target.checked);setError("");}} /><span>I confirm I am at least 13, agree to the Terms of Use and acknowledge the Privacy Policy.</span></label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="submit" className={primaryButtonClass} disabled={busy || !termsAccepted}>{busy ? pending : "Agree and create account"}</button>
                    <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => {setSignupStep("details");setTermsAccepted(false);setMessage("");setError("");}}>Back to account details</button>
                  </div>
                </>
              ) : (
                <>
                  {mode === "signup" && <p className="text-sm text-foreground/80">Start with your details. Next, review the Terms before creating your account.</p>}
                  {mode === "recovery" && <p className="text-sm text-foreground/80">Enter your account email to request a password reset link.</p>}
                  {mode === "signup" && <label className="block text-sm">Display name<input className={`${fieldClass} mt-2`} value={name} onChange={event => setName(event.target.value)} autoComplete="nickname" maxLength={80} required disabled={busy} /></label>}
                  {mode === "signup" && <p className="text-xs text-muted">Choose a unique display name. You can change it later; staff and system names are reserved.</p>}
                  {mode !== "reset" && <label className="block text-sm">Email<input className={`${fieldClass} mt-2`} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required disabled={busy} /></label>}
                  {mode !== "recovery" && <label className="block text-sm">{mode === "reset" ? "New password" : "Password"}<input className={`${fieldClass} mt-2`} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signin" ? undefined : 12} maxLength={128} required disabled={busy} /></label>}
                  {(mode === "signup" || mode === "reset") && <p className="text-xs text-muted">Use at least 12 characters.</p>}
                  <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy}>{busy ? pending : mode === "signup" ? "Continue to Terms" : mode === "recovery" ? "Send reset link" : mode === "reset" ? "Save new password" : labels[mode]}</button>
                </>
              )}
            </form>
          )}
          {mode !== "reset" && !awaitingVerification && <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5 text-sm">
            {mode !== "recovery" && <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => changeMode("recovery")}>Forgot password?</button>}
            {mode !== "signup" && <button type="button" className={secondaryButtonClass} disabled={busy || !email.trim()} onClick={resendVerification}>{pending === "Requesting verification link…" ? pending : "Resend verification email"}</button>}
          </div>}
        </>
      )}
      <p className="mt-6 border-t border-border pt-4 text-xs text-muted">Your account details and security emails stay private. They are excluded from BNL&apos;s public memory and publications.</p>
    </section>
  );
}
