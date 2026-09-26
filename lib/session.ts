import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export const SESSION_COOKIE = "ap_session";
export const SESSION_TTL_SECONDS = 2 * 60 * 60;

const devSecret = randomBytes(32).toString("hex");
const secret = () => config.sessionSecret || devSecret;

type Session = { sid: string; exp: number };

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function createSession(): { token: string; session: Session } {
  const session = { sid: randomBytes(16).toString("base64url"), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `${data}.${sign(data)}`, session };
}

export function readSession(token: string | undefined): Session | null {
  if (!token || token.length > 512) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const session = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Session;
    if (typeof session.sid !== "string" || typeof session.exp !== "number") return null;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}
