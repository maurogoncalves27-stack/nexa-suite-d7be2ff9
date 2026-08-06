/**
 * Adapter TEF Payer — Checkout API Localhost via NEXA ACBr Agent.
 * POST /payer/payment (wait: false) + poll GET /payer/response até status final.
 */
import { payerTransportAbort, payerTransportPayment, payerTransportResponse } from "./transport";
import type {
  TefAdapter,
  TefConfig,
  TefPaymentRequest,
  TefPaymentResult,
  TefStatus,
} from "../types";

const FINAL_STATUSES = new Set(["APPROVED", "REJECTED", "ABORTED"]);
const POLL_MS = 400;
const POLL_TIMEOUT_MS = 600_000;

type PayerResponseBody = {
  ok?: boolean;
  retorno?: Record<string, unknown>;
  error?: string;
};

const pickStatus = (data: PayerResponseBody): string | undefined => {
  const r = data.retorno;
  if (!r) return undefined;
  const st = r.statusTransaction ?? r.status;
  return st != null ? String(st) : undefined;
};

const mapPayerResult = (retorno: Record<string, unknown>): TefPaymentResult => {
  const statusTx = String(retorno.statusTransaction ?? retorno.status ?? "");
  const message =
    (retorno.message as string | undefined) ||
    (retorno.mensagem as string | undefined) ||
    undefined;

  if (statusTx === "APPROVED") {
    return {
      status: "approved",
      message: message ?? "Pagamento aprovado",
      nsu: String(retorno.nsu ?? retorno.NSU ?? retorno.hostNsu ?? "") || undefined,
      authorizationCode:
        String(retorno.authorizationCode ?? retorno.codigoAutorizacao ?? "") || undefined,
      cardBrand: String(retorno.cardBrand ?? retorno.bandeira ?? "") || undefined,
      cardLast4: String(retorno.cardLast4 ?? retorno.ultimosDigitos ?? "") || undefined,
      installments: Number(retorno.installments ?? retorno.parcelas ?? 1) || 1,
      acquirer: String(retorno.acquirer ?? retorno.adquirente ?? "Payer") || undefined,
      customerReceipt: String(retorno.customerReceipt ?? retorno.comprovanteCliente ?? "") || undefined,
      merchantReceipt: String(retorno.merchantReceipt ?? retorno.comprovanteLoja ?? "") || undefined,
      raw: retorno,
    };
  }

  if (statusTx === "ABORTED") {
    return { status: "cancelled", message: message ?? "Operação abortada", raw: retorno };
  }

  if (statusTx === "REJECTED") {
    return { status: "declined", message: message ?? "Pagamento recusado", raw: retorno };
  }

  return { status: "error", message: message ?? `Status Payer inesperado: ${statusTx}`, raw: retorno };
};

const buildPaymentPayload = (req: TefPaymentRequest): Record<string, unknown> => {
  const value = Number(req.amount.toFixed(2));
  if (req.method === "pix") {
    return { value, paymentMethod: "PIX", wait: false };
  }
  if (req.method === "debit") {
    return {
      value,
      paymentMethod: "CARD",
      paymentType: "DEBIT",
      paymentMethodSubType: "FULL_PAYMENT",
      wait: false,
    };
  }
  const installments = req.installments && req.installments > 1 ? req.installments : 1;
  return {
    value,
    paymentMethod: "CARD",
    paymentType: "CREDIT",
    paymentMethodSubType: installments > 1 ? "INSTALLMENT" : "FULL_PAYMENT",
    installments,
    wait: false,
  };
};

export const createPayerTefAdapter = (config: TefConfig): TefAdapter => {
  let aborted = false;

  return {
    provider: "payer",
    async processPayment(req: TefPaymentRequest, onStatus?: (s: TefStatus, m?: string) => void) {
      aborted = false;
      onStatus?.("connecting", "Conectando ao Checkout Payer...");
      await new Promise((r) => setTimeout(r, 200));

      const startResp = (await payerTransportPayment(
        config.agentUrl,
        buildPaymentPayload(req),
      )) as PayerResponseBody;

      if (!startResp.ok) {
        const msg = startResp.error ?? "Falha ao iniciar pagamento Payer";
        onStatus?.("error", msg);
        return { status: "error", message: msg, raw: startResp };
      }

      onStatus?.("waiting_card", "Aguardando pagamento no Checkout Payer...");
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      while (!aborted && Date.now() < deadline) {
        let pollData: PayerResponseBody = {};
        try {
          pollData = (await payerTransportResponse(config.agentUrl)) as PayerResponseBody;
        } catch {
          await new Promise((r) => setTimeout(r, POLL_MS));
          continue;
        }

        const st = pickStatus(pollData);
        if (st === "PENDING" || !st) {
          onStatus?.("processing", "Aguardando Checkout Payer...");
        } else if (FINAL_STATUSES.has(st)) {
          const retorno = (pollData.retorno ?? {}) as Record<string, unknown>;
          const result = mapPayerResult(retorno);
          onStatus?.(result.status, result.message);
          return result;
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (aborted) {
        onStatus?.("cancelled", "Pagamento cancelado");
        return { status: "cancelled", message: "Pagamento cancelado" };
      }

      onStatus?.("timeout", "Timeout aguardando Checkout Payer");
      return { status: "timeout", message: "Timeout aguardando resposta do Checkout Payer" };
    },
    async cancel() {
      aborted = true;
      try {
        await payerTransportAbort(config.agentUrl);
      } catch {
        /* best effort */
      }
    },
  };
};
