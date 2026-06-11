/**
 * Adapter ACBr — conversa com o NEXA ACBr Agent (electron-acbr) na porta 3030.
 * Endpoints consumidos:
 *  - GET  /health          → { tefAvailable, version, ... }
 *  - POST /tef/iniciar     → { valor, tipo, parcelas?, financiamento? }
 *  - POST /tef/cancelar
 *
 * Diferente do SiTef adapter, o agente ACBr é síncrono e não expõe SSE.
 * Simulamos as transições de UI antes do fetch para que o usuário enxergue
 * "Aproxime o cartão" no totem enquanto o pinpad processa.
 */
import type {
  TefAdapter,
  TefConfig,
  TefPaymentRequest,
  TefPaymentResult,
  TefStatus,
} from "./types";
import { joinAgentUrl } from "./agentUrl";

interface AcbrIniciarPayload {
  valor: number;
  tipo: "credito" | "debito" | "pix" | "voucher";
  parcelas?: number;
  financiamento?: number;
}

interface AcbrResponse {
  ok: boolean;
  retorno?: string;
  error?: string;
}

interface AcbrActionResponse {
  ok: boolean;
  retorno?: string;
  parsed: Record<string, string>;
  error?: string;
}

const METHOD_MAP: Record<NonNullable<TefPaymentRequest["method"]>, AcbrIniciarPayload["tipo"]> = {
  credit: "credito",
  debit: "debito",
  pix: "pix",
  voucher: "voucher",
};

/**
 * Parse tolerante do bloco INI devolvido pela ACBrLibTEFD.
 * Aceita variações de caixa nas chaves (NSU/nsu, Bandeira/bandeira, etc.).
 */
const parseIni = (raw: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith(";")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in out)) out[key] = value;
  }
  return out;
};

const pick = (obj: Record<string, string>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = obj[k.toLowerCase()];
    if (v) return v;
  }
  return undefined;
};

const isApproved = (parsed: Record<string, string>): boolean => {
  const resultado = pick(parsed, "resultado", "status") ?? "";
  const aprovado = pick(parsed, "aprovado");
  if (aprovado) return /^(s|sim|true|1)$/i.test(aprovado);
  if (/aprovad/i.test(resultado)) return true;
  // Códigos: '0' = sucesso em vários integradores ACBr
  const cod = pick(parsed, "codigoresposta", "codresposta");
  if (cod && /^0+$/.test(cod)) return true;
  return false;
};

export const createAcbrAdapter = (config: TefConfig): TefAdapter => {
  let abortController: AbortController | null = null;

  return {
    provider: "acbr",
    async processPayment(req: TefPaymentRequest, onStatus?: (s: TefStatus, m?: string) => void) {
      abortController = new AbortController();

      const tipo: AcbrIniciarPayload["tipo"] = req.method ? METHOD_MAP[req.method] : "credito";
      const parcelas = req.installments && req.installments > 1 ? req.installments : 1;
      const financiamento = parcelas > 1 ? 3 : 1; // 3 = parcelado pelo estabelecimento

      onStatus?.("connecting", "Conectando ao pinpad (ACBr)...");
      // pequeno delay para a UI mostrar a transição antes do bloqueio do fetch síncrono
      await new Promise((r) => setTimeout(r, 250));
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
          } satisfies AcbrIniciarPayload),
          signal: abortController.signal,
        });

        const data = (await resp.json().catch(() => ({}))) as AcbrResponse;

        if (!resp.ok) {
          onStatus?.("error", data.error ?? `HTTP ${resp.status}`);
          return {
            status: "error",
            message: data.error ?? `Agente ACBr respondeu ${resp.status}`,
            raw: data,
          };
        }

        const parsed = parseIni(data.retorno);
        const approved = isApproved(parsed);
        const status: TefPaymentResult["status"] = approved ? "approved" : "declined";
        const result: TefPaymentResult = {
          status,
          message:
            pick(parsed, "mensagem", "mensagemresultado", "displayqrcode") ??
            (approved ? "Transação aprovada" : "Transação negada"),
          nsu: pick(parsed, "nsu", "nsuhost", "nsuctf", "nsusitef"),
          authorizationCode: pick(parsed, "codigoautorizacao", "autorizacao"),
          cardBrand: pick(parsed, "bandeira", "rede", "nomebandeira"),
          cardLast4: pick(parsed, "ultimosdigitos", "ultimos4", "numerocartao")?.slice(-4),
          installments: parseInt(pick(parsed, "parcelas", "qtdparcelas") ?? "", 10) || parcelas,
          acquirer: pick(parsed, "redeadquirente", "adquirente") ?? config.acquirer,
          raw: { response: data, parsed },
        };
        onStatus?.(status, result.message);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha de comunicação";
        if (msg.toLowerCase().includes("abort")) {
          onStatus?.("cancelled", "Cancelado pelo operador");
          return { status: "cancelled", message: "Cancelado pelo operador" };
        }
        onStatus?.("error", `Sem conexão com NEXA ACBr Agent em ${config.agentUrl}`);
        return { status: "error", message: msg };
      }
    },
    async cancel() {
      abortController?.abort();
      try {
        await fetch(`${config.agentUrl}/tef/cancelar`, { method: "POST" });
      } catch {
        /* ignore */
      }
    },
  };
};

