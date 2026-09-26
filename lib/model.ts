import { config } from "./config";
import type { ChatMessage } from "./schema";

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`upstream ${status}`);
  }
}

/** Opens a streaming Anthropic Messages request against shared_router (or any Anthropic-compatible base URL). */
export async function openReplyStream(system: string, messages: ChatMessage[], signal: AbortSignal): Promise<Response> {
  const response = await fetch(`${config.modelBaseUrl}/v1/messages`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.modelApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: config.maxOutputTokens,
      stream: true,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new UpstreamError(response.status);
  }
  return response;
}

/** Yields text deltas from an Anthropic SSE body and reports token usage when the stream ends. */
export async function* textDeltas(body: ReadableStream<Uint8Array>, usage: Usage): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let event: any;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.type === "message_start") {
          const u = event.message?.usage ?? {};
          usage.input = u.input_tokens ?? 0;
          usage.cacheRead = u.cache_read_input_tokens ?? 0;
          usage.cacheWrite = u.cache_creation_input_tokens ?? 0;
          usage.output = u.output_tokens ?? 0;
        } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield event.delta.text as string;
        } else if (event.type === "message_delta" && event.usage) {
          usage.output = event.usage.output_tokens ?? usage.output;
        } else if (event.type === "error") {
          throw new UpstreamError(502);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Canned replies for local UI work when no model key is configured. */
export async function* mockDeltas(question: string): AsyncGenerator<string> {
  const reply = `(Local preview: no model key is configured, so this is a canned answer.)

Right now I'm building **Mentem**. It runs your AI agents in the cloud, so they keep working when your laptop sleeps or your connection drops. They can reach out to people on LinkedIn, code your project, or even do your homework.

You asked: "${question.slice(0, 120)}". Once the router key is set, the real agent answers here.
[[project:mentem]]
>> Who is Mentem for? | What did you ship before? | How can I reach you?`;
  for (const token of reply.match(/\S+\s*/g) ?? []) {
    await new Promise((resolve) => setTimeout(resolve, 18 + Math.random() * 40));
    yield token;
  }
}
