// rollover-schedules
// Replica o último mês com escala de cada colaborador ativo (5x2/6x1/12x36)
// para o mês alvo. Idempotente: pula colaborador que já tem qualquer linha
// no mês alvo. Suporta { year, month } para backfill manual ou {} para o
// próximo mês a partir de hoje (cron).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WS = {
  employee_id: string;
  schedule_date: string;
  is_day_off: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  break_start_2: string | null;
  break_end_2: string | null;
  store_id: string | null;
};

const SUPPORTED = new Set(["5X2", "6X1", "12X36"]);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const dowFromYmd = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();
const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
      86400000,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // Default = next month from today
    const now = new Date();
    const defNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = Number(body.year ?? defNext.getFullYear());
    const month = Number(body.month ?? defNext.getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("year/month inválidos");
    }

    const targetStart = ymd(year, month, 1);
    const targetEnd = ymd(year, month, daysInMonth(year, month));

    // Colaboradores ativos com escala suportada
    const { data: emps, error: empErr } = await sb
      .from("employees")
      .select("id, full_name, store_id, work_schedule, hire_date, termination_date")
      .eq("status", "active");
    if (empErr) throw empErr;

    const generated: Array<{ employee_id: string; name: string; days: number; off_days: number }> = [];
    const skipped: Array<{ employee_id: string; name: string; reason: string }> = [];

    for (const e of emps ?? []) {
      const sched = String(e.work_schedule ?? "").trim().toUpperCase();
      if (!SUPPORTED.has(sched)) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: `escala não suportada: ${e.work_schedule ?? "—"}` });
        continue;
      }

      // Pula se já demitido antes do mês alvo
      if (e.termination_date && e.termination_date < targetStart) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: "demitido antes do mês alvo" });
        continue;
      }
      // Pula se admitido depois do mês alvo
      if (e.hire_date && e.hire_date > targetEnd) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: "admitido depois do mês alvo" });
        continue;
      }

      // Idempotência: pula se já existe qualquer linha no mês alvo
      const { count: existing } = await sb
        .from("work_schedules")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", e.id)
        .gte("schedule_date", targetStart)
        .lte("schedule_date", targetEnd);
      if ((existing ?? 0) > 0) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: `já tem ${existing} dia(s) no mês alvo` });
        continue;
      }

      // Busca a escala mais recente (até 90 dias antes do alvo)
      const lookbackStart = ymd(year, month, 1);
      const { data: recent } = await sb
        .from("work_schedules")
        .select("employee_id, schedule_date, is_day_off, start_time, end_time, break_start, break_end, break_start_2, break_end_2, store_id")
        .eq("employee_id", e.id)
        .lt("schedule_date", lookbackStart)
        .order("schedule_date", { ascending: false })
        .limit(60);
      const ref = (recent ?? []) as WS[];
      if (ref.length === 0) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: "sem histórico para replicar" });
        continue;
      }

      const workDay = ref.find((r) => !r.is_day_off && r.start_time && r.end_time);
      if (!workDay) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: "histórico só tem folgas" });
        continue;
      }

      const rows: any[] = [];
      const lastDay = daysInMonth(year, month);

      if (sched === "5X2" || sched === "6X1") {
        // Descobre os dias da semana de folga olhando últimos ~30 dias
        const last30 = ref.slice(0, 30);
        const offDows = new Set<number>(
          last30.filter((r) => r.is_day_off).map((r) => dowFromYmd(r.schedule_date)),
        );
        const expectedOff = sched === "5X2" ? 2 : 1;
        // Se não bater, fallback: domingo (0) para 6x1; sábado+domingo (6,0) para 5x2
        if (offDows.size !== expectedOff) {
          offDows.clear();
          if (sched === "6X1") offDows.add(0);
          else { offDows.add(6); offDows.add(0); }
        }
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = ymd(year, month, d);
          const isOff = offDows.has(dowFromYmd(dateStr));
          rows.push({
            employee_id: e.id,
            store_id: workDay.store_id ?? e.store_id ?? null,
            schedule_date: dateStr,
            is_day_off: isOff,
            start_time: isOff ? null : workDay.start_time,
            end_time: isOff ? null : workDay.end_time,
            break_start: isOff ? null : workDay.break_start,
            break_end: isOff ? null : workDay.break_end,
            break_start_2: isOff ? null : workDay.break_start_2,
            break_end_2: isOff ? null : workDay.break_end_2,
            shift_id: null,
          });
        }
      } else {
        // 12x36 — usa o último dia conhecido como âncora e alterna
        const anchor = ref[0]; // mais recente
        const anchorOff = anchor.is_day_off;
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = ymd(year, month, d);
          const diff = daysBetween(anchor.schedule_date, dateStr);
          // Se diff par, mantém o mesmo estado do anchor; se ímpar, inverte
          const isOff = diff % 2 === 0 ? anchorOff : !anchorOff;
          rows.push({
            employee_id: e.id,
            store_id: workDay.store_id ?? e.store_id ?? null,
            schedule_date: dateStr,
            is_day_off: isOff,
            start_time: isOff ? null : workDay.start_time,
            end_time: isOff ? null : workDay.end_time,
            break_start: isOff ? null : workDay.break_start,
            break_end: isOff ? null : workDay.break_end,
            break_start_2: null,
            break_end_2: null,
            shift_id: null,
          });
        }
      }

      // Insere em lote
      const { error: insErr } = await sb.from("work_schedules").insert(rows);
      if (insErr) {
        skipped.push({ employee_id: e.id, name: e.full_name, reason: `insert falhou: ${insErr.message}` });
        continue;
      }
      const off = rows.filter((r) => r.is_day_off).length;
      generated.push({ employee_id: e.id, name: e.full_name, days: rows.length, off_days: off });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        target: { year, month },
        generated_count: generated.length,
        skipped_count: skipped.length,
        generated,
        skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
