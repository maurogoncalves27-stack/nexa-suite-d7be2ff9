// Consulta status de uma NFC-e na Focus NFe (atualiza pdv_fiscal_invoices)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { invoice_id } = await req.json();
    const { data: inv, error } = await sb
      .from("pdv_fiscal_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();
    if (error || !inv) throw new Error("invoice não encontrada");

    const env = inv.environment;
    const token = env === "producao"
      ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
      : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
    if (!token) throw new Error("token Focus não configurado");

    const r = await fetch(`${baseUrl(env)}/v2/nfce/${inv.focus_ref}`, {
      headers: { Authorization: basicAuth(token) },
    });
    const data = await r.json().catch(() => ({}));

    const status =
      data.status === "autorizado"
        ? "authorized"
        : data.status === "denegado" || data.status === "erro_autorizacao"
        ? "rejected"
        : data.status === "cancelado"
        ? "cancelled"
        : "processing";

    const danfeUrl = data.caminho_danfe ? `${baseUrl(env)}${data.caminho_danfe}` : inv.danfe_url;
    const xmlUrl = data.caminho_xml_nota_fiscal
      ? `${baseUrl(env)}${data.caminho_xml_nota_fiscal}`
      : inv.xml_url;

    await sb
      .from("pdv_fiscal_invoices")
      .update({
        status,
        response_payload: data,
        numero: data.numero ? Number(data.numero) : inv.numero,
        serie: data.serie ? Number(data.serie) : inv.serie,
        chave_acesso: data.chave_nfe ?? inv.chave_acesso,
        protocolo: data.protocolo ?? inv.protocolo,
        danfe_url: danfeUrl,
        xml_url: xmlUrl,
        rejection_code: data.codigo_status?.toString() ?? inv.rejection_code,
        rejection_reason: data.mensagem_sefaz ?? data.mensagem ?? inv.rejection_reason,
        emitted_at: status === "authorized" && !inv.emitted_at ? new Date().toISOString() : inv.emitted_at,
      })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true, status, danfe_url: danfeUrl, xml_url: xmlUrl, focus: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
