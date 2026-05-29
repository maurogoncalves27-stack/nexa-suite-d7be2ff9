import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  fileBase64: string;
  mimeType: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;




    const { fileBase64, mimeType }: AnalyzeRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";
    if (!isImage && !isPdf) {
      return new Response(
        JSON.stringify({ error: "Formato não suportado. Use imagem ou PDF." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um assistente que analisa atestados médicos brasileiros e extrai informações estruturadas.
Você conhece a tabela CID-10 (Classificação Internacional de Doenças). Sempre que identificar um código CID, retorne também a descrição curta correspondente em português.
Se algum campo não estiver legível, retorne null.`;

    const userText = `Analise este atestado médico e extraia:
- cid_code: código CID (ex: J00, M54.5, F32.1)
- cid_description: descrição da doença em português (ex: "Resfriado comum")
- days_off: quantidade de dias de afastamento (número inteiro)
- certificate_date: data de emissão do atestado (YYYY-MM-DD)
- leave_start_date: data de início do afastamento (YYYY-MM-DD), se houver
- doctor_name: nome do médico
- doctor_crm: CRM do médico (apenas o número e UF, ex: "12345/SP")
Responda em JSON.`;

    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_medical_certificate",
              description: "Extrai dados estruturados do atestado",
              parameters: {
                type: "object",
                properties: {
                  cid_code: { type: ["string", "null"] },
                  cid_description: { type: ["string", "null"] },
                  days_off: { type: ["integer", "null"] },
                  certificate_date: { type: ["string", "null"] },
                  leave_start_date: { type: ["string", "null"] },
                  doctor_name: { type: ["string", "null"] },
                  doctor_crm: { type: ["string", "null"] },
                },
                required: ["cid_code", "cid_description", "days_off", "certificate_date"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_medical_certificate" } },
      }),
    });

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições atingido. Tente em alguns minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos esgotados. Adicione créditos no workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erro AI Gateway: ${response.status} ${text}`);
    }

    const aiResp = await response.json();
    const toolCall = aiResp.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair informações do atestado." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const data = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-medical-certificate error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
