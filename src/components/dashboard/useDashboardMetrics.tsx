import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";

export interface DashboardMetrics {
  employees: number;
  stores: number;
  active: number;
  trainees: number;
  inTraining: number;
  birthdaysMonth: number;
  pendingEvaluations: number;
  avgLastScore: number | null;
  warningsMonth: number;
  infractionsMonth: number;
  missingPunchWeek: number;
  activeSurveys: number;
  surveyResponses: number;
  loading: boolean;
}

const EMPTY: Omit<DashboardMetrics, "loading"> = {
  employees: 0,
  stores: 0,
  active: 0,
  trainees: 0,
  inTraining: 0,
  birthdaysMonth: 0,
  pendingEvaluations: 0,
  avgLastScore: null,
  warningsMonth: 0,
  infractionsMonth: 0,
  missingPunchWeek: 0,
  activeSurveys: 0,
  surveyResponses: 0,
};

async function fetchDashboardMetrics(): Promise<Omit<DashboardMetrics, "loading">> {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const currentMonth = now.getMonth() + 1;

  const [
    emp,
    sto,
    act,
    tra,
    inTr,
    birthdays,
    pendEval,
    lastEvals,
    warnings,
    infractions,
    surveys,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }),
    supabase.from("stores").select("id", { count: "exact", head: true }),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("contract_type", "Estágio").eq("status", "active"),
    supabase.from("employees").select("id", { count: "exact", head: true }).in("training_status", ["pending", "in_progress"]),
    supabase.from("employees").select("birth_date").eq("status", "active").not("birth_date", "is", null),
    supabase.from("evaluations").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("evaluations").select("final_score").eq("status", "completed").order("created_at", { ascending: false }).limit(20),
    supabase.from("employee_warnings").select("id", { count: "exact", head: true }).gte("issued_at", monthStart).lte("issued_at", monthEnd + "T23:59:59"),
    supabase.from("employee_infractions").select("id", { count: "exact", head: true }).gte("occurred_on", monthStart).lte("occurred_on", monthEnd),
    supabase.from("climate_surveys").select("id, status").in("status", ["active", "open"]),
  ]);

  const birthdayCount = (birthdays.data ?? []).filter((b: any) => {
    if (!b.birth_date) return false;
    const m = parseInt(b.birth_date.slice(5, 7), 10);
    return m === currentMonth;
  }).length;

  const scores = (lastEvals.data ?? []).map((e: any) => Number(e.final_score)).filter((n) => !isNaN(n));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  // Pontos não batidos da semana
  let missingPunchWeek = 0;
  const { data: schedules } = await supabase
    .from("work_schedules")
    .select("employee_id, schedule_date, is_day_off")
    .gte("schedule_date", weekStart)
    .lte("schedule_date", weekEnd)
    .eq("is_day_off", false);
  if (schedules && schedules.length > 0) {
    const empIds = Array.from(new Set(schedules.map((s: any) => s.employee_id)));
    const { data: exempts } = await supabase
      .from("employees")
      .select("id")
      .in("id", empIds)
      .eq("exempt_from_timeclock", true);
    const exemptSet = new Set((exempts ?? []).map((e: any) => e.id));
    const { data: entries } = await supabase
      .from("time_clock_entries")
      .select("employee_id, reference_date")
      .in("employee_id", empIds)
      .gte("reference_date", weekStart)
      .lte("reference_date", weekEnd);
    const punched = new Set<string>();
    (entries ?? []).forEach((e: any) => {
      punched.add(`${e.employee_id}_${e.reference_date}`);
    });
    for (const s of schedules as any[]) {
      if (exemptSet.has(s.employee_id)) continue;
      if (s.schedule_date > format(now, "yyyy-MM-dd")) continue;
      if (!punched.has(`${s.employee_id}_${s.schedule_date}`)) missingPunchWeek++;
    }
  }

  // Respostas das pesquisas ativas
  let surveyResponses = 0;
  const activeSurveyIds = (surveys.data ?? []).map((s: any) => s.id);
  if (activeSurveyIds.length > 0) {
    const { count } = await supabase
      .from("climate_responses")
      .select("id", { count: "exact", head: true })
      .in("survey_id", activeSurveyIds);
    surveyResponses = count ?? 0;
  }

  return {
    employees: emp.count ?? 0,
    stores: sto.count ?? 0,
    active: act.count ?? 0,
    trainees: tra.count ?? 0,
    inTraining: inTr.count ?? 0,
    birthdaysMonth: birthdayCount,
    pendingEvaluations: pendEval.count ?? 0,
    avgLastScore: avg,
    warningsMonth: warnings.count ?? 0,
    infractionsMonth: infractions.count ?? 0,
    missingPunchWeek,
    activeSurveys: activeSurveyIds.length,
    surveyResponses,
  };
}

export function useDashboardMetrics(): DashboardMetrics {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: fetchDashboardMetrics,
    staleTime: 2 * 60 * 1000, // 2 min: considerado fresco, não refetch
    gcTime: 10 * 60 * 1000, // 10 min: mantém em memória
    refetchOnWindowFocus: false,
    refetchOnMount: false, // usa cache se ainda válido
  });

  return {
    ...(data ?? EMPTY),
    loading: isLoading && !data,
  };
}
