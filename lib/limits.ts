import Redis from "ioredis";
import { config } from "./config";

interface CounterStore {
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

class MemoryStore implements CounterStore {
  private values = new Map<string, { value: number; expiresAt: number }>();

  async incrBy(key: string, amount: number, ttlSeconds: number) {
    const now = Date.now();
    const current = this.values.get(key);
    const entry = current && current.expiresAt > now ? current : { value: 0, expiresAt: now + ttlSeconds * 1000 };
    entry.value += amount;
    this.values.set(key, entry);
    if (this.values.size > 10_000) this.sweep(now);
    return entry.value;
  }

  async get(key: string) {
    const entry = this.values.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.value : 0;
  }

  private sweep(now: number) {
    for (const [key, entry] of this.values) if (entry.expiresAt <= now) this.values.delete(key);
  }
}

class RedisStore implements CounterStore {
  constructor(private redis: Redis) {}

  async incrBy(key: string, amount: number, ttlSeconds: number) {
    const result = await this.redis.multi().incrby(key, amount).expire(key, ttlSeconds, "NX").exec();
    const value = result?.[0]?.[1];
    return typeof value === "number" ? value : Number(value ?? 0);
  }

  async get(key: string) {
    return Number((await this.redis.get(key)) ?? 0);
  }
}

const globalStore = globalThis as unknown as { __agentStore?: CounterStore };

function store(): CounterStore {
  if (!globalStore.__agentStore) {
    globalStore.__agentStore = config.redisUrl
      ? new RedisStore(new Redis(config.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false }))
      : new MemoryStore();
  }
  return globalStore.__agentStore;
}

export type LimitResult = { ok: true } | { ok: false; status: number; message: string; retryAfter: number };

const HOUR = 3600;
const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const windowKey = (name: string, id: string, size: number) => `ap:${name}:${id}:${Math.floor(now() / size)}`;
const untilNext = (size: number) => size - (now() % size);

async function hit(name: string, id: string, size: number, max: number): Promise<boolean> {
  const count = await store().incrBy(windowKey(name, id, size), 1, size + 60);
  return count <= max;
}

const busy = (message: string, retryAfter: number, status = 429): LimitResult => ({ ok: false, status, message, retryAfter });

export async function checkSessionCreation(ip: string): Promise<LimitResult> {
  if (!(await hit("sess", ip, HOUR, config.limits.sessionsPerIpHour))) {
    return busy("Too many new conversations from your network. Try again a bit later.", untilNext(HOUR));
  }
  return { ok: true };
}

export async function checkMessage(ip: string, sessionId: string): Promise<LimitResult> {
  const { limits } = config;
  if ((await store().get(windowKey("tok", "all", DAY))) >= limits.tokensPerDay) {
    return busy("I've talked a lot today and need a rest. Come back tomorrow, or email the real me.", untilNext(DAY), 503);
  }
  if (!(await hit("msg", "all", DAY, limits.messagesPerDay))) {
    return busy("I've talked a lot today and need a rest. Come back tomorrow, or email the real me.", untilNext(DAY), 503);
  }
  if (!(await hit("ipd", ip, DAY, limits.messagesPerIpDay))) {
    return busy("That's a lot of questions for one day. Let's pick this up tomorrow, or email the real me.", untilNext(DAY));
  }
  if (!(await hit("iph", ip, HOUR, limits.messagesPerIpHour)) || !(await hit("sesh", sessionId, HOUR, limits.messagesPerSessionHour))) {
    return busy("You're asking faster than I can think. Give me a few minutes.", untilNext(HOUR));
  }
  return { ok: true };
}

/** Returns a release function, or null when this IP already has too many replies in flight. */
export async function acquireSlot(ip: string): Promise<(() => Promise<void>) | null> {
  const key = `ap:cc:${ip}`;
  const count = await store().incrBy(key, 1, 120);
  const release = async () => {
    await store().incrBy(key, -1, 120);
  };
  if (count > config.limits.concurrentPerIp) {
    await release();
    return null;
  }
  return release;
}

export async function recordTokens(tokens: number) {
  if (tokens > 0) await store().incrBy(windowKey("tok", "all", DAY), Math.ceil(tokens), DAY + 60);
}
