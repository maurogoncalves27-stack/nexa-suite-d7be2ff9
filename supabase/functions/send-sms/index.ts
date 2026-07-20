// Envia SMS via TextBee (https://textbee.dev). Espelha o padrão do send-whatsapp.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  user_id?: string;
  employee_id?: string;
  phone?: string;
  message: string;
  category?: string;
  tag?: string;
  sender_id?: string;
}

// TextBee espera E.164 com '+' (ex.: +5561999999999)
function normalizePhoneE164(raw: string): string | null {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length >= 12 && digits.startsWith("55")) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return null;
}

async function sendViaTextBee(
  creds: { apiKey: string; deviceId: string },
  phone: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds.apiKey || !creds.deviceId) return { ok: false, error: "TextBee não configurado (api_key/device_id)" };
  const url = `https://api.textbee.dev/api/v1/gateway/devices/${creds.deviceId}/send-sms`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": creds.apiKey },
      body: JSON.stringify({ recipients: [phone], message }),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok) return { ok: false, error: `TextBee ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, id: json?.data?.smsBatchId ?? json?.smsBatchId ?? json?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

async function resolveSmsCreds(
  admin: ReturnType<typeof createClient>,
  senderId?: string,
): Promise<{ apiKey: string; deviceId: string; sender_id: string | null }> {
  if (senderId) {
    const { data } = await admin.from("sms_senders")
      .select("id, api_key, device_id, active").eq("id", senderId).maybeSingle();
    if (data && data.active) return { apiKey: data.api_key, deviceId: data.device_id, sender_id: data.id };
  }
  const { data: def } = await admin.from("sms_senders")
    .select("id, api_key, device_id").eq("is_default", true).eq("active", true).maybeSingle();
  if (def) return { apiKey: def.api_key, deviceId: def.device_id, sender_id: def.id };
  return { apiKey: "", deviceId: "", sender_id: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = !!SERVICE_ROLE && token === SERVICE_ROLE;
  if (!isServiceRole) {
    const authCheck = await requireRole(req, ["admin", "manager", "hr"], corsHeaders);
    if (!authCheck.ok) return authCheck.response!;
  }

  try {
    const body = (await req.json()) as Body;
    if (!body?.message) {
      return new Response(JSON.stringify({ error: "message é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let phone = body.phone ?? "";
    let employeeId = body.employee_id ?? null;

    if (!phone && body.user_id) {
      const { data: emp } = await admin.from("employees")
        .select("id, phone").eq("user_id", body.user_id).maybeSingle();
      if (emp) { phone = emp.phone ?? ""; employeeId = emp.id; }
    } else if (employeeId && !phone) {
      const { data: emp } = await admin.from("employees")
        .select("phone").eq("id", employeeId).maybeSingle();
      if (emp) phone = emp.phone ?? "";
    }

    const normalized = normalizePhoneE164(phone);
    if (!normalized) {
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "invalid-phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve remetente por categoria se não veio explícito
    let effectiveSenderId = body.sender_id;
    if (!effectiveSenderId && body.category) {
      const { data: setting } = await admin.from("notification_settings")
        .select("sms_sender_id, sms_enabled").eq("alert_key", body.category).maybeSingle();
      if (setting && setting.sms_enabled === false) {
        return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "sms-disabled-for-category" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (setting?.sms_sender_id) effectiveSenderId = setting.sms_sender_id;
    }

    const creds = await resolveSmsCreds(admin, effectiveSenderId);
    if (!creds.apiKey) {
      return new Response(JSON.stringify({ ok: false, status: "failed", error: "Nenhum gateway SMS configurado" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendViaTextBee(creds, normalized, body.message);
    return new Response(JSON.stringify({ ok: result.ok, status: result.ok ? "sent" : "failed", error: result.error, id: result.id }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-sms error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
