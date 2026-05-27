// Aplica infração automática para sequência de batidas errada/incompleta
// baseado em regras configuráveis (automation_rules, trigger_type='wrong_punch').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCronSecret } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EntryType = "clock_in" | "break_start" | "break_end" | "break_start_2" | "break_end_2" | "clock_out";
const ORDER_NO_2: EntryType[] = ["clock_in", "break_start", "break_end", "clock_out"];
const ORDER_WITH_2: EntryType[] = ["clock_in", "break_start", "break_end", "break_start_2", "break_end_2", "clock_out"];

function checkSequence(entries: { entry_type: EntryType; entry_at: string }[], hasSecondBreak: boolean) {
  const expected = hasSecondBreak ? ORDER_WITH_2 : ORDER_NO_2;
  const types = entries.map((e) => e.entry_type);
  const missing = expected.filter((t) => !types.includes(t));
  if (missing.length > 0) return { ok: false, reason: `Batidas faltando: ${missing.join(", ")}` };
  const sorted = [...entries].sort((a, b) => new Date(a.entry_at).getTime() - new Date(b.entry_at).getTime());
  const seq = sorted.map((e) => e.entry_type).filter((t) => expected.includes(t));
  const firstSeen: EntryType[] = [];
  for (const t of seq) if (!firstSeen.includes(t)) firstSeen.push(t);
  for (let i = 0; i < expected.length; i++) {
    if (firstSeen[i] !== expected[i]) return { ok: false, reason: `Sequência fora de ordem (esperado ${expected.join(" → ")})` };
  }
  return { ok: true, reason: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = requireCronSecret(req, corsHeaders);
  if (guard) return guard;

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let body: { date?: string; rule_id?: string } = {};
    try { body = await req.json(); } catch {}

    let target = body.date;
    if (!target) {
      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      brt.setUTCDate(brt.getUTCDate() - 1);
      target = brt.toISOString().slice(0, 10);
    }

    let rulesQuery = supabase.from("automation_rules")
      .select("id, name, params, actions")
      .eq("trigger_type", "wrong_punch").eq("is_active", true);
    if (body.rule_id) rulesQuery = rulesQuery.eq("id", body.rule_id);

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ date: target, message: "Nenhuma regra ativa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: schedules } = await supabase
      .from("work_schedules")
      .select("employee_id, start_time, break_start_2, break_end_2, store_id")
      .eq("schedule_date", target).eq("is_day_off", false).eq("is_home_office", false)
      .not("start_time", "is", null);

    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ date: target, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empIds = [...new Set(schedules.map((s: any) => s.employee_id))];

    const [{ data: emps }, { data: justs }, { data: leaves }, { data: entries }] = await Promise.all([
      supabase.from("employees").select("id, full_name, allocated_store_id, store_id, position").in("id", empIds).eq("status", "active").or("exempt_from_timeclock.is.null,exempt_from_timeclock.eq.false"),
      supabase.from("time_clock_justifications").select("employee_id").eq("reference_date", target).eq("status", "approved").in("employee_id", empIds),
      supabase.from("employee_leaves").select("employee_id").lte("start_date", target).gte("end_date", target).in("employee_id", empIds),
      supabase.from("time_clock_entries").select("employee_id, entry_type, entry_at").eq("reference_date", target).in("employee_id", empIds),
    ]);

    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const justified = new Set((justs ?? []).map((r: any) => r.employee_id));
    const onLeave = new Set((leaves ?? []).map((r: any) => r.employee_id));
    const entriesByEmp = new Map<string, { entry_type: EntryType; entry_at: string }[]>();
    for (const e of entries ?? []) {
      const arr = entriesByEmp.get(e.employee_id) ?? [];
      arr.push({ entry_type: e.entry_type as EntryType, entry_at: e.entry_at });
      entriesByEmp.set(e.employee_id, arr);
    }

    const { data: cycle } = await supabase.from("evaluation_cycles")
      .select("id").lte("start_date", target).gte("end_date", target)
      .order("start_date", { ascending: false }).limit(1).maybeSingle();

    const runResults: any[] = [];

    for (const rule of rules) {
      const apply = (rule.actions as any)?.apply_infraction;
      if (!apply?.infraction_type_id) continue;
      const infractionTypeId = apply.infraction_type_id;
      const weight = Number(apply.weight ?? 3);

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

      const { data: existingInf } = await supabase.from("employee_infractions")
        .select("employee_id").eq("infraction_type_id", infractionTypeId)
        .eq("occurred_on", target).in("employee_id", empIds);
      const alreadyInfracted = new Set((existingInf ?? []).map((r: any) => r.employee_id));

      const toInsert: any[] = [];
      const detail: any[] = [];

      for (const sch of schedules as any[]) {
        const empId = sch.employee_id;
        const emp = empMap.get(empId);
        if (!emp) continue;
        if (!inScope(empId)) continue;
        if (alreadyInfracted.has(empId)) continue;
        if (justified.has(empId)) continue;
        if (onLeave.has(empId)) continue;

        const hasSecondBreak = !!(sch.break_start_2 && sch.break_end_2);
        const empEntries = entriesByEmp.get(empId) ?? [];
        if (empEntries.length === 0) continue; // falta, fora deste escopo

        const result = checkSequence(empEntries, hasSecondBreak);
        if (result.ok) continue;

        toInsert.push({
          employee_id: empId,
          infraction_type_id: infractionTypeId,
          cycle_id: cycle?.id ?? null,
          occurred_on: target,
          applied_weight: weight,
          notes: `Auto (regra "${rule.name}"): ${result.reason}`,
        });
        detail.push({ employee_id: empId, name: (emp as any).full_name, reason: result.reason });
        alreadyInfracted.add(empId);
      }

      let created = 0;
      if (toInsert.length > 0) {
        const { error: insErr, count } = await supabase.from("employee_infractions").insert(toInsert, { count: "exact" });
        if (insErr) throw insErr;
        created = count ?? toInsert.length;
      }

      await supabase.from("automation_rule_runs").insert({
        rule_id: rule.id,
        trigger_type: "wrong_punch",
        reference_date: target,
        scanned: schedules.length,
        matched: detail.length,
        infractions_created: created,
        detail: { items: detail },
      });

      runResults.push({ rule_id: rule.id, rule_name: rule.name, scheduled: schedules.length, created, detail });
    }

    return new Response(JSON.stringify({ date: target, runs: runResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("auto-infraction-wrong-punch error:", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
