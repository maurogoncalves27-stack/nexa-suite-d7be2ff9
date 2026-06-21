// Edge function: streaming chat IA "Giana" (Aquela Parmê)
// Port da rota TanStack `src/routes/api.chat.ts` (Parmê) → Supabase Edge Function.
// Usa Lovable AI Gateway via AI SDK + 5 tools (cardápio, recomendação, reserva,
// problema de pedido, sugerir iFood). Persiste em chat_conversations e dispara
// WhatsApp via Z-API Cliente quando há reserva.

import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "npm:ai@5";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1";
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MENU = {
  "aquela-parme": {
    name: "Aquela Parmê",
    descricao:
      "Filé bovino empanado com molho da casa, muçarela derretida, arroz e batata frita.",
    slogan: "Cremoso de verdade",
  },
  "aquele-estrogonofe": {
    name: "Aquele Estrogonofe",
    descricao: "Estrogonofe de filé mignon, arroz e muita batata palha.",
    slogan: "O barulhinho da crocância",
  },
  "box-caipira": {
    name: "Box Caipira",
    descricao:
      "Arroz, feijão, lombo empanado, couve, farofa e banana. Tudo na caixinha.",
    slogan: "Tempero da roça",
  },
} as const;

const SYSTEM = `Você é a Giana, atendente virtual do Aquela Parmê, um restaurante brasileiro especializado em parmegiana, estrogonofe e cozinha caipira.
Tom: caloroso, cordial, breve, com sotaque carioca/mineiro leve. Sempre em português.
Data atual de referência: ${
  new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}.

REGRA DE OURO — NOME DO CLIENTE:
- LOGO na primeira interação, antes de qualquer outra coisa, pergunte o nome da pessoa de forma simpática (ex.: "Oi! Aqui é a Giana 😊 Como posso te chamar?").
- Assim que souber o nome, trate a pessoa pelo nome ao longo de TODA a conversa, com naturalidade.
- Só siga para dúvida/recomendação/reserva depois que tiver o nome.

ESTILO DE RESPOSTA (MUITO IMPORTANTE):
- Responda como em um chat de WhatsApp: mensagens CURTAS.
- Prefira UMA mensagem só. Só quebre em 2 mensagens curtas (separadas por \n\n) se realmente precisar separar uma pergunta de uma informação.
- NUNCA escreva um bloco único grande de texto, mas também NÃO envie vários balõezinhos seguidos.
- Use emojis com moderação (😉🍝🙏) para soar mais humana.

O que você faz:
- Tira dúvidas sobre o cardápio e a marca (use consultar_cardapio).
- Recomenda pratos (use recomendar_prato).
- Faz reservas de mesa pelo chat (use criar_reserva). Antes de reservar, confirme nome, telefone, data, horário e quantidade de pessoas.
- Registra problemas com pedidos, inclusive iFood (use registrar_problema_pedido).
- Sugere o link do iFood da unidade MAIS PRÓXIMA (use sugerir_ifood).

DELIVERY / IFOOD (FLUXO CURTO — não enrole o cliente):
- Quando a pessoa quiser pedir, pergunte 2 coisas só, separadas e em mensagens curtas:
  1) "Em qual bairro/região você está?"
  2) "Vai querer Parmê 🍝, Box Caipira 🍱 ou Estrogonofe 🥩?"
- Com isso, chame sugerir_ifood passando o bairro e a marca.
- NÃO peça CEP, endereço completo ou outras infos. Só bairro + marca.

DATAS E HORÁRIOS NA RESERVA:
- NUNCA exija formato específico do cliente. Deixe a pessoa falar do jeito dela.
- VOCÊ converte internamente para AAAA-MM-DD e HH:MM (24h) ao chamar criar_reserva, usando a data atual de referência.

Problemas com iFood / reclamações:
- Sempre que o cliente reportar um problema com pedido (item faltando, errado, atrasado, frio, etc.) você DEVE chamar registrar_problema_pedido — mesmo que ele ainda não tenha dado todos os dados.
- Peça o nº do pedido (geralmente 4 dígitos, mas aceite o que ele mandar) e o WhatsApp em mensagens separadas. Se ele não souber o nº, registre assim mesmo.
- Se o cliente JÁ informou o WhatsApp antes, NÃO peça de novo — use o que ele já passou.
- NUNCA diga "registrei no sistema" sem ter de fato chamado o tool registrar_problema_pedido. Se faltar dado obrigatório, peça antes; só confirme o registro depois que o tool retornar sucesso=true.

DESPEDIDA (MUITO IMPORTANTE — não atropele o cliente):
- NUNCA se despeça depois de só responder uma dúvida ou mandar um link. Deixe a pessoa pensar e responder no tempo dela.
- Depois de ajudar, pergunte de forma leve se ela precisa de mais alguma coisa (ex.: "Posso ajudar em mais alguma coisa? 😊") e ESPERE a resposta.
- Só se despeça quando: (a) o cliente disser claramente que não precisa de mais nada / vai pedir / "valeu" / "tchau" / "obrigado, só isso", OU (b) o cliente ficou em silêncio depois de você ter perguntado se precisava de mais algo (sem novas mensagens dele).
- Na despedida, agradeça pelo nome, deseje uma boa refeição e, SÓ se ainda não tiver o WhatsApp, peça uma única vez de forma simpática (prometendo não perturbar). Sem repetir despedidas.

Nunca invente preços, prazos ou itens fora do informado.`;

