/** Utilitários de exibição para pendências PayGo na UI. */

const PENDING_REASON_LABELS: Record<string, string> = {
  "pendingConfirmation": "PayGo informou transação pendente de confirmação.",
  "falha-comunicacao-pendente": "Venda autorizada no pinpad, mas a conexão com o PayGo caiu antes da confirmação final.",
  "falha-comunicacao-host": "Falha de comunicação com o PayGo; a transação pode estar pendente de confirmação.",
  "cnfReq=1": "PayGo solicitou confirmação manual da transação.",
};

export type PendingModalKind = "agent_recovery" | "manual_confirmation";

export function formatPendingReason(reason?: string | null): string {
  const raw = String(reason || "").trim();
  if (!raw) return "Transação pendente de confirmação no PayGo.";
  if (PENDING_REASON_LABELS[raw]) return PENDING_REASON_LABELS[raw];
  if (/pendente de confirma/i.test(raw)) return raw;
  return raw.replace(/-/g, " ");
}

export function resolvePendingModalKind(reason?: string | null, fromAgentSync?: boolean): PendingModalKind {
  const r = String(reason || "");
  if (
    fromAgentSync
    || r === "falha-comunicacao-pendente"
    || r === "falha-comunicacao-host"
    || r === "pendingConfirmation"
    || /conex[aã]o com o paygo caiu|falha de comunica/i.test(r)
  ) {
    return "agent_recovery";
  }
  return "manual_confirmation";
}

/** Extrai valor em centavos de comprovantes PayGo (VALOR, TOTAL, etc.). */
export function parseAmountCentavosFromReceipt(...receipts: Array<string | null | undefined>): number | null {
  for (const receipt of receipts) {
    const text = String(receipt || "");
    if (!text) continue;

    const patterns = [
      /VALOR\s*:?\s*R\$\s*([\d.,]+)/i,
      /VALOR\s+([\d.,]+)/i,
      /TOTAL\s*:?\s*R\$\s*([\d.,]+)/i,
      /R\$\s*([\d.,]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const normalized = match[1].includes(",")
        ? match[1].replace(/\./g, "").replace(",", ".")
        : match[1];
      const value = Number(normalized);
      if (Number.isFinite(value) && value > 0) {
        return Math.round(value * 100);
      }
    }
  }
  return null;
}

export function formatPendingAmountLabel(amountCentavos: number): string {
  if (!amountCentavos || amountCentavos <= 0) return "Não disponível";
  return `R$ ${(amountCentavos / 100).toFixed(2).replace(".", ",")}`;
}
