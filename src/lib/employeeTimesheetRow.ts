import { supabase } from "@/integrations/supabase/client";
import type { TimesheetClosureEntry, TimesheetClosureRow } from "@/lib/timesheetPdf";

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
  closureSummary?: any;
  closureStatus?: string | null;
  closureAcceptedAt?: string | null;
  closureAcceptedIp?: string | null;
}): Promise<TimesheetClosureRow | null> {
  const { employeeId, year, month } = opts;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [{ data: emp }, { data: entriesData }, { data: schedules }, { data: leavesData }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, cpf, admission_date, position, store_id")
        .eq("id", employeeId)
        .maybeSingle(),
      supabase
        .from("time_clock_entries")
        .select("entry_type, entry_at, reference_date, is_manual, is_outside_geofence")
        .eq("employee_id", employeeId)
        .gte("reference_date", monthStart)
        .lte("reference_date", monthEnd)
        .order("entry_at", { ascending: true }),
      supabase
        .from("work_schedules")
        .select("schedule_date, is_day_off, start_time, end_time")
        .eq("employee_id", employeeId)
        .gte("schedule_date", monthStart)
        .lte("schedule_date", monthEnd),
      supabase
        .from("employee_leaves")
        .select("start_date, end_date, leave_type, notes")
        .eq("employee_id", employeeId)
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
    ]);

  if (!emp) return null;

  const { data: store } = (emp as any).store_id
    ? await supabase
        .from("stores")
        .select("name, address, city, state, legal_name, zip_code")
        .eq("id", (emp as any).store_id)
        .maybeSingle()
    : { data: null as any };

  let scheduledMinutes = 0;
  for (const s of (schedules ?? []) as any[]) {
    if (s.is_day_off || !s.start_time || !s.end_time) continue;
    const [sh, sm] = String(s.start_time).split(":").map(Number);
    const [eh, em] = String(s.end_time).split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    scheduledMinutes += mins;
  }

  const sum = (opts.closureSummary ?? {}) as any;
  const sto = (store ?? {}) as any;
  const addr = [sto.address, sto.zip_code, sto.city, sto.state].filter(Boolean).join(", ") || null;

  return {
    employee_name: (emp as any).full_name,
    employee_cpf: (emp as any).cpf ?? null,
    employee_admission: (emp as any).admission_date ?? null,
    store_name: sto.name ?? null,
    store_address: addr,
    company_name: sto.legal_name ?? sto.name ?? null,
    company_cnpj: "44.932.369/0001-08",
    position: (emp as any).position ?? null,
    worked_days: sum.worked_days ?? null,
    scheduled_work_days: sum.scheduled_work_days ?? null,
    worked_minutes: sum.worked_minutes ?? null,
    scheduled_minutes: scheduledMinutes || null,
    absences: sum.absences ?? null,
    leaves_count: sum.leaves_count ?? null,
    status: opts.closureStatus ?? "open",
    accepted_at: opts.closureAcceptedAt ?? null,
    accepted_ip: opts.closureAcceptedIp ?? null,
    entries: ((entriesData ?? []) as TimesheetClosureEntry[]).map((row: any) => ({
      entry_type: row.entry_type,
      entry_at: row.entry_at,
      reference_date: row.reference_date,
      is_manual: row.is_manual ?? null,
      is_outside_geofence: row.is_outside_geofence ?? null,
    })),
    leaves: (leavesData ?? []) as any,
  };
}
