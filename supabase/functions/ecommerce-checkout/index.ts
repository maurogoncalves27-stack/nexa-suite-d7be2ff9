// Cria pdv_order a partir do carrinho do site (pedir.aquelaparme.com.br)
// e gera preferência de pagamento no Mercado Pago.
// Pública (anon): qualquer cliente pode chamar.
//
// Body: { storeSlug, customer_name, customer_phone, items: [{ menu_item_id?, name, brand_code, unit_price, quantity, notes? }] }
// Retorno: { ok, order_id, init_point, preference_id }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

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
      .select("id, store_id, slug, is_open, active, min_pickup_minutes")
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

    // 3. totais + brand_breakdown
    const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const total = subtotal;
    const brand_breakdown: Record<string, number> = {};
    for (const it of items) {
      const k = it.brand_code || "other";
      brand_breakdown[k] = (brand_breakdown[k] || 0) + it.unit_price * it.quantity;
    }

    const pickup_eta = new Date(Date.now() + (store.min_pickup_minutes || 30) * 60_000).toISOString();

    // 4. cria order pendente
    const { data: order, error: orderErr } = await supabase
      .from("pdv_orders")
      .insert({
        store_id: store.store_id,
        channel_id: channel.id,
        order_type: "pickup",
        status: "awaiting_payment",
        source: "site",
        customer_name,
        customer_phone,
        subtotal,
        total,
        brand_breakdown,
        pickup_eta,
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
      metadata: { source: "site", store_slug: storeSlug },
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
