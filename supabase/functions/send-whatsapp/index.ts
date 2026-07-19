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
const PROVIDER = (Deno.env.get("WHATSAPP_PROVIDER") ?? "zapi").toLowerCase();

// Z-API (fallback vindo de env; pode ser sobrescrito por remetente configurado no DB)
const ENV_ZAPI = {
  instanceId: Deno.env.get("ZAPI_INSTANCE_ID") ?? "",
  token: Deno.env.get("ZAPI_TOKEN") ?? "",
  clientToken: Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "",
};

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
      headers: {
        "Content-Type": "application/json",
        "Client-Token": creds.clientToken,
      },
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

async function resolveSenderCreds(
  admin: ReturnType<typeof createClient>,
  senderId?: string,
): Promise<{ instanceId: string; token: string; clientToken: string; sender_id: string | null }> {
  // 1) explicit sender_id
  if (senderId) {
    const { data } = await admin
      .from("whatsapp_senders")
      .select("id, zapi_instance_id, zapi_token, zapi_client_token, active")
      .eq("id", senderId)
      .maybeSingle();
    if (data && data.active) {
      return { instanceId: data.zapi_instance_id, token: data.zapi_token, clientToken: data.zapi_client_token, sender_id: data.id };
    }
  }
  // 2) default ativo
  const { data: def } = await admin
    .from("whatsapp_senders")
    .select("id, zapi_instance_id, zapi_token, zapi_client_token")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  if (def) {
    return { instanceId: def.zapi_instance_id, token: def.zapi_token, clientToken: def.zapi_client_token, sender_id: def.id };
  }
  // 3) fallback env
  return { ...ENV_ZAPI, sender_id: null };
}

async function sendByProvider(creds: { instanceId: string; token: string; clientToken: string }, phone: string, message: string) {
  if (PROVIDER === "zapi") return await sendViaZapi(creds, phone, message);
  return { ok: false, error: `Provider '${PROVIDER}' não implementado` };
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
        provider: PROVIDER, status: "skipped", error: "opt-out",
      });
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "opt-out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!normalized) {
      await admin.from("whatsapp_notifications_log").insert({
        user_id: body.user_id ?? null, employee_id: employeeId, phone: phone || null,
        message: body.message, category: body.category, tag: body.tag,
        provider: PROVIDER, status: "skipped", error: "telefone inválido ou ausente",
      });
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "invalid-phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendByProvider(normalized, body.message);

    await admin.from("whatsapp_notifications_log").insert({
      user_id: body.user_id ?? null, employee_id: employeeId, phone: normalized,
      message: body.message, category: body.category, tag: body.tag,
      provider: PROVIDER,
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
