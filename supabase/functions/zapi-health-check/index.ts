// Verifica status das instâncias Z-API e envia SMS se algum WhatsApp cair.
// Executado por cron (a cada 10 minutos).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { sendAlertEmails } from "../_shared/emailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COOLDOWN_HOURS = 3;

interface Sender {
  id: string;
  label: string;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  last_alert_at: string | null;
  last_alert_status: string | null;
}

async function checkZapi(s: Sender): Promise<{ status: "connected" | "disconnected" | "not_found" | "error"; detail?: string }> {
  if (!s.zapi_instance_id || !s.zapi_token) return { status: "error", detail: "credenciais ausentes" };
  const url = `https://api.z-api.io/instances/${s.zapi_instance_id}/token/${s.zapi_token}/status`;
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(s.zapi_client_token ? { "Client-Token": s.zapi_client_token } : {}) },
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* */ }
    if (res.status === 404 || /instance not found/i.test(text)) return { status: "not_found", detail: text.slice(0, 200) };
    if (!res.ok) return { status: "error", detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    const connected = json?.connected === true;
    return { status: connected ? "connected" : "disconnected", detail: text.slice(0, 200) };
  } catch (e: any) {
    return { status: "error", detail: e?.message ?? "fetch error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: senders } = await admin
    .from("whatsapp_senders")
    .select("id,label,zapi_instance_id,zapi_token,zapi_client_token,last_alert_at,last_alert_status")
    .eq("active", true)
    .eq("provider", "zapi");

  const { data: settings } = await admin
    .from("notification_settings")
    .select("sms_enabled, sms_sender_id, extra_recipients")
    .eq("alert_key", "whatsapp_health")
    .maybeSingle();

  const smsEnabled = settings?.sms_enabled ?? true;
  const smsSenderId = settings?.sms_sender_id ?? null;
  const rawRecipients = Array.isArray(settings?.extra_recipients) ? settings!.extra_recipients : [];
  const recipients: string[] = rawRecipients
    .map((r: any) => (typeof r === "string" ? r : r?.phone))
    .filter((p: any) => typeof p === "string" && p.trim().length >= 8);

  const now = new Date();
  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
  const results: any[] = [];

  for (const s of (senders ?? []) as Sender[]) {
    const check = await checkZapi(s);
    const currentBad = check.status === "disconnected" || check.status === "not_found" || check.status === "error";
    const prevBad = s.last_alert_status && s.last_alert_status !== "connected";
    let shouldAlert = false;
    let alertMessage = "";

    if (currentBad) {
      const cooled = !s.last_alert_at || (now.getTime() - new Date(s.last_alert_at).getTime()) > cooldownMs;
      const statusChanged = s.last_alert_status !== check.status;
      if (cooled || statusChanged) {
        shouldAlert = true;
        const reason = check.status === "not_found" ? "instância não encontrada"
          : check.status === "disconnected" ? "celular offline / sessão expirada"
          : "erro ao consultar status";
        alertMessage = `[NEXA] WhatsApp "${s.label}" caiu: ${reason}. Reconecte o QR em Configurações → WhatsApp.`;
      }
    } else if (check.status === "connected" && prevBad) {
      shouldAlert = true;
      alertMessage = `[NEXA] WhatsApp "${s.label}" voltou a conectar.`;
    }

    if (shouldAlert && smsEnabled && recipients.length > 0) {
      for (const phone of recipients) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
            body: JSON.stringify({
              phone,
              message: alertMessage,
              category: "whatsapp_health",
              tag: `zapi-${s.id}-${check.status}`,
              sender_id: smsSenderId,
            }),
          });
        } catch (e) {
          console.error("send-sms failed", phone, e);
        }
      }
    }

    if (shouldAlert) {
      await sendAlertEmails("whatsapp_health", {
        title: check.status === "connected"
          ? `WhatsApp "${s.label}" voltou a conectar`
          : `WhatsApp "${s.label}" desconectado`,
        message: alertMessage,
        category: "WhatsApp",
        severity: check.status === "connected" ? "info" : "critical",
      }, admin);
    }

    await admin.from("whatsapp_senders").update({
      last_status: check.status,
      last_checked_at: now.toISOString(),
      ...(shouldAlert ? { last_alert_at: now.toISOString(), last_alert_status: check.status } : {}),
    }).eq("id", s.id);

    results.push({ id: s.id, label: s.label, status: check.status, alerted: shouldAlert });
  }

  return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
