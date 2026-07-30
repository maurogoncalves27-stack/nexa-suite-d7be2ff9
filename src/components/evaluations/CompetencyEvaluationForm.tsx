import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Wrench, AlertTriangle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  COMMENT_REQUIRED_SCORES,
  DEFAULT_SCALE,
  MEETS_EXPECTATION,
  competencyAverage,
  disciplineScore10,
  effectiveWeight,
  finalScore10,
  scaleColorClass,
  type CompetencyScoreInput,
  type PositionCompetency,
  type ScaleLevel,
} from "@/lib/competencyEvaluation";

interface Props {
  competencies: PositionCompetency[];
  scores: Record<string, CompetencyScoreInput>;
  onChange: (competencyId: string, patch: Partial<CompetencyScoreInput>) => void;
  scale?: ScaleLevel[];
  infractionPoints: number;
  readOnly?: boolean;
}

export default function CompetencyEvaluationForm({
  competencies, scores, onChange, scale = DEFAULT_SCALE, infractionPoints, readOnly = false,
}: Props) {
  const technical = useMemo(() => competencies.filter((c) => c.competency_type === "technical"), [competencies]);
  const behavioral = useMemo(() => competencies.filter((c) => c.competency_type === "behavioral"), [competencies]);

  const { avg, count } = competencyAverage(competencies, scores);
  const disc10 = disciplineScore10(infractionPoints);
  const final10 = finalScore10(avg, infractionPoints);

  const renderGroup = (title: string, icon: React.ReactNode, list: PositionCompetency[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
          {icon}{title} <span className="normal-case font-normal">({list.length})</span>
        </div>
        {list.map((c) => {
          const s = scores[c.id] ?? { score: null, not_applicable: false, comment: "" };
          const needsComment =
            !s.not_applicable && s.score != null && COMMENT_REQUIRED_SCORES.includes(s.score) && !s.comment.trim();
          return (
            <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                    {c.name}
                    {c.is_required && <Badge variant="secondary" className="text-[10px]">Obrigatória</Badge>}
                    <span className="text-[10px] text-muted-foreground">peso {effectiveWeight(c)}</span>
                  </div>
                  {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant={s.not_applicable ? "secondary" : "ghost"}
                    className="h-7 text-xs shrink-0"
                    onClick={() => onChange(c.id, { not_applicable: !s.not_applicable, score: null })}
                  >
                    Não se aplica
                  </Button>
                )}
              </div>

              {!s.not_applicable && (
                <TooltipProvider delayDuration={200}>
                  <div className="grid grid-cols-5 gap-1.5">
                    {scale.map((lvl) => {
                      const active = s.score === lvl.score;
                      const descriptor = c.level_descriptors?.[String(lvl.score)] || lvl.description;
                      return (
                        <Tooltip key={lvl.score}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => onChange(c.id, { score: lvl.score })}
                              className={`rounded-md border px-1 py-2 text-center transition-colors disabled:cursor-default ${
                                active ? scaleColorClass(lvl.score) + " ring-2 ring-offset-1 ring-primary/40" : "bg-background hover:bg-muted border-border"
                              }`}
                            >
                              <div className="text-sm font-bold leading-none">{lvl.score}</div>
                              <div className="text-[10px] leading-tight mt-1 text-muted-foreground line-clamp-2">{lvl.label}</div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{descriptor}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}

              {!s.not_applicable && (s.score != null || s.comment) && (
                <div className="space-y-1">
                  <Textarea
                    rows={2}
                    readOnly={readOnly}
                    placeholder={
                      COMMENT_REQUIRED_SCORES.includes(s.score ?? 0)
                        ? "Justificativa obrigatória para esta nota"
                        : "Comentário (opcional)"
                    }
                    value={s.comment}
                    onChange={(e) => onChange(c.id, { comment: e.target.value })}
                    className={needsComment ? "border-destructive" : ""}
                  />
                  {needsComment && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Justifique a nota {s.score}.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderGroup("Técnicas", <Wrench className="h-3.5 w-3.5" />, technical)}
      {renderGroup("Comportamentais", <Brain className="h-3.5 w-3.5" />, behavioral)}

      <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Disciplina (automático · {Math.round(100 * 0.2)}% da nota)</span>
          <span className="font-medium">{disc10.toFixed(1)} / 10</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Média das competências ({count} avaliadas)</span>
          <Badge variant="outline" className={scaleColorClass(avg == null ? null : Math.round(avg))}>
            {avg != null ? avg.toFixed(2) : "—"} / 5
          </Badge>
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <Label className="text-sm">Nota final</Label>
          <span className="text-lg font-bold">{final10 != null ? `${final10.toFixed(1)} / 10` : "—"}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Notas abaixo de {MEETS_EXPECTATION} viram gaps de desenvolvimento e travam a promoção no plano de carreira.
        </p>
      </div>
    </div>
  );
}
