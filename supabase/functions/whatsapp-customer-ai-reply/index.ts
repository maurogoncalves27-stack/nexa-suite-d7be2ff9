// IA do canal WhatsApp Cliente — chama Lovable AI com function calling
// e responde via Z-API (instância CLIENTE).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const ZAPI_INSTANCE = Deno.env.get('ZAPI_CUSTOMER_INSTANCE_ID') || '';
const ZAPI_TOKEN = Deno.env.get('ZAPI_CUSTOMER_TOKEN') || '';
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CUSTOMER_CLIENT_TOKEN') || '';

const MODEL = 'google/gemini-3-flash-preview';
const MAX_TOOL_LOOPS = 5;

async function sendWhatsApp(phone: string, message: string) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.error('Z-API customer creds missing — message NOT sent:', message);
    return { sent: false, reason: 'missing_creds' };
  }
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  });
  const ok = r.ok;
  console.log('[zapi-send]', r.status, ok ? 'ok' : await r.text());
  return { sent: ok };
}

// ===== Tools disponíveis para a IA =====
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_store_info',
      description: 'Retorna informações da loja: horário de funcionamento, endereço, telefone, formas de pagamento.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_menu',
      description: 'Busca itens do cardápio. Use SEMPRE antes de mencionar nome, descrição ou preço de produto. NUNCA invente preços.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Termo de busca, ex: "parmê de frango"' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_complaint',
      description: 'Registra reclamação do cliente para revisão da equipe.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: 'Texto da reclamação' } },
        required: ['message'],
        additionalProperties: false,
      },
    },
  },
];

async function runTool(name: string, args: any, ctx: { supabase: any; conversation: any }) {
  const { supabase, conversation } = ctx;
  try {
    if (name === 'get_store_info') {
      if (!conversation.store_id) return { error: 'Loja não configurada' };
      const { data: store } = await supabase.from('stores')
        .select('name, address, phone').eq('id', conversation.store_id).maybeSingle();
      const { data: cfg } = await supabase.from('whatsapp_customer_config')
        .select('opening_hours').eq('store_id', conversation.store_id).maybeSingle();
      return {
        name: store?.name, address: store?.address, phone: store?.phone,
        opening_hours: cfg?.opening_hours || 'Consulte a loja',
        payment_methods: ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro (entrega)'],
      };
    }
    if (name === 'search_menu') {
      if (!conversation.store_id) return { items: [] };
      const q = String(args.query || '').toLowerCase();
      const { data } = await supabase.from('pdv_items')
        .select('id, name, description, price')
        .eq('store_id', conversation.store_id)
        .eq('is_active', true)
        .ilike('name', `%${q}%`)
        .limit(8);
      return { items: data || [] };
    }
    if (name === 'register_complaint') {
      await supabase.from('whatsapp_customer_complaints').insert({
        conversation_id: conversation.id,
        phone: conversation.phone,
        store_id: conversation.store_id,
        message: String(args.message || ''),
      });
      return { ok: true, eta: 'Em até 24h um responsável vai te retornar.' };
    }
    return { error: 'tool desconhecida' };
  } catch (e) {
    console.error('tool error', name, e);
    return { error: String(e) };
  }
}

const DEFAULT_SYSTEM_PROMPT = `Você é um atendente virtual de restaurante via WhatsApp. Seja simpático, breve e use português brasileiro informal.

REGRAS CRÍTICAS:
- NUNCA invente preços, descrições ou itens do cardápio. Sempre use a tool search_menu antes de citar qualquer produto.
- NUNCA invente horários ou endereços. Use get_store_info.
- Se o cliente quiser fazer pedido, diga que nesta fase pedidos são feitos pelo iFood ou por telefone (pegue o telefone via get_store_info). NÃO tente montar pedido.
- Reclamações: confirme o relato e chame register_complaint.
- Responda em mensagens curtas (no máx 3 linhas). Use emojis com moderação.
- Sempre que apresentar dúvida sobre algo do restaurante, consulte as tools.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Only callable server-to-server with the service-role key (invoked by
  // whatsapp-customer-webhook). Rejects any external caller.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!SERVICE_ROLE || token !== SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { conversation_id } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: conversation } = await supabase
      .from('whatsapp_customer_conversations').select('*').eq('id', conversation_id).maybeSingle();
    if (!conversation) return new Response(JSON.stringify({ error: 'conv not found' }), { status: 404, headers: corsHeaders });

    // config da loja (prompt customizado, off-hours)
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let enabled = true;
    let offHoursMsg: string | null = null;
    if (conversation.store_id) {
      const { data: cfg } = await supabase.from('whatsapp_customer_config')
        .select('*').eq('store_id', conversation.store_id).maybeSingle();
      if (cfg) {
        if (cfg.system_prompt) systemPrompt = cfg.system_prompt;
        enabled = cfg.enabled !== false;
        offHoursMsg = cfg.off_hours_message || null;
      }
    }

    if (!enabled) {
      const msg = offHoursMsg || 'Olá! No momento o atendimento automático está desativado. Por favor, ligue para a loja.';
      await sendWhatsApp(conversation.phone, msg);
      await supabase.from('whatsapp_customer_messages').insert({
        conversation_id, role: 'assistant', content: msg,
      });
      return new Response(JSON.stringify({ ok: true, disabled: true }), { headers: corsHeaders });
    }

    // últimos 20 mensagens
    const { data: history } = await supabase
      .from('whatsapp_customer_messages')
      .select('role, content, tool_name, tool_args, tool_result')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(20);

    const ordered = (history || []).reverse();
    const msgs: any[] = [{ role: 'system', content: systemPrompt }];
    if (conversation.context_summary) {
      msgs.push({ role: 'system', content: `Resumo do contexto anterior: ${conversation.context_summary}` });
    }
    for (const m of ordered) {
      if (m.role === 'user' || m.role === 'assistant') {
        msgs.push({ role: m.role, content: m.content || '' });
      }
    }

    // Loop de tool calling
    let finalText: string | null = null;
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: msgs, tools, tool_choice: 'auto' }),
      });

      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error('AI gateway error', aiResp.status, t);
        finalText = 'Desculpe, tive um problema. Pode tentar de novo daqui a pouco?';
        break;
      }

      const data = await aiResp.json();
      const choice = data?.choices?.[0]?.message;
      if (!choice) { finalText = 'Desculpe, não consegui responder agora.'; break; }

      const toolCalls = choice.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        msgs.push(choice);
        for (const tc of toolCalls) {
          const name = tc.function?.name;
          const args = JSON.parse(tc.function?.arguments || '{}');
          const result = await runTool(name, args, { supabase, conversation });
          await supabase.from('whatsapp_customer_messages').insert({
            conversation_id, role: 'tool', tool_name: name, tool_args: args, tool_result: result,
          });
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }

      finalText = choice.content || 'Ok!';
      break;
    }

    if (!finalText) finalText = 'Desculpe, não consegui responder agora. Tente de novo, por favor.';

    await sendWhatsApp(conversation.phone, finalText);
    await supabase.from('whatsapp_customer_messages').insert({
      conversation_id, role: 'assistant', content: finalText,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[wa-customer-ai-reply] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
