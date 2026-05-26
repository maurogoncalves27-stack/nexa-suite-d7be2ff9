/**
 * Adapter SiTef (Software Express).
 *
 * Arquitetura: o totem (Electron) sobe um agente HTTP local em
 * http://localhost:60906 (electron/sitef-agent.cjs). Esse agente:
 *  - em modo "stub" (padrão): simula o fluxo do pinpad, útil pra QA;
 *  - em modo "real": carrega CliSiTef.dll via FFI quando o credenciamento
 *    SiTef + C6 Pay estiver concluído.
 *
 * Endpoints consumidos:
 *  - GET  /sitef/health
 *  - POST /sitef/iniciar    (resposta final: aprovado/negado)
 *  - POST /sitef/cancelar
 *  - GET  /sitef/eventos    (SSE — mudanças de estado em tempo real)
 */
import type { TefAdapter, TefConfig, TefPaymentRequest, TefPaymentResult, TefStatus } from "./types";

interface SitefAgentRequest {
  funcao: number;
  valor: string;
  numeroCupom: string;
  codigoLoja?: string;
  codigoTerminal?: string;
  parcelas?: number;
  metodo?: "credit" | "debit" | "pix" | "voucher";
}

const mapAgentStatus = (s: string): TefStatus | null => {
  switch (s) {
    case "connecting": return "connecting";
    case "waiting_card": return "waiting_card";
    case "processing": return "processing";
    case "approved": return "approved";
    case "declined": return "declined";
    case "cancelled":
    case "cancelling": return "cancelled";
    case "error": return "error";
    default: return null;
  }
};

export const createSitefAdapter = (config: TefConfig): TefAdapter => {
  let abortController: AbortController | null = null;
  let eventSource: EventSource | null = null;

  return {
    provider: "sitef",
    async processPayment(req: TefPaymentRequest, onStatus?: (s: TefStatus, m?: string) => void) {
      abortController = new AbortController();
      onStatus?.("connecting", "Conectando ao agente SiTef...");

      // Conecta ao stream de eventos pra refletir mudanças de estado em tempo real
      try {
        eventSource = new EventSource(`${config.agentUrl}/sitef/eventos`);
        eventSource.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === "status") {
              const mapped = mapAgentStatus(data.status);
              if (mapped) onStatus?.(mapped, data.message);
            }
          } catch { /* ignore */ }
        };
      } catch {
        // SSE indisponível — segue sem stream
      }

      const funcaoMap = { credit: 3, debit: 2, pix: 122, voucher: 110 } as const;
      const payload: SitefAgentRequest = {
        funcao: req.method ? funcaoMap[req.method] : 0,
        valor: req.amount.toFixed(2),
        numeroCupom: req.orderId?.slice(0, 12) ?? Date.now().toString().slice(-12),
        codigoLoja: config.merchantCode,
        codigoTerminal: config.terminalCode,
        parcelas: req.installments,
        metodo: req.method,
      };

      try {
        const resp = await fetch(`${config.agentUrl}/sitef/iniciar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        if (!resp.ok && resp.status !== 200) {
          const text = await resp.text().catch(() => "");
          onStatus?.("error", `Agente SiTef retornou ${resp.status}`);
          return { status: "error", message: `HTTP ${resp.status} ${text}` };
        }

        const data = await resp.json();
        if (data.cancelado) {
          onStatus?.("cancelled", "Cancelado pelo operador");
          return { status: "cancelled", message: data.mensagem };
        }

        const status: TefPaymentResult["status"] = data.aprovado ? "approved" : "declined";
        const result: TefPaymentResult = {
          status,
          message: data.mensagem,
          nsu: data.nsu,
          authorizationCode: data.codigoAutorizacao,
          cardBrand: data.bandeira,
          cardLast4: data.ultimosDigitos,
          installments: data.parcelas ?? 1,
          acquirer: data.adquirente,
          raw: data,
        };
        onStatus?.(status, result.message);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha de comunicação";
        if (msg.toLowerCase().includes("abort")) {
          onStatus?.("cancelled", "Cancelado pelo operador");
          return { status: "cancelled", message: "Cancelado pelo operador" };
        }
        onStatus?.("error", `Sem conexão com agente SiTef em ${config.agentUrl}`);
        return { status: "error", message: msg };
      } finally {
        eventSource?.close();
        eventSource = null;
      }
    },
    async cancel() {
      abortController?.abort();
      try {
        await fetch(`${config.agentUrl}/sitef/cancelar`, { method: "POST" });
      } catch {
        /* ignore */
      }
    },
  };
};

/** Helper: testa se o agente SiTef está respondendo. */
export const checkSitefAgent = async (
  agentUrl: string,
): Promise<{ ok: boolean; mode?: string; version?: string; error?: string }> => {
  try {
    const r = await fetch(`${agentUrl}/sitef/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
};