/** Health-check do NEXA ACBr Agent. */
export const checkAcbrAgent = async (
  agentUrl: string,
): Promise<{ ok: boolean; online?: boolean; mode?: string; version?: string; error?: string }> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/health"), { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    return {
      online: true,
      ok: !!data?.tefReady,
      mode: data?.tefReady ? "acbr-tefd" : "tef não inicializado",
      version: data?.version,
      error: data?.tefReady ? undefined : (data?.tefError ?? "PGWebLib não inicializada"),
    };
  } catch (e) {
    return { ok: false, online: false, error: e instanceof Error ? e.message : "offline" };
  }
};

export const acbrInstalarPdc = async (
  agentUrl: string,
): Promise<AcbrActionResponse> => {
  const endpoints = ["/tef/install", "/tef/instalar"];

  try {
    let lastError = "offline";

    for (const endpoint of endpoints) {
      const r = await fetch(joinAgentUrl(agentUrl, endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "homologation" }),
      });

      const data = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, retorno: data.retorno, parsed: parseIni(data.retorno) };

      lastError = data?.error ?? `HTTP ${r.status}`;
      if (r.status !== 404) {
        return { ok: false, parsed: {}, error: lastError };
      }
    }

    return { ok: false, parsed: {}, error: lastError };
  } catch (e) {
    return { ok: false, parsed: {}, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Cancela uma venda já aprovada (NSU + data DDMMAAAA + valor). */
export const acbrCancelarVenda = async (
  agentUrl: string,
  body: { rede?: string; nsu: string; data: string; valor: number },
): Promise<AcbrActionResponse> => {
  try {
      const r = await fetch(joinAgentUrl(agentUrl, "/tef/cancelar-venda"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, parsed: {}, error: data?.error ?? `HTTP ${r.status}` };
    return { ok: true, retorno: data.retorno, parsed: parseIni(data.retorno) };
  } catch (e) {
    return { ok: false, parsed: {}, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Operação administrativa: 0=menu, 1=teste com., 4/5/6=relatórios. */
export const acbrAdministrativo = async (
  agentUrl: string,
  operacao = 0,
): Promise<AcbrActionResponse> => {
  try {
    const r = await fetch(joinAgentUrl(agentUrl, "/tef/admin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operacao }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, parsed: {}, error: data?.error ?? `HTTP ${r.status}` };
    return { ok: true, retorno: data.retorno, parsed: parseIni(data.retorno) };
  } catch (e) {
    return { ok: false, parsed: {}, error: e instanceof Error ? e.message : "offline" };
  }
};

/** Helpers exportados para uso fora do adapter (ex.: tela de homologação). */
export { parseIni as parseAcbrIni, pick as pickAcbrField };
