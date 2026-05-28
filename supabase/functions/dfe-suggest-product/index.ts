// Sugere produto do estoque para itens de DF-e sem vínculo, via Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Prod { id: string; name: string; unit: string | null }
interface Item { id: string; description: string; unit: string | null; quantity: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { note_id } = await req.json();
    if (!note_id) return json({ error: "note_id required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const [{ data: note }, { data: items }, { data: products }] = await Promise.all([
      sb.from("dfe_inbound_notes").select("supplier_name").eq("id", note_id).single(),
      sb.from("dfe_inbound_items").select("id, description, unit, quantity")
        .eq("note_id", note_id).is("mapped_product_id", null).is("suggested_product_id", null),
      sb.from("inventory_products").select("id, name, unit")
        .eq("is_active", true).order("name").limit(3000),
    ]);

    const its = (items as Item[]) ?? [];
    const prods = (products as Prod[]) ?? [];
    if (its.length === 0) return json({ suggested: 0, reason: "nothing to suggest" });
    if (prods.length === 0) return json({ suggested: 0, reason: "no catalog" });

    const catalog = prods.map((p, idx) => `${idx}|${p.name}${p.unit ? ` (${p.unit})` : ""}`).join("\n");
    const lines = its.map((it, idx) => `${idx}|${it.description}${it.unit ? ` (${it.unit})` : ""} qty=${it.quantity}`).join("\n");

    const prompt = `Você é um assistente de almoxarifado. Para cada item da nota fiscal abaixo, escolha o ÍNDICE do produto do catálogo do estoque que melhor corresponde. Use confidence 0..1. Se nenhum produto for razoável (confidence<0.5), retorne product_index=-1.

Fornecedor: ${note?.supplier_name ?? "—"}

CATÁLOGO DO ESTOQUE (index|nome):
${catalog}

ITENS DA NOTA (index|descrição):
${lines}

Responda APENAS JSON no formato:
{"matches":[{"item_index":0,"product_index":12,"confidence":0.85}, ...]}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você responde apenas JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: `AI gateway ${aiRes.status}: ${txt}` }, 500);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { matches?: Array<{ item_index: number; product_index: number; confidence: number }> } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const matches = parsed.matches ?? [];

    // Fallback determinístico por token: garante sugestão quando IA retorna -1
    // mas há overlap claro de palavras-chave (ex.: "CORACAO DA ALCATRA" → "BOMBOM ALCATRA").
    const STOPWORDS = new Set([
      "de","da","do","das","dos","e","com","sem","para","por","a","o","os","as","um","uma",
      "kg","g","mg","un","unid","cx","pc","pct","l","ml","lt","fd","fardo","pacote","caixa",
      "tipo","cor","ref","cod","nf","nfe",
    ]);
    const tokenize = (s: string): Set<string> => {
      const norm = s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ");
      const out = new Set<string>();
      for (const t of norm.split(/\s+/)) {
        if (t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t)) out.add(t);
      }
      return out;
    };
    const prodTokens = prods.map((p) => tokenize(p.name));

    let updated = 0;
    const handledItems = new Set<number>();
    for (const m of matches) {
      const item = its[m.item_index];
      const prod = prods[m.product_index];
      handledItems.add(m.item_index);
      if (!item || !prod) continue;
      // aceitar matches fracos (>=0.2) — UI distingue forte (>=0.7) × fraco
      if (!(m.confidence >= 0.2)) continue;
      const { error } = await sb.from("dfe_inbound_items")
        .update({
          suggested_product_id: prod.id,
          suggested_confidence: m.confidence,
        })
        .eq("id", item.id);
      if (!error) updated++;
    }

    // Fallback keyword pra itens sem sugestão da IA
    for (let i = 0; i < its.length; i++) {
      if (handledItems.has(i)) continue;
      const item = its[i];
      const itTokens = tokenize(item.description);
      if (itTokens.size === 0) continue;
      let bestIdx = -1, bestScore = 0;
      for (let p = 0; p < prods.length; p++) {
        let s = 0;
        for (const t of itTokens) if (prodTokens[p].has(t)) s++;
        if (s > bestScore) { bestScore = s; bestIdx = p; }
      }
      if (bestIdx < 0 || bestScore < 1) continue;
      const prod = prods[bestIdx];
      const confidence = Math.min(0.35, 0.2 + bestScore * 0.05);
      const { error } = await sb.from("dfe_inbound_items")
        .update({
          suggested_product_id: prod.id,
          suggested_confidence: confidence,
        })
        .eq("id", item.id);
      if (!error) updated++;
    }

    return json({ suggested: updated, total: its.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
