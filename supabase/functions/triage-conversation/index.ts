// Triagem de conversas: classifica se há "problema detectável" (reclamação,
// atraso, item faltando/errado, qualidade, cobrança, etc.) e grava resultado
// em chat_conversations.triage. Fluxo: heurística rápida (regex/keywords) →
// se acusar indício OU conversa ≥3 msgs do cliente, chama Lovable AI para
// classificar em JSON estruturado.
//
// Body:
//   { conversation_id: "uuid" }   → triagem sob demanda
//   { batch: true, limit?: 30 }   → processa fila (cron)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Msg = { role?: string; content?: unknown; text?: unknown; message?: unknown; sender?: string };
type ConvRow = {
  id: string;
  messages: Msg[] | null;
  last_message_at: string | null;
  triaged_at: string | null;
};

const NON_CLIENT_ROLES = new Set([
  "assistant", "ai", "bot", "system", "agent", "attendant",
  "atendente", "operador", "gerente", "giana", "parme",
]);

function messageText(m: Msg): string {
  if (!m) return "";
  const v = (m.content ?? m.text ?? m.message ?? "") as unknown;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((p: any) => p?.text ?? p?.content ?? "").join(" ");
  return String(v ?? "");
}
function isClientMessage(m: Msg): boolean {
  const role = String(m?.role ?? m?.sender ?? "user").toLowerCase();
  return !NON_CLIENT_ROLES.has(role) && messageText(m).trim().length > 0;
}

// ---------- Camada 1: heurística ----------

const CATEGORY_PATTERNS: Array<{ category: string; severity: "low" | "medium" | "high"; re: RegExp }> = [
  { category: "atraso", severity: "high", re: /\b(atras|demor|n[ãa]o\s+chegou|ainda\s+n[ãa]o\s+chegou|cad[êe]\s+meu\s+pedido)\b/i },
  { category: "item_faltando", severity: "high", re: /\b(faltou|faltando|n[ãa]o\s+veio|esqueceram|esqueceu)\b/i },
  { category: "item_errado", severity: "high", re: /\b(errad|troc(ado|aram)|n[ãa]o\s+foi\s+isso\s+que\s+pedi|pedi\s+.+\s+veio)\b/i },
  { category: "qualidade", severity: "high", re: /\b(fri[oa]|queimad|cru|estragad|azed|estranho|pod(re|rid)|com\s+bicho|cabelo)\b/i },
  { category: "cobranca", severity: "medium", re: /\b(cobra(ram|nça)|cobrado|preç[oa]|caro|valor\s+errado|dupli(cado|cidade))\b/i },
  { category: "reembolso", severity: "medium", re: /\b(reembols|estorn|dinheiro\s+de\s+volta|cancelar\s+(o\s+)?pedido)\b/i },
  { category: "reclamacao", severity: "medium", re: /\b(reclama|p[eé]ssim|horr[ií]vel|ruim|insatisfeit|absurd|lament[áa]vel)\b/i },
  { category: "elogio", severity: "low", re: /\b(parab[eé]ns|ador(o|ei)|excelente|maravilh|elogio|amei|adorei|top\s+demais)\b/i },
];

function heuristicTriage(userText: string, clientMsgCount: number) {
  let bestCategory: string | null = null;
  let bestSeverity: "none" | "low" | "medium" | "high" | "critical" = "none";
  const keywords = new Set<string>();
  const rank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  for (const p of CATEGORY_PATTERNS) {
    const m = userText.match(p.re);
    if (!m) continue;
    keywords.add(m[0].toLowerCase());
    if (rank[p.severity] > rank[bestSeverity]) {
      bestSeverity = p.severity;
      bestCategory = p.category;
    }
  }
  // Palavras de urgência elevam a severidade
  if (/\b(urgente|imediato|absurd|processar|procon|reclamar\s+no|advogad)/i.test(userText)) {
    if (rank[bestSeverity] < rank.critical) bestSeverity = "critical";
  }
  const hasIssue = bestSeverity !== "none" && bestCategory !== "elogio";
  const shouldRunAI = hasIssue || clientMsgCount >= 3;
  return {
    hasIssue,
    category: bestCategory ?? (clientMsgCount ? "duvida" : "outro"),
    severity: bestSeverity,
    keywords: Array.from(keywords),
    shouldRunAI,
  };
}

// ---------- Camada 2: Lovable AI ----------

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["has_issue", "severity", "category", "summary", "keywords", "customer_sentiment", "needs_human"],
  properties: {
    has_issue: { type: "boolean" },
    severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
    category: {
      type: "string",
      enum: ["reclamacao", "atraso", "item_faltando", "item_errado", "qualidade", "cobranca", "reembolso", "elogio", "duvida", "outro"],
    },
    summary: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    customer_sentiment: { type: "string", enum: ["happy", "neutral", "confused", "frustrated", "angry"] },
    needs_human: { type: "boolean" },
  },
} as const;

