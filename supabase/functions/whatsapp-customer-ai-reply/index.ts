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

const MODEL = 'google/gemini-3.6-flash';
const MAX_TOOL_LOOPS = 6;
const JOBS_URL = 'https://nexasuite.aquelaparme.com.br/vagas';

function isJobQuestion(text: string) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(vaga|vagas|emprego|trabalho|trabalhar|curriculo|curriculum|candidatura|contratando|selecao|recrutamento)\b/.test(normalized);
}

function jobsReply() {
  return `Temos uma página com as vagas abertas e o formulário de candidatura:\n${JOBS_URL}`;
}

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

// ===== Tools =====
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_store_info',
      description: 'Retorna informações da loja: horário, endereço, telefone, formas de pagamento.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_menu',
      description: 'Busca itens do cardápio. Use SEMPRE antes de citar nome, descrição ou preço.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_complaint',
      description: 'Registra reclamação do cliente.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Adiciona um item do cardápio ao carrinho do cliente. Use o item_id retornado por search_menu. Só use se sales_enabled=true.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string', description: 'id do menu_item' },
          quantity: { type: 'number' },
          notes: { type: 'string' },
        },
        required: ['item_id', 'quantity'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_cart',
      description: 'Mostra os itens atuais e total do carrinho.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_pickup',
      description: 'Define pedido para RETIRADA na loja: nome, horário desejado e forma de pagamento. Não pede endereço. RETIRADA é a ÚNICA modalidade disponível hoje.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string' },
          pickup_time: { type: 'string', description: 'horário desejado de retirada, ex: "19:30" ou "assim que ficar pronto"' },
          payment_method: { type: 'string', enum: ['pix', 'cartao'] },
        },
        required: ['customer_name', 'pickup_time', 'payment_method'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkout',
      description: 'Fecha o pedido, cria a ordem no PDV e gera link de pagamento Mercado Pago. Só chamar depois que o cliente confirmou o pedido e set_pickup já foi executado.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

async function getOrCreateCart(supabase: any, phone: string, storeId: string) {
  const { data: existing } = await supabase.from('pdv_whatsapp_carts')
    .select('*').eq('phone', phone).eq('store_id', storeId).eq('status', 'open').maybeSingle();
  if (existing) return existing;
  const { data: created } = await supabase.from('pdv_whatsapp_carts')
    .insert({ phone, store_id: storeId, items: [] }).select().single();
  return created;
}

async function runTool(name: string, args: any, ctx: { supabase: any; conversation: any; salesEnabled: boolean }) {
  const { supabase, conversation, salesEnabled } = ctx;
  try {
    if (name === 'get_store_info') {
      if (!conversation.store_id) return { error: 'Loja não configurada' };
      const { data: store } = await supabase.from('stores')
        .select('name, address, phone').eq('id', conversation.store_id).maybeSingle();
      const { data: cfg } = await supabase.from('whatsapp_customer_config')
        .select('opening_hours, sales_enabled').eq('store_id', conversation.store_id).maybeSingle();
      return {
        name: store?.name, address: store?.address, phone: store?.phone,
        opening_hours: cfg?.opening_hours || 'Consulte a loja',
        sales_enabled: !!cfg?.sales_enabled,
        fulfillment_available: ['pickup'],
        delivery_available: false,
        delivery_unavailable_message: 'Entrega ainda não disponível pelo WhatsApp — só retirada na loja. Para entrega, peça pelo iFood.',
        payment_methods: ['PIX (link Mercado Pago)', 'Cartão (link Mercado Pago)'],
      };
    }
    if (name === 'search_menu') {
      const q = String(args.query || '').toLowerCase();
      const { data } = await supabase.from('menu_items')
        .select('id, name, description, price')
        .eq('is_active', true).ilike('name', `%${q}%`).limit(8);
      return { items: data || [] };
    }
    if (name === 'register_complaint') {
      await supabase.from('whatsapp_customer_complaints').insert({
        conversation_id: conversation.id, phone: conversation.phone,
        store_id: conversation.store_id, message: String(args.message || ''),
      });
      return { ok: true, eta: 'Em até 24h um responsável vai te retornar.' };
    }

    // ===== Vendas =====
    if (!salesEnabled) return { error: 'Vendas via WhatsApp não estão habilitadas para esta loja.' };
    if (!conversation.store_id) return { error: 'Loja não configurada' };

    if (name === 'add_to_cart') {
      const { data: item } = await supabase.from('menu_items')
        .select('id, name, price').eq('id', args.item_id).eq('is_active', true).maybeSingle();
      if (!item) return { error: 'Item não encontrado no cardápio.' };

      const cart = await getOrCreateCart(supabase, conversation.phone, conversation.store_id);
      const items: any[] = Array.isArray(cart.items) ? [...cart.items] : [];
      const qty = Number(args.quantity) || 1;
      const idx = items.findIndex((x) => x.item_id === item.id && (x.notes || '') === (args.notes || ''));
      if (idx >= 0) items[idx].quantity += qty;
      else items.push({ item_id: item.id, name: item.name, unit_price: Number(item.price), quantity: qty, notes: args.notes || null });

      await supabase.from('pdv_whatsapp_carts').update({ items }).eq('id', cart.id);
      const total = items.reduce((s, x) => s + x.quantity * x.unit_price, 0);
      return { ok: true, items, total: total.toFixed(2) };
    }
    if (name === 'view_cart') {
      const cart = await getOrCreateCart(supabase, conversation.phone, conversation.store_id);
      const items: any[] = Array.isArray(cart.items) ? cart.items : [];
      const total = items.reduce((s, x) => s + x.quantity * x.unit_price, 0);
      return { items, total: total.toFixed(2), customer_name: cart.customer_name, delivery_address: cart.delivery_address };
    }
    if (name === 'set_delivery') {
      return { error: 'Entrega indisponível no momento. Ofereça apenas RETIRADA na loja (set_pickup).' };
    }
    if (name === 'set_pickup') {
      const cart = await getOrCreateCart(supabase, conversation.phone, conversation.store_id);
      await supabase.from('pdv_whatsapp_carts').update({
        customer_name: args.customer_name,
        delivery_address: { type: 'pickup', pickup_time: args.pickup_time },
        payment_method: args.payment_method,
      }).eq('id', cart.id);
      return { ok: true, fulfillment: 'pickup', pickup_time: args.pickup_time };
    }
    if (name === 'checkout') {
      const cart = await getOrCreateCart(supabase, conversation.phone, conversation.store_id);
      const items: any[] = Array.isArray(cart.items) ? cart.items : [];
      if (!items.length) return { error: 'Carrinho vazio.' };
      if (!cart.customer_name || !cart.delivery_address) {
        return { error: 'Faltam dados. Chame set_delivery (entrega) ou set_pickup (retirada) antes.' };
      }

      const fulfillment = (cart.delivery_address as any)?.type === 'pickup' ? 'pickup' : 'delivery';
      const pickupTimeReq = fulfillment === 'pickup' ? (cart.delivery_address as any)?.pickup_time || null : null;

      // canal WhatsApp da loja
      const { data: channel } = await supabase.from('pdv_channels')
        .select('id').eq('store_id', conversation.store_id).eq('code', 'whatsapp').maybeSingle();
      if (!channel) return { error: 'Canal WhatsApp não configurado para esta loja.' };

      const subtotal = items.reduce((s, x) => s + x.quantity * x.unit_price, 0);
      const pickupCode = fulfillment === 'pickup'
        ? String(Math.floor(100 + Math.random() * 900))
        : null;

      const orderPayload: Record<string, unknown> = {
        store_id: conversation.store_id,
        channel_id: channel.id,
        status: 'pending_payment',
        order_type: fulfillment === 'pickup' ? 'takeout' : 'delivery',
        customer_name: cart.customer_name,
        customer_phone: conversation.phone,
        subtotal, total: subtotal,
        source_payload: {
          source: 'whatsapp',
          cart_id: cart.id,
          fulfillment,
          pickup_time_requested: pickupTimeReq,
        },
      };
      if (fulfillment === 'delivery') {
        orderPayload.delivery_address = cart.delivery_address;
      } else {
        orderPayload.pickup_code = pickupCode;
        orderPayload.notes = pickupTimeReq ? `Retirada solicitada: ${pickupTimeReq}` : 'Retirada na loja';
      }

      const { data: order, error: orderErr } = await supabase.from('pdv_orders')
        .insert(orderPayload).select().single();
      if (orderErr || !order) return { error: 'Falha ao criar pedido.', detail: orderErr };

      const orderItems = items.map((x) => ({
        order_id: order.id, menu_item_id: x.item_id, name: x.name,
        quantity: x.quantity, unit_price: x.unit_price, total: x.quantity * x.unit_price,
        notes: x.notes,
      }));
      await supabase.from('pdv_order_items').insert(orderItems);
      await supabase.from('pdv_whatsapp_carts').update({ pdv_order_id: order.id }).eq('id', cart.id);

      // chama edge function
      const linkResp = await fetch(`${SUPABASE_URL}/functions/v1/mercadopago-create-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ pdv_order_id: order.id }),
      });
      const linkData = await linkResp.json();
      if (!linkResp.ok) {
        return { error: 'Falha ao gerar link de pagamento.', detail: linkData };
      }

      return {
        ok: true,
        order_id: order.id,
        fulfillment,
        pickup_code: pickupCode,
        pickup_time: pickupTimeReq,
        total: subtotal.toFixed(2),
        payment_link: linkData.init_point,
      };
    }
    return { error: 'tool desconhecida' };
  } catch (e) {
    console.error('tool error', name, e);
    return { error: String(e) };
  }
}

const DEFAULT_SYSTEM_PROMPT = `Você é um atendente virtual de restaurante via WhatsApp. Seja simpático, breve e use português brasileiro informal.

REGRAS CRÍTICAS:
- NUNCA invente preços, descrições ou itens do cardápio. Sempre use search_menu antes de citar produto.
- NUNCA invente horários/endereços — use get_store_info.
- register_complaint SÓ pode ser chamada quando o cliente descreve claramente um PROBLEMA com um pedido (algo errado, faltando, frio, atrasado, cobrança indevida, comida estragada). NÃO chame para dúvida, informação, pergunta sobre vaga, sobre horário de retorno, ou qualquer coisa que não seja um problema real.
- Se o cliente perguntar quanto tempo o atendimento humano leva pra responder, ou pedir previsão de retorno, seja HONESTO: diga que o atendimento humano funciona no horário comercial da loja e você não tem como cravar um tempo exato. NÃO invente "algumas horas", "super rapidinho", nem diga que "registrou um chamado de prioridade". NÃO repita a mesma frase de encerramento duas vezes seguidas.
- Se o cliente insistir que tem pressa e você não pode resolver, ofereça: (a) o telefone da loja via get_store_info, (b) pedir pelo iFood se for pedido, ou (c) aguardar retorno humano no horário comercial. Não force nova pergunta educada de encerramento se ele já sinalizou incômodo.
- Pedidos pelo WhatsApp: SE get_store_info devolver sales_enabled=true, monte o pedido com add_to_cart, view_cart, depois chame set_pickup (nome, horário desejado, forma de pagamento) e checkout.
- ENTREGA está INDISPONÍVEL pelo WhatsApp — só RETIRADA na loja. Se o cliente pedir entrega, explique que ainda não temos entrega por aqui e oriente a pedir pelo iFood, OU seguir com retirada.
- Antes de checkout, confirme o pedido e tenha set_pickup já executado. Nunca peça endereço.
- Quando o checkout retornar payment_link, envie o link cru em uma linha, informe o total, o pickup_code e o horário combinado. Diga que o pedido vai pra cozinha assim que o pagamento for confirmado.
- Vagas/emprego/trabalhe conosco/currículo/candidatura: não colete dados no chat. Responda indicando exclusivamente este link: ${JOBS_URL}
- Se não souber a resposta, diga que não sabe e que vai passar pra equipe humana — sem inventar dado e sem prometer prazo.
- Mensagens curtas (no máx 3 linhas). Emojis com moderação. Não repita a mesma pergunta ("posso te ajudar com mais alguma coisa?") em turnos consecutivos.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!SERVICE_ROLE || token !== SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { conversation_id, message_id } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: conversation } = await supabase
      .from('whatsapp_customer_conversations').select('*').eq('id', conversation_id).maybeSingle();
    if (!conversation) return new Response(JSON.stringify({ error: 'conv not found' }), { status: 404, headers: corsHeaders });

    let targetMessage: any = null;
    if (message_id) {
      const { data } = await supabase
        .from('whatsapp_customer_messages')
        .select('id, content, created_at, ai_processing_started_at, ai_processed_at')
        .eq('id', message_id)
        .eq('conversation_id', conversation_id)
        .eq('role', 'user')
        .maybeSingle();
      targetMessage = data;
    } else {
      const { data } = await supabase
        .from('whatsapp_customer_messages')
        .select('id, content, created_at, ai_processing_started_at, ai_processed_at')
        .eq('conversation_id', conversation_id)
        .eq('role', 'user')
        .is('ai_processed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetMessage = data;
    }

    if (!targetMessage) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no pending user message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: lockRows, error: lockErr } = await supabase
      .from('whatsapp_customer_messages')
      .update({ ai_processing_started_at: new Date().toISOString() })
      .eq('id', targetMessage.id)
      .is('ai_processing_started_at', null)
      .is('ai_processed_at', null)
      .select('id');
    if (lockErr) throw lockErr;
    if (!lockRows?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already processing or processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let enabled = true;
    let salesEnabled = false;
    let offHoursMsg: string | null = null;
    if (conversation.store_id) {
      const { data: cfg } = await supabase.from('whatsapp_customer_config')
        .select('*').eq('store_id', conversation.store_id).maybeSingle();
      if (cfg) {
        if (cfg.system_prompt) systemPrompt = cfg.system_prompt;
        enabled = cfg.enabled !== false;
        salesEnabled = !!cfg.sales_enabled;
        offHoursMsg = cfg.off_hours_message || null;
      }
    }

    if (!enabled) {
      const msg = offHoursMsg || 'Olá! No momento o atendimento automático está desativado.';
      await sendWhatsApp(conversation.phone, msg);
      await supabase.from('whatsapp_customer_messages').insert({
        conversation_id, role: 'assistant', content: msg, reply_to_message_id: targetMessage.id,
      });
      await supabase.from('whatsapp_customer_messages')
        .update({ ai_processed_at: new Date().toISOString() })
        .eq('id', targetMessage.id);
      return new Response(JSON.stringify({ ok: true, disabled: true }), { headers: corsHeaders });
    }

    if (isJobQuestion(targetMessage.content || '')) {
      const msg = jobsReply();
      await sendWhatsApp(conversation.phone, msg);
      await supabase.from('whatsapp_customer_messages').insert({
        conversation_id, role: 'assistant', content: msg, reply_to_message_id: targetMessage.id,
      });
      await supabase.from('whatsapp_customer_messages')
        .update({ ai_processed_at: new Date().toISOString() })
        .eq('id', targetMessage.id);
      return new Response(JSON.stringify({ ok: true, jobs: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: history } = await supabase
      .from('whatsapp_customer_messages')
      .select('role, content, tool_name, tool_args, tool_result')
      .eq('conversation_id', conversation_id)
      .lte('created_at', targetMessage.created_at)
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

    let finalText: string | null = null;
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: msgs, tools, tool_choice: 'auto' }),
      });
      if (!aiResp.ok) {
        console.error('AI gateway error', aiResp.status, await aiResp.text());
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
          const result = await runTool(name, args, { supabase, conversation, salesEnabled });
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
      conversation_id, role: 'assistant', content: finalText, reply_to_message_id: targetMessage.id,
    });
    await supabase.from('whatsapp_customer_messages')
      .update({ ai_processed_at: new Date().toISOString() })
      .eq('id', targetMessage.id);

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
