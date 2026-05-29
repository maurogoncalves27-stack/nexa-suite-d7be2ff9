// dfe-action: ações sobre uma nota DF-e recebida
//   action: "refuse" (recusar — Operação não realizada 210240)
//         | "unknown" (desconhecer — Desconhecimento 210220)
//         | "ciencia" (dar ciência — 210210)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const baseUrl = (env: string) =>
  env === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
const basicAuth = (t: string) => "Basic " + btoa(t + ":");

const TIPO: Record<string, string> = {
  ciencia: "ciencia_operacao",
  refuse: "operacao_nao_realizada",
  unknown: "desconhecimento_operacao",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "manager"], corsHeaders);
  if (!auth.ok) return auth.response!;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );


  try {
    const { note_id, action, justificativa } = await req.json();
    if (!note_id || !TIPO[action]) throw new Error("note_id e action válidos são obrigatórios");

    const { data: note, error } = await sb
      .from("dfe_inbound_notes")
      .select("*, dfe_companies(*)")
      .eq("id", note_id)
      .single();
    if (error || !note) throw new Error("nota não encontrada");

    const company = note.dfe_companies;
    if (!company) throw new Error("nota sem CNPJ monitorado associado");

    const env = company.environment === "producao" ? "producao" : "homolog";
    const token = env === "producao"
      ? Deno.env.get("FOCUS_NFE_TOKEN_PROD")
      : Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOG");
    if (!token) throw new Error("token Focus não configurado");

    const body: Record<string, unknown> = {
      cnpj: company.cnpj,
      chave: note.chave_acesso,
      tipo_evento: TIPO[action],
    };
    if (action !== "ciencia") {
      const motivo = String(justificativa ?? "").trim();
      if (motivo.length < 15 || motivo.length > 255) {
        throw new Error("Justificativa deve ter entre 15 e 255 caracteres");
      }
      body.justificativa = motivo;
    }

    const r = await fetch(`${baseUrl(env)}/v2/nfes_recebidas/manifesto`, {
      method: "POST",
      headers: { Authorization: basicAuth(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    const ok = r.status >= 200 && r.status < 300;
    if (!ok) throw new Error(data?.mensagem ?? data?.erros?.[0]?.mensagem ?? `HTTP ${r.status}`);

    const patch: Record<string, unknown> = { raw_payload: { ...(note.raw_payload ?? {}), manifesto: data } };
    if (action === "ciencia") patch.ciencia_at = new Date().toISOString();
    if (action === "refuse") { patch.status = "refused"; patch.refused_reason = justificativa; }
    if (action === "unknown") { patch.status = "unknown"; patch.refused_reason = justificativa; }
    await sb.from("dfe_inbound_notes").update(patch).eq("id", note_id);

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
