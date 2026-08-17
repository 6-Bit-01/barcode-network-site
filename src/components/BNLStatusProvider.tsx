"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BNLStatusController, BNLStatusSnapshot } from "@/components/bnl-status-controller";
import { FALLBACK_STATUS } from "@/components/bnl-status";

const fallback: BNLStatusSnapshot = { data: FALLBACK_STATUS, loading: true, refreshing: false, error: null, lastSuccessfulRefresh: null, synchronized: false };
const Context = createContext<BNLStatusController | null>(null);

export function BNLStatusProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isolatedPrototype = pathname === "/world/playtest";
  const disabled = isolatedPrototype || pathname === "/admin" || pathname.startsWith("/admin/");
  const controller = useMemo(() => new BNLStatusController((input, init) => globalThis.fetch(input, init)), []);
  useEffect(() => {
    if (disabled) return;
    controller.start();
    return () => controller.stop();
  }, [controller, disabled]);
  return (
    <Context.Provider value={disabled ? null : controller}>
      {children}
    </Context.Provider>
  );
}

export function useBNLStatus() {
  const controller = useContext(Context);
  const snapshot = useSyncExternalStore(controller?.subscribe ?? (() => () => {}), controller?.getSnapshot ?? (() => fallback), () => fallback);
  return { ...snapshot, refresh: controller?.refresh ?? (async () => {}) };
}
