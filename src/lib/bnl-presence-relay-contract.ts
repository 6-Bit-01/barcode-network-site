export type BNLStatusValue = "ONLINE" | "OFFLINE";
export type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
export type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";
export type BNLV2PresenceSource = "heartbeat" | "startup" | "admin" | "reset" | "unknown";
export type BNLV2RelaySourceClass = "fresh_public_event" | "recent_public_continuity" | "scoped_broadcast_memory" | "public_safe_memory" | "approved_canon" | "grounded_reflection";
export type BNLV2RelayTrigger = "scheduled" | "force_pull" | "manual";

export type BNLV1Status = { status: BNLStatusValue; mode: BNLModeValue; message: string; currentDirective: string; source: BNLSourceValue; adminNote?: string; lastSeen: string | null };
export type BNLV1HistoryEntry = { timestamp: string; status: BNLStatusValue; mode: BNLModeValue; currentDirective?: string; message: string; source: BNLSourceValue; adminNote?: string; persisted?: boolean };
export type BNLV2PresenceRecord = { contractVersion: 2; status: BNLStatusValue; mode: BNLModeValue; source: BNLV2PresenceSource; receivedAt: string };
export type BNLV2RelayRecord = { contractVersion: 2; relayId: string; message: string; currentDirective: string; sourceClass: BNLV2RelaySourceClass; trigger: BNLV2RelayTrigger; publishedAt: string };
export type BNLPublicRelayHistoryEntry = Pick<
  BNLV2RelayRecord,
  "message" | "currentDirective" | "publishedAt"
>;
export type BNLCurrentView = Omit<BNLV1Status, "adminNote"> & { persisted: boolean; contractVersion: 2; presence: BNLV2PresenceRecord; relay: BNLV2RelayRecord | null };
export type BNLRelayStorageDecision =
  | { action: "insert"; relay: BNLV2RelayRecord; history: BNLV2RelayRecord[] }
  | { action: "idempotent"; relay: BNLV2RelayRecord; history: BNLV2RelayRecord[] }
  | { action: "conflict"; relay: BNLV2RelayRecord; history: BNLV2RelayRecord[] };

export const BNL_V1_STATUS_KEY = "bnl:status";
export const BNL_V1_HISTORY_KEY = "bnl:history";
export const BNL_V2_PRESENCE_KEY = "bnl:presence:v2";
export const BNL_V2_RELAY_CURRENT_KEY = "bnl:relay:current:v2";
export const BNL_V2_RELAY_HISTORY_KEY = "bnl:relay:history:v2";
export const PUBLIC_BNL_RELAY_HISTORY_LIMIT = 20;
export const MAX_MESSAGE_LENGTH = 600;
export const MAX_DIRECTIVE_LENGTH = 800;
export const MAX_ADMIN_NOTE_LENGTH = 400;
export const DEFAULT_DIRECTIVE = "Monitoring Discord-side relay traffic.";
export const DEFAULT_STATUS: BNLV1Status = { status: "OFFLINE", mode: "STANDBY", message: "BNL-01 relay awaiting signal.", currentDirective: DEFAULT_DIRECTIVE, source: "unknown", lastSeen: null };

const statuses = new Set<BNLStatusValue>(["ONLINE", "OFFLINE"]);
const modes = new Set<BNLModeValue>(["STANDBY", "OBSERVATION", "ACTIVE_LIAISON", "SIGNAL_DEGRADATION", "RESTRICTED"]);
const v1Sources = new Set<BNLSourceValue>(["bot", "startup", "relay", "heartbeat", "showday", "showtest", "admin", "reset", "forcePull", "unknown"]);
const presenceSources = new Set<BNLV2PresenceSource>(["heartbeat", "startup", "admin", "reset", "unknown"]);
const sourceClasses = new Set<BNLV2RelaySourceClass>(["fresh_public_event", "recent_public_continuity", "scoped_broadcast_memory", "public_safe_memory", "approved_canon", "grounded_reflection"]);
const triggers = new Set<BNLV2RelayTrigger>(["scheduled", "force_pull", "manual"]);

