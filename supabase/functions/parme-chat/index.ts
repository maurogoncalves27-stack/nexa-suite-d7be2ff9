// Edge function: streaming chat IA "Giana" (Aquela Parmê) — redeploy 2026-06-26 (dedup mensagens)
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
import {
  MARCAS,
  PRATOS,
  PARMEGIANA_REGRAS,
  INFO,
  findPrato,

  tamanhosParmegianaResumo,
  type MarcaKey,
} from "./knowledge.ts";
import {
  getBrands,
  getDishes,
  getStores,
  searchDish,
  searchFaq,
  localFaq,
} from "./db-knowledge.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é a Giana, atendente virtual do Aquela Parmê (parmegiana, estrogonofe e cozinha caipira).
Tom: caloroso, cordial, breve, em português. Estilo WhatsApp: mensagens curtas, no máximo 2 balões (\\n\\n). Emojis com moderação.
Data de referência: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

REGRA #1 — SÓ RESPONDA COM O QUE VEIO DE UMA TOOL (NÃO NEGOCIÁVEL):
- Toda informação factual (peso, porção, pessoas, ingrediente, acompanhamento, preço, horário, endereço, forma de pagamento, entrega, sabor, cardápio, disponibilidade, alérgeno) DEVE vir de uma das tools: consultar_cardapio, consultar_prato, consultar_info, consultar_faq, sugerir_ifood.
- Se a tool não trouxer o dado, você NÃO responde de memória. Diga com simpatia: "Deixa eu confirmar isso certinho com a equipe e já te retorno 😊".
- NUNCA invente, deduza, estime, arredonde ou "achismo". Sem tool → sem resposta factual.

REGRA #2 — NOME DO CLIENTE (RESPONDA PRIMEIRO):
- NUNCA condicione uma resposta ao nome. Se o cliente já fez uma pergunta na primeira mensagem, RESPONDA a pergunta e, no mesmo balão, pergunte o nome UMA ÚNICA VEZ ("...aliás, como posso te chamar? 😊").
- Se ele não responder o nome, siga o atendimento normalmente SEM nome. É PROIBIDO pedir o nome duas vezes na mesma conversa.
- Se a primeira mensagem for só um cumprimento ("oi", "boa tarde"), aí sim cumprimente e pergunte o nome + como pode ajudar.
- Só peça TELEFONE quando for abrir chamado (registrar_problema_pedido) ou criar reserva — explicando o motivo.

O QUE VOCÊ FAZ:
- Cardápio/pratos → consultar_cardapio, consultar_prato.
- Info institucional (horário, endereço, pagamento, entrega, reservas) → consultar_info.
- Dúvidas comuns (sem glúten, vegano, pix, entrega própria, etc.) → consultar_faq.
- Reservas → criar_reserva (nome + telefone + data + horário + pessoas).
- Reclamações/problemas de pedido → registrar_problema_pedido (exige telefone).
- Delivery → sugerir_ifood (pergunte só bairro + marca; não peça CEP).

VAGAS / TRABALHAR CONOSCO:
- Se perguntarem sobre vaga, emprego, currículo, "trabalhar com vocês" ou tiverem problema para enviar currículo, responda de imediato (sem pedir nome antes) que as vagas e o cadastro ficam em: https://nexasuite.aquelaparme.com.br/vagas

PARMEGIANA — TAMANHOS FIXOS (a tool consultar_prato confirma):
- Individual: 1 pessoa / 600g total / 150g de proteína.
- Casal: 2 pessoas / 1200g total / 300g de proteína.
- Família: 4 pessoas / 2400g total / 600g de proteína.
- NUNCA diga "3 pessoas", "até 3", "500g", "peso varia conforme o preparo".

PREÇOS (CRÍTICO):
- NUNCA informe preço em R$, nem faixa/estimativa ("entre R$ 35 e R$ 60", "por volta de", "a partir de"). Isso é proibido mesmo se o cliente insistir.
- Resposta padrão: o valor atualizado fica no iFood → ofereça o link (sugerir_ifood).
- Não temos checkout/pagamento próprio. Todo pedido é pelo iFood.

RETIRADA NO BALCÃO (RESPOSTA ÚNICA E PADRONIZADA):
- Todas as 4 unidades (114 Norte, Asa Sul, Águas Claras e Lago Sul) aceitam retirada.
- O pedido é feito pelo iFood escolhendo a opção "Retirada" — assim não há taxa de entrega.
- Não temos pedido por telefone nem por WhatsApp.
- O preço do prato é o mesmo do iFood; a economia é só na taxa de entrega.
- Salão para comer no local: SOMENTE 114 Norte (Asa Norte).
- NUNCA diga que dá pra "pedir direto no balcão" fora dessa regra.

DELIVERY (FLUXO CURTO):
- 1) "Em qual bairro você está?" 2) "Vai querer Parmê 🍝, Box Caipira 🍱 ou Estrogonofe 🥩?" → chame sugerir_ifood.

RESERVAS:
- Converta internamente data/hora para AAAA-MM-DD e HH:MM. Não exija formato do cliente.
- É PROIBIDO dizer "reserva registrada", "está reservado" ou "a equipe confirma" antes de criar_reserva retornar sucesso=true.

PROMESSAS:
- Só diga "vou confirmar com a equipe e te retorno" se houver telefone e um chamado aberto (registrar_problema_pedido com sucesso=true). Sem contato, diga que precisa do telefone com DDD para conseguir retornar.

