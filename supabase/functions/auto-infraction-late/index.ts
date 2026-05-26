// Aplica infração automática para atrasos baseado em regras configuráveis (automation_rules).
// Lê todas as regras ativas do tipo 'late_arrival' e processa o dia anterior.
// Para cada regra também aplica as regras 'infraction_recurrence' associadas ao mesmo infraction_type.
// Idempotente por (employee_id, occurred_on, infraction_type_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function diffMinutes(scheduledHHMM: string, entryISO: string, dateYYYYMMDD: string): number {
  const [h, m] = scheduledHHMM.split(":").map(Number);
  const scheduled = new Date(`${dateYYYYMMDD}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
  const actual = new Date(entryISO);
  return Math.round((actual.getTime() - scheduled.getTime()) / 60000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: { date?: string; rule_id?: string } = {};
    try { body = await req.json(); } catch {}

    let target = body.date;
    if (!target) {
      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      brt.setUTCDate(brt.getUTCDate() - 1);
      target = brt.toISOString().slice(0, 10);
    }

    // 1) Carregar regras ativas de atraso
    let rulesQuery = supabase
      .from("automation_rules")
      .select("id, name, params, actions")
      .eq("trigger_type", "late_arrival")
      .eq("is_active", true);
    if (body.rule_id) rulesQuery = rulesQuery.eq("id", body.rule_id);

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw rulesErr;

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ date: target, message: "Nenhuma regra ativa de atraso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Carregar regras de recorrência ativas (para encadear advertências)
    const { data: recurrenceRules } = await supabase
      .from("automation_rules")
      .select("id, name, params, actions")
      .eq("trigger_type", "infraction_recurrence")
      .eq("is_active", true);

    // 3) Schedules
    const { data: schedules, error: schErr } = await supabase
      .from("work_schedules")
      .select("employee_id, start_time")
      .eq("schedule_date", target)
      .eq("is_day_off", false)
      .eq("is_home_office", false)
      .not("start_time", "is", null);
    if (schErr) throw schErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ date: target, lates: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empIds = [...new Set(schedules.map((s: any) => s.employee_id))];

    const [{ data: emps }, { data: justs }, { data: leaves }, { data: clockIns }] = await Promise.all([
      supabase.from("employees").select("id, full_name, status, position").in("id", empIds).eq("status", "active").or("exempt_from_timeclock.is.null,exempt_from_timeclock.eq.false"),
      supabase.from("time_clock_justifications").select("employee_id").eq("reference_date", target).eq("status", "approved").in("employee_id", empIds),
      supabase.from("employee_leaves").select("employee_id").lte("start_date", target).gte("end_date", target).in("employee_id", empIds),
      supabase.from("time_clock_entries").select("employee_id, entry_at").eq("reference_date", target).eq("entry_type", "clock_in").in("employee_id", empIds),
    ]);

    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const justified = new Set((justs ?? []).map((r: any) => r.employee_id));
    const onLeave = new Set((leaves ?? []).map((r: any) => r.employee_id));
    const clockInByEmp = new Map<string, string>();
    for (const e of clockIns ?? []) {
      const cur = clockInByEmp.get(e.employee_id);
      if (!cur || new Date(e.entry_at) < new Date(cur)) clockInByEmp.set(e.employee_id, e.entry_at);
    }

    const { data: cycle } = await supabase
      .from("evaluation_cycles").select("id")
      .lte("start_date", target).gte("end_date", target)
      .order("start_date", { ascending: false }).limit(1).maybeSingle();

    const runResults: any[] = [];

    for (const rule of rules) {
      const tolerance = Number((rule.params as any)?.tolerance_min ?? 15);
      const apply = (rule.actions as any)?.apply_infraction;
      if (!apply?.infraction_type_id) continue;
      const infractionTypeId = apply.infraction_type_id;
      const weight = Number(apply.weight ?? 1);

      // Escopo (cargos/colaboradores). Vazio = todos.
      const scope = (rule.params as any)?.scope ?? {};
      const scopePosNames: string[] = Array.isArray(scope.position_names) ? scope.position_names : [];
      const scopeEmpIds: string[] = Array.isArray(scope.employee_ids) ? scope.employee_ids : [];
      const scopePosNamesLc = scopePosNames.map((s: string) => String(s).toLowerCase());
      const inScope = (empId: string) => {
        if (scopePosNames.length === 0 && scopeEmpIds.length === 0) return true;
        if (scopeEmpIds.includes(empId)) return true;
        const emp = empMap.get(empId) as any;
        if (emp && scopePosNamesLc.includes(String(emp.position ?? "").toLowerCase())) return true;
        return false;
      };

      const { data: existingInf } = await supabase
        .from("employee_infractions").select("employee_id")
        .eq("infraction_type_id", infractionTypeId)
        .eq("occurred_on", target).in("employee_id", empIds);
      const alreadyInfracted = new Set((existingInf ?? []).map((r: any) => r.employee_id));

      const lateEmployees: { employee_id: string; name: string; minutes: number }[] = [];
      const toInsert: any[] = [];

      for (const sch of schedules as any[]) {
        const empId = sch.employee_id;
        if (!empMap.has(empId)) continue;
        if (!inScope(empId)) continue;
        if (alreadyInfracted.has(empId)) continue;
        if (justified.has(empId)) continue;
        if (onLeave.has(empId)) continue;

        const entryAt = clockInByEmp.get(empId);
        if (!entryAt) continue;

        const minutes = diffMinutes(sch.start_time, entryAt, target);
        if (minutes <= tolerance) continue;

        const emp = empMap.get(empId) as any;
        lateEmployees.push({ employee_id: empId, name: emp.full_name, minutes });
        toInsert.push({
          employee_id: empId,
          infraction_type_id: infractionTypeId,
          cycle_id: cycle?.id ?? null,
          occurred_on: target,
          applied_weight: weight,
          notes: `Auto (regra "${rule.name}"): atraso de ${minutes} min na entrada (escala ${sch.start_time})`,
        });
      }

      let createdInf = 0;
      if (toInsert.length > 0) {
        const { error: insErr, count } = await supabase
          .from("employee_infractions").insert(toInsert, { count: "exact" });
        if (insErr) throw insErr;
        createdInf = count ?? toInsert.length;
      }

      // Recorrência: encadear regras 'infraction_recurrence' que apontam para o mesmo infraction_type_id
      let createdWarnings = 0;
      const warningDetail: any[] = [];

      const recRulesForType = (recurrenceRules ?? []).filter(
        (r: any) => (r.params as any)?.infraction_type_id === infractionTypeId
      );

      if (recRulesForType.length > 0 && lateEmployees.length > 0) {
        for (const recRule of recRulesForType) {
          const count = Number((recRule.params as any)?.count ?? 3);
          const windowDays = Number((recRule.params as any)?.window_days ?? 7);
          const warnAction = (recRule.actions as any)?.create_warning;
          if (!warnAction) continue;

          const windowStart = new Date(`${target}T00:00:00Z`);
          windowStart.setUTCDate(windowStart.getUTCDate() - (windowDays - 1));
          const winStartStr = windowStart.toISOString().slice(0, 10);

          const lateEmpIds = lateEmployees.map((l) => l.employee_id);
          const { data: recentInf } = await supabase
            .from("employee_infractions").select("employee_id, occurred_on")
            .eq("infraction_type_id", infractionTypeId)
            .gte("occurred_on", winStartStr).lte("occurred_on", target)
            .in("employee_id", lateEmpIds);

          const countByEmp = new Map<string, string[]>();
          for (const r of recentInf ?? []) {
            const arr = countByEmp.get(r.employee_id) ?? [];
            arr.push(r.occurred_on);
            countByEmp.set(r.employee_id, arr);
          }

          const { data: recentWarnings } = await supabase
            .from("employee_warnings").select("employee_id, title, issued_at")
            .gte("issued_at", `${winStartStr}T00:00:00Z`)
            .in("employee_id", lateEmpIds)
            .ilike("title", `%${(warnAction.title ?? "").split(" ")[0]}%`);
          const warnedRecently = new Set((recentWarnings ?? []).map((w: any) => w.employee_id));

          for (const late of lateEmployees) {
            const dates = countByEmp.get(late.employee_id) ?? [];
            const uniqueDates = [...new Set(dates)];
            if (uniqueDates.length < count) continue;
            if (warnedRecently.has(late.employee_id)) continue;

            const datesFmt = uniqueDates.sort()
              .map((d) => d.split("-").reverse().join("/")).join(", ");

            const content = String(warnAction.template ?? "")
              .replaceAll("{{name}}", late.name)
              .replaceAll("{{count}}", String(uniqueDates.length))
              .replaceAll("{{dates}}", datesFmt);

            const { error: warnErr } = await supabase.from("employee_warnings").insert({
              employee_id: late.employee_id,
              title: warnAction.title ?? "Advertência automática",
              content,
              status: "pending",
            });
            if (!warnErr) {
              createdWarnings++;
              warningDetail.push({ employee_id: late.employee_id, name: late.name, count: uniqueDates.length });
            }
          }

          await supabase.from("automation_rule_runs").insert({
            rule_id: recRule.id,
            trigger_type: "infraction_recurrence",
            reference_date: target,
            scanned: lateEmployees.length,
            matched: warningDetail.length,
            warnings_created: createdWarnings,
            detail: { warnings: warningDetail },
          });
        }
      }

      await supabase.from("automation_rule_runs").insert({
        rule_id: rule.id,
        trigger_type: "late_arrival",
        reference_date: target,
        scanned: schedules.length,
        matched: lateEmployees.length,
        infractions_created: createdInf,
        detail: { lates: lateEmployees },
      });

      runResults.push({
        rule_id: rule.id,
        rule_name: rule.name,
        scheduled: schedules.length,
        late_detected: lateEmployees.length,
        infractions_created: createdInf,
        warnings_created: createdWarnings,
      });
    }

    return new Response(JSON.stringify({ date: target, runs: runResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("auto-infraction-late error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
