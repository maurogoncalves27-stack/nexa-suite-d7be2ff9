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

const getPartialRow = (rows: MonthRow[]) => rows.find((r) => r.parcial && r.projecao_mes_inteiro) ?? null;

const getMonthAliases = (mes: string): string[] => {
  const lower = mes.toLowerCase();
  const aliases = new Set([lower]);
  const monthMap: Record<string, string[]> = {
    jan: ["janeiro"], fev: ["fevereiro"], mar: ["março", "marco"], abr: ["abril"],
    mai: ["maio"], jun: ["junho"], jul: ["julho"], ago: ["agosto"],
    set: ["setembro"], out: ["outubro"], nov: ["novembro"], dez: ["dezembro"],
  };
  const prefix = lower.slice(0, 3);
  for (const alias of monthMap[prefix] ?? []) aliases.add(alias);
  return [...aliases];
};

const sanitizePartialMonthAnalysis = (analysis: string, partial: MonthRow | null): string => {
  if (!partial) return analysis;
  const aliases = getMonthAliases(partial.mes);
  const forbidden = ["colapso", "queda", "retra", "despenc", "abrupt", "crític", "critic", "interrup", "subfatur"];
  const lower = analysis.toLowerCase();
  const hasBadPartialMention = aliases.some((a) => lower.includes(a)) && forbidden.some((term) => lower.includes(term));
  if (!hasBadPartialMention) return analysis;

  const cleaned = analysis
    .split("\n")
    .filter((line) => {
      const l = line.toLowerCase();
      const mentionsPartial = aliases.some((a) => l.includes(a));
      const hasForbiddenTerm = forbidden.some((term) => l.includes(term));
      return !(mentionsPartial && hasForbiddenTerm);
    })
    .join("\n")
    .trim();

  const safeNote = `**Mês parcial:** ${partial.mes} está em andamento e foi excluído das comparações de tendência. Use apenas a projeção linear como referência, sem interpretar o realizado parcial como desempenho final.`;
  return `${safeNote}${cleaned ? `\n\n${cleaned}` : ""}`;
};

const buildTable = (rows: MonthRow[]): string => {
  const header = "| Mês | Rec. Líq | CMV | Lucro Bruto | Pessoal | Admin (inclui Mkt+Outras) | Financ. | Impostos | EBITDA | Res. Líq |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|";
  // Só meses FECHADOS entram na tabela — mês em andamento vai só na nota de projeção.
  // Admin já consolida Marketing e Outras despesas operacionais (mudança de DRE — não são mais linhas separadas).
  const body = rows.filter((r) => !r.parcial).map((r) => {
    const adminConsolidado = (r.admin ?? 0) + (r.marketing ?? 0) + (r.outras ?? 0);
    return `| ${r.mes} | ${fmtBRL(r.receita_liquida)} | ${fmtBRL(r.cmv)} | ${fmtBRL(r.lucro_bruto)} | ${fmtBRL(r.pessoal)} | ${fmtBRL(adminConsolidado)} | ${fmtBRL(r.financeiras)} | ${fmtBRL(r.impostos)} | ${fmtBRL(r.ebitda)} | ${fmtBRL(r.resultado_liquido)} |`;
  }).join("\n");
  const nota = "\n\n**Nota estrutural:** Marketing e Outras despesas operacionais foram consolidadas dentro de **Despesas Administrativas** (mudança de apresentação do DRE). Não existe mais linha separada de Marketing — NÃO cite \"marketing zerado\", \"ausência de marketing\" nem sugira provisionar marketing ausente; ele está DENTRO de Admin.";
  return `${header}\n${sep}\n${body}${nota}`;
};

const buildProjection = (rows: MonthRow[]): string => {
  const partial = getPartialRow(rows);
  if (!partial || !partial.projecao_mes_inteiro) return "";
  const p = partial.projecao_mes_inteiro;
  return `\n\n**Mês em andamento:** ${partial.mes} ainda não fechou (dia ${partial.dia_atual} de ${partial.dias_no_mes}). Ele não entra na tabela de meses fechados nem nas comparações de tendência. Se citado, use somente como projeção linear: Rec. líq ${fmtBRL(p.receita_liquida)} · Lucro bruto ${fmtBRL(p.lucro_bruto)} · EBITDA ${fmtBRL(p.ebitda)} · Resultado líquido ${fmtBRL(p.resultado_liquido)}.`;
};


