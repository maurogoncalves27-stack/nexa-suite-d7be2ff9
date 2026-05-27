// Cancela uma NFC-e autorizada via Focus NFe (janela de até 30 min após autorização)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const baseUrl = (env: string) =>
  env === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
const basicAuth = (t: string) => "Basic " + btoa(t + ":");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const auth = await requireRole(req, ["admin", "manager"], corsHeaders);
    if (!auth.ok) return auth.response!;

    const { invoice_id, justificativa } = await req.json();
    if (!invoice_id) throw new Error("invoice_id obrigatório");
    const motivo = String(justificativa ?? "").trim();
    if (motivo.length < 15 || motivo.length > 255) {
      throw new Error("Justificativa deve ter entre 15 e 255 caracteres");
    }

    const { data: inv, error } = await sb
      .from("pdv_fiscal_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();
    if (error || !inv) throw new Error("invoice não encontrada");
    if (inv.status !== "authorized") throw new Error("Só é possível cancelar NFC-e autorizada");
    if (!inv.focus_ref) throw new Error("invoice sem focus_ref");

    // Janela de 30 min a partir da autorização
    if (inv.emitted_at) {
      const ageMin = (Date.now() - new Date(inv.emitted_at).getTime()) / 60000;
      if (ageMin > 30) {
        throw new Error(
          `Janela de cancelamento expirada (${ageMin.toFixed(0)} min após autorização; máx 30 min)`
        );
      }
    }

    const env = inv.environment;
    const token = env === "producao"
      ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
      : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
    if (!token) throw new Error("token Focus não configurado");

    const r = await fetch(`${baseUrl(env)}/v2/nfce/${inv.focus_ref}`, {
      method: "DELETE",
      headers: {
        Authorization: basicAuth(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ justificativa: motivo }),
    });
    const data = await r.json().catch(() => ({}));

    const ok = r.status === 200 || data?.status === "cancelado";
    if (!ok) {
      await sb
        .from("pdv_fiscal_invoices")
        .update({ response_payload: data })
        .eq("id", invoice_id);
      throw new Error(data?.mensagem ?? data?.erros?.[0]?.mensagem ?? "Falha ao cancelar na SEFAZ");
    }

    await sb
      .from("pdv_fiscal_invoices")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: motivo,
        response_payload: data,
      })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true, focus: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
