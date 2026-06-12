/**
 * Adapter PayGo Integrado — conversa com o NEXA Agent (electron-acbr)
 * que carrega PGWebLib.dll via koffi.
 *
 * Diferente do adapter ACBr (que parseia INI), aqui o agente já devolve
 * um objeto estruturado vindo de collectReceipts() em acbr-tefd.cjs:
 *   { reqnum, nsu, autorizacao, rede, resultado, locRef, extRef,
 *     virtMerch, dataHora, requerConfirmacao, viaEstabelecimento, viaCliente }
 *
 * Endpoints consumidos:
 *  - GET  /health
 *  - POST /tef/iniciar        { valor, tipo, parcelas?, financiamento? }
 *  - POST /tef/cancelar       (aborta transação em andamento)
 *  - POST /tef/cancelar-venda { valor, nsu, data (DDMMAAAA) }
 *  - POST /tef/admin          { operacao }
 */
import type {
  TefAdapter,
  TefConfig,
  TefPaymentRequest,
  TefPaymentResult,
  TefStatus,
} from "./types";
import { joinAgentUrl } from "./agentUrl";

interface PaygoReceipts {
  reqnum?: string | null;
  nsu?: string | null;
  autorizacao?: string | null;
  rede?: string | null;
  resultado?: string | null;
  locRef?: string | null;
  extRef?: string | null;
  virtMerch?: string | null;
  dataHora?: string | null;
  requerConfirmacao?: boolean;
  viaEstabelecimento?: string | null;
  viaCliente?: string | null;
}

interface PaygoAgentResponse {
  ok: boolean;
  retorno?: PaygoReceipts;
  error?: string;
}

const METHOD_MAP: Record<NonNullable<TefPaymentRequest["method"]>, "credito" | "debito" | "pix" | "voucher"> = {
  credit: "credito",
  debit: "debito",
  pix: "pix",
  voucher: "voucher",
};

const isApproved = (r: PaygoReceipts): boolean => {
  // PayGo retorna PWRET_OK no agente quando aprovado; collectReceipts() só roda nesse caso.
  // Mas validamos a presença de NSU+autorização como sinal forte de aprovação.
  if (r.nsu && r.autorizacao) return true;
  const msg = (r.resultado ?? "").toLowerCase();
  if (/aprovad|autoriz/.test(msg)) return true;
  return false;
};

export const createPaygoAdapter = (config: TefConfig): TefAdapter => {
  let abortController: AbortController | null = null;

  return {
    provider: "paygo",
    async processPayment(req: TefPaymentRequest, onStatus?: (s: TefStatus, m?: string) => void) {
      abortController = new AbortController();

      const tipo = req.method ? METHOD_MAP[req.method] : "credito";
      const parcelas = req.installments && req.installments > 1 ? req.installments : 1;
      const financiamento = parcelas > 1 ? 3 : 1; // 3 = parcelado estabelecimento

      onStatus?.("connecting", "Conectando ao PayGo...");
      await new Promise((r) => setTimeout(r, 200));
      onStatus?.(
        "waiting_card",
        tipo === "pix" ? "Escaneie o QR Code no pinpad" : "Aproxime, insira ou passe o cartão",
      );

      try {
        const resp = await fetch(joinAgentUrl(config.agentUrl, "/tef/iniciar"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valor: Number(req.amount.toFixed(2)),
            tipo,
            parcelas,
            financiamento,
          }),
          signal: abortController.signal,
        });

        const data = (await resp.json().catch(() => ({}))) as PaygoAgentResponse;

        if (!resp.ok || !data.ok) {
          const err = data.error ?? `Agente PayGo respondeu ${resp.status}`;
          onStatus?.("error", err);
          return { status: "error", message: err, raw: data };
        }

        const r = data.retorno ?? {};
        const approved = isApproved(r);
        const status: TefPaymentResult["status"] = approved ? "approved" : "declined";
        const result: TefPaymentResult = {
          status,
          message: r.resultado ?? (approved ? "Transação aprovada" : "Transação negada"),
          nsu: r.nsu ?? r.extRef ?? undefined,
          authorizationCode: r.autorizacao ?? undefined,
          cardBrand: r.rede ?? undefined,
          installments: parcelas,
          acquirer: r.rede ?? config.acquirer,
          raw: r,
        };
        onStatus?.(status, result.message);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha de comunicação";
        if (msg.toLowerCase().includes("abort")) {
          onStatus?.("cancelled", "Cancelado pelo operador");
          return { status: "cancelled", message: "Cancelado pelo operador" };
        }
        onStatus?.("error", `Sem conexão com NEXA Agent em ${config.agentUrl}`);
        return { status: "error", message: msg };
      }
    },
    async cancel() {
      abortController?.abort();
      try {
        await fetch(joinAgentUrl(config.agentUrl, "/tef/cancelar"), { method: "POST" });
      } catch {
        /* ignore */
      }
    },
  };
};

