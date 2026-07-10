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

const SYSTEM_VALUATION = `Você é um analista de M&A/valuation avaliando a Aquela Parmê (rede de restaurantes brasileira). Produza um RELATÓRIO FORMAL DE VALUATION em PORTUGUÊS BR, usando MARKDOWN com TABELAS GFM (com | e ---). Siga EXATAMENTE esta estrutura e formato — sem introduções extras, sem seções fora da lista:

# Valuation Aquela Parmê
_Análise pontual — data de hoje_

## Sumário executivo
Parágrafo curto (2-3 linhas) explicando a estimativa de Equity Value considerando resultado LTM, ativos tangíveis informados, expansão da nova Asa Norte (CAPEX iFood) e potencial de franquias/licenciamento das marcas. Depois, tabela:

| Cenário | Equity Value |
|---|---|
| Piso (conservador — só operação + ativos) | R$ X milhões |
| Central (com Asa Norte + franquias moderadas) | R$ Y milhões |
| Teto (upside integral + expansão agressiva) | R$ Z milhões |

## 1. Base operacional (LTM)
Tabela com Receita líquida LTM, EBITDA LTM, Margem EBITDA, Múltiplo EV/EBITDA aplicado (4x-6x), Valor operacional (midpoint DCF + múltiplos). Depois 2 linhas explicando: DCF (WACC 15-18%, g 4-10%, terminal Gordon) + EV/EBITDA 4x-6x + EV/Revenue 0,5x-0,8x, informando que o mês parcial foi excluído.

## 2. Ativos tangíveis e caixa
Tabela somando: 4 lojas × R$ 70 mil, Fábrica R$ 70 mil, Escritório R$ 10 mil, Caixa R$ 50 mil, Subtotal. Nota curta: sem dívida declarada, entra 1:1 no Equity Value; se houver dívida subtrair.

## 3. Nova loja Asa Norte (CAPEX bancado pelo iFood)
Parágrafo curto explicando que a nova unidade opera a 70% da Asa Norte atual, CAPEX zero pelo iFood. Depois tabela:

| Parâmetro | Valor |
|---|---|
| Receita anual esperada (70% da Asa Norte atual) | R$ ... |
| EBITDA incremental (margem atual) | R$ ... |
| Múltiplo aplicado | 5,0x |
| Valor bruto | R$ ... |
| Ajuste por rampa (2 meses obra) | -R$ 50.000 |
| Valor líquido incremental | R$ ... |

## 4. Upside — Expansão por franquias / licenciamento
Parágrafo curto: marcas Aquela Parmê, Estrogonofe e Box Caipira podem escalar via franquias/licenciamento. Depois tabela:

| Parâmetro | Valor |
|---|---|
| Taxa inicial por unidade | R$ 40k–80k |
| Royalties recorrentes | 5%–8% |
| Fundo de marketing | 2% |
| Unidades em 3-5 anos por marca | 5–15 |
| EBITDA anual de royalties líquido (estimado) | R$ ... |
| Múltiplo aplicado (5x-7x) | ...x |
| Valor incremental capitalizado | R$ ... |

## 5. Consolidado — Equity Value
Tabela final:

| Componente | Valor |
|---|---|
| Operação atual (múltiplos + DCF, midpoint) | R$ ... |
| Ativos tangíveis + caixa | R$ ... |
| Nova loja Asa Norte (70%, CAPEX zero) | R$ ... |
| Franquias / licenciamento | R$ ... |
| **Equity Value central** | **R$ ...** |

## 6. Faixa recomendada para negociação
| Cenário | Faixa |
|---|---|
| Piso | R$ X milhões |
| Central | R$ Y milhões |
| Teto | R$ Z milhões |

## 7. Ressalvas e riscos
Lista com bullets (•):
• Dívida não informada — assumimos zero.
• Conversão EBITDA→lucro líquido (comentar).
• Mês em andamento foi excluído.
• Sazonalidade e meses faltantes.
• Nova loja pode superar 70% (upside adicional).
• **NEXA Suite NÃO é ativo da empresa** — pertence ao sócio Mauro (PF), cedido em uso gratuito. Não entra no equity value; apenas fator qualitativo de eficiência já refletido na margem atual.

Rodapé:
_Relatório gerado automaticamente pelo NEXA Suite. Documento de trabalho para negociação — não substitui laudo formal assinado._

REGRAS INEGOCIÁVEIS:
- Use dados EXCLUSIVAMENTE do payload (DRE fornecida). Nunca use mês parcial como base — sempre LTM de meses FECHADOS.
- NÃO capitalize o NEXA como ativo — é pessoal do sócio Mauro.
- Seja numérico e direto, use formato brasileiro (R$ 1.234.567 ou R$ 1,23 milhões).
- Todas as tabelas em Markdown GFM (com | e cabeçalho + separador ---).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const rawMode = body.mode;
    const mode: "sintetica" | "analitica" | "valuation" =
      rawMode === "analitica" ? "analitica"
      : rawMode === "valuation" ? "valuation"
      : "sintetica";
    const rows: MonthRow[] = Array.isArray(body.months) ? body.months : [];
    const totals = body.totals_excluding_partial ?? body.totals ?? {};
    const period = body.period ?? "período informado";
    const premises = body.valuation_premises ?? null;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ analysis: "Sem dados no período." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const table = buildTable(rows);
    const projectionNote = buildProjection(rows);
    const totaisMd = `**Totais do período (${period}, EXCLUINDO mês parcial):** Rec. líq ${fmtBRL(totals.receita_liquida ?? 0)} · CMV ${fmtBRL(totals.cmv ?? 0)} · Lucro bruto ${fmtBRL(totals.lucro_bruto ?? 0)} · EBITDA ${fmtBRL(totals.ebitda ?? 0)} · Resultado líquido ${fmtBRL(totals.resultado_liquido ?? 0)}.`;

    const premisesMd = mode === "valuation" && premises
      ? `\n\n**Premissas de valuation:**\n- Patrimônio por loja: ${fmtBRL(premises.patrimonio_por_loja ?? 0)} × ${premises.lojas_ativas ?? 0} lojas\n- Fábrica: ${fmtBRL(premises.fabrica ?? 0)} · Escritório: ${fmtBRL(premises.escritorio ?? 0)} · Caixa: ${fmtBRL(premises.caixa ?? 0)}\n- Nova loja Asa Norte: ${((premises.nova_loja_asa_norte_pct_da_atual ?? 0.7) * 100).toFixed(0)}% do faturamento da Asa Norte atual · CAPEX bancado pelo iFood: ${premises.nova_loja_capex_por_ifood ? "SIM" : "não"}\n- Marcas para franquear: ${(premises.marcas_para_franquear ?? []).join(", ")}\n- Taxa inicial de franquia: ${fmtBRL((premises.franquia_taxa_inicial_faixa ?? [0,0])[0])}–${fmtBRL((premises.franquia_taxa_inicial_faixa ?? [0,0])[1])} por unidade\n- Royalties: ${(((premises.franquia_royalties_pct_faixa ?? [0,0])[0])*100).toFixed(0)}%–${(((premises.franquia_royalties_pct_faixa ?? [0,0])[1])*100).toFixed(0)}% do faturamento · Fundo de marketing: ${(((premises.franquia_fundo_marketing_pct ?? 0))*100).toFixed(0)}%\n- Unidades franqueadas plausíveis em 3-5 anos por marca: ${(premises.franquia_unidades_horizonte_3a5_anos_por_marca ?? [0,0]).join("–")}\n- Sistema NEXA é ativo da empresa? ${premises.nexa_e_ativo_da_empresa ? "SIM" : "NÃO — é do sócio Mauro (PF), cedido em uso gratuito; NÃO capitalizar no valuation"}\n- ${premises.observacoes ?? ""}`
      : "";

    const userMsg = `${projectionNote ? projectionNote.trim() + "\n\n" : ""}${totaisMd}${premisesMd}\n\nDRE mês a mês FECHADOS (${period}) — a tabela abaixo já EXCLUI o mês em andamento:\n\n${table}`;


    const system =
      mode === "analitica" ? SYSTEM_ANALITICA
      : mode === "valuation" ? SYSTEM_VALUATION
      : SYSTEM_SINTETICA;

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