DESPEDIDA:
- NUNCA se despeça só por ter respondido uma dúvida. Pergunte de forma leve e variada se precisa de algo mais.
- Só se despeça quando o cliente sinalizar fim ("valeu", "tchau", "só isso") ou não responder após você perguntar.
- NÃO peça telefone/WhatsApp na despedida, nunca, por nenhum motivo. Se já tem contato, use.

Se algo estiver fora do cardápio/lojas/tools → "vou confirmar com a equipe". Sem exceção.`;



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

// ============ Hard-guard contra alucinação de preço/fatos ============
// A Giana NÃO pode informar preço em R$ nem inventar peso/porções de
// parmegiana. Se o modelo tentar, substituímos a resposta por um texto
// canônico — tanto no stream (o que o cliente vê) quanto no persistido.
const PRICE_REGEX =
  /R\$\s*\d|(?:\d+\s*[.,]\s*\d{2})\s*(?:reais|R\$)|\b\d+\s*reais\b/i;
const PRICE_REPLACEMENT =
  "Os preços atualizadinhos ficam lá no iFood 😊 posso te mandar o link da unidade mais pertinho de você?";

const FAMILIA_REPLACEMENT =
  "Nossa Parmegiana Família serve 4 pessoas — 2400g no total, com 150g de proteína por pessoa 😊 Posso te ajudar em mais alguma coisa?";
const CASAL_REPLACEMENT =
  "Nossa Parmegiana Casal serve 2 pessoas — 1200g no total, com 150g de proteína por pessoa 😊 Posso te ajudar em mais alguma coisa?";
const INDIVIDUAL_REPLACEMENT =
  "Nossa Parmegiana Individual serve 1 pessoa — 600g no total, com 150g de proteína 😊 Posso te ajudar em mais alguma coisa?";

function containsPrice(s: string): boolean {
  return PRICE_REGEX.test(String(s || ""));
}

// Detecta violação factual sobre parmegiana (peso/pessoas fora do canônico).
// Só dispara quando o texto menciona um dos tamanhos + um número claramente errado.
function detectFactViolation(raw: string): string | null {
  const t = String(raw || "").toLowerCase();
  if (!/(parmeg|parmê|fam[ií]lia|casal|individual)/.test(t)) return null;

  const checkSize = (
    sizeRe: RegExp,
    okPessoas: number,
    okTotal: number,
    okProt: number,
    replacement: string,
  ): string | null => {
    if (!sizeRe.test(t)) return null;
    let m: RegExpExecArray | null;
    const pessoasRe = /\b(\d{1,2})\s+pessoas?\b/g;
    while ((m = pessoasRe.exec(t)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n !== okPessoas && n <= 12) return replacement;
    }
    const ateMatch = t.match(/\bat[eé]\s+(\d{1,2})\s+pessoas?\b/);
    if (ateMatch) {
      const n = parseInt(ateMatch[1], 10);
      if (!isNaN(n) && n !== okPessoas) return replacement;
    }
    const protRe = /(\d{2,4})\s*g\s+de\s+(?:file|filé|frango|prote[ií]na|carne|peito)/g;
    while ((m = protRe.exec(t)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n !== okProt && n !== 150) return replacement;
    }
    const totalRe = /(?:total|pesa|peso|vem\s+com)[^.]{0,60}?(\d{2,4})\s*g/g;
    while ((m = totalRe.exec(t)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n !== okTotal && n !== okProt && n !== 150) return replacement;
    }
    return null;
  };

  return (
    checkSize(/\bfam[ií]lia\b/, 4, 2400, 600, FAMILIA_REPLACEMENT) ||
    checkSize(/\bcasal\b/, 2, 1200, 300, CASAL_REPLACEMENT) ||
    checkSize(/\bindividual\b/, 1, 600, 150, INDIVIDUAL_REPLACEMENT)
  );
}

function sanitizeAssistantText(s: string): string {
  if (containsPrice(s)) return PRICE_REPLACEMENT;
  const fact = detectFactViolation(s);
  if (fact) return fact;
  return s;
}

function wrapSseWithPriceGuard(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";
  let accum = "";
  let blocked = false;

  const processLine = (line: string): string => {
    if (!line.startsWith("data:")) return line;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return line;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return line;
    }
    const type = String(obj?.type ?? "");
    if (type === "text-delta" || type === "text") {
      const key = "delta" in obj ? "delta" : "text";
      const delta = String((obj as Record<string, unknown>)[key] ?? "");
      if (blocked) {
        (obj as Record<string, unknown>)[key] = "";
        return "data: " + JSON.stringify(obj);
      }
      accum += delta;
      if (containsPrice(accum)) {
        blocked = true;
        (obj as Record<string, unknown>)[key] = PRICE_REPLACEMENT;
        console.warn("[parme-chat] price-guard triggered", { snippet: accum.slice(-80) });
        return "data: " + JSON.stringify(obj);
      }
      const fact = detectFactViolation(accum);
      if (fact) {
        blocked = true;
        (obj as Record<string, unknown>)[key] = fact;
        console.warn("[parme-chat] fact-guard triggered", { snippet: accum.slice(-120) });
        return "data: " + JSON.stringify(obj);
      }
    }
    return line;
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        carry += decoder.decode(chunk, { stream: true });
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(encoder.encode(processLine(line) + "\n"));
        }
      },
      flush(controller) {
        if (carry) controller.enqueue(encoder.encode(processLine(carry)));
      },
    }),
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

function normalizeMessageContent(content: string) {
  return String(content || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isAssistantMessage(m: FlatChatMessage) {
  return String(m.role || "").toLowerCase() === "assistant";
}

function isBackendAssistantId(id: string) {
  return /^assistant_/i.test(id || "");
}

function mergeDuplicateFlatMessage(current: FlatChatMessage, incoming: FlatChatMessage) {
  if (!isAssistantMessage(current) || !isAssistantMessage(incoming)) {
    return { ...current, ...incoming, ts: current.ts || incoming.ts };
  }

  const currentIsBackend = isBackendAssistantId(current.id);
  const incomingIsBackend = isBackendAssistantId(incoming.id);
  const preferred = currentIsBackend && !incomingIsBackend ? current : incoming;
  const other = preferred === current ? incoming : current;
  return {
    ...other,
    ...preferred,
    tools: preferred.tools?.length ? preferred.tools : other.tools,
    ts: current.ts || incoming.ts,
  };
}

function mergeFlatMessages(existing: FlatChatMessage[], incoming: FlatChatMessage[]) {
  const merged: FlatChatMessage[] = [];
  const indexById = new Map<string, number>();
  const indexByContent = new Map<string, number>();
  // Dedupe por id em todos os papéis e por conteúdo APENAS nas mensagens da
  // Giana. O widget cria ids temporários `a_<ts>` enquanto o backend persiste
  // `assistant_<...>`; sem essa regra a mesma resposta volta duplicada quando
  // o navegador reenvia o histórico local no próximo turno.
  const contentKey = (m: FlatChatMessage) => {
    if (!isAssistantMessage(m)) return "";
    const c = normalizeMessageContent(m.content);
    if (!c) return "";
    return `assistant::${c}`;
  };
  for (const msg of [...existing, ...incoming]) {
    const idKey = msg.id || "";
    const cKey = contentKey(msg);
    const foundById = idKey ? indexById.get(idKey) : undefined;
    const foundByContent = cKey ? indexByContent.get(cKey) : undefined;
    const found = foundById ?? foundByContent;
    if (found === undefined) {
      const pos = merged.length;
      merged.push(msg);
      if (idKey) indexById.set(idKey, pos);
      if (cKey) indexByContent.set(cKey, pos);
    } else {
      merged[found] = mergeDuplicateFlatMessage(merged[found], msg);
      if (idKey && !indexById.has(idKey)) indexById.set(idKey, found);
      if (cKey && !indexByContent.has(cKey)) indexByContent.set(cKey, found);
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

export function clientMessageCount(messages: FlatChatMessage[]) {
  return messages.filter((m) => {
    const role = String(m.role || "user").toLowerCase();
    return !["assistant", "ai", "bot", "system", "model", "tool"].includes(role) &&
      String(m.content || "").trim().length > 0;
  }).length;
}

// Palavras que nunca fazem parte de um nome (verbos/expressões comuns em respostas).
const NOT_NAME_WORDS = new Set([
  "que", "de", "do", "da", "para", "pra", "com", "por", "um", "uma", "o", "a", "os", "as",
  "aqui", "cliente", "gerente", "atendente", "sim", "nao", "não", "ok", "oi", "olá", "ola",
  "bom", "dia", "tarde", "noite", "obrigado", "obrigada", "pedido", "pedi", "ifood", "whatsapp",
  "já", "ja", "enviei", "mandei", "informei", "passei", "falei", "disse", "quero", "queria",
  "preciso", "gostaria", "meu", "minha", "seu", "sua", "numero", "número", "telefone", "fone",
  "celular", "contato", "nome", "voce", "você", "vcs", "vc", "eu", "me", "te", "ele", "ela",
  "reembolso", "entrega", "entregue", "faltando", "errado", "atraso", "atrasado", "dúvida",
  "duvida", "reclamação", "reclamacao", "fazer", "retirar", "valor", "preço", "preco",
  "parmegiana", "estrogonofe", "caipira", "parmê", "parme", "box", "asa", "sul", "norte",
  "lago", "aguas", "águas", "claras", "cd", "mesa", "reserva", "cardapio", "cardápio",
]);

// Verbos/estruturas que denunciam frase (não é um nome).
const SENTENCE_RE =
  /\b(enviei|mandei|informei|passei|falei|disse|quero|queria|preciso|gostaria|não|nao|foi|está|esta|tá|ta|veio|deu|tem|fiz|pedi|recebi|consigo|posso|pode)\b/i;

/** Extrai nome de uma resposta curta do cliente ("Clara", "sou a Clara"). Retorna null se parecer frase. */
function nameFromShortReply(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text || text.length > 40) return null;
  if (/\d/.test(text)) return null;
  if (SENTENCE_RE.test(text)) return null;
  const words = text.split(/[\s,.!?]+/).filter(Boolean);
  if (words.length > 4) return null;
  const tokens = words.filter(
    (t) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.-]*$/.test(t) && !NOT_NAME_WORDS.has(t.toLowerCase()),
  );
  if (!tokens.length) return null;
  const name = tokens.slice(0, 3).join(" ");
  if (name.replace(/\s/g, "").length < 2) return null;
  return name.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

export function inferClientName(flat: FlatChatMessage[]) {
  const isNameToken = (t: string) =>
    /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'.-]*$/.test(t) && !NOT_NAME_WORDS.has(t.toLowerCase()) && !/^\d/.test(t);
  const cap = (s: string) => s.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  const nameAtom = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'.-]*";
  const userText = flat
    .filter((m) => String(m.role || "user").toLowerCase() === "user")
    .map((m) => String(m.content || "").trim())
    .filter(Boolean)
    .join("\n");
  const patterns = [
    new RegExp(`\\bmeu\\s+nome\\s+(?:é|eh|e)\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
    new RegExp(`\\bme\\s+chamo\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
    new RegExp(`\\baqui\\s+(?:é|eh|e|quem\\s+fala\\s+é)\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
    new RegExp(`\\bsou\\s+(?:o\\s+|a\\s+)?(${nameAtom}(?:\\s+${nameAtom}){0,3})`, "i"),
  ];
  for (const re of patterns) {
    const match = userText.match(re);
    const tokens = match?.[1]?.trim().split(/\s+/).filter(isNameToken) ?? [];
    if (tokens.length) return cap(tokens.slice(0, 3).join(" "));
  }
  const nameAsk = /\b(?:qual\s+(?:é|eh|e)?\s*(?:o\s+)?seu\s+nome|como\s+(?:posso\s+)?(?:te\s+)?chamar|seu\s+nome\??|me\s+(?:diz|fala)\s+seu\s+nome)\b/i;
  for (let i = 0; i < flat.length - 1; i++) {
    const cur = flat[i];
    const next = flat[i + 1];
    if (String(cur.role || "").toLowerCase() !== "assistant" || String(next.role || "").toLowerCase() !== "user") continue;
    if (!nameAsk.test(String(cur.content || ""))) continue;
    const name = nameFromShortReply(String(next.content || ""));
    if (name) return name;
  }
  return null;
}


