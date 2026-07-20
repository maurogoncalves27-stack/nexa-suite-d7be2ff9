import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";

const SYSTEM_SINTETICA = `Você é um diretor de operações da NEXA Gestão Inteligente (rede de restaurantes Aquela Parmê / Estrogonofe / Box Caipira).
Produza um **diagnóstico SINTÉTICO** em português do Brasil sobre a saúde geral do negócio hoje, com base no snapshot fornecido.
Formato obrigatório em markdown:

## Diagnóstico executivo
Um parágrafo (4-6 linhas) com o veredito geral.

## 🔴 Pontos críticos
Bullets com o que exige ação imediata.

## 🟡 Atenção
Bullets com riscos que ainda não são urgentes.

## 🟢 Pontos fortes
Bullets do que está indo bem.

## Próximos 3 passos
Lista numerada 1, 2, 3 — ações concretas priorizadas.

Regras:
- Cite números do snapshot. Não invente dados.
- Cubra RH, operações, financeiro, estoque, CRM e saúde ocupacional quando houver dados.
- Seja direto, sem enrolação.`;

const SYSTEM_ANALITICA = `Você é um controller/consultor sênior da NEXA Gestão Inteligente (rede de restaurantes).
Produza um **diagnóstico ANALÍTICO PROFUNDO** em português do Brasil sobre a saúde do negócio, com base no snapshot fornecido.
Formato obrigatório em markdown:

## 1. Pessoas & RH
Analise headcount ativo, treinamentos, avaliações, advertências, infrações, férias em risco, ponto não batido, clima organizacional. Cruzando os números, aponte causas prováveis.

## 2. Operações
Manutenções pendentes/urgentes, avisos ativos, tarefas, checklists. Relacione manutenção urgente com risco operacional.

## 3. Financeiro
Contas a pagar em aberto/vencidas, a receber, vendas POS. Comente liquidez e disciplina de caixa.

## 4. Estoque & Cardápio
Sem saldo, estoque baixo, movimentação POS. Aponte risco de ruptura.

## 5. CRM & Clientes
Reservas do mês, tendência. Se não houver dado, dizer explicitamente.

## 6. Saúde ocupacional & NR-1
Riscos psicossociais abertos, atestados médicos ativos/mês, adesão à pesquisa de clima. Comente conformidade NR-1.

## 7. Correlações e alertas cruzados
Ligue pontos entre áreas (ex.: muita advertência + baixa adesão de clima = risco de turnover).

## 8. Plano de ação priorizado
Tabela markdown com colunas: Prioridade | Ação | Área | Prazo sugerido. 5–8 linhas.

Regras:
- Cite SEMPRE os números do snapshot; nunca invente.
- Se um bloco vier vazio, diga "sem dados no snapshot" e siga em frente.
- Sem enrolação, sem introduções longas.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const mode: "sintetica" | "analitica" = body.mode === "analitica" ? "analitica" : "sintetica";
    const snapshot = body.snapshot ?? {};

    const snapshotMd = "```json\n" + JSON.stringify(snapshot, null, 2) + "\n```";
    const userMsg = `Snapshot atual do dashboard NEXA (${new Date().toLocaleDateString("pt-BR")}):\n\n${snapshotMd}\n\nGere o diagnóstico conforme instruções do sistema.`;

    const system = mode === "analitica" ? SYSTEM_ANALITICA : SYSTEM_SINTETICA;

    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
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
    console.error("dashboard-ai-diagnosis error", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
