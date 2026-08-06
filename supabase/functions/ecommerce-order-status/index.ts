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
        "id, status, order_number, total, subtotal, pickup_eta, confirmed_at, ready_at, dispatched_at, concluded_at, brand_breakdown, customer_name, store_id, order_type, delivery_fee, delivery_address, delivery_tracking_url, delivery_job_id",
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

    // Estado da corrida, quando houver. Só o necessário para acompanhar:
    // nada de telefone do entregador nem endereço bruto neste endpoint público.
    let delivery: Record<string, unknown> | null = null;
    if (order.order_type === "delivery") {
      const { data: job } = order.delivery_job_id
        ? await supabase
            .from("delivery_jobs")
            .select("status, driver_name, eta_minutes, tracking_url, picked_up_at, delivered_at")
            .eq("id", order.delivery_job_id)
            .maybeSingle()
        : { data: null };

      delivery = {
        fee: Number(order.delivery_fee ?? 0),
        address_label: formatAddress(order.delivery_address),
        tracking_url: order.delivery_tracking_url ?? job?.tracking_url ?? null,
        job_status: job?.status ?? null,
        driver_name: job?.driver_name ?? null,
        eta_minutes: job?.eta_minutes ?? null,
        picked_up_at: job?.picked_up_at ?? null,
        delivered_at: job?.delivered_at ?? null,
      };
    }

    const {
      delivery_address: _addr,
      delivery_job_id: _jobId,
      store_id: _storeId,
      ...publicOrder
    } = order as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        ok: true,
        order: { ...publicOrder, items: items || [], store: store || null, delivery },
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

// Rótulo curto do endereço, sem complemento nem telefone.
function formatAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const street = [a.street, a.number].filter(Boolean).join(", ");
  return [street, a.neighborhood, a.city].filter(Boolean).join(" · ") || null;
}
