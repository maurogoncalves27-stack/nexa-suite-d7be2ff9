// Envia alerta WhatsApp para gestores/admins da loja da ocorrência.
// Filtra por loja (admin sem loja recebe tudo) e respeita opt-out em
// notification_settings (event_type = 'occurrence').
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
  if (!UAZAPI_BASE || !UAZAPI_TOKEN) return { ok: false, error: "UAZAPI not configured" };
  try {
    const res = await fetch(`${UAZAPI_BASE}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, text: message }),
    });
    const t = await res.text();
    return { ok: res.ok, status: res.status, body: t };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

interface Body {
  alert_id?: string;
  store_id?: string | null;
  store_name?: string | null;
  occurrence_title?: string;
  summary?: string;
  order_number?: string | null;
  order_value?: number | null;
  reporter_name?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let storeId = body.store_id ?? null;
    let storeName = body.store_name ?? null;
    let title = body.occurrence_title ?? "Ocorrência";
    let summary = body.summary ?? "";
    let orderNumber = body.order_number ?? null;
    let orderValue = body.order_value ?? null;
    let reporterName = body.reporter_name ?? null;

    // Se veio alert_id, hidrata a partir do banco (fonte da verdade)
    if (body.alert_id) {
      const { data: alert } = await admin
        .from("occurrence_alerts")
        .select("id, store_id, occurrence_id, created_by, note, order_number, order_value, subcategory")
        .eq("id", body.alert_id)
        .maybeSingle();
      if (alert) {
        storeId = alert.store_id ?? storeId;
        orderNumber = orderNumber ?? alert.order_number;
        orderValue = orderValue ?? alert.order_value;
        if (!summary && alert.note) summary = String(alert.note).split("\n")[0].slice(0, 180);

        const { data: occ } = await admin
          .from("occurrences")
          .select("occurrence")
          .eq("id", alert.occurrence_id)
          .maybeSingle();
        if (occ?.occurrence && !body.occurrence_title) title = occ.occurrence;

        if (!reporterName && alert.created_by) {
          const { data: emp } = await admin
            .from("employees")
            .select("full_name")
            .eq("user_id", alert.created_by)
            .maybeSingle();
          reporterName = emp?.full_name ?? null;
        }
      }
    }

    if (storeId && !storeName) {
      const { data: s } = await admin
        .from("stores")
        .select("name")
        .eq("id", storeId)
        .maybeSingle();
      storeName = s?.name ?? storeName;
    }

    // Gestores/admins
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    const managerUserIds = Array.from(
      new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean)),
    );
    if (managerUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no managers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: managers } = await admin
      .from("employees")
      .select("user_id, full_name, phone, store_id, allocated_store_id, status")
      .in("user_id", managerUserIds);

    // Opt-out
    const { data: prefs } = await admin
      .from("notification_settings")
      .select("user_id, whatsapp_enabled, event_type")
      .eq("event_type", "occurrence");
    const optOut = new Set(
      (prefs || [])
        .filter((p: any) => p.whatsapp_enabled === false)
        .map((p: any) => p.user_id),
    );

    const parts = [
      storeName ? `*Loja:* ${storeName}` : null,
      orderNumber ? `*Pedido:* #${orderNumber}` : null,
      orderValue !== null && orderValue !== undefined
        ? `*Valor:* R$ ${Number(orderValue).toFixed(2).replace(".", ",")}`
        : null,
      reporterName ? `*Relatou:* ${reporterName}` : null,
    ].filter(Boolean);

    const text =
      `🚨 *Ocorrência: ${title}*\n\n` +
      parts.join("\n") +
      (summary ? `\n\n${summary}` : "") +
      `\n\nAbrir: ${APP_BASE_URL}/ocorrencias/relatorio`;

    const results: Array<{ user_id: string; ok: boolean }> = [];
    for (const m of managers || []) {
      if (m.status && m.status !== "active") continue;
      if (optOut.has(m.user_id)) continue;
      // Se a ocorrência tem loja: só gestor daquela loja; admin sem loja recebe tudo.
      if (storeId) {
        const managesStore =
          !m.store_id ||
          m.store_id === storeId ||
          m.allocated_store_id === storeId;
        if (!managesStore) continue;
      }
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
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
