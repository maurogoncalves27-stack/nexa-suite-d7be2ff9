// Reenvia NFC-e em contingência para a Focus NFe.
// Pode ser chamada manualmente ou por cron (pg_cron + pg_net).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronOrRole } from "../_shared/requireRole.ts";

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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Busca até 20 notas em contingência, mais antigas primeiro,
    // respeitando backoff exponencial: 1, 2, 4, 8, 16... minutos (cap 60).
    const { data: rows } = await sb
      .from("pdv_fiscal_invoices")
      .select("id,environment,focus_ref,request_payload,contingency_attempts,last_contingency_at")
      .eq("status", "contingency")
      .order("last_contingency_at", { ascending: true, nullsFirst: true })
      .limit(20);

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const results: any[] = [];

    for (const inv of rows) {
      const attempts = inv.contingency_attempts ?? 0;
      const backoffMin = Math.min(60, Math.pow(2, attempts));
      if (inv.last_contingency_at) {
        const ageMin = (now - new Date(inv.last_contingency_at).getTime()) / 60000;
        if (ageMin < backoffMin) {
          results.push({ id: inv.id, skipped: true, wait_min: backoffMin - ageMin });
          continue;
        }
      }

      const env = inv.environment;
      const token = env === "producao"
        ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
        : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
      if (!token || !inv.focus_ref || !inv.request_payload) {
        await sb.from("pdv_fiscal_invoices")
          .update({
            contingency_attempts: attempts + 1,
            last_contingency_at: new Date().toISOString(),
            contingency_reason: "config inválida (token/focus_ref/payload)",
          })
          .eq("id", inv.id);
        results.push({ id: inv.id, error: "config inválida" });
        continue;
      }

      let focusResp: Response | null = null;
      let focusText = "";
      let focusData: any = {};
      let networkErr: any = null;

      try {
        const ctrl = new AbortController();
        const tmo = setTimeout(() => ctrl.abort(), 15000);
        focusResp = await fetch(`${baseUrl(env)}/v2/nfce?ref=${inv.focus_ref}`, {
          method: "POST",
          headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
          body: JSON.stringify(inv.request_payload),
          signal: ctrl.signal,
        });
        clearTimeout(tmo);
        focusText = await focusResp.text();
        try { focusData = JSON.parse(focusText); } catch { focusData = { raw: focusText }; }
      } catch (e: any) {
        networkErr = e;
      }

      const stillDown = !!networkErr || (focusResp != null && focusResp.status >= 500);

      if (stillDown) {
        await sb.from("pdv_fiscal_invoices")
          .update({
            contingency_attempts: attempts + 1,
            last_contingency_at: new Date().toISOString(),
            contingency_reason: networkErr
              ? `Falha de rede: ${String(networkErr.message ?? networkErr)}`
              : `Focus NFe HTTP ${focusResp?.status}`,
          })
          .eq("id", inv.id);
        results.push({ id: inv.id, status: "contingency", attempts: attempts + 1 });
        continue;
      }

      const status =
        focusData.status === "autorizado" ? "authorized"
        : focusData.status === "processando_autorizacao" ? "processing"
        : focusData.status === "denegado" || focusData.status === "erro_autorizacao" ? "rejected"
        : focusResp?.ok ? "processing"
        : "error";

      await sb.from("pdv_fiscal_invoices")
        .update({
          status,
          response_payload: focusData,
          numero: focusData.numero ? Number(focusData.numero) : null,
          serie: focusData.serie ? Number(focusData.serie) : null,
          chave_acesso: focusData.chave_nfe ?? null,
          protocolo: focusData.protocolo ?? null,
          danfe_url: focusData.caminho_danfe ? `${baseUrl(env)}${focusData.caminho_danfe}` : null,
          xml_url: focusData.caminho_xml_nota_fiscal ? `${baseUrl(env)}${focusData.caminho_xml_nota_fiscal}` : null,
          rejection_code: focusData.codigo ?? focusData.codigo_erro ?? focusData.codigo_status?.toString() ?? null,
          rejection_reason: focusData.mensagem ?? focusData.mensagem_sefaz ?? focusData.erros?.[0]?.mensagem ?? null,
          emitted_at: status === "authorized" ? new Date().toISOString() : null,
          contingency_attempts: attempts + 1,
        })
        .eq("id", inv.id);

      results.push({ id: inv.id, status, attempts: attempts + 1 });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: rows.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("nfce-retry-contingency error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
