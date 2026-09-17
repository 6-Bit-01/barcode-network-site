"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { broadcastArchiveArtistHref } from "@/lib/broadcast-archive";
import { autofillBalladArtistLinks, balladArtistProfiles, suggestBalladArtists, suggestedBalladNames, type BalladArtistLink, type BalladArtistProfile } from "@/lib/bnl-ballad-artists";

const buttonClass = "rounded border border-border px-3 py-2 text-xs font-bold text-foreground hover:border-accent disabled:opacity-40";
const inputClass = "min-w-0 w-full rounded border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent";

function ArtistPicker({ label, name, profiles, value, onChange }: { label: string; name: string; profiles: BalladArtistProfile[]; value: string; onChange: (key: string) => void }) {
  const [search, setSearch] = useState("");
  const suggestions = useMemo(() => suggestBalladArtists(search || name, profiles), [search, name, profiles]);
  const suggestedKeys = new Set(suggestions.map(profile => profile.projectKey));
  const others = profiles.filter(profile => !suggestedKeys.has(profile.projectKey) && (!search || profile.projectLabel.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const selected = profiles.find(profile => profile.projectKey === value);
  return <div className="min-w-0 space-y-2">
    <label className="block space-y-2 text-xs text-muted"><span>{label}</span><select aria-label={label} value={value} className={inputClass} onChange={event => { onChange(event.target.value); setSearch(""); }}>
      <option value="">{name ? "Leave this name unlinked" : "Choose an artist card to add"}</option>
      {value && !profiles.some(profile => profile.projectKey === value) && <option value={value}>Saved artist unavailable — remove or choose another</option>}
      {selected && ![...suggestions, ...others].some(profile => profile.projectKey === value) && <option value={value}>{selected.projectLabel} · Selected</option>}
      {!!suggestions.length && <optgroup label="Suggested matches">{suggestions.map(profile => <option key={profile.projectKey} value={profile.projectKey}>{profile.projectLabel}</option>)}</optgroup>}
      {!!others.length && <optgroup label={search ? "Other search results" : "All other individual artists"}>{others.map(profile => <option key={profile.projectKey} value={profile.projectKey}>{profile.projectLabel}</option>)}</optgroup>}
    </select></label>
    <details><summary className="cursor-pointer text-xs text-accent">Search another name</summary><label className="mt-2 block text-xs text-muted"><span className="sr-only">Search {label}</span><input type="search" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} placeholder="Search individual artists…" className={inputClass} /></label></details>
    {search && !suggestions.length && !others.length && <p className="text-xs text-muted">No individual artist matches. Try another spelling or leave the name unlinked.</p>}
  </div>;
}

export function BalladArtistLinkEditor({ mentions, profiles: suppliedProfiles, links, reviewed = [], onChange, open, onOpenChange }: { mentions: string; profiles: BalladArtistProfile[]; links: BalladArtistLink[]; reviewed?: string[]; onChange: (links: BalladArtistLink[]) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const profiles = useMemo(() => balladArtistProfiles(suppliedProfiles), [suppliedProfiles]);
  const [manualNames, setManualNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const candidates = useMemo(() => suggestedBalladNames(mentions, profiles), [mentions, profiles]);
  const filled = useRef(false);
  useEffect(() => {
    if (!open || filled.current || !profiles.length) return;
    filled.current = true;
    const next = autofillBalladArtistLinks(candidates, profiles, links, reviewed);
    if (next.length !== links.length) onChange(next);
  }, [open, profiles, candidates, links, reviewed, onChange]);
  const names = [...new Map([...candidates, ...links.filter(link => link.name).map(link => link.name), ...manualNames].map(name => [name.toLocaleLowerCase(), name])).values()];
  function choose(name: string, projectKey: string) {
    const profile = profiles.find(profile => profile.projectKey === projectKey);
    onChange([...links.filter(link => link.name.toLocaleLowerCase() !== name.toLocaleLowerCase()), ...(profile ? [{ ...profile, name }] : [])]);
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-base font-bold text-foreground">Artist linking</h4><p className="mt-1 text-xs text-muted">{links.length ? `${links.length} artist tags / cards selected` : "No artist links selected yet"}</p></div><button type="button" className={buttonClass} aria-expanded={open} onClick={() => onOpenChange(!open)}>{open ? "Close linking mode" : "Link artist profiles"}</button></div>
    {open && <div className="space-y-5">
      <p className="text-sm text-muted">Clear suggested matches are filled in for you. Change any dropdown or leave a name unlinked, then save. Your saved choices are preserved. Artist cards follow primary credits; featured credits do not create extra cards.</p>
      <a href="/admin/artist-credits" target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent">Correct a split name, alias or artist credit ↗</a>
      {!profiles.length && <p role="status" className="text-sm text-amber-300">No individual Archive artist cards are available. You can remove existing links or leave names unlinked.</p>}
      <div className="space-y-3">{names.map(name => {
        const link = links.find(link => link.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        return <div key={name.toLocaleLowerCase()} className="grid min-w-0 gap-3 rounded border border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0"><p className="break-words font-bold text-foreground">{name}</p><p className="mt-1 text-xs text-muted">{link ? "Profile selected" : "Not linked"}</p>{link && <a href={broadcastArchiveArtistHref(link.projectKey)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent">Preview artist card ↗</a>}</div>
          <ArtistPicker label={`Artist for ${name}`} name={name} profiles={profiles} value={link?.projectKey ?? ""} onChange={key => choose(name, key)} />
        </div>;
      })}</div>
      <div className="space-y-2"><label className="block text-xs text-muted">Add a missing name or alias<input value={newName} maxLength={120} className={`${inputClass} mt-2`} placeholder="The name as it appears in the song or story" onChange={event => setNewName(event.target.value)} /></label><button type="button" className={buttonClass} disabled={!newName.trim()} onClick={() => { setManualNames([...manualNames, newName.trim()]); setNewName(""); }}>Add name</button></div>
      <div className="space-y-3 border-t border-border pt-4"><h5 className="font-bold text-foreground">Add an artist card</h5><p className="text-xs text-muted">Include an artist card even without tagging a name in the text.</p>
        {links.filter(link => !link.name).map(link => <div key={link.projectKey} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3"><a className="text-sm text-accent" href={broadcastArchiveArtistHref(link.projectKey)} target="_blank" rel="noopener noreferrer">{link.projectLabel} ↗</a><button type="button" className={buttonClass} onClick={() => onChange(links.filter(item => item !== link))}>Remove {link.projectLabel} card</button></div>)}
        <ArtistPicker label="Additional artist card" name="" profiles={profiles.filter(profile => !links.some(link => link.projectKey === profile.projectKey))} value="" onChange={key => { const profile = profiles.find(profile => profile.projectKey === key); if (profile) onChange([...links, { ...profile, name: "" }]); }} />
      </div>
    </div>}
  </div>;
}
