// Cron: pede feedback (👍/👎) ao cliente após 30 min de silêncio.
// Roda a cada 15min via pg_cron.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZAPI_INSTANCE = Deno.env.get('ZAPI_CUSTOMER_INSTANCE_ID') || '';
const ZAPI_TOKEN = Deno.env.get('ZAPI_CUSTOMER_TOKEN') || '';
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CUSTOMER_CLIENT_TOKEN') || '';

const FEEDBACK_MSG =
  'Antes de encerrar 🙂 — como foi seu atendimento comigo hoje?\n\n' +
  'Responda com 👍 (ficou bom) ou 👎 (posso melhorar).\n' +
  'Se quiser, escreve um comentário curto que eu levo pra equipe.';

async function sendWhatsApp(phone: string, message: string) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) return { sent: false, reason: 'missing_creds' };
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  });
  return { sent: r.ok, status: r.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: convs, error } = await supabase
      .from('whatsapp_customer_conversations')
      .select('id, phone, status, last_message_at, feedback_requested_at')
      .lt('last_message_at', cutoff)
      .gt('last_message_at', notBefore)
      .is('feedback_requested_at', null)
      .neq('status', 'escalated')
      .limit(30);
    if (error) throw error;

    let sent = 0;
    for (const c of (convs ?? [])) {
      // pelo menos 3 mensagens de user
      const { count } = await supabase
        .from('whatsapp_customer_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('role', 'user');
      if ((count ?? 0) < 3) continue;

      const res = await sendWhatsApp(c.phone, FEEDBACK_MSG);
      if (res.sent) {
        await supabase
          .from('whatsapp_customer_conversations')
          .update({ feedback_requested_at: new Date().toISOString() })
          .eq('id', c.id);
        await supabase.from('whatsapp_customer_messages').insert({
          conversation_id: c.id, role: 'assistant', content: FEEDBACK_MSG,
        });
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: convs?.length ?? 0, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[giana-request-feedback]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
