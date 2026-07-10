import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface MonthRow {
  mes: string;
  parcial?: boolean;
  dia_atual?: number | null;
  dias_no_mes?: number | null;
  projecao_mes_inteiro?: {
    receita_liquida: number;
    lucro_bruto: number;
    ebitda: number;
    resultado_liquido: number;
  } | null;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  cmv: number;
  lucro_bruto: number;
  pessoal: number;
  admin: number;
  marketing: number;
  outras: number;
  financeiras: number;
  impostos: number;
  nao_operacional: number;
  ebitda: number;
  resultado_liquido: number;
}

const buildTable = (rows: MonthRow[]): string => {
  const header = "| Mês | Rec. Líq | CMV | Lucro Bruto | Pessoal | Admin | Marketing | Financ. | Impostos | EBITDA | Res. Líq |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|";
  // Só meses FECHADOS entram na tabela — mês em andamento vai só na nota de projeção.
  const body = rows.filter((r) => !r.parcial).map((r) => {
    return `| ${r.mes} | ${fmtBRL(r.receita_liquida)} | ${fmtBRL(r.cmv)} | ${fmtBRL(r.lucro_bruto)} | ${fmtBRL(r.pessoal)} | ${fmtBRL(r.admin)} | ${fmtBRL(r.marketing)} | ${fmtBRL(r.financeiras)} | ${fmtBRL(r.impostos)} | ${fmtBRL(r.ebitda)} | ${fmtBRL(r.resultado_liquido)} |`;
  }).join("\n");
  return `${header}\n${sep}\n${body}`;
};

const buildProjection = (rows: MonthRow[]): string => {
  const partial = rows.find((r) => r.parcial && r.projecao_mes_inteiro);
  if (!partial || !partial.projecao_mes_inteiro) return "";
  const p = partial.projecao_mes_inteiro;
  return `\n\n⚠️ **REGRA CRÍTICA — LEIA ANTES DE ANALISAR:** O mês **${partial.mes}** está EM ANDAMENTO (hoje é dia ${partial.dia_atual} de ${partial.dias_no_mes} do mês). Por isso ele foi PROPOSITALMENTE EXCLUÍDO da tabela acima — os valores realizados são parciais e comparar com meses fechados daria falsa impressão de queda/colapso. É **PROIBIDO** afirmar que houve queda, colapso, retração ou ruptura em ${partial.mes}, e é PROIBIDO usar esse mês como fim de tendência. Se precisar mencionar ${partial.mes}, use APENAS a projeção linear para o mês inteiro (rateio pelos dias decorridos): Rec. líq ${fmtBRL(p.receita_liquida)} · Lucro bruto ${fmtBRL(p.lucro_bruto)} · EBITDA ${fmtBRL(p.ebitda)} · Resultado líquido ${fmtBRL(p.resultado_liquido)} — e sempre deixe explícito que é projeção.`;
};


const SYSTEM_SINTETICA = `Você é um controller/CFO analisando a DRE de uma rede de restaurantes brasileira (Aquela Parmê). Responda em PORTUGUÊS BR, tom executivo e direto, MÁXIMO 8 bullets. Nada de introduções ou fechamentos genéricos. Foque em: (1) tendência de receita líquida, (2) margem bruta e evolução do CMV, (3) principais linhas de despesa e alterações relevantes, (4) resultado líquido — sinalizando meses de prejuízo, (5) 2-3 sugestões acionáveis. Use valores em BRL onde apoiar a conclusão. Formato markdown. REGRA INEGOCIÁVEL: se o usuário informar um mês em andamento (parcial), NUNCA trate esse mês como queda/colapso/retração e NUNCA use ele como final de tendência — os dados são parciais por natureza. Só cite o mês parcial via projeção linear, deixando explícito que é projeção.`;

const SYSTEM_ANALITICA = `Você é um controller/CFO sênior fazendo análise APROFUNDADA da DRE de uma rede de restaurantes brasileira (Aquela Parmê). Responda em PORTUGUÊS BR usando MARKDOWN com seções. Estrutura obrigatória:
## Panorama do período
Resumo de 2-3 linhas.
## Receita
Evolução mês a mês, sazonalidade, meses fora da curva.
## Margem bruta e CMV
Percentuais, tendência, alertas.
## Despesas operacionais
Analise cada bloco (pessoal, admin, marketing, outras) em % da receita líquida e variação. Identifique anomalias.
## Despesas financeiras e impostos
Comente carga tributária efetiva e custo financeiro.
## EBITDA e resultado líquido
Evolução, meses de prejuízo, drivers do resultado.
## Recomendações acionáveis
Lista numerada de 4-6 ações concretas, com números que embasem cada ação.
Não invente dados fora dos fornecidos. Use fmt "R$ X" para valores. REGRA INEGOCIÁVEL: se o usuário informar um mês em andamento (parcial), NUNCA trate esse mês como queda/colapso/retração e NUNCA use ele como fim de tendência — os dados são parciais por natureza. Só cite o mês parcial via projeção linear, deixando explícito que é projeção.`;

