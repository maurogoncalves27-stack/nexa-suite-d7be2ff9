// Alerta gestores sobre falhas de saúde operacional por ponto de venda:
// - Fiscal: NFC-e rejeitada/erro nas últimas 24h ou última emissão com erro
// - TEF: maquininha com muitos erros/recusas ou provider inativo com vendas
// - Vendas paradas: nenhum pedido nas últimas 3h dentro do horário de operação
// Roda via cron a cada 30 min. Deduplica por (loja, tipo, dia).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";
import { loadAlertConfig, normalizePhone, sendWhatsapp, fanoutExtras } from "../_shared/notifyChannels.ts";
import { pushToUsers } from "../_shared/pushFanout.ts";
import { sendAlertEmails } from "../_shared/emailFanout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TZ = "America/Sao_Paulo";
const ALERT_KEY = "operational_health";
const APP_BASE_URL = Deno.env.get("APP_PUBLIC_URL") || "https://nexasuite.aquelaparme.com.br";

// Janela de operação considerada para "vendas paradas" (minutos do dia, horário de Brasília)
const OPEN_MINUTES = 11 * 60 + 30;
const CLOSE_MINUTES = 22 * 60;
const STALE_SALES_HOURS = 3;

type HealthRow = {
  store_id: string;
  store_name: string;
  last_order_at: string | null;
  orders_today: number;
  revenue_today: number;
  last_invoice_at: string | null;
  last_invoice_status: string | null;
  invoice_errors_24h: number;
  tef_provider: string | null;
  tef_active: boolean;
  last_tef_at: string | null;
  last_tef_status: string | null;
  tef_errors_24h: number;
};

type Issue = { type: string; label: string; detail: string; severity: "warning" | "critical" };

function nowInTz() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const [hh, mm] = timeStr.split(":").map(Number);
  return { dateStr, minutes: hh * 60 + mm, now };
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

function detectIssues(row: HealthRow, minutes: number, now: Date): Issue[] {
  const issues: Issue[] = [];

  const invoiceBad = row.last_invoice_status === "error" || row.last_invoice_status === "rejected";
  if (invoiceBad || row.invoice_errors_24h >= 3) {
    issues.push({
      type: "fiscal",
      label: "Cupom fiscal (NFC-e) com falha",
      detail: `${row.invoice_errors_24h} erro(s) nas últimas 24h${invoiceBad ? ` · última emissão: ${row.last_invoice_status}` : ""}`,
      severity: invoiceBad ? "critical" : "warning",
    });
  }

  const tefBad = row.last_tef_status === "error";
  if (tefBad || row.tef_errors_24h >= 5) {
    issues.push({
      type: "tef",
      label: "Maquininha (TEF) com falha",
      detail: `${row.tef_errors_24h} erro/recusa nas últimas 24h${row.tef_provider ? ` · ${row.tef_provider}` : ""}`,
      severity: tefBad ? "critical" : "warning",
    });
  }

  if (row.tef_provider && !row.tef_active) {
    issues.push({
      type: "tef_inactive",
      label: "TEF desativado",
      detail: `Provedor ${row.tef_provider} está configurado mas inativo — a loja não consegue receber no cartão.`,
      severity: "critical",
    });
  }

  const openNow = minutes >= OPEN_MINUTES + STALE_SALES_HOURS * 60 && minutes <= CLOSE_MINUTES;
  if (openNow) {
    const h = hoursSince(row.last_order_at, now);
    if (h === null || h >= STALE_SALES_HOURS) {
      issues.push({
        type: "sales_stalled",
        label: "Vendas paradas",
        detail: h === null
          ? "Nenhum pedido registrado neste ponto de venda."
          : `Último pedido há ${h.toFixed(1)}h · ${row.orders_today} pedido(s) hoje`,
        severity: "warning",
      });
    }
  }

  return issues;
}

