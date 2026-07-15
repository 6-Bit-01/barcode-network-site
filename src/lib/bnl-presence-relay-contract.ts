export type BNLStatusValue = "ONLINE" | "OFFLINE";
export type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
export type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";
export type BNLV2PresenceSource = "heartbeat" | "startup" | "admin" | "reset" | "unknown";
export type BNLV2RelaySourceClass = "fresh_public_event" | "recent_public_continuity" | "scoped_broadcast_memory" | "public_safe_memory" | "approved_canon" | "grounded_reflection";
export type BNLV2RelayTrigger = "scheduled" | "force_pull" | "manual";

export type BNLV1Status = { status: BNLStatusValue; mode: BNLModeValue; message: string; currentDirective: string; source: BNLSourceValue; adminNote?: string; lastSeen: string | null };
export type BNLV2PresenceRecord = { contractVersion: 2; status: BNLStatusValue; mode: BNLModeValue; source: BNLV2PresenceSource; receivedAt: string };
export type BNLV2RelayRecord = { contractVersion: 2; relayId: string; message: string; currentDirective: string; sourceClass: BNLV2RelaySourceClass; trigger: BNLV2RelayTrigger; publishedAt: string };
export type BNLCurrentView = BNLV1Status & { persisted: boolean; contractVersion: 2; presence: BNLV2PresenceRecord; relay: BNLV2RelayRecord | null };

export const BNL_V1_STATUS_KEY = "bnl:status";
export const BNL_V1_HISTORY_KEY = "bnl:history";
export const BNL_V2_PRESENCE_KEY = "bnl:presence:v2";
export const BNL_V2_RELAY_CURRENT_KEY = "bnl:relay:current:v2";
export const BNL_V2_RELAY_HISTORY_KEY = "bnl:relay:history:v2";
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

class ContractError extends Error { constructor(message = "Invalid payload", public status = 400) { super(message); } }
export class BNLContractConflictError extends ContractError { constructor() { super("Relay ID conflict", 409); } }
export class BNLContractValidationError extends ContractError {}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(record: Record<string, unknown>, keys: string[]) { const allowed = new Set(keys); if (!Object.keys(record).every((key) => allowed.has(key))) throw new BNLContractValidationError(); }
function text(value: unknown, max: number, required = true): string | undefined { if (value === undefined && !required) return undefined; if (typeof value !== "string") throw new BNLContractValidationError(); const clean = value.trim(); if ((required && !clean) || clean.length > max) throw new BNLContractValidationError(); return clean || undefined; }
function enumValue<T extends string>(value: unknown, allowed: Set<T>): T { if (typeof value !== "string" || !allowed.has(value as T)) throw new BNLContractValidationError(); return value as T; }
function relayId(value: unknown): string { const clean = text(value, 160); if (!clean || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(clean)) throw new BNLContractValidationError(); return clean; }

