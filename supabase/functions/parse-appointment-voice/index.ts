// Interpreta texto de voz e extrai dados de um compromisso para a agenda.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;

  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || text.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Texto vazio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");

    // Data/hora local de Brasília (UTC-3) sem DST.
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const nowIso = brt.toISOString().slice(0, 19); // yyyy-mm-ddTHH:MM:SS
    const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const todayLabel = `${weekdays[brt.getUTCDay()]} ${brt.toISOString().slice(0, 10)}`;

    const system = `Você é um assistente que extrai compromissos de agenda a partir de fala em português do Brasil.
Hoje é ${todayLabel}. Hora atual (horário de Brasília): ${nowIso}.
Resolva expressões relativas ("amanhã", "sexta que vem", "daqui 2 horas", "às 14h", "9 da manhã") usando essa referência.
Sempre devolva start_at no formato YYYY-MM-DDTHH:MM (sem timezone, horário de Brasília).
Se não houver horário explícito, assuma 09:00.
Se não houver duração, deixe end_at vazio.
title curto e descritivo. description opcional com detalhes extras.
location se o usuário mencionar lugar físico; meeting_url se mencionar link/online/zoom/meet.
Responda APENAS JSON, sem markdown.`;

    const schema = `{"title":"string","description":"string","location":"string","meeting_url":"string","start_at":"YYYY-MM-DDTHH:MM","end_at":"YYYY-MM-DDTHH:MM ou vazio","summary":"frase curta confirmando o que entendeu, em português"}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${system}\n\nResponda no schema: ${schema}` },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: `IA falhou: ${aiResp.status} ${t}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    return new Response(
      JSON.stringify({
        title: parsed.title ?? "",
        description: parsed.description ?? "",
        location: parsed.location ?? "",
        meeting_url: parsed.meeting_url ?? "",
        start_at: parsed.start_at ?? "",
        end_at: parsed.end_at ?? "",
        summary: parsed.summary ?? "",
        original_text: text,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao interpretar";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
