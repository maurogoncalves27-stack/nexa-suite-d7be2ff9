// Avança automaticamente candidatos em treinamento para a pílula
// correspondente ao número de dias decorridos desde training_schedules.start_date.
// Dia 1 = start_date. Dia 7 = última pílula. Após o dia 7, não avança para
// "contratado" (decisão sempre manual do gestor).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRAINING_STAGES = [
  "treinamento_dia_1",
  "treinamento_dia_2",
  "treinamento_dia_3",
  "treinamento_dia_4",
  "treinamento_dia_5",
  "treinamento_dia_6",
  "treinamento_dia_7",
];

// Estágios a partir dos quais é seguro avançar automaticamente
const AUTO_ADVANCE_FROM = new Set<string>([
  "agendar_treinamento",
  "treinamento_iniciado",
  ...TRAINING_STAGES,
]);

function daysBetween(startDate: string): number {
  // start_date vem como YYYY-MM-DD; tratamos como local (sem timezone shift)
  const [y, m, d] = startDate.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return diff; // 0 = dia do início (Dia 1)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pega todos os schedules e cruza com job_candidates
    const { data: schedules, error: sErr } = await admin
      .from("training_schedules")
      .select("employee_id, start_date");
    if (sErr) throw sErr;

    let advanced = 0;
    const log: Array<Record<string, unknown>> = [];

    for (const sch of schedules ?? []) {
      const diff = daysBetween(sch.start_date);
      if (diff < 0) continue; // ainda não começou
      const targetIdx = Math.min(diff, 6); // 0..6 → dia 1..7
      const targetStage = TRAINING_STAGES[targetIdx];

      const { data: cand } = await admin
        .from("job_candidates")
        .select("id, current_stage")
        .eq("created_employee_id", sch.employee_id)
        .maybeSingle();
      if (!cand) continue;

      if (cand.current_stage === targetStage) continue;
      if (cand.current_stage === "contratado" || cand.current_stage === "rejeitado") continue;
      if (!AUTO_ADVANCE_FROM.has(cand.current_stage)) continue;

      // Só avança para frente, nunca regride
      const currentIdx = TRAINING_STAGES.indexOf(cand.current_stage);
      if (currentIdx >= 0 && targetIdx <= currentIdx) continue;

      const { error: uErr } = await admin
        .from("job_candidates")
        .update({ current_stage: targetStage })
        .eq("id", cand.id);
      if (uErr) { log.push({ candidate_id: cand.id, error: uErr.message }); continue; }

      await admin.from("candidate_stage_history").insert({
        candidate_id: cand.id,
        from_stage: cand.current_stage,
        to_stage: targetStage,
        changed_by: null,
        notes: "Avanço automático por data",
      });

      advanced++;
      log.push({ candidate_id: cand.id, from: cand.current_stage, to: targetStage });
    }

    return new Response(
      JSON.stringify({ advanced, total: schedules?.length ?? 0, log }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
