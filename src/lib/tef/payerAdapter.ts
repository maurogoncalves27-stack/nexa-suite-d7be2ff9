import { joinAgentUrl } from "./agentUrl";

const AGENT_URL = "https://127.0.0.1:3031";

export type PayerDiagnostics = {
  ok?: boolean;
  baseUrl?: string;
  hasCredentials?: boolean;
  loggedIn?: boolean;
  checkoutReachable?: boolean;
  lastError?: string | null;
};

export type PayerPaymentPayload = {
  value: number;
  paymentMethod?: string;
  paymentType?: string;
  paymentMethodSubType?: string;
  installments?: number;
  wait?: boolean;
  email?: string;
  password?: string;
};

export const payerDiagnostics = async (agentUrl = AGENT_URL): Promise<PayerDiagnostics> => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/diagnostics"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerLogin = async (
  agentUrl = AGENT_URL,
  body?: { email?: string; password?: string },
) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
};

export const payerPayment = async (agentUrl = AGENT_URL, payload: PayerPaymentPayload) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/payment"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
};

export const payerResponse = async (agentUrl = AGENT_URL) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/response"), {
    signal: AbortSignal.timeout(5000),
  });
  return r.json();
};

export const payerAbort = async (agentUrl = AGENT_URL) => {
  const r = await fetch(joinAgentUrl(agentUrl, "/payer/abort"), { method: "POST" });
  return r.json();
};
