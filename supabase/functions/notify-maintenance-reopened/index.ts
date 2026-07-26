// Notifica gestores/admins da loja quando a loja reabre um chamado que o
// gestor havia marcado como resolvido.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const UAZAPI_BASE = (Deno.env.get("UAZAPI_BASE_URL") || "").replace(/\/+$/, "");
const UAZAPI_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "";
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
  if (!UAZAPI_BASE || !UAZAPI_TOKEN) return { ok: false };
  const res = await fetch(`${UAZAPI_BASE}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: phone, text: message }),
  });
  return { ok: res.ok, status: res.status };
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
      .select("id, store_id, equipment_type, user_id, reopen_reason")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) {
      return new Response(JSON.stringify({ ok: false, error: "request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: store }, { data: reporter }] = await Promise.all([
      admin.from("stores").select("id, name").eq("id", reqRow.store_id).maybeSingle(),
      admin
        .from("employees")
        .select("full_name")
        .eq("user_id", reqRow.user_id)
        .maybeSingle(),
    ]);

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);
    const managerUserIds = Array.from(
      new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean)),
    );
    if (managerUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: managers } = await admin
      .from("employees")
      .select("user_id, full_name, phone, store_id, allocated_store_id, status")
      .in("user_id", managerUserIds);

    const { data: prefs } = await admin
      .from("notification_settings")
      .select("user_id, whatsapp_enabled")
      .eq("event_type", "maintenance_request");
    const optOut = new Set(
      (prefs || []).filter((p: any) => p.whatsapp_enabled === false).map((p: any) => p.user_id),
    );

    const text =
      `⚠️ *Manutenção reaberta pela loja*\n\n` +
      `*Loja:* ${store?.name || "Loja"}\n` +
      `*Equipamento:* ${reqRow.equipment_type}\n` +
      (reporter?.full_name ? `*Loja quem reabriu:* ${reporter.full_name}\n` : "") +
      (reqRow.reopen_reason ? `*Motivo:* ${reqRow.reopen_reason}\n` : "") +
      `\nAcesse: ${APP_BASE_URL}/area-gestor`;

    const results: Array<{ user_id: string; ok: boolean }> = [];
    for (const m of managers || []) {
      if (m.status && m.status !== "active") continue;
      if (optOut.has(m.user_id)) continue;
      const managesStore =
        !m.store_id ||
        m.store_id === reqRow.store_id ||
        m.allocated_store_id === reqRow.store_id;
      if (!managesStore) continue;
      const phone = normalizePhone(m.phone);
      if (!phone) {
        results.push({ user_id: m.user_id, ok: false });
        continue;
      }
      const r = await sendWhatsapp(phone, text);
      results.push({ user_id: m.user_id, ok: !!r.ok });
    }

    return new Response(
      JSON.stringify({ ok: true, notified: results.filter((r) => r.ok).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
