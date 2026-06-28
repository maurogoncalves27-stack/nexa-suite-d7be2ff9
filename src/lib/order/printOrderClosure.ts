/**
 * Impressão do fechamento: DANFE NFC-e (Electron printUrl) + comanda/cupom (routePrintOrder).
 */
import { supabase } from "@/integrations/supabase/client";
import { isElectron } from "@/lib/electronBridge";
import { routePrintOrder, type OrderForPrint } from "@/lib/routePrint";
import type { PrintClosureTarget } from "./types";

export async function printOrderClosure(opts: {
  orderId: string;
  storeId: string;
  storeName: string;
  danfeUrl?: string | null;
  targets?: PrintClosureTarget[];
}): Promise<void> {
  const targets = opts.targets ?? ["nfce", "kitchen"];
  const wantNfce = targets.includes("nfce");
  const wantKitchen = targets.includes("kitchen");
  const wantCustomer = targets.includes("customer");

  if (wantNfce && opts.danfeUrl && isElectron() && window.electron?.printUrl) {
    await window.electron.printUrl({ url: opts.danfeUrl });
  }

  if (!wantKitchen && !wantCustomer) return;

  const { data: ord } = await supabase
    .from("pdv_orders")
    .select("id, order_number, order_type, customer_name, customer_phone, delivery_address, notes, total, opened_at, channel_id")
    .eq("id", opts.orderId)
    .single();

  if (!ord) return;

  let channelName: string | undefined;
  if (ord.channel_id) {
    const { data: ch } = await supabase
      .from("pdv_channels")
      .select("name")
      .eq("id", ord.channel_id)
      .maybeSingle();
    channelName = ch?.name ?? undefined;
  }

  const { data: items } = await supabase
    .from("pdv_order_items")
    .select("name, quantity, unit_price, total, notes")
    .eq("order_id", opts.orderId);

  const order: OrderForPrint = {
    id: ord.id,
    order_number: ord.order_number,
    channel_name: channelName,
    order_type: ord.order_type,
    customer_name: ord.customer_name,
    customer_phone: ord.customer_phone,
    delivery_address: ord.delivery_address,
    notes: ord.notes,
    total: Number(ord.total ?? 0),
    opened_at: ord.opened_at,
    items: (items ?? []).map((it) => ({
      name: it.name,
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? 0),
      total: Number(it.total ?? 0),
      notes: it.notes,
    })),
  };

  const routeTarget =
    wantKitchen && wantCustomer ? "both" :
    wantKitchen ? "kitchen" :
    "customer";

  await routePrintOrder({
    storeId: opts.storeId,
    storeName: opts.storeName,
    order,
    target: routeTarget,
  });
}
