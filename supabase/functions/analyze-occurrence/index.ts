// Análise profunda de ocorrência: identifica, diagnostica, gera mensagem personalizada e plano de ação.
// Usa o catálogo completo + linguagem da empresa como contexto.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { relato, contexto_extra } = (await req.json()) as {
      relato?: string;
      contexto_extra?: string;
    };

    if (!relato || typeof relato !== "string" || relato.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Descreva o que aconteceu (mínimo 3 caracteres)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env não configurado");

    // 1) Buscar catálogo completo
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: catalog, error: catErr } = await sb
      .from("occurrences")
      .select("id, code, category, occurrence, order_correct, action, message, prevention_1, prevention_2")
      .eq("is_active", true);
    if (catErr) throw catErr;

    const compactCatalog = (catalog ?? []).map((o) => ({
      id: o.id,
      code: o.code,
      cat: o.category,
      ok: o.order_correct,
      titulo: o.occurrence,
      acao: (o.action ?? "").slice(0, 250),
      msg: (o.message ?? "").slice(0, 350),
      prev: [o.prevention_1, o.prevention_2].filter(Boolean).join(" | ").slice(0, 200),
    }));

    const systemPrompt = `Você é um classificador de ocorrências da rede de restaurantes Aquela Parme (Aquela Parme/Yollo, delivery iFood).
Seu ÚNICO trabalho: ouvir o relato e **identificar qual ocorrência do catálogo** se aplica. Você NÃO inventa solução, NÃO melhora a resposta, NÃO sugere ações fora do que está no catálogo.

REGRAS DE OURO (siga à risca):
1. Escolha **EXATAMENTE UMA** ocorrência do catálogo. NUNCA liste alternativas.
2. Se houver dúvida real, NÃO chute: defina precisa_mais_info=true e faça **1 pergunta curta e objetiva** que resolva a dúvida.
3. Use **EXATAMENTE** os campos do catálogo:
   - "mensagem_cliente" = copie literal o campo "msg" da ocorrência escolhida (sem reescrever, sem adaptar, sem floreio).
   - "plano_acao" = quebre o campo "acao" da ocorrência em 1-3 passos curtos, SEM adicionar passos novos.
4. "diagnostico" = 1 frase neutra explicando qual ocorrência foi identificada e por quê (sem propor solução).
5. "causa_raiz" = 1 frase, só se óbvia pelo relato. Caso contrário, deixe vazio.
6. Tom: direto, sem jargão. O atendente está com cliente esperando.

QUANDO **NÃO** EXISTE MENSAGEM PARA O CLIENTE (caso_interno=true, mensagem_cliente=""):
- Se o campo "msg" da ocorrência estiver vazio → caso_interno=true, mensagem_cliente="".
- Problemas internos/operacionais (falta de energia, equipamento, briga, sistema, manutenção, etc.) NÃO geram mensagem ao cliente.

NÚMERO DO PEDIDO:
- Se a ocorrência envolver um pedido específico, defina pedido_necessario=true.
- Casos internos sem pedido → pedido_necessario=false.`;

    const userPrompt = `RELATO DO ATENDENTE:
"""
${relato.trim()}
${contexto_extra ? `\nContexto extra: ${contexto_extra}` : ""}
"""

CATÁLOGO DE OCORRÊNCIAS (JSON, use os ids exatos):
${JSON.stringify(compactCatalog)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analisar_ocorrencia",
              description: "Análise estruturada da ocorrência",
              parameters: {
                type: "object",
                properties: {
                  precisa_mais_info: {
                    type: "boolean",
                    description: "true se faltar info crítica e for necessário perguntar antes de decidir",
                  },
                  perguntas: {
                    type: "array",
                    items: { type: "string" },
                    description: "1 a 2 perguntas curtas pro atendente, só se precisa_mais_info=true",
                  },
                  ocorrencia_principal: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
                      por_que: { type: "string", description: "1 frase: por que esta ocorrência" },
                    },
                    required: ["id", "confianca", "por_que"],
                  },
                  alternativas: {
                    type: "array",
                    description: "DEIXE SEMPRE VAZIO []. Não listar alternativas — em caso de dúvida, use precisa_mais_info=true e perguntas.",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        por_que: { type: "string" },
                      },
                      required: ["id", "por_que"],
                    },
                    maxItems: 0,
                  },
                  diagnostico: {
                    type: "string",
                    description: "1-2 frases explicando o que aconteceu na visão da empresa",
                  },
                  causa_raiz: {
                    type: "string",
                    description: "1 frase com a causa provável (pra prevenção)",
                  },
                  caso_interno: {
                    type: "boolean",
                    description: "true se for problema interno/operacional sem mensagem ao cliente (falta de energia, equipamento, briga, etc.)",
                  },
                  pedido_necessario: {
                    type: "boolean",
                    description: "true se a ocorrência envolve um pedido específico (atraso, item faltando/errado, qualidade, cancelamento, entrega, etc.)",
                  },
                  mensagem_cliente: {
                    type: "string",
                    description: "Mensagem PRONTA pra cliente. DEIXE VAZIO ('') quando caso_interno=true.",
                  },
                  plano_acao: {
                    type: "array",
                    items: { type: "string" },
                    description: "2 a 5 passos numerados, ação imediata pro atendente",
                  },
                  alertar_gestor: {
                    type: "boolean",
                    description: "true se for caso grave/recorrente que justifica notificar gestor com urgência",
                  },
                },
                required: [
                  "precisa_mais_info",
                  "ocorrencia_principal",
                  "diagnostico",
                  "causa_raiz",
                  "caso_interno",
                  "pedido_necessario",
                  "mensagem_cliente",
                  "plano_acao",
                  "alertar_gestor",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analisar_ocorrencia" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de IA atingido. Tente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
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
    let analysis: Record<string, unknown> = {};
    if (tc?.function?.arguments) {
      try { analysis = JSON.parse(tc.function.arguments); }
      catch (e) { console.error("Falha ao parsear", e); }
    }

    // Anexa dados do catálogo aos ids retornados (pra UI exibir título/categoria)
    const byId = new Map((catalog ?? []).map((o) => [o.id, o]));
    const principalRaw = analysis.ocorrencia_principal as { id: string; confianca: string; por_que: string } | undefined;
    const alternativasRaw = (analysis.alternativas ?? []) as { id: string; por_que: string }[];

    const enrich = (id: string) => {
      const o = byId.get(id);
      if (!o) return null;
      return {
        id: o.id,
        code: o.code,
        category: o.category,
        occurrence: o.occurrence,
        order_correct: o.order_correct,
      };
    };

    const ocorrencia_principal = principalRaw && byId.has(principalRaw.id)
      ? { ...principalRaw, ...enrich(principalRaw.id) }
      : null;

    const alternativas = alternativasRaw
      .filter((a) => byId.has(a.id) && a.id !== principalRaw?.id)
      .slice(0, 2)
      .map((a) => ({ ...a, ...enrich(a.id) }));

    // Dica de prevenção vem direto do catálogo (prevention_1 / prevention_2)
    const principalCatalog = principalRaw ? byId.get(principalRaw.id) : null;
    const prevencao = principalCatalog
      ? [principalCatalog.prevention_1, principalCatalog.prevention_2].filter(Boolean) as string[]
      : [];

    // Categoria operacional NUNCA tem mensagem ao cliente — força caso_interno
    const principalCategory = (principalCatalog?.category ?? "").toString().toLowerCase();
    const isOperacional = /opera|interno|cozinha|equipamento|sistema|manuten/.test(principalCategory);
    const casoInterno = !!analysis.caso_interno || isOperacional;

    return new Response(
      JSON.stringify({
        precisa_mais_info: !!analysis.precisa_mais_info,
        perguntas: (analysis.perguntas as string[]) ?? [],
        ocorrencia_principal,
        alternativas: [],
        diagnostico: analysis.diagnostico ?? "",
        causa_raiz: analysis.causa_raiz ?? "",
        caso_interno: casoInterno,
        pedido_necessario: !!analysis.pedido_necessario && !isOperacional,
        mensagem_cliente: casoInterno ? "" : (analysis.mensagem_cliente ?? ""),
        plano_acao: (analysis.plano_acao as string[]) ?? [],
        prevencao,
        alertar_gestor: !!analysis.alertar_gestor,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-occurrence error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
