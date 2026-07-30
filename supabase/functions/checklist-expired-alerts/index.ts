// Alerta gestores sobre check-lists expirados (prazo vencido) sem preenchimento.
// Roda via cron a cada 15 min. Deduplica por (template, colaborador, dia).
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
const ALERT_KEY = "checklist";
const APP_BASE_URL = Deno.env.get("APP_PUBLIC_URL") || "https://nexasuite.aquelaparme.com.br";

function nowInTz() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return { dateStr, minutes: hh * 60 + mm, dow };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { dateStr, minutes, dow } = nowInTz();

  try {
    const [
      { data: templates },
      { data: emps },
      { data: ug },
      { data: cts },
      { data: sched },
      { data: assigns },
      { data: subs },
      { data: sent },
      { data: stores },
    ] = await Promise.all([
      supabase.from("checklist_templates")
        .select("id, title, deadline_time, weekdays, require_scheduled, is_active, template_access_groups(group_id)")
        .eq("is_active", true).not("deadline_time", "is", null),
      supabase.from("employees")
        .select("id, user_id, full_name, status, store_id, allocated_store_id")
        .not("user_id", "is", null),
      supabase.from("user_access_groups").select("user_id, group_id"),
      supabase.from("checklist_template_stores").select("template_id, store_id"),
      supabase.from("work_schedules").select("employee_id, store_id, is_day_off").eq("schedule_date", dateStr),
      supabase.from("checklist_template_assignments").select("template_id, employee_id"),
      supabase.from("checklist_submissions").select("template_id, user_id").eq("shift_date", dateStr),
      supabase.from("checklist_expired_alerts_sent").select("template_id, user_id").eq("shift_date", dateStr),
      supabase.from("stores").select("id, name"),
    ]);

    const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));

    // ---- audiência (mesma regra do front: src/lib/checklistAudience.ts) ----
    const people = new Map<string, any>();
    const empIdToUser = new Map<string, string>();
    for (const e of (emps ?? []) as any[]) {
      if (!e.user_id) continue;
      empIdToUser.set(e.id, e.user_id);
      if (e.status === "active") people.set(e.user_id, e);
    }
    const groupsByUser = new Map<string, Set<string>>();
    for (const r of (ug ?? []) as any[]) {
      if (!groupsByUser.has(r.user_id)) groupsByUser.set(r.user_id, new Set());
      groupsByUser.get(r.user_id)!.add(r.group_id);
    }
    const storesByTemplate = new Map<string, Set<string>>();
    for (const r of (cts ?? []) as any[]) {
      if (!storesByTemplate.has(r.template_id)) storesByTemplate.set(r.template_id, new Set());
      storesByTemplate.get(r.template_id)!.add(r.store_id);
    }
    const scheduledByUser = new Map<string, Set<string>>();
    for (const r of (sched ?? []) as any[]) {
      if (r.is_day_off) continue;
      const uid = empIdToUser.get(r.employee_id);
      if (!uid) continue;
      if (!scheduledByUser.has(uid)) scheduledByUser.set(uid, new Set());
      scheduledByUser.get(uid)!.add(r.store_id);
    }
    const assignedByTemplate = new Map<string, Set<string>>();
    for (const r of (assigns ?? []) as any[]) {
      const uid = empIdToUser.get(r.employee_id);
      if (!uid) continue;
      if (!assignedByTemplate.has(r.template_id)) assignedByTemplate.set(r.template_id, new Set());
      assignedByTemplate.get(r.template_id)!.add(uid);
    }

    const isExpected = (tpl: any, userId: string) => {
      const person = people.get(userId);
      if (!person) return false;
      const assigned = assignedByTemplate.get(tpl.id)?.has(userId) ?? false;
      const tplStores = storesByTemplate.get(tpl.id);
      if (!assigned) {
        const gs = groupsByUser.get(userId);
        if (!gs || !(tpl.template_access_groups ?? []).some((g: any) => gs.has(g.group_id))) return false;
        if (tplStores && tplStores.size > 0) {
          const belongs = (person.store_id && tplStores.has(person.store_id)) ||
            (person.allocated_store_id && tplStores.has(person.allocated_store_id));
          if (!belongs) return false;
        }
      }
      if (tpl.require_scheduled) {
        const sc = scheduledByUser.get(userId);
        if (!sc || sc.size === 0) return false;
        if (!assigned && tplStores && tplStores.size > 0) {
          let ok = false;
          sc.forEach((s) => { if (tplStores.has(s)) ok = true; });
          if (!ok) return false;
        }
      }
      return true;
    };

    const submitted = new Set((subs ?? []).map((s: any) => `${s.template_id}|${s.user_id}`));
    const alreadySent = new Set((sent ?? []).map((s: any) => `${s.template_id}|${s.user_id}`));

    // ---- pendências expiradas ----
    type Pending = { templateId: string; templateTitle: string; deadline: string; userId: string; name: string; storeId: string | null };
    const pendings: Pending[] = [];
    for (const tpl of (templates ?? []) as any[]) {
      const runsToday = !tpl.weekdays || tpl.weekdays.length === 0 || tpl.weekdays.includes(dow);
      if (!runsToday) continue;
      const [h, m] = String(tpl.deadline_time).split(":").map(Number);
      if (minutes < h * 60 + m) continue; // ainda no prazo
      for (const userId of people.keys()) {
        if (!isExpected(tpl, userId)) continue;
        const key = `${tpl.id}|${userId}`;
        if (submitted.has(key) || alreadySent.has(key)) continue;
        const p = people.get(userId);
        const scheduledStore = Array.from(scheduledByUser.get(userId) ?? [])[0] ?? null;
        pendings.push({
          templateId: tpl.id,
          templateTitle: tpl.title,
          deadline: String(tpl.deadline_time).slice(0, 5),
          userId,
          name: p.full_name ?? "(sem nome)",
          storeId: p.allocated_store_id ?? p.store_id ?? scheduledStore,
        });
      }
    }

    if (pendings.length === 0) {
      return new Response(JSON.stringify({ ok: true, date: dateStr, pending: 0, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- agrupa por loja e notifica gestores ----
    const byStore = new Map<string, Pending[]>();
    for (const p of pendings) {
      const k = p.storeId ?? "__sem_loja__";
      if (!byStore.has(k)) byStore.set(k, []);
      byStore.get(k)!.push(p);
    }

    const { enabled: waEnabled, waConfig, extras } = await loadAlertConfig(supabase, ALERT_KEY);
    const { data: settings } = await supabase
      .from("notification_settings").select("push_enabled").eq("alert_key", ALERT_KEY).maybeSingle();
    const pushEnabled = settings?.push_enabled ?? true;

    let notified = 0;
    for (const [storeKey, list] of byStore) {
      const storeId = storeKey === "__sem_loja__" ? null : storeKey;
      const storeName = storeId ? (storeMap.get(storeId) ?? storeId) : "Sem loja";
      const managerUserIds = await resolveManagers(supabase, storeId);

      const lines = list
        .slice(0, 12)
        .map((p) => `• ${p.name} — ${p.templateTitle} (prazo ${p.deadline})`)
        .join("\n");
      const extraCount = list.length - Math.min(list.length, 12);
      const title = `📋 ${list.length} check-list${list.length > 1 ? "s" : ""} expirado${list.length > 1 ? "s" : ""} · ${storeName}`;
      const message = `${lines}${extraCount > 0 ? `\n+ ${extraCount} outro(s)` : ""}`;
      const tag = `checklist-expired-${storeKey}-${dateStr}`;

      if (managerUserIds.length > 0) {
        await supabase.from("user_notifications").insert(
          managerUserIds.map((uid) => ({
            user_id: uid, title, message, url: "/checklists-gerenciar", tag, category: ALERT_KEY,
          })),
        );
        if (pushEnabled) {
          await pushToUsers(managerUserIds, {
            title, message, url: "/checklists-gerenciar", tag, category: ALERT_KEY, skipInApp: true,
          });
        }
        if (waEnabled && waConfig) {
          const waText = `📋 *Check-lists expirados* · ${storeName}\n${message}\n\nAbrir: ${APP_BASE_URL}/checklists-gerenciar`;
          const already = new Set<string>();
          const { data: mgrEmps } = await supabase
            .from("employees").select("user_id, phone").in("user_id", managerUserIds);
          for (const e of (mgrEmps ?? []) as any[]) {
            const phone = normalizePhone(e.phone);
            if (!phone || already.has(phone)) continue;
            already.add(phone);
            await sendWhatsapp(waConfig, phone, waText);
          }
          await fanoutExtras(waConfig, extras, waText, already);
        }
        await sendAlertEmails(ALERT_KEY, {
          title: `Check-lists expirados · ${storeName}`,
          message,
          category: "Check-lists",
          severity: "warning",
        }, supabase);
        notified += managerUserIds.length;
      }

      await supabase.from("checklist_expired_alerts_sent").upsert(
        list.map((p) => ({
          template_id: p.templateId,
          user_id: p.userId,
          shift_date: dateStr,
          store_id: storeId,
          notified_count: managerUserIds.length,
        })),
        { onConflict: "template_id,user_id,shift_date" },
      );
    }

    return new Response(JSON.stringify({ ok: true, date: dateStr, pending: pendings.length, notified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("[checklist-expired-alerts]", err);
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
