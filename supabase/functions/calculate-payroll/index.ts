// Edge function: calculate-payroll
// Gera/recalcula a folha de pagamento de uma competência (year/month)
// para todos os colaboradores ativos, sem depender do XML da contabilidade.
//
// Regras CLT aplicadas (abr/2026):
// - Produtividade: 5% do salário base proporcional (substitui gratificações manuais)
// - Adicional noturno: para colaboradores com night_shift_eligible=true,
//   calcula 20% sobre as horas trabalhadas entre 22h e 5h (hora reduzida 52'30",
//   logo cada 60min reais = 60/52.5 = 1.142857h noturna paga). Usa registros de
//   ponto reais (time_clock_entries) com pares clock_in / clock_out por dia.
// - Feriados trabalhados: detecta pares clock_in/clock_out em datas presentes
//   na tabela holidays (escopo nacional ou da loja do colaborador) e paga em
//   dobro: (salário/diasDoMês) por dia trabalhado em feriado.
// - Salário-família: mantido (R$ 65,00 / dependente <14, salário ≤ R$ 1.906,04).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/requireRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== Tabelas oficiais =====
// INSS 2026 - Portaria Interministerial MPS/MF nº 13, de 09/01/2026
const INSS_BRACKETS = [
  { upTo: 1621.00, rate: 0.075, deduction: 0 },
  { upTo: 2902.84, rate: 0.09, deduction: 24.32 },
  { upTo: 4354.27, rate: 0.12, deduction: 111.40 },
  { upTo: 8475.55, rate: 0.14, deduction: 198.49 },
];
const IRRF_BRACKETS = [
  { upTo: 2428.8, rate: 0, deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Infinity, rate: 0.275, deduction: 908.73 },
];
const IRRF_DEPENDENT_DEDUCTION = 189.59;
const IRRF_SIMPLIFIED_DEDUCTION = 564.8;
// Salário-família 2026 (Portaria Interministerial MPS/MF nº 13/2026): teto R$ 1.980,38 / cota R$ 67,54
const FAMILY_ALLOWANCE_LIMIT = 1980.38;
const FAMILY_ALLOWANCE_QUOTA = 67.54;

const PRODUCTIVITY_RATE = 0.05;          // 5% sobre salário proporcional
const NIGHT_RATE = 0.20;                  // 20% adicional noturno CLT urbano
const NIGHT_HOUR_FACTOR = 60 / 52.5;      // hora noturna reduzida (52'30")
const NIGHT_START_MIN = 22 * 60;          // 22:00
const NIGHT_END_MIN = 5 * 60;             // 05:00 (do dia seguinte)

const r2 = (n: number) => Math.round(n * 100) / 100;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const isInternshipEmployee = (employee: any): boolean => {
  const contractType = norm(String(employee?.contract_type ?? ""));
  const position = norm(String(employee?.position ?? ""));
  const esocialCategory = String(employee?.esocial_category ?? "").trim();
  return contractType.includes("estag") || contractType === "internship" || position.includes("estagi") || esocialCategory === "701";
};

function calcINSS(gross: number): number {
  if (gross <= 0) return 0;
  for (const b of INSS_BRACKETS) {
    if (gross <= b.upTo) {
      return r2(Math.max(0, gross * b.rate - b.deduction));
    }
  }
  const ceilingBracket = INSS_BRACKETS[INSS_BRACKETS.length - 1];
  return r2(ceilingBracket.upTo * ceilingBracket.rate - ceilingBracket.deduction);
}

function calcIRRF(gross: number, inss: number, deps: number): number {
  if (gross <= 0) return 0;
  const trad = Math.max(0, gross - inss - deps * IRRF_DEPENDENT_DEDUCTION);
  const simp = Math.max(0, gross - IRRF_SIMPLIFIED_DEDUCTION);
  const base = Math.min(trad, simp);
  for (const b of IRRF_BRACKETS) {
    if (base <= b.upTo) {
      const tax = base * b.rate - b.deduction;
      return tax > 0 ? r2(tax) : 0;
    }
  }
  return 0;
}

function ageOn(birth: string | null, refDate: Date): number {
  if (!birth) return 999;
  const b = new Date(birth);
  let age = refDate.getFullYear() - b.getFullYear();
  const m = refDate.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < b.getDate())) age--;
  return age;
}

// Calcula a interseção (em horas) entre [start, end] (em minutos absolutos
// desde a "meia-noite do dia 0") e a janela noturna padrão (22:00–05:00).
// Trata jornadas que cruzam a meia-noite.
function nightHoursBetween(startMin: number, endMin: number): number {
  if (endMin <= startMin) return 0;
  let total = 0;
  // Quebra em "dias" relativos para aplicar a janela 22:00–29:00 (= 5:00 do próximo dia)
  let cursor = startMin;
  while (cursor < endMin) {
    const dayBase = Math.floor(cursor / 1440) * 1440;
    const nightStart = dayBase + NIGHT_START_MIN;       // 22:00 do dia
    const nightEnd = dayBase + 1440 + NIGHT_END_MIN;    // 05:00 do dia seguinte
    const segEnd = Math.min(endMin, dayBase + 1440 + NIGHT_END_MIN);
    const a = Math.max(cursor, nightStart);
    const b = Math.min(segEnd, nightEnd);
    if (b > a) total += (b - a);
    cursor = dayBase + 1440 + NIGHT_END_MIN; // pula para o final da janela
    if (cursor >= endMin) break;
  }
  return total / 60; // minutos -> horas
}

// Agrupa pontos por dia e retorna pares clock_in/clock_out (em ordem).
// Considera entry_type: "clock_in", "clock_out", "break_start", "break_end".
// Para fins de noturno e feriado, contamos a diferença entre clock_in e
// clock_out, descontando intervalos.
type PunchEntry = { entry_at: string; entry_type: string; reference_date: string };

