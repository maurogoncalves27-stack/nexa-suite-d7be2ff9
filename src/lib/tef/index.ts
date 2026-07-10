/**
 * Factory da camada TEF. Resolve config por loja e devolve o adapter correto.
 * PayGo (César) + Payer (Mauro) convivem via pdv_tef_config.provider.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TefAdapter, TefConfig } from "./types";
import { createMockAdapter } from "./mockAdapter";
import { createSitefAdapter } from "./sitefAdapter";
import { createAcbrAdapter } from "./acbrAdapter";
import { createPaygoAdapter } from "./paygoAdapter";
import { createPayerTefAdapter } from "./payer";

export * from "./types";

const DEFAULT_CONFIG: TefConfig = {
  provider: "mock",
  agentUrl: "https://127.0.0.1:3031",
};

export const loadTefConfig = async (storeId?: string | null): Promise<TefConfig> => {
  if (!storeId) return DEFAULT_CONFIG;
  const { data } = await supabase
    .from("pdv_tef_config")
    .select("provider, agent_url, merchant_code, terminal_code, acquirer, environment")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    provider: (data.provider as TefConfig["provider"]) ?? "mock",
    agentUrl: data.agent_url ?? DEFAULT_CONFIG.agentUrl,
    merchantCode: data.merchant_code ?? undefined,
    terminalCode: data.terminal_code ?? undefined,
    acquirer: data.acquirer ?? undefined,
    environment: ((data as { environment?: string }).environment as TefConfig["environment"]) ?? "demo",
  };
};

export const createTefAdapter = (config: TefConfig): TefAdapter => {
  switch (config.provider) {
    case "sitef":
      return createSitefAdapter(config);
    case "acbr":
      return createAcbrAdapter(config);
    case "paygo":
      return createPaygoAdapter(config);
    case "payer":
      return createPayerTefAdapter(config);
    case "mock":
    default:
      return createMockAdapter(config);
  }
};

/** Chave de auditoria: uma linha por RecNum (ou por payment id antes do REQNUM). */
export const buildTefAuditSaleId = (baseSaleId: string, opts?: { paygoReqnum?: string | null; paymentId?: string | null }) => {
  const base = String(baseSaleId || "").trim() || "VENDA";
  const reqnum = String(opts?.paygoReqnum || "").trim();
  if (reqnum) return `${base}#${reqnum}`;
  const paymentId = String(opts?.paymentId || "").trim();
  if (paymentId) return `${base}#${paymentId}`;
  return base;
};

const samePaygoReqnum = (a?: string | null, b?: string | null) => {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  return left === right;
};

/** Registra a transação no banco para auditoria. Retorna o id da linha criada. */
export const logTefTransaction = async (params: {
  orderId?: string;
  storeId?: string;
  provider: string;
  amount: number;
  status: string;
  message?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  installments?: number;
  acquirer?: string;
  method?: string;
  saleId?: string;
  paygoReqnum?: string;
  raw?: unknown;
  closureId?: string;
}): Promise<{ id: string | null; error: string | null }> => {
  const paygoReqnum = params.paygoReqnum ?? extractPaygoReqnum(params.raw);
  const now = new Date().toISOString();
  const rowId = crypto.randomUUID();
  const { error } = await supabase
    .from("pdv_tef_transactions")
    .insert({
      id: rowId,
      order_id: params.orderId ?? null,
      store_id: params.storeId ?? null,
      closure_id: params.closureId ?? null,
      provider: params.provider,
      amount: params.amount,
      status: params.status,
      message: params.message ?? null,
      nsu: params.nsu ?? null,
      authorization_code: params.authorizationCode ?? null,
      card_brand: params.cardBrand ?? null,
      card_last4: params.cardLast4 ?? null,
      installments: params.installments ?? null,
      acquirer: params.acquirer ?? null,
      payment_method: params.method ?? null,
      sale_id: params.saleId ?? null,
      paygo_reqnum: paygoReqnum ?? null,
      raw_response: (params.raw ?? null) as never,
      finished_at: now,
      confirmed_at: params.status === "approved" ? now : null,
      cancelled_at: params.status === "cancelled" ? now : null,
      updated_at: now,
    });
  if (error) {
    console.warn("[TEF] logTefTransaction:", error.message);
    if (
      params.storeId
      && params.saleId
      && /idx_pdv_tef_tx_store_sale|duplicate key/i.test(error.message)
    ) {
      const existing = await findTefTransactionByStoreAndSale(params.storeId, params.saleId);
      const existingReqnum = existing
        ? await findTefTransactionReqnumById(existing.id)
        : null;
      if (existing?.id && samePaygoReqnum(paygoReqnum, existingReqnum)) {
        await updateTefTransaction(existing.id, {
          status: params.status,
          message: params.message,
          nsu: params.nsu,
          authorizationCode: params.authorizationCode,
          cardBrand: params.cardBrand,
          acquirer: params.acquirer,
          paygoReqnum: paygoReqnum ?? undefined,
          raw: params.raw,
        });
        return { id: existing.id, error: null };
      }

      const retrySaleId = buildTefAuditSaleId(params.saleId, {
        paygoReqnum,
        paymentId: rowId,
      });
      if (retrySaleId !== params.saleId) {
        return logTefTransaction({ ...params, saleId: retrySaleId });
      }

      const updated = await updateTefTransactionByStoreAndSale(params.storeId, params.saleId, {
        status: params.status,
        message: params.message,
        nsu: params.nsu,
        authorizationCode: params.authorizationCode,
        cardBrand: params.cardBrand,
        acquirer: params.acquirer,
        paygoReqnum: paygoReqnum ?? undefined,
        raw: params.raw,
      });
      if (updated) return { id: updated, error: null };
    }
    return { id: null, error: error.message };
  }
  return { id: rowId, error: null };
};

