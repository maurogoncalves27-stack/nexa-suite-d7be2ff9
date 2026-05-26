import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface Store { id: string; name: string }
export interface Employee {
  id: string;
  full_name: string;
  store_id: string;
  allocated_store_id?: string | null;
  work_schedule: string | null;
  night_shift_eligible?: boolean | null;
}
export interface Schedule {
  id: string;
  employee_id: string;
  schedule_date: string;
  is_day_off: boolean;
  is_home_office: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  break_start_2: string | null;
  break_end_2: string | null;
  store_id?: string | null;
  notes?: string | null;
}

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Mapeia nome da loja para classes de cor do design system. */
export function getStoreColorClasses(name: string | undefined | null) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("asa sul")) return { bg: "bg-store-asa-sul", fg: "text-store-asa-sul-foreground", dot: "bg-store-asa-sul" };
  if (n.includes("lago sul")) return { bg: "bg-store-lago-sul", fg: "text-store-lago-sul-foreground", dot: "bg-store-lago-sul" };
  if (n.includes("asa norte")) return { bg: "bg-store-asa-norte", fg: "text-store-asa-norte-foreground", dot: "bg-store-asa-norte" };
  if (n.includes("aguas claras") || n.includes("águas claras"))
    return { bg: "bg-store-aguas-claras", fg: "text-store-aguas-claras-foreground", dot: "bg-store-aguas-claras" };
  return { bg: "bg-muted", fg: "text-foreground", dot: "bg-muted-foreground" };
}

/**
 * Valida regra de folgas conforme escala do colaborador.
 * - 5x2: máximo 2 folgas/semana
 * - 6x1: máximo 1 folga/semana
 * - 12x36: alterna trabalho/folga (dia anterior e seguinte devem ser opostos ao dia marcado)
 * Retorna mensagem de erro ou null se ok.
 */
export async function validateScheduleRule(params: {
  employeeId: string;
  workSchedule: string | null;
  date: string;
  isDayOff: boolean;
  existingId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): Promise<string | null> {
  const { employeeId, workSchedule, date, isDayOff, existingId, startTime, endTime } = params;
  if (!workSchedule) return null;
  const schedule = workSchedule.trim().toLowerCase();
  const target = new Date(date + "T00:00:00");

  if (schedule === "5x2" || schedule === "6x1") {
    if (!isDayOff) return null;
    const wkStart = format(startOfWeek(target, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const wkEnd = format(endOfWeek(target, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const { data } = await supabase
      .from("work_schedules")
      .select("id, schedule_date")
      .eq("employee_id", employeeId)
      .eq("is_day_off", true)
      .gte("schedule_date", wkStart)
      .lte("schedule_date", wkEnd);
    const others = (data ?? []).filter((r) => r.id !== existingId && r.schedule_date !== date);
    const limit = schedule === "5x2" ? 2 : 1;
    if (others.length + 1 > limit) {
      return `Escala ${schedule} permite no máximo ${limit} folga(s) por semana. Já existem ${others.length} folga(s) nesta semana.`;
    }
  }

  if (schedule === "12x36") {
    if (!isDayOff && startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      if (mins > 12 * 60) {
        const hh = Math.floor(mins / 60);
        const mm = mins % 60;
        return `Escala 12x36 permite no máximo 12h/dia. Jornada informada: ${hh}h${mm.toString().padStart(2, "0")}.`;
      }
    }
    const prev = format(addDays(target, -1), "yyyy-MM-dd");
    const next = format(addDays(target, 1), "yyyy-MM-dd");
    const { data } = await supabase
      .from("work_schedules")
      .select("id, schedule_date, is_day_off")
      .eq("employee_id", employeeId)
      .in("schedule_date", [prev, next]);
    for (const adj of data ?? []) {
      if (adj.id === existingId) continue;
      if (adj.is_day_off === isDayOff) {
        const tipo = isDayOff ? "folga" : "trabalho";
        return `Escala 12x36 alterna trabalho e folga. O dia ${format(new Date(adj.schedule_date + "T00:00:00"), "dd/MM")} já está marcado como ${tipo}.`;
      }
    }
  }

  return null;
}
