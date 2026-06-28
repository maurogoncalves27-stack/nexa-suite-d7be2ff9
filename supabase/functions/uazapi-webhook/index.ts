// Webhook público da UazAPI - recebe eventos (mensagens) da instância
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHARED_SECRET = Deno.env.get("UAZAPI_WEBHOOK_SECRET") || "";

function normalizePhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Optional shared-secret check via ?token=...
  if (SHARED_SECRET) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token")
      ?? req.headers.get("x-webhook-token")
      ?? "";
    if (provided !== SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("[uazapi-webhook] payload:", JSON.stringify(body).slice(0, 800));

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // UazAPI envia algo como: { EventType, message: { sender, text, fromMe, ... } } ou similar
    const event = body?.EventType ?? body?.event ?? body?.type ?? "unknown";
    const msg = body?.message ?? body?.data ?? body;

    const fromMe = msg?.fromMe === true || msg?.key?.fromMe === true;
    const phoneRaw = msg?.sender ?? msg?.from ?? msg?.chatid ?? msg?.key?.remoteJid ?? "";
    const text =
      msg?.text ??
      msg?.content?.text ??
      msg?.message?.conversation ??
      msg?.message?.extendedTextMessage?.text ??
      "";

    // Log bruto (best-effort, tabela pode não existir ainda)
    try {
      await supabase.from("uazapi_webhook_log").insert({
        event_type: event,
        from_me: fromMe,
        phone: normalizePhone(String(phoneRaw)),
        text: text ? String(text).slice(0, 2000) : null,
        payload: body,
      });
    } catch (e) {
      // ignora se tabela não existir
    }

    return new Response(JSON.stringify({ ok: true, event, fromMe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[uazapi-webhook] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
