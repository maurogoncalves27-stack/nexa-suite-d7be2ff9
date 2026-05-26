// Lógica auxiliar para transições de etapa do pipeline de recrutamento.
//
// Fluxo atual:
//   novos → entrevista_agendada → aguardando_inicio → teste_pratico (treinamento) → contratado
//
// Quando o candidato avança para "teste_pratico", o RH deve criar o colaborador
// em treinamento (formulário pré-preenchido). Se o candidato voltar atrás
// (reprovado/desistiu), o colaborador vinculado é encerrado
// (status=inactive, training_status=cancelled).

import { supabase } from "@/integrations/supabase/client";
import type { StageValue } from "@/lib/recruitment";

export const REVERSAL_STAGES: StageValue[] = ["reprovado", "desistiu"];

/**
 * Cancela o treinamento (colaborador) vinculado ao candidato, caso exista.
 * Retorna true se cancelou algo.
 */
export async function cancelLinkedTraining(candidateId: string): Promise<boolean> {
  const { data: cand } = await supabase
    .from("job_candidates")
    .select("created_employee_id")
    .eq("id", candidateId)
    .maybeSingle();

  const empId = cand?.created_employee_id;
  if (!empId) return false;

  await supabase
    .from("employees")
    .update({ status: "inactive", training_status: "cancelled" })
    .eq("id", empId);

  return true;
}

/**
 * Verifica se a transição requer abrir o formulário de cadastro do colaborador.
 * Dispara ao mover para "cadastro": o gestor preenche o cadastro pré-populado
 * com os dados do candidato e, ao salvar, o candidato avança automaticamente
 * para "teste_pratico" (treinamento).
 */
export function shouldStartTraining(from: StageValue | null, to: StageValue): boolean {
  return to === "cadastro" && from !== "cadastro";
}

/**
 * Verifica se a transição requer reversão (cancelar treinamento já criado).
 * Vale para quem já estava em treinamento, cadastro, aguardando início ou doc OK
 * e foi encerrado.
 */
export function shouldRevertTraining(from: StageValue | null, to: StageValue): boolean {
  const trainingStages: StageValue[] = [
    "teste_pratico",
    "cadastro",
    "aguardando_inicio",
    "documentacao_ok",
    "treinamento_dia_1",
    "treinamento_dia_2",
    "treinamento_dia_3",
    "treinamento_dia_4",
    "treinamento_dia_5",
    "treinamento_dia_6",
    "treinamento_dia_7",
  ];
  return from !== null && trainingStages.includes(from) && REVERSAL_STAGES.includes(to);
}
