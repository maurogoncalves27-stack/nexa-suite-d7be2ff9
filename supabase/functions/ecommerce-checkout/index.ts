// Cria pdv_order a partir do carrinho do site (pedir.aquelaparme.com.br)
// e gera preferência de pagamento no Mercado Pago.
// Pública (anon): qualquer cliente pode chamar.
//
// Body: { storeSlug, customer_name, customer_phone, order_type?: 'pickup'|'delivery',
//         delivery_address?: DeliveryAddress, delivery_quote?: { quote_id, provider, fee_cents },
//         items: [{ menu_item_id?, name, brand_code, unit_price, quantity, notes? }] }
// Retorno: { ok, order_id, init_point, preference_id }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { quoteStore } from "../_shared/delivery/service.ts";
import type { DeliveryAddress } from "../_shared/delivery/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
const CHECKOUT_ORIGIN = "https://www.aquelaparme.com.br";

function resolveCheckoutOrigin(originHeader: string | null) {
  if (!originHeader) return CHECKOUT_ORIGIN;
  try {
    const origin = new URL(originHeader);
    const isLocal = ["localhost", "127.0.0.1", "0.0.0.0"].includes(origin.hostname);
    if (origin.protocol !== "https:" || isLocal) return CHECKOUT_ORIGIN;
    return origin.origin;
  } catch {
    return CHECKOUT_ORIGIN;
  }
}

type Item = {
  menu_item_id?: string;
  name: string;
  brand_code: string;
  unit_price: number;
  quantity: number;
  notes?: string;
};

// Diferença máxima (centavos) que absorvemos entre o frete mostrado ao cliente
// e a recotação no momento do checkout. Acima disso, pedimos confirmação.
const FEE_TOLERANCE_CENTS = 200;

