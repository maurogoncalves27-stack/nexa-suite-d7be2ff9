import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, addMonths, format, startOfMonth, subDays, subMonths } from "date-fns";

export interface Nr1Metrics {
  // Psicossocial
  climateAdherencePct: number | null;
  climateENps: number | null;
  climateLastDate: string | null;
  climateAvgByDimension: Record<string, number>;
  moodAvg30d: number | null;
  moodPrevAvg: number | null;
  moodTrend: number | null;
  moodRespondents30d: number;
  moodHiddenByPrivacy: boolean;
  mentalAlertsOpen: number;
  mentalAlertsResolved30d: number;
  // PCMSO
  activeEmployees: number;
  pcmsoValid: number;
  pcmsoExpired: number;
  pcmsoExpiring60: number;
  // Atestados
  absenteeismDays3m: number;
  absenteeismRate3m: number | null;
  absenteeismDays12m: number;
  topCids: { cid: string; count: number }[];
  daysByStoreMonth: { store: string; days: number }[];
  // CID F (saúde mental)
  cidfCount12m: number;
  cidfDays12m: number;
  cidfCount90d: number;
  cidfEmployees90d: number;
  // Riscos psicossociais (PGR)
  psychoRisksOpen: number;
  psychoRisksHigh: number;
  psychoRisksOverdue: number;
  // SST docs
  sstTotal: number;
  sstValid: number;
  sstExpiring60: number;
  sstExpired: number;
  // Score
  scorePsycho: number;
  scorePcmso: number;
  scoreAbsent: number;
  scoreSst: number;
  scoreOverall: number;
}

const MIN_RESPONDENTS_FOR_AGG = 5;


