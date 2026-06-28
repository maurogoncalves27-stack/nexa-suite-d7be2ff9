/**
 * Cliente HTTP Payer — fala com o agente NEXA em /payer/* (proxy para Checkout :6060).
 * Não importa nada de tef-paygo ou paygoAdapter.
 */
import { joinAgentUrl } from "../agentUrl";
import type { PayerAgentStatus, PayerDiagnostics, PayerPaymentPayload } from "./types";

export const DEFAULT_PAYER_AGENT_URL = "https://127.0.0.1:3031";

export const checkPayerAgent = async (agentUrl: string): Promise<PayerAgentStatus> => {
  try {
    const health = await fetch(joinAgentUrl(agentUrl, "/health"), {
      signal: AbortSignal.timeout(2500),
    });
    if (!health.ok) return { ok: false, online: false, error: `HTTP ${health.status}` };
    const h = await health.json().catch(() => ({}));

    const d = await payerDiagnostics(agentUrl);
    const checkoutOk = !!d.checkoutReachable;
    return {
      ok: checkoutOk,
      online: true,
      checkoutReachable: checkoutOk,
      loggedIn: !!d.loggedIn,
      hasCredentials: !!d.hasCredentials,
      baseUrl: d.baseUrl,
      version: h?.version,
      error: d.lastError ?? (!checkoutOk ? "Checkout :6060 indisponível" : undefined),
    };
  } catch (e) {
    return {
      ok: false,
      online: false,
      error: e instanceof Error ? e.message : "Agente offline",
    };
  }
};

export const payerDiagnostics = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
): Promise<PayerDiagnostics> => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/diagnostics"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerLogin = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  body?: { email?: string; password?: string },
) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
};

export const payerPayment = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  payload: PayerPaymentPayload,
) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/payment"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
};

export const payerResponse = async (agentUrl = DEFAULT_PAYER_AGENT_URL) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/response"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerAbort = async (agentUrl = DEFAULT_PAYER_AGENT_URL) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/abort"), { method: "POST" });
  return r.json();
};

export const payerCancellation = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  idPayer: string,
) =>
  payerPayment(agentUrl, {
    command: "CANCELLMENT",
    idPayer,
    wait: false,
  });
