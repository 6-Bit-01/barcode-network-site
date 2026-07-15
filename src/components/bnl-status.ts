export type BNLStatusValue = "ONLINE" | "OFFLINE";
export type BNLModeValue =
  | "STANDBY"
  | "OBSERVATION"
  | "ACTIVE_LIAISON"
  | "SIGNAL_DEGRADATION"
  | "RESTRICTED";

export type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";
export type BNLV2PresenceSource = "heartbeat" | "startup" | "admin" | "reset" | "unknown";
export type BNLV2RelaySourceClass = "fresh_public_event" | "recent_public_continuity" | "scoped_broadcast_memory" | "public_safe_memory" | "approved_canon" | "grounded_reflection";
export type BNLV2RelayTrigger = "scheduled" | "force_pull" | "manual";

export interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  currentDirective?: string;
  source?: BNLSourceValue;
  lastSeen: string | null;
  contractVersion?: 2;
  presence?: { contractVersion: 2; status: BNLStatusValue; mode: BNLModeValue; source: BNLV2PresenceSource; receivedAt: string };
  relay?: { contractVersion: 2; relayId: string; message: string; currentDirective: string; sourceClass: BNLV2RelaySourceClass; trigger: BNLV2RelayTrigger; publishedAt: string } | null;
}

export const FALLBACK_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  currentDirective: "Monitoring Discord-side relay traffic.",
  source: "unknown",
  lastSeen: null,
};
