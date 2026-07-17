// Polling de eventos do iFood (sandbox por padrão)
// Doc: https://developer.ifood.com.br/pt-BR/docs/references/order
// Fluxo: GET /events:polling -> processa -> POST /events/acknowledgment
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getIfoodAccessToken, type IfoodEnv } from "../_shared/ifoodAuth.ts";
import { requireCronOrRole } from "../_shared/requireRole.ts";
import { extractIfoodCustomerAddress, extractIfoodCustomerDocument } from "../_shared/ifoodOrderMap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://merchant-api.ifood.com.br";

type IfoodEvent = {
  id: string;
  code: string; // PLC, CFM, CAN, DSP, CON, etc.
  fullCode?: string;
  orderId: string;
  merchantId?: string;
  createdAt?: string;
};

// Mapeia código do iFood pro nosso status interno
function eventToStatus(code: string): string | null {
  switch (code) {
    case "PLC": return "placed";
    case "CFM": return "confirmed";
    case "PRS":
    case "RPR": return "preparing";
    case "RTP":
    case "PUP": return "ready";
    case "DSP": return "dispatched";
    case "CON": return "concluded";
    case "CAN":
    case "CCA": return "cancelled";
    default: return null;
  }
}

// TODO iFood Chat: quando integrarmos a API de chat do iFood (merchant chat),
// ao receber evento de nova mensagem do cliente, executar:
//   UPDATE public.pdv_orders SET has_unread_chat = true
//   WHERE external_order_id = <orderId do evento>
// Hoje a flag é apenas mock controlado por UI/SQL manual.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager"], corsHeaders);
  if (!auth.ok) return auth.response!;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const env: IfoodEnv = (body.environment as IfoodEnv) ?? "sandbox";

    const token = await getIfoodAccessToken(env);

    // 1. Polling
    const pollRes = await fetch(`${API_BASE}/order/v1.0/events:polling`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (pollRes.status === 204) {
      return new Response(JSON.stringify({ ok: true, events: 0, message: "Sem eventos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(`Polling falhou ${pollRes.status}: ${text}`);
    }

    const events: IfoodEvent[] = await pollRes.json();
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, events: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const processed: Array<Record<string, unknown>> = [];
    const ackList: Array<{ id: string }> = [];

    for (const ev of events) {
      try {
        // Encontra a loja virtual pelo merchantId
        const { data: store } = await sb
          .from("stores")
          .select("id, name, parent_store_id, ifood_environment, ifood_auto_accept")
          .eq("ifood_merchant_uuid", ev.merchantId)
          .maybeSingle();

        if (!store) {
          const reason = "merchant_not_mapped";
          await sb.from("pdv_ifood_failed_events").upsert({
            external_event_id: ev.id,
            event_code: ev.code,
            order_id_external: ev.orderId,
            merchant_id: ev.merchantId ?? null,
            payload: ev as unknown as Record<string, unknown>,
            error: reason,
            source: "poll",
            attempts: 1,
          }, { onConflict: "external_event_id", ignoreDuplicates: false });
          processed.push({ event: ev.id, skipped: reason, merchantId: ev.merchantId });
          continue;
        }

        // Canal iFood dessa loja
        const { data: channel } = await sb
          .from("pdv_channels")
          .select("id")
          .eq("store_id", store.id)
          .eq("code", "ifood")
          .maybeSingle();

        if (!channel) {
          const isHomologStore = /homolog/i.test((store as { name?: string | null }).name ?? "");
          if (isHomologStore) {
            processed.push({ event: ev.id, skipped: "homolog_store_ignored", storeId: store.id });
            ackList.push({ id: ev.id });
            continue;
          }
          const reason = `channel_not_found:${store.id}`;
          await sb.from("pdv_ifood_failed_events").upsert({
            external_event_id: ev.id,
            event_code: ev.code,
            order_id_external: ev.orderId,
            merchant_id: ev.merchantId ?? null,
            payload: { ...ev, resolved_store_id: store.id } as unknown as Record<string, unknown>,
            error: reason,
            source: "poll",
            attempts: 1,
          }, { onConflict: "external_event_id", ignoreDuplicates: false });
          processed.push({ event: ev.id, skipped: reason });
          continue;
        }

        // Busca detalhes do pedido
        const detRes = await fetch(`${API_BASE}/order/v1.0/orders/${ev.orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const orderDetails = detRes.ok ? await detRes.json() : null;

        const newStatus = eventToStatus(ev.code);

        // Upsert pedido por (channel_id, external_order_id)
        const { data: existing } = await sb
          .from("pdv_orders")
          .select("id, status")
          .eq("channel_id", channel.id)
          .eq("external_order_id", ev.orderId)
          .maybeSingle();

        if (!existing) {
          // Cria pedido novo
          const customer = orderDetails?.customer ?? {};
          const total = orderDetails?.total?.orderAmount ?? orderDetails?.totalPrice ?? 0;
          const subtotal = orderDetails?.total?.subTotal ?? total;
          const deliveryFee = orderDetails?.total?.deliveryFee ?? 0;
          // Ajuste SINIEF 9/26: endereço do cliente é obrigatório na NFC-e para TAKEOUT.
          // Prioriza customer.billingAddress (novo campo iFood) e cai para delivery.deliveryAddress.
          const customerAddress = extractIfoodCustomerAddress(orderDetails);
          const customerDocument = extractIfoodCustomerDocument(orderDetails);

          const { data: created, error: insErr } = await sb
            .from("pdv_orders")
            .insert({
              store_id: store.id,
              channel_id: channel.id,
              external_order_id: ev.orderId,
              external_display_id: orderDetails?.displayId ?? null,
              customer_name: customer?.name ?? null,
              customer_phone: customer?.phone?.number ?? null,
              customer_document: customerDocument,
              status: newStatus ?? "placed",
              order_type: orderDetails?.orderType?.toLowerCase() ?? "delivery",
              delivery_by: orderDetails?.delivery?.deliveredBy ?? null,
              delivery_address: customerAddress,
              subtotal,
              delivery_fee: deliveryFee,
              total,
              source_payload: orderDetails,
              last_synced_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (insErr) throw insErr;

          // Itens
          if (orderDetails?.items && Array.isArray(orderDetails.items)) {
            const items = orderDetails.items.map((it: Record<string, unknown>) => ({
              order_id: created.id,
              name: (it.name as string) ?? "Item",
              quantity: (it.quantity as number) ?? 1,
              unit_price: (it.unitPrice as number) ?? 0,
              total: (it.totalPrice as number) ?? 0,
              notes: (it.observations as string) ?? null,
            }));
            await sb.from("pdv_order_items").insert(items);
          }

          // Registra evento
          await sb.from("pdv_order_events").insert({
            order_id: created.id,
            store_id: store.id,
            source: "ifood",
            event_code: ev.code,
            external_event_id: ev.id,
            new_status: newStatus,
            payload: ev as unknown as Record<string, unknown>,
          });

          // 🚀 Auto-aceitar: confirma + inicia preparo automaticamente (apenas se a loja tiver auto-accept ligado)
          if ((newStatus ?? "placed") === "placed" && (store as any).ifood_auto_accept !== false) {
            const { autoAcceptIfoodOrder } = await import("../_shared/ifoodAutoAccept.ts");
            await autoAcceptIfoodOrder(sb, {
              orderId: created.id,
              externalOrderId: ev.orderId,
              storeId: store.id,
              environment: (store.ifood_environment as "sandbox" | "production") ?? "sandbox",
            });
          }


          processed.push({ event: ev.id, action: "created", orderId: created.id });
          ackList.push({ id: ev.id });
        } else {
          // Avança status se mudou
          if (newStatus && newStatus !== existing.status) {
            await sb.rpc("pdv_advance_order_status", {
              p_order_id: existing.id,
              p_new_status: newStatus,
              p_event_code: ev.code,
              p_external_event_id: ev.id,
              p_source: "ifood",
              p_payload: ev as unknown as Record<string, unknown>,
            });
          }
          await sb.from("pdv_orders").update({ last_synced_at: new Date().toISOString() }).eq("id", existing.id);
          processed.push({ event: ev.id, action: "updated", orderId: existing.id, status: newStatus });
          ackList.push({ id: ev.id });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("Erro processando evento", ev.id, errMsg);
        processed.push({ event: ev.id, error: errMsg });
        // Persiste pra retry posterior. NÃO enviamos ACK pra esses.
        await sb.from("pdv_ifood_failed_events").upsert({
          external_event_id: ev.id,
          event_code: ev.code,
          order_id_external: ev.orderId,
          merchant_id: ev.merchantId ?? null,
          payload: ev as unknown as Record<string, unknown>,
          error: errMsg,
          source: "poll",
          attempts: 1,
        }, { onConflict: "external_event_id", ignoreDuplicates: false });
      }
    }

    // 2. Acknowledge SOMENTE dos eventos processados com sucesso
    if (ackList.length > 0) {
      await fetch(`${API_BASE}/order/v1.0/events/acknowledgment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(ackList),
      });
    }

    return new Response(JSON.stringify({ ok: true, events: events.length, acked: ackList.length, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ifood-poll erro:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