function isValidDropoff(a: unknown): a is DeliveryAddress {
  const d = a as DeliveryAddress | null;
  return !!d &&
    typeof d.street === "string" && d.street.trim().length > 1 &&
    typeof d.city === "string" && d.city.trim().length > 1 &&
    typeof d.state === "string" && /^[A-Za-z]{2}$/.test(d.state.trim()) &&
    typeof d.postal_code === "string" && d.postal_code.replace(/\D/g, "").length === 8 &&
    typeof d.latitude === "number" && Number.isFinite(d.latitude) &&
    typeof d.longitude === "number" && Number.isFinite(d.longitude);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const storeSlug = String(body?.storeSlug || "").trim();
    const customer_name = String(body?.customer_name || "").trim();
    const customer_phone = String(body?.customer_phone || "").trim();
    const items = (Array.isArray(body?.items) ? body.items : []) as Item[];
    const orderType = body?.order_type === "delivery" ? "delivery" : "pickup";
    const dropoffInput = body?.delivery_address ?? null;
    const clientQuote = body?.delivery_quote ?? null;

    if (!storeSlug || !customer_name || !customer_phone || items.length === 0) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // validações simples
    for (const it of items) {
      if (!it.name || typeof it.unit_price !== "number" || it.unit_price < 0) {
        return new Response(JSON.stringify({ error: "invalid_item" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!it.quantity || it.quantity < 1) it.quantity = 1;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. loja
    const { data: store, error: storeErr } = await supabase
      .from("ecommerce_stores")
      .select("id, store_id, slug, is_open, active, min_pickup_minutes, accepts_pickup, accepts_delivery")
      .eq("slug", storeSlug)
      .maybeSingle();
    if (storeErr || !store) {
      return new Response(JSON.stringify({ error: "store_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!store.active || !store.is_open) {
      return new Response(JSON.stringify({ error: "store_closed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. canal "Site Direto" da loja
    const { data: channel } = await supabase
      .from("pdv_channels")
      .select("id")
      .eq("store_id", store.store_id)
      .eq("code", "site_direto")
      .eq("is_active", true)
      .maybeSingle();
    if (!channel) {
      return new Response(JSON.stringify({ error: "channel_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. modalidade + frete
    if (orderType === "delivery" && !store.accepts_delivery) {
      return new Response(JSON.stringify({ error: "delivery_not_available" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (orderType === "pickup" && store.accepts_pickup === false) {
      return new Response(JSON.stringify({ error: "pickup_not_available" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const brand_breakdown: Record<string, number> = {};
    for (const it of items) {
      const k = it.brand_code || "other";
      brand_breakdown[k] = (brand_breakdown[k] || 0) + it.unit_price * it.quantity;
    }

    let dropoff: DeliveryAddress | null = null;
    let deliveryFeeCents = 0;
    let deliveryProvider: string | null = null;
    let deliveryQuoteId: string | null = null;

    if (orderType === "delivery") {
      if (!isValidDropoff(dropoffInput)) {
        return new Response(
          JSON.stringify({ error: "invalid_delivery_address", detail: "Endereço incompleto ou sem coordenadas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      dropoff = {
        ...dropoffInput,
        postal_code: dropoffInput.postal_code.replace(/\D/g, ""),
        state: dropoffInput.state.trim().toUpperCase(),
        country: "BR",
        contact_name: dropoffInput.contact_name || customer_name,
        contact_phone: dropoffInput.contact_phone || customer_phone,
      };

      // Nunca confia no frete vindo do cliente: recota no servidor.
      const { best, quotes } = await quoteStore(supabase, {
        store_id: store.store_id,
        dropoff,
        order_value_cents: Math.round(subtotal * 100),
      });
      if (!best) {
        const firstErr = (quotes as { error?: string }[]).find((q) => q?.error)?.error;
        return new Response(
          JSON.stringify({ error: "delivery_unavailable", detail: firstErr ?? "Nenhum provedor disponível" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const shownCents = Number(clientQuote?.fee_cents);
      const freshCents = best.fee_cents;
      // Se ficou mais caro que a tolerância, o cliente confirma o novo valor.
      if (Number.isFinite(shownCents) && freshCents - shownCents > FEE_TOLERANCE_CENTS) {
        return new Response(
          JSON.stringify({
            error: "delivery_fee_changed",
            delivery_fee_cents: freshCents,
            quote_id: best.quote_id,
            provider: best.provider,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Honra o valor exibido quando a diferença é pequena (ou ficou mais barato).
      deliveryFeeCents = Number.isFinite(shownCents) ? Math.min(shownCents, freshCents) : freshCents;
      deliveryProvider = best.provider;
      deliveryQuoteId = best.quote_id;
    }

    const deliveryFee = deliveryFeeCents / 100;
    const total = subtotal + deliveryFee;

    const pickup_eta = new Date(Date.now() + (store.min_pickup_minutes || 30) * 60_000).toISOString();

    // 4. cria order pendente
    const { data: order, error: orderErr } = await supabase
      .from("pdv_orders")
      .insert({
        store_id: store.store_id,
        channel_id: channel.id,
        order_type: orderType,
        status: "awaiting_payment",
        source: "site",
        customer_name,
        customer_phone,
        subtotal,
        total,
        brand_breakdown,
        pickup_eta,
        closure_channel: "whatsapp",
        ...(orderType === "delivery"
          ? {
              delivery_address: { ...dropoff, provider_quote_id: deliveryQuoteId },
              delivery_fee: deliveryFee,
              delivery_provider: deliveryProvider,
            }
          : {}),
      })
      .select("id, order_number")
      .single();

    if (orderErr || !order) {
      console.error("[ecommerce-checkout] order insert err", orderErr);
      return new Response(JSON.stringify({ error: "order_create_failed", detail: orderErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. items
    const itemsRows = items.map((it) => ({
      order_id: order.id,
      menu_item_id: it.menu_item_id || null,
      name: it.name,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total: it.unit_price * it.quantity,
      notes: it.notes || null,
      complements: { brand_code: it.brand_code },
    }));
    const { error: itemsErr } = await supabase.from("pdv_order_items").insert(itemsRows);
    if (itemsErr) {
      console.error("[ecommerce-checkout] items insert err", itemsErr);
    }

    // 6. Mercado Pago — cria preferência
    if (!MP_TOKEN) {
      return new Response(
        JSON.stringify({
          ok: true,
          order_id: order.id,
          mp_configured: false,
          message: "Pedido criado, mas Mercado Pago ainda não está configurado.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/mercadopago-webhook`;
    const origin = resolveCheckoutOrigin(req.headers.get("origin"));

    const mpItems = items.map((it) => ({
      title: String(it.name).slice(0, 250),
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      currency_id: "BRL",
    }));

    const preferenceBody = {
      items: mpItems,
      external_reference: order.id,
      notification_url: webhookUrl,
      statement_descriptor: "AQUELA PARME",
      payer: {
        name: customer_name,
        phone: { number: customer_phone },
      },
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        installments: 3,
      },
      back_urls: {
        success: `${origin}/pedir/pedido/${order.id}`,
        failure: `${origin}/pedir/pedido/${order.id}`,
        pending: `${origin}/pedir/pedido/${order.id}`,
      },
      auto_return: "approved",
      // MP soma shipments.cost ao total cobrado, mantendo os itens só com produtos.
      ...(deliveryFeeCents > 0
        ? { shipments: { mode: "not_specified", cost: Number(deliveryFee.toFixed(2)) } }
        : {}),
      metadata: { source: "site", store_slug: storeSlug, order_type: orderType },
    };

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_TOKEN}` },
      body: JSON.stringify(preferenceBody),
    });
    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      console.error("[ecommerce-checkout] MP error", mpResp.status, mpData);
      return new Response(JSON.stringify({ error: "mp_error", detail: mpData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const initPoint = mpData.init_point || mpData.sandbox_init_point;

    await supabase
      .from("pdv_orders")
      .update({ mp_preference_id: String(mpData.id || "") })
      .eq("id", order.id);

    await supabase.from("pdv_payments").insert({
      order_id: order.id,
      method: "online",
      amount: total,
      external_payment_id: String(mpData.id || ""),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        order_id: order.id,
        order_number: order.order_number,
        preference_id: mpData.id,
        init_point: initPoint,
        order_type: orderType,
        delivery_fee_cents: deliveryFeeCents,
        total,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ecommerce-checkout] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
