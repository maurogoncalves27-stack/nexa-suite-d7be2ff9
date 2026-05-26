// Busca semântica de ocorrências usando Lovable AI Gateway
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OccurrenceLite {
  id: string;
  category: string | null;
  occurrence: string;
  order_correct: boolean;
  action: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, occurrences } = (await req.json()) as {
      query?: string;
      occurrences?: OccurrenceLite[];
    };

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(occurrences) || occurrences.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Reduz o payload (id + texto curto)
    const list = occurrences.slice(0, 200).map((o) => ({
      id: o.id,
      category: o.category ?? "",
      correct: o.order_correct,
      occurrence: o.occurrence,
      action: (o.action ?? "").slice(0, 200),
    }));

    const systemPrompt = `Você é um assistente de atendimento de uma rede de restaurantes (delivery iFood).
Sua tarefa: dado o RELATO do atendente, identifique entre as ocorrências cadastradas as 1 a 3 que MAIS se aproximam do caso descrito.
- Use sinônimos, gírias e linguagem do dia a dia ("sumiu", "chegou frio", "veio errado", "pediu desconto").
- Considere se o pedido foi entregue/produzido CORRETAMENTE quando o relato deixar claro.
- Devolva os ids exatamente como recebidos. Não invente ids.
- Ordene do mais provável para o menos provável.
- Se nada se encaixar, devolva uma lista vazia.`;

    const userPrompt = `RELATO DO ATENDENTE:\n"""${query.trim()}"""\n\nOCORRÊNCIAS CADASTRADAS (JSON):\n${JSON.stringify(list)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_matches",
              description: "Retorna as ocorrências mais relevantes para o relato.",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "id exato da ocorrência" },
                        confidence: {
                          type: "string",
                          enum: ["alta", "media", "baixa"],
                        },
                        reason: { type: "string", description: "Justificativa curta (1 frase)" },
                      },
                      required: ["id", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string", description: "Resumo de 1 frase do diagnóstico" },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso de IA atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Créditos de IA insuficientes. Adicione créditos em Configurações > Workspace > Uso.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { matches: { id: string; confidence: string; reason?: string }[]; summary?: string } = {
      matches: [],
    };
    if (tc?.function?.arguments) {
      try {
        parsed = JSON.parse(tc.function.arguments);
      } catch (e) {
        console.error("Falha ao parsear tool_calls", e);
      }
    }

    // Mantém apenas ids válidos
    const validIds = new Set(occurrences.map((o) => o.id));
    parsed.matches = (parsed.matches ?? []).filter((m) => validIds.has(m.id));

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-occurrence-search error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