async function fetchMetrics(): Promise<Nr1Metrics> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const in60 = format(addDays(today, 60), "yyyy-MM-dd");
  const d30ago = format(subDays(today, 30), "yyyy-MM-dd");
  const d60ago = format(subDays(today, 60), "yyyy-MM-dd");
  const m3ago = format(subMonths(today, 3), "yyyy-MM-dd");
  const m12ago = format(subMonths(today, 12), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");

  const [
    empActive,
    surveys,
    moodRecent,
    moodPrev,
    alertsOpen,
    alertsResolved,
    pcmsoAll,
    certs3m,
    certs12m,
    certsMonth,
    sst,
    psychoRisks,
  ] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("climate_surveys").select("id, name, end_date, start_date").order("end_date", { ascending: false }).limit(1),
    supabase.from("mood_checkins").select("mood_score").gte("created_at", d30ago).eq("skipped", false),
    supabase.from("mood_checkins").select("mood_score").gte("created_at", d60ago).lt("created_at", d30ago).eq("skipped", false),
    supabase.from("mental_health_alerts").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    supabase.from("mental_health_alerts").select("id", { count: "exact", head: true }).eq("status", "resolved").gte("resolved_at", d30ago),
    supabase.from("medical_certificates").select("employee_id, valid_until").eq("is_pcmso", true),
    supabase.from("medical_certificates").select("days_off, cid_code, employee_id, start_date").gte("certificate_date", m3ago),
    supabase.from("medical_certificates").select("days_off, cid_code, employee_id, start_date").gte("certificate_date", m12ago),
    supabase.from("medical_certificates").select("days_off, employee:employees(store:stores(name))").gte("certificate_date", monthStart),
    supabase.from("sst_documents").select("id, valid_until, is_active").eq("is_active", true),
    supabase.from("psychosocial_risks").select("id, severity, status, deadline"),
  ]);


  const activeEmployees = empActive.count ?? 0;

  // Climate
  let climateAdherencePct: number | null = null;
  let climateENps: number | null = null;
  let climateLastDate: string | null = null;
  const climateAvgByDimension: Record<string, number> = {};
  const lastSurvey = (surveys.data ?? [])[0];
  if (lastSurvey) {
    climateLastDate = lastSurvey.end_date;
    const [{ count: respCount }, { data: answers }] = await Promise.all([
      supabase.from("climate_responses").select("id", { count: "exact", head: true }).eq("survey_id", lastSurvey.id),
      supabase.from("climate_response_answers").select("numeric_value, question:climate_questions(dimension, question_type)").eq("response_id", lastSurvey.id).limit(1),
    ]);
    // Get answers via responses
    const { data: respIds } = await supabase.from("climate_responses").select("id").eq("survey_id", lastSurvey.id);
    const ids = (respIds ?? []).map((r: any) => r.id);
    if (activeEmployees > 0 && respCount != null) {
      climateAdherencePct = Math.round((respCount / activeEmployees) * 100);
    }
    if (ids.length > 0) {
      const { data: ans } = await supabase
        .from("climate_response_answers")
        .select("numeric_value, question:climate_questions(dimension, question_type)")
        .in("response_id", ids);
      const byDim: Record<string, number[]> = {};
      const enpsScores: number[] = [];
      (ans ?? []).forEach((a: any) => {
        const dim = a.question?.dimension;
        const qt = a.question?.question_type;
        const v = Number(a.numeric_value);
        if (isNaN(v)) return;
        if (qt === "enps_0_10") enpsScores.push(v);
        else if (dim) (byDim[dim] ||= []).push(v);
      });
      Object.entries(byDim).forEach(([k, arr]) => {
        climateAvgByDimension[k] = arr.reduce((s, n) => s + n, 0) / arr.length;
      });
      if (enpsScores.length) {
        const prom = enpsScores.filter((n) => n >= 9).length;
        const detr = enpsScores.filter((n) => n <= 6).length;
        climateENps = Math.round(((prom - detr) / enpsScores.length) * 100);
      }
    }
  }

  const moodRecentRows = (moodRecent.data ?? []) as { mood_score: number }[];
  const moodPrevRows = (moodPrev.data ?? []) as { mood_score: number }[];
  const moodAvg30d = moodRecentRows.length ? moodRecentRows.reduce((s, r) => s + r.mood_score, 0) / moodRecentRows.length : null;
  const moodPrevAvg = moodPrevRows.length ? moodPrevRows.reduce((s, r) => s + r.mood_score, 0) / moodPrevRows.length : null;
  const moodTrend = moodAvg30d != null && moodPrevAvg != null ? moodAvg30d - moodPrevAvg : null;

  // PCMSO — pega ASO mais recente por colaborador
  const pcmsoRows = (pcmsoAll.data ?? []) as { employee_id: string; valid_until: string | null }[];
  const latestByEmp = new Map<string, string | null>();
  pcmsoRows.forEach((r) => {
    const cur = latestByEmp.get(r.employee_id);
    if (!cur || (r.valid_until && (!cur || r.valid_until > cur))) latestByEmp.set(r.employee_id, r.valid_until);
  });
  let pcmsoValid = 0, pcmsoExpired = 0, pcmsoExpiring60 = 0;
  latestByEmp.forEach((valid) => {
    if (!valid) { pcmsoValid++; return; }
    if (valid < todayStr) pcmsoExpired++;
    else if (valid <= in60) pcmsoExpiring60++;
    else pcmsoValid++;
  });
  const empWithoutAso = Math.max(0, activeEmployees - latestByEmp.size);
  pcmsoExpired += empWithoutAso;

  // Atestados
  const rows3m = (certs3m.data ?? []) as { days_off: number | null; cid_code: string | null }[];
  const rows12m = (certs12m.data ?? []) as { days_off: number | null; cid_code: string | null }[];
  const absenteeismDays3m = rows3m.reduce((s, r) => s + Number(r.days_off ?? 0), 0);
  const absenteeismDays12m = rows12m.reduce((s, r) => s + Number(r.days_off ?? 0), 0);
  const workingDays3m = activeEmployees * 90;
  const absenteeismRate3m = workingDays3m > 0 ? (absenteeismDays3m / workingDays3m) * 100 : null;
  const cidCount: Record<string, number> = {};
  rows12m.forEach((r) => {
    if (r.cid_code) cidCount[r.cid_code] = (cidCount[r.cid_code] ?? 0) + 1;
  });
  const topCids = Object.entries(cidCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cid, count]) => ({ cid, count }));

  const byStore: Record<string, number> = {};
  ((certsMonth.data ?? []) as any[]).forEach((r) => {
    const s = r.employee?.store?.name ?? "Sem loja";
    byStore[s] = (byStore[s] ?? 0) + Number(r.days_off ?? 0);
  });
  const daysByStoreMonth = Object.entries(byStore).sort((a, b) => b[1] - a[1]).map(([store, days]) => ({ store, days }));

  // SST
  const sstRows = (sst.data ?? []) as { valid_until: string | null }[];
  const sstTotal = sstRows.length;
  let sstValid = 0, sstExpired = 0, sstExpiring60 = 0;
  sstRows.forEach((r) => {
    if (!r.valid_until) { sstValid++; return; }
    if (r.valid_until < todayStr) sstExpired++;
    else if (r.valid_until <= in60) { sstExpiring60++; sstValid++; }
    else sstValid++;
  });

  // Scores
  const scorePsycho = (() => {
    let s = 0, n = 0;
    if (climateAdherencePct != null) { s += climateAdherencePct; n++; }
    if (climateENps != null) { s += Math.max(0, Math.min(100, (climateENps + 100) / 2)); n++; }
    if (moodAvg30d != null) { s += (moodAvg30d / 5) * 100; n++; }
    const alertsPenalty = alertsOpen.count ? Math.max(0, 100 - (alertsOpen.count ?? 0) * 10) : 100;
    s += alertsPenalty; n++;
    return n ? Math.round(s / n) : 0;
  })();
  const scorePcmso = activeEmployees > 0 ? Math.round((pcmsoValid / activeEmployees) * 100) : 100;
  const scoreAbsent = absenteeismRate3m != null ? Math.max(0, Math.round(100 - absenteeismRate3m * 10)) : 100;
  const scoreSst = sstTotal > 0 ? Math.round((sstValid / sstTotal) * 100) : 0;
  const scoreOverall = Math.round((scorePsycho + scorePcmso + scoreAbsent + scoreSst) / 4);

  return {
    climateAdherencePct,
    climateENps,
    climateLastDate,
    climateAvgByDimension,
    moodAvg30d,
    moodPrevAvg,
    moodTrend,
    mentalAlertsOpen: alertsOpen.count ?? 0,
    mentalAlertsResolved30d: alertsResolved.count ?? 0,
    activeEmployees,
    pcmsoValid,
    pcmsoExpired,
    pcmsoExpiring60,
    absenteeismDays3m,
    absenteeismRate3m,
    absenteeismDays12m,
    topCids,
    daysByStoreMonth,
    sstTotal,
    sstValid,
    sstExpiring60,
    sstExpired,
    scorePsycho,
    scorePcmso,
    scoreAbsent,
    scoreSst,
    scoreOverall,
  };
}

export function useNr1Metrics() {
  return useQuery({
    queryKey: ["nr1-metrics"],
    queryFn: fetchMetrics,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