class ContractError extends Error { constructor(message = "Invalid payload", public status = 500) { super(message); } }
export class BNLContractConflictError extends ContractError { constructor() { super("Relay ID conflict", 409); } }
export class BNLContractValidationError extends ContractError { constructor() { super("Invalid payload", 400); } }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(record: Record<string, unknown>, keys: string[]) { const allowed = new Set(keys); if (!Object.keys(record).every((key) => allowed.has(key))) throw new BNLContractValidationError(); }
function text(value: unknown, max: number, required = true): string | undefined { if (value === undefined && !required) return undefined; if (typeof value !== "string") throw new BNLContractValidationError(); const clean = value.trim(); if ((required && !clean) || clean.length > max) throw new BNLContractValidationError(); return clean || undefined; }
function enumValue<T extends string>(value: unknown, allowed: Set<T>): T { if (typeof value !== "string" || !allowed.has(value as T)) throw new BNLContractValidationError(); return value as T; }
function relayId(value: unknown): string { const clean = text(value, 160); if (!clean || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(clean)) throw new BNLContractValidationError(); return clean; }


export function sanitizeV1History(value: unknown): BNLV1HistoryEntry[] { if (!Array.isArray(value)) return []; const normalized: BNLV1HistoryEntry[] = []; for (const item of value) { if (!isRecord(item)) continue; const status = statuses.has(item.status as BNLStatusValue) ? item.status as BNLStatusValue : null; const mode = modes.has(item.mode as BNLModeValue) ? item.mode as BNLModeValue : null; const source = v1Sources.has(item.source as BNLSourceValue) ? item.source as BNLSourceValue : "unknown"; const timestamp = typeof item.timestamp === "string" && item.timestamp ? item.timestamp : null; const message = typeof item.message === "string" ? item.message.trim().slice(0, MAX_MESSAGE_LENGTH) : ""; const currentDirective = typeof item.currentDirective === "string" && item.currentDirective.trim().length > 0 ? item.currentDirective.trim().slice(0, MAX_DIRECTIVE_LENGTH) : undefined; const adminNote = typeof item.adminNote === "string" && item.adminNote.trim().length > 0 ? item.adminNote.trim().slice(0, MAX_ADMIN_NOTE_LENGTH) : undefined; if (!status || !mode || !timestamp || !message) continue; normalized.push({ timestamp, status, mode, currentDirective, message, source, adminNote }); } return normalized.slice(0, 25); }
export function sameV1HistoryContent(a: BNLV1HistoryEntry, b: BNLV1HistoryEntry): boolean { return a.status === b.status && a.mode === b.mode && a.source === b.source && a.message === b.message && (a.currentDirective ?? "") === (b.currentDirective ?? "") && (a.adminNote ?? "") === (b.adminNote ?? ""); }
export function appendV1HistoryEntry(history: BNLV1HistoryEntry[], entry: BNLV1HistoryEntry): BNLV1HistoryEntry[] { const latest = history[0]; return latest && sameV1HistoryContent(latest, entry) ? history.slice(0, 25) : [entry, ...history].slice(0, 25); }
export function v1HistoryEntryFromStatus(status: BNLV1Status, timestamp: string, persisted: boolean): BNLV1HistoryEntry { return { timestamp, status: status.status, mode: status.mode, currentDirective: status.currentDirective, message: status.message, source: status.source, adminNote: status.adminNote, persisted }; }
export function sanitizeStoredV1Status(value: unknown): BNLV1Status { if (!isRecord(value)) return { ...DEFAULT_STATUS }; const adminNote = typeof value.adminNote === "string" && value.adminNote.trim() ? value.adminNote.trim().slice(0, MAX_ADMIN_NOTE_LENGTH) : undefined; return { status: statuses.has(value.status as BNLStatusValue) ? value.status as BNLStatusValue : DEFAULT_STATUS.status, mode: modes.has(value.mode as BNLModeValue) ? value.mode as BNLModeValue : DEFAULT_STATUS.mode, message: typeof value.message === "string" && value.message.trim() ? value.message.trim().slice(0, MAX_MESSAGE_LENGTH) : DEFAULT_STATUS.message, currentDirective: typeof value.currentDirective === "string" && value.currentDirective.trim() ? value.currentDirective.trim().slice(0, MAX_DIRECTIVE_LENGTH) : DEFAULT_STATUS.currentDirective, source: v1Sources.has(value.source as BNLSourceValue) ? value.source as BNLSourceValue : DEFAULT_STATUS.source, adminNote, lastSeen: typeof value.lastSeen === "string" && value.lastSeen ? value.lastSeen : null }; }
export function parseV1Write(body: unknown, now: string): BNLV1Status { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["status", "mode", "message", "currentDirective", "source", "adminNote"]); const adminNote = text(body.adminNote, MAX_ADMIN_NOTE_LENGTH, false); return { status: enumValue(body.status, statuses), mode: enumValue(body.mode, modes), message: text(body.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(body.currentDirective, MAX_DIRECTIVE_LENGTH, false) ?? DEFAULT_DIRECTIVE, source: body.source === undefined ? "unknown" : enumValue(body.source, v1Sources), adminNote, lastSeen: now }; }
export function isV2Envelope(body: unknown): boolean { return isRecord(body) && body.contractVersion === 2; }
export function parseV2PresenceWrite(body: unknown, now: string): BNLV2PresenceRecord { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["contractVersion", "kind", "presence"]); if (body.contractVersion !== 2 || body.kind !== "presence" || !isRecord(body.presence)) throw new BNLContractValidationError(); exactKeys(body.presence, ["status", "mode", "source"]); return { contractVersion: 2, status: enumValue(body.presence.status, statuses), mode: enumValue(body.presence.mode, modes), source: enumValue(body.presence.source, presenceSources), receivedAt: now }; }
export function parseV2RelayWrite(body: unknown, now: string): BNLV2RelayRecord { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["contractVersion", "kind", "relay"]); if (body.contractVersion !== 2 || body.kind !== "relay" || !isRecord(body.relay)) throw new BNLContractValidationError(); exactKeys(body.relay, ["relayId", "message", "currentDirective", "sourceClass", "trigger"]); return { contractVersion: 2, relayId: relayId(body.relay.relayId), message: text(body.relay.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(body.relay.currentDirective, MAX_DIRECTIVE_LENGTH)!, sourceClass: enumValue(body.relay.sourceClass, sourceClasses), trigger: enumValue(body.relay.trigger, triggers), publishedAt: now }; }
export function sanitizeStoredV2Presence(value: unknown): BNLV2PresenceRecord | null { if (!isRecord(value)) return null; try { exactKeys(value, ["contractVersion", "status", "mode", "source", "receivedAt"]); if (value.contractVersion !== 2 || typeof value.receivedAt !== "string") return null; return { contractVersion: 2, status: enumValue(value.status, statuses), mode: enumValue(value.mode, modes), source: enumValue(value.source, presenceSources), receivedAt: value.receivedAt }; } catch { return null; } }
export function sanitizeStoredV2Relay(value: unknown): BNLV2RelayRecord | null { if (!isRecord(value)) return null; try { exactKeys(value, ["contractVersion", "relayId", "message", "currentDirective", "sourceClass", "trigger", "publishedAt"]); if (value.contractVersion !== 2 || typeof value.publishedAt !== "string") return null; return { contractVersion: 2, relayId: relayId(value.relayId), message: text(value.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(value.currentDirective, MAX_DIRECTIVE_LENGTH)!, sourceClass: enumValue(value.sourceClass, sourceClasses), trigger: enumValue(value.trigger, triggers), publishedAt: value.publishedAt }; } catch { return null; } }
export function sanitizeRelayHistory(value: unknown): BNLV2RelayRecord[] { return Array.isArray(value) ? value.map(sanitizeStoredV2Relay).filter((x): x is BNLV2RelayRecord => Boolean(x)).slice(0, 25) : []; }
export function serializePublicRelayHistory(
  value: unknown,
): BNLPublicRelayHistoryEntry[] {
  return sanitizeRelayHistory(value)
    .slice(0, PUBLIC_BNL_RELAY_HISTORY_LIMIT)
    .map(({ message, currentDirective, publishedAt }) => ({
      message,
      currentDirective,
      publishedAt,
    }));
}
function sameRelayContent(a: BNLV2RelayRecord, b: BNLV2RelayRecord): boolean { return a.relayId === b.relayId && a.message === b.message && a.currentDirective === b.currentDirective && a.sourceClass === b.sourceClass && a.trigger === b.trigger; }
export function decideRelayStorage(input: { current: BNLV2RelayRecord | null; history: BNLV2RelayRecord[]; relay: BNLV2RelayRecord }): BNLRelayStorageDecision { const existing = [input.current, ...input.history].filter((item): item is BNLV2RelayRecord => Boolean(item)).find((item) => item.relayId === input.relay.relayId); if (existing) { if (!sameRelayContent(existing, input.relay)) return { action: "conflict", relay: existing, history: input.history }; return { action: "idempotent", relay: existing, history: input.history }; } return { action: "insert", relay: input.relay, history: [input.relay, ...input.history].slice(0, 25) }; }
export function upsertRelayHistory(history: BNLV2RelayRecord[], relay: BNLV2RelayRecord): { history: BNLV2RelayRecord[]; changed: boolean } { const decision = decideRelayStorage({ current: null, history, relay }); if (decision.action === "conflict") throw new BNLContractConflictError(); return { history: decision.history, changed: decision.action === "insert" }; }
export function v1Presence(v1: BNLV1Status): BNLV2PresenceRecord { return { contractVersion: 2, status: v1.status, mode: v1.mode, source: presenceSources.has(v1.source as BNLV2PresenceSource) ? v1.source as BNLV2PresenceSource : "unknown", receivedAt: v1.lastSeen ?? new Date(0).toISOString() }; }
export function buildCurrentView(input: { v1?: unknown; presence?: unknown; relay?: unknown; persisted: boolean }): BNLCurrentView { const legacy = sanitizeStoredV1Status(input.v1); const presence = sanitizeStoredV2Presence(input.presence) ?? v1Presence(legacy); const relay = sanitizeStoredV2Relay(input.relay); return { status: presence.status, mode: presence.mode, message: relay?.message ?? legacy.message, currentDirective: relay?.currentDirective ?? legacy.currentDirective, source: relay ? (relay.trigger === "force_pull" ? "forcePull" : "relay") : legacy.source, lastSeen: relay?.publishedAt ?? legacy.lastSeen, persisted: input.persisted, contractVersion: 2, presence, relay }; }
export function serializePublicCurrentView(view: BNLCurrentView & Record<string, unknown>) { const presence = sanitizeStoredV2Presence(view.presence); const relay = sanitizeStoredV2Relay(view.relay); return { status: enumValue(view.status, statuses), mode: enumValue(view.mode, modes), message: text(view.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(view.currentDirective, MAX_DIRECTIVE_LENGTH)!, source: enumValue(view.source, v1Sources), lastSeen: typeof view.lastSeen === "string" ? view.lastSeen : null, persisted: view.persisted === true, contractVersion: 2 as const, presence: presence ?? v1Presence(sanitizeStoredV1Status(view)), relay }; }
export function errorStatus(error: unknown) { return error instanceof ContractError ? error.status : 500; }
