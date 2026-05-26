// Busca os motivos de cancelamento válidos do iFood para um pedido específico.
// Requisito de homologação: precisamos chamar GET /cancellationReasons ANTES
// de enviar /requestCancellation e exibir as opções retornadas ao operador.
// Doc: https://developer.ifood.com.br/pt-BR/docs/references/order
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getIfoodAccessToken, type IfoodEnv } from "../_shared/ifoodAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://merchant-api.ifood.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { orderId, environment } = await req.json() as {
      orderId: string;
      environment?: IfoodEnv;
    };
    if (!orderId) {
      return new Response(JSON.stringify({ ok: false, error: "orderId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: ordErr } = await sb
      .from("pdv_orders")
      .select("id, store_id, external_order_id")
      .eq("id", orderId)
      .single();
    if (ordErr || !order) throw new Error("Pedido não encontrado");
    if (!order.external_order_id) throw new Error("Pedido sem id externo iFood");

    const env: IfoodEnv = environment ?? "sandbox";
    const token = await getIfoodAccessToken(env);

    const url = `${API_BASE}/order/v1.0/orders/${order.external_order_id}/cancellationReasons`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`iFood cancellationReasons falhou ${res.status}: ${text}`);
    }

    let raw: unknown;
    try { raw = JSON.parse(text); } catch { raw = []; }

    // O iFood pode retornar tanto um array direto quanto { cancelCodesAndReasons: [...] }.
    const list: Array<Record<string, unknown>> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : ((raw as { cancelCodesAndReasons?: Array<Record<string, unknown>> })?.cancelCodesAndReasons ?? []);

    const reasons = list.map((r) => ({
      cancelCodeId: String(r.cancelCodeId ?? r.cancellationCode ?? r.code ?? ""),
      description: String(r.description ?? r.reason ?? r.cancelReason ?? ""),
    })).filter((r) => r.cancelCodeId && r.description);

    return new Response(JSON.stringify({ ok: true, reasons }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ifood-cancellation-reasons erro:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