/** Atualiza por loja + sale_id sem precisar do id (fallback para idx_pdv_tef_tx_store_sale). */
const updateTefTransactionByStoreAndSale = async (
  storeId: string,
  saleId: string,
  params: {
    status: string;
    message?: string;
    nsu?: string;
    authorizationCode?: string;
    cardBrand?: string;
    acquirer?: string;
    paygoReqnum?: string;
    raw?: unknown;
  },
): Promise<string | null> => {
  const paygoReqnum = params.paygoReqnum ?? extractPaygoReqnum(params.raw);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    message: params.message ?? null,
    finished_at: now,
    updated_at: now,
  };
  if (params.nsu !== undefined) patch.nsu = params.nsu;
  if (params.authorizationCode !== undefined) patch.authorization_code = params.authorizationCode;
  if (params.cardBrand !== undefined) patch.card_brand = params.cardBrand;
  if (params.acquirer !== undefined) patch.acquirer = params.acquirer;
  if (paygoReqnum !== undefined) patch.paygo_reqnum = paygoReqnum;
  if (params.raw !== undefined) patch.raw_response = params.raw as never;
  if (params.status === "approved") patch.confirmed_at = now;
  if (params.status === "cancelled") patch.cancelled_at = now;

  const { data, error } = await supabase
    .from("pdv_tef_transactions")
    .update(patch)
    .eq("store_id", storeId)
    .eq("sale_id", saleId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[TEF] updateTefTransactionByStoreAndSale:", error.message);
    return null;
  }
  if (data?.id) return data.id;

  const existing = await findTefTransactionByStoreAndSale(storeId, saleId);
  return existing?.id ?? null;
};

/** Atualiza uma transação já registrada (confirmação, desfazimento ou erro). */
export const updateTefTransaction = async (
  id: string,
  params: {
    status: string;
    message?: string;
    nsu?: string;
    authorizationCode?: string;
    cardBrand?: string;
    acquirer?: string;
    paygoReqnum?: string;
    raw?: unknown;
  },
): Promise<void> => {
  const paygoReqnum = params.paygoReqnum ?? extractPaygoReqnum(params.raw);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    message: params.message ?? null,
    finished_at: now,
    updated_at: now,
  };
  if (params.nsu !== undefined) patch.nsu = params.nsu;
  if (params.authorizationCode !== undefined) patch.authorization_code = params.authorizationCode;
  if (params.cardBrand !== undefined) patch.card_brand = params.cardBrand;
  if (params.acquirer !== undefined) patch.acquirer = params.acquirer;
  if (paygoReqnum !== undefined) patch.paygo_reqnum = paygoReqnum;
  if (params.raw !== undefined) patch.raw_response = params.raw as never;
  if (params.status === "approved") patch.confirmed_at = now;
  if (params.status === "cancelled") patch.cancelled_at = now;

  const { error } = await supabase.from("pdv_tef_transactions").update(patch).eq("id", id);
  if (error) console.warn("[TEF] updateTefTransaction:", error.message);
};

