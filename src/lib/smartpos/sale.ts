/**
 * Persistência de venda do SmartPOS (balcão) e do NEXA Garçom.
 *
 * Fluxo: cria pedido rascunho ANTES do TEF (para nunca perder venda aprovada),
 * depois conclui com o pagamento ou cancela se o TEF não aprovar.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SelectedComplement } from "@/lib/menuCatalog";

export interface SaleItemInput {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
  complements?: SelectedComplement[];
}


const PENDING_KEY = "smartpos.pendingOrderId";

export const getPendingOrderId = (): string | null => {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

const setPendingOrderId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(PENDING_KEY, id);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
};

/** Sessão de caixa virtual (SmartPOS não opera dinheiro físico). */
export const ensureVirtualCashSession = async (
  storeId: string,
  userId?: string | null,
): Promise<string | null> => {
  const { data: open } = await supabase
    .from("pdv_cash_sessions")
    .select("id")
    .eq("store_id", storeId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.id) return open.id;

  const { data, error } = await supabase
    .from("pdv_cash_sessions")
    .insert({
      store_id: storeId,
      opened_by: userId ?? null,
      opening_amount: 0,
      status: "open",
      notes: "Sessão virtual SmartPOS",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[SmartPOS] cash session:", error.message);
    return null;
  }
  return data?.id ?? null;
};

/** Resolve o canal da loja, testando os códigos na ordem informada. */
export const resolveChannelId = async (
  storeId: string,
  codes: string[],
): Promise<string | null> => {
  const { data } = await supabase
    .from("pdv_channels")
    .select("id, code")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (!data?.length) return null;
  for (const code of codes) {
    const found = data.find((c) => c.code === code);
    if (found) return found.id;
  }
  return null;
};

const buildOrderNumber = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `SP${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export interface DraftOrder {
  orderId: string;
  orderNumber: string;
  total: number;
}

/** Cria o pedido rascunho + itens antes de acionar o pinpad. */
export const createDraftOrder = async (params: {
  storeId: string;
  items: SaleItemInput[];
  userId?: string | null;
  channelCodes?: string[];
  orderType?: string;
  source?: string;
}): Promise<{ order: DraftOrder | null; error: string | null }> => {
  const total = params.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const [channelId, cashSessionId] = await Promise.all([
    resolveChannelId(params.storeId, params.channelCodes ?? ["smartpos", "balcao", "counter"]),
    ensureVirtualCashSession(params.storeId, params.userId),
  ]);
  const orderNumber = buildOrderNumber();

  const { data, error } = await supabase
    .from("pdv_orders")
    .insert({
      store_id: params.storeId,
      channel_id: channelId,
      cash_session_id: cashSessionId,
      order_number: orderNumber,
      status: "open",
      order_type: params.orderType ?? "counter",
      source: params.source ?? "smartpos",
      subtotal: total,
      total,
      created_by: params.userId ?? null,
      opened_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    return { order: null, error: error?.message ?? "Falha ao abrir pedido" };
  }

  const rows = params.items.map((i) => ({
    order_id: data.id,
    menu_item_id: i.menu_item_id,
    name: i.name,
    quantity: i.quantity,
    unit_price: i.unit_price,
    total: i.quantity * i.unit_price,
    notes: i.notes ?? null,
    complements: i.complements?.length ? i.complements : null,
  }));
  const { error: itemsError } = await supabase.from("pdv_order_items").insert(rows as any);
  if (itemsError) {
    return { order: null, error: itemsError.message };
  }




  setPendingOrderId(data.id);
  return { order: { orderId: data.id, orderNumber, total }, error: null };
};

/** Registra pagamento aprovado e conclui o pedido. Idempotente por pedido. */
export const finalizeSale = async (params: {
  orderId: string;
  method: string;
  amount: number;
  nsu?: string;
  authorizationCode?: string;
}): Promise<{ ok: boolean; error: string | null }> => {
  const { data: existing } = await supabase
    .from("pdv_payments")
    .select("id")
    .eq("order_id", params.orderId)
    .limit(1)
    .maybeSingle();

  if (!existing?.id) {
    const { error } = await supabase.from("pdv_payments").insert({
      order_id: params.orderId,
      method: params.method,
      amount: params.amount,
      authorization_code: params.authorizationCode ?? null,
      external_payment_id: params.nsu ?? null,
      paid_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("pdv_orders")
    .update({ status: "concluded", concluded_at: now, closed_at: now, confirmed_at: now })
    .eq("id", params.orderId);
  if (upErr) return { ok: false, error: upErr.message };

  setPendingOrderId(null);
  return { ok: true, error: null };
};

/** Cancela o rascunho quando o TEF não aprova. */
export const discardDraftOrder = async (orderId: string, reason: string) => {
  await supabase
    .from("pdv_orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason_text: reason.slice(0, 200),
    })
    .eq("id", orderId);
  setPendingOrderId(null);
};

/** Pedido aprovado no TEF mas não concluído (fechou a tela no meio). */
export const findPendingSale = async (): Promise<{ id: string; total: number; order_number: string | null } | null> => {
  const id = getPendingOrderId();
  if (!id) return null;
  const { data } = await supabase
    .from("pdv_orders")
    .select("id, total, order_number, status")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "open") {
    setPendingOrderId(null);
    return null;
  }
  return { id: data.id, total: Number(data.total ?? 0), order_number: data.order_number };
};
