import { payerPayment, payerResponse } from "@/lib/tef/payer";
import type { PayerPaymentPayload } from "@/lib/tef/payer";

export type PayerFlowResult = {
  status: "approved" | "rejected" | "aborted" | "error";
  message: string;
  retorno?: Record<string, unknown>;
  idPayer?: string;
};

const FINAL = new Set(["APPROVED", "REJECTED", "ABORTED"]);

export const extractIdPayer = (retorno: Record<string, unknown> | undefined): string | undefined => {
  if (!retorno) return undefined;
  const id = retorno.idPayer ?? retorno._id;
  return id != null ? String(id) : undefined;
};

export async function runPayerPaymentFlow(
  agentUrl: string,
  payload: PayerPaymentPayload,
  onProgress?: (msg: string) => void,
): Promise<PayerFlowResult> {
  onProgress?.("Enviando ordem ao Checkout Payer...");
  const start = await payerPayment(agentUrl, { wait: false, ...payload });
  if (!start?.ok) {
    return { status: "error", message: start?.error || "Falha ao iniciar operação" };
  }

  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    try {
      const data = await payerResponse(agentUrl);
      const st = String(data?.retorno?.statusTransaction ?? "");
      if (st === "PENDING" || !st) {
        onProgress?.("Aguardando Checkout Payer...");
      } else if (FINAL.has(st)) {
        const retorno = (data.retorno ?? {}) as Record<string, unknown>;
        const idPayer = extractIdPayer(retorno);
        if (st === "APPROVED") {
          return {
            status: "approved",
            message: "Operação aprovada",
            retorno,
            idPayer,
          };
        }
        if (st === "ABORTED") {
          return { status: "aborted", message: "Operação abortada", retorno, idPayer };
        }
        return {
          status: "rejected",
          message: String(retorno.message ?? "Operação recusada"),
          retorno,
          idPayer,
        };
      }
    } catch {
      /* segue polling */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return { status: "error", message: "Timeout aguardando Checkout Payer" };
}

export async function pollPayerResponse(
  agentUrl: string,
  onProgress?: (msg: string) => void,
): Promise<PayerFlowResult> {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    try {
      const data = await payerResponse(agentUrl);
      const st = String(data?.retorno?.statusTransaction ?? "");
      if (st === "PENDING" || !st) {
        onProgress?.("Aguardando Checkout Payer...");
      } else if (FINAL.has(st)) {
        const retorno = (data.retorno ?? {}) as Record<string, unknown>;
        const idPayer = extractIdPayer(retorno);
        if (st === "APPROVED") {
          return { status: "approved", message: "Operação aprovada", retorno, idPayer };
        }
        if (st === "ABORTED") {
          return { status: "aborted", message: "Operação abortada", retorno, idPayer };
        }
        return {
          status: "rejected",
          message: String(retorno.message ?? "Operação recusada"),
          retorno,
          idPayer,
        };
      }
    } catch {
      /* segue polling */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { status: "error", message: "Timeout aguardando Checkout Payer" };
}
