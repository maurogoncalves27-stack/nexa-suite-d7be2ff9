/**
 * Orquestrador de fechamento de venda: fiscal → impressão → closed.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TefPaymentResult } from "@/lib/tef";
import { logTefTransaction } from "@/lib/tef";
import { emitNfce } from "./emitNfce";
import { printOrderClosure } from "./printOrderClosure";
import type { CloseOrderParams, CloseOrderResult, ClosureStatus } from "./types";

const updateClosure = async (
  orderId: string,
  patch: {
    closure_status?: ClosureStatus;
    closure_error?: string | null;
    closed_at?: string;
    status?: string;
  },
) => {
  await supabase.from("pdv_orders").update(patch).eq("id", orderId);
};

export async function closeOrder(params: CloseOrderParams): Promise<CloseOrderResult> {
  const { orderId, storeId, channel, storeName, printTargets } = params;

  const { data: order, error: orderErr } = await supabase
    .from("pdv_orders")
    .select("id, closure_id, closure_status, store_id")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message ?? "Pedido não encontrado");
  }

  const closureId = order.closure_id ?? crypto.randomUUID();
  if (!order.closure_id) {
    await supabase.from("pdv_orders").update({
      closure_id: closureId,
      closure_channel: channel,
      closure_status: "paid",
    }).eq("id", orderId);
  }

  let resolvedStoreName = storeName;
  if (!resolvedStoreName) {
    const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).maybeSingle();
    resolvedStoreName = store?.name ?? "Loja";
  }

  try {
    await updateClosure(orderId, { closure_status: "fiscal_pending", closure_error: null });

    const fiscal = await emitNfce(orderId, closureId);
    if (!fiscal.ok) {
      await updateClosure(orderId, {
        closure_status: "failed_at_step",
        closure_error: fiscal.error ?? "Falha na emissão NFC-e",
      });
      return {
        closureId,
        orderId,
        status: "failed_at_step",
        error: fiscal.error,
      };
    }

    await updateClosure(orderId, { closure_status: "fiscal_ok" });
    await updateClosure(orderId, { closure_status: "print_pending" });

    await printOrderClosure({
      orderId,
      storeId,
      storeName: resolvedStoreName,
      danfeUrl: fiscal.danfeUrl,
      targets: printTargets,
    });

    await updateClosure(orderId, {
      closure_status: "closed",
      closed_at: new Date().toISOString(),
      status: "closed",
    });

    return {
      closureId,
      orderId,
      status: "closed",
      danfeUrl: fiscal.danfeUrl,
      invoiceId: fiscal.invoiceId,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateClosure(orderId, {
      closure_status: "failed_at_step",
      closure_error: msg,
    });
    return {
      closureId,
      orderId,
      status: "failed_at_step",
      error: msg,
    };
  }
}

export interface TotemCartItem {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}

export interface CreateTotemOrderAndCloseParams {
  storeId: string;
  storeName?: string;
  orderType: "eat_in" | "takeout";
  cartTotal: number;
  cpf?: string;
  cart: TotemCartItem[];
  tef: TefPaymentResult;
  tefProvider?: string;
}

export interface CreateTotemOrderAndCloseResult extends CloseOrderResult {
  pickupCode: string;
  orderNumber: string;
}

async function ensureBalcaoChannel(storeId: string): Promise<string> {
  const { data: ch } = await supabase
    .from("pdv_channels")
    .select("id")
    .eq("store_id", storeId)
    .eq("code", "balcao")
    .maybeSingle();
  if (ch?.id) return ch.id;

  const { data: nc, error: ce } = await supabase
    .from("pdv_channels")
    .insert({ store_id: storeId, code: "balcao", name: "Balcão", sort_order: 0 })
    .select("id")
    .single();
  if (ce) throw ce;
  return nc.id;
}

export async function createTotemOrderAndClose(
  params: CreateTotemOrderAndCloseParams,
): Promise<CreateTotemOrderAndCloseResult> {
  const closureId = crypto.randomUUID();
  const channelId = await ensureBalcaoChannel(params.storeId);
  const pickupCode = String(Math.floor(100 + Math.random() * 900));

  const { data: order, error: oe } = await supabase
    .from("pdv_orders")
    .insert({
      store_id: params.storeId,
      channel_id: channelId,
      status: "confirmed",
      order_type: params.orderType === "eat_in" ? "dine_in" : "takeout",
      subtotal: params.cartTotal,
      total: params.cartTotal,
      pickup_code: pickupCode,
      notes: `Totem · ${params.orderType === "eat_in" ? "Comer aqui" : "Para levar"}`,
      customer_document: params.cpf ? params.cpf.replace(/\D/g, "") : null,
      confirmed_at: new Date().toISOString(),
      closure_id: closureId,
      closure_status: "paid",
      closure_channel: "totem",
    })
    .select("id, order_number")
    .single();

  if (oe || !order) throw oe ?? new Error("Falha ao criar pedido");

  const itemsPayload = params.cart.map((c) => ({
    order_id: order.id,
    menu_item_id: c.menu_item_id,
    name: c.name,
    quantity: c.quantity,
    unit_price: c.unit_price,
    total: c.unit_price * c.quantity,
    notes: c.notes ?? null,
  }));
  const { error: ie } = await supabase.from("pdv_order_items").insert(itemsPayload);
  if (ie) throw ie;

  await supabase.from("pdv_payments").insert({
    order_id: order.id,
    method: "credit",
    amount: params.cartTotal,
    authorization_code: params.tef.authorizationCode ?? null,
    external_payment_id: params.tef.nsu ?? null,
    closure_id: closureId,
  });

  void logTefTransaction({
    orderId: order.id,
    storeId: params.storeId,
    provider: params.tefProvider ?? "totem",
    amount: params.cartTotal,
    status: params.tef.status,
    message: params.tef.message,
    nsu: params.tef.nsu,
    authorizationCode: params.tef.authorizationCode,
    cardBrand: params.tef.cardBrand,
    cardLast4: params.tef.cardLast4,
    installments: params.tef.installments,
    acquirer: params.tef.acquirer,
    raw: params.tef.raw,
    closureId,
  });

  void closeOrder({
    orderId: order.id,
    storeId: params.storeId,
    channel: "totem",
    storeName: params.storeName,
    printTargets: ["nfce", "kitchen"],
  }).catch((e) => console.warn("[order] closeOrder falhou", e));

  return {
    closureId,
    orderId: order.id,
    status: "paid",
    pickupCode,
    orderNumber: order.order_number || order.id.slice(0, 8),
  };
}