// Brasília é UTC-3 (sem DST desde 2019). Convertemos os timestamps UTC para
// minutos no fuso BRT antes de comparar com a janela noturna 22h–05h local.
const BRT_OFFSET_MIN = -180; // BRT = UTC + (-3h)

function buildWorkedSegments(punches: PunchEntry[]): { date: string; startMin: number; endMin: number }[] {
  // ordenar
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
    // Base = meia-noite BRT do reference_date, expressa em UTC
    const dayBaseUtcMs = new Date(`${date}T00:00:00Z`).getTime() - BRT_OFFSET_MIN * 60000;
    for (const p of list) {
      const ts = new Date(p.entry_at);
      if (p.entry_type === "clock_in" || p.entry_type === "break_end" || p.entry_type === "break_end_2") {
        if (!workStart) workStart = ts;
      } else if (p.entry_type === "clock_out" || p.entry_type === "break_start" || p.entry_type === "break_start_2") {
        if (workStart) {
          const startMin = (workStart.getTime() - dayBaseUtcMs) / 60000;
          let endMin = (ts.getTime() - dayBaseUtcMs) / 60000;
          if (endMin < startMin) endMin += 1440; // virou o dia
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

    const { year, month, employee_id: onlyEmployeeId } = await req.json();
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
    
    const refDate = new Date(year, month - 1, 15);

    let empQ = supabase
      .from("employees")
      .select("id, full_name, salary, salary_type, monthly_hours, admission_date, hire_date, termination_date, status, night_shift_eligible, store_id, allocated_store_id, health_plan_copay, position, contract_type, esocial_category, time_clock_payroll, work_schedule, exclude_from_payroll")
      .not("status", "in", "(terminated,in_training)")
      .eq("exclude_from_payroll", false);
    if (onlyEmployeeId) empQ = empQ.eq("id", onlyEmployeeId);
    const { data: employeesRaw, error: empErr } = await empQ;
    if (empErr) throw empErr;

    // Estagiários NÃO entram na folha CLT — pagamento via bolsa-auxílio em fluxo separado
    const internEmployeeIds = (employeesRaw ?? []).filter(isInternshipEmployee).map((e: any) => e.id);
    if (internEmployeeIds.length > 0) {
      const { error: cleanInternErr } = await supabase
        .from("payroll_calculated")
        .delete()
        .in("employee_id", internEmployeeIds)
        .eq("reference_year", year)
        .eq("reference_month", month);
      if (cleanInternErr) throw cleanInternErr;
    }
    const employees = (employeesRaw ?? []).filter((e: any) => !isInternshipEmployee(e));

    // Defaults de "ponto impacta folha" por cargo
    const { data: positionsData } = await supabase
      .from("positions")
      .select("name, time_clock_payroll");
    const positionPayrollMap = new Map<string, boolean>();
    (positionsData ?? []).forEach((p: any) => {
      positionPayrollMap.set(p.name, p.time_clock_payroll !== false);
    });
    const resolveTimeClockPayroll = (emp: any): boolean => {
      if (emp.time_clock_payroll === true) return true;
      if (emp.time_clock_payroll === false) return false;
      if (emp.position && positionPayrollMap.has(emp.position)) {
        return positionPayrollMap.get(emp.position)!;
      }
      return true;
    };

    const empIds = (employees ?? []).map((e: any) => e.id);
    if (empIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper para paginar qualquer builder do PostgREST (limite padrão 1000).
    // Uso: await fetchAllPaged((from, to) => qb.range(from, to))
    async function fetchAllPaged<T = any>(
      makeQuery: (from: number, to: number) => any,
      pageSize = 1000,
    ): Promise<T[]> {
      const all: T[] = [];
      let from = 0;
      // Loop defensivo com teto para não travar caso algo dê errado.
      for (let i = 0; i < 100; i++) {
        const { data, error } = await makeQuery(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as T[];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return all;
    }

    // Pré-carregar dados auxiliares em batch
    const [vtRes, vtPaidRes, depRes, infRes, existingRes, holRes, manualHolidayRes, punchRows, advRes, schedRows, certRes, vacRes, justRes, unpaidLeavesRes] = await Promise.all([
      supabase.from("employee_transport_vouchers").select("*").in("employee_id", empIds),
      supabase.from("transport_voucher_monthly_payments")
        .select("employee_id, amount_paid, days_paid")
        .in("employee_id", empIds)
        .eq("reference_year", year)
        .eq("reference_month", month),
      supabase.from("employee_dependents").select("employee_id, birth_date").in("employee_id", empIds),
      supabase.from("employee_infractions")
        .select("employee_id, occurred_on, applied_weight, infraction_types(financial_penalty)")
        .in("employee_id", empIds).gte("occurred_on", periodStart).lte("occurred_on", periodEnd),
      supabase.from("payroll_calculated").select("id, employee_id, advance, source, other_earnings, other_discounts, food_voucher, health_plan")
        .in("employee_id", empIds).eq("reference_year", year).eq("reference_month", month),
      supabase.from("holidays").select("id, holiday_date, store_id")
        .gte("holiday_date", periodStart).lte("holiday_date", periodEnd),
      supabase.from("payroll_holiday_worked").select("employee_id, holiday_id")
        .in("employee_id", empIds)
        .eq("reference_year", year)
        .eq("reference_month", month),
      // Batidas de ponto: PAGINADO — meses movimentados estouram 1000 linhas
      // e faziam colaboradores aparecerem com faltas fantasmas.
      fetchAllPaged((from, to) =>
        supabase.from("time_clock_entries")
          .select("employee_id, entry_at, entry_type, reference_date")
          .in("employee_id", empIds)
          .gte("reference_date", periodStart)
          .lte("reference_date", periodEnd)
          .order("entry_at", { ascending: true })
          .range(from, to)
      ),
      supabase.from("payroll_advance_installments")
        .select("employee_id, amount, status, payroll_advances!inner(type)")
        .in("employee_id", empIds)
        .eq("reference_year", year)
        .eq("reference_month", month)
        .neq("status", "cancelled"),
      // Escala: também paginado — ~30 dias × N colaboradores facilmente passa de 1000.
      fetchAllPaged((from, to) =>
        supabase.from("work_schedules")
          .select("employee_id, schedule_date, is_day_off, start_time, end_time")
          .in("employee_id", empIds)
          .gte("schedule_date", periodStart)
          .lte("schedule_date", periodEnd)
          .order("schedule_date", { ascending: true })
          .range(from, to)
      ),
      supabase.from("medical_certificates")
        .select("employee_id, leave_start_date, leave_end_date, status, leave_applied, inss_referral")
        .in("employee_id", empIds)
        .eq("status", "approved")
        .lte("leave_start_date", periodEnd)
        .gte("leave_end_date", periodStart),
      supabase.from("vacation_schedules")
        .select("employee_id, start_date, end_date, status")
        .in("employee_id", empIds)
        .in("status", ["approved", "in_progress", "completed"])
        .lte("start_date", periodEnd)
        .gte("end_date", periodStart),
      supabase.from("time_clock_justifications")
        .select("employee_id, reference_date, justification_type, status")
        .in("employee_id", empIds)
        .gte("reference_date", periodStart)
        .lte("reference_date", periodEnd)
        .in("status", ["approved", "resolved"])
        // Apenas tratativas que efetivamente justificam ausência no dia:
        // forgotten_punch (esquecimento de batida — a entry manual acompanha)
        // e late_arrival (atraso justificado — dia foi trabalhado). Tipos
        // "absence", "early_leave" e "other" NÃO removem a falta/hora falta.
        .in("justification_type", ["forgotten_punch", "late_arrival"]),

      supabase.from("employee_leaves")
        .select("employee_id, start_date, end_date, is_paid")
        .in("employee_id", empIds)
        .eq("is_paid", false)
        .lte("start_date", periodEnd)
        .gte("end_date", periodStart),
    ]);

    // Compat: punchRows/schedRows já vêm como array; demais mantêm shape {data}.
    const punchRes = { data: punchRows as any[] };
    const schedRes = { data: schedRows as any[] };
    console.log(`[calculate-payroll] punches=${punchRows.length} schedules=${schedRows.length} empIds=${empIds.length} period=${periodStart}..${periodEnd}`);


    // Valor de VT efetivamente pago no mês por colaborador (override do teórico).
    const vtPaidMap = new Map<string, { amount: number; days: number | null }>();
    (vtPaidRes.data ?? []).forEach((p: any) => {
      vtPaidMap.set(p.employee_id, {
        amount: Number(p.amount_paid ?? 0),
        days: p.days_paid === null || p.days_paid === undefined ? null : Number(p.days_paid),
      });
    });

    // Override mensal de adicional noturno (página /adicional-noturno).
    // Quando existe registro para (emp, year, month), o valor da tabela substitui
    // o cálculo automático e o lançamento legado em payroll_advances.
    const { data: nightOverridesRes } = await supabase
      .from("payroll_night_addition")
      .select("employee_id, amount")
      .eq("reference_year", year)
      .eq("reference_month", month)
      .in("employee_id", empIds);
    const nightOverrideMap = new Map<string, number>();
    (nightOverridesRes ?? []).forEach((r: any) => {
      nightOverrideMap.set(r.employee_id, Number(r.amount ?? 0));
    });

    const vtMap = new Map<string, any>();
    (vtRes.data ?? []).forEach((v: any) => vtMap.set(v.employee_id, v));

    const depMap = new Map<string, { total: number; under14: number }>();
    (depRes.data ?? []).forEach((d: any) => {
      const cur = depMap.get(d.employee_id) ?? { total: 0, under14: 0 };
      cur.total += 1;
      // Sem data de nascimento => presume elegível ao salário-família
      // (foi cadastrado como dependente para esse fim). Com data, valida < 14 anos.
      if (!d.birth_date || ageOn(d.birth_date, refDate) < 14) cur.under14 += 1;
      depMap.set(d.employee_id, cur);
    });

    const infMap = new Map<string, number>();
    (infRes.data ?? []).forEach((i: any) => {
      const penalty = Number(i.infraction_types?.financial_penalty ?? 0);
      const weight = Number(i.applied_weight ?? 1);
      infMap.set(i.employee_id, (infMap.get(i.employee_id) ?? 0) + penalty * weight);
    });

    const existingMap = new Map<string, any>();
    (existingRes.data ?? []).forEach((e: any) => existingMap.set(e.employee_id, e));

    // Soma das parcelas do mês (pendentes/aplicadas).
    // - advance/loan/deduction → entram como desconto (advMap)
    // - earning → entra como provento avulso (extraEarningMap)
    // - night_addition → entra como adicional noturno manual (manualNightMap)
    const advMap = new Map<string, number>();
    const extraEarningMap = new Map<string, number>();
    const manualNightMap = new Map<string, number>();
    (advRes.data ?? []).forEach((p: any) => {
      const t = p.payroll_advances?.type ?? "advance";
      const amt = Number(p.amount ?? 0);
      if (t === "earning") {
        extraEarningMap.set(p.employee_id, (extraEarningMap.get(p.employee_id) ?? 0) + amt);
      } else if (t === "night_addition") {
        manualNightMap.set(p.employee_id, (manualNightMap.get(p.employee_id) ?? 0) + amt);
      } else {
        advMap.set(p.employee_id, (advMap.get(p.employee_id) ?? 0) + amt);
      }
    });

    // Feriados: separa nacionais (store_id null) dos vinculados a loja
    const holidayDateById = new Map<string, string>();
    const nationalHolidays = new Set<string>();
    const storeHolidays = new Map<string, Set<string>>(); // store_id -> dates
    (holRes.data ?? []).forEach((h: any) => {
      holidayDateById.set(h.id, h.holiday_date);
      if (!h.store_id) nationalHolidays.add(h.holiday_date);
      else {
        const set = storeHolidays.get(h.store_id) ?? new Set<string>();
        set.add(h.holiday_date);
        storeHolidays.set(h.store_id, set);
      }
    });

    // Feriados marcados manualmente na folha (necessário para colaboradores sem
    // ponto impactando a folha, como supervisores/gestores). Também evita que o
    // recálculo apague a rubrica lançada pelo diálogo "Feriado trabalhado".
    const manualHolidayMap = new Map<string, Set<string>>();
    (manualHolidayRes.data ?? []).forEach((m: any) => {
      const holidayDate = holidayDateById.get(m.holiday_id);
      if (!holidayDate) return;
      const set = manualHolidayMap.get(m.employee_id) ?? new Set<string>();
      set.add(holidayDate);
      manualHolidayMap.set(m.employee_id, set);
    });

    // Pontos por colaborador
    const punchMap = new Map<string, PunchEntry[]>();
    (punchRes.data ?? []).forEach((p: any) => {
      const arr = punchMap.get(p.employee_id) ?? [];
      arr.push(p);
      punchMap.set(p.employee_id, arr);
    });

    // Escala prevista por colaborador (apenas dias com turno = não folga e tem start_time)
    const scheduleMap = new Map<string, Set<string>>();
    // Minutos escalados por (colaborador, data). Usado para apurar "horas faltas"
    // (dia com pontos mas trabalhou menos que o previsto — ex.: saída antecipada).
    // Desconta 60 min de intervalo intra-jornada quando a jornada > 6h.
    const scheduleMinutesMap = new Map<string, Map<string, number>>();
    const toMinutes = (hhmmss: string | null | undefined): number | null => {
      if (!hhmmss) return null;
      const [h, m] = hhmmss.split(":").map((v) => Number(v));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    (schedRes.data ?? []).forEach((s: any) => {
      if (s.is_day_off || !s.start_time) return;
      const set = scheduleMap.get(s.employee_id) ?? new Set<string>();
      set.add(s.schedule_date);
      scheduleMap.set(s.employee_id, set);
      const sMin = toMinutes(s.start_time);
      const eMin = toMinutes(s.end_time);
      if (sMin !== null && eMin !== null) {
        let dur = eMin - sMin;
        if (dur <= 0) dur += 1440; // vira o dia (12x36 noturno)
        // Jornadas > 6h têm 1h de intervalo intra-jornada (CLT art. 71).
        if (dur > 360) dur -= 60;
        const inner = scheduleMinutesMap.get(s.employee_id) ?? new Map<string, number>();
        inner.set(s.schedule_date, dur);
        scheduleMinutesMap.set(s.employee_id, inner);
      }
    });


    // Datas justificadas (atestado aprovado ou férias) — não contam como falta
    const justifiedMap = new Map<string, Set<string>>();
    const addJustified = (empId: string, startDate: string, endDate: string) => {
      const set = justifiedMap.get(empId) ?? new Set<string>();
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      const periodStartD = new Date(`${periodStart}T00:00:00`);
      const periodEndD = new Date(`${periodEnd}T00:00:00`);
      const cur = new Date(Math.max(start.getTime(), periodStartD.getTime()));
      const lim = new Date(Math.min(end.getTime(), periodEndD.getTime()));
      while (cur <= lim) {
        const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, "0"), d = String(cur.getDate()).padStart(2, "0");
        set.add(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      justifiedMap.set(empId, set);
    };
    (certRes.data ?? []).forEach((c: any) => {
      if (c.leave_start_date && c.leave_end_date) addJustified(c.employee_id, c.leave_start_date, c.leave_end_date);
    });
    // Férias: marca como justificado E acumula dias no mês por colaborador
    const vacationDaysMap = new Map<string, number>();
    const countDaysInPeriod = (startIso: string, endIso: string): number => {
      const s = new Date(`${Math.max(startIso, periodStart) === startIso ? startIso : periodStart}T00:00:00`);
      const e = new Date(`${Math.min(endIso, periodEnd) === endIso ? endIso : periodEnd}T00:00:00`);
      if (e < s) return 0;
      return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    };
    (vacRes.data ?? []).forEach((v: any) => {
      if (!v.start_date || !v.end_date) return;
      addJustified(v.employee_id, v.start_date, v.end_date);
      const days = countDaysInPeriod(v.start_date, v.end_date);
      vacationDaysMap.set(v.employee_id, (vacationDaysMap.get(v.employee_id) ?? 0) + days);
    });
    // Tratativas do ponto aprovadas/resolvidas (falta justificada, atestado lançado
    // como tratativa, atraso justificado, esquecimento de batida com entry criada).
    // Qualquer tratativa aprovada para o dia tira a falta da folha.
    (justRes.data ?? []).forEach((j: any) => {
      if (j.reference_date) addJustified(j.employee_id, j.reference_date, j.reference_date);
    });

    // Afastamentos NÃO remunerados (employee_leaves.is_paid=false): os dias
    // devem ser descontados como falta na folha. Construímos um set por
    // colaborador limitado ao período, e mais abaixo:
    //   1) removemos esses dias do justifiedMap (caso o atestado tenha sido
    //      aprovado em medical_certificates e marcado todo o intervalo como
    //      justificado);
    //   2) adicionamos ao absenceDateSet — mesmo se não houver escala no dia
    //      (pois o usuário marcou explicitamente como não remunerado).
    const unpaidLeaveMap = new Map<string, Set<string>>();
    const addUnpaidLeave = (empId: string, startDate: string, endDate: string) => {
      const set = unpaidLeaveMap.get(empId) ?? new Set<string>();
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      const periodStartD = new Date(`${periodStart}T00:00:00`);
      const periodEndD = new Date(`${periodEnd}T00:00:00`);
      const cur = new Date(Math.max(start.getTime(), periodStartD.getTime()));
      const lim = new Date(Math.min(end.getTime(), periodEndD.getTime()));
      while (cur <= lim) {
        const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, "0"), d = String(cur.getDate()).padStart(2, "0");
        set.add(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      unpaidLeaveMap.set(empId, set);
    };
    (unpaidLeavesRes.data ?? []).forEach((l: any) => {
      if (l.start_date && l.end_date) addUnpaidLeave(l.employee_id, l.start_date, l.end_date);
    });
    // Remove dias não remunerados do justifiedMap
    for (const [empId, unpaidSet] of unpaidLeaveMap.entries()) {
      const just = justifiedMap.get(empId);
      if (just) {
        for (const d of unpaidSet) just.delete(d);
      }
    }

    // ===== Afastamento previdenciário (INSS) — CLT art. 60 §3º =====
    // Atestado encaminhado ao INSS:
    //   • Dias 1 a 15 desde o início do afastamento => empregador paga como
    //     rubrica "Afastamento previdenciário (15 primeiros dias)" (provento,
    //     incide INSS/FGTS/IRRF). Não conta como falta, não conta como salário
    //     normal proporcional.
    //   • Dia 16 em diante => INSS assume; contrato suspenso; empregador NÃO
    //     paga; informativo apenas.
    // Aqui montamos, por colaborador, os conjuntos de datas (interseção com o
    // mês) classificadas em "15 primeiros" e "suspensão INSS".
    const inssEmployerDaysMap = new Map<string, Set<string>>();
    const inssSuspensionDaysMap = new Map<string, Set<string>>();
    const inssDayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    (certRes.data ?? []).forEach((c: any) => {
      if (!c.inss_referral || !c.leave_start_date || !c.leave_end_date) return;
      const leaveStart = new Date(`${c.leave_start_date}T00:00:00`);
      const leaveEnd = new Date(`${c.leave_end_date}T00:00:00`);
      const periodStartD = new Date(`${periodStart}T00:00:00`);
      const periodEndD = new Date(`${periodEnd}T00:00:00`);
      const cursor = new Date(Math.max(leaveStart.getTime(), periodStartD.getTime()));
      const stop = new Date(Math.min(leaveEnd.getTime(), periodEndD.getTime()));
      const employerSet = inssEmployerDaysMap.get(c.employee_id) ?? new Set<string>();
      const suspensionSet = inssSuspensionDaysMap.get(c.employee_id) ?? new Set<string>();
      while (cursor <= stop) {
        const dayIndex = Math.floor(
          (cursor.getTime() - leaveStart.getTime()) / 86400000,
        ); // 0-indexed (dia 0 = primeiro dia)
        const key = inssDayKey(cursor);
        if (dayIndex < 15) employerSet.add(key);
        else suspensionSet.add(key);
        cursor.setDate(cursor.getDate() + 1);
      }
      inssEmployerDaysMap.set(c.employee_id, employerSet);
      inssSuspensionDaysMap.set(c.employee_id, suspensionSet);
    });


    const rows: any[] = [];

    for (const emp of employees ?? []) {
      // Data oficial de admissão CLT (admission_date) tem prioridade sobre hire_date
      // (que representa apenas a entrada no sistema/cadastro).
      const admissionDate: string | null = emp.admission_date ?? emp.hire_date ?? null;
      if (admissionDate && admissionDate > periodEnd) continue;
      if (emp.termination_date && emp.termination_date < periodStart) continue;

      // Horista: salary é R$/hora; salário-base mensal = hora × monthly_hours (default 220)
      const isHourly = String(emp.salary_type ?? "").toLowerCase() === "horario";
      const monthlyHours = Number(emp.monthly_hours ?? 220) || 220;
      const baseSalary = isHourly
        ? r2(Number(emp.salary ?? 0) * monthlyHours)
        : Number(emp.salary ?? 0);

      let workedDays = 30;
      if (admissionDate && admissionDate >= periodStart && admissionDate <= periodEnd) {
        const hire = new Date(admissionDate);
        workedDays = lastDay - hire.getDate() + 1;
      }
      if (emp.termination_date && emp.termination_date >= periodStart && emp.termination_date <= periodEnd) {
        const term = new Date(emp.termination_date);
        workedDays = Math.min(workedDays, term.getDate());
      }
      const hasPartialMonth = (admissionDate && admissionDate >= periodStart && admissionDate <= periodEnd) ||
        (emp.termination_date && emp.termination_date >= periodStart && emp.termination_date <= periodEnd);

      // ===== Afastamento INSS — separa salário normal x rubrica 15 dias x suspensão =====
      const inssEmployerDays = (inssEmployerDaysMap.get(emp.id)?.size ?? 0);
      const inssSuspensionDays = (inssSuspensionDaysMap.get(emp.id)?.size ?? 0);
      const inssTotalDays = inssEmployerDays + inssSuspensionDays;
      // ===== Férias gozadas no mês (pagas em recibo próprio) =====
      // Dias descontados do salário proporcional; valor bruto vai no recibo,
      // NÃO reincide INSS/IRRF na folha (já tributado no recibo).
      const vacationDaysInMonth = Math.min(vacationDaysMap.get(emp.id) ?? 0, workedDays);
      // Dias pagos como salário normal na folha: descontamos afastamento INSS + férias.
      const salaryWorkedDays = Math.max(0, workedDays - inssTotalDays - vacationDaysInMonth);
      const dailyBase = baseSalary / lastDay;
      const proportionalSalary = (hasPartialMonth || inssTotalDays > 0 || vacationDaysInMonth > 0)
        ? r2(dailyBase * salaryWorkedDays)
        : baseSalary;
      const inssLeavePay = r2(dailyBase * inssEmployerDays);
      const vacationDeduction = r2(dailyBase * vacationDaysInMonth);


      // VT calculado mais abaixo (após apurar faltas/afastamentos),
      // pois o acerto cobre dias escalados sem batida (VT creditado e não usado).
      const vt = vtMap.get(emp.id);
      let transportVoucher = 0;
      let transportDiscount = 0;
      let vtUnusedDays = 0;
      let vtUnusedAdjustment = 0;

      const deps = depMap.get(emp.id) ?? { total: 0, under14: 0 };

      // Produtividade automática 5% do proporcional (substitui gratificações).
      // Regra: qualquer falta injustificada no período zera a produtividade.
      // (calculada após apurar absentDays mais abaixo)
      let productivity = r2(proportionalSalary * PRODUCTIVITY_RATE);
      const infractionDiscount = r2(infMap.get(emp.id) ?? 0);

      // Salário-família — cota proporcional aos dias efetivamente trabalhados no mês.
      // Conta admissão/demissão no curso do mês (workedDays < lastDay) e também
      // faltas injustificadas (descontadas mais abaixo). Base de limite usa o
      // salário proporcional. Cálculo final feito após apurar absentDays.
      // Placeholder — será sobrescrito mais adiante.
      let familyAllowance = 0;

      // Flag: ponto deste colaborador impacta a folha?
      // Se false (ex.: supervisor de loja), ignora faltas/DSR/noturno/feriado
      // derivados do ponto. Mantém apenas salário, infrações, VT, etc.
      const timeClockImpactsPayroll = resolveTimeClockPayroll(emp);

      // Adicional noturno e feriados trabalhados (a partir do ponto)
      const punches = timeClockImpactsPayroll ? (punchMap.get(emp.id) ?? []) : [];
      const segments = timeClockImpactsPayroll ? buildWorkedSegments(punches) : [];

      let nightHours = 0;
      let holidayDaysWorked = 0;
      const holidayDateSet = new Set<string>();

      const empStoreHolidays =
        (emp.allocated_store_id && storeHolidays.get(emp.allocated_store_id)) ||
        (emp.store_id && storeHolidays.get(emp.store_id)) ||
        new Set<string>();

      // Escala 12x36: feriado faz parte da jornada de revezamento e NÃO gera
      // pagamento em dobro (consolidado em jurisprudência/Súmula 444 TST).
      const is12x36 = String(emp.work_schedule ?? "").toUpperCase().replace(/\s/g, "") === "12X36";

      for (const seg of segments) {
        if (emp.night_shift_eligible) {
          nightHours += nightHoursBetween(seg.startMin, seg.endMin);
        }
        if (!is12x36 && (nationalHolidays.has(seg.date) || empStoreHolidays.has(seg.date))) {
          holidayDateSet.add(seg.date);
        }
      }

      if (!is12x36) {
        for (const manualHolidayDate of manualHolidayMap.get(emp.id) ?? []) {
          holidayDateSet.add(manualHolidayDate);
        }
      }
      holidayDaysWorked = holidayDateSet.size;

      // Adicional noturno: hora_normal_valor * 0.20 * (horas_reais / fator_hora_reduzida_inv)
      // Hora normal = salário / 220
      // Conforme CLT, hora noturna reduzida: cada 60min reais valem 60/52.5 horas
      const hourlyRate = baseSalary > 0 ? baseSalary / 220 : 0;
      const nightHoursAdjusted = nightHours * NIGHT_HOUR_FACTOR;
      const calculatedNightAddition = r2(nightHoursAdjusted * hourlyRate * NIGHT_RATE);
      const manualNightAddition = r2(manualNightMap.get(emp.id) ?? 0);
      // Override da página /adicional-noturno tem prioridade absoluta:
      // se existe registro para o colaborador no mês, ele substitui tudo (cálculo
      // automático e lançamentos legados em payroll_advances).
      const nightOverride = nightOverrideMap.get(emp.id);
      const nightAddition = nightOverride !== undefined
        ? r2(nightOverride)
        : r2(calculatedNightAddition + manualNightAddition);

      // Feriados trabalhados: pagos em DOBRO conforme convenção coletiva.
      // Base PROPORCIONAL aos dias do mês de referência (lastDay), NÃO 30 fixo.
      // Ex.: maio (31 dias) -> diária = salário/31; abril (30 dias) -> diária = salário/30.
      const holidayDailyRate = baseSalary / lastDay;
      const holidayPay = r2(holidayDaysWorked * holidayDailyRate * 2);

      // ===== Faltas e DSR (a partir da escala vs ponto) =====
      // Só apura se o ponto deste colaborador impacta folha.
      const workedDates = new Set<string>(segments.map((s) => s.date));
      const scheduledDates = timeClockImpactsPayroll
        ? (scheduleMap.get(emp.id) ?? new Set<string>())
        : new Set<string>();
      const justifiedDates = justifiedMap.get(emp.id) ?? new Set<string>();
      const absenceDateSet = new Set<string>();
      for (const d of scheduledDates) {
        if (workedDates.has(d)) continue;
        if (justifiedDates.has(d)) continue;
        absenceDateSet.add(d);
      }
      // Afastamento não remunerado: força como falta mesmo sem escala/ponto.
      const unpaidDates = unpaidLeaveMap.get(emp.id);
      if (unpaidDates) {
        for (const d of unpaidDates) absenceDateSet.add(d);
      }
      const absentDays = absenceDateSet.size;

      // DSR perdido: 1 DSR a cada semana (segunda a domingo) que tiver pelo menos
      // uma falta. Conta domingos+feriados na semana como "DSR" perdido (limita ao
      // número de domingos do mês para evitar abuso).
      const weeksWithAbsence = new Set<string>();
      for (const d of absenceDateSet) {
        const dt = new Date(`${d}T00:00:00`);
        // chave da semana = data da segunda-feira
        const day = dt.getDay(); // 0=dom..6=sab
        const diffToMonday = (day + 6) % 7;
        const monday = new Date(dt);
        monday.setDate(dt.getDate() - diffToMonday);
        weeksWithAbsence.add(monday.toISOString().slice(0, 10));
      }
      const dsrLossDays = weeksWithAbsence.size;

      // ===== Horas faltas (saída antecipada / entrada tardia) =====
      // Para cada dia com escala prevista E com pontos batidos, comparamos os
      // minutos efetivamente trabalhados com o previsto. Se faltarem mais que
      // a tolerância, geramos "horas faltas" (rubrica separada da falta cheia).
      // Não conta em dias justificados nem em dias considerados falta cheia.
      const PARTIAL_TOLERANCE_MIN = 10;
      let partialMissingMinutes = 0;
      const partialMissingByDate = new Map<string, number>();
      const workedMinByDate = new Map<string, number>();
      for (const seg of segments) {
        workedMinByDate.set(seg.date, (workedMinByDate.get(seg.date) ?? 0) + Math.max(0, seg.endMin - seg.startMin));
      }
      const empScheduleMinutes = scheduleMinutesMap.get(emp.id);
      if (timeClockImpactsPayroll && empScheduleMinutes) {
        for (const [d, expectedMin] of empScheduleMinutes) {
          if (!workedDates.has(d)) continue; // sem batida = falta cheia (já tratada)
          if (justifiedDates.has(d)) continue;
          const worked = workedMinByDate.get(d) ?? 0;
          const missing = expectedMin - worked;
          if (missing > PARTIAL_TOLERANCE_MIN) {
            partialMissingMinutes += missing;
            partialMissingByDate.set(d, missing);
          }
        }
      }
      const partialMissingHours = r2(partialMissingMinutes / 60);
      const partialHourlyRate = baseSalary > 0 ? baseSalary / 220 : 0;
      const partialHoursDiscount = r2(partialMissingHours * partialHourlyRate);

      // Base diária proporcional aos dias do mês de referência (lastDay), NÃO 30 fixo.
      const dailyRateAbs = baseSalary / lastDay;
      const absenceDiscount = r2(absentDays * dailyRateAbs + partialHoursDiscount);
      const dsrLossDiscount = r2(dsrLossDays * dailyRateAbs);


      // Falta injustificada zera a produtividade do período (apenas quando o
      // ponto deste colaborador impacta folha — supervisor não perde produtividade
      // por falta no ponto).
      const productivityLost = timeClockImpactsPayroll && absentDays > 0;
      if (productivityLost) productivity = 0;

      // ===== VT — cálculo final =====
      // Regras:
      //   1) Vale e desconto regulares são proporcionais a workedDays/30.
      //   2) Acerto "VT creditado e não utilizado": para cada dia ESCALADO em que o
      //      colaborador NÃO trabalhou (sem batida) — falta injustificada OU
      //      afastamento (atestado/auxílio/férias) — descontamos o valor diário
      //      do VT, pois a passagem foi paga e não foi usada.
      //   3) Esse acerto entra no transport_discount; transport_voucher continua
      //      sendo o valor cheio creditado no mês.
      if (vt) {
        const daily = Number(vt.daily_value ?? 0);
        const wdpm = Number(vt.working_days_per_month ?? 22);
        const fullVoucher = r2(daily * wdpm);
        const is12x36Schedule = String(emp.work_schedule ?? "").toUpperCase().replace(/\s/g, "") === "12X36";
        const defaultPct = is12x36Schedule ? 3 : 6;
        const rawPct = vt.discount_percent;
        const parsedPct = rawPct === null || rawPct === undefined ? NaN : Number(rawPct);
        const pct = Number.isFinite(parsedPct) ? Math.max(0, parsedPct) : defaultPct;
        // Desconto regular SEMPRE = % cheio sobre o salário (CCT da empresa),
        // mesmo que o valor do VT creditado seja menor (sem cap por fullVoucher).
        // O acerto de "VT não utilizado" é rubrica SEPARADA.
        const fullDiscount = r2(baseSalary * (pct / 100));
        const proportionFactor = hasPartialMonth ? (workedDays / lastDay) : 1;

        // VT pago efetivamente no mês (recarga real informada em /vale-transporte).
        // Quando há registro, ele substitui o cálculo teórico do provento e vira
        // base do "VT não utilizado".
        const paidInfo = vtPaidMap.get(emp.id);
        const usePaid = !!paidInfo && paidInfo.amount > 0;
        transportVoucher = usePaid ? r2(paidInfo!.amount) : r2(fullVoucher * proportionFactor);
        transportDiscount = r2(fullDiscount * proportionFactor);

        // Acerto: VT pago e não utilizado.
        // - Quando há valor pago real: nãoUtilizado = max(0, pago - diasComPonto×daily)
        // - Caso contrário, fallback antigo (dias escalados sem batida × daily)
        if (timeClockImpactsPayroll && daily > 0) {
          if (usePaid) {
            const usedDays = workedDates.size; // dias efetivamente trabalhados (com ponto)
            const usedValue = r2(usedDays * daily);
            const unusedValue = Math.max(0, r2(paidInfo!.amount - usedValue));
            vtUnusedDays = daily > 0 ? Math.round(unusedValue / daily) : 0;
            vtUnusedAdjustment = unusedValue;
          } else {
            let unused = absentDays; // faltas injustificadas
            for (const d of scheduledDates) {
              if (workedDates.has(d)) continue;
              if (absenceDateSet.has(d)) continue; // já contado
              if (justifiedDates.has(d)) unused += 1; // afastamento em dia escalado
            }
            vtUnusedDays = unused;
            vtUnusedAdjustment = r2(unused * daily);
          }
        }

        if (transportDiscount < 0) {
          transportDiscount = 0;
        }
      }

      // Reaproveita campos manuais já lançados
      const existing = existingMap.get(emp.id);
      // Adiantamento: usa SOMENTE as parcelas do mês (payroll_advance_installments).
      // Não soma com o existing.advance para evitar duplicar a cada recálculo.
      const advance = r2(advMap.get(emp.id) ?? 0);
      // Acréscimos avulsos: SOMENTE as parcelas earning do mês (mesmo padrão do advance)
      // para não duplicar a cada recálculo.
      const otherEarnings = r2(extraEarningMap.get(emp.id) ?? 0);
      const otherDiscounts = Number(existing?.other_discounts ?? 0);
      const foodVoucher = Number(existing?.food_voucher ?? 0);
      const healthPlan = existing?.health_plan != null && Number(existing.health_plan) > 0
        ? Number(existing.health_plan)
        : Number(emp.health_plan_copay ?? 0);

      // Salário-família: proporcional aos dias efetivamente trabalhados
      // (workedDays já considera admissão/demissão; subtrai faltas injustificadas).
      const familyDaysWorked = Math.max(0, workedDays - absentDays);
      familyAllowance =
        proportionalSalary <= FAMILY_ALLOWANCE_LIMIT && deps.under14 > 0
          ? r2(deps.under14 * FAMILY_ALLOWANCE_QUOTA * (familyDaysWorked / lastDay))
          : 0;
      

      const inssBase = proportionalSalary + inssLeavePay + productivity + nightAddition + holidayPay + otherEarnings - absenceDiscount - dsrLossDiscount;
      const inss = calcINSS(Math.max(0, inssBase));
      const irrf = calcIRRF(Math.max(0, inssBase), inss, deps.total);
      const fgts = r2(Math.max(0, inssBase) * 0.08);

      const totalEarnings = r2(
        proportionalSalary + inssLeavePay + productivity + nightAddition + holidayPay + familyAllowance + otherEarnings,
      );
      const totalDiscounts = r2(
        inss + irrf + transportDiscount + vtUnusedAdjustment + advance + infractionDiscount + healthPlan + otherDiscounts + absenceDiscount + dsrLossDiscount,
      );
      const netPay = r2(totalEarnings - totalDiscounts);

      rows.push({
        employee_id: emp.id,
        reference_year: year,
        reference_month: month,
        base_salary: baseSalary,
        worked_days: salaryWorkedDays,
        absent_days: absentDays,
        overtime_hours: 0,
        overtime_amount: 0,
        proportional_salary: proportionalSalary,
        transport_voucher: transportVoucher,
        transport_discount: transportDiscount,
        food_voucher: foodVoucher,
        health_plan: healthPlan,
        advance,
        productivity,
        family_allowance: familyAllowance,
        infraction_discount: infractionDiscount,
        absence_discount: absenceDiscount,
        dsr_loss_discount: dsrLossDiscount,
        other_earnings: otherEarnings,
        other_discounts: otherDiscounts,
        inss_leave_days: inssEmployerDays,
        inss_leave_pay: inssLeavePay,
        inss_suspension_days: inssSuspensionDays,
        vacation_days_in_month: vacationDaysInMonth,
        vacation_deduction: vacationDeduction,
        inss,
        irrf,
        fgts,
        total_earnings: totalEarnings,
        total_discounts: totalDiscounts,
        net_pay: netPay,
        source: existing?.source === "xml_override" ? "xml_override" : "calculated",
        calculation_details: {
          dependents_total: deps.total,
          dependents_under14: deps.under14,
          productivity_rate: PRODUCTIVITY_RATE,
          productivity_lost_by_absence: productivityLost,
          time_clock_impacts_payroll: timeClockImpactsPayroll,
          night_eligible: !!emp.night_shift_eligible,
          night_hours_real: r2(nightHours),
          night_hours_adjusted: r2(nightHoursAdjusted),
          night_addition_calculated: calculatedNightAddition,
          night_addition_manual: manualNightAddition,
          night_addition: nightAddition,
          holiday_days_worked: holidayDaysWorked,
          holiday_dates: Array.from(holidayDateSet),
          holiday_pay: holidayPay,
          absent_days: absentDays,
          absence_dates: Array.from(absenceDateSet),
          absence_discount: absenceDiscount,
          dsr_loss_days: dsrLossDays,
          dsr_loss_discount: dsrLossDiscount,
          partial_hours_missing: partialMissingHours,
          partial_hours_discount: partialHoursDiscount,
          partial_hours_dates: Array.from(partialMissingByDate.entries()).map(([d, m]) => ({ date: d, missing_min: m })),

          vt_unused_days: vtUnusedDays,
          vt_unused_adjustment: vtUnusedAdjustment,
          inss_leave_days: inssEmployerDays,
          inss_leave_pay: inssLeavePay,
          inss_suspension_days: inssSuspensionDays,
          vacation_days_in_month: vacationDaysInMonth,
          vacation_deduction: vacationDeduction,
          tables_version: "2026-07",
        },
        calculated_at: new Date().toISOString(),
      });
    }

    const toUpsert = rows.filter((r) => r.source !== "xml_override");

    if (toUpsert.length > 0) {
      const { error: upErr } = await supabase
        .from("payroll_calculated")
        .upsert(toUpsert, { onConflict: "employee_id,reference_year,reference_month" });
      if (upErr) throw upErr;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: toUpsert.length,
        skipped_xml: rows.length - toUpsert.length,
        period: `${year}-${String(month).padStart(2, "0")}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("calculate-payroll error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
