"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { site, type Project } from "@/content/site";
import { parseReply } from "@/lib/reply";
import { turnstileToken } from "@/lib/turnstile-client";
import Avatar from "./Avatar";
import RichText from "./RichText";

const MAX_CHARS = 800;
const HISTORY_PAIRS = 10;

type Message = { id: string; role: "user" | "assistant"; raw: string; complete: boolean; error?: string };
type Phase = "idle" | "waiting" | "streaming";

const uid = () => Math.random().toString(36).slice(2, 10);

function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduced) doc.startViewTransition(() => flushSync(update));
  else update();
}

export default function Experience({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const [talking, setTalking] = useState(false);
  const [input, setInput] = useState("");
  const [topicIndex, setTopicIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const sessionReady = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const rawRef = useRef("");
  const shownRef = useRef(0);
  const streamDone = useRef(true);
  const activeId = useRef<string | null>(null);
  const stickToBottom = useRef(true);

  const chatting = messages.length > 0;
  const busy = phase !== "idle";
  const topicQuery = input.startsWith("/") ? input.slice(1).trim().toLowerCase() : null;
  const topics = useMemo(
    () => (topicQuery === null ? [] : site.topics.filter((t) => t.toLowerCase().includes(topicQuery))),
    [topicQuery],
  );

  // Typewriter: reveal streamed text at a human pace so the avatar "speaks" while words appear.
  useEffect(() => {
    if (phase !== "streaming") return;
    let frame = 0;
    let lastTalk = performance.now();
    const tick = () => {
      const target = rawRef.current.length;
      const backlog = target - shownRef.current;
      if (backlog > 0) {
        shownRef.current += Math.max(1, Math.ceil(backlog / 24));
        setShown(shownRef.current);
        lastTalk = performance.now();
        setTalking(true);
      } else if (performance.now() - lastTalk > 260) {
        setTalking(false);
      }
      if (streamDone.current && shownRef.current >= rawRef.current.length) {
        setTalking(false);
        const id = activeId.current;
        setMessages((list) => list.map((m) => (m.id === id ? { ...m, raw: rawRef.current, complete: true } : m)));
        activeId.current = null;
        setPhase("idle");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    const onScroll = () => {
      stickToBottom.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (chatting && stickToBottom.current) window.scrollTo({ top: document.body.scrollHeight });
  }, [shown, messages.length, chatting]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
        setInput("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input, chatting]);

  const ensureSession = useCallback(async () => {
    if (sessionReady.current) return;
    let token: string | undefined;
    if (turnstileSiteKey && turnstileRef.current) token = await turnstileToken(turnstileSiteKey, turnstileRef.current);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnstileToken: token }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message ?? "I couldn't start a conversation. Refresh and try again.");
    }
    sessionReady.current = true;
  }, [turnstileSiteKey]);

  const fail = (id: string, error: string) => {
    streamDone.current = true;
    setTalking(false);
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, complete: true, error } : m)));
    activeId.current = null;
    setPhase("idle");
  };

  const send = useCallback(
    async (question: string) => {
      const text = question.trim().slice(0, MAX_CHARS);
      if (!text || busy) return;

      const history: { role: "user" | "assistant"; content: string }[] = [];
      for (let i = 0; i + 1 < messages.length; i += 2) {
        const [q, a] = [messages[i], messages[i + 1]];
        if (q.role !== "user" || a.role !== "assistant" || a.error || !a.complete) continue;
        const reply = parseReply(a.raw, true).body;
        if (reply) history.push({ role: "user", content: q.raw }, { role: "assistant", content: reply });
      }
      const payload = [...history.slice(-HISTORY_PAIRS * 2), { role: "user" as const, content: text }];

      const userMessage: Message = { id: uid(), role: "user", raw: text, complete: true };
      const reply: Message = { id: uid(), role: "assistant", raw: "", complete: false };
      rawRef.current = "";
      shownRef.current = 0;
      streamDone.current = false;
      activeId.current = reply.id;
      stickToBottom.current = true;
      const commit = () => {
        setMessages((list) => [...list, userMessage, reply]);
        setShown(0);
        setInput("");
        setPhase("waiting");
      };
      if (messages.length === 0) withTransition(commit);
      else commit();

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await ensureSession();
        let response = await postChat(payload, controller.signal);
        if (response.status === 401) {
          sessionReady.current = false;
          await ensureSession();
          response = await postChat(payload, controller.signal);
        }
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          return fail(reply.id, data.message ?? "Something went wrong on my side. Try again in a moment.");
        }
        setPhase("streaming");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          rawRef.current += decoder.decode(value, { stream: true });
        }
        streamDone.current = true;
      } catch (error) {
        if (controller.signal.aborted) {
          streamDone.current = true;
          if (!rawRef.current) fail(reply.id, "Stopped.");
          else shownRef.current = rawRef.current.length;
          return;
        }
        fail(reply.id, error instanceof Error && error.message !== "turnstile" ? error.message : "I couldn't reach my brain. Check your connection and try again.");
      }
    },
    [busy, messages, ensureSession],
  );

  const stop = () => abortRef.current?.abort();

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (topics.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setTopicIndex((i) => (i + step + topics.length) % topics.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        send(topics[Math.min(topicIndex, topics.length - 1)]);
        return;
      }
    }
    if (event.key === "Escape" && topicQuery !== null) setInput("");
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (topicQuery === null) send(input);
    }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const status = phase === "waiting" ? "thinking" : talking ? "talking" : "listening";

  const composer = (
    <div className="composer-wrap">
      {topics.length > 0 && (
        <div className="topics" role="listbox" aria-label="Topics">
          <div className="topics__label">Topics</div>
          {topics.map((topic, i) => (
            <button
              key={topic}
              role="option"
              aria-selected={i === topicIndex}
              className={`topics__item${i === topicIndex ? " is-active" : ""}`}
              onMouseEnter={() => setTopicIndex(i)}
              onClick={() => send(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) stop();
          else send(input);
        }}
      >
        <textarea
          ref={inputRef}
          className="composer__input"
          value={input}
          rows={1}
          maxLength={MAX_CHARS}
          placeholder={chatting ? "Ask a follow-up…" : "Ask me anything…"}
          aria-label="Ask Gabriel's agent a question"
          onChange={(event) => {
            setInput(event.target.value);
            setTopicIndex(0);
          }}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <div className="composer__bar">
          <span className="mono muted">/ for topics</span>
          <div className="composer__actions">
            {input.length > MAX_CHARS - 150 ? (
              <span className="mono muted">
                {input.length}/{MAX_CHARS}
              </span>
            ) : (
              <span className="mono muted hide-mobile">↵ send</span>
            )}
            <button
              type="submit"
              className={`send${busy ? " send--stop" : ""}`}
              aria-label={busy ? "Stop answer" : "Send"}
              disabled={!busy && !input.trim()}
            >
              {busy ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  return (
    <div className={`page${chatting ? " page--chat" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => window.location.reload()} aria-label="Start over">
          {site.name}
        </button>
        <nav className="nav">
          <button className="nav__link" onClick={() => send("What have you shipped?")} disabled={busy}>
            Work
          </button>
          {site.resumeUrl && (
            <a className="nav__link" href={site.resumeUrl} target="_blank" rel="noopener noreferrer">
              Résumé
            </a>
          )}
          <a className="cta" href={`mailto:${site.email}`}>
            Email the real me
          </a>
        </nav>
      </header>

      {!chatting ? (
        <main className="hero">
          <div className="hero__avatar enter" style={{ ["--d" as string]: "0ms" }}>
            <Avatar talking={false} size="hero" />
          </div>
          <div className="hero__copy enter" style={{ ["--d" as string]: "90ms" }}>
            <h1>Hey, I&apos;m {site.name}.</h1>
            <p>Well, the agent version. Ask me about what I&apos;m building, how I work, or anything you&apos;d ask over coffee.</p>
          </div>
          <div className="hero__composer enter" style={{ ["--d" as string]: "180ms" }}>
            {composer}
          </div>
          <div className="chips enter" style={{ ["--d" as string]: "260ms" }}>
            {site.suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </main>
      ) : (
        <main className="chat">
          <aside className="dock" aria-live="polite">
            <Avatar talking={talking} size="dock" status={phase === "waiting" ? "thinking" : "online"} />
            <div className="dock__meta">
              <span className="dock__name">{site.name}</span>
              <span className={`mono dock__status dock__status--${status}`}>{status}</span>
            </div>
          </aside>

          <div className="thread">
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="bubble">
                    {m.raw}
                  </div>
                );
              }
              const isActive = m.id === activeId.current;
              const visible = isActive ? rawRef.current.slice(0, shown) : m.raw;
              const parsed = parseReply(visible, m.complete && !isActive);
              const project: Project | null = parsed.project ? site.projects[parsed.project] : null;
              const isLast = m.id === lastAssistant?.id;
              return (
                <article key={m.id} className="reply">
                  <img className="reply__avatar" src="/avatar/portrait-96.webp" alt="" width={28} height={28} />
                  <div className="reply__body">
                    <div className="reply__head">
                      <span className="reply__name">{site.name}</span>
                      <span className="mono muted">agent{isActive && phase === "waiting" ? " · thinking" : ""}</span>
                    </div>
                    {isActive && phase === "waiting" && (
                      <div className="thinking" aria-label="Thinking">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                    {parsed.body && (
                      <div className={`prose${isActive ? " is-streaming" : ""}`}>
                        <RichText text={parsed.body} />
                      </div>
                    )}
                    {(m.error || parsed.failed) && (
                      <p className="reply__error">
                        {m.error ?? "I lost my train of thought."}{" "}
                        <a href={`mailto:${site.email}`}>Email the real me</a>
                      </p>
                    )}
                    {project && (
                      <a
                        className={`card${project.url ? "" : " card--static"}`}
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => !project.url && e.preventDefault()}
                      >
                        {project.logo ? (
                          <img className="card__logo" src={project.logo} alt="" width={40} height={40} />
                        ) : (
                          <span className="card__mark" style={{ background: project.color }}>
                            {project.mark}
                          </span>
                        )}
                        <span className="card__text">
                          <span className="card__name">{project.name}</span>
                          <span className="card__tagline">{project.tagline}</span>
                        </span>
                        {project.url && <span className="mono muted card__link">{project.label} ↗</span>}
                      </a>
                    )}
                    {isLast && !busy && parsed.followUps.length > 0 && (
                      <div className="chips chips--inline">
                        {parsed.followUps.map((q) => (
                          <button key={q} className="chip" onClick={() => send(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="dockbar">
            {composer}
            <p className="fineprint mono">AI version of Gabriel. It can be wrong. For anything important, email the real me.</p>
          </div>
        </main>
      )}
      <div ref={turnstileRef} className="turnstile" />
    </div>
  );
}

function postChat(messages: { role: "user" | "assistant"; content: string }[], signal: AbortSignal) {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
}