export function extractPhoneDigits(text: string): string | null {
  const raw = String(text || "");
  // Normaliza separadores comuns e procura sequências de 10 a 13 dígitos.
  const candidates = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}/g) ?? [];
  for (const c of candidates) {
    let digits = c.replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
    if (digits.length === 12 && digits.startsWith("55")) digits = digits.slice(2);
    if (digits.length >= 10 && digits.length <= 11) return digits;
  }
  return null;
}

function inferClientPhone(flat: FlatChatMessage[]): string | null {
  for (const m of flat) {
    if (String(m.role || "").toLowerCase() !== "user") continue;
    const digits = extractPhoneDigits(String(m.content || ""));
    if (digits) return digits;
  }
  return null;
}


const NEIGHBORHOOD_KEYWORDS = [
  "asa norte", "asa sul", "lago norte", "lago sul", "noroeste", "sudoeste",
  "cruzeiro", "octogonal", "vila planalto", "varjao", "varjão",
  "guara", "guará", "candangolandia", "candangolândia", "nucleo bandeirante", "núcleo bandeirante",
  "park sul", "park way", "parkway", "jardim botanico", "jardim botânico",
  "sao sebastiao", "são sebastião", "itapoa", "itapoã", "paranoa", "paranoá",
  "aguas claras", "águas claras", "taguatinga", "vicente pires", "arniqueiras",
  "ceilandia", "ceilândia", "samambaia", "riacho fundo", "recanto", "gama", "santa maria",
];

