export type BNLStatusValue = "ONLINE" | "OFFLINE";
export type BNLModeValue =
  | "STANDBY"
  | "OBSERVATION"
  | "ACTIVE_LIAISON"
  | "SIGNAL_DEGRADATION"
  | "RESTRICTED";

export type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "unknown";

export interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  currentDirective?: string;
  source?: BNLSourceValue;
  lastSeen: string | null;
}

export const FALLBACK_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  currentDirective: "Monitoring Discord-side relay traffic.",
  source: "unknown",
  lastSeen: null,
};
