// Análise gerencial agregada do Relatório de Ocorrências:
// recebe agregações (top ocorrências, lojas, subcategorias, tendência) e devolve
// diagnóstico executivo com causas e sugestões de prevenção.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Aggregation {
  periodo_dias: number;
  total: number;
  filtros: { categoria?: string; loja?: string; subcategoria?: string };
  por_categoria: { name: string; count: number }[];
  por_loja: { name: string; count: number }[];
  por_subcategoria: { name: string; count: number }[];
  top_ocorrencias: { name: string; count: number }[];
  recorrencias: { occurrence: string; subcategory: string; store: string; count: number }[];
  tendencia: { date: string; count: number }[];
  mode?: "analysis" | "ranking";
  por_loja_split?: { name: string; ifood: number; interno: number }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "manager", "hr", "supervisor"], corsHeaders);
  if (!auth.ok) return auth.response!;

  try {
    const agg = (await req.json()) as Aggregation;
    if (!agg || typeof agg.total !== "number") {
      return new Response(JSON.stringify({ error: "Agregação inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");

    // Buscar faturamento por loja no período (monthly_revenue) para normalizar
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date();
    const start = new Date(now.getTime() - agg.periodo_dias * 24 * 60 * 60 * 1000);
    const months = new Set<string>();
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= now) {
      months.add(`${cur.getFullYear()}-${cur.getMonth() + 1}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    const revenueByStore: { name: string; revenue: number; occurrences: number; per_10k: number }[] = [];
    try {
      const { data: stores } = await supabase.from("stores").select("id,name").eq("is_virtual", false);
      const { data: rev } = await supabase
        .from("monthly_revenue")
        .select("store_id,year,month,gross_revenue")
        .gte("year", start.getFullYear())
        .lte("year", now.getFullYear());
      const totals = new Map<string, number>();
      (rev || []).forEach((r: any) => {
        if (!months.has(`${r.year}-${r.month}`)) return;
        totals.set(r.store_id, (totals.get(r.store_id) || 0) + Number(r.gross_revenue || 0));
      });
      (stores || []).forEach((s: any) => {
        const occ = agg.por_loja.find((l) => l.name === s.name)?.count || 0;
        const fat = totals.get(s.id) || 0;
        revenueByStore.push({
          name: s.name,
          revenue: Math.round(fat),
          occurrences: occ,
          per_10k: fat > 0 ? Number(((occ / fat) * 10000).toFixed(2)) : 0,
        });
      });
      revenueByStore.sort((a, b) => b.per_10k - a.per_10k);
    } catch (e) {
      console.warn("Falha ao buscar faturamento", e);
    }

    // Split iFood/entregador (LOGISTICA + Extravio pelo entregador) vs interno
    const isIfood = (cat?: string) => (cat || "").toUpperCase() === "LOGISTICA";
    const total_ifood_logistica = agg.por_categoria
      .filter((c) => isIfood(c.name))
      .reduce((s, c) => s + c.count, 0);
    const total_extravio = agg.por_subcategoria
      .filter((s) => (s.name || "").toLowerCase().includes("extravio pelo entregador"))
      .reduce((s, c) => s + c.count, 0);
    const total_ifood = total_ifood_logistica + total_extravio;
    const total_interno = Math.max(0, agg.total - total_ifood);
    const pct_ifood = agg.total > 0 ? Math.round((total_ifood / agg.total) * 100) : 0;

    const systemPrompt = `Você é um analista operacional sênior da rede de restaurantes Aquela Parme (delivery iFood, 4 lojas: ASA SUL, ASA NORTE, ÁGUAS CLARAS, LAGO SUL).
Sua função: ler agregações de ocorrências e devolver um diagnóstico executivo curto, direto e acionável.

REGRAS:
1. Tom direto, sem floreio. Para gerentes, não para clientes.
2. Use APENAS os números fornecidos — nunca invente dados, percentuais ou ocorrências que não estão nos arrays.
3. Seja específico: cite a loja, a ocorrência ou a subcategoria exata quando relevante.
4. Sugestões precisam ser práticas e implementáveis numa loja de delivery (treinamento, checklist, escala, processo, equipamento).
5. NÃO sugira soluções genéricas tipo "melhorar processos" — diga exatamente o quê.
6. Se o volume for muito baixo (total < 5), avise que a amostra é pequena e evite generalizar.
7. CRÍTICO: SEMPRE normalize ocorrências pelo faturamento da loja. A loja "crítica" NÃO é a que tem mais ocorrências em volume absoluto, e sim a com maior ÍNDICE (ocorrências por R$10.000 de faturamento — campo "per_10k"). Loja que vende muito tende a ter mais ocorrências em volume — isso é esperado. Cite no resumo o índice da loja crítica e compare com as demais.
8. CRÍTICO — IFOOD vs INTERNO (FOCO É NO QUE A GENTE RESOLVE): A categoria "LOGISTICA" + a subcategoria "Extravio pelo entregador" são problemas da operação de entrega do iFood — FORA do nosso controle direto. Regras de tratamento:
   - "impacto_ifood" é um RELATÓRIO CURTO: percentual, total absoluto, e 1-2 frases citando quais sub-problemas dominam (ex: "78% é atraso de entrega, 15% extravio") e quais lojas mais sofrem. NÃO escreva análise longa aqui — é só pra dimensionar o tamanho do problema externo.
   - "acoes_mitigacao" do iFood: NO MÁXIMO 2-3 ações realistas e curtas. Não é o foco do relatório.
   - O FOCO TOTAL da análise (resumo, causas_principais, padroes, sugestoes) é o que a operação INTERNA pode resolver. Quando for falar do panorama no "resumo", diga algo como "X% das ocorrências vêm da entrega iFood (fora do nosso controle); foco abaixo é nos Y% internos que conseguimos atacar".
   - "loja_critica": SEMPRE recalcule o índice usando APENAS ocorrências internas (total da loja − LOGISTICA da loja − Extravio pelo entregador) ÷ faturamento. Não puna a loja que sofre mais com entregador.
   - "causas_principais": IGNORE LOGISTICA. Só liste causas internas (COZINHA, MONTAGEM, PAGAMENTO, INFRAESTRUTURA, ATENDIMENTO, etc.). Se a maior categoria for LOGISTICA, pule ela e use a segunda/terceira maior.
   - "sugestoes": SOMENTE ações internas executáveis pela operação. NUNCA inclua "treinar entregador", "melhorar entrega", "falar com iFood" — isso fica em impacto_ifood.acoes_mitigacao.
9. SUBCATEGORIAS ESPECIAIS — trate de forma diferenciada quando aparecerem em "por_subcategoria":
   - "Cliente alega erro - conferido OK": NÃO é falha interna. É recusa/reclamação de cliente sem causa comprovada (loja conferiu e está OK). Mencione em "padroes" como sinal de comunicação/expectativa com cliente, e em "sugestoes" sugira melhorar foto/descrição do prato, conferência dupla com selo de saída, ou comunicação proativa. NUNCA conte como erro de cozinha.
   - "Extravio pelo entregador" (mesmo dentro de FALTOU ITENS NO PEDIDO): conte como impacto iFood — some no "impacto_ifood.total" e desconte do total interno na hora de avaliar a loja crítica. Não trate como erro de montagem.
   - "Reclamação genérica": cliente reclamou sem detalhar. Cite como ruído de dados que precisa de melhor coleta (treinar atendente a perguntar "o que exatamente?"), não como problema operacional específico.`;

    const userPrompt = `Período: últimos ${agg.periodo_dias} dias
Total de ocorrências no período (já filtradas): ${agg.total}
Filtros ativos: ${JSON.stringify(agg.filtros)}

SPLIT IFOOD vs INTERNO (já inclui "Extravio pelo entregador" no lado iFood):
- Causadas pelo iFood/entregador: ${total_ifood} (${pct_ifood}%) — LOGISTICA: ${total_ifood_logistica}, Extravio: ${total_extravio}
- Internas (nossa responsabilidade, FOCO DA ANÁLISE): ${total_interno} (${100 - pct_ifood}%)

POR CATEGORIA (causa-raiz): ${JSON.stringify(agg.por_categoria)}
POR LOJA (volume absoluto): ${JSON.stringify(agg.por_loja)}
FATURAMENTO E ÍNDICE POR LOJA no período (use ISTO para escolher a loja crítica): ${JSON.stringify(revenueByStore)}
POR SUBCATEGORIA: ${JSON.stringify(agg.por_subcategoria)}
TOP OCORRÊNCIAS: ${JSON.stringify(agg.top_ocorrencias)}
RECORRÊNCIAS (mesma ocorrência+subcategoria+loja repetida): ${JSON.stringify(agg.recorrencias)}
TENDÊNCIA DIÁRIA: ${JSON.stringify(agg.tendencia)}`;

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
              name: "diagnostico_executivo",
              description: "Diagnóstico estruturado das ocorrências do período",
              parameters: {
                type: "object",
                properties: {
                  resumo: {
                    type: "string",
                    description: "1-2 frases resumindo o panorama do período. Cite o número total e o que mais salta aos olhos.",
                  },
                  loja_critica: {
                    type: "object",
                    properties: {
                      nome: { type: "string", description: "Nome da loja com mais ocorrências (ou 'N/A' se distribuído)" },
                      total: { type: "number" },
                      observacao: { type: "string", description: "1 frase explicando por que ela está crítica" },
                    },
                    required: ["nome", "total", "observacao"],
                  },
                  causas_principais: {
                    type: "array",
                    description: "2-4 causas-raiz dominantes (use os nomes das categorias/subcategorias dos dados)",
                    items: {
                      type: "object",
                      properties: {
                        causa: { type: "string" },
                        ocorrencias: { type: "number" },
                        impacto: { type: "string", description: "1 frase: por que isso é um problema" },
                      },
                      required: ["causa", "ocorrencias", "impacto"],
                    },
                  },
                  padroes: {
                    type: "array",
                    description: "Padrões observados: recorrências, tendência de crescimento/queda, concentração por loja, etc. 2-4 itens curtos.",
                    items: { type: "string" },
                  },
                  sugestoes: {
                    type: "array",
                    description: "3-6 ações concretas INTERNAS (que a operação consegue resolver sem depender do iFood) para evitar reincidência, ordenadas por impacto",
                    items: {
                      type: "object",
                      properties: {
                        acao: { type: "string", description: "Verbo no imperativo, máximo 1 linha" },
                        responsavel: { type: "string", description: "Quem executa: Gerente de loja, Supervisor, RH, Cozinha, Atendimento, TI, etc." },
                        prazo: { type: "string", enum: ["imediato", "esta_semana", "este_mes"] },
                        detalhe: { type: "string", description: "1-2 frases de como fazer" },
                      },
                      required: ["acao", "responsavel", "prazo", "detalhe"],
                    },
                  },
                  impacto_ifood: {
                    type: "object",
                    description: "Quanto das ocorrências é causado pela operação de entrega do iFood (categoria LOGISTICA) e o que dá pra mitigar",
                    properties: {
                      percentual: { type: "number", description: "% do total de ocorrências causado por LOGISTICA/entregador" },
                      total: { type: "number", description: "Quantidade absoluta de ocorrências LOGISTICA" },
                      observacao: { type: "string", description: "1-2 frases: o que mais aparece (atraso, extravio, etc) e quais lojas mais sofrem" },
                      acoes_mitigacao: {
                        type: "array",
                        description: "2-4 ações realistas que a loja consegue fazer para reduzir impacto do iFood (ex: registrar print da rota, escalar gerência de praça, comunicar cliente proativamente). NUNCA inclua treinar entregador.",
                        items: { type: "string" },
                      },
                    },
                    required: ["percentual", "total", "observacao", "acoes_mitigacao"],
                  },
                },
                required: ["resumo", "loja_critica", "causas_principais", "padroes", "sugestoes", "impacto_ifood"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "diagnostico_executivo" } },
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
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-occurrences-report error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
