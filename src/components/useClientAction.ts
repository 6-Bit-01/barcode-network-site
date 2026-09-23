"use client";

import { useState } from "react";
import { createClientActionRunner, type ClientActionFeedback } from "@/lib/client-action";

export function useClientAction() {
  const [actions, setActions] = useState<Record<string, ClientActionFeedback>>({});
  const [runAction] = useState(() => createClientActionRunner((key, feedback) => {
    setActions((current) => ({ ...current, [key]: feedback }));
  }));
  return { actions, runAction, isPending: (key: string) => actions[key]?.phase === "pending" };
}
