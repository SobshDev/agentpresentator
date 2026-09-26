import { NextRequest } from "next/server";
import { config, missingProductionConfig } from "@/lib/config";
import { acquireSlot, checkMessage, recordTokens } from "@/lib/limits";
import { mockDeltas, openReplyStream, textDeltas, UpstreamError, type Usage } from "@/lib/model";
import { systemPrompt } from "@/lib/persona";
import { clientIp, isSameOrigin, json, readJson } from "@/lib/request";
import { chatRequest } from "@/lib/schema";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const STREAM_ERROR_MARKER = "\n[[error]]";

export async function POST(request: NextRequest) {
  const missing = missingProductionConfig();
  if (missing.length) {
    console.error(`chat disabled, missing config: ${missing.join(", ")}`);
    return json({ error: "unavailable", message: "I'm offline for maintenance. Email the real me in the meantime." }, 503);
  }
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);

  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return json({ error: "session" }, 401);

  let messages;
  try {
    messages = chatRequest.parse(await readJson(request, 64 * 1024)).messages;
  } catch {
    return json({ error: "bad_request", message: "That message didn't go through. Try a shorter question." }, 400);
  }

  const ip = clientIp(request);
  let release: (() => Promise<void>) | null;
  try {
    const limit = await checkMessage(ip, session.sid);
    if (!limit.ok) return json({ error: "rate_limited", message: limit.message }, limit.status, { "retry-after": String(limit.retryAfter) });
    release = await acquireSlot(ip);
  } catch (error) {
    console.error("limit store unavailable", error instanceof Error ? error.message : error);
    return json({ error: "unavailable", message: "I'm having trouble right now. Try again in a minute." }, 503);
  }
  if (!release) return json({ error: "busy", message: "One question at a time. Let me finish my last answer." }, 429);

  const upstream = new AbortController();
  const timeout = setTimeout(() => upstream.abort(), config.upstreamTimeoutMs);
  request.signal.addEventListener("abort", () => upstream.abort());
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    await recordTokens(usage.input + usage.output + usage.cacheRead + usage.cacheWrite).catch(() => {});
    await release?.().catch(() => {});
  };

  let deltas: AsyncGenerator<string>;
  try {
    if (config.mockModel) {
      deltas = mockDeltas(messages.at(-1)!.content);
    } else {
      const response = await openReplyStream(systemPrompt(), messages, upstream.signal);
      deltas = textDeltas(response.body!, usage);
    }
  } catch (error) {
    await finish();
    const status = error instanceof UpstreamError ? error.status : 0;
    console.error(`model request failed (${status || "network"})`);
    const message =
      status === 429
        ? "Lots of people are talking to me right now. Try again in a minute."
        : "My brain is offline for a moment. Try again shortly, or email the real me.";
    return json({ error: "upstream", message }, 502);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of deltas) controller.enqueue(encoder.encode(text));
      } catch {
        if (!upstream.signal.aborted || !request.signal.aborted) controller.enqueue(encoder.encode(STREAM_ERROR_MARKER));
      } finally {
        await finish();
        try {
          controller.close();
        } catch {}
      }
    },
    async cancel() {
      upstream.abort();
      await finish();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