const SYSTEM_SINTETICA = `Você é um controller/CFO analisando a DRE de uma rede de restaurantes brasileira (Aquela Parmê). Responda em PORTUGUÊS BR, tom executivo e direto, MÁXIMO 8 bullets. Nada de introduções ou fechamentos genéricos. Foque em: (1) tendência de receita líquida, (2) margem bruta e evolução do CMV, (3) principais linhas de despesa e alterações relevantes, (4) resultado líquido — sinalizando meses de prejuízo, (5) 2-3 sugestões acionáveis. Use valores em BRL onde apoiar a conclusão. Formato markdown. REGRA INEGOCIÁVEL: se houver mês em andamento, use SOMENTE os meses fechados para tendência, variação, ranking e alertas. O mês em andamento só pode aparecer como projeção linear, explicitamente marcada como projeção. IMPORTANTE: Marketing e Outras despesas operacionais estão CONSOLIDADAS dentro de Despesas Administrativas — não existe mais linha separada. NUNCA diga "marketing zerado", "sem marketing" ou sugira provisionar marketing ausente. Trate Admin como bloco único que já inclui marketing.`;

const SYSTEM_ANALITICA = `Você é um controller/CFO sênior fazendo análise APROFUNDADA da DRE de uma rede de restaurantes brasileira (Aquela Parmê). Responda em PORTUGUÊS BR usando MARKDOWN com seções. Estrutura obrigatória:
## Panorama do período
Resumo de 2-3 linhas.
## Receita
Evolução mês a mês, sazonalidade, meses fora da curva.
## Margem bruta e CMV
Percentuais, tendência, alertas.
## Despesas operacionais
Analise os blocos **Pessoal** e **Administrativas (que já inclui Marketing e Outras op.)** em % da receita líquida e variação. Identifique anomalias. NÃO trate Marketing como linha separada — está DENTRO de Admin. NUNCA sugira provisionar marketing "ausente" ou "zerado".
## Despesas financeiras e impostos
Comente carga tributária efetiva e custo financeiro.
## EBITDA e resultado líquido
Evolução, meses de prejuízo, drivers do resultado.
## Recomendações acionáveis
Lista numerada de 4-6 ações concretas, com números que embasem cada ação.
Não invente dados fora dos fornecidos. Use fmt "R$ X" para valores. REGRA INEGOCIÁVEL: se houver mês em andamento, use SOMENTE os meses fechados para tendência, variação, ranking e alertas. O mês em andamento só pode aparecer como projeção linear, explicitamente marcada como projeção. Marketing e Outras despesas operacionais foram consolidadas em Admin — nunca cite ausência de marketing.`;

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

## 5. Valor das marcas registradas (intangível)
Parágrafo curto: **Aquela Parmê, Estrogonofe e Box Caipira** são marcas registradas no INPI, com identidade visual consolidada, operação validada, clientela recorrente e **forte relevância na praça de Brasília/DF** (reconhecimento local, presença multi-loja e associação positiva à categoria). Valor de intangível combina três camadas: (i) relief-from-royalty sobre receita projetada, (ii) prêmio por registro INPI ativo e (iii) **prêmio de goodwill/brand equity local** (share of mind em Brasília, potencial de expansão regional Centro-Oeste).

| Marca | Estágio | Faixa de valor intangível |
|---|---|---|
| Aquela Parmê | Consolidada (marca-mãe, 4 lojas, alta relevância DF) | R$ 700k–1,4 mi |
| Estrogonofe | Em operação (multi-loja, nicho reconhecido) | R$ 250k–500k |
| Box Caipira | Em operação (multi-loja, conceito diferenciado) | R$ 180k–380k |
| **Subtotal marcas (intangível)** | | **R$ 1,13–2,28 mi** |

