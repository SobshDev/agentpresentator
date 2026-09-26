import { z } from "zod";

export const MAX_USER_CHARS = 800;

const message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(6000),
});

export const chatRequest = z
  .object({ messages: z.array(message).min(1).max(24) })
  .superRefine(({ messages }, ctx) => {
    messages.forEach((m, i) => {
      if (m.role !== (i % 2 === 0 ? "user" : "assistant")) {
        ctx.addIssue({ code: "custom", message: "Messages must alternate, starting with the visitor." });
      }
      if (m.role === "user" && m.content.length > MAX_USER_CHARS) {
        ctx.addIssue({ code: "custom", message: `Keep questions under ${MAX_USER_CHARS} characters.` });
      }
    });
    if (messages.at(-1)?.role !== "user") ctx.addIssue({ code: "custom", message: "The last message must be the visitor's." });
  });

export type ChatMessage = z.infer<typeof message>;

export const sessionRequest = z.object({ turnstileToken: z.string().max(4096).optional() });
