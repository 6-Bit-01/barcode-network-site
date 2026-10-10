"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MemberAccess } from "./member-access";
export function useCrewToolData<T>(access: MemberAccess, permission: "show.overview" | "insights.read", path: string) {
 const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
 const [authority, setAuthority] = useState<{ input: MemberAccess; value: MemberAccess } | null>(null);
 const controller = useRef<AbortController | null>(null);
 const refresh = useCallback(async () => {
  controller.current?.abort(); const current = new AbortController(); controller.current = current;
  setData(null); setAuthority(null); setLoading(true); setError(null);
  try {
   const authority = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: current.signal });
   const fresh = authority.ok ? await authority.json() : null;
   if (current.signal.aborted) return;
   const assigned = fresh?.access?.owner === true || (fresh?.access?.crew === true && fresh.access.permissions?.includes(permission));
   if (!fresh || fresh.user?.id !== access.user.id || !(Date.parse(fresh.session?.expiresAt) > Date.now()) || !assigned || !fresh.access.availablePermissions?.includes(permission)) { window.location.assign("/account"); return; }
   const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: current.signal });
   if (current.signal.aborted) return;
   if (response.status === 401 || response.status === 403) { window.location.assign("/account"); return; }
   if (!response.ok) throw new Error("TOOL_UNAVAILABLE");
   const result = await response.json();
   if (!current.signal.aborted) { setAuthority({ input: access, value: fresh }); setData(result as T); }
  } catch { if (!current.signal.aborted) setError("This tool is temporarily unavailable. Please try Refresh."); }
  finally { if (!current.signal.aborted) setLoading(false); }
 }, [access, permission, path]);
 useEffect(() => {
  let active = true;
  void Promise.resolve().then(() => { if (active) return refresh(); });
  window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
  return () => { active = false; controller.current?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
 }, [refresh, path, access.user.id]);
 const currentAccess = authority?.input === access ? authority.value : null;
 return { data: currentAccess ? data : null, currentAccess, loading, error, refresh };
}
export function crewDuration(seconds: number | null | undefined): string {
 if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "Unavailable";
 const minutes = Math.round(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