Metodologia: relief-from-royalty (5%–7% s/ receita projetada × 5 anos × múltiplo 1x–1,5x) + prêmio por registro INPI ativo + **prêmio de brand equity local** (relevância em Brasília/DF comprovada por operação multi-loja e reputação de mercado). Adicional ao upside de franquias (seção 4) — representa a titularidade e o goodwill da marca em si, realizável em venda, licenciamento ou franquia.

## 6. Consolidado — Equity Value
Tabela final:

| Componente | Valor |
|---|---|
| Operação atual (múltiplos + DCF, midpoint) | R$ ... |
| Ativos tangíveis + caixa | R$ ... |
| Nova loja Asa Norte (70%, CAPEX zero) | R$ ... |
| Franquias / licenciamento (upside) | R$ ... |
| Marcas registradas (intangível INPI) | R$ ... |
| **Equity Value central** | **R$ ...** |

## 7. Faixa recomendada para negociação
| Cenário | Faixa |
|---|---|
| Piso | R$ X milhões |
| Central | R$ Y milhões |
| Teto | R$ Z milhões |

## 8. Ressalvas e riscos
Lista com bullets (•):
• Dívida não informada — assumimos zero.
• Conversão EBITDA→lucro líquido (comentar).
• Mês em andamento foi excluído.
• Sazonalidade e meses faltantes.
• Nova loja pode superar 70% (upside adicional).
• Valor de marca é intangível — realizável apenas em cenário de venda, licenciamento ou franquia efetiva.


Rodapé:
_Relatório gerado automaticamente pelo NEXA Suite. Documento de trabalho para negociação — não substitui laudo formal assinado._