async function aiTriage(conversationText: string): Promise<any | null> {
  if (!LOVABLE_API_KEY) return null;
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content:
          "Você classifica conversas de clientes de restaurante (Aquela Parmê / Box Caipira / Estrogonofê) em PT-BR. " +
          "Retorne SOMENTE JSON no schema pedido. Marque has_issue=true quando o cliente relata problema real com pedido, entrega, cobrança, atendimento ou qualidade. " +
          "Elogios e simples dúvidas NÃO são problema. severity=critical apenas se há ameaça (Procon, advogado, publicar/expor) ou risco grave. summary curto (≤120 chars) descrevendo o que ocorreu.",
      },
      { role: "user", content: conversationText.slice(0, 6000) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "triage", strict: true, schema: TRIAGE_SCHEMA },
    },
  };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("[triage] AI gateway", r.status, await r.text().catch(() => ""));
    return null;
  }
  const j = await r.json().catch(() => null);
  const content = j?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    return null;
  }
}

// ---------- Processamento ----------

async function triageOne(supabase: ReturnType<typeof createClient>, conv: ConvRow) {
  const msgs = Array.isArray(conv.messages) ? conv.messages : [];
  const clientMsgs = msgs.filter(isClientMessage);
  if (clientMsgs.length === 0) {
    await supabase
      .from("chat_conversations")
      .update({
        triage: { has_issue: false, severity: "none", category: "outro", summary: "Conversa sem mensagens do cliente.", keywords: [], source: "heuristic", detected_at: new Date().toISOString() },
        triaged_at: new Date().toISOString(),
      })
      .eq("id", conv.id);
    return { id: conv.id, has_issue: false, source: "heuristic" };
  }

  const userText = clientMsgs.map(messageText).join("\n");
  const h = heuristicTriage(userText, clientMsgs.length);

  let final: any = {
    has_issue: h.hasIssue,
    severity: h.severity,
    category: h.category,
    summary: userText.slice(0, 120).replace(/\s+/g, " ").trim(),
    keywords: h.keywords,
    customer_sentiment: h.hasIssue ? "frustrated" : "neutral",
    needs_human: h.severity === "critical",
    source: "heuristic",
    detected_at: new Date().toISOString(),
  };

  if (h.shouldRunAI) {
    const conversationText = msgs
      .map((m) => `${isClientMessage(m) ? "CLIENTE" : "IA"}: ${messageText(m)}`)
      .filter((l) => l.length > 8)
      .join("\n");
    const ai = await aiTriage(conversationText);
    if (ai) {
      final = { ...ai, source: "ai", detected_at: new Date().toISOString() };
    }
  }

  await supabase
    .from("chat_conversations")
    .update({ triage: final, triaged_at: new Date().toISOString() })
    .eq("id", conv.id);

  return { id: conv.id, has_issue: !!final.has_issue, severity: final.severity, source: final.source };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));

    if (body?.conversation_id) {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("id, messages, last_message_at, triaged_at")
        .eq("id", body.conversation_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const result = await triageOne(supabase, data as ConvRow);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // batch mode
    const limit = Math.min(Number(body?.limit ?? 30), 100);
    // Prioriza não-triadas; se restar espaço, reprocessa as mais antigas (mensagens novas depois da triagem tratamos aqui).
    const { data: pending, error } = await supabase
      .from("chat_conversations")
      .select("id, messages, last_message_at, triaged_at")
      .is("triaged_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    let data = pending ?? [];
    const remaining = limit - data.length;
    if (remaining > 0) {
      // Busca conversas com mensagem nova depois da última triagem
      const { data: stale } = await supabase
        .from("chat_conversations")
        .select("id, messages, last_message_at, triaged_at")
        .not("triaged_at", "is", null)
        .not("last_message_at", "is", null)
        .order("triaged_at", { ascending: true })
        .limit(remaining * 3);
      const filtered = (stale ?? []).filter((c: any) =>
        c.last_message_at && c.triaged_at && new Date(c.last_message_at) > new Date(c.triaged_at)
      ).slice(0, remaining);
      data = [...data, ...filtered];
    }

    const results: any[] = [];
    for (const c of (data ?? []) as ConvRow[]) {
      try {
        results.push(await triageOne(supabase, c));
      } catch (e) {
        console.error("[triage] falhou", c.id, e);
        results.push({ id: c.id, error: String(e) });
      }
    }
    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[triage-conversation]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