/** Health-check do agente PayGo. */
export const checkPaygoAgent = async (
  agentUrl: string,
): Promise<{ ok: boolean; online?: boolean; mode?: string; version?: string; error?: string; diagnostics?: unknown }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/health"), { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    return {
      online: true,
      ok: !!data?.tefReady,
      mode: data?.tefReady ? "PayGo Integrado" : "PGWebLib não inicializada",
      version: data?.version,
      error: data?.tefReady ? undefined : (data?.tefError ?? "PGWebLib não inicializada"),
      diagnostics: data?.tefDiagnostics,
    };
  } catch (e) {
    return { ok: false, online: false, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Força PW_iInit na DLL (sem abrir menu no pinpad). */
export const paygoInit = async (
  agentUrl: string,
): Promise<PaygoAgentResponse & { retorno?: { initialized?: boolean; version?: string } }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/init"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await r.json().catch(() => ({}))) as PaygoAgentResponse;
    if (r.status === 404) {
      return {
        ok: false,
        error: "O agente respondeu, mas a rota /tef/init não existe. Remova a barra final da URL do agente ou atualize/reinstale o NEXA ACBr Agent.",
      };
    }
    if (!r.ok) return { ok: false, error: data?.error ?? `HTTP ${r.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Cancela uma venda já aprovada (NSU + data DDMMAAAA + valor em reais). */
export const paygoCancelarVenda = async (
  agentUrl: string,
  body: { nsu: string; data: string; valor: number },
): Promise<PaygoAgentResponse> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/cancelar-venda"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as PaygoAgentResponse;
    if (!r.ok) return { ok: false, error: data?.error ?? `HTTP ${r.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Operação administrativa do pinpad (menu, relatório, teste de comunicação). */
export const paygoAdministrativo = async (
  agentUrl: string,
  options?: {
    technicalPassword?: string;
    pinpadPort?: number | string;
    merchantCode?: string;
    terminalCode?: string;
    host?: string;
  },
): Promise<PaygoAgentResponse> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/admin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options ?? {}),
    });
    const data = (await r.json().catch(() => ({}))) as PaygoAgentResponse;
    if (!r.ok) return { ok: false, error: data?.error ?? `HTTP ${r.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
};

/**
 * Teste isolado da porta COM do pinpad — não usa PGWebLib/PdC/host.
 * Apenas tenta abrir \\.\COMn no Windows para confirmar se a porta existe,
 * se o pinpad está conectado e se outro processo está segurando o handle.
 */
export interface PinpadPortTestResult {
  ok: boolean;
  port?: string;
  devicePath?: string;
  accessible?: boolean;
  locked?: boolean;
  message?: string;
  error?: { code?: string; errno?: number; message?: string };
}

export const paygoTestarPinpad = async (
  agentUrl: string,
  port: number | string = 5,
): Promise<PinpadPortTestResult> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/pinpad/test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    });
    const data = (await r.json().catch(() => ({}))) as PinpadPortTestResult;
    return data;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "offline" };
  }
};