async function resolveManagers(supabase: any, storeId: string | null): Promise<string[]> {
  const ids = new Set<string>();
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  for (const r of admins ?? []) ids.add(r.user_id);
  const { data: managers } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
  const managerIds = (managers ?? []).map((r: any) => r.user_id);
  if (managerIds.length > 0) {
    if (storeId) {
      const { data: storeManagers } = await supabase
        .from("employees").select("user_id").in("user_id", managerIds).eq("status", "active")
        .or(`store_id.eq.${storeId},allocated_store_id.eq.${storeId}`);
      for (const m of storeManagers ?? []) if (m.user_id) ids.add(m.user_id);
    } else {
      for (const id of managerIds) ids.add(id);
    }
  }
  return Array.from(ids);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager"], corsHeaders);
  if (!auth.ok) return auth.response!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { dateStr, minutes, now } = nowInTz();

  try {
    const { data: rows, error } = await supabase.rpc("operational_health_snapshot");
    if (error) {
      console.error("[operational-health-alerts] snapshot falhou:", error.message);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const health = (rows ?? []) as HealthRow[];
    const { data: sent } = await supabase
      .from("operational_health_alerts_sent")
      .select("store_id, alert_type")
      .eq("alert_date", dateStr)
      .limit(2000);
    const already = new Set((sent ?? []).map((s: any) => `${s.store_id}|${s.alert_type}`));

    const { enabled: waEnabled, waConfig, extras } = await loadAlertConfig(supabase, ALERT_KEY);
    const { data: settings } = await supabase
      .from("notification_settings").select("push_enabled").eq("alert_key", ALERT_KEY).maybeSingle();
    const pushEnabled = settings?.push_enabled ?? true;

    let notified = 0;
    let storesWithIssues = 0;

    for (const row of health) {
      const issues = detectIssues(row, minutes, now).filter(
        (i) => !already.has(`${row.store_id}|${i.type}`),
      );
      if (issues.length === 0) continue;
      storesWithIssues++;

      const critical = issues.some((i) => i.severity === "critical");
      const icon = critical ? "🚨" : "⚠️";
      const title = `${icon} Saúde operacional · ${row.store_name}`;
      const message = issues.map((i) => `• ${i.label} — ${i.detail}`).join("\n");
      const tag = `oph-${row.store_id}-${issues.map((i) => i.type).join("_")}-${dateStr}`;

      const managerUserIds = await resolveManagers(supabase, row.store_id);
      if (managerUserIds.length > 0) {
        await supabase.from("user_notifications").insert(
          managerUserIds.map((uid) => ({
            user_id: uid, title, message, url: "/saude-operacional", tag, category: ALERT_KEY,
          })),
        );
        if (pushEnabled) {
          await pushToUsers(managerUserIds, {
            title, message, url: "/saude-operacional", tag, category: ALERT_KEY, skipInApp: true,
          });
        }
        if (waEnabled && waConfig) {
          const waText = `${icon} *Saúde operacional* · ${row.store_name}\n${message}\n\nAbrir: ${APP_BASE_URL}/saude-operacional`;
          const sentPhones = new Set<string>();
          const { data: mgrEmps } = await supabase
            .from("employees").select("user_id, phone").in("user_id", managerUserIds);
          for (const e of (mgrEmps ?? []) as any[]) {
            const phone = normalizePhone(e.phone);
            if (!phone || sentPhones.has(phone)) continue;
            sentPhones.add(phone);
            await sendWhatsapp(waConfig, phone, waText);
          }
          await fanoutExtras(waConfig, extras, waText, sentPhones);
        }
        await sendAlertEmails(ALERT_KEY, {
          title: `Saúde operacional · ${row.store_name}`,
          message,
          category: "Saúde operacional",
          severity: critical ? "critical" : "warning",
        }, supabase);
        notified += managerUserIds.length;
      }

      await supabase.from("operational_health_alerts_sent").upsert(
        issues.map((i) => ({
          store_id: row.store_id,
          alert_type: i.type,
          alert_date: dateStr,
          detail: i.detail,
          notified_count: managerUserIds.length,
        })),
        { onConflict: "store_id,alert_type,alert_date" },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, date: dateStr, stores: health.length, storesWithIssues, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const err = e as Error;
    console.error("[operational-health-alerts]", err);
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
