import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCronOrRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LATE_THRESHOLD_MIN = 30;
const TZ = "America/Sao_Paulo";

// Retorna a data atual (YYYY-MM-DD) e timestamp em ms no fuso de São Paulo
function nowInTz(): { dateStr: string; nowMs: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = fmt.format(now); // YYYY-MM-DD
  return { dateStr, nowMs: now.getTime() };
}

// Constrói um Date para `YYYY-MM-DD HH:mm` interpretado em America/Sao_Paulo
function tzDateTimeToUtc(dateStr: string, timeStr: string): Date {
  // timeStr no formato HH:mm:ss
  // Aproximação: SP = UTC-3 (sem DST atualmente). Suficiente para alerta de 30min.
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // 03:00 UTC = 00:00 SP → adicionar 3h ao horário local
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireCronOrRole(req, ["admin", "manager", "hr"], corsHeaders);
  if (!auth.ok) return auth.response!;


  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { dateStr, nowMs } = nowInTz();

  try {
    // 1. Escalas de hoje (não folga, com shift definido)
    const { data: schedules, error: schedErr } = await supabase
      .from("work_schedules")
      .select("id, employee_id, store_id, shift_id, is_day_off, schedule_date")
      .eq("schedule_date", dateStr)
      .eq("is_day_off", false)
      .not("shift_id", "is", null);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shiftIds = Array.from(new Set(schedules.map((s) => s.shift_id).filter(Boolean)));
    const employeeIds = Array.from(new Set(schedules.map((s) => s.employee_id)));

    const [{ data: shifts }, { data: employees }, { data: alreadySent }, { data: stores }] =
      await Promise.all([
        supabase.from("work_shifts").select("id, start_time, name").in("id", shiftIds),
        supabase
          .from("employees")
          .select("id, full_name, store_id, allocated_store_id")
          .in("id", employeeIds),
        supabase
          .from("late_punch_alerts_sent")
          .select("employee_id")
          .eq("schedule_date", dateStr),
        supabase.from("stores").select("id, name"),
      ]);

    const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));
    const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));
    const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s]));
    const sentSet = new Set((alreadySent ?? []).map((s: any) => s.employee_id));

    // 2. Batidas de entrada de hoje
    const { data: clockIns } = await supabase
      .from("time_clock_entries")
      .select("employee_id")
      .eq("reference_date", dateStr)
      .eq("entry_type", "clock_in")
      .in("employee_id", employeeIds);
    const clockedIn = new Set((clockIns ?? []).map((e: any) => e.employee_id));

    let triggered = 0;
    const cache = { managers: new Map<string, string[]>() };

    for (const sch of schedules) {
      if (sentSet.has(sch.employee_id)) continue;
      if (clockedIn.has(sch.employee_id)) continue;

      const shift = shiftMap.get(sch.shift_id!);
      if (!shift?.start_time) continue;

      const expectedStart = tzDateTimeToUtc(dateStr, shift.start_time);
      const lateBy = (nowMs - expectedStart.getTime()) / 60000;
      if (lateBy < LATE_THRESHOLD_MIN) continue;

      const emp = empMap.get(sch.employee_id);
      if (!emp) continue;

      const storeId = sch.store_id || emp.allocated_store_id || emp.store_id;
      const store = storeId ? storeMap.get(storeId) : null;

      // Resolve gestores/admins responsáveis
      let managerUserIds = cache.managers.get(storeId ?? "__all__");
      if (!managerUserIds) {
        managerUserIds = await resolveManagers(supabase, storeId);
        cache.managers.set(storeId ?? "__all__", managerUserIds);
      }

      if (managerUserIds.length === 0) {
        // Mesmo sem gestores, registra para não reprocessar
        await supabase.from("late_punch_alerts_sent").insert({
          employee_id: sch.employee_id,
          schedule_date: dateStr,
          store_id: storeId ?? null,
          shift_start_time: shift.start_time,
          notified_count: 0,
        });
        continue;
      }

      const lateMin = Math.round(lateBy);
      const title = `⏰ Atraso: ${emp.full_name}`;
      const message =
        `${emp.full_name} ainda não bateu o ponto de entrada.\n` +
        `Escala: ${shift.start_time.slice(0, 5)}${store ? ` · ${store.name}` : ""}\n` +
        `Atraso: ${lateMin} min`;

      const rows = managerUserIds.map((uid) => ({
        user_id: uid,
        title,
        message,
        url: "/ponto",
        tag: `late-${sch.employee_id}-${dateStr}`,
        category: "timeclock",
      }));

      const { error: insErr } = await supabase.from("user_notifications").insert(rows);
      if (insErr) {
        console.error("[late-alerts] insert notification error", insErr);
        continue;
      }

      await supabase.from("late_punch_alerts_sent").insert({
        employee_id: sch.employee_id,
        schedule_date: dateStr,
        store_id: storeId ?? null,
        shift_start_time: shift.start_time,
        notified_count: managerUserIds.length,
      });

      triggered++;
    }

    return new Response(
      JSON.stringify({ ok: true, date: dateStr, scanned: schedules.length, triggered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const err = e as Error;
    console.error("[late-alerts] error", err);
    return new Response(JSON.stringify({ error: err.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Retorna user_ids de gestores da loja + admins globais
async function resolveManagers(supabase: any, storeId: string | null): Promise<string[]> {
  const userIds = new Set<string>();

  // Admins globais
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  for (const r of admins ?? []) userIds.add(r.user_id);

  // Managers
  const { data: managers } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "manager");
  const managerIds = (managers ?? []).map((r: any) => r.user_id);

  if (managerIds.length > 0) {
    if (storeId) {
      // Apenas gestores da loja (via employees.store_id ou allocated_store_id)
      const { data: storeManagers } = await supabase
        .from("employees")
        .select("user_id")
        .in("user_id", managerIds)
        .eq("status", "active")
        .or(`store_id.eq.${storeId},allocated_store_id.eq.${storeId}`);
      for (const m of storeManagers ?? []) {
        if (m.user_id) userIds.add(m.user_id);
      }
    } else {
      // Sem loja: todos os managers
      for (const id of managerIds) userIds.add(id);
    }
  }

  return Array.from(userIds);
}
