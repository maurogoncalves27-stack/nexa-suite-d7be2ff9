/**
 * Emissão NFC-e via agente ACBr local (piloto Asa Sul).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildOrderNfceIni,
  type OrderNfceItem,
  type OrderNfcePayment,
  type StoreNfceCfg,
} from "@/lib/acbr/nfceIniBuilder";
import { parseAcbrEnviarRetorno } from "@/lib/acbr/parseAcbrRetorno";
import { joinAgentUrl } from "@/lib/tef/agentUrl";
import type { EmitNfceResult } from "./types";

const DEFAULT_AGENT = "http://127.0.0.1:3030";

export async function emitNfceAcbr(orderId: string, closureId?: string): Promise<EmitNfceResult> {
  const { data: prep, error: prepErr } = await supabase.functions.invoke("nfce-acbr-complete", {
    body: { action: "prepare", order_id: orderId, closure_id: closureId },
  });
  if (prepErr) return { ok: false, error: prepErr.message };
  if (!prep?.ok) return { ok: false, error: prep?.error || "Falha ao preparar emissão ACBr" };

  const { data: order, error: orderErr } = await supabase
    .from("pdv_orders")
    .select("*, pdv_order_items(*)")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) return { ok: false, error: "Pedido não encontrado" };

  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select(
      "id, cnpj, legal_name, name, inscricao_estadual, regime_tributario, address, number, neighborhood, city, state, zip_code, nfce_serie, nfce_next_number, nfce_environment, nfce_emission_provider",
    )
    .eq("id", prep.store_id)
    .single();
  if (storeErr || !store) return { ok: false, error: "Loja não encontrada" };

  const recipeIds = ((order as any).pdv_order_items ?? [])
    .map((i: any) => i.menu_item_id)
    .filter(Boolean);
  const fiscalByRecipe: Record<string, any> = {};
  if (recipeIds.length) {
    const { data: recipes } = await supabase
      .from("recipes")
      .select("id, ncm, cfop, origem_mercadoria, csosn, cst, unidade_comercial, ean")
      .in("id", recipeIds);
    for (const r of recipes ?? []) fiscalByRecipe[r.id] = r;
  }

  const items: OrderNfceItem[] = ((order as any).pdv_order_items ?? []).map((it: any) => ({
    menu_item_id: it.menu_item_id,
    name: it.name,
    quantity: Number(it.quantity) || 1,
    unit_price: Number(it.unit_price) || 0,
    fiscal: fiscalByRecipe[it.menu_item_id],
  }));

  const { data: payments } = await supabase
    .from("pdv_payments")
    .select("method, amount")
    .eq("order_id", orderId);

  const payRows: OrderNfcePayment[] = (payments?.length
    ? payments
    : [{ method: "credit", amount: Number(order.total) || 0 }]
  ).map((p: any) => ({ method: p.method, amount: Number(p.amount) || 0 }));

  let iniContent: string;
  try {
    iniContent = buildOrderNfceIni(store as StoreNfceCfg, items, payRows, {
      numeroNF: prep.numero,
      serie: prep.serie,
      customerDocument: (order as any).customer_document,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const agentUrl = prep.agent_url || DEFAULT_AGENT;
  let emitResp: Response;
  try {
    emitResp = await fetch(joinAgentUrl(agentUrl, "/nfce/emitir"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iniContent, imprimir: false, sincrono: true }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Agente ACBr inacessível: ${msg}` };
  }

  const emitJson = await emitResp.json().catch(() => ({}));
  if (!emitResp.ok || !emitJson.ok) {
    return {
      ok: false,
      error: emitJson.error || `Agente respondeu HTTP ${emitResp.status}`,
    };
  }

  const parsed = parseAcbrEnviarRetorno(String(emitJson.retorno ?? ""));
  const { data: fin, error: finErr } = await supabase.functions.invoke("nfce-acbr-complete", {
    body: {
      action: "finalize",
      invoice_id: prep.invoice_id,
      order_id: orderId,
      retorno: emitJson.retorno,
      authorized: parsed.authorized,
      c_stat: parsed.cStat,
      x_motivo: parsed.xMotivo,
      chave_acesso: parsed.chave,
      protocolo: parsed.protocolo,
      numero: parsed.numero ?? prep.numero,
      serie: parsed.serie ?? prep.serie,
    },
  });
  if (finErr) return { ok: false, error: finErr.message };
  if (!fin?.ok) return { ok: false, error: fin?.error || "Falha ao gravar NFC-e" };

  if (!parsed.authorized) {
    return {
      ok: false,
      invoiceId: prep.invoice_id,
      status: "rejected",
      error: parsed.xMotivo || `SEFAZ rejeitou (cStat=${parsed.cStat ?? "?"})`,
    };
  }

  if (closureId) {
    await supabase
      .from("pdv_fiscal_invoices")
      .update({ closure_id: closureId })
      .eq("id", prep.invoice_id);
  }

  return {
    ok: true,
    invoiceId: prep.invoice_id,
    status: "authorized",
    danfeUrl: null,
  };
}
