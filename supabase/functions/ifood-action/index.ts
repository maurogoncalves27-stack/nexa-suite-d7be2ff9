// Ações do nosso PDV pro iFood: confirmar, iniciar preparo, despachar, cancelar
// Doc: https://developer.ifood.com.br/pt-BR/docs/references/order
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getIfoodAccessToken, type IfoodEnv } from "../_shared/ifoodAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://merchant-api.ifood.com.br";

type Action = "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "cancel";

const PATHS: Record<Action, string> = {
  confirm: "confirm",
  startPreparation: "startPreparation",
  readyToPickup: "readyToPickup",
  dispatch: "dispatch",
  cancel: "requestCancellation",
};

const STATUS_AFTER: Record<Action, string> = {
  confirm: "confirmed",
  startPreparation: "preparing",
  readyToPickup: "ready",
  dispatch: "dispatched",
  cancel: "cancelled",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { orderId, action, environment, reason } = await req.json() as {
      orderId: string; action: Action; environment?: IfoodEnv;
      reason?: { cancellationCode: string; reason: string };
    };

    if (!orderId || !action || !PATHS[action]) {
      return new Response(JSON.stringify({ ok: false, error: "orderId/action inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega pedido pra pegar external_order_id e store_id
    const { data: order, error: ordErr } = await sb
      .from("pdv_orders")
      .select("id, store_id, external_order_id, status")
      .eq("id", orderId)
      .single();

    if (ordErr || !order) throw new Error("Pedido não encontrado");
    if (!order.external_order_id) throw new Error("Pedido sem id externo iFood");

    const env: IfoodEnv = environment ?? "sandbox";
    const token = await getIfoodAccessToken(env);

    const url = `${API_BASE}/order/v1.0/orders/${order.external_order_id}/${PATHS[action]}`;
    const ifoodRes = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: action === "cancel" ? JSON.stringify(reason ?? {}) : undefined,
    });

    const ifoodText = await ifoodRes.text();
    if (!ifoodRes.ok) {
      let parsed: { error?: { code?: string; message?: string } } | null = null;
      try {
        parsed = ifoodText ? JSON.parse(ifoodText) : null;
      } catch {
        parsed = null;
      }

      const code = parsed?.error?.code ?? null;
      const message = parsed?.error?.message ?? (ifoodText || `Falha ${ifoodRes.status}`);

      console.error("ifood-action erro upstream:", {
        action,
        orderId,
        externalOrderId: order.external_order_id,
        status: ifoodRes.status,
        code,
        message,
      });

      return new Response(
        JSON.stringify({
          ok: false,
          status: ifoodRes.status,
          code,
          error: `iFood ${action} falhou ${ifoodRes.status}: ${message}`,
          upstreamMessage: message,
        }),
        { status: ifoodRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Avança status local
    await sb.rpc("pdv_advance_order_status", {
      p_order_id: order.id,
      p_new_status: STATUS_AFTER[action],
      p_event_code: action,
      p_source: "internal",
      p_reason_code: reason?.cancellationCode ?? null,
      p_reason_text: reason?.reason ?? null,
    });

    return new Response(JSON.stringify({ ok: true, action, newStatus: STATUS_AFTER[action] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ifood-action erro:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
