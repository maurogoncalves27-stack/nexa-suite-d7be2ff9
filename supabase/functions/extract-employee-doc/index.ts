// Edge function: extrai dados estruturados de documentos (RG, CPF, CNH, comprovante de residência)
// usando Lovable AI Gateway (Gemini 2.5 Flash com visão).
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { requireRole } from "../_shared/requireRole.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");


interface ExtractRequest {
  // base64 sem prefixo data:
  files: Array<{
    name: string;
    mime_type: string;
    data: string;
    doc_type?: string;
  }>;
}

const SYSTEM_PROMPT = `Você é um especialista em extrair dados de documentos brasileiros (RG, CPF, CNH, comprovante de residência, carteira de trabalho, título de eleitor, certidão).
Analise as imagens fornecidas e extraia todos os campos identificáveis.
Regras:
- Datas no formato YYYY-MM-DD.
- CPF apenas dígitos com pontuação: 000.000.000-00.
- RG conforme aparece no documento.
- UF como sigla de 2 letras.
- Se um campo não estiver legível ou não existir, omita-o (não invente).
- Para "marital_status" use: single, married, divorced, widowed, stable_union.
- Para "gender" use: male ou female.
- Para "ethnicity" use: branca, preta, parda, amarela, indigena.
- Para "education_level" use: fundamental_incompleto, fundamental_completo, medio_incompleto, medio_completo, superior_incompleto, superior_completo, pos_graduacao.
- Combine informações de múltiplos documentos quando enviados juntos.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "preencher_ficha_colaborador",
    description: "Retorna os campos extraídos dos documentos para preencher a ficha de colaborador.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Nome completo" },
        social_name: { type: "string" },
        cpf: { type: "string" },
        rg: { type: "string" },
        birth_date: { type: "string", description: "YYYY-MM-DD" },
        gender: { type: "string", enum: ["male", "female"] },
        ethnicity: { type: "string" },
        nationality: { type: "string" },
        marital_status: { type: "string" },
        spouse_name: { type: "string" },
        father_name: { type: "string" },
        mother_name: { type: "string" },
        birth_state: { type: "string" },
        education_level: { type: "string" },
        nis_number: { type: "string", description: "PIS/PASEP/NIS" },
        voter_id: { type: "string" },
        voter_zone: { type: "string" },
        voter_section: { type: "string" },
        reservist_number: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        address: { type: "string", description: "Logradouro, número e complemento" },
        zip_code: { type: "string", description: "CEP" },
        city: { type: "string" },
        state: { type: "string", description: "UF (2 letras)" },
      },
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ExtractRequest;
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return new Response(JSON.stringify({ error: "Envie ao menos um arquivo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.files.length > 6) {
      return new Response(JSON.stringify({ error: "Máximo 6 arquivos por extração" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apenas imagens são processáveis pela visão. PDFs precisariam de OCR prévio.
    const userContent: any[] = [
      {
        type: "text",
        text: `Analise os documentos a seguir e extraia os dados do colaborador. Tipos informados: ${body.files
          .map((f) => f.doc_type ?? "desconhecido")
          .join(", ")}.`,
      },
    ];

    for (const f of body.files) {
      const isImage = f.mime_type.startsWith("image/");
      const isPdf = f.mime_type === "application/pdf";
      if (!isImage && !isPdf) {
        return new Response(
          JSON.stringify({
            error: `Arquivo "${f.name}" não é imagem nem PDF. Envie JPG/PNG/PDF.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${f.mime_type};base64,${f.data}` },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "preencher_ficha_colaborador" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos do Lovable AI esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha na extração", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "IA não retornou dados estruturados", raw: aiJson }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Falha ao interpretar resposta da IA" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Remove valores vazios/null
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extracted)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        cleaned[k] = v;
      }
    }

    return new Response(JSON.stringify({ data: cleaned }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-employee-doc error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
