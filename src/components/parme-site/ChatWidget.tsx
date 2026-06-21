// Chat widget Giana — fetch nativo + parsing SSE da rota
// /functions/v1/parme-chat. Sem dependência do @ai-sdk/react.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import gianaAvatar from "@/assets/giana-avatar.png.asset.json";

const SESSION_KEY = "parme_chat_session_id";
const DISMISS_KEY = "parme_chat_proactive_dismissed";
const PROACTIVE_DELAY_MS = 20_000;
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s)]+)/gi;

const FN_URL = `${
  import.meta.env.VITE_SUPABASE_URL ?? "https://ixjgmerxxakdkfdzgumy.supabase.co"
}/functions/v1/parme-chat`;
const ANON = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amdtZXJ4eGFrZGtmZHpndW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Nzc0MDcsImV4cCI6MjA5NTM1MzQwN30.P6TOFgTyYCz1BpDiPZKucHwBAE8CMo8JqId7s4sYtAA"
) as string;

function getSessionId() {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

function linkify(text: string): ReactNode[] {
  const parts = text.split(URL_REGEX);
  const matches = text.match(URL_REGEX) ?? [];
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) out.push(part);
    const raw = matches[i];
    if (!raw) return;
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    if (/ifood\.com/i.test(href)) {
      out.push(
        <a
          key={`l-${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="my-1 inline-flex items-center gap-2 rounded-full bg-[#EA1D2C] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          🛵 Pedir no iFood
        </a>,
      );
    } else {
      out.push(
        <a
          key={`l-${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          {raw}
        </a>,
      );
    }
  });
  return out;
}

function extractStreamText(data: string) {
  if (!data || data === "[DONE]") return "";
  try {
    const ev = JSON.parse(data) as {
      type?: string;
      delta?: string;
      text?: string;
      part?: { type?: string; text?: string };
    };
    if (ev.type === "text-delta" && ev.delta) return ev.delta;
    if ((ev.type === "text" || ev.type === "text-start") && ev.text) return ev.text;
    if (ev.part?.type === "text" && ev.part.text) return ev.part.text;
  } catch {
    const legacy = data.match(/^\d+:(.*)$/s);
    if (legacy?.[1]) {
      try {
        const decoded = JSON.parse(legacy[1]) as string;
        return typeof decoded === "string" ? decoded : "";
      } catch {
        return legacy[1];
      }
    }
  }
  return "";
}

function readStreamEvent(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";
  return trimmed.slice(5).trim();
}

type ChatMsg = { id: string; role: "user" | "assistant"; content: string };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const t = window.setTimeout(() => {
      setShowInvite((p) => (open ? p : true));
    }, PROACTIVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const dismissInvite = () => {
    setShowInvite(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: ChatMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);

    const assistantId = `a_${Date.now()}`;
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const payload = {
        sessionId: getSessionId(),
        messages: next.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        })),
      };
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45_000);
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ANON ? { apikey: ANON } : {}),
          ...(ANON ? { Authorization: `Bearer ${ANON}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = readStreamEvent(line);
          if (!data || data === "[DONE]") continue;
          const delta = extractStreamText(data);
          if (delta) {
            acc += delta;
            setMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, content: acc } : x))
            );
          }
        }
      }
      const finalData = readStreamEvent(buffer);
      const finalDelta = extractStreamText(finalData);
      if (finalDelta) {
        acc += finalDelta;
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, content: acc } : x))
        );
      }
      if (!acc.trim()) throw new Error("Resposta vazia da Giana");
    } catch (e) {
      console.error("[ChatWidget] err:", e);
      setMessages((m) =>
        m.map((x) =>
          x.id === assistantId
            ? {
                ...x,
                content:
                  "Oi! Tive um soluço aqui 😅 tenta de novo daqui a pouquinho?",
              }
            : x
        )
      );
    } finally {
      setBusy(false);
    }
  }

  function parseInline(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const pattern = /(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(...linkify(text.slice(lastIndex, match.index)));
      }
      const raw = match[0];
      const isBold = raw.startsWith("**");
      const content = raw.slice(isBold ? 2 : 1, isBold ? -2 : -1);
      const el = isBold
        ? <strong key={`b-${match.index}`} className="font-semibold">{content}</strong>
        : <em key={`i-${match.index}`} className="italic">{content}</em>;
      nodes.push(el);
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      nodes.push(...linkify(text.slice(lastIndex)));
    }
    return nodes;
  }

  function renderChunks(text: string) {
    return text
      .split(/\n{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  return (
    <>
      {showInvite && !open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(280px,calc(100vw-2.5rem))]">
          <div className="relative rounded-2xl rounded-br-sm border border-[hsl(var(--parme-border))] bg-white p-4 pr-8 shadow-2xl">
            <button
              type="button"
              onClick={dismissInvite}
              className="absolute right-2 top-2 rounded-full p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="font-script text-2xl text-brand-red">Oi, tudo bem?</p>
            <p className="mt-1 text-sm text-gray-700">
              Posso recomendar um prato, reservar uma mesa ou tirar dúvidas. 😉
            </p>
            <button
              type="button"
              onClick={() => {
                dismissInvite();
                setOpen(true);
              }}
              className="mt-3 rounded-full bg-brand-red px-3 py-1.5 text-xs font-semibold text-white"
            >
              Bora conversar
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((v) => !v);
          dismissInvite();
        }}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-red text-white shadow-2xl ring-4 ring-brand-red/20 transition hover:scale-105"
        aria-label="Abrir chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[70vh] max-h-[600px] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-[hsl(var(--parme-border))] bg-white shadow-2xl">
          <header className="flex items-center gap-3 border-b border-[hsl(var(--parme-border))] bg-brand-red px-4 py-3 text-white">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/35">
              <img
                src={gianaAvatar.url}
                alt="Giana"
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
            <div className="flex-1">
              <p className="font-display text-base leading-tight">Giana</p>
              <p className="text-[11px] opacity-80">
                {busy ? "digitando..." : "Tira dúvida, recomenda prato e reserva mesa"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Fechar chat"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto bg-[hsl(var(--parme-cream))] p-4"
          >
            {messages.length === 0 && (
              <div className="space-y-3 py-6 text-center text-sm text-gray-600">
                <p className="font-script text-2xl text-brand-red">Oi, tudo bem?</p>
                <p>
                  Posso recomendar um prato, tirar dúvida do cardápio ou reservar
                  sua mesa.
                </p>
                <p className="text-xs">
                  Quer pedir delivery? Estamos no iFood 🛵
                </p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m) => {
                const chunks = renderChunks(m.content);
                if (chunks.length === 0 && busy && m.role === "assistant") {
                  return (
                    <div key={m.id} className="flex">
                      <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm shadow-sm">
                        <span className="parme-shimmer">Pensando…</span>
                      </div>
                    </div>
                  );
                }
                return chunks.map((c, i) => (
                  <div
                    key={`${m.id}-${i}`}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${
                        m.role === "user"
                          ? "rounded-br-sm bg-brand-red text-white"
                          : "rounded-bl-sm bg-white text-gray-800"
                      }`}
                    >
                      {parseInline(c)}
                    </div>
                  </div>
                ));
              })}
            </div>
          </div>

          <form
            className="flex items-center gap-2 border-t border-[hsl(var(--parme-border))] bg-white p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte alguma coisa..."
              className="flex-1 rounded-full border border-[hsl(var(--parme-border))] bg-white px-4 py-2 text-sm outline-none focus:border-brand-red"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-red text-white shadow disabled:opacity-50"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
