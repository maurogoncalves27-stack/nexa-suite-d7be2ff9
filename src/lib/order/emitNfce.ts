/**
 * Emissão NFC-e + poll do DANFE (padrão extraído do Totem).
 */
import { supabase } from "@/integrations/supabase/client";
import type { EmitNfceResult } from "./types";

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

export async function emitNfce(orderId: string, closureId?: string): Promise<EmitNfceResult> {
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
