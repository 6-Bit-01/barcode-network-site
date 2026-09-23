"use client";

import { useEffect, useRef } from "react";

const ENTRY_STORAGE_PREFIX = "barcode-queue-entered:";
const enteredInThisPage = new Set<string>();

function hasEnteredQueue(sessionId: string): boolean {
  if (enteredInThisPage.has(sessionId)) return true;
  try { return Boolean(window.localStorage.getItem(`${ENTRY_STORAGE_PREFIX}${sessionId}`)); }
  catch { return false; }
}

function rememberQueueEntry(sessionId: string): void {
  enteredInThisPage.add(sessionId);
  try { window.localStorage.setItem(`${ENTRY_STORAGE_PREFIX}${sessionId}`, "1"); }
  catch { /* The in-page set still prevents repeats when storage is unavailable. */ }
}

function isQueueCheckoutReturn(search: string): boolean {
  const params = new URLSearchParams(search);
  return [params.get("priority"), params.get("signalHold")].some((value) => value === "processing" || value === "cancelled");
}

function stableHash(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

export function QueueEntryPortal({ sessionId, detail }: { sessionId: string; detail: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const finishRef = useRef<(() => void) | null>(null);
  const seed = sessionId;
  const label = "WELCOME TO BARCODE RADIO";
  const mode = "SESSION MONITOR LOCKED";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || isQueueCheckoutReturn(window.location.search) || hasEnteredQueue(sessionId)) return;
    const previousOverflow = document.body.style.overflow;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 2000 : 6000;
    const finish = () => {
      window.clearTimeout(timer);
      rememberQueueEntry(sessionId);
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
    finishRef.current = finish;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(finish, duration);
    return () => {
      window.clearTimeout(timer);
      finishRef.current = null;
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [sessionId]);
  const glyphs = ["#", "/", "\\", "|", "-", "_", "+", "=", "*", ".", ":", ";", "<", ">", "[", "]", "{", "}", "0", "1", "█", "▓", "▒", "░"];
  const ringText = "# / \\ | - _ + = * . : ; < > [ ] { } 0 1 █ ▓ ▒ ░";
  const tunnelRows = ["/////=====#####_____000111", "[[]]{}{}::::;;;;++++****", "▓▒░█░▒▓__--||\\\\//<<>>"];
  const noise = Array.from({ length: 72 }).map((_, index) => glyphs[stableHash(`${seed}:noise:${index}`) % glyphs.length]);
  const streams = Array.from({ length: 14 }).map((_, index) => tunnelRows[stableHash(`${seed}:stream:${index}`) % tunnelRows.length]);
  const phaseTimings = [0, 1, 2.2, 3.5, 4.7, 5.42];
  const phases = [
    { label: "BARCODE SIGNAL DETECTED", chatter: "SIGNAL LEAK CONFIRMED" },
    { label: "CORRUPTED RECEIVER CALIBRATING", chatter: "NETWORK STATIC COMPENSATED" },
    { label: "BARCODE NETWORK HANDSHAKE", chatter: "UNAUTHORIZED SIGNAL PATH STABLE" },
    { label: "HOST BAND ALIGNING", chatter: "MONITOR PATH STABLE" },
    { label: mode, chatter: "BARCODE RECEIVER ONLINE" },
    { label, chatter: detail },
  ];
  return (
    <dialog ref={dialogRef} aria-label="Entering BARCODE Radio" onCancel={(event) => { event.preventDefault(); finishRef.current?.(); }} className="ascii-session-overlay fixed inset-0 z-[9900] m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden border-0 bg-black p-4 text-center font-mono text-emerald-200">
      <div className="ascii-blackout pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-crt pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-vignette pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ascii-noise pointer-events-none absolute inset-0" aria-hidden="true">{noise.map((char, index) => <span key={index} style={{ left: `${(stableHash(`${seed}:x:${index}`) % 96) + 2}%`, top: `${(stableHash(`${seed}:y:${index}`) % 92) + 4}%`, animationDelay: `${index * 37}ms` }}>{char}</span>)}</div>
      <div className="ascii-streams pointer-events-none absolute inset-0" aria-hidden="true">{streams.map((stream, index) => <span key={`${stream}-${index}`} style={{ top: `${12 + index * 5.6}%`, animationDelay: `${index * 95}ms` }}>{stream}</span>)}</div>
      <div className="ascii-calibration pointer-events-none absolute inset-0" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="ascii-portal absolute left-1/2 top-[44%] h-[min(68vw,64vh)] w-[min(68vw,64vh)] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <div className="ascii-tunnel-row row-a">{ringText}</div>
        <div className="ascii-tunnel-row row-b">{ringText}</div>
        <div className="ascii-tunnel-row row-c">{ringText}</div>
        <div className="ascii-ring ascii-ring-outer">{ringText}</div>
        <div className="ascii-ring ascii-ring-middle">{ringText}</div>
        <div className="ascii-ring ascii-ring-inner">{ringText}</div>
        <div className="ascii-core">[BARCODE]</div>
        <div className="ascii-barcode-band">B A R C O D E</div>
      </div>
      <button type="button" onClick={() => finishRef.current?.()} className="absolute right-4 top-4 z-30 border border-emerald-300/60 min-h-[44px] px-3 py-2 text-xs uppercase tracking-[0.2em] text-emerald-200 hover:bg-emerald-200 hover:text-black">Enter Now</button>
      <div aria-hidden="true" className="ascii-phase-stack absolute inset-x-3 bottom-[clamp(1.5rem,8vh,5rem)] z-20 mx-auto grid min-h-[8.25rem] max-w-4xl place-items-center sm:inset-x-6">
        {phases.map((phase, index) => <div key={`${phase.label}:${index}`} className={`ascii-phase ${index === phases.length - 1 ? "ascii-phase-final" : ""}`} style={{ animationDelay: `${phaseTimings[index]}s` }}><p className="ascii-phase-label uppercase tracking-[0.34em]">{phase.label}</p><p className="ascii-phase-detail mt-2 uppercase tracking-[0.28em] text-emerald-200/75">{phase.chatter}</p></div>)}
      </div>
      <div className="ascii-final-hit pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
      <style jsx>{`
.ascii-session-overlay{isolation:isolate;background:#000;animation:ascii-overlay-exit 6s linear forwards}
.ascii-blackout{z-index:0;background:#000}
.ascii-crt{z-index:1;background:linear-gradient(transparent 50%,rgba(255,255,255,.05) 50%),radial-gradient(circle at center,rgba(16,185,129,.16),transparent 48%);background-size:100% 6px,100% 100%;animation:ascii-crt-sweep 950ms linear infinite}
.ascii-vignette{z-index:2;background:radial-gradient(circle at center,transparent 0 34%,rgba(0,0,0,.72) 66%,#000 100%)}
.ascii-noise,.ascii-streams,.ascii-calibration,.ascii-portal{z-index:3}
.ascii-noise span{position:absolute;opacity:0;color:rgba(110,231,183,.62);text-shadow:0 0 10px rgba(110,231,183,.42);animation:ascii-noise 1.05s steps(2,end) infinite}
.ascii-streams span{position:absolute;left:-22%;right:-22%;display:block;white-space:nowrap;color:rgba(110,231,183,.18);letter-spacing:.42em;text-shadow:0 0 12px rgba(110,231,183,.22);animation:ascii-stream-pull 6s cubic-bezier(.18,.82,.22,1) forwards}
.ascii-streams span:nth-child(3n){color:rgba(255,170,0,.22);animation-duration:5.6s}
.ascii-streams span:nth-child(even){animation-direction:reverse}
.ascii-calibration span{position:absolute;background:rgba(110,231,183,.22);box-shadow:0 0 18px rgba(110,231,183,.22);animation:ascii-calibrate 6s ease-in-out forwards}
.ascii-calibration span:nth-child(1),.ascii-calibration span:nth-child(2){left:50%;top:8%;bottom:8%;width:1px}
.ascii-calibration span:nth-child(2){transform:translateX(-50%) rotate(90deg)}
.ascii-calibration span:nth-child(3){left:12%;right:12%;top:50%;height:1px}
.ascii-calibration span:nth-child(4){top:12%;bottom:12%;left:50%;width:1px}
.ascii-portal{perspective:1000px;filter:drop-shadow(0 0 42px rgba(16,185,129,.38))}
.ascii-tunnel-row{position:absolute;left:50%;top:50%;width:105%;color:rgba(110,231,183,.32);letter-spacing:.28em;white-space:nowrap;text-shadow:0 0 14px rgba(110,231,183,.34);transform-origin:center;animation:ascii-tunnel-row 6s cubic-bezier(.16,.8,.22,1) forwards}
.ascii-tunnel-row.row-b{color:rgba(255,170,0,.26);animation-delay:.12s;animation-direction:reverse}
.ascii-tunnel-row.row-c{color:rgba(255,255,255,.22);animation-delay:.24s}
.ascii-ring{position:absolute;inset:0;display:grid;place-items:center;border:1px solid rgba(110,231,183,.28);border-radius:999px;white-space:pre-wrap;line-height:1.8;color:rgba(110,231,183,.82);text-shadow:0 0 12px rgba(110,231,183,.46);animation:ascii-ring-spin 6s cubic-bezier(.16,.8,.22,1) forwards}
.ascii-ring-middle{inset:18%;animation-name:ascii-ring-spin-reverse;border-color:rgba(255,170,0,.32)}
.ascii-ring-inner{inset:32%;animation-duration:5.2s}
.ascii-core{position:absolute;inset:42%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.82);color:#fff;font-size:.65rem;letter-spacing:.3em;animation:ascii-core-open 6s ease-in-out forwards}
.ascii-barcode-band{position:absolute;left:50%;top:50%;width:min(26rem,72vw);translate:-50% -50%;border:1px solid rgba(110,231,183,.35);background:rgba(0,0,0,.9);padding:.45rem .75rem;color:#fff;letter-spacing:.45em;opacity:0;box-shadow:0 0 42px rgba(110,231,183,.28);animation:ascii-barcode-band 6s ease-out forwards}
.ascii-phase{position:absolute;inset:0;display:grid;place-items:center;align-content:center;border:1px solid rgba(110,231,183,.28);background:linear-gradient(180deg,rgba(0,0,0,.92),rgba(0,0,0,.84));box-shadow:0 0 56px rgba(0,0,0,.92),inset 0 0 34px rgba(110,231,183,.06);opacity:0;padding:1rem clamp(.9rem,3vw,1.5rem);animation:ascii-phase .66s ease-out forwards}
.ascii-phase-final{border-color:rgba(255,170,0,.42);box-shadow:0 0 70px rgba(255,170,0,.16),0 0 70px rgba(0,0,0,.96),inset 0 0 34px rgba(255,170,0,.07);animation-name:ascii-phase-final}
.ascii-phase-label{font-size:clamp(1rem,4vw,2.35rem);font-weight:900;line-height:1.08;color:#f8fff9;text-shadow:0 0 24px rgba(110,231,183,.38)}
.ascii-phase-detail{font-size:clamp(.68rem,1.8vw,.95rem);line-height:1.45}
.ascii-final-hit{opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),rgba(255,170,0,.28),transparent);animation:ascii-final-hit 6s ease-out forwards}
@keyframes ascii-overlay-exit{0%,94%{opacity:1}100%{opacity:0}}
@keyframes ascii-crt-sweep{from{background-position:0 0,0 0}to{background-position:0 48px,0 0}}
@keyframes ascii-noise{0%,100%{opacity:.05;transform:scale(.8)}50%{opacity:.48;transform:scale(1.12)}}
@keyframes ascii-stream-pull{0%{opacity:.08;transform:translateX(-10%) scaleX(1.18)}36%{opacity:.34}78%{opacity:.48;transform:translateX(18%) scaleX(.52)}100%{opacity:0;transform:translateX(42%) scaleX(.08)}}
@keyframes ascii-calibrate{0%{opacity:0;transform:scale(.7)}25%{opacity:.75;transform:scale(1)}78%{opacity:.35}100%{opacity:.08;transform:scale(1.08)}}
@keyframes ascii-tunnel-row{0%{opacity:0;transform:translate(-50%,-50%) rotate(0deg) scale(.42)}20%{opacity:.36}58%{transform:translate(-50%,-50%) rotate(240deg) scale(1.05)}82%{opacity:.62;transform:translate(-50%,-50%) rotate(460deg) scale(1.34)}100%{opacity:0;transform:translate(-50%,-50%) rotate(620deg) scale(.16)}}
@keyframes ascii-ring-spin{0%{transform:rotate(0deg) scale(.42);opacity:.18;filter:blur(2px)}18%{opacity:.72}58%{transform:rotate(380deg) scale(1.1);filter:blur(0)}82%{transform:rotate(620deg) scale(1.28);opacity:.82}100%{transform:rotate(720deg) scale(1.45);opacity:.12}}
@keyframes ascii-ring-spin-reverse{0%{transform:rotate(0deg) scale(.32);opacity:.16}58%{transform:rotate(-420deg) scale(1.04);opacity:.82}100%{transform:rotate(-760deg) scale(1.34);opacity:.1}}
@keyframes ascii-core-open{0%,55%{transform:scale(.2);opacity:.12}78%{transform:scale(1.35);opacity:1;box-shadow:0 0 60px rgba(110,231,183,.45)}100%{transform:scale(2.1);opacity:.1}}
@keyframes ascii-barcode-band{0%,82%{opacity:0;transform:scale(.96)}86%,94%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(.92)}}
@keyframes ascii-phase{0%{opacity:0;transform:translateY(8px);filter:blur(3px)}16%,68%{opacity:1;transform:translateY(0);filter:blur(0)}100%{opacity:0;transform:translateY(-8px);filter:blur(2px)}}
@keyframes ascii-phase-final{0%{opacity:0;transform:scale(.96);filter:blur(3px)}16%,82%{opacity:1;transform:scale(1);filter:blur(0)}100%{opacity:0;transform:scale(1.02);filter:blur(2px)}}
@keyframes ascii-final-hit{0%,86%{opacity:0;transform:translateX(-120%)}88%{opacity:.85}94%,100%{opacity:0;transform:translateX(120%)}}
@media (max-width: 640px){.ascii-portal{top:39%;height:min(82vw,52vh);width:min(82vw,52vh)}
.ascii-phase-stack{bottom:clamp(1rem,5vh,2.5rem);min-height:9.5rem}
.ascii-phase-label{letter-spacing:.18em}
.ascii-phase-detail{letter-spacing:.18em}
.ascii-barcode-band{letter-spacing:.28em}}
@media (prefers-reduced-motion: reduce){.ascii-session-overlay{animation:ascii-overlay-exit 2s linear forwards}
.ascii-crt,.ascii-noise span,.ascii-streams span,.ascii-calibration span,.ascii-tunnel-row,.ascii-ring,.ascii-core,.ascii-barcode-band,.ascii-phase,.ascii-final-hit{animation:none}
.ascii-phase{display:none}
.ascii-phase-final{display:grid;opacity:1}}`}</style>
    </dialog>
  );
}