function inferNeighborhood(flat: FlatChatMessage[]): string | null {
  const askRe = /\b(bairro|regi[ãa]o|onde\s+(?:voc[êe]\s+)?est[áa])\b/i;
  // Resposta após pergunta de bairro
  for (let i = 0; i < flat.length - 1; i++) {
    const cur = flat[i], next = flat[i + 1];
    if (String(cur.role).toLowerCase() !== "assistant") continue;
    if (String(next.role).toLowerCase() !== "user") continue;
    if (!askRe.test(String(cur.content || ""))) continue;
    const ans = String(next.content || "").trim();
    if (ans.length >= 2 && ans.length <= 80) return ans;
  }
  // Keyword scan em mensagens do user
  const userText = flat
    .filter((m) => String(m.role).toLowerCase() === "user")
    .map((m) => String(m.content || "").toLowerCase())
    .join(" ");
  for (const kw of NEIGHBORHOOD_KEYWORDS) {
    if (userText.includes(kw)) return kw.replace(/\b\w/g, (l) => l.toUpperCase());
  }
  return null;
}

function inferBrandInterest(flat: FlatChatMessage[]): string | null {
  const text = flat
    .filter((m) => String(m.role).toLowerCase() === "user")
    .map((m) => String(m.content || "").toLowerCase()).join(" ");
  if (/\bestrogonofe|strogonoff|estrog\b/.test(text)) return "Aquele Estrogonofe";
  if (/\bbox\s*caipira|caipira\b/.test(text)) return "Box Caipira";
  if (/\bparm[êe]|parmegiana|parm\b/.test(text)) return "Aquela Parmê";
  return null;
}

