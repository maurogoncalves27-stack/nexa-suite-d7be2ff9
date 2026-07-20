// Envia mensagem WhatsApp via provedor configurado (Z-API por padrão).
// Adapter-pattern para permitir trocar para Meta Cloud API no futuro sem refactor.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Z-API env fallback
const ENV_ZAPI = {
  instanceId: Deno.env.get("ZAPI_INSTANCE_ID") ?? "",
  token: Deno.env.get("ZAPI_TOKEN") ?? "",
  clientToken: Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "",
};
// UAZAPI env fallback
const ENV_UAZAPI = {
  baseUrl: (Deno.env.get("UAZAPI_BASE_URL") ?? "").replace(/\/+$/, ""),
  token: Deno.env.get("UAZAPI_INSTANCE_TOKEN") ?? "",
};

type SenderCreds =
  | { provider: "zapi"; instanceId: string; token: string; clientToken: string; sender_id: string | null }
  | { provider: "uazapi"; baseUrl: string; token: string; sender_id: string | null };

interface Body {
  user_id?: string;
  employee_id?: string;
  phone?: string;
  message: string;
  category?: string;
  tag?: string;
  sender_id?: string;
}

// Normaliza para formato E.164 sem '+', com DDI 55 padrão Brasil
function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  // Já tem DDI
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  // 10 ou 11 dígitos (DDD + número) -> prefixa 55
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  // Caso já venha completo internacional sem 55, devolve como está se tiver tamanho razoável
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

async function sendViaZapi(
  creds: { instanceId: string; token: string; clientToken: string },
  phone: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds.instanceId || !creds.token || !creds.clientToken) {
    return { ok: false, error: "Z-API não configurada (faltam credenciais)" };
  }
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": creds.clientToken },
      body: JSON.stringify({ phone, message }),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok) return { ok: false, error: `Z-API ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, id: json.messageId ?? json.id ?? json.zaapId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

async function sendViaUazapi(
  creds: { baseUrl: string; token: string },
  phone: string,
  message: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!creds.baseUrl || !creds.token) {
    return { ok: false, error: "UAZAPI não configurada (faltam credenciais)" };
  }
  const url = `${creds.baseUrl.replace(/\/+$/, "")}/send/text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: creds.token },
      body: JSON.stringify({ number: phone, text: message }),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok) return { ok: false, error: `UAZAPI ${res.status}: ${text.slice(0, 300)}` };
    return { ok: true, id: json?.messageid ?? json?.id ?? json?.key?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

async function resolveSenderCreds(
  admin: ReturnType<typeof createClient>,
  senderId?: string,
): Promise<SenderCreds> {
  const cols = "id, provider, zapi_instance_id, zapi_token, zapi_client_token, uazapi_base_url, uazapi_token, active";
  if (senderId) {
    const { data } = await admin.from("whatsapp_senders").select(cols).eq("id", senderId).maybeSingle();
    if (data && (data as any).active) return buildCreds(data);
  }
  const { data: def } = await admin
    .from("whatsapp_senders").select(cols).eq("is_default", true).eq("active", true).maybeSingle();
  if (def) return buildCreds(def);
  // env fallback: prefer zapi if configured, else uazapi
  if (ENV_ZAPI.instanceId) return { provider: "zapi", ...ENV_ZAPI, sender_id: null };
  return { provider: "uazapi", baseUrl: ENV_UAZAPI.baseUrl, token: ENV_UAZAPI.token, sender_id: null };
}

function buildCreds(row: any): SenderCreds {
  const provider = (row.provider ?? "zapi") as "zapi" | "uazapi";
  if (provider === "uazapi") {
    return { provider: "uazapi", baseUrl: row.uazapi_base_url ?? "", token: row.uazapi_token ?? "", sender_id: row.id };
  }
  return { provider: "zapi", instanceId: row.zapi_instance_id ?? "", token: row.zapi_token ?? "", clientToken: row.zapi_client_token ?? "", sender_id: row.id };
}

async function sendByProvider(creds: SenderCreds, phone: string, message: string) {
  if (creds.provider === "zapi") return await sendViaZapi(creds, phone, message);
  if (creds.provider === "uazapi") return await sendViaUazapi(creds, phone, message);
  return { ok: false, error: `Provider desconhecido` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authorize caller: allow internal service_role invocations (other edge functions)
  // OR authenticated users with admin/manager/hr role. Block plain employees from
  // sending arbitrary WhatsApp messages to any phone number.
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

    // Resolve telefone + opt-out
    let phone = body.phone ?? "";
    let employeeId = body.employee_id ?? null;
    let optOut = false;

    if (!phone && body.user_id) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, phone, whatsapp_opt_out")
        .eq("user_id", body.user_id)
        .maybeSingle();
      if (emp) {
        phone = emp.phone ?? "";
        employeeId = emp.id;
        optOut = !!emp.whatsapp_opt_out;
      }
    } else if (employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .select("phone, whatsapp_opt_out, user_id")
        .eq("id", employeeId)
        .maybeSingle();
      if (emp) {
        if (!phone) phone = emp.phone ?? "";
        optOut = !!emp.whatsapp_opt_out;
      }
    }

    const normalized = normalizePhone(phone);

    // skip cases
    if (optOut) {
      await admin.from("whatsapp_notifications_log").insert({
        user_id: body.user_id ?? null, employee_id: employeeId, phone: normalized,
        message: body.message, category: body.category, tag: body.tag,
        provider: "unknown", status: "skipped", error: "opt-out",
      });
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "opt-out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!normalized) {
      await admin.from("whatsapp_notifications_log").insert({
        user_id: body.user_id ?? null, employee_id: employeeId, phone: phone || null,
        message: body.message, category: body.category, tag: body.tag,
        provider: "unknown", status: "skipped", error: "telefone inválido ou ausente",
      });
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "invalid-phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolver remetente: sender_id explícito > categoria (notification_settings) > default > env
    let effectiveSenderId = body.sender_id;
    if (!effectiveSenderId && body.category) {
      const { data: setting } = await admin
        .from("notification_settings")
        .select("whatsapp_sender_id, whatsapp_enabled")
        .eq("alert_key", body.category)
        .maybeSingle();
      if (setting && setting.whatsapp_enabled === false) {
        return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "whatsapp-disabled-for-category" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (setting?.whatsapp_sender_id) effectiveSenderId = setting.whatsapp_sender_id;
    }
    const creds = await resolveSenderCreds(admin, effectiveSenderId);
    const result = await sendByProvider(creds, normalized, body.message);

    await admin.from("whatsapp_notifications_log").insert({
      user_id: body.user_id ?? null, employee_id: employeeId, phone: normalized,
      message: body.message, category: body.category, tag: body.tag,
      provider: creds.provider,
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.id ?? null,
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    return new Response(JSON.stringify({ ok: result.ok, status: result.ok ? "sent" : "failed", error: result.error }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-whatsapp error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
