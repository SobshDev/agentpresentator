import { NextRequest } from "next/server";
import { config, missingProductionConfig } from "@/lib/config";
import { checkSessionCreation } from "@/lib/limits";
import { clientIp, isSameOrigin, json, readJson } from "@/lib/request";
import { sessionRequest } from "@/lib/schema";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (missingProductionConfig().length) return json({ error: "unavailable", message: "I'm offline for maintenance." }, 503);
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  let body;
  try {
    body = sessionRequest.parse(await readJson(request, 8 * 1024));
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const ip = clientIp(request);
  try {
    const limit = await checkSessionCreation(ip);
    if (!limit.ok) return json({ error: "rate_limited", message: limit.message }, limit.status, { "retry-after": String(limit.retryAfter) });
  } catch {
    return json({ error: "unavailable", message: "I'm having trouble right now. Try again in a minute." }, 503);
  }

  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return json({ error: "challenge_failed", message: "Couldn't verify you're human. Refresh and try again." }, 403);
  }

  const { token } = createSession();
  const response = json({ ok: true });
  response.headers.append(
    "set-cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "Path=/api",
      `Max-Age=${SESSION_TTL_SECONDS}`,
      "HttpOnly",
      "SameSite=Strict",
      ...(config.isProduction ? ["Secure"] : []),
    ].join("; "),
  );
  return response;
}
