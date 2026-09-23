export interface ClientActionFeedback {
  label: string;
  phase: "pending" | "success" | "error";
  startedAt: number;
  durationMs?: number;
}

export interface ClientActionTiming {
  action: string;
  durationMs: number;
  outcome: "success" | "error";
}

/** An in-page click lock, not a mutation queue or a retry policy. */
export function createClientActionRunner(
  onChange: (key: string, feedback: ClientActionFeedback) => void,
  report: (timing: ClientActionTiming) => void = (timing) => {
    if (timing.durationMs >= 1_500) console.info("barcode_slow_action", timing);
  },
  now: () => number = () => performance.now(),
) {
  const pending = new Set<string>();
  return async function run<T>(
    key: string,
    description: { label: string; success: string; metric: string },
    task: () => Promise<T | null>,
  ): Promise<T | null> {
    // Lock before any await or React render. Repeated callers do not repeat follow-up effects.
    if (pending.has(key)) return null;
    pending.add(key);
    const startedAt = now();
    onChange(key, { label: description.label, phase: "pending", startedAt });
    let outcome: ClientActionTiming["outcome"] = "error";
    try {
      const result = await task();
      if (result !== null) outcome = "success";
      return result;
    } finally {
      pending.delete(key);
      const durationMs = Math.max(0, Math.round(now() - startedAt));
      onChange(key, {
        label: outcome === "success" ? description.success : `${description.label} could not be confirmed.`,
        phase: outcome,
        startedAt,
        durationMs,
      });
      // Call sites supply fixed metric names; never include keys, names, bodies, URLs or tokens.
      report({ action: description.metric, durationMs, outcome });
    }
  };
}
