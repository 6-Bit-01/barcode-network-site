export type BNLStatusValue = "ONLINE" | "OFFLINE";
export type BNLModeValue =
  | "STANDBY"
  | "OBSERVATION"
  | "ACTIVE_LIAISON"
  | "SIGNAL_DEGRADATION"
  | "RESTRICTED";

export interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  lastSeen: string | null;
}

export const FALLBACK_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  lastSeen: null,
};