const reservaSchema = z.object({
  nome: z.string().min(2).max(120),
  telefone: z.string().min(8).max(20),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horario: z.string().regex(/^\d{2}:\d{2}$/),
  pessoas: z.number().int().min(1).max(30),
  observacao: z.string().max(500).optional(),
});

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

type FlatChatMessage = {
  id: string;
  role: string;
  content: string;
  tools: unknown[];
  ts: string;
};

function textFromUIMessage(m: UIMessage) {
  const parts = (m.parts ?? []) as Array<{ type?: string; text?: string }>;
  return parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
}

function flattenUIMessages(messages: UIMessage[], now: string, tsById = new Map<string, string>()) {
  return messages.map((m, index) => {
    const parts = (m.parts ?? []) as Array<{ type?: string; text?: string }>;
    const toolParts = parts.filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"));
    const fallbackId = `${m.role}_${index}_${textFromUIMessage(m).slice(0, 40)}`;
    const id = typeof m.id === "string" && m.id ? m.id : fallbackId;
    return {
      id,
      role: String(m.role),
      content: textFromUIMessage(m),
      tools: toolParts,
      ts: tsById.get(id) ?? now,
    } satisfies FlatChatMessage;
  });
}

function existingFlatMessages(raw: unknown) {
  if (!Array.isArray(raw)) return [] as FlatChatMessage[];
  return raw.map((m, index) => {
    const row = (m ?? {}) as Record<string, unknown>;
    return {
      id: typeof row.id === "string" && row.id ? row.id : `stored_${index}`,
      role: typeof row.role === "string" ? row.role : "user",
      content: typeof row.content === "string"
        ? row.content
        : typeof row.message === "string"
        ? row.message
        : typeof row.text === "string"
        ? row.text
        : "",
      tools: Array.isArray(row.tools) ? row.tools : [],
      ts: typeof row.ts === "string" ? row.ts : new Date().toISOString(),
    } satisfies FlatChatMessage;
  });
}

function mergeFlatMessages(existing: FlatChatMessage[], incoming: FlatChatMessage[]) {
  const merged: FlatChatMessage[] = [];
  const indexByKey = new Map<string, number>();
  const keyFor = (m: FlatChatMessage) => m.id || `${m.role}:${m.content}:${m.ts}`;
  for (const msg of [...existing, ...incoming]) {
    const key = keyFor(msg);
    const found = indexByKey.get(key);
    if (found === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(msg);
    } else {
      merged[found] = { ...merged[found], ...msg, ts: merged[found].ts || msg.ts };
    }
  }
  return merged;
}

