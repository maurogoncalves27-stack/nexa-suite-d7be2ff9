// Mapeamento das 18 etapas (StageValue) em 5 fases visuais para o Kanban.
// As etapas continuam existindo no banco — apenas agrupamos visualmente.
import type { StageValue } from "./recruitment";
import { STAGES, TRAINING_DAY_STAGES, trainingDayFromStage } from "./recruitment";

export type PhaseKey = "inscritos" | "entrevista" | "documentacao" | "cadastro" | "treinamento" | "encerrado";

export interface PhaseMeta {
  key: PhaseKey;
  label: string;
  shortLabel: string;
  description: string;
  /** Tailwind classes para coluna/card do kanban */
  color: string;
  /** Cor do badge */
  badgeColor: string;
  /** Ordem das stages internas (apenas as ativas/relevantes) */
  stages: StageValue[];
}

export const PHASES: PhaseMeta[] = [
  {
    key: "inscritos",
    label: "Inscritos",
    shortLabel: "Novos",
    description: "Candidatos que se inscreveram e aguardam triagem",
    color: "border-blue-500/30 bg-blue-500/5",
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    stages: ["novos"],
  },
  {
    key: "entrevista",
    label: "Entrevista",
    shortLabel: "Entrev.",
    description: "Em processo de entrevista",
    color: "border-purple-500/30 bg-purple-500/5",
    badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
    stages: ["entrevista_agendada"],
  },
  {
    key: "documentacao",
    label: "Documentação",
    shortLabel: "Docs",
    description: "Aprovados aguardando ou validando documentação",
    color: "border-cyan-500/30 bg-cyan-500/5",
    badgeColor: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
    stages: ["aguardando_inicio", "documentacao_ok"],
  },
  {
    key: "cadastro",
    label: "Cadastro",
    shortLabel: "Cadastro",
    description: "Documentação OK — cadastrar colaborador (em treinamento)",
    color: "border-sky-500/30 bg-sky-500/5",
    badgeColor: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
    stages: ["cadastro"],
  },
  {
    key: "treinamento",
    label: "Treinamento",
    shortLabel: "Trein.",
    description: "Em treinamento prático (Dia 1 a Dia 7)",
    color: "border-amber-500/30 bg-amber-500/5",
    badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    stages: ["teste_pratico", ...TRAINING_DAY_STAGES],
  },
  {
    key: "encerrado",
    label: "Encerrado",
    shortLabel: "Fim",
    description: "Contratado, reprovado, desistiu ou talento futuro",
    color: "border-emerald-500/30 bg-emerald-500/5",
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    stages: ["contratado", "reprovado", "desistiu", "talento_futuro"],
  },
];

const STAGE_TO_PHASE = new Map<StageValue, PhaseKey>();
PHASES.forEach((p) => p.stages.forEach((s) => STAGE_TO_PHASE.set(s, p.key)));

export function getPhaseForStage(stage: StageValue): PhaseMeta | null {
  const key = STAGE_TO_PHASE.get(stage);
  return key ? PHASES.find((p) => p.key === key)! : null;
}

/** Sub-status legível para mostrar no card (curto) */
export function subStatusLabel(stage: StageValue): string {
  const day = trainingDayFromStage(stage);
  if (day) return `Dia ${day}/7`;
  const meta = STAGES.find((x) => x.value === stage);
  if (!meta) return stage;
  // Encurtar labels muito longos pro card
  const map: Partial<Record<StageValue, string>> = {
    aguardando_inicio: "Aguardando docs",
    documentacao_ok: "Docs OK",
    cadastro: "Cadastro",
    teste_pratico: "Agendar treino",
    entrevista_agendada: "Agendada",
  };
  return map[stage] ?? meta.label;
}

/** Progresso percentual da fase de treinamento (0-100) */
export function trainingProgress(stage: StageValue): number | null {
  const day = trainingDayFromStage(stage);
  if (!day) return stage === "teste_pratico" ? 0 : null;
  return Math.round((day / 7) * 100);
}