export function sanitizeStoredV1Status(value: unknown): BNLV1Status { if (!isRecord(value)) return { ...DEFAULT_STATUS }; const adminNote = typeof value.adminNote === "string" && value.adminNote.trim() ? value.adminNote.trim().slice(0, MAX_ADMIN_NOTE_LENGTH) : undefined; return { status: statuses.has(value.status as BNLStatusValue) ? value.status as BNLStatusValue : DEFAULT_STATUS.status, mode: modes.has(value.mode as BNLModeValue) ? value.mode as BNLModeValue : DEFAULT_STATUS.mode, message: typeof value.message === "string" && value.message.trim() ? value.message.trim().slice(0, MAX_MESSAGE_LENGTH) : DEFAULT_STATUS.message, currentDirective: typeof value.currentDirective === "string" && value.currentDirective.trim() ? value.currentDirective.trim().slice(0, MAX_DIRECTIVE_LENGTH) : DEFAULT_STATUS.currentDirective, source: v1Sources.has(value.source as BNLSourceValue) ? value.source as BNLSourceValue : DEFAULT_STATUS.source, adminNote, lastSeen: typeof value.lastSeen === "string" && value.lastSeen ? value.lastSeen : null }; }
export function parseV1Write(body: unknown, now: string): BNLV1Status { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["status", "mode", "message", "currentDirective", "source", "adminNote"]); const adminNote = text(body.adminNote, MAX_ADMIN_NOTE_LENGTH, false); return { status: enumValue(body.status, statuses), mode: enumValue(body.mode, modes), message: text(body.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(body.currentDirective, MAX_DIRECTIVE_LENGTH, false) ?? DEFAULT_DIRECTIVE, source: body.source === undefined ? "unknown" : enumValue(body.source, v1Sources), adminNote, lastSeen: now }; }
export function isV2Envelope(body: unknown): boolean { return isRecord(body) && body.contractVersion === 2; }
export function parseV2PresenceWrite(body: unknown, now: string): BNLV2PresenceRecord { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["contractVersion", "kind", "presence"]); if (body.contractVersion !== 2 || body.kind !== "presence" || !isRecord(body.presence)) throw new BNLContractValidationError(); exactKeys(body.presence, ["status", "mode", "source"]); return { contractVersion: 2, status: enumValue(body.presence.status, statuses), mode: enumValue(body.presence.mode, modes), source: enumValue(body.presence.source, presenceSources), receivedAt: now }; }
export function parseV2RelayWrite(body: unknown, now: string): BNLV2RelayRecord { if (!isRecord(body)) throw new BNLContractValidationError(); exactKeys(body, ["contractVersion", "kind", "relay"]); if (body.contractVersion !== 2 || body.kind !== "relay" || !isRecord(body.relay)) throw new BNLContractValidationError(); exactKeys(body.relay, ["relayId", "message", "currentDirective", "sourceClass", "trigger"]); return { contractVersion: 2, relayId: relayId(body.relay.relayId), message: text(body.relay.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(body.relay.currentDirective, MAX_DIRECTIVE_LENGTH)!, sourceClass: enumValue(body.relay.sourceClass, sourceClasses), trigger: enumValue(body.relay.trigger, triggers), publishedAt: now }; }
export function sanitizeStoredV2Presence(value: unknown): BNLV2PresenceRecord | null { if (!isRecord(value)) return null; try { exactKeys(value, ["contractVersion", "status", "mode", "source", "receivedAt"]); if (value.contractVersion !== 2 || typeof value.receivedAt !== "string") return null; return { contractVersion: 2, status: enumValue(value.status, statuses), mode: enumValue(value.mode, modes), source: enumValue(value.source, presenceSources), receivedAt: value.receivedAt }; } catch { return null; } }
export function sanitizeStoredV2Relay(value: unknown): BNLV2RelayRecord | null { if (!isRecord(value)) return null; try { exactKeys(value, ["contractVersion", "relayId", "message", "currentDirective", "sourceClass", "trigger", "publishedAt"]); if (value.contractVersion !== 2 || typeof value.publishedAt !== "string") return null; return { contractVersion: 2, relayId: relayId(value.relayId), message: text(value.message, MAX_MESSAGE_LENGTH)!, currentDirective: text(value.currentDirective, MAX_DIRECTIVE_LENGTH)!, sourceClass: enumValue(value.sourceClass, sourceClasses), trigger: enumValue(value.trigger, triggers), publishedAt: value.publishedAt }; } catch { return null; } }
export function sanitizeRelayHistory(value: unknown): BNLV2RelayRecord[] { return Array.isArray(value) ? value.map(sanitizeStoredV2Relay).filter((x): x is BNLV2RelayRecord => Boolean(x)).slice(0, 25) : []; }
export function upsertRelayHistory(history: BNLV2RelayRecord[], relay: BNLV2RelayRecord): { history: BNLV2RelayRecord[]; changed: boolean } { const existing = history.find((item) => item.relayId === relay.relayId); if (existing) { if (existing.message === relay.message && existing.currentDirective === relay.currentDirective && existing.sourceClass === relay.sourceClass && existing.trigger === relay.trigger) return { history, changed: false }; throw new BNLContractConflictError(); } return { history: [relay, ...history].slice(0, 25), changed: true }; }
export function v1Presence(v1: BNLV1Status): BNLV2PresenceRecord { return { contractVersion: 2, status: v1.status, mode: v1.mode, source: presenceSources.has(v1.source as BNLV2PresenceSource) ? v1.source as BNLV2PresenceSource : "unknown", receivedAt: v1.lastSeen ?? new Date(0).toISOString() }; }
export function v1Relay(v1: BNLV1Status): BNLV2RelayRecord | null { if (!v1.lastSeen) return null; return { contractVersion: 2, relayId: "", message: v1.message, currentDirective: v1.currentDirective, sourceClass: "grounded_reflection", trigger: v1.source === "forcePull" ? "force_pull" : "scheduled", publishedAt: v1.lastSeen }; }
export function buildCurrentView(input: { v1?: unknown; presence?: unknown; relay?: unknown; persisted: boolean }): BNLCurrentView { const legacy = sanitizeStoredV1Status(input.v1); const presence = sanitizeStoredV2Presence(input.presence) ?? v1Presence(legacy); const relay = sanitizeStoredV2Relay(input.relay) ?? v1Relay(legacy); return { status: presence.status, mode: presence.mode, message: relay?.message ?? legacy.message, currentDirective: relay?.currentDirective ?? legacy.currentDirective, source: relay?.trigger === "force_pull" ? "forcePull" : relay ? "relay" : legacy.source, lastSeen: relay?.publishedAt ?? legacy.lastSeen, persisted: input.persisted, contractVersion: 2, presence, relay }; }
export function serializePublicCurrentView(view: BNLCurrentView) { return view; }
export function errorStatus(error: unknown) { return error instanceof ContractError ? error.status : 400; }