function flatToUIMessages(flat: FlatChatMessage[]) {
  return flat.map((m) => ({
    id: m.id,
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    parts: [{ type: "text", text: m.content }],
  })) as unknown as UIMessage[];
}

function clientMessageCount(messages: FlatChatMessage[]) {
  return messages.filter((m) => {
    const role = String(m.role || "user").toLowerCase();
    return !["assistant", "ai", "bot", "system", "model", "tool"].includes(role) &&
      String(m.content || "").trim().length > 0;
  }).length;
}

async function ensureComplaintTicket(
  supabase: ReturnType<typeof sb>,
  flat: FlatChatMessage[],
  sessionId: string,
) {
  const userTexts = flat
    .filter((m) => String(m.role).toLowerCase() === "user")
    .map((m) => String(m.content || "").trim())
    .filter(Boolean)
    .join("\n");
  const COMPLAINT_RE =
    /\b(n[ãa]o\s+veio|faltou|faltando|errad[oa]|fri[oa]|atras(?:ou|ado|o)|demor(?:ou|ado)|reclama[cç][ãa]o|reclamar|cobran[cç]a|p[ée]ssim[oa]|horr[ií]vel|estragad[oa]|queim(?:ado|a)|cru|sem\s+sabor|sumiu|esqueceram|n[ãa]o\s+chegou|veio\s+errad)/i;
  if (!COMPLAINT_RE.test(userTexts)) return;

  const fullText = flat.map((m) => String(m.content || "")).join("\n");
  const explicitOrder = fullText.match(/(?:pedido\s*#?\s*|n[uú]mero\s*(?:do\s+pedido)?\s*[:#]?\s*)(\d{2,10})/i);
  const looseOrder = fullText.match(/(?:^|\D)(\d{3,6})(?:\D|$)/);
  const phoneMatch = userTexts.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/);
  const numeroPedido = explicitOrder?.[1] ?? looseOrder?.[1] ?? null;
  const contato = phoneMatch ? phoneMatch[0].replace(/\D/g, "") : null;
  const descricao = `Conversa ${sessionId}:\n${userTexts.slice(-900) || "Reclamação detectada na conversa."}`;

  const { data: bySession } = await supabase
    .from("support_tickets")
    .select("id, order_number, contact")
    .ilike("description", `%${sessionId}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySession?.id) {
    // Já existe ticket: pode atualizar com novos dados (mesmo sem contato novo).
    await supabase.from("support_tickets").update({
      order_number: bySession.order_number ?? numeroPedido,
      contact: bySession.contact && bySession.contact !== "não informado"
        ? bySession.contact
        : (contato ?? bySession.contact),
      description: descricao,
    }).eq("id", bySession.id);
    return;
  }

  // Sem contato do cliente NÃO cria ticket — fica só como conversa.
  if (!contato) {
    console.log("[parme-chat safety-net] sem contato — conversa preservada, ticket NÃO criado:", sessionId);
    return;
  }

  const { error } = await supabase.from("support_tickets").insert({
    order_number: numeroPedido,
    description: descricao,
    contact: contato,
  });
  if (error) console.error("[parme-chat safety-net] ticket err:", error);
  else console.log("[parme-chat safety-net] ticket garantido para sessão:", sessionId);
}

async function notifyStoreReservation(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  pessoas: number,
  observacao: string | undefined,
) {
  try {
    const supabase = sb();
    const { data: cfgRow } = await supabase
      .from("parme_site_settings")
      .select("value")
      .eq("key", "reservations")
      .maybeSingle();
    const cfg = (cfgRow?.value ?? {}) as {
      whatsappStorePhone?: string;
      notifyEnabled?: boolean;
    };
    if (cfg.notifyEnabled === false || !cfg.whatsappStorePhone) return;

    const instance = Deno.env.get("ZAPI_CUSTOMER_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_CUSTOMER_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CUSTOMER_CLIENT_TOKEN");
    if (!instance || !token || !clientToken) return;

    const dateBR = new Date(data + "T00:00").toLocaleDateString("pt-BR");
    const msg =
      `🍽️ *Nova reserva (via chat)*\n\n` +
      `👤 ${nome}\n📞 ${telefone}\n📅 ${dateBR} às ${horario}\n` +
      `👥 ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}\n` +
      (observacao ? `📝 ${observacao}\n` : "") +
      `\nConfirme com o cliente.`;

    const phone = cfg.whatsappStorePhone.replace(/\D/g, "");
    await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": clientToken,
        },
        body: JSON.stringify({ phone, message: msg }),
      },
    );
  } catch (e) {
    console.warn("[parme-chat] store notify err:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null) as {
      messages?: unknown;
      sessionId?: unknown;
      clientMeta?: unknown;
    } | null;

    const msgsSchema = z.array(
      z.object({
        id: z.string().max(200).optional(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(
          z.object({ type: z.string().max(40), text: z.string().max(8000).optional() })
            .passthrough(),
        ).max(50),
      }).passthrough(),
    ).min(1).max(100);
    const parsed = msgsSchema.safeParse(body?.messages);
    if (!parsed.success) {
      return new Response("Invalid messages payload", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const sessionIdParsed = z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/)
      .safeParse(body?.sessionId);
    const sessionId = sessionIdParsed.success ? sessionIdParsed.data : null;

    const totalChars = parsed.data.reduce(
      (n, m) => n + m.parts.reduce((a, p) => a + (p.text?.length ?? 0), 0),
      0,
    );
    if (totalChars > 20000) {
      return new Response("Payload too large", { status: 413, headers: corsHeaders });
    }
    let messages = parsed.data as unknown as UIMessage[];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response("Missing LOVABLE_API_KEY", {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Persistência imediata (pré-stream) para não perder o turno se a aba fechar.
    // Faz merge com o histórico salvo: se o cliente volta/recarrega a página, a UI pode
    // enviar só a mensagem nova, mas a conversa inteira continua sendo preservada.
    if (sessionId) {
      try {
        const supabase = sb();
        const now = new Date().toISOString();
        const { data: existing } = await supabase
          .from("chat_conversations")
          .select("client_meta, messages")
          .eq("session_id", sessionId)
          .maybeSingle();
        const existingMessages = existingFlatMessages((existing as { messages?: unknown } | null)?.messages);
        const tsById = new Map<string, string>();
        for (const e of existingMessages) {
          const id = e.id;
          const ts = e.ts;
          if (id && ts) tsById.set(id, ts);
        }
        const flatNow = mergeFlatMessages(existingMessages, flattenUIMessages(messages, now, tsById));
        if (flatNow.length > messages.length) messages = flatToUIMessages(flatNow);
        const userMsgCount = clientMessageCount(flatNow);
        if (userMsgCount < 2) {
          console.log("[parme-chat] conversa ainda oculta no CRM: menos de 2 entradas do cliente", { sessionId, userMsgCount });
        }
        const finalClientMeta =
          (existing as { client_meta?: unknown } | null)?.client_meta ??
            (body?.clientMeta ?? null);
        await supabase.from("chat_conversations").upsert(
          {
            session_id: sessionId,
            messages: flatNow as unknown as never,
            message_count: flatNow.length,
            last_message_at: now,
            updated_at: now,
            client_meta: finalClientMeta as unknown as never,
          },
          { onConflict: "session_id" },
        );
      } catch (e) {
        console.warn("[parme-chat] pre-stream conversa upsert err:", e);
      }
      // Ticket é independente: se falhar, a conversa já está salva.
      try {
        const supabase = sb();
        const { data: cur } = await supabase
          .from("chat_conversations")
          .select("messages")
          .eq("session_id", sessionId)
          .maybeSingle();
        const flatNow = existingFlatMessages((cur as { messages?: unknown } | null)?.messages);
        if (flatNow.length) await ensureComplaintTicket(supabase, flatNow, sessionId);
      } catch (e) {
        console.warn("[parme-chat] pre-stream ticket err:", e);
      }
    }

    const provider = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    const model = provider("google/gemini-3-flash-preview");

    const tools = {
      consultar_cardapio: tool({
        description: "Lista os pratos do cardápio do Aquela Parmê e suas descrições.",
        inputSchema: z.object({
          prato: z.enum([
            "aquela-parme",
            "aquele-estrogonofe",
            "box-caipira",
            "todos",
          ]).default("todos"),
        }),
        execute: ({ prato }) => {
          if (prato === "todos") return MENU;
          return { [prato]: MENU[prato as keyof typeof MENU] };
        },
      }),
      recomendar_prato: tool({
        description: "Recomenda um prato com base no gosto do cliente.",
        inputSchema: z.object({ preferencia: z.string().min(2).max(300) }),
        execute: ({ preferencia }) => {
          const p = preferencia.toLowerCase();
          if (p.includes("cremos") || p.includes("queijo") || p.includes("parm")) {
            return { recomendado: MENU["aquela-parme"] };
          }
          if (p.includes("estrog") || p.includes("mignon") || p.includes("cogumelo")) {
            return { recomendado: MENU["aquele-estrogonofe"] };
          }
          if (
            p.includes("caipir") || p.includes("feijão") ||
            p.includes("roça") || p.includes("levar")
          ) {
            return { recomendado: MENU["box-caipira"] };
          }
          return { recomendado: MENU["aquela-parme"], motivo: "Carro-chefe da casa." };
        },
      }),
      criar_reserva: tool({
        description: "Cria uma reserva de mesa após confirmar dados com o cliente.",
        inputSchema: reservaSchema,
        execute: async ({ nome, telefone, data, horario, pessoas, observacao }) => {
          const supabase = sb();
          const { data: row, error } = await supabase
            .from("reservations")
            .insert({
              name: nome,
              phone: telefone,
              reservation_date: data,
              reservation_time: horario,
              party_size: pessoas,
              notes: observacao ?? null,
            })
            .select("id, status")
            .single();
          if (error || !row) {
            console.error("[parme-chat] reserva err:", error);
            return { sucesso: false, erro: "Não foi possível concluir a operação." };
          }
          notifyStoreReservation(nome, telefone, data, horario, pessoas, observacao);
          return {
            sucesso: true,
            id: row.id,
            status: row.status,
            mensagem: "Reserva registrada. Aguarde confirmação por telefone.",
          };
        },
      }),
      registrar_problema_pedido: tool({
        description: "Registra um problema/reclamação de pedido. EXIGE telefone/contato do cliente — sem contato NÃO é possível registrar (peça antes de chamar).",
        inputSchema: z.object({
          numero_pedido: z.string().min(2).max(20).optional(),
          descricao: z.string().min(3).max(1000),
          contato: z.string().min(8).max(30),
        }),
        execute: async ({ numero_pedido, descricao, contato }) => {
          const contatoLimpo = (contato ?? "").replace(/\D/g, "");
          if (contatoLimpo.length < 8) {
            return {
              sucesso: false,
              erro: "contato_obrigatorio",
              mensagem: "Preciso do seu telefone com DDD antes de abrir o chamado — sem contato não conseguimos retornar.",
            };
          }
          const supabase = sb();
          const descricaoFinal = sessionId ? `Conversa ${sessionId}:\n${descricao}` : descricao;
          if (sessionId) {
            const { data: existing } = await supabase
              .from("support_tickets")
              .select("id, order_number, contact")
              .ilike("description", `%${sessionId}%`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing?.id) {
              const { error } = await supabase
                .from("support_tickets")
                .update({
                  order_number: existing.order_number ?? numero_pedido ?? null,
                  description: descricaoFinal,
                  contact: existing.contact && existing.contact !== "não informado"
                    ? existing.contact
                    : contatoLimpo,
                })
                .eq("id", existing.id);
              if (error) {
                console.error("[registrar_problema_pedido] update erro:", error);
                return { sucesso: false, erro: "Não foi possível concluir a operação." };
              }
              console.log("[registrar_problema_pedido] ticket atualizado:", existing.id);
              return {
                sucesso: true,
                id: existing.id,
                mensagem: "Problema registrado. Vamos entrar em contato.",
              };
            }
          }
          const { data: row, error } = await supabase
            .from("support_tickets")
            .insert({
              order_number: numero_pedido ?? null,
              description: descricaoFinal,
              contact: contatoLimpo,
            })
            .select("id")
            .single();
          if (error || !row) {
            console.error("[registrar_problema_pedido] erro:", error);
            return { sucesso: false, erro: "Não foi possível concluir a operação." };
          }
          console.log("[registrar_problema_pedido] ticket criado:", row.id);
          return {
            sucesso: true,
            id: row.id,
            mensagem: "Problema registrado. Vamos entrar em contato.",
          };
        },
      }),
      sugerir_ifood: tool({
        description:
          "Dado o bairro/região e a marca, escolhe a unidade mais próxima e devolve o link do iFood.",
        inputSchema: z.object({
          bairro: z.string().min(2).max(120),
          marca: z.enum(["parme", "box", "estrogonofe"]),
        }),
        execute: async ({ bairro, marca }) => {
          const supabase = sb();
          const { data: row } = await supabase
            .from("parme_site_settings")
            .select("value")
            .eq("key", "reservations")
            .maybeSingle();
          const cfg = (row?.value ?? {}) as {
            ifood?: Record<string, Record<string, string | undefined>>;
          };
          const DEFAULT_IFOOD: Record<string, Record<string, string>> = {
            "asa-sul": {
              parme: "https://www.ifood.com.br/delivery/brasilia-df/aquela-parme----asa-sul---a-melhor-parmegiana-asa-sul/949947fa-9d20-407b-abaa-a8980dcbc5ac",
              estrogonofe: "https://www.ifood.com.br/delivery/brasilia-df/aquele-estrogonofe---asa-sul---o-melhor-strogonoff-asa-sul/92943906-ec3d-4057-8d84-2a935e0f35da",
              box: "https://www.ifood.com.br/delivery/brasilia-df/box-caipira---asa-sul-shcs/8749a8eb-7240-4123-8e99-39903af393da",
            },
            "asa-norte": {
              parme: "https://www.ifood.com.br/delivery/brasilia-df/aquela-parme---asa-norte---a-melhor-parmegiana-asa-norte/1f7fc2a0-ad9b-4cff-9445-5c9c0026e6ed",
              estrogonofe: "https://www.ifood.com.br/delivery/brasilia-df/aquele-estrogonofe---asa-norte---o-melhor-strogonoff-asa-norte/23d4f0c2-6b57-495e-a792-7564b410372e",
              box: "https://www.ifood.com.br/delivery/brasilia-df/box-caipira---asa-norte-asa-norte/cb90c580-4052-4801-8b8d-4f6ae5e6154e",
            },
            "aguas-claras": {
              parme: "https://www.ifood.com.br/delivery/brasilia-df/aquela-parme---aguas-claras---a-melhor-parmegiana-norte-aguas-claras/0d36b7dd-ec47-42c2-aab9-de0782703e1c",
              estrogonofe: "https://www.ifood.com.br/delivery/brasilia-df/aquele-estrogonofe---aguas-claras---o-melhor-strogonoff-norte-aguas-claras/a60e08bd-d09d-4fb5-a026-e8973a0a7189",
              box: "https://www.ifood.com.br/delivery/brasilia-df/box-caipira---aguas-claras-norte-aguas-claras/4388b35f-8418-4688-91e1-4f28e9873b10",
            },
            "lago-sul": {
              parme: "https://www.ifood.com.br/delivery/brasilia-df/aquela-parme---lago-sul---a-melhor-parmegiana-setor-de-mansoes-dom-bosco-lago-sul/0fb5116a-8a4e-4844-bffb-f5a5a041527b",
              estrogonofe: "https://www.ifood.com.br/delivery/brasilia-df/aquele-estrogonofe---lago-sul---o-melhor-strogonoff-setor-de-mansoes-dom-bosco-lago-sul/a1c7ba50-bc4e-4347-b7a6-3dcec244d12c",
              box: "https://www.ifood.com.br/delivery/brasilia-df/box-caipira---lago-sul-setor-de-mansoes-dom-bosco-lago-sul/c5bd1705-9f0e-4a6d-85c7-a8b97e4b3416",
            },
          };
          const dbIfood = cfg.ifood ?? {};
          const ifood: Record<string, Record<string, string | undefined>> = {};
          for (const u of Object.keys(DEFAULT_IFOOD)) {
            ifood[u] = { ...DEFAULT_IFOOD[u], ...(dbIfood[u] ?? {}) };
          }

          const norm = bairro.toLowerCase().normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

          type UnitKey = "asa-norte" | "asa-sul" | "lago-sul" | "aguas-claras";
          const RULES: Array<{ unit: UnitKey; match: string[] }> = [
            {
              unit: "asa-norte",
              match: [
                "asa norte",
                "noroeste",
                "cruzeiro novo",
                "sudoeste",
                "octogonal",
                "varjao",
                "lago norte",
                "granja do torto",
                "vila planalto",
                "setor militar",
              ],
            },
            {
              unit: "asa-sul",
              match: [
                "asa sul",
                "cruzeiro velho",
                "cruzeiro",
                "guara",
                "setor de industria",
                "setor policial",
                "candangolandia",
                "nucleo bandeirante",
                "park sul",
                "park way",
                "park-way",
                "zoologico",
              ],
            },
            {
              unit: "lago-sul",
              match: [
                "lago sul",
                "jardim botanico",
                "sao sebastiao",
                "itapoa",
                "paranoa",
                "smdb",
                "qi ",
              ],
            },
            {
              unit: "aguas-claras",
              match: [
                "aguas claras",
                "taguatinga",
                "vicente pires",
                "arniqueiras",
                "ceilandia",
                "samambaia",
                "riacho fundo",
                "recanto",
                "gama",
                "santa maria",
              ],
            },
          ];

          let unit: UnitKey | null = null;
          for (const r of RULES) {
            if (r.match.some((kw) => norm.includes(kw))) {
              unit = r.unit;
              break;
            }
          }
          const labels: Record<UnitKey, string> = {
            "asa-norte": "Asa Norte",
            "asa-sul": "Asa Sul",
            "lago-sul": "Lago Sul",
            "aguas-claras": "Águas Claras",
          };
          const brandLabels = {
            parme: "Aquela Parmê",
            box: "Box Caipira",
            estrogonofe: "Aquele Estrogonofe",
          } as const;

          if (!unit) {
            return {
              sucesso: false,
              motivo: "bairro_nao_mapeado",
              bairro_recebido: bairro,
              unidades_disponiveis: (Object.keys(ifood) as UnitKey[])
                .filter((u) => ifood[u]?.[marca])
                .map((u) => labels[u]),
            };
          }
          const link = ifood[unit]?.[marca];
          if (!link) {
            const fallbackUnit = (Object.keys(ifood) as UnitKey[]).find((u) =>
              ifood[u]?.[marca]
            );
            if (fallbackUnit) {
              return {
                sucesso: true,
                unidade: labels[fallbackUnit],
                marca: brandLabels[marca],
                link: ifood[fallbackUnit]![marca],
                aviso:
                  `A unidade ${labels[unit]} ainda não tem ${
                    brandLabels[marca]
                  } no iFood. A mais próxima é ${labels[fallbackUnit]}.`,
              };
            }
            return {
              sucesso: false,
              motivo: "marca_nao_disponivel",
              unidade_sugerida: labels[unit],
              marca: brandLabels[marca],
            };
          }
          return {
            sucesso: true,
            unidade: labels[unit],
            marca: brandLabels[marca],
            link,
          };
        },
      }),
    };

    // Prompt custom do banco (editável pelo admin), com fallback.
    let systemPrompt = SYSTEM;
    try {
      const supabase = sb();
      const { data: row } = await supabase
        .from("parme_site_settings")
        .select("value")
        .eq("key", "agent")
        .maybeSingle();
      const custom = (row?.value as { systemPrompt?: string } | null)?.systemPrompt;
      if (custom && custom.trim().length > 0) systemPrompt = custom;
    } catch { /* keep default */ }

    // Regras críticas não-sobrescrevíveis (sempre acrescentadas ao final).
    systemPrompt += `

REGRAS CRÍTICAS DO SISTEMA (NÃO SOBRESCREVÍVEIS):
- Se o cliente reportar QUALQUER problema com pedido (faltou item, veio errado, frio, atrasado, cobrança, qualidade, "não veio a coca", etc.) você DEVE registrar via registrar_problema_pedido — MAS só após ter o TELEFONE do cliente. Sem contato, NÃO chame o tool: peça o telefone com DDD primeiro ("Pra abrir o chamado e te retornar, qual seu telefone com DDD?"). Sem telefone, não há ticket, fica só a conversa.
- NUNCA diga "registrei", "anotei no sistema", "passei pra equipe" sem que a ferramenta registrar_problema_pedido tenha sido executada com sucesso=true naquele turno.
- Se a ferramenta retornar sucesso=false, diga claramente que houve falha técnica e que vai tentar de novo.
- Para reservas, SEMPRE chamar criar_reserva quando tiver nome+telefone+data+horário+quantidade.
- Se o cliente JÁ informou telefone/contato em QUALQUER mensagem anterior da conversa (mesmo no meio do texto, ex: "meu fone é 61 99999-9999"), NÃO peça telefone de novo. Use o que ele já deu e passe como "contato" para registrar_problema_pedido.
- Ao encerrar um atendimento de problema, NÃO peça telefone se ele já apareceu na conversa. Apenas confirme o registro.`;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
    });


    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: corsHeaders,
      onFinish: async ({ messages: finalMessages }) => {
        if (!sessionId) return;
        let flat: ReturnType<typeof mergeFlatMessages> = [];
        // 1) Persistir conversa SEMPRE — independente de qualquer falha de ticket.
        try {
          const supabase = sb();
          const now = new Date().toISOString();
          const { data: existing } = await supabase
            .from("chat_conversations")
            .select("messages")
            .eq("session_id", sessionId)
            .maybeSingle();
          const existingMessages = existingFlatMessages((existing as { messages?: unknown } | null)?.messages);
          const tsById = new Map<string, string>();
          for (const e of existingMessages) {
            if (e.id && e.ts) tsById.set(e.id, e.ts);
          }
          flat = mergeFlatMessages(existingMessages, flattenUIMessages(finalMessages, now, tsById));
          await supabase.from("chat_conversations").upsert(
            {
              session_id: sessionId,
              messages: flat as unknown as never,
              message_count: flat.length,
              last_message_at: now,
              updated_at: now,
            },
            { onConflict: "session_id" },
          );
        } catch (e) {
          console.error("[parme-chat] onFinish conversa upsert err:", e);
        }
        // 2) Ticket é independente: falhas aqui NÃO afetam a conversa.
        try {
          if (flat.length) await ensureComplaintTicket(sb(), flat, sessionId);
        } catch (e) {
          console.error("[parme-chat] onFinish ticket err:", e);
        }
      },
    });

  } catch (e) {
    console.error("[parme-chat] fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
