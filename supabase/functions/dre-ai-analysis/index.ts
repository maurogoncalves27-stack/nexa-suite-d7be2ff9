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
  const body = rows.map((r) => {
    const label = r.parcial ? `${r.mes} ⚠️ PARCIAL (d.${r.dia_atual}/${r.dias_no_mes})` : r.mes;
    return `| ${label} | ${fmtBRL(r.receita_liquida)} | ${fmtBRL(r.cmv)} | ${fmtBRL(r.lucro_bruto)} | ${fmtBRL(r.pessoal)} | ${fmtBRL(r.admin)} | ${fmtBRL(r.marketing)} | ${fmtBRL(r.financeiras)} | ${fmtBRL(r.impostos)} | ${fmtBRL(r.ebitda)} | ${fmtBRL(r.resultado_liquido)} |`;
  }).join("\n");
  return `${header}\n${sep}\n${body}`;
};

const buildProjection = (rows: MonthRow[]): string => {
  const partial = rows.find((r) => r.parcial && r.projecao_mes_inteiro);
  if (!partial || !partial.projecao_mes_inteiro) return "";
  const p = partial.projecao_mes_inteiro;
  return `\n\n**ATENÇÃO — mês corrente parcial (${partial.mes}, dia ${partial.dia_atual} de ${partial.dias_no_mes}):** os números realizados desse mês são parciais. NÃO trate como queda vs. meses anteriores. Projeção linear para o mês inteiro (rateio pelos dias decorridos): Rec. líq ${fmtBRL(p.receita_liquida)} · Lucro bruto ${fmtBRL(p.lucro_bruto)} · EBITDA ${fmtBRL(p.ebitda)} · Resultado líquido ${fmtBRL(p.resultado_liquido)}. Use a projeção nas comparações de tendência e deixe claro que é projeção.`;
};


const SYSTEM_SINTETICA = `Você é um controller/CFO analisando a DRE de uma rede de restaurantes brasileira (Aquela Parmê). Responda em PORTUGUÊS BR, tom executivo e direto, MÁXIMO 8 bullets. Nada de introduções ou fechamentos genéricos. Foque em: (1) tendência de receita líquida, (2) margem bruta e evolução do CMV, (3) principais linhas de despesa e alterações relevantes, (4) resultado líquido — sinalizando meses de prejuízo, (5) 2-3 sugestões acionáveis. Use valores em BRL onde apoiar a conclusão. Formato markdown.`;

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
Não invente dados fora dos fornecidos. Use fmt "R$ X" para valores.`;

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
    const totals = body.totals ?? {};
    const period = body.period ?? "período informado";

    if (rows.length === 0) {
      return new Response(JSON.stringify({ analysis: "Sem dados no período." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const table = buildTable(rows);
    const totaisMd = `**Totais do período (${period}):** Rec. líq ${fmtBRL(totals.receita_liquida ?? 0)} · CMV ${fmtBRL(totals.cmv ?? 0)} · Lucro bruto ${fmtBRL(totals.lucro_bruto ?? 0)} · EBITDA ${fmtBRL(totals.ebitda ?? 0)} · Resultado líquido ${fmtBRL(totals.resultado_liquido ?? 0)}.`;

    const userMsg = `${totaisMd}\n\nDRE mês a mês (${period}):\n\n${table}`;

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