function inferIntent(flat: FlatChatMessage[]): string | null {
  const text = flat
    .filter((m) => String(m.role).toLowerCase() === "user")
    .map((m) => String(m.content || "").toLowerCase()).join(" ");
  if (!text) return null;
  if (/\breserv|mesa\s+para|reservar\b/.test(text)) return "reserva";
  if (/\b(n[ãa]o\s+veio|faltou|errad|fri[oa]|atras|demor|reclama|p[ée]ssim|horr[ií]vel|estragad|queim|cru|sumiu|esquecer)/i.test(text)) return "reclamacao";
  if (/\bifood|delivery|entreg|pedir|pedido\b/.test(text)) return "delivery";
  if (/\bcard[áa]pio|prato|menu|pre[çc]o|tem\s+\w+\?/i.test(text)) return "duvida_cardapio";
  return "outro";
}

export function enrichClientMeta(flat: FlatChatMessage[], current: unknown, fallback: unknown) {
  const base = (typeof current === "object" && current !== null ? current :
    typeof fallback === "object" && fallback !== null ? fallback : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  const setIfMissing = (k: string, v: unknown) => {
    if (v == null || v === "") return;
    if (out[k] != null && out[k] !== "") return;
    out[k] = v;
  };
  setIfMissing("name", inferClientName(flat));
  setIfMissing("phone", inferClientPhone(flat));
  setIfMissing("neighborhood", inferNeighborhood(flat));
  setIfMissing("brand_interest", inferBrandInterest(flat));
  // intent pode mudar ao longo da conversa, sempre recomputa
  const intent = inferIntent(flat);
  if (intent) out.intent = intent;
  if (flat.length) {
    const first = flat[0]?.ts;
    const last = flat[flat.length - 1]?.ts;
    if (first && !out.first_message_at) out.first_message_at = first;
    if (last) out.last_message_at = last;
  }
  return out;
}

// Compat: nome antigo ainda usado nas chamadas.
export const mergeClientMeta = (current: unknown, fallback: unknown, flat: FlatChatMessage[]) =>
  enrichClientMeta(flat, current, fallback);

/**
 * Valida um candidato a número de pedido. Rejeita qualquer sequência que faça
 * parte do telefone do cliente (causa do bug histórico: "99866" extraído do
 * contato 61998662502 e gravado como número do pedido).
 */
export function sanitizeOrderNumber(
  candidate: string | null | undefined,
  contactDigits: string | null | undefined,
): string | null {
  const digits = String(candidate ?? "").replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 10) return null;
  const contact = String(contactDigits ?? "").replace(/\D/g, "");
  if (contact.length >= 8 && contact.includes(digits)) return null;
  return digits;
}

