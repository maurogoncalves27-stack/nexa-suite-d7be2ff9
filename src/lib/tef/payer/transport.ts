/**
 * Camada de transporte do Payer.
 *
 * - "agent"  → Windows/Electron: fala com o NEXA ACBr Agent (https://127.0.0.1:3031)
 *              que faz proxy para o Checkout Payer na 6060.
 * - "direct" → Android (APK Capacitor na Gertec GPOS780): não existe agente,
 *              o app fala direto com o Checkout Payer em http://127.0.0.1:6060.
 *
 * Ambos devolvem o MESMO formato ({ ok, retorno, error }) para que o adapter TEF,
 * os hooks e as telas de homologação continuem inalterados.
 */
import { joinAgentUrl } from "../agentUrl";
import type { PayerDiagnostics, PayerPaymentPayload } from "./types";

export type PayerTransportMode = "agent" | "direct";

export const DEFAULT_PAYER_DIRECT_URL = "http://127.0.0.1:6060";

const MODE_STORAGE_KEY = "nexa-payer-transport";
const DIRECT_URL_STORAGE_KEY = "nexa-payer-direct-url";

type Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  retorno?: T;
  error?: string;
};

const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** true quando o app roda dentro do wrapper Capacitor (APK da SmartPOS). */
export const isNativeShell = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } })
    .Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return !!cap.platform && cap.platform !== "web";
};

/** Modo efetivo: override manual em localStorage > detecção automática. */
export const resolvePayerTransport = (): PayerTransportMode => {
  const override = readLocal(MODE_STORAGE_KEY);
  if (override === "agent" || override === "direct") return override;
  return isNativeShell() ? "direct" : "agent";
};

export const setPayerTransport = (mode: PayerTransportMode | "auto") => {
  try {
    if (mode === "auto") localStorage.removeItem(MODE_STORAGE_KEY);
    else localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
};

/** URL do Checkout Payer local usada no modo direto. */
export const getPayerDirectUrl = (): string =>
  (readLocal(DIRECT_URL_STORAGE_KEY) || DEFAULT_PAYER_DIRECT_URL).replace(/\/+$/, "");

export const setPayerDirectUrl = (url: string) => {
  try {
    const v = (url || "").trim();
    if (!v) localStorage.removeItem(DIRECT_URL_STORAGE_KEY);
    else localStorage.setItem(DIRECT_URL_STORAGE_KEY, v.replace(/\/+$/, ""));
  } catch {
    /* ignore */
  }
};

// ---------------------------------------------------------------- direct mode

const directFetch = async (
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> => {
  const { timeoutMs = 8000, ...rest } = init;
  const res = await fetch(`${getPayerDirectUrl()}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers || {}) },
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const msg = (data.message as string) || (data.error as string) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
};

const directIsLoggedIn = async (): Promise<boolean> => {
  try {
    const d = await directFetch("/Client/login", { method: "GET", timeoutMs: 4000 });
    return !!(
      d.loggedIn ??
      d.isLoggedIn ??
      d.authenticated ??
      String(d.status ?? "").toUpperCase() === "ACTIVE"
    );
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- API pública

export const payerHealth = async (
  agentUrl: string,
): Promise<{ online: boolean; version?: string; error?: string }> => {
  if (resolvePayerTransport() === "direct") {
    try {
      await directFetch("/Client/login", { method: "GET", timeoutMs: 4000 });
      return { online: true, version: "checkout-direct" };
    } catch (e) {
      // 401/403 já viram erro aqui, mas indicam serviço no ar
      const msg = e instanceof Error ? e.message : String(e);
      if (/40[13]/.test(msg)) return { online: true, version: "checkout-direct" };
      return { online: false, error: msg };
    }
  }
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/health"), { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { online: false, error: `HTTP ${r.status}` };
    const h = (await r.json().catch(() => ({}))) as { version?: string };
    return { online: true, version: h?.version };
  } catch (e) {
    return { online: false, error: e instanceof Error ? e.message : "Agente offline" };
  }
};

export const payerTransportDiagnostics = async (agentUrl: string): Promise<PayerDiagnostics> => {
  if (resolvePayerTransport() === "direct") {
    const baseUrl = getPayerDirectUrl();
    try {
      const loggedIn = await directIsLoggedIn();
      return {
        ok: true,
        baseUrl,
        checkoutReachable: true,
        loggedIn,
        // No Android as credenciais ficam no próprio app Checkout Payer.
        hasCredentials: true,
        lastError: null,
      };
    } catch (e) {
      return {
        ok: false,
        baseUrl,
        checkoutReachable: false,
        loggedIn: false,
        hasCredentials: true,
        lastError: e instanceof Error ? e.message : String(e),
      };
    }
  }
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/diagnostics"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerTransportLogin = async (
  agentUrl: string,
  body?: { email?: string; password?: string },
): Promise<Envelope> => {
  if (resolvePayerTransport() === "direct") {
    if (!body?.email || !body?.password) {
      const already = await directIsLoggedIn();
      if (already) return { ok: true, retorno: { alreadyLoggedIn: true } };
      return { ok: false, error: "Faça login no app Checkout Payer do terminal." };
    }
    try {
      const retorno = await directFetch("/Client/login", { method: "POST", body: JSON.stringify(body) });
      return { ok: true, retorno };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
};

export const payerTransportPayment = async (
  agentUrl: string,
  payload: PayerPaymentPayload | Record<string, unknown>,
): Promise<Envelope> => {
  if (resolvePayerTransport() === "direct") {
    const body: Record<string, unknown> = { ...payload };
    delete body.email;
    delete body.password;
    delete body.wait;
    if (!body.command) body.command = "PAYMENT";
    try {
      const retorno = await directFetch("/Client/request", {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 15000,
      });
      return { ok: true, retorno };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/payment"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
};

export const payerTransportResponse = async (agentUrl: string): Promise<Envelope> => {
  if (resolvePayerTransport() === "direct") {
    try {
      const retorno = await directFetch("/Client/response", { method: "GET", timeoutMs: 5000 });
      return { ok: true, retorno };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/response"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerTransportAbort = async (agentUrl: string): Promise<Envelope> => {
  if (resolvePayerTransport() === "direct") {
    try {
      const retorno = await directFetch("/Client/request/abort", {
        method: "POST",
        body: JSON.stringify({ command: "ABORT" }),
      });
      return { ok: true, retorno };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/abort"), { method: "POST" });
  return r.json();
};
