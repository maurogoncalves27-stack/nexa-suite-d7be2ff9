// Analisa o estado atual do CRM (reservas, conversas, tickets, avaliações, feedback)
// e devolve um diagnóstico curto + sugestões acionáveis via Gemini.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const MODEL = 'google/gemini-3-flash-preview';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [resv, wa, tickets, reviews, complaints, fb, triaged] = await Promise.all([
      supabase.from('reservations').select('id, status, party_size, created_at').gte('created_at', since),
      supabase.from('whatsapp_customer_conversations').select('id, status, feedback_rating').gte('last_message_at', since),
      supabase.from('support_tickets').select('id, status, created_at').gte('created_at', since),
      supabase.from('customer_reviews').select('id, rating, status, source, comment, created_at').gte('created_at', since).limit(80),
      supabase.from('whatsapp_customer_complaints').select('id, status, message, created_at').gte('created_at', since).limit(50),
      supabase.from('giana_feedback').select('rating, sentiment, comment, raw_response').gte('created_at', since).limit(80),
      supabase.from('chat_conversations').select('triage').gte('last_message_at', since).not('triage', 'is', null).limit(200),
    ]);

    const reservationsCount = resv.data?.length ?? 0;
    const reservationsByStatus: Record<string, number> = {};
    for (const r of resv.data ?? []) reservationsByStatus[r.status ?? 'unknown'] = (reservationsByStatus[r.status ?? 'unknown'] ?? 0) + 1;

    const waCount = wa.data?.length ?? 0;
    const waEscaladas = (wa.data ?? []).filter((c: any) => c.status === 'escalated').length;

    const ticketsCount = tickets.data?.length ?? 0;
    const ticketsAbertos = (tickets.data ?? []).filter((t: any) => t.status === 'open' || t.status === 'in_progress').length;

    const reviewList = reviews.data ?? [];
    const revAvg = reviewList.length
      ? +(reviewList.reduce((s: number, r: any) => s + (r.rating ?? 0), 0) / reviewList.length).toFixed(2)
      : null;
    const revBad = reviewList.filter((r: any) => (r.rating ?? 5) <= 2).slice(0, 10)
      .map((r: any) => `- (${r.source} ${r.rating}★) ${String(r.comment ?? '').slice(0, 180)}`).join('\n');
    const revUnanswered = reviewList.filter((r: any) => r.status === 'novo' || r.status === 'new').length;

    const complaintList = (complaints.data ?? [])
      .slice(0, 15).map((c: any) => `- ${String(c.message).slice(0, 200)}`).join('\n');

    const fbList = fb.data ?? [];
    const pos = fbList.filter((f: any) => f.rating === 'positive' || f.sentiment === 'positive').length;
    const neg = fbList.filter((f: any) => f.rating === 'negative' || f.sentiment === 'negative').length;
    const csat = fbList.length ? Math.round(pos / fbList.length * 100) : null;
    const fbNeg = fbList.filter((f: any) => f.rating === 'negative' || f.sentiment === 'negative')
      .slice(0, 10).map((f: any) => `- ${String(f.comment ?? f.raw_response ?? '').slice(0, 200)}`).join('\n');

    const triageCounts: Record<string, number> = {};
    for (const t of triaged.data ?? []) {
      const cat = (t.triage as any)?.category ?? 'outros';
      triageCounts[cat] = (triageCounts[cat] ?? 0) + 1;
    }

    const kpiBlock = {
      periodo_dias: 14,
      reservas: { total: reservationsCount, por_status: reservationsByStatus },
      whatsapp: { conversas: waCount, escaladas_humano: waEscaladas },
      tickets: { total: ticketsCount, abertos: ticketsAbertos },
      avaliacoes: { total: reviewList.length, media: revAvg, nao_respondidas: revUnanswered },
      csat_giana_pct: csat,
      feedback: { positivos: pos, negativos: neg, respostas: fbList.length },
      categorias_problemas: triageCounts,
    };

    const prompt = `Você é um consultor de operações de restaurante analisando o CRM da Aquela Parmê.

Dados dos últimos 14 dias (JSON):
${JSON.stringify(kpiBlock, null, 2)}

Avaliações ruins recentes (≤2★):
${revBad || '(nenhuma)'}

Reclamações registradas:
${complaintList || '(nenhuma)'}

Feedback negativo da Giana:
${fbNeg || '(nenhum)'}

Retorne JSON EXATO neste schema (português BR, seja específico e acionável, foque em impacto):
{
  "diagnostico": "string (3-5 frases resumindo o estado atual)",
  "pontos_fortes": ["string", "..."],
  "pontos_de_atencao": [{ "titulo": "string", "detalhe": "string", "severidade": "baixa|media|alta" }],
  "acoes_sugeridas": [{ "titulo": "string", "descricao": "string", "impacto": "baixo|medio|alto", "esforco": "baixo|medio|alto", "quando": "hoje|esta_semana|este_mes" }],
  "metrica_para_acompanhar": "string (a métrica mais importante nas próximas 2 semanas)"
}
Máx 4 pontos fortes, 5 pontos de atenção, 6 ações.`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'Analista sênior de operações e CX. Responda sempre com JSON válido.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content ?? '{}';
    let analysis: any;
    try { analysis = JSON.parse(content); } catch { analysis = { raw: content }; }

    return new Response(JSON.stringify({ ok: true, kpis: kpiBlock, analysis, generated_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[crm-ai-insights]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
