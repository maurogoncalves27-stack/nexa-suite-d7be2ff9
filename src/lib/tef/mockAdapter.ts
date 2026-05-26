/**
 * Adapter Mock — simula fluxo completo do pinpad para testes sem hardware.
 * Em produção real, usar sitefAdapter ou paygoAdapter.
 */
import type { TefAdapter, TefConfig, TefPaymentRequest, TefPaymentResult, TefStatus } from "./types";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const createMockAdapter = (_config: TefConfig): TefAdapter => {
  let cancelled = false;

  return {
    provider: "mock",
    async processPayment(req: TefPaymentRequest, onStatus?: (s: TefStatus, m?: string) => void) {
      cancelled = false;
      onStatus?.("connecting", "Conectando ao pinpad...");
      await sleep(600);
      if (cancelled) return { status: "cancelled" as const };

      onStatus?.("waiting_card", "Aproxime, insira ou passe o cartão");
      await sleep(2500);
      if (cancelled) return { status: "cancelled" as const };

      onStatus?.("processing", "Processando pagamento...");
      await sleep(1800);
      if (cancelled) return { status: "cancelled" as const };

      // Simulação: 90% aprovado, 10% negado
      const approved = Math.random() > 0.1;
      const result: TefPaymentResult = approved
        ? {
            status: "approved",
            message: "Transação aprovada",
            nsu: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
            authorizationCode: String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"),
            cardBrand: ["VISA", "MASTERCARD", "ELO"][Math.floor(Math.random() * 3)],
            cardLast4: String(Math.floor(Math.random() * 10_000)).padStart(4, "0"),
            installments: req.installments ?? 1,
            acquirer: "C6 PAY (mock)",
          }
        : {
            status: "declined",
            message: "Cartão negado pela operadora",
          };
      onStatus?.(result.status, result.message);
      return result;
    },
    async cancel() {
      cancelled = true;
    },
  };
};
