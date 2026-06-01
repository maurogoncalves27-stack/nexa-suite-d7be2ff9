// Edge function: compute-night-addition
// Calcula o adicional noturno (R$) por colaborador para uma competência
// (year/month) DIRETAMENTE a partir do ponto, SEM depender de payroll_calculated.
//
// Saída: { results: Array<{ employee_id, night_hours, amount }> }
//
// Regra (idêntica à de calculate-payroll):
//  - Janela noturna: 22h–05h local (BRT, UTC-3)
//  - Hora reduzida: 60 / 52.5
//  - Adicional: 20% sobre hora normal (salário / 220)
//  - Só elegíveis (employees.night_shift_eligible = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NIGHT_RATE = 0.20;
const NIGHT_HOUR_FACTOR = 60 / 52.5;
const NIGHT_START_MIN = 22 * 60;
const NIGHT_END_MIN = 5 * 60;
const BRT_OFFSET_MIN = -180;

const r2 = (n: number) => Math.round(n * 100) / 100;

function nightHoursBetween(startMin: number, endMin: number): number {
  if (endMin <= startMin) return 0;
  let total = 0;
  let cursor = startMin;
  while (cursor < endMin) {
    const dayBase = Math.floor(cursor / 1440) * 1440;
    const nightStart = dayBase + NIGHT_START_MIN;
    const nightEnd = dayBase + 1440 + NIGHT_END_MIN;
    const segEnd = Math.min(endMin, dayBase + 1440 + NIGHT_END_MIN);
    const a = Math.max(cursor, nightStart);
    const b = Math.min(segEnd, nightEnd);
    if (b > a) total += (b - a);
    cursor = dayBase + 1440 + NIGHT_END_MIN;
    if (cursor >= endMin) break;
  }
  return total / 60;
}

type PunchEntry = { entry_at: string; entry_type: string; reference_date: string };

function buildWorkedSegments(punches: PunchEntry[]): { date: string; startMin: number; endMin: number }[] {
  const sorted = [...punches].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  const byDate = new Map<string, PunchEntry[]>();
  for (const p of sorted) {
    const arr = byDate.get(p.reference_date) ?? [];
    arr.push(p);
    byDate.set(p.reference_date, arr);
  }
  const segments: { date: string; startMin: number; endMin: number }[] = [];
  for (const [date, list] of byDate) {
    let workStart: Date | null = null;
    const dayBaseUtcMs = new Date(`${date}T00:00:00Z`).getTime() - BRT_OFFSET_MIN * 60000;
    for (const p of list) {
      const ts = new Date(p.entry_at);
      if (p.entry_type === "clock_in" || p.entry_type === "break_end" || p.entry_type === "break_end_2") {
        if (!workStart) workStart = ts;
      } else if (p.entry_type === "clock_out" || p.entry_type === "break_start" || p.entry_type === "break_start_2") {
        if (workStart) {
          const startMin = (workStart.getTime() - dayBaseUtcMs) / 60000;
          let endMin = (ts.getTime() - dayBaseUtcMs) / 60000;
          if (endMin < startMin) endMin += 1440;
          segments.push({ date, startMin, endMin });
          workStart = null;
        }
      }
    }
  }
  return segments;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await requireRole(req, ["admin", "hr", "manager"], corsHeaders);
    if (!auth.ok) return auth.response!;

    const { year, month } = await req.json();
    if (!year || !month || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: "year/month obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, salary, night_shift_eligible, status")
      .eq("night_shift_eligible", true)
      .neq("status", "terminated");
    if (empErr) throw empErr;

    const empIds = (employees ?? []).map((e: any) => e.id);
    if (empIds.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: punches, error: pErr } = await supabase
      .from("time_clock_entries")
      .select("employee_id, entry_at, entry_type, reference_date")
      .in("employee_id", empIds)
      .gte("reference_date", periodStart)
      .lte("reference_date", periodEnd);
    if (pErr) throw pErr;

    const punchMap = new Map<string, PunchEntry[]>();
    (punches ?? []).forEach((p: any) => {
      const arr = punchMap.get(p.employee_id) ?? [];
      arr.push(p);
      punchMap.set(p.employee_id, arr);
    });

    const results = (employees ?? []).map((e: any) => {
      const segments = buildWorkedSegments(punchMap.get(e.id) ?? []);
      let nightHours = 0;
      for (const seg of segments) {
        nightHours += nightHoursBetween(seg.startMin, seg.endMin);
      }
      const baseSalary = Number(e.salary ?? 0);
      const hourlyRate = baseSalary > 0 ? baseSalary / 220 : 0;
      const amount = r2(nightHours * NIGHT_HOUR_FACTOR * hourlyRate * NIGHT_RATE);
      return { employee_id: e.id, night_hours: r2(nightHours), amount };
    }).filter((r) => r.amount > 0);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
