// Triagem por IA para candidatos cadastrados manualmente (sem passar por /vagas).
// Usa o que existe no cadastro do candidato + descrição da vaga.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req, ["admin", "manager", "hr"], corsHeaders);
    if (!auth.ok) return auth.response!;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");


    const { candidate_id } = await req.json().catch(() => ({}));
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: "candidate_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: cand, error: cErr } = await admin.from("job_candidates")
      .select("*, job_openings(title, position, description, requirements, responsibilities, salary_min, salary_max)")
      .eq("id", candidate_id).maybeSingle();
    if (cErr || !cand) {
      return new Response(JSON.stringify({ error: "Candidato não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const job = (cand as any).job_openings;
    const candidateInfo = [
      `Nome: ${cand.full_name}`,
      cand.city ? `Cidade: ${cand.city}` : "",
      cand.expected_salary ? `Pretensão salarial: R$ ${cand.expected_salary}` : "",
      cand.availability ? `Disponibilidade: ${cand.availability}` : "",
      cand.has_experience != null ? `Tem experiência prévia: ${cand.has_experience ? "sim" : "não"}` : "",
      cand.source ? `Origem: ${cand.source}` : "",
      cand.notes ? `Observações: ${cand.notes}` : "",
    ].filter(Boolean).join("\n");

    const jobInfo = job ? [
      `Vaga: ${job.title} (${job.position})`,
      job.description ? `Descrição: ${job.description}` : "",
      job.requirements ? `Requisitos: ${job.requirements}` : "",
      job.responsibilities ? `Responsabilidades: ${job.responsibilities}` : "",
      job.salary_min || job.salary_max ? `Faixa salarial: R$ ${job.salary_min ?? "?"} - R$ ${job.salary_max ?? "?"}` : "",
    ].filter(Boolean).join("\n") : "(vaga sem detalhes)";

    const prompt = `Você é um especialista em recrutamento de food service. Avalie o fit do candidato com a vaga.

DADOS DO CANDIDATO:
${candidateInfo}

VAGA:
${jobInfo}

Retorne UM ÚNICO JSON com este formato (sem markdown, sem explicação extra):
{
  "score": 0-100 (alinhamento geral),
  "recommendation": "forte_recomendado" | "recomendado" | "neutro" | "nao_recomendado",
  "summary": "2-3 frases sobre os pontos fortes e o fit com a vaga",
  "concerns": "principais alertas ou pontos a investigar na entrevista (1-2 frases)"
}

Considere: experiência, alinhamento de pretensão com a faixa, disponibilidade, distância e qualquer alerta nas observações. Se faltarem dados, dê score moderado e mencione os pontos a confirmar em concerns.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway", aiResp.status, t);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de uso atingido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Falha ao chamar IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
    const recommendation = ["forte_recomendado", "recomendado", "neutro", "nao_recomendado"].includes(parsed.recommendation) ? parsed.recommendation : "neutro";
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : null;
    const concerns = typeof parsed.concerns === "string" ? parsed.concerns.slice(0, 1000) : null;

    const { error: upErr } = await admin.from("job_candidates").update({
      ai_score: score,
      ai_recommendation: recommendation,
      ai_summary: summary,
      ai_concerns: concerns,
      ai_screened_at: new Date().toISOString(),
    }).eq("id", candidate_id);

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, score, recommendation, summary, concerns }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("screen-candidate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
