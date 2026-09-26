import type { NextRequest } from "next/server";
import { config } from "./config";

/** Client IP as seen by the closest trusted reverse proxy (Traefik on Dokploy appends it to X-Forwarded-For). */
export function clientIp(request: NextRequest): string {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (config.trustedProxyHops > 0 && forwarded.length >= config.trustedProxyHops) {
    return forwarded[forwarded.length - config.trustedProxyHops];
  }
  return request.headers.get("x-real-ip") ?? "local";
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (config.siteOrigin) return origin === config.siteOrigin;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function readJson(request: NextRequest, maxBytes: number): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new Error("content-type");
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new Error("too-large");
  return text ? JSON.parse(text) : {};
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
