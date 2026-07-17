// Classifica PDF de documento de SST/ASO via Gemini e retorna metadados extraídos.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const SYSTEM = `Você é um extrator de dados de documentos brasileiros de Saúde e Segurança do Trabalho (SST).
Analise o PDF e devolva APENAS um JSON no formato:
{
  "kind": "aso" | "pcmso" | "pgr" | "ltcat" | "ltip" | "psicossocial_nr1" | "relatorio_psicossocial" | "outros",
  "confidence": 0..1,
  "employee_name": string | null,   // preencher SOMENTE quando kind = "aso"
  "employee_cpf": string | null,    // idem, apenas dígitos
  "aso_result": "apto" | "inapto" | "apto_com_restricoes" | null,
  "aso_type": "admissional" | "periodico" | "demissional" | "mudanca_funcao" | "retorno_ao_trabalho" | null,
  "doctor_name": string | null,
  "doctor_crm": string | null,
  "cnpj": string | null,            // CNPJ da empresa emitente / contratante (formatado xx.xxx.xxx/xxxx-xx)
  "company_name": string | null,
  "emitted_at": "YYYY-MM-DD" | null,
  "valid_from": "YYYY-MM-DD" | null,
  "valid_until": "YYYY-MM-DD" | null,
  "notes": string | null
}
Regras:
- ASO = Atestado de Saúde Ocupacional (individual, com nome de colaborador).
- PCMSO/PGR/LTCAT/LTIP = programas/laudos da empresa (sem nome de colaborador).
- Se não conseguir identificar, use "outros" e confidence baixa.
- Datas em formato ISO. Nunca invente valores; use null quando ausente.
- Não escreva nada fora do JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    const { file_base64, mime_type } = await req.json();
    if (!file_base64) throw new Error("file_base64 obrigatório");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
                  file_data: `data:${mime_type || "application/pdf"};base64,${file_base64}`,
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
      // tenta extrair primeiro {...}
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
