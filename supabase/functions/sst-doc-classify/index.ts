// Classifica PDF de documento de SST/ASO via Lovable AI e retorna metadados extraídos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM = `Você é um extrator de dados de documentos brasileiros de Saúde e Segurança do Trabalho (SST).
Analise o PDF e devolva APENAS um JSON no formato:
{
  "kind": "aso" | "pcmso" | "pgr" | "ltcat" | "ltip" | "psicossocial_nr1" | "relatorio_psicossocial" | "outros",
  "confidence": 0..1,
  "employee_name": string | null,
  "employee_cpf": string | null,
  "aso_result": "apto" | "inapto" | "apto_com_restricoes" | null,
  "aso_type": "admissional" | "periodico" | "demissional" | "mudanca_funcao" | "retorno_ao_trabalho" | null,
  "doctor_name": string | null,
  "doctor_crm": string | null,
  "cnpj": string | null,
  "company_name": string | null,
  "emitted_at": "YYYY-MM-DD" | null,
  "valid_from": "YYYY-MM-DD" | null,
  "valid_until": "YYYY-MM-DD" | null,
  "notes": string | null,
  "risks": [
    {
      "category": "organizacao_trabalho" | "relacoes_socioprofissionais" | "condicoes_ambiente" | "reconhecimento_crescimento" | "interface_trabalho_vida" | "outros",
      "description": string,
      "severity": "low" | "medium" | "high",
      "probability": "low" | "medium" | "high",
      "action_plan": string | null,
      "deadline": "YYYY-MM-DD" | null
    }
  ] | null
}
Regras:
- ASO = Atestado de Saúde Ocupacional (individual, com nome de colaborador).
- PCMSO/PGR/LTCAT/LTIP/Psicossocial NR-1 = programas/laudos da empresa (sem nome de colaborador).
- Se o documento for PGR / Psicossocial NR-1 / LTCAT / Relatório Psicossocial, extraia em "risks" TODOS os riscos psicossociais/ocupacionais identificados no texto, com a medida de controle sugerida (action_plan) e prazo quando houver. Não invente riscos que não estejam no documento.
- Para ASO, PCMSO ou "outros", "risks" deve ser null.
- Se não conseguir identificar o tipo, use "outros" e confidence baixa.
- Datas em formato ISO. Nunca invente valores; use null quando ausente.
- Não escreva nada fora do JSON.`;

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const body = await req.json();
    const mime = body.mime_type || "application/pdf";

    let file_base64: string | undefined = body.file_base64;

    if (!file_base64 && body.storage_path) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: blob, error: dlErr } = await admin.storage
        .from("sst-documents")
        .download(body.storage_path);
      if (dlErr || !blob) throw new Error(`download: ${dlErr?.message || "sem arquivo"}`);
      file_base64 = await toBase64(await blob.arrayBuffer());
    }

    if (!file_base64) throw new Error("file_base64 ou storage_path obrigatório");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os metadados deste documento SST/ASO e devolva o JSON." },
              {
                type: "file",
                file: {
                  filename: "doc.pdf",
                  file_data: `data:${mime};base64,${file_base64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("[sst-doc-classify] gateway", res.status, t);
      return new Response(JSON.stringify({ error: "gateway", status: res.status, details: t }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sst-doc-classify] erro", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
