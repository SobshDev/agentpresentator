const positiveInt = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const isProduction = process.env.NODE_ENV === "production";
const modelApiKey = process.env.MODEL_API_KEY ?? "";

export const config = {
  isProduction,
  modelBaseUrl: (process.env.MODEL_BASE_URL ?? "").replace(/\/+$/, ""),
  modelApiKey,
  modelId: process.env.MODEL_ID ?? "claude-sonnet-4-6",
  maxOutputTokens: positiveInt("MAX_OUTPUT_TOKENS", 700),
  upstreamTimeoutMs: positiveInt("UPSTREAM_TIMEOUT_MS", 60_000),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  siteOrigin: (process.env.SITE_ORIGIN ?? "").replace(/\/+$/, ""),
  trustedProxyHops: process.env.TRUSTED_PROXY_HOPS === "0" ? 0 : positiveInt("TRUSTED_PROXY_HOPS", 1),
  limits: {
    sessionsPerIpHour: positiveInt("LIMIT_SESSIONS_PER_IP_HOUR", 12),
    messagesPerSessionHour: positiveInt("LIMIT_MESSAGES_PER_SESSION_HOUR", 30),
    messagesPerIpHour: positiveInt("LIMIT_MESSAGES_PER_IP_HOUR", 40),
    messagesPerIpDay: positiveInt("LIMIT_MESSAGES_PER_IP_DAY", 120),
    concurrentPerIp: positiveInt("LIMIT_CONCURRENT_PER_IP", 2),
    messagesPerDay: positiveInt("LIMIT_MESSAGES_PER_DAY", 1500),
    tokensPerDay: positiveInt("LIMIT_TOKENS_PER_DAY", 2_000_000),
  },
  /** Local development without a model key streams canned answers so the UI can be worked on offline. */
  mockModel: !modelApiKey && !isProduction,
};

export function missingProductionConfig(): string[] {
  if (!isProduction) return [];
  const missing: string[] = [];
  if (!config.modelBaseUrl) missing.push("MODEL_BASE_URL");
  if (!config.modelApiKey) missing.push("MODEL_API_KEY");
  if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ chars)");
  if (!config.redisUrl) missing.push("REDIS_URL");
  if (!config.siteOrigin) missing.push("SITE_ORIGIN");
  return missing;
}
