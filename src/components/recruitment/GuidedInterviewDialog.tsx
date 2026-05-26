import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Loader2, Save, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  HR_INTERVIEW_QUESTIONS,
  CULTURE_FIT_QUESTIONS,
  questionsForPosition,
  type ScriptQuestion,
  type StageValue,
} from "@/lib/recruitment";

type ScriptKind = "hr" | "culture";

interface Props {
  candidateId: string;
  candidateName: string;
  jobPosition: string;
  stage: StageValue;
  scriptKind: ScriptKind;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

interface Answer {
  question: string;
  expect: string;
  redFlag?: string;
  response: string;
  score: number; // 0 = não avaliado; 1..5
  flag: "none" | "green" | "red";
}

const SCRIPT_LABEL: Record<ScriptKind, string> = {
  hr: "Entrevista RH",
  culture: "Fit cultural",
};

function buildQuestions(kind: ScriptKind, position: string): ScriptQuestion[] {
  if (kind === "culture") return CULTURE_FIT_QUESTIONS;
  // hr: comportamentais/RH + perguntas técnicas do cargo
  return [...HR_INTERVIEW_QUESTIONS, ...questionsForPosition(position)];
}

export function GuidedInterviewDialog({
  candidateId, candidateName, jobPosition, stage, scriptKind, open, onOpenChange, onSaved,
}: Props) {
  const { user } = useAuth();
  const baseQuestions = useMemo(() => buildQuestions(scriptKind, jobPosition), [scriptKind, jobPosition]);

  const [answers, setAnswers] = useState<Answer[]>(() =>
    baseQuestions.map((q) => ({
      question: q.question,
      expect: q.expect,
      redFlag: q.redFlag,
      response: "",
      score: 0,
      flag: "none",
    })),
  );
  const [idx, setIdx] = useState(0);
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"questions" | "summary">("questions");

  const total = answers.length;
  const current = answers[idx];
  const answeredCount = answers.filter((a) => a.score > 0 || a.response.trim().length > 0).length;
  const progress = total === 0 ? 0 : Math.round(((idx + 1) / total) * 100);

  const updateCurrent = (patch: Partial<Answer>) => {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (idx < total - 1) setIdx(idx + 1);
    else setStep("summary");
  };

  const computeScores = () => {
    const scored = answers.filter((a) => a.score > 0);
    const avg = scored.length > 0
      ? +(scored.reduce((s, a) => s + a.score, 0) / scored.length * 2).toFixed(2) // 1..5 → 2..10
      : null;
    return {
      overall: avg,
      // Mapeamos para o eixo do roteiro: HR cobre comportamental + técnico do cargo
      technical: scriptKind === "hr" ? avg : null,
      behavior: scriptKind === "hr" ? avg : null,
      culture: scriptKind === "culture" ? avg : null,
    };
  };

  const submit = async () => {
    setSaving(true);
    const { overall, technical, behavior, culture } = computeScores();
    const greenCount = answers.filter((a) => a.flag === "green").length;
    const redCount = answers.filter((a) => a.flag === "red").length;

    const { error } = await supabase.from("candidate_evaluations").insert({
      candidate_id: candidateId,
      stage,
      overall_score: overall,
      technical_score: technical,
      behavior_score: behavior,
      culture_fit_score: culture,
      strengths: strengths || (greenCount > 0 ? `${greenCount} sinal(is) positivo(s) marcado(s).` : null),
      concerns: concerns || (redCount > 0 ? `${redCount} sinal(is) de alerta marcado(s).` : null),
      answers: {
        script: scriptKind,
        position: jobPosition,
        items: answers,
      } as never,
      evaluated_by: user?.id,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entrevista registrada", description: "Respostas e notas foram salvas na avaliação." });
    onSaved();
    onOpenChange(false);
  };

  const close = () => {
    if (answeredCount > 0 && !confirm("Sair sem salvar? As respostas serão perdidas.")) return;
    onOpenChange(false);
    // reset for next open
    setIdx(0);
    setStep("questions");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Entrevista guiada
            <Badge variant="outline">{SCRIPT_LABEL[scriptKind]}</Badge>
          </DialogTitle>
          <DialogDescription>
            {candidateName} · Vaga: {jobPosition}
          </DialogDescription>
        </DialogHeader>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Não há perguntas cadastradas para este roteiro.
          </p>
        ) : step === "questions" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Pergunta {idx + 1} de {total}</span>
              <span>{answeredCount} respondida(s)</span>
            </div>
            <Progress value={progress} className="h-1.5" />

            <Card>
              <CardContent className="pt-5 space-y-4">
                <p className="font-medium text-sm leading-relaxed">{current.question}</p>

                <details className="text-xs rounded-md border bg-muted/40 px-3 py-2">
                  <summary className="cursor-pointer text-muted-foreground">Ver guia (o que esperar / sinais de alerta)</summary>
                  <div className="mt-2 space-y-1">
                    <p className="text-emerald-600 dark:text-emerald-400">✓ Esperar: {current.expect}</p>
                    {current.redFlag && (
                      <p className="text-destructive">⚠ Alerta: {current.redFlag}</p>
                    )}
                  </div>
                </details>

                <div className="space-y-1.5">
                  <Label className="text-xs">Resposta do candidato</Label>
                  <Textarea
                    value={current.response}
                    onChange={(e) => updateCurrent({ response: e.target.value })}
                    placeholder="Anote a resposta dada pelo candidato..."
                    rows={4}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Nota desta resposta</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={current.score === n ? "default" : "outline"}
                        onClick={() => updateCurrent({ score: current.score === n ? 0 : n })}
                        className="flex-1 gap-1"
                      >
                        {n} <Star className="h-3 w-3" />
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={current.flag === "green" ? "default" : "outline"}
                    onClick={() => updateCurrent({ flag: current.flag === "green" ? "none" : "green" })}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Sinal positivo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={current.flag === "red" ? "destructive" : "outline"}
                    onClick={() => updateCurrent({ flag: current.flag === "red" ? "none" : "red" })}
                    className="gap-1"
                  >
                    <AlertTriangle className="h-4 w-4" /> Sinal de alerta
                  </Button>
                </div>
              </CardContent>
            </Card>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={goPrev} disabled={idx === 0} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setStep("summary")}>Pular para resumo</Button>
              <Button onClick={goNext} className="gap-1">
                {idx < total - 1 ? (<>Próxima <ChevronRight className="h-4 w-4" /></>) : "Ir para resumo"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 space-y-3 text-sm">
                <p className="font-medium">Resumo da entrevista</p>
                {(() => {
                  const { overall } = computeScores();
                  const greenCount = answers.filter((a) => a.flag === "green").length;
                  const redCount = answers.filter((a) => a.flag === "red").length;
                  return (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="border rounded-md p-2">
                        <p className="text-xs text-muted-foreground">Nota média</p>
                        <p className="text-lg font-semibold">{overall ?? "—"}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-xs text-muted-foreground">Positivos</p>
                        <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{greenCount}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-xs text-muted-foreground">Alertas</p>
                        <p className="text-lg font-semibold text-destructive">{redCount}</p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <div className="space-y-1.5">
              <Label className="text-xs">Pontos fortes (opcional)</Label>
              <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} placeholder="Resumo dos destaques observados..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pontos de atenção (opcional)</Label>
              <Textarea value={concerns} onChange={(e) => setConcerns(e.target.value)} rows={3} placeholder="Pontos que precisam ser validados ou que pesam contra..." />
            </div>

            <details className="text-xs rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-muted-foreground">Revisar respostas ({answeredCount}/{total})</summary>
              <ul className="mt-2 space-y-2">
                {answers.map((a, i) => (
                  <li key={i} className="border-l-2 pl-2 border-muted">
                    <p className="font-medium">{i + 1}. {a.question}</p>
                    {a.response && <p className="text-muted-foreground whitespace-pre-wrap mt-0.5">{a.response}</p>}
                    <div className="flex gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {a.score > 0 && <span>Nota: {a.score}/5</span>}
                      {a.flag === "green" && <span className="text-emerald-600 dark:text-emerald-400">✓ positivo</span>}
                      {a.flag === "red" && <span className="text-destructive">⚠ alerta</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </details>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" onClick={() => setStep("questions")} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Voltar às perguntas
              </Button>
              <div className="flex-1" />
              <Button onClick={submit} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar entrevista
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