const SYSTEM_VALUATION = `Você é um analista de M&A/valuation avaliando a Aquela Parmê (rede de restaurantes brasileira, gestão via sistema próprio NEXA Suite). Calcule o valuation com base na DRE fornecida (últimos 12 meses fechados) e nas premissas de patrimônio/expansão/eficiência. Responda em PORTUGUÊS BR usando MARKDOWN nesta estrutura:
## Resumo executivo
Valor central em R$ e faixa (mínimo–máximo), em 2-3 linhas.
## Base operacional (LTM)
Receita líquida LTM, EBITDA LTM, margem EBITDA, resultado líquido LTM — tudo dos últimos 12 meses FECHADOS fornecidos.
## Metodologias
Aplique e mostre número para cada uma:
- **EV/EBITDA** (múltiplo 4x-6x para foodservice BR).
- **EV/Revenue** (0,5x-0,8x).
- **DCF simplificado** (5 anos, g=4%, WACC=15%, valor terminal Gordon).
Explique cada cálculo em 1-2 linhas e traga o número.
## Ajustes patrimoniais e caixa
Some patrimônio das lojas ativas, fábrica, escritório, caixa disponível.
## Upside — Nova loja Asa Norte
A nova loja deve faturar ~70% da Asa Norte atual, com CAPEX bancado pelo iFood (custo zero para a empresa). Estime valor incremental.
## Upside — Sistema NEXA próprio
Economia estrutural de ~R$ ${"{"}nexa_saving${"}"}/mês em aluguéis de totens e headcount (capitalize por 6x-8x EBITDA anual gerado).
## Equity Value final
Faixa consolidada (mínimo, central, máximo) em R$ milhões, com breakdown do que compõe cada faixa.
## Ressalvas
3-5 pontos sobre premissas, riscos e limites do cálculo.
Use dados EXCLUSIVAMENTE do payload. Nunca use o mês parcial como base — sempre LTM de meses FECHADOS. Seja numérico e direto.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const mode = body.mode === "analitica" ? "analitica" : "sintetica";
    const rows: MonthRow[] = Array.isArray(body.months) ? body.months : [];
    const totals = body.totals_excluding_partial ?? body.totals ?? {};
    const period = body.period ?? "período informado";

    if (rows.length === 0) {
      return new Response(JSON.stringify({ analysis: "Sem dados no período." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const table = buildTable(rows);
    const projectionNote = buildProjection(rows);
    const totaisMd = `**Totais do período (${period}, EXCLUINDO mês parcial):** Rec. líq ${fmtBRL(totals.receita_liquida ?? 0)} · CMV ${fmtBRL(totals.cmv ?? 0)} · Lucro bruto ${fmtBRL(totals.lucro_bruto ?? 0)} · EBITDA ${fmtBRL(totals.ebitda ?? 0)} · Resultado líquido ${fmtBRL(totals.resultado_liquido ?? 0)}.`;

    const userMsg = `${projectionNote ? projectionNote.trim() + "\n\n" : ""}${totaisMd}\n\nDRE mês a mês FECHADOS (${period}) — a tabela abaixo já EXCLUI o mês em andamento:\n\n${table}`;


    const system = mode === "analitica" ? SYSTEM_ANALITICA : SYSTEM_SINTETICA;

    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gateway error", resp.status, errText);
      let msg = errText;
      if (resp.status === 402) msg = "Créditos de IA esgotados. Adicione créditos nas configurações da workspace.";
      if (resp.status === 429) msg = "Muitas requisições. Aguarde alguns segundos e tente de novo.";
      return new Response(JSON.stringify({ error: msg, status: resp.status }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const analysis = data?.choices?.[0]?.message?.content ?? "Sem resposta do modelo.";
    return new Response(JSON.stringify({ analysis, mode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("dre-ai-analysis error", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
