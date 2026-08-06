/**
 * Cliente HTTP Payer — usa a camada de transporte (agente Windows ou direto Android).
 * Não importa nada de tef-paygo ou paygoAdapter.
 */
import type { PayerAgentStatus, PayerDiagnostics, PayerPaymentPayload } from "./types";
import {
  payerHealth,
  payerTransportAbort,
  payerTransportDiagnostics,
  payerTransportLogin,
  payerTransportPayment,
  payerTransportResponse,
  resolvePayerTransport,
} from "./transport";

export const DEFAULT_PAYER_AGENT_URL = "https://127.0.0.1:3031";

export const checkPayerAgent = async (agentUrl: string): Promise<PayerAgentStatus> => {
  const health = await payerHealth(agentUrl);
  if (!health.online) {
    return { ok: false, online: false, error: health.error ?? "Agente offline" };
  }

  try {
    const d = await payerTransportDiagnostics(agentUrl);
    const checkoutOk = !!d.checkoutReachable;
    return {
      ok: checkoutOk,
      online: true,
      checkoutReachable: checkoutOk,
      loggedIn: !!d.loggedIn,
      hasCredentials: !!d.hasCredentials,
      baseUrl: d.baseUrl,
      version: health.version,
      error: d.lastError ?? (!checkoutOk ? "Checkout :6060 indisponível" : undefined),
    };
  } catch (e) {
    return {
      ok: false,
      online: true,
      version: health.version,
      error: e instanceof Error ? e.message : "Falha no diagnóstico Payer",
    };
  }
};

export const payerDiagnostics = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
): Promise<PayerDiagnostics> => payerTransportDiagnostics(agentUrl);

export const payerLogin = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  body?: { email?: string; password?: string },
) => payerTransportLogin(agentUrl, body);

export const payerPayment = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  payload: PayerPaymentPayload,
) => payerTransportPayment(agentUrl, payload);

export const payerResponse = async (agentUrl = DEFAULT_PAYER_AGENT_URL) =>
  payerTransportResponse(agentUrl);

export const payerAbort = async (agentUrl = DEFAULT_PAYER_AGENT_URL) =>
  payerTransportAbort(agentUrl);

export const payerCancellation = async (
  agentUrl = DEFAULT_PAYER_AGENT_URL,
  idPayer: string,
) =>
  payerPayment(agentUrl, {
    command: "CANCELLMENT",
    idPayer,
    wait: false,
  });

export { resolvePayerTransport };
