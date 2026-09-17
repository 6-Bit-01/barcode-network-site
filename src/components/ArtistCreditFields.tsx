"use client";

import { useState } from "react";
import { moveCreditSuggestion, suggestCreditSplit } from "@/lib/artist-credits";

export function ArtistCreditFields({ artist, collaborators, decision, onChange }: {
  artist: string; collaborators: string; decision: "whole" | "split" | "";
  onChange: (artist: string, collaborators: string, decision: "whole" | "split" | "", original: string) => void;
}) {
  const [undo, setUndo] = useState<{ artist: string; collaborators: string } | null>(null);
  const suggestion = decision ? null : suggestCreditSplit(artist);
  const move = suggestion ? moveCreditSuggestion(artist, collaborators) : null;
  const input = "w-full bg-background border border-border px-3 py-2 text-sm";
  return <div className="grid gap-2.5 sm:col-span-2 sm:grid-cols-2">
    <div className="min-w-0"><label className="block space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Primary artist name</span><input value={artist} maxLength={200} onChange={e => { setUndo(null); onChange(e.target.value, collaborators, "", e.target.value); }} className={input} required aria-describedby={suggestion ? "artist-credit-suggestion" : undefined} /></label>
      {suggestion && <div id="artist-credit-suggestion" role="status" className="mt-2 space-y-2 border border-danger/60 bg-danger/10 p-3 text-xs text-foreground">
        <p className="font-bold text-danger">Is this a collaboration?</p><p className="break-words">Keep <strong>{suggestion.primary}</strong> as the primary artist and move <strong>{suggestion.collaborators.join(", ")}</strong> to collaborators?</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!move} className="border border-danger px-3 py-2 font-bold text-danger hover:bg-danger/15 disabled:opacity-40" onClick={() => { const next = moveCreditSuggestion(artist, collaborators); if (next) { setUndo({ artist, collaborators }); onChange(next.artist, next.collaboratorNames, "split", artist); } }}>Move to collaborators</button><button type="button" className="border border-border px-3 py-2" onClick={() => onChange(artist, collaborators, "whole", artist)}>Keep as one artist</button></div>{!move && <p className="text-danger">The combined credits exceed the collaborator field’s 200-character limit. Edit that field first; your names have been kept.</p>}<p className="text-muted">Optional. If this is your full artist name, keep it together.</p>
      </div>}
      {decision === "whole" && <p className="mt-2 text-xs text-muted">Kept as one artist. <button type="button" className="text-accent underline" onClick={() => onChange(artist, collaborators, "", artist)}>Review</button></p>}
      {undo && <p className="mt-2 text-xs text-muted">Moved to collaborators. <button type="button" className="text-accent underline" onClick={() => { onChange(undo.artist, undo.collaborators, "", undo.artist); setUndo(null); }}>Undo</button></p>}
    </div>
    <label className="block min-w-0 space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Featured/collaborator artist(s)</span><input aria-label="Featured/collaborator artist(s)" value={collaborators} maxLength={200} onChange={e => { setUndo(null); onChange(artist, e.target.value, decision, ""); }} placeholder="Optional · separate artists with commas" className={input} /><span className="block text-[11px] text-muted">Credit featured artists here. Keep your own artist name above.</span></label>
  </div>;
}
