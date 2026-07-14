// Webhook público da Z-API (instância CLIENTE) — recebe msgs do WhatsApp do cliente
// e dispara o whatsapp-customer-ai-reply em background.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizePhone(p: string) {
  const digits = (p || '').replace(/\D/g, '');
  return digits.startsWith('55') ? digits : (digits.length >= 10 ? '55' + digits : digits);
}

function normalizeText(t: string) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Shared-secret check — Z-API can be configured to send a custom header on
  // every webhook delivery. If ZAPI_WEBHOOK_SECRET is set, require a match.
  const expectedSecret = Deno.env.get('ZAPI_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: 'webhook not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const url = new URL(req.url);
  const provided = req.headers.get('x-webhook-token')
    ?? req.headers.get('x-zapi-token')
    ?? url.searchParams.get('token')
    ?? '';
  if (provided !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }


  try {
    const body = await req.json().catch(() => ({}));
    console.log('[wa-customer-webhook] payload', JSON.stringify(body).slice(0, 500));

    // Z-API "on-message-received" formato
    const fromMe = body?.fromMe === true;
    if (fromMe) return new Response('ignored:fromMe', { headers: corsHeaders });

    const phoneRaw = body?.phone || body?.from || body?.sender?.phone;
    const text = normalizeText(body?.text?.message || body?.message || body?.body || '');
    const senderName = body?.senderName || body?.chatName || null;
    const zapiMessageId = body?.messageId || body?.id || null;

    if (!phoneRaw || !text) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no phone or text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phone = normalizePhone(phoneRaw);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // bloqueio?
    const { data: blocked } = await supabase
      .from('whatsapp_blocked_numbers').select('id').eq('phone', phone).maybeSingle();
    if (blocked) {
      return new Response(JSON.stringify({ ok: true, blocked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // conversa (Fase 1: 1 loja piloto via env STORE_ID; depois multi-loja)
    const pilotStoreId = Deno.env.get('WHATSAPP_CUSTOMER_PILOT_STORE_ID') || null;
    let { data: conv } = await supabase
      .from('whatsapp_customer_conversations')
      .select('*')
      .eq('phone', phone)
      .eq('store_id', pilotStoreId)
      .maybeSingle();

    if (!conv) {
      const ins = await supabase
        .from('whatsapp_customer_conversations')
        .insert({ phone, customer_name: senderName, store_id: pilotStoreId, status: 'active' })
        .select().single();
      conv = ins.data;
    } else {
      await supabase.from('whatsapp_customer_conversations')
        .update({ last_message_at: new Date().toISOString(), status: 'active', customer_name: senderName || conv.customer_name })
        .eq('id', conv.id);
    }

    if (zapiMessageId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_customer_messages')
        .select('id')
        .eq('zapi_message_id', zapiMessageId)
        .maybeSingle();
      if (existingMsg) {
        console.log('[wa-customer-webhook] duplicate zapi message ignored', zapiMessageId);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const sinceDuplicateWindow = new Date(Date.now() - 20_000).toISOString();
    const { data: recentSameText } = await supabase
      .from('whatsapp_customer_messages')
      .select('id')
      .eq('conversation_id', conv!.id)
      .eq('role', 'user')
      .eq('content', text)
      .gte('created_at', sinceDuplicateWindow)
      .limit(1)
      .maybeSingle();
    if (recentSameText) {
      console.log('[wa-customer-webhook] duplicate recent user text ignored', recentSameText.id);
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: insertedUserMessage, error: insertMsgError } = await supabase
      .from('whatsapp_customer_messages')
      .insert({
        conversation_id: conv!.id,
        role: 'user',
        content: text,
        zapi_message_id: zapiMessageId,
      })
      .select('id')
      .single();

    if (insertMsgError || !insertedUserMessage) {
      const msg = insertMsgError?.message || '';
      if (/duplicate key|unique/i.test(msg)) {
        console.log('[wa-customer-webhook] duplicate insert ignored', msg);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw insertMsgError || new Error('failed to insert user message');
    }

    // Se estamos aguardando resposta de feedback, interceptamos e não chamamos a IA
    if (conv!.feedback_requested_at && !conv!.feedback_rating) {
      const t = String(text).toLowerCase().trim();
      let rating: 'positive' | 'negative' | null = null;
      if (/👍|👌|😀|😄|🙂|❤️|bom|boa|ótim|otim|excelent|top|gost|adore|show|joia|jóia|maravilh|10|nota\s*10|perfeito|resolveu/.test(t)) rating = 'positive';
      else if (/👎|😠|😡|🤬|ruim|péssim|pessim|horr[íi]vel|nao\s*gost|não\s*gost|demor|lent|erro|errad|problema|reclam|insatisfeit|zero/.test(t)) rating = 'negative';

      await supabase.from('giana_feedback').insert({
        conversation_id: conv!.id,
        conversation_source: 'whatsapp',
        phone,
        store_id: conv!.store_id,
        rating,
        raw_response: text,
        comment: rating ? null : text,
        sentiment: rating === 'positive' ? 'positive' : rating === 'negative' ? 'negative' : null,
        answered_at: new Date().toISOString(),
      });
      await supabase.from('whatsapp_customer_conversations')
        .update({ feedback_rating: rating ?? 'text', status: 'closed' })
        .eq('id', conv!.id);

      // agradecimento breve
      const thanks = rating === 'positive'
        ? 'Que bom saber! 💛 Obrigada pelo retorno.'
        : rating === 'negative'
          ? 'Obrigada pelo retorno — vou passar pra equipe pra melhorarmos. 🙏'
          : 'Obrigada pelo retorno! 🙏';
      await supabase.from('whatsapp_customer_messages').insert({
        conversation_id: conv!.id, role: 'assistant', content: thanks, reply_to_message_id: insertedUserMessage.id,
      });
      await supabase.from('whatsapp_customer_messages')
        .update({ ai_processed_at: new Date().toISOString() })
        .eq('id', insertedUserMessage.id);
      // reusa a mesma função de envio via Z-API
      const ZAPI_INSTANCE = Deno.env.get('ZAPI_CUSTOMER_INSTANCE_ID') || '';
      const ZAPI_TOKEN = Deno.env.get('ZAPI_CUSTOMER_TOKEN') || '';
      const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CUSTOMER_CLIENT_TOKEN') || '';
      if (ZAPI_INSTANCE && ZAPI_TOKEN) {
        fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone, message: thanks }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ ok: true, feedback: rating ?? 'text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // dispara IA em background
    fetch(`${SUPABASE_URL}/functions/v1/whatsapp-customer-ai-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ conversation_id: conv!.id, message_id: insertedUserMessage.id }),
    }).catch((e) => console.error('dispatch ai-reply', e));

    return new Response(JSON.stringify({ ok: true, conversation_id: conv!.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[wa-customer-webhook] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
