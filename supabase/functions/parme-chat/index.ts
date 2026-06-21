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
- Responda como em um chat de WhatsApp: mensagens CURTAS, em vários balõezinhos.
- NUNCA escreva um bloco único grande de texto. Quebre em 2 a 4 mensagens curtas, separadas por uma linha em branco (\\n\\n).
- Cada balão deve ter no máximo 1–2 frases.
- Se precisar pedir várias informações, peça uma de cada vez.
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

Problemas com iFood:
- Sempre peça nº do pedido (EXATAMENTE 4 dígitos numéricos) e WhatsApp — em mensagens separadas.
- Se o cliente JÁ informou o WhatsApp em algum momento da conversa, NÃO peça de novo.

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
    const messages = parsed.data as unknown as UIMessage[];

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response("Missing LOVABLE_API_KEY", {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Persistência imediata (pré-stream) para não perder o turno se a aba fechar.
    // Só grava no CRM a partir da 2ª interação do usuário com a Giana.
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    if (sessionId && userMsgCount >= 2) {
      try {
        const supabase = sb();
        const now = new Date().toISOString();
        const { data: existing } = await supabase
          .from("chat_conversations")
          .select("client_meta, messages")
          .eq("session_id", sessionId)
          .maybeSingle();
        const existingMessages = Array.isArray(
            (existing as { messages?: unknown } | null)?.messages,
          )
          ? (existing as { messages: Array<Record<string, unknown>> }).messages
          : [];
        const tsById = new Map<string, string>();
        for (const e of existingMessages) {
          const id = typeof e?.id === "string" ? e.id : "";
          const ts = typeof e?.ts === "string" ? e.ts : "";
          if (id && ts) tsById.set(id, ts);
        }
        const flatNow = messages.map((m) => {
          const parts = (m.parts ?? []) as Array<{ type: string; text?: string }>;
          const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "")
            .join("");
          const toolParts = parts.filter((p) => p.type.startsWith("tool-"));
          return {
            id: m.id,
            role: m.role,
            content: text,
            tools: toolParts,
            ts: tsById.get(m.id) ?? now,
          };
        });
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
        console.warn("[parme-chat] pre-stream upsert err:", e);
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
        description: "Registra um problema com um pedido do cliente.",
        inputSchema: z.object({
          numero_pedido: z.string().regex(/^\d{4}$/).optional(),
          descricao: z.string().min(5).max(1000),
          contato: z.string().regex(
            /^\+?55?[\s\-]?\(?\d{2}\)?[\s\-]?9?\d{4}[\s\-]?\d{4}$/,
          ),
        }),
        execute: async ({ numero_pedido, descricao, contato }) => {
          const supabase = sb();
          const { data: row, error } = await supabase
            .from("support_tickets")
            .insert({
              order_number: numero_pedido ?? null,
              description: descricao,
              contact: contato,
            })
            .select("id")
            .single();
          if (error || !row) {
            return { sucesso: false, erro: "Não foi possível concluir a operação." };
          }
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
        const finalUserCount = finalMessages.filter((m) => m.role === "user").length;
        if (finalUserCount < 2) return;
        try {
          const supabase = sb();
          const now = new Date().toISOString();
          const { data: existing } = await supabase
            .from("chat_conversations")
            .select("messages")
            .eq("session_id", sessionId)
            .maybeSingle();
          const existingMessages = Array.isArray(
              (existing as { messages?: unknown } | null)?.messages,
            )
            ? (existing as { messages: Array<Record<string, unknown>> }).messages
            : [];
          const tsById = new Map<string, string>();
          for (const e of existingMessages) {
            const id = typeof e?.id === "string" ? e.id : "";
            const ts = typeof e?.ts === "string" ? e.ts : "";
            if (id && ts) tsById.set(id, ts);
          }
          const flat = finalMessages.map((m) => {
            const parts = (m.parts ?? []) as Array<{ type: string; text?: string }>;
            const text = parts.filter((p) => p.type === "text").map((p) =>
              p.text ?? ""
            ).join("");
            const toolParts = parts.filter((p) => p.type.startsWith("tool-"));
            return {
              id: m.id,
              role: m.role,
              content: text,
              tools: toolParts,
              ts: tsById.get(m.id) ?? now,
            };
          });
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
          console.error("[parme-chat] onFinish persist err:", e);
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
