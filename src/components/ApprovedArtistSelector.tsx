"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MemberArtists } from "@/lib/member-artists";

export function ApprovedArtistSelector({ onChange, disabled = false }: { onChange: (artistId: string | undefined) => void; disabled?: boolean }) {
  const [data, setData] = useState<MemberArtists | null>(null);
  const [selected, setSelected] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const explicitChoice = useRef<{ memberId: string; artistId: string } | null>(null);
  useEffect(() => {
    async function readArtists() {
      controller.current?.abort();
      const current = new AbortController(); controller.current = current;
      setData(null); setSelected(""); onChange(undefined); setUnavailable(false);
      try {
        const response = await fetch("/api/member/artists", { credentials: "same-origin", cache: "no-store", signal: current.signal });
        if (current.signal.aborted) return;
        if (response.status === 401) return;
        if (!response.ok) throw new Error("UNAVAILABLE");
        const value: MemberArtists = await response.json();
        if (current.signal.aborted) return;
        if (!value.user?.id || !(Date.parse(value.session?.expiresAt) > Date.now()) || !Array.isArray(value.artists)) throw new Error("UNAVAILABLE");
        setData(value);
        const choice = explicitChoice.current?.memberId === value.user.id ? explicitChoice.current : null;
        const initial = choice ? (value.artists.some(artist => artist.id === choice.artistId) ? choice.artistId : "") : value.artists.length === 1 ? value.artists[0].id : "";
        setSelected(initial); onChange(initial);
      } catch { if (!current.signal.aborted) setUnavailable(true); }
    }
    void readArtists();
    window.addEventListener("focus", readArtists); window.addEventListener("pageshow", readArtists);
    return () => { controller.current?.abort(); window.removeEventListener("focus", readArtists); window.removeEventListener("pageshow", readArtists); };
  }, [onChange]);
  if (unavailable) return <p role="status" className="text-xs text-muted">Artist access is unavailable. Signed-in submissions require a current account session; <Link href="/account" className="text-accent underline">check your account</Link> if submission fails.</p>;
  if (!data || data.artists.length === 0) return null;
  return <label className="block space-y-2 text-sm"><span>Approved Artist project <span className="text-muted">(optional)</span></span><select aria-label="Approved Artist project" className="w-full rounded border border-border bg-background px-3 py-2" value={selected} disabled={disabled} onChange={event => { const value = data.artists.some(artist => artist.id === event.target.value) ? event.target.value : ""; explicitChoice.current = { memberId: data.user.id, artistId: value }; setSelected(value); onChange(value); }}><option value="">Personal Member submission</option>{data.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.projectKey}</option>)}</select><span className="block text-xs text-muted">Adds this submission to approved Artist history. Public song credits stay as you entered them.</span></label>;
}
