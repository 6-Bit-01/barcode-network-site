import { Redis } from "@upstash/redis";
import { AdminTokenPayload } from "@/lib/auth";

type AuditAction = "admin.live.update";

type AuditEntry = {
  action: AuditAction;
  actorRole: string;
  actorSub: string;
  target: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const AUDIT_KEY = "admin:audit:events";
const MAX_AUDIT_EVENTS = 200;
const memoryAuditLog: AuditEntry[] = [];

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function writeAdminAuditLog(
  actor: AdminTokenPayload,
  action: AuditAction,
  target: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const entry: AuditEntry = {
    action,
    actorRole: actor.role,
    actorSub: actor.sub,
    target,
    metadata,
    createdAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    await redis.lpush(AUDIT_KEY, JSON.stringify(entry));
    await redis.ltrim(AUDIT_KEY, 0, MAX_AUDIT_EVENTS - 1);
    return;
  }

  memoryAuditLog.unshift(entry);
  if (memoryAuditLog.length > MAX_AUDIT_EVENTS) {
    memoryAuditLog.length = MAX_AUDIT_EVENTS;
  }
}