/** Busca transação pendente já registrada pelo RecNum (REQNUM). */
export const findPendingTefTransactionByReqnum = async (
  storeId: string,
  paygoReqnum: string,
): Promise<{ id: string; amount: number } | null> => {
  if (!storeId || !paygoReqnum) return null;
  const { data, error } = await supabase
    .from("pdv_tef_transactions")
    .select("id, amount")
    .eq("store_id", storeId)
    .eq("paygo_reqnum", paygoReqnum)
    .eq("status", "pending_confirmation")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[TEF] findPendingTefTransactionByReqnum:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return { id: data.id, amount: Number(data.amount ?? 0) };
};

/** Busca a transação mais recente pelo RecNum (qualquer status). */
export const findTefTransactionByReqnum = async (
  storeId: string,
  paygoReqnum: string,
): Promise<{
  id: string;
  amount: number;
  status: string;
  saleId: string | null;
  rawResponse: unknown;
} | null> => {
  if (!storeId || !paygoReqnum) return null;
  const { data, error } = await supabase
    .from("pdv_tef_transactions")
    .select("id, amount, status, sale_id, raw_response")
    .eq("store_id", storeId)
    .eq("paygo_reqnum", paygoReqnum)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[TEF] findTefTransactionByReqnum:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return {
    id: data.id,
    amount: Number(data.amount ?? 0),
    status: data.status,
    saleId: data.sale_id ?? null,
    rawResponse: data.raw_response,
  };
};

/** Busca transação pela loja + sale_id (respeita idx_pdv_tef_tx_store_sale). */
export const findTefTransactionByStoreAndSale = async (
  storeId: string,
  saleId: string,
): Promise<{ id: string; amount: number; status: string } | null> => {
  if (!storeId || !saleId) return null;
  const { data, error } = await supabase
    .from("pdv_tef_transactions")
    .select("id, amount, status")
    .eq("store_id", storeId)
    .eq("sale_id", saleId)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[TEF] findTefTransactionByStoreAndSale:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return { id: data.id, amount: Number(data.amount ?? 0), status: data.status };
};

const findTefTransactionReqnumById = async (id: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("pdv_tef_transactions")
    .select("paygo_reqnum")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data.paygo_reqnum ?? null;
};

/** Insere ou atualiza auditoria TEF, reutilizando linha pendente pelo RecNum. */
export const upsertTefTransactionAudit = async (params: {
  existingId?: string | null;
  orderId?: string;
  storeId?: string;
  provider: string;
  amount: number;
  status: string;
  message?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  cardLast4?: string;
  installments?: number;
  acquirer?: string;
  method?: string;
  saleId?: string;
  paygoReqnum?: string;
  raw?: unknown;
  closureId?: string;
}): Promise<{ id: string | null; error: string | null }> => {
  const paygoReqnum = params.paygoReqnum ?? extractPaygoReqnum(params.raw);
  let id = params.existingId ?? null;

  if (!id && params.storeId && paygoReqnum) {
    const existing = await findTefTransactionByReqnum(params.storeId, paygoReqnum);
    id = existing?.id ?? null;
  }

  if (id) {
    await updateTefTransaction(id, {
      status: params.status,
      message: params.message,
      nsu: params.nsu,
      authorizationCode: params.authorizationCode,
      cardBrand: params.cardBrand,
      acquirer: params.acquirer,
      paygoReqnum: paygoReqnum ?? undefined,
      raw: params.raw,
    });
    return { id, error: null };
  }

  const insertResult = await logTefTransaction({
    orderId: params.orderId,
    storeId: params.storeId,
    provider: params.provider,
    amount: params.amount,
    status: params.status,
    message: params.message,
    nsu: params.nsu,
    authorizationCode: params.authorizationCode,
    cardBrand: params.cardBrand,
    cardLast4: params.cardLast4,
    installments: params.installments,
    acquirer: params.acquirer,
    method: params.method,
    saleId: params.saleId,
    paygoReqnum: paygoReqnum ?? undefined,
    raw: params.raw,
    closureId: params.closureId,
  });
  return insertResult;
};

function extractPaygoReqnum(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const paygo = r.paygo as Record<string, unknown> | undefined;
  const candidate =
    r.reqnum ?? r.recnum ?? r.recNum ?? r.REQNUM ??
    paygo?.reqNum ?? paygo?.reqnum ?? null;
  return candidate ? String(candidate) : null;
}

export function buildPaygoAuditRaw(payment: Record<string, unknown>) {
  const paygo = payment.paygo as Record<string, unknown> | undefined;
  const reqnum = paygo?.reqNum ?? payment.nsu ?? null;
  return {
    ...payment,
    agentPaymentId: payment.id ?? null,
    reqnum,
    paygoStatus: payment.status ?? null,
  };
}