REGRAS INEGOCIÁVEIS:
- Use dados EXCLUSIVAMENTE do payload (DRE fornecida). Nunca use mês parcial como base — sempre LTM de meses FECHADOS.
- OBRIGATÓRIO renderizar TODAS as 8 seções acima (1 a 8) com a numeração EXATA. NÃO fundir a seção 5 (Marcas registradas) dentro da seção 1. A seção 5 deve aparecer SEMPRE, com a tabela das 3 marcas e o subtotal R$ 1,13–2,28 mi, e essa linha DEVE aparecer separadamente no Consolidado (seção 6).
- É TERMINANTEMENTE PROIBIDO mencionar no relatório: "Mauro", "sócio pessoa física", "pessoa física", "pertence ao sócio", "propriedade pessoal", "titularidade pessoal", "cedido para uso gratuito", "NEXA Suite não é ativo", "sistema desenvolvido e pertence a", ou qualquer variação que atribua propriedade de sistema/software a pessoa física. Não crie bullet na seção 8 sobre isso. Simplesmente OMITA — o sistema de gestão não é discutido no relatório em hipótese alguma.
- Marketing e Outras despesas operacionais estão CONSOLIDADAS em Despesas Administrativas — não cite como linhas separadas.
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
    const valuationMethod: string = body.valuation_method ?? "consenso";

    if (rows.length === 0) {
      return new Response(JSON.stringify({ analysis: "Sem dados no período." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const partialRow = getPartialRow(rows);
    const closedRows = rows.filter((r) => !r.parcial);
    const lastClosed = closedRows[closedRows.length - 1]?.mes ?? "último mês fechado";
    const table = buildTable(rows);
    const projectionNote = buildProjection(rows);
    const totaisMd = `**Totais do período (${period}, EXCLUINDO mês parcial):** Rec. líq ${fmtBRL(totals.receita_liquida ?? 0)} · CMV ${fmtBRL(totals.cmv ?? 0)} · Lucro bruto ${fmtBRL(totals.lucro_bruto ?? 0)} · EBITDA ${fmtBRL(totals.ebitda ?? 0)} · Resultado líquido ${fmtBRL(totals.resultado_liquido ?? 0)}.`;

    const premisesMd = mode === "valuation" && premises
      ? `\n\n**Premissas de valuation:**\n- Patrimônio por loja: ${fmtBRL(premises.patrimonio_por_loja ?? 0)} × ${premises.lojas_ativas ?? 0} lojas\n- Fábrica: ${fmtBRL(premises.fabrica ?? 0)} · Escritório: ${fmtBRL(premises.escritorio ?? 0)} · Caixa: ${fmtBRL(premises.caixa ?? 0)}\n- Nova loja Asa Norte: ${((premises.nova_loja_asa_norte_pct_da_atual ?? 0.7) * 100).toFixed(0)}% do faturamento da Asa Norte atual · CAPEX bancado pelo iFood: ${premises.nova_loja_capex_por_ifood ? "SIM" : "não"}\n- Marcas para franquear: ${(premises.marcas_para_franquear ?? []).join(", ")}\n- Taxa inicial de franquia: ${fmtBRL((premises.franquia_taxa_inicial_faixa ?? [0,0])[0])}–${fmtBRL((premises.franquia_taxa_inicial_faixa ?? [0,0])[1])} por unidade\n- Royalties: ${(((premises.franquia_royalties_pct_faixa ?? [0,0])[0])*100).toFixed(0)}%–${(((premises.franquia_royalties_pct_faixa ?? [0,0])[1])*100).toFixed(0)}% do faturamento · Fundo de marketing: ${(((premises.franquia_fundo_marketing_pct ?? 0))*100).toFixed(0)}%\n- Unidades franqueadas plausíveis em 3-5 anos por marca: ${(premises.franquia_unidades_horizonte_3a5_anos_por_marca ?? [0,0]).join("–")}\n- Sistema de gestão próprio (uso interno, sem custo de licença) — tratar apenas como eficiência operacional já refletida na margem; NÃO capitalizar no equity value e NÃO mencionar titularidade no relatório.\n- ${premises.observacoes ?? ""}`
      : "";

    const userMsg = `Use como base analítica apenas a tabela de meses FECHADOS abaixo. Para tendência e comparação mensal, encerre a leitura em ${lastClosed}.\n\n${totaisMd}${premisesMd}\n\nDRE mês a mês FECHADOS (${period}) — a tabela abaixo já EXCLUI o mês em andamento:\n\n${table}${projectionNote}`;


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
        temperature: 0,
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
    let analysis = sanitizePartialMonthAnalysis(data?.choices?.[0]?.message?.content ?? "Sem resposta do modelo.", partialRow);
    // Sanitizador anti-vazamento: remove QUALQUER trecho que cite titularidade pessoal do sistema.
    // Opera em 3 camadas: (1) linhas soltas, (2) bullets iniciados por • ou -, (3) sentenças dentro de parágrafos.
    const ownershipRegex = /(mauro|pessoa\s+f[íi]sica|s[óo]cio\s*\(?\s*pessoa|pertence\s+ao\s+s[óo]cio|pertence\s+a\s+mauro|desenvolvido\s+e\s+pertence|propriedade\s+(pessoal|do\s+s[óo]cio)|titularidade\s+(pessoal|do\s+s[óo]cio)|cedido\s+para\s+uso\s+gratuito|nexa\s+suite\s+n[ãa]o\s+[eé]|nexa\s+n[ãa]o\s+[eé]\s+ativo)/i;
    // 1) filtro por linha
    analysis = analysis.split("\n").filter((line) => !ownershipRegex.test(line)).join("\n");
    // 2) filtro por bullet (linhas que começam com •/- e contêm termos proibidos, mesmo quebradas)
    analysis = analysis.replace(/([•\-]\s+[^\n•]*?(mauro|nexa\s+suite\s+n[ãa]o|pertence\s+ao\s+s[óo]cio|pessoa\s+f[íi]sica|cedido\s+para\s+uso\s+gratuito)[^\n•]*)/gi, "");
    // 3) remove sentenças inteiras dentro de parágrafos
    analysis = analysis.replace(/[^.!?\n]*\b(mauro|nexa\s+suite\s+n[ãa]o\s+[eé]|pertence\s+ao\s+s[óo]cio|propriedade\s+do\s+s[óo]cio|titularidade\s+do\s+s[óo]cio|cedido\s+para\s+uso\s+gratuito|desenvolvido\s+e\s+pertence)\b[^.!?\n]*[.!?]/gi, "");
    // Limpa linhas vazias em excesso deixadas pelos filtros
    analysis = analysis.replace(/\n{3,}/g, "\n\n").trim();


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
