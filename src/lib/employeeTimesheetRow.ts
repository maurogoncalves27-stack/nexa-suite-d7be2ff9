import { supabase } from "@/integrations/supabase/client";
import type { TimesheetClosureEntry, TimesheetClosureRow } from "@/lib/timesheetPdf";
import { COMPANY_CNPJ } from "@/lib/companyIdentity";

/** Resumo gravado em timesheet_closures.summary. */
export interface TimesheetClosureSummary {
  worked_days?: number | null;
  scheduled_work_days?: number | null;
  worked_minutes?: number | null;
  absences?: number | null;
  leaves_count?: number | null;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  cpf: string | null;
  admission_date: string | null;
  position: string | null;
  store_id: string | null;
}

interface StoreRow {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  legal_name: string | null;
  zip_code: string | null;
}

interface ScheduleRow {
  schedule_date: string;
  is_day_off: boolean | null;
  start_time: string | null;
  end_time: string | null;
}

interface LeaveRow {
  start_date: string;
  end_date: string;
  leave_type: string;
  notes: string | null;
}

/**
 * Monta uma TimesheetClosureRow completa (com batidas, escala prevista,
 * afastamentos, dados da loja/empresa) para UM único colaborador num
 * período fechado. Usado pela área do colaborador para previsualizar a
 * mesma folha de ponto que o gestor gera.
 */
export async function buildEmployeeTimesheetRow(opts: {
  employeeId: string;
  year: number;
  month: number;
  closureSummary?: TimesheetClosureSummary | null;
  closureStatus?: string | null;
  closureAcceptedAt?: string | null;
  closureAcceptedIp?: string | null;
}): Promise<TimesheetClosureRow | null> {
  const { employeeId, year, month } = opts;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [empRes, entriesRes, schedulesRes, leavesRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, cpf, admission_date, position, store_id")
      .eq("id", employeeId)
      .maybeSingle()
      .returns<EmployeeRow | null>(),
    supabase
      .from("time_clock_entries")
      .select("entry_type, entry_at, reference_date, is_manual, is_outside_geofence")
      .eq("employee_id", employeeId)
      .gte("reference_date", monthStart)
      .lte("reference_date", monthEnd)
      .order("entry_at", { ascending: true })
      .returns<TimesheetClosureEntry[]>(),
    supabase
      .from("work_schedules")
      .select("schedule_date, is_day_off, start_time, end_time")
      .eq("employee_id", employeeId)
      .gte("schedule_date", monthStart)
      .lte("schedule_date", monthEnd)
      .returns<ScheduleRow[]>(),
    supabase
      .from("employee_leaves")
      .select("start_date, end_date, leave_type, notes")
      .eq("employee_id", employeeId)
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart)
      .returns<LeaveRow[]>(),
  ]);

  const emp = empRes.data;
  if (!emp) return null;

  const entriesData = entriesRes.data ?? [];
  const schedules = schedulesRes.data ?? [];
  const leavesData = leavesRes.data ?? [];

  let store: StoreRow | null = null;
  if (emp.store_id) {
    const { data } = await supabase
      .from("stores")
      .select("name, address, city, state, legal_name, zip_code")
      .eq("id", emp.store_id)
      .maybeSingle()
      .returns<StoreRow | null>();
    store = data ?? null;
  }

  let scheduledMinutes = 0;
  for (const s of schedules) {
    if (s.is_day_off || !s.start_time || !s.end_time) continue;
    const [sh, sm] = String(s.start_time).split(":").map(Number);
    const [eh, em] = String(s.end_time).split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    scheduledMinutes += mins;
  }

  const sum: TimesheetClosureSummary = opts.closureSummary ?? {};
  const addr =
    [store?.address, store?.zip_code, store?.city, store?.state].filter(Boolean).join(", ") || null;

  return {
    employee_name: emp.full_name,
    employee_cpf: emp.cpf ?? null,
    employee_admission: emp.admission_date ?? null,
    store_name: store?.name ?? null,
    store_address: addr,
    company_name: store?.legal_name ?? store?.name ?? null,
    company_cnpj: COMPANY_CNPJ,
    position: emp.position ?? null,
    worked_days: sum.worked_days ?? null,
    scheduled_work_days: sum.scheduled_work_days ?? null,
    worked_minutes: sum.worked_minutes ?? null,
    scheduled_minutes: scheduledMinutes || null,
    absences: sum.absences ?? null,
    leaves_count: sum.leaves_count ?? null,
    status: opts.closureStatus ?? "open",
    accepted_at: opts.closureAcceptedAt ?? null,
    accepted_ip: opts.closureAcceptedIp ?? null,
    entries: entriesData.map((row) => ({
      entry_type: row.entry_type,
      entry_at: row.entry_at,
      reference_date: row.reference_date,
      is_manual: row.is_manual ?? null,
      is_outside_geofence: row.is_outside_geofence ?? null,
    })),
    leaves: leavesData,
  };
}
