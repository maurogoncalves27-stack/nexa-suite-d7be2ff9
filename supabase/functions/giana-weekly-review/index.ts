// Análise semanal automática das conversas da Giana.
// - Coleta conversas dos últimos 7 dias (WhatsApp cliente + widget)
// - Calcula métricas agregadas (CSAT, volume, problemas)
// - Amostra conversas relevantes e roda Gemini para gerar diagnóstico + sugestões
// - Salva em giana_weekly_reports
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const MODEL = 'google/gemini-3-flash-preview';

function weekRange(ref = new Date()) {
  // Semana anterior segunda→domingo (em UTC pra idempotência)
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const day = d.getUTCDay(); // 0..6 (dom=0)
  const daysSinceMonday = (day + 6) % 7;
  const thisMonday = new Date(d); thisMonday.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const start = new Date(thisMonday); start.setUTCDate(thisMonday.getUTCDate() - 7);
  const end = new Date(thisMonday); end.setUTCDate(thisMonday.getUTCDate() - 1);
  return {
    startIso: start.toISOString(),
    endIsoExcl: thisMonday.toISOString(),
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

type ConvSample = {
  id: string;
  source: 'whatsapp' | 'widget';
  transcript: string;
  msgs: number;
  rating: string | null;
  triageSummary?: string | null;
  triageSeverity?: string | null;
};

async function fetchConversationsWindow(supabase: any, startIso: string, endIsoExcl: string) {
  const { data: wa } = await supabase
    .from('whatsapp_customer_conversations')
    .select('id, phone, status, feedback_rating, last_message_at, created_at')
    .gte('last_message_at', startIso).lt('last_message_at', endIsoExcl);

  const { data: widget } = await supabase
    .from('chat_conversations')
    .select('id, session_id, feedback_rating, message_count, last_message_at, triage')
    .gte('last_message_at', startIso).lt('last_message_at', endIsoExcl);

  return { wa: wa ?? [], widget: widget ?? [] };
}

async function buildTranscript(supabase: any, convId: string): Promise<{ text: string; userMsgs: number }> {
  const { data } = await supabase
    .from('whatsapp_customer_messages')
    .select('role, content, tool_name, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(60);
  const rows = data ?? [];
  const userMsgs = rows.filter((r: any) => r.role === 'user').length;
  const text = rows
    .filter((r: any) => r.role !== 'tool' && r.content)
    .map((r: any) => `${r.role === 'user' ? 'CLIENTE' : 'GIANA'}: ${String(r.content).slice(0, 500)}`)
    .join('\n');
  return { text, userMsgs };
}

function sampleConversations<T>(all: T[], pickAllIf: (c: T) => boolean, rate = 0.2, cap = 50): T[] {
  const forced = all.filter(pickAllIf);
  const rest = all.filter((c) => !pickAllIf(c));
  const shuffled = [...rest].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(cap, Math.max(3, Math.floor(rest.length * rate))));
  return [...forced, ...picked].slice(0, cap);
}

async function callGemini(prompt: string) {
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Você é um analista de qualidade de atendimento. Retorne SEMPRE JSON válido no schema pedido, em português do Brasil.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content ?? '{}';
  try { return JSON.parse(content); } catch { return { raw: content }; }
}

function analysisPrompt(samples: ConvSample[]) {
  const blocks = samples.map((s, i) => (
    `### Conversa ${i + 1} (id=${s.id.slice(0, 8)}, msgs_cliente=${s.msgs}, rating=${s.rating ?? 'sem'}${s.triageSeverity ? `, severidade=${s.triageSeverity}` : ''})\n${s.transcript}`
  )).join('\n\n');

  return `Analise ${samples.length} conversas reais entre clientes e a Giana (assistente de WhatsApp de restaurantes da Aquela Parmê). Foque em identificar padrões, não conversas isoladas.

Retorne JSON com este schema exato:
{
  "problemas_recorrentes": [ { "categoria": "string", "descricao": "string", "frequencia": 1, "exemplos_conv_ids": ["8chars"] } ],
  "respostas_ruins": [ { "problema": "string", "trecho_giana": "string", "conv_id": "8chars", "correcao_sugerida": "string" } ],
  "oportunidades_de_tool": [ { "necessidade": "string", "descricao": "string", "frequencia": 1 } ],
  "sugestoes_prompt": [ { "titulo": "string", "instrucao_a_adicionar": "string", "por_que": "string" } ],
  "elogios": [ { "tema": "string", "trecho": "string", "conv_id": "8chars" } ],
  "resumo_executivo": "string (2-3 frases)"
}

Regras:
- Sê específico e acionável — evite generalidades.
- "sugestoes_prompt" devem ser instruções curtas prontas pra colar no system prompt.
- Máx 8 itens por lista.

## CONVERSAS
${blocks}`;
}

async function computeMetrics(supabase: any, startIso: string, endIsoExcl: string) {
  const { data: wa } = await supabase
    .from('whatsapp_customer_conversations')
    .select('id, status, feedback_rating')
    .gte('last_message_at', startIso).lt('last_message_at', endIsoExcl);
  const { data: fb } = await supabase
    .from('giana_feedback')
    .select('rating, sentiment')
    .gte('created_at', startIso).lt('created_at', endIsoExcl);
  const { data: complaints } = await supabase
    .from('whatsapp_customer_complaints')
    .select('id, status')
    .gte('created_at', startIso).lt('created_at', endIsoExcl);

  const total = (wa ?? []).length;
  const escaladas = (wa ?? []).filter((c: any) => c.status === 'escalated').length;
  const respostas = (fb ?? []).length;
  const positivas = (fb ?? []).filter((f: any) => f.rating === 'positive' || f.sentiment === 'positive').length;
  const negativas = (fb ?? []).filter((f: any) => f.rating === 'negative' || f.sentiment === 'negative').length;
  const csat = respostas > 0 ? +(positivas / respostas * 100).toFixed(1) : null;
  const feedbackPedido = (wa ?? []).filter((c: any) => c.feedback_rating).length;
  const taxaResposta = total > 0 ? +(feedbackPedido / total * 100).toFixed(1) : 0;

  return {
    total_conversas: total,
    respostas_feedback: respostas,
    csat_pct: csat,
    feedback_positivo: positivas,
    feedback_negativo: negativas,
    taxa_resposta_feedback_pct: taxaResposta,
    escaladas_para_humano: escaladas,
    reclamacoes_registradas: (complaints ?? []).length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const range = weekRange(body?.ref ? new Date(body.ref) : new Date());

    // Idempotência: se já existe e não é força-bruta, retorna.
    if (!body?.force) {
      const { data: existing } = await supabase
        .from('giana_weekly_reports').select('id').eq('week_start', range.weekStart).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, skipped: 'already_exists', report_id: existing.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const metrics = await computeMetrics(supabase, range.startIso, range.endIsoExcl);

    // Amostragem WhatsApp
    const { wa } = await fetchConversationsWindow(supabase, range.startIso, range.endIsoExcl);
    const enriched: ConvSample[] = [];
    for (const c of wa) {
      const { text, userMsgs } = await buildTranscript(supabase, c.id);
      if (userMsgs < 3) continue;
      enriched.push({
        id: c.id, source: 'whatsapp', transcript: text, msgs: userMsgs,
        rating: c.feedback_rating ?? null,
      });
    }

    const sampled = sampleConversations(
      enriched,
      (c) => c.rating === 'negative',
      0.2,
      Math.min(40, Math.max(10, Math.ceil(enriched.length * 0.3))),
    );

    let analysis: any = { skipped: 'no_conversations' };
    if (sampled.length >= 1) {
      analysis = await callGemini(analysisPrompt(sampled));
    }

    const { data: inserted, error } = await supabase
      .from('giana_weekly_reports')
      .upsert({
        week_start: range.weekStart,
        week_end: range.weekEnd,
        status: 'completed',
        conversations_total: enriched.length,
        conversations_analyzed: sampled.length,
        metrics,
        analysis,
        triggered_by: body?.user_id ?? null,
      }, { onConflict: 'week_start' })
      .select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, report: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[giana-weekly-review]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
