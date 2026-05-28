// Webhook receptor do iFood (push de eventos).
// iFood envia POST com array de eventos. Validamos um secret compartilhado
// (configurado no Portal do Parceiro) via header `x-ifood-signature`.
// Mesma lógica de processamento do ifood-poll, mas SEM ACK por evento
// (o webhook usa entrega garantida via 200 OK).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ifood-signature",
};

const API_BASE = "https://merchant-api.ifood.com.br";

type IfoodEvent = {
  id: string;
  code: string;
  fullCode?: string;
  orderId: string;
  merchantId?: string;
  createdAt?: string;
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Healthcheck do iFood ("Testar conexão" no portal) — só precisa responder 200
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(JSON.stringify({ ok: true, service: "ifood-webhook" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validação de assinatura (secret compartilhado configurado no Portal iFood)
  const expected = Deno.env.get("IFOOD_WEBHOOK_SECRET");
  const received = req.headers.get("x-ifood-signature");
  let signatureValid: boolean | null = null;
  if (expected) {
    signatureValid = received === expected;
    if (!signatureValid) {
      await sb.from("pdv_ifood_webhook_log").insert({
        signature_valid: false,
        event_count: 0,
        error: "invalid_signature",
      });
      return new Response(JSON.stringify({ ok: false, error: "invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const events: IfoodEvent[] = (Array.isArray(body) ? body as IfoodEvent[] : [body as IfoodEvent])
    .filter((e) => e && e.code !== "KEEPALIVE" && e.orderId);
  if (events.length === 0) {
    return new Response(JSON.stringify({ ok: true, received: 0, note: "keepalive" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const logEntry = await sb.from("pdv_ifood_webhook_log").insert({
    signature_valid: signatureValid,
    event_count: events.length,
    payload: body as Record<string, unknown>,
  }).select("id").single();

  // Pega token só se precisar buscar detalhes de pedidos novos, respeitando o ambiente da loja
  const tokenByEnv = new Map<string, string>();
  const getToken = async (environment: "sandbox" | "production" = "sandbox"): Promise<string> => {
    const cached = tokenByEnv.get(environment);
    if (cached) return cached;
    const mod = await import("../_shared/ifoodAuth.ts");
    const token = await mod.getIfoodAccessToken(environment);
    tokenByEnv.set(environment, token);
    return token;
  };

  let processedCount = 0;
  const processed: Array<Record<string, unknown>> = [];

  for (const ev of events) {
    try {
      const { data: store } = await sb
        .from("stores")
        .select("id, name, ifood_environment, ifood_auto_accept")
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
          source: "webhook",
          attempts: 1,
        }, { onConflict: "external_event_id", ignoreDuplicates: false });
        processed.push({ event: ev.id, skipped: reason });
        continue;
      }

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
          source: "webhook",
          attempts: 1,
        }, { onConflict: "external_event_id", ignoreDuplicates: false });
        processed.push({ event: ev.id, skipped: reason });
        continue;
      }

      const newStatus = eventToStatus(ev.code);

      const { data: existing } = await sb
        .from("pdv_orders")
        .select("id, status")
        .eq("channel_id", channel.id)
        .eq("external_order_id", ev.orderId)
        .maybeSingle();

      if (!existing) {
        const token = await getToken((store.ifood_environment as "sandbox" | "production") ?? "sandbox");
        const detRes = await fetch(`${API_BASE}/order/v1.0/orders/${ev.orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const orderDetails = detRes.ok ? await detRes.json() : null;
        const customer = orderDetails?.customer ?? {};
        const total = orderDetails?.total?.orderAmount ?? orderDetails?.totalPrice ?? 0;
        const subtotal = orderDetails?.total?.subTotal ?? total;
        const deliveryFee = orderDetails?.total?.deliveryFee ?? 0;

        const { data: created, error: insErr } = await sb
          .from("pdv_orders")
          .insert({
            store_id: store.id,
            channel_id: channel.id,
            external_order_id: ev.orderId,
            external_display_id: orderDetails?.displayId ?? null,
            customer_name: customer?.name ?? null,
            customer_phone: customer?.phone?.number ?? null,
            status: newStatus ?? "placed",
            order_type: orderDetails?.orderType?.toLowerCase() ?? "delivery",
            delivery_by: orderDetails?.delivery?.deliveredBy ?? null,
            subtotal, delivery_fee: deliveryFee, total,
            source_payload: orderDetails,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

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

        await sb.from("pdv_order_events").insert({
          order_id: created.id,
          store_id: store.id,
          source: "ifood-webhook",
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
      } else {
        if (newStatus && newStatus !== existing.status) {
          await sb.rpc("pdv_advance_order_status", {
            p_order_id: existing.id,
            p_new_status: newStatus,
            p_event_code: ev.code,
            p_external_event_id: ev.id,
            p_source: "ifood-webhook",
            p_payload: ev as unknown as Record<string, unknown>,
          });
        }
        await sb.from("pdv_orders").update({ last_synced_at: new Date().toISOString() }).eq("id", existing.id);
        processed.push({ event: ev.id, action: "updated", orderId: existing.id });
      }
      processedCount++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("webhook erro evento", ev.id, errMsg);
      await sb.from("pdv_ifood_failed_events").upsert({
        external_event_id: ev.id,
        event_code: ev.code,
        order_id_external: ev.orderId,
        merchant_id: ev.merchantId ?? null,
        payload: ev as unknown as Record<string, unknown>,
        error: errMsg,
        source: "webhook",
        attempts: 1,
      }, { onConflict: "external_event_id", ignoreDuplicates: false });
      processed.push({ event: ev.id, error: errMsg });
    }
  }

  if (logEntry.data?.id) {
    await sb.from("pdv_ifood_webhook_log")
      .update({ processed_count: processedCount })
      .eq("id", logEntry.data.id);
  }

  // Sempre 200 — iFood considera entregue. Falhas ficam em pdv_ifood_failed_events.
  return new Response(JSON.stringify({ ok: true, received: events.length, processed: processedCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
