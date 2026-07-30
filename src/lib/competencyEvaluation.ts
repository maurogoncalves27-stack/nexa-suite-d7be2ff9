// Avaliação por competência — escala de proficiência 1 a 5.
// A nota final continua sendo publicada em 0-10 (compatível com bônus e históricos).

export type CompetencyType = "technical" | "behavioral";

export interface PositionCompetency {
  id: string;
  position_id: string;
  name: string;
  description: string | null;
  competency_type: CompetencyType;
  is_required: boolean;
  weight: number;
  order_index: number;
  level_descriptors: Record<string, string> | null;
}

export interface CompetencyScoreInput {
  score: number | null;
  not_applicable: boolean;
  comment: string;
}

export interface ScaleLevel {
  id: string;
  score: number;
  label: string;
  description: string | null;
  color_token: string;
}

/** Fallback caso a tabela de escala ainda não tenha sido carregada. */
export const DEFAULT_SCALE: ScaleLevel[] = [
  { id: "1", score: 1, label: "Não atende", description: "Não demonstra a competência; entrega abaixo do exigido pelo cargo.", color_token: "destructive" },
  { id: "2", score: 2, label: "Em desenvolvimento", description: "Demonstra parcialmente; ainda precisa de suporte e acompanhamento.", color_token: "warning" },
  { id: "3", score: 3, label: "Atende", description: "Entrega o esperado para o cargo de forma consistente.", color_token: "primary" },
  { id: "4", score: 4, label: "Supera", description: "Entrega acima do esperado com autonomia.", color_token: "success" },
  { id: "5", score: 5, label: "Referência", description: "É referência na competência e desenvolve outros colaboradores.", color_token: "accent" },
];

/** Competência obrigatória pesa o dobro de uma opcional. */
export const REQUIRED_MULTIPLIER = 2;
/** Peso da Disciplina (infrações) dentro da nota final. */
export const DISCIPLINE_SHARE = 0.2;
/** Nota mínima considerada "atende o cargo". */
export const MEETS_EXPECTATION = 3;
/** Comentário obrigatório nestas notas. */
export const COMMENT_REQUIRED_SCORES = [1, 2, 5];

export const effectiveWeight = (c: PositionCompetency) =>
  Number(c.weight || 1) * (c.is_required ? REQUIRED_MULTIPLIER : 1);

/** Média ponderada 1-5, ignorando "não se aplica". */
export function competencyAverage(
  competencies: PositionCompetency[],
  scores: Record<string, CompetencyScoreInput>,
): { avg: number | null; count: number } {
  let sum = 0;
  let weight = 0;
  let count = 0;
  for (const c of competencies) {
    const s = scores[c.id];
    if (!s || s.not_applicable || s.score == null) continue;
    const w = effectiveWeight(c);
    sum += s.score * w;
    weight += w;
    count += 1;
  }
  if (weight === 0) return { avg: null, count: 0 };
  return { avg: Math.round((sum / weight) * 100) / 100, count };
}

/** Nota de disciplina em 0-10: 10 menos 1 ponto por ponto de infração no ciclo. */
export const disciplineScore10 = (infractionPoints: number) =>
  Math.max(0, 10 - infractionPoints);

/** Nota final 0-10 = média das competências (escala 1-5 → 0-10) + disciplina. */
export function finalScore10(avg1to5: number | null, infractionPoints: number): number | null {
  if (avg1to5 == null) return null;
  const base10 = ((avg1to5 - 1) / 4) * 10;
  const disc10 = disciplineScore10(infractionPoints);
  return Math.round((base10 * (1 - DISCIPLINE_SHARE) + disc10 * DISCIPLINE_SHARE) * 100) / 100;
}

export const scaleColorClass = (score: number | null | undefined) => {
  switch (score) {
    case 1: return "bg-destructive/10 text-destructive border-destructive/30";
    case 2: return "bg-warning/10 text-warning border-warning/30";
    case 3: return "bg-primary/10 text-primary border-primary/30";
    case 4: return "bg-success/10 text-success border-success/30";
    case 5: return "bg-accent/20 text-accent-foreground border-accent/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export const scaleLabel = (score: number | null | undefined, scale: ScaleLevel[] = DEFAULT_SCALE) =>
  scale.find((l) => l.score === score)?.label ?? "—";

/** Competências obrigatórias com nota abaixo do mínimo. */
export function requiredGaps(
  competencies: PositionCompetency[],
  scores: Record<string, CompetencyScoreInput>,
  min = MEETS_EXPECTATION,
): PositionCompetency[] {
  return competencies.filter((c) => {
    if (!c.is_required) return false;
    const s = scores[c.id];
    if (!s || s.not_applicable || s.score == null) return false;
    return s.score < min;
  });
}
