// Status público do pedido (sem auth) — usado pela página /pedir/pedido/:id
// GET ?id=<order_id>  → { status, order_number, total, pickup_eta, items[], brand_breakdown }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: order } = await supabase
      .from("pdv_orders")
      .select(
        "id, status, order_number, total, subtotal, pickup_eta, confirmed_at, ready_at, brand_breakdown, customer_name, store_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: items } = await supabase
      .from("pdv_order_items")
      .select("id, name, quantity, unit_price, total, complements")
      .eq("order_id", id);

    const { data: store } = await supabase
      .from("ecommerce_stores")
      .select("display_name, address, phone, slug")
      .eq("store_id", order.store_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        ok: true,
        order: { ...order, items: items || [], store: store || null },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ecommerce-order-status]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
