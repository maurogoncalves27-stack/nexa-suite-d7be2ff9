/**
 * Emissão NFC-e — roteia por loja: Focus (nuvem) ou ACBr local (agente).
 */
import { supabase } from "@/integrations/supabase/client";
import type { EmitNfceResult } from "./types";
import { emitNfceAcbr } from "./emitNfceAcbr";

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

async function resolveEmissionProvider(orderId: string): Promise<string> {
  const { data: order } = await supabase
    .from("pdv_orders")
    .select("store_id")
    .eq("id", orderId)
    .single();

  const storeId = order?.store_id;
  if (!storeId) return "focus_nfe";

  const { data: store } = await supabase
    .from("stores")
    .select("nfce_emission_provider, is_virtual, parent_store_id")
    .eq("id", storeId)
    .maybeSingle();

  let provider = (store as any)?.nfce_emission_provider ?? "focus_nfe";
  if ((store as any)?.is_virtual && (store as any)?.parent_store_id) {
    const { data: parent } = await supabase
      .from("stores")
      .select("nfce_emission_provider")
      .eq("id", (store as any).parent_store_id)
      .maybeSingle();
    if (parent) provider = (parent as any).nfce_emission_provider ?? provider;
  }
  return provider;
}

async function emitNfceFocus(orderId: string, closureId?: string): Promise<EmitNfceResult> {
  const { data, error } = await supabase.functions.invoke("nfce-emit", {
    body: { order_id: orderId },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error || "Falha ao emitir cupom fiscal" };

  let danfeUrl: string | null = data.danfe_url ?? null;
  const invoiceId: string | null = data.invoice_id ?? null;

  if (!danfeUrl && data.status === "processing" && invoiceId) {
    for (let i = 0; i < POLL_ATTEMPTS && !danfeUrl; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      const { data: statusData } = await supabase.functions.invoke("nfce-status", {
        body: { invoice_id: invoiceId },
      });
      if (statusData?.danfe_url) danfeUrl = statusData.danfe_url;
    }
  }

  if (closureId && invoiceId) {
    await supabase
      .from("pdv_fiscal_invoices")
      .update({ closure_id: closureId })
      .eq("id", invoiceId);
  }

  return {
    ok: true,
    danfeUrl,
    invoiceId,
    status: data.status,
  };
}

export async function emitNfce(orderId: string, closureId?: string): Promise<EmitNfceResult> {
  const provider = await resolveEmissionProvider(orderId);
  if (provider === "acbr_local") {
    return emitNfceAcbr(orderId, closureId);
  }
  return emitNfceFocus(orderId, closureId);
}
