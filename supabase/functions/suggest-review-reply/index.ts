import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { requireRole } from "../_shared/requireRole.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "manager"], corsHeaders);
  if (!auth.ok) return auth.response!;





  try {
    const { rating, comment, customer_name, brand, store, source } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const tone =
      Number(rating) >= 4
        ? "Agradeça com simpatia e convide o cliente a voltar."
        : Number(rating) === 3
          ? "Reconheça o feedback, peça desculpas pelo que não foi 100% e mostre disposição para melhorar."
          : "Peça desculpas com sinceridade, NÃO seja defensivo, ofereça contato direto para resolver e mostre que vai investigar internamente.";

    const sys = `Você é gerente de relacionamento de uma rede de pizzarias chamada AQUELA PARMÊ.
Escreva uma resposta curta (3-5 linhas, máx 500 caracteres), em português brasileiro, calorosa e humana, para uma avaliação pública de cliente em ${source ?? "canal online"}.
${tone}
Não invente fatos. Não prometa cupons/desconto. Não use emojis em excesso (no máximo 1).
Trate pelo primeiro nome se disponível. Assine como "Equipe Aquela Parmê${store ? ` – ${store}` : ""}".`;

    const user = `Loja/Marca: ${brand ?? "—"}${store ? " / " + store : ""}
Nota: ${rating ?? "—"}/5
Cliente: ${customer_name ?? "anônimo"}
Comentário: """${comment ?? ""}"""

Gere apenas o texto da resposta.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (r.status === 429)
      return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente em instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (r.status === 402)
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (!r.ok) {
      const t = await r.text();
      console.error("AI gateway error", r.status, t);
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const suggestion = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
