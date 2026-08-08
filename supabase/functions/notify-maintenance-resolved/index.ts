// Notifica o colaborador que abriu o chamado quando o gestor marca como
// resolvido. Envia WhatsApp via send-whatsapp (Z-API) pedindo confirmação
// na Área do Colaborador.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL =
  Deno.env.get("APP_PUBLIC_URL") || "https://nexasuite.aquelaparme.com.br";

function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function sendWhatsapp(phone: string, message: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ phone, message, category: "maintenance_request" }),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id as string | undefined;
    if (!requestId) {
      return new Response(JSON.stringify({ ok: false, error: "request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: reqRow } = await admin
      .from("nutri_maintenance_requests")
      .select("id, store_id, equipment_type, user_id, resolved_note")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) {
      return new Response(JSON.stringify({ ok: false, error: "request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: store }, { data: emp }, { data: pref }] = await Promise.all([
      admin.from("stores").select("id, name").eq("id", reqRow.store_id).maybeSingle(),
      admin
        .from("employees")
        .select("user_id, full_name, phone, status")
        .eq("user_id", reqRow.user_id)
        .maybeSingle(),
      admin
        .from("notification_settings")
        .select("whatsapp_enabled")
        .eq("event_type", "maintenance_request")
        .eq("user_id", reqRow.user_id)
        .maybeSingle(),
    ]);

    if (!emp) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no employee" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pref && pref.whatsapp_enabled === false) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: "opt-out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const phone = normalizePhone(emp.phone);
    if (!phone) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text =
      `✅ *Manutenção resolvida* · ${store?.name || "Loja"}\n` +
      `${reqRow.equipment_type}` +
      (reqRow.resolved_note
        ? `\n${String(reqRow.resolved_note).replace(/\s+/g, " ").trim().slice(0, 120)}`
        : "") +
      `\nConfirme ou reabra na Área do Colaborador.`;

    const r = await sendWhatsapp(phone, text);
    return new Response(JSON.stringify({ ok: true, notified: r.ok ? 1 : 0, result: r }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
