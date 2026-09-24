import { Redis } from "@upstash/redis";

// Private website-auth records. Never add these keys to queue/public BNL projections.
const PREFIX = "barcode:auth:discord:v1:";
export const DISCORD_CONNECTION_CAS = `
local old = redis.call('GET', KEYS[1]) or ''
if old ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1])
else redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end
return 1
`;

export interface DiscordConnectionStore {
  read(id: string): Promise<string | null>;
  compareAndSet(id: string, previous: string | null, next: string | null, ttl: number): Promise<boolean>;
  allowStart(ipHash: string, minute: number): Promise<boolean>;
}

export function discordConnectionStore(): DiscordConnectionStore {
  function redis() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Connection storage unavailable.");
    return new Redis({ url, token, automaticDeserialization: false, retry: false, signal: AbortSignal.timeout(1500) });
  }
  return {
    read: (id) => redis().get<string>(PREFIX + id),
    compareAndSet: async (id, previous, next, ttl) => Number(await redis().eval(
      DISCORD_CONNECTION_CAS, [PREFIX + id], [previous ?? "", next ?? "", ttl],
    )) === 1,
    allowStart: async (ipHash, minute) => Number(await redis().eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n",
      [PREFIX + "rate:" + ipHash + ":" + minute], [],
    )) <= 10,
  };
}
