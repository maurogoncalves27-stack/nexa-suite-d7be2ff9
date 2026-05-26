// Auto-aceita pedidos do iFood: confirm + startPreparation, atualiza status local pra "preparing".
// Chamado pelo webhook (PLC) e pelo poll (PLC). Faz best-effort — falhas são logadas mas não derrubam o flow.
//
// ⚠️ MODO: "accept" = auto-aceita (confirm+startPreparation)
//             "cancel" = auto-cancela (só para homologação iFood)
// Valor padrão "accept" — fluxo manual no frontend via toggle.
import { getIfoodAccessToken, type IfoodEnv } from "./ifoodAuth.ts";

const API_BASE = "https://merchant-api.ifood.com.br";
const AUTO_MODE: "accept" | "cancel" = "accept";
// (mantido em "accept" — auto-cancel desativado; loja iFood Homologação usa ifood_auto_accept=false pra fluxo manual)

export async function autoAcceptIfoodOrder(
  sb: any,
  args: {
    orderId: string;             // pdv_orders.id
    externalOrderId: string;     // id do iFood
    storeId: string;
    environment: IfoodEnv;
  },
): Promise<{ accepted: boolean; finalStatus: string; error?: string }> {
  if (AUTO_MODE === "cancel") {
    return await autoCancel(sb, args);
  }
  try {
    const token = await getIfoodAccessToken(args.environment);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1) confirm
    const confirmRes = await fetch(
      `${API_BASE}/order/v1.0/orders/${args.externalOrderId}/confirm`,
      { method: "POST", headers },
    );
    if (!confirmRes.ok && confirmRes.status !== 409) {
      const t = await confirmRes.text();
      throw new Error(`confirm ${confirmRes.status}: ${t}`);
    }
    await sb.rpc("pdv_advance_order_status", {
      p_order_id: args.orderId,
      p_new_status: "confirmed",
      p_event_code: "auto_confirm",
      p_source: "auto-accept",
    });

    // 2) startPreparation
    const startRes = await fetch(
      `${API_BASE}/order/v1.0/orders/${args.externalOrderId}/startPreparation`,
      { method: "POST", headers },
    );
    if (!startRes.ok && startRes.status !== 409) {
      const t = await startRes.text();
      console.error("auto-accept startPreparation falhou", t);
      return { accepted: true, finalStatus: "confirmed", error: t };
    }
    await sb.rpc("pdv_advance_order_status", {
      p_order_id: args.orderId,
      p_new_status: "preparing",
      p_event_code: "auto_start_preparation",
      p_source: "auto-accept",
    });

    return { accepted: true, finalStatus: "preparing" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-accept erro", msg);
    return { accepted: false, finalStatus: "placed", error: msg };
  }
}

async function autoCancel(
  sb: any,
  args: { orderId: string; externalOrderId: string; storeId: string; environment: IfoodEnv },
): Promise<{ accepted: boolean; finalStatus: string; error?: string }> {
  try {
    const token = await getIfoodAccessToken(args.environment);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1) buscar motivos
    const reasonsRes = await fetch(
      `${API_BASE}/order/v1.0/orders/${args.externalOrderId}/cancellationReasons`,
      { method: "GET", headers },
    );
    const reasonsText = await reasonsRes.text();
    if (!reasonsRes.ok) {
      throw new Error(`cancellationReasons ${reasonsRes.status}: ${reasonsText}`);
    }
    const reasons = JSON.parse(reasonsText) as Array<{ cancelCodeId: string; description: string }>;
    console.log(`[auto-cancel] ${reasons.length} motivos para ${args.externalOrderId}`);

    // Prioriza 501 (Problemas de sistema na loja); fallback pro primeiro
    const chosen = reasons.find((r) => r.cancelCodeId === "501") ?? reasons[0];
    if (!chosen) throw new Error("nenhum motivo de cancelamento retornado");

    // 2) solicitar cancelamento
    const cancelRes = await fetch(
      `${API_BASE}/order/v1.0/orders/${args.externalOrderId}/requestCancellation`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ cancellationCode: chosen.cancelCodeId, reason: chosen.description }),
      },
    );
    const cancelText = await cancelRes.text();
    if (!cancelRes.ok && cancelRes.status !== 409) {
      throw new Error(`requestCancellation ${cancelRes.status}: ${cancelText}`);
    }

    await sb.rpc("pdv_advance_order_status", {
      p_order_id: args.orderId,
      p_new_status: "cancelled",
      p_event_code: "auto_cancel",
      p_source: "auto-cancel",
      p_reason_code: chosen.cancelCodeId,
      p_reason_text: chosen.description,
    });

    console.log(`[auto-cancel] ${args.externalOrderId} cancelado (${chosen.cancelCodeId} — ${chosen.description})`);
    return { accepted: false, finalStatus: "cancelled" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auto-cancel] erro", msg);
    return { accepted: false, finalStatus: "placed", error: msg };
  }
}
