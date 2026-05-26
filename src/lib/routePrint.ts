// Roteamento de impressão: pega impressoras cadastradas da loja (pdv_printers),
// filtra por função (customer/kitchen) e envia via Electron (ESC/POS real).
// Fora do Electron: não imprime automaticamente para evitar diálogo do navegador/Windows.

import { supabase } from "@/integrations/supabase/client";
import { isElectron, printViaElectron, type PrintPayload } from "@/lib/electronBridge";

interface OrderItemLite {
  name: string;
  quantity: number;
  unit_price?: number;
  total: number;
  notes?: string | null;
}

export interface OrderForPrint {
  id: string;
  order_number: string | null;
  channel_name?: string;
  order_type?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: any;
  notes?: string | null;
  total: number;
  opened_at: string;
  items: OrderItemLite[];
}

interface PrinterRow {
  id: string;
  name: string;
  connection_type: "usb" | "network";
  host: string | null;
  port: number | null;
  usb_device_name: string | null;
  printer_model: string;
  print_role: "customer" | "kitchen" | "both";
  is_active: boolean;
}

// Cache simples por loja (5s) pra não consultar o banco a cada pedido novo.
const cache = new Map<string, { at: number; rows: PrinterRow[] }>();
const TTL = 5000;

async function getPrinters(storeId: string): Promise<PrinterRow[]> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const { data } = await supabase
    .from("pdv_printers")
    .select("*")
    .eq("store_id", storeId)
    .eq("is_active", true);
  const rows = (data ?? []) as PrinterRow[];
  cache.set(storeId, { at: Date.now(), rows });
  return rows;
}

export function invalidatePrintersCache(storeId?: string) {
  if (storeId) cache.delete(storeId); else cache.clear();
}

function toPayload(p: PrinterRow, content: PrintPayload["content"]): PrintPayload {
  return {
    connection_type: p.connection_type,
    host: p.host,
    port: p.port,
    usb_device_name: p.usb_device_name,
    printer_model: p.printer_model,
    content,
  };
}

function mapItems(items: OrderItemLite[]) {
  return items.map((it) => ({
    qty: it.quantity,
    name: it.name,
    unitPrice: it.unit_price,
    note: it.notes ?? undefined,
  }));
}

/**
 * Roteia a impressão do pedido:
 * - Se Electron + impressoras cadastradas: envia ESC/POS para cada impressora ativa
 *   (cliente → role customer/both, cozinha → role kitchen/both).
  * - Caso contrário: não chama window.print(), para não abrir diálogo manual.
 */
export async function routePrintOrder(opts: {
  storeId: string;
  storeName: string;
  order: OrderForPrint;
}) {
  const { storeId, storeName, order } = opts;

  if (!isElectron()) {
    console.warn("[route-print] impressão automática ignorada fora do app desktop", { orderId: order.id });
    return;
  }

  const printers = await getPrinters(storeId);
  if (printers.length === 0) {
    console.warn("[route-print] nenhuma impressora cadastrada para a loja", { storeId, orderId: order.id });
    return;
  }

  const orderNumber = order.order_number ?? order.id.slice(0, 6);
  const channelOrType =
    order.channel_name ||
    (order.order_type === "delivery" ? "DELIVERY" :
     order.order_type === "pickup" ? "RETIRADA" :
     order.order_type === "counter" ? "BALCÃO" : "");

  const customerPrinters = printers.filter((p) => p.print_role === "customer" || p.print_role === "both");
  const kitchenPrinters  = printers.filter((p) => p.print_role === "kitchen"  || p.print_role === "both");

  const items = mapItems(order.items);

  // Cliente
  await Promise.all(customerPrinters.map((p) =>
    printViaElectron(toPayload(p, {
      type: "customer",
      data: {
        storeName,
        orderNumber,
        customerName: order.customer_name ?? undefined,
        items,
        total: order.total,
        paymentMethod: undefined,
      },
    }))
  ));

  // Cozinha
  await Promise.all(kitchenPrinters.map((p) =>
    printViaElectron(toPayload(p, {
      type: "kitchen",
      data: {
        orderNumber,
        tableOrChannel: channelOrType,
        items,
      },
    }))
  ));
}
