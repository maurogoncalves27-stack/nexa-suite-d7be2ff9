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
  authCode?: string | null;
  brand?: string | null;
  acquirer?: string | null;
  customerReceipt?: string | null;
  merchantReceipt?: string | null;
  reqNum?: string | null;
  locRef?: string | null;
  extRef?: string | null;
  virtMerch?: string | null;
  authSyst?: string | null;
}

interface PaygoAgentResponse {
  ok: boolean;
  status?: string;
  message?: string;
  ret?: number;
  data?: PaygoReceipts;
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
  if (r.reqNum && r.authCode) return true;
  return false;
};

const cleanPaygoMessage = (message?: string | null): string | undefined => {
  const cleaned = (message ?? "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
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
            saleId: req.orderId,
            acquirer: req.acquirer,
            rede: req.acquirer,
            paygoMenuChoice: req.acquirer,
          }),
          signal: abortController.signal,
        });

        const data = (await resp.json().catch(() => ({}))) as PaygoAgentResponse;

        if (!resp.ok || !data.ok) {
          const err = data.error ?? `Agente PayGo respondeu ${resp.status}`;
          onStatus?.("error", err);
          return { status: "error", message: err, raw: data };
        }

        const retorno = ((data as any).retorno ?? {}) as PaygoAgentResponse & { data?: PaygoReceipts };
        const effectiveStatus = retorno.status ?? data.status;
        const effectiveMessage = cleanPaygoMessage(retorno.message ?? data.message);
        const r = retorno.data ?? data.data ?? data.retorno ?? {};
        const approved = effectiveStatus === "approved" || (data.ok && isApproved(r));
        const denied = effectiveStatus === "denied";
        const status: TefPaymentResult["status"] = approved ? "approved" : denied ? "declined" : "error";
        const fallbackMessage = approved ? "Transacao aprovada" : denied ? "Transacao negada" : "Falha na transacao";
        const result: TefPaymentResult = {
          status,
          message: data.message ?? (approved ? "Transação aprovada" : denied ? "Transação negada" : "Falha na transação"),
          nsu: r.reqNum ?? r.extRef ?? undefined,
          authorizationCode: r.authCode ?? undefined,
          cardBrand: r.brand ?? undefined,
          installments: parcelas,
          acquirer: r.acquirer ?? r.authSyst ?? config.acquirer,
          raw: data,
        };
        result.message = effectiveMessage ?? fallbackMessage;
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

/** Executa a instalacao/iniciacao do PdC + pinpad, igual ao fluxo install do demo PayGo. */
export const paygoInstalarPdc = async (
  agentUrl: string,
  options: {
    cpfCnpj?: string;
    pontoDeCaptura?: string;
    ambiente?: string;
    host?: string;
    senhaTecnica?: string;
    usePinpad?: boolean;
    pinpadPort?: number | string;
    paygoMenuChoice?: string;
  },
): Promise<PaygoAgentResponse> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/install"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = (await r.json().catch(() => ({}))) as PaygoAgentResponse;
    if (r.status === 404) {
      return {
        ok: false,
        error: "O agente respondeu, mas a rota /tef/install nao existe. Atualize/reinstale o NEXA ACBr Agent.",
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
    paygoMenuChoice?: string;
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

export interface PaygoAdmCapture {
  identificador: number;
  tipo: number; // 1=MENU, 2=TYPED, 3=BARCODE
  prompt: string;
  options?: { label: string; value: string }[];
  tamMin?: number;
  tamMax?: number;
  mascara?: string;
  ocultar?: boolean;
  seq?: number;
}

export interface PaygoAdmStatus {
  status: "idle" | "running" | "waiting_input" | "done" | "error" | "aborted";
  message?: string;
  error?: string;
  receipts?: Record<string, unknown>;
  pendingCaptures?: PaygoAdmCapture[] | null;
  captureSeq?: number;
  startedAt?: number;
}

export const paygoAdmStatus = async (agentUrl: string): Promise<PaygoAdmStatus> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/admin/status"));
    const data = await r.json().catch(() => ({}));
    return data as PaygoAdmStatus;
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "offline" };
  }
};

export const paygoAdmRespond = async (
  agentUrl: string,
  responses: { identificador: number; value: string }[],
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/admin/respond"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (data as any)?.error ?? `HTTP ${r.status}` };
    return data as { ok: boolean };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
};

export const paygoAdmAbort = async (agentUrl: string): Promise<{ ok: boolean }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/admin/abort"), { method: "POST" });
    const data = await r.json().catch(() => ({}));
    return data as { ok: boolean };
  } catch {
    return { ok: false };
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
