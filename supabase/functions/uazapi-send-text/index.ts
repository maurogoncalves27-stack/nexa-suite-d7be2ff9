// Envia mensagem WhatsApp via UazAPI (https://docs.uazapi.com)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
const TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "";

function normalizePhone(raw: string): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!BASE_URL || !TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: "UAZAPI_BASE_URL/UAZAPI_INSTANCE_TOKEN ausentes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone || "");
    const message = (body?.message || "").toString();
    if (!phone || !message) {
      return new Response(
        JSON.stringify({ ok: false, error: "phone e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const res = await fetch(`${BASE_URL}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: TOKEN },
      body: JSON.stringify({ number: phone, text: message }),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }
    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, response: json ?? text }),
      { status: res.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