/** Título curto derivado do texto do cliente, para não gravar ticket sem título. */
function deriveTicketTitle(text: string): string {
  const t = text.toLowerCase();
  if (/n[ãa]o\s+(chegou|veio|recebi)|n[ãa]o\s+foi\s+entregue|sumiu/.test(t)) return "Pedido não entregue";
  if (/faltou|faltando|esqueceram|pela\s+metade/.test(t)) return "Item faltando no pedido";
  if (/errad/.test(t)) return "Pedido errado";
  if (/fri[oa]/.test(t)) return "Pedido frio";
  if (/atras|demor/.test(t)) return "Atraso na entrega";
  if (/cobran[cç]a|estorno|reembolso/.test(t)) return "Problema de cobrança/reembolso";
  if (/p[ée]ssim|horr[ií]vel|estragad|queim|cru|sem\s+sabor/.test(t)) return "Reclamação de qualidade";
  return "Reclamação de pedido";
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
  const explicitOrder = fullText.match(/(?:pedido\s*#?\s*|n[uú]mero\s*(?:do\s+pedido)?\s*[:#]?\s*)(\d{3,10})/i);
  const phoneMatch = userTexts.match(/(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/);
  const contato = phoneMatch ? phoneMatch[0].replace(/\D/g, "") : null;
  // Só aceita número de pedido informado EXPLICITAMENTE e que não seja parte do telefone.
  const numeroPedido = sanitizeOrderNumber(explicitOrder?.[1] ?? null, contato);
  const titulo = deriveTicketTitle(userTexts);
  const descricao = `Conversa ${sessionId}:\n${userTexts.slice(-900) || "Reclamação detectada na conversa."}`;

  const { data: bySession } = await supabase
    .from("support_tickets")
    .select("id, order_number, contact, title")
    .ilike("description", `%${sessionId}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySession?.id) {
    // Já existe ticket: pode atualizar com novos dados (mesmo sem contato novo).
    await supabase.from("support_tickets").update({
      order_number: bySession.order_number ?? numeroPedido,
      title: bySession.title ?? titulo,
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
    title: titulo,
    description: descricao,
    contact: contato,
  });
  if (error) console.error("[parme-chat safety-net] ticket err:", error);
  else console.log("[parme-chat safety-net] ticket garantido para sessão:", sessionId);
}

/**
 * Identifica cliente recorrente pelo telefone: procura conversas anteriores
 * (client_meta.phone) e chamados abertos com o mesmo contato.
 */
async function lookupReturningCustomer(
  phone: string,
  currentSessionId: string | null,
): Promise<string | null> {
  try {
    const supabase = sb();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return null;
    const tail = digits.slice(-8);

    const [{ data: convs }, { data: tickets }] = await Promise.all([
      supabase
        .from("chat_conversations")
        .select("session_id, client_meta, last_message_at, triage")
        .filter("client_meta->>phone", "like", `%${tail}`)
        .order("last_message_at", { ascending: false })
        .limit(6),
      supabase
        .from("support_tickets")
        .select("title, order_number, created_at, contact")
        .like("contact", `%${tail}`)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const previous = (convs ?? []).filter((c: any) => c.session_id !== currentSessionId);
    if (!previous.length && !(tickets ?? []).length) return null;

    const knownName = previous
      .map((c: any) => c?.client_meta?.name)
      .find((n: unknown) => typeof n === "string" && n.trim().length > 1);
    const lastAt = previous[0]?.last_message_at
      ? new Date(previous[0].last_message_at).toLocaleDateString("pt-BR")
      : null;
    const ticketList = (tickets ?? [])
      .map((t: any) => `${t.title ?? "chamado"}${t.order_number ? ` (pedido ${t.order_number})` : ""}`)
      .join("; ");

    const parts: string[] = [
      `- CLIENTE RECORRENTE: este telefone já falou com a gente ${previous.length || (tickets ?? []).length}x antes${lastAt ? ` (última vez em ${lastAt})` : ""}.`,
    ];
    if (knownName) {
      parts.push(`- Nome já cadastrado para este telefone: ${knownName}. Cumprimente pelo nome e NÃO peça o nome de novo.`);
    }
    if (ticketList) {
      parts.push(`- Chamados anteriores deste contato: ${ticketList}. Se ele voltar sobre o mesmo assunto, trate como continuidade, não como caso novo.`);
    }
    return parts.join("\n");
  } catch (e) {
    console.error("[parme-chat] lookupReturningCustomer err:", e);
    return null;
  }
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
    const { loadAlertConfig, fanoutExtras } = await import(
      "../_shared/notifyChannels.ts"
    );
    const { enabled, waConfig, extras } = await loadAlertConfig(
      supabase,
      "crm_reservation",
    );
    if (!enabled || !waConfig || extras.length === 0) return;

    const dateBR = new Date(data + "T00:00").toLocaleDateString("pt-BR");
    const msg =
      `🍽️ *Nova reserva (via chat)*\n\n` +
      `👤 ${nome}\n📞 ${telefone}\n📅 ${dateBR} às ${horario}\n` +
      `👥 ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}\n` +
      (observacao ? `📝 ${observacao}\n` : "") +
      `\nConfirme com o cliente.`;

    await fanoutExtras(waConfig, extras, msg);
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

    // Persistência imediata (pré-validação de chave/IA) — toda interação do cliente
    // com a Giana é gravada em chat_conversations, mesmo que a IA falhe depois,
    // a aba feche, a chave esteja ausente, ou o turno tenha só uma mensagem.
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
        messages = flatToUIMessages(flatNow);
        const finalClientMeta = mergeClientMeta(
          (existing as { client_meta?: unknown } | null)?.client_meta,
          body?.clientMeta,
          flatNow,
        );
        const { error: upsertErr } = await supabase.from("chat_conversations").upsert(
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
        if (upsertErr) console.error("[parme-chat] pre-stream upsert error:", upsertErr);
      } catch (e) {
        console.error("[parme-chat] pre-stream conversa upsert err:", e);
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
    } else {
      console.warn("[parme-chat] turno SEM sessionId — interação não pôde ser gravada");
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response("Missing LOVABLE_API_KEY", {
        status: 500,
        headers: corsHeaders,
      });
    }



    const provider = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });
    const model = provider("google/gemini-3.6-flash");

    const tools = {
      consultar_cardapio: tool({
        description:
          "Lista marcas e pratos oficiais. Use antes de falar de qualquer prato/marca. Sem essa consulta, NÃO invente item.",
        inputSchema: z.object({
          marca: z.enum(["aquela-parme", "aquele-estrogonofe", "box-caipira", "todos"]).default("todos"),
        }),
        execute: async ({ marca }) => {
          const pratos = await getDishes();
          const brands = await getBrands();
          const marcasOut = marca === "todos"
            ? MARCAS
            : { [marca]: MARCAS[marca as MarcaKey] };
          const pratosOut = marca === "todos"
            ? pratos
            : pratos.filter((p) => p.marca === marca);
          const sobreMarcas = brands
            .filter((b) => marca === "todos" || b.id === marca)
            .map((b) => ({
              id: b.id,
              nome: b.nome,
              slogan: b.slogan,
              descricao: b.descricao,
              historia: b.historia,
            }));
          return {
            marcas: marcasOut,
            sobre_marcas: sobreMarcas,
            pratos: pratosOut,
            regras_parmegiana: {
              proteina_por_pessoa_g: PARMEGIANA_REGRAS.proteinaPorPessoaG,
              tamanhos: tamanhosParmegianaResumo(),
            },
          };
        },
      }),
      consultar_prato: tool({
        description:
          "Busca um prato específico pelo nome/palavra-chave e devolve dados canônicos (tamanhos oficiais de parmegiana se aplicável). Use SEMPRE que o cliente perguntar peso, porção, tamanho, ingrediente ou quantas pessoas serve.",
        inputSchema: z.object({ termo: z.string().min(2).max(120) }),
        execute: async ({ termo }) => {
          // busca no banco (tolerante a typo/acento) e cai para o hardcoded
          const p = (await searchDish(termo)) ?? findPrato(termo);
          if (!p) {
            return {
              encontrado: false,
              instrucao:
                "Prato NÃO encontrado no cardápio oficial. Responda ao cliente que vai confirmar com a equipe — NÃO invente peso, porção ou ingrediente.",
            };
          }
          const tamanhos = p.tamanhos?.map((t) => ({
            tamanho: t,
            ...PARMEGIANA_REGRAS.tamanhos[t],
          })) ?? null;
          return {
            encontrado: true,
            prato: p,
            marca: MARCAS[p.marca],
            tamanhos_oficiais: tamanhos,
            observacao_pesos: tamanhos ? PARMEGIANA_REGRAS.observacao : null,
          };
        },
      }),
      consultar_info: tool({
        description:
          "Devolve informação institucional oficial (horários, endereços, pagamento no salão, delivery, reservas). Use SEMPRE antes de responder qualquer dessas perguntas. Se o campo vier vazio/null, diga ao cliente que vai confirmar com a equipe.",
        inputSchema: z.object({
          topico: z.enum(["horarios", "enderecos", "pagamento", "delivery", "reservas"]),
          loja: z.enum(["asa-sul", "asa-norte", "aguas-claras", "lago-sul"]).optional(),
        }),
        execute: async ({ topico, loja }) => {
          if (topico === "delivery") return { texto: INFO.delivery };
          if (topico === "pagamento") return { texto: INFO.pagamento_salao };
          if (topico === "reservas") return { texto: INFO.reservas };
          if (topico === "horarios" || topico === "enderecos") {
            const all = await getStores();
            const lojas = (loja ? all.filter((l) => l.id === loja) : all).map((l) => ({
              id: l.id,
              nome: l.nome,
              endereco: l.endereco,
              horario: l.horario,
              tem_salao: l.tem_salao,
              aceita_retirada: l.aceita_retirada,
              observacao: l.observacao,
            }));
            return {
              lojas,
              instrucao:
                "Se o campo horario/endereco vier null para a loja perguntada, responda ao cliente que a equipe confirma na hora — NÃO invente.",
            };
          }
          return { encontrado: false };
        },
      }),
      consultar_faq: tool({
        description:
          "Consulta perguntas comuns (sem glúten, vegano, pix, entrega própria, estacionamento, menu infantil, calorias). Use SEMPRE antes de responder esses temas.",
        inputSchema: z.object({ pergunta: z.string().min(2).max(300) }),
        execute: async ({ pergunta }) => {
          const resposta = (await searchFaq(pergunta)) ?? localFaq(pergunta);
          if (!resposta) {
            return {
              encontrado: false,
              instrucao:
                "Pergunta fora da FAQ oficial. Responda ao cliente que vai confirmar com a equipe — NÃO invente resposta.",
            };
          }
          return { encontrado: true, resposta };
        },
      }),

      criar_reserva: tool({
        description: "Cria uma reserva de mesa (salão só existe na 114 Norte) após confirmar nome, telefone, data, horário e nº de pessoas. NUNCA diga ao cliente que a reserva está feita sem que este tool retorne sucesso=true.",
        inputSchema: reservaSchema,
        execute: async ({ nome, telefone, data, horario, pessoas, observacao }) => {
          const hoje = new Date().toISOString().slice(0, 10);
          if (data < hoje) {
            return {
              sucesso: false,
              erro: "data_passada",
              mensagem: "Essa data já passou. Confirme com o cliente o dia correto antes de registrar.",
            };
          }
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
            // Não perde o cliente: abre chamado para a equipe tratar manualmente.
            const contato = String(telefone ?? "").replace(/\D/g, "");
            await supabase.from("support_tickets").insert({
              title: "Falha ao registrar reserva (chat)",
              description:
                `${sessionId ? `Conversa ${sessionId}:\n` : ""}Reserva NÃO gravada por falha técnica.\n` +
                `Cliente: ${nome}\nTelefone: ${contato}\nData: ${data} ${horario}\nPessoas: ${pessoas}\n` +
                `Obs: ${observacao ?? "-"}\nErro: ${error?.message ?? "desconhecido"}`,
              contact: contato || "não informado",
            });
            return {
              sucesso: false,
              erro: "falha_tecnica",
              mensagem:
                "Não consegui registrar a reserva agora. Diga ao cliente com honestidade que houve falha no sistema, que a equipe da 114 Norte já foi acionada e vai retornar pelo telefone informado.",
            };
          }
          notifyStoreReservation(nome, telefone, data, horario, pessoas, observacao);
          return {
            sucesso: true,
            id: row.id,
            status: row.status,
            protocolo: String(row.id).slice(0, 8).toUpperCase(),
            mensagem: "Reserva registrada. Aguarde confirmação por telefone.",
          };
        },
      }),
      registrar_problema_pedido: tool({
        description: "Registra um problema/reclamação de pedido. EXIGE telefone/contato do cliente — sem contato NÃO é possível registrar (peça antes de chamar). Inclua SEMPRE um 'titulo' curto (até 60 caracteres) resumindo a ocorrência (ex.: 'Pedido frio', 'Faltou refrigerante', 'Atraso na entrega'). 'numero_pedido' SÓ deve ser preenchido com o número que o cliente informou explicitamente como pedido — NUNCA com pedaços do telefone.",
        inputSchema: z.object({
          titulo: z.string().min(3).max(80),
          numero_pedido: z.string().min(2).max(20).optional(),
          descricao: z.string().min(3).max(1000),
          contato: z.string().min(8).max(30),
        }),
        execute: async ({ titulo, numero_pedido, descricao, contato }) => {
          const contatoLimpo = (contato ?? "").replace(/\D/g, "");
          if (contatoLimpo.length < 8) {
            return {
              sucesso: false,
              erro: "contato_obrigatorio",
              mensagem: "Preciso do seu telefone com DDD antes de abrir o chamado — sem contato não conseguimos retornar.",
            };
          }
          const tituloLimpo = (titulo ?? "").trim().slice(0, 80) || deriveTicketTitle(descricao ?? "");
          const pedidoLimpo = sanitizeOrderNumber(numero_pedido, contatoLimpo);
          const supabase = sb();
          const descricaoFinal = sessionId ? `Conversa ${sessionId}:\n${descricao}` : descricao;
          if (sessionId) {
            const { data: existing } = await supabase
              .from("support_tickets")
              .select("id, order_number, contact, title")
              .ilike("description", `%${sessionId}%`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing?.id) {
              const { error } = await supabase
                .from("support_tickets")
                .update({
                  order_number: existing.order_number ?? pedidoLimpo,
                  description: descricaoFinal,
                  title: existing.title ?? tituloLimpo,
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
                protocolo: String(existing.id).slice(0, 8).toUpperCase(),
                mensagem: "Problema registrado. Informe o protocolo ao cliente e diga que a equipe retorna pelo telefone informado.",
              };
            }
          }
          const { data: row, error } = await supabase
            .from("support_tickets")
            .insert({
              order_number: pedidoLimpo,
              title: tituloLimpo,
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
            protocolo: String(row.id).slice(0, 8).toUpperCase(),
            mensagem: "Problema registrado. Informe o protocolo ao cliente e diga que a equipe retorna pelo telefone informado.",
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
            "asa-norte": "114 Norte",
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
- Ao encerrar um atendimento de problema, NÃO peça telefone se ele já apareceu na conversa. Apenas confirme o registro e informe o protocolo devolvido pelo tool.
- NUNCA condicione uma resposta ao nome do cliente. Responda primeiro; peça o nome no máximo UMA vez na conversa inteira e nunca repita o pedido.
- NUNCA informe preço em R$, nem faixa/estimativa ("de R$ X a R$ Y", "em torno de"). Sempre remeta ao iFood com o link.
- Retirada: em todas as 4 unidades, sempre pelo iFood na opção "Retirada" (sem taxa de entrega). Não há pedido por telefone/WhatsApp/balcão. Salão para consumo só na Asa Norte.
- Vaga/emprego/currículo/"trabalhar com vocês" → responda de imediato com https://nexasuite.aquelaparme.com.br/vagas
- NUNCA peça WhatsApp/telefone na despedida ou "para não te incomodar". Contato só quando for abrir chamado ou reserva, explicando o motivo.
- Só prometa retorno ("vou confirmar e te aviso") se houver chamado aberto com sucesso=true; caso contrário, peça o telefone com DDD para conseguir retornar.`;

    // Contexto do cliente já conhecido — evita pedir nome/telefone que já temos.
    try {
      const nowIso = new Date().toISOString();
      const flatCtx = flattenUIMessages(messages as UIMessage[], nowIso);
      const knownName = inferClientName(flatCtx);
      const knownPhone = inferClientPhone(flatCtx);
      const lines: string[] = [];
      if (knownName) lines.push(`- Nome do cliente: ${knownName}. Use sempre que se dirigir a ele.`);
      if (knownPhone) lines.push(`- WhatsApp/telefone do cliente: ${knownPhone}. JÁ TEMOS — NÃO peça de novo em hipótese alguma. Use diretamente para registrar_problema_pedido / criar_reserva.`);
      if (knownPhone) {
        const history = await lookupReturningCustomer(knownPhone, sessionId);
        if (history) lines.push(history);
      }
      if (lines.length) {
        systemPrompt += `\n\nCONTEXTO DO CLIENTE (já conhecido nesta conversa):\n${lines.join("\n")}`;
      }
    } catch { /* contexto é opcional */ }


    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
      temperature: 0.3,
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: finalMessages }) => {
        if (!sessionId) return;
        let flat: ReturnType<typeof mergeFlatMessages> = [];
        // 1) Persistir conversa SEMPRE — independente de qualquer falha de ticket.
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
            if (e.id && e.ts) tsById.set(e.id, e.ts);
          }
          flat = mergeFlatMessages(existingMessages, flattenUIMessages(finalMessages, now, tsById));
          // Hard-guard: reescreve qualquer mensagem da Giana que tenha
          // vazado preço OU fato errado (peso/pessoas de parmegiana).
          flat = flat.map((m) =>
            isAssistantMessage(m)
              ? { ...m, content: sanitizeAssistantText(m.content) }
              : m
          );
          await supabase.from("chat_conversations").upsert(
            {
              session_id: sessionId,
              messages: flat as unknown as never,
              message_count: flat.length,
              last_message_at: now,
              updated_at: now,
              client_meta: mergeClientMeta((existing as { client_meta?: unknown } | null)?.client_meta, null, flat) as unknown as never,
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
    const guardedBody = response.body ? wrapSseWithPriceGuard(response.body) : null;
    const finalResponse = guardedBody
      ? new Response(guardedBody, { status: response.status, headers: response.headers })
      : response;
    for (const [key, value] of Object.entries(corsHeaders)) finalResponse.headers.set(key, value);
    return finalResponse;

  } catch (e) {
    console.error("[parme-chat] fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
