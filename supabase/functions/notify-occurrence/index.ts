// Envia alerta WhatsApp para gestores/admins da loja da ocorrência
// e para destinatários extras configurados em notification_settings.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadAlertConfig, normalizePhone, sendWhatsapp, fanoutExtras } from "../_shared/notifyChannels.ts";
import { pushToUsers } from "../_shared/pushFanout.ts";
import { sendAlertEmails } from "../_shared/emailFanout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL =
  Deno.env.get("APP_PUBLIC_URL") || "https://nexasuite.aquelaparme.com.br";

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

    const shortSummary = summary
      ? String(summary).replace(/\s+/g, " ").trim().slice(0, 140) +
        (String(summary).replace(/\s+/g, " ").trim().length > 140 ? "…" : "")
      : "";
    const text =
      `🚨 *Ocorrência: ${title}*\n` +
      parts.join(" · ").replace(/\*/g, "") +
      (shortSummary ? `\n${shortSummary}` : "");

    // Alvos: gestores da loja (ou todos se sem storeId)
    const targetUserIds: string[] = [];
    for (const m of managers || []) {
      if (m.status && m.status !== "active") continue;
      if (optOut.has(m.user_id)) continue;
      if (storeId) {
        const managesStore =
          !m.store_id || m.store_id === storeId || m.allocated_store_id === storeId;
        if (!managesStore) continue;
      }
      if (m.user_id) targetUserIds.push(m.user_id);
    }

    // Push (in-app + web push) para gestores alvo
    const pushTitle = `🚨 ${title}${storeName ? ` · ${storeName}` : ""}`;
    const pushMsg = [
      orderNumber ? `Pedido #${orderNumber}` : null,
      orderValue != null ? `R$ ${Number(orderValue).toFixed(2).replace(".", ",")}` : null,
      summary || null,
    ].filter(Boolean).join(" · ") || title;
    await pushToUsers(targetUserIds, {
      title: pushTitle,
      message: pushMsg,
      url: "/ocorrencias/relatorio",
      tag: body.alert_id ? `occ-${body.alert_id}` : `occ-${Date.now()}`,
      category: "occurrence",
    });

    const { enabled, waConfig, extras } = await loadAlertConfig(admin, "occurrence");
    if (!enabled || !waConfig) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, push: targetUserIds.length, reason: "whatsapp_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sent = new Set<string>();
    const results: Array<{ target: string; ok: boolean }> = [];
    for (const m of managers || []) {
      if (m.status && m.status !== "active") continue;
      if (optOut.has(m.user_id)) continue;
      if (storeId) {
        const managesStore =
          !m.store_id || m.store_id === storeId || m.allocated_store_id === storeId;
        if (!managesStore) continue;
      }
      const phone = normalizePhone(m.phone);
      if (!phone || sent.has(phone)) continue;
      const r = await sendWhatsapp(waConfig, phone, text);
      sent.add(phone);
      results.push({ target: m.user_id, ok: !!r.ok });
    }

    const extrasOk = await fanoutExtras(waConfig, extras, text, sent);

    // E-mail (destinatários configurados por alerta)
    const emailBody = [
      storeName ? `Loja: ${storeName}` : null,
      orderNumber ? `Pedido: #${orderNumber}` : null,
      orderValue != null ? `Valor: R$ ${Number(orderValue).toFixed(2).replace(".", ",")}` : null,
      reporterName ? `Relatou: ${reporterName}` : null,
      summary || null,
    ].filter(Boolean).join("\n");
    const emailsOk = await sendAlertEmails("occurrence", {
      title: `Ocorrência: ${title}`,
      message: emailBody,
      category: "Ocorrência",
      severity: "warning",
    }, admin);

    return new Response(
      JSON.stringify({
        ok: true,
        notified: results.filter((r) => r.ok).length + extrasOk,
        managers: results,
        extras_notified: extrasOk,
        emails_notified: emailsOk,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
