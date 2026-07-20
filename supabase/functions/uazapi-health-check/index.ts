// Checa status da instância UAZAPI. Se cair, dispara SMS 1x por queda.
// Rodar a cada 10min via pg_cron.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
const TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "";

// Mauro (super-usuário)
const ALERT_PHONE = "61998158029";
const ALERT_USER_ID = "ec5e52b2-a4c3-46c7-8d11-a5b6cf406866";
const HEALTH_KEY = "uazapi_instance";

function isConnected(body: any): boolean {
  const s = String(body?.instance?.status ?? body?.status ?? body?.state ?? "").toLowerCase();
  return s === "connected" || s === "open" || s === "online";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date().toISOString();

  let currentStatus = "unknown";
  let details: any = null;
  try {
    if (!BASE_URL || !TOKEN) throw new Error("UAZAPI env vars ausentes");
    const res = await fetch(`${BASE_URL}/instance/status`, { headers: { token: TOKEN } });
    const text = await res.text();
    try { details = JSON.parse(text); } catch { details = { raw: text }; }
    if (!res.ok) {
      currentStatus = "offline";
    } else {
      currentStatus = isConnected(details) ? "online" : "offline";
    }
  } catch (e) {
    currentStatus = "offline";
    details = { error: String(e) };
  }

  // Estado anterior
  const { data: prev } = await admin
    .from("system_health_state")
    .select("status")
    .eq("key", HEALTH_KEY)
    .maybeSingle();
  const prevStatus = prev?.status ?? "unknown";
  const changed = prevStatus !== currentStatus;

  await admin.from("system_health_state").upsert({
    key: HEALTH_KEY,
    status: currentStatus,
    last_checked_at: now,
    last_changed_at: changed ? now : (prev ? undefined : now),
    details,
  }, { onConflict: "key" });

  let alertSent = false;
  if (changed && currentStatus === "offline") {
    const message =
      `🚨 NEXA: WhatsApp (UAZAPI) caiu. ` +
      `Sem envio de mensagens até reconectar. ` +
      `Acesse o painel UAZAPI e escaneie o QR.`;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          user_id: ALERT_USER_ID,
          phone: ALERT_PHONE,
          message,
          category: "system_health",
          tag: "uazapi-offline",
        }),
      });
      alertSent = r.ok;
      if (!r.ok) console.error("send-sms falhou", r.status, await r.text());
    } catch (e) {
      console.error("send-sms exception", e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, currentStatus, prevStatus, changed, alertSent }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
