import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Download, ChevronRight, Trash2, Star, PlayCircle, Sparkles, CheckCircle2, Send, MessageCircle, Mail, Eye, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  STAGES, LEGACY_STAGES, RECOMMENDATIONS,
  HR_INTERVIEW_QUESTIONS, CULTURE_FIT_QUESTIONS,
  REQUESTED_DOCUMENTS_CHECKLIST,
  questionsForPosition, GREEN_FLAGS, RED_FLAGS,
  trainingDayFromStage,
  type StageValue, type ScriptQuestion,
} from "@/lib/recruitment";
import { cancelLinkedTraining, shouldRevertTraining, shouldStartTraining } from "@/lib/recruitmentTransitions";
import { PHASES, getPhaseForStage, trainingProgress } from "@/lib/recruitmentPhases";
import { GuidedInterviewDialog } from "./GuidedInterviewDialog";
import { CandidateTrainingPanel } from "./CandidateTrainingPanel";
import type { Candidate } from "./CandidatePipeline";

interface Props {
  candidateId: string;
  jobPosition: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}

interface Evaluation {
  id: string;
  stage: string;
  overall_score: number | null;
  technical_score: number | null;
  behavior_score: number | null;
  culture_fit_score: number | null;
  strengths: string | null;
  concerns: string | null;
  recommendation: string | null;
  created_at: string;
}

interface HistoryRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  notes: string | null;
  changed_at: string;
}

export function CandidateDetailDialog({ candidateId, jobPosition, open, onOpenChange, onChanged }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [guidedOpen, setGuidedOpen] = useState<null | "hr" | "culture">(null);
  const [screening, setScreening] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [trainingDay, setTrainingDay] = useState<number | null>(null);

  const runAiScreening = async () => {
    setScreening(true);
    const { data, error } = await supabase.functions.invoke("screen-candidate", {
      body: { candidate_id: candidateId },
    });
    setScreening(false);
    if (error || (data as any)?.error) {
      toast({ title: "Erro na triagem", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Triagem concluída", description: `Score: ${(data as any)?.score}/100` });
    load();
  };

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: h }, { data: e }] = await Promise.all([
      supabase.from("job_candidates").select("*").eq("id", candidateId).maybeSingle(),
      supabase.from("candidate_stage_history").select("*").eq("candidate_id", candidateId).order("changed_at", { ascending: false }),
      supabase.from("candidate_evaluations").select("*").eq("candidate_id", candidateId).order("created_at", { ascending: false }),
    ]);
    setCandidate(c as Candidate | null);
    setHistory((h ?? []) as HistoryRow[]);
    setEvaluations((e ?? []) as Evaluation[]);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, candidateId]);

  const moveTo = async (to: StageValue) => {
    if (!candidate) return;
    if (shouldStartTraining(candidate.current_stage, to)) {
      // Persiste o estágio "cadastro" antes de navegar, para o kanban refletir.
      await supabase.from("job_candidates").update({ current_stage: to }).eq("id", candidate.id);
      await supabase.from("candidate_stage_history").insert({
        candidate_id: candidate.id,
        from_stage: candidate.current_stage,
        to_stage: to,
        changed_by: user?.id,
      });
      onChanged?.();
      onOpenChange(false);
      navigate(`/colaboradores/novo?fromCandidate=${candidate.id}`);
      return;
    }
    // Aviso ao contratar sem exame admissional anexado
    if (to === "contratado" && (candidate as any).created_employee_id) {
      const { data: sch } = await supabase
        .from("training_schedules")
        .select("admission_exam_document_id")
        .eq("employee_id", (candidate as any).created_employee_id)
        .maybeSingle();
      if (!sch?.admission_exam_document_id) {
        const ok = confirm(
          "Atenção: o exame admissional ainda não foi anexado.\n\nDeseja contratar mesmo assim? A pendência ficará registrada.",
        );
        if (!ok) return;
        toast({
          title: "Contratação com pendência",
          description: "Exame admissional ainda não foi anexado.",
          variant: "destructive",
        });
      }
    }
    const { error } = await supabase.from("job_candidates").update({ current_stage: to }).eq("id", candidate.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await supabase.from("candidate_stage_history").insert({
      candidate_id: candidate.id,
      from_stage: candidate.current_stage,
      to_stage: to,
      changed_by: user?.id,
    });
    // Ao contratar: transfere documentos da pasta do candidato para a pasta do colaborador
    if (to === "contratado" && (candidate as any).created_employee_id) {
      try {
        const { data: tr, error: trErr } = await supabase.functions.invoke(
          "transfer-candidate-documents",
          { body: { candidate_id: candidate.id, employee_id: (candidate as any).created_employee_id } },
        );
        if (trErr) throw trErr;
        const copied = (tr as any)?.copied ?? 0;
        const skipped = (tr as any)?.skipped ?? 0;
        if (copied > 0 || skipped > 0) {
          toast({
            title: "Documentos transferidos",
            description: `${copied} novo(s) anexado(s) à pasta do colaborador${skipped ? `, ${skipped} já existiam` : ""}.`,
          });
        }
      } catch (e: any) {
        toast({
          title: "Aviso",
          description: `Não foi possível transferir os documentos automaticamente: ${e.message ?? e}`,
          variant: "destructive",
        });
      }
      // Efetiva o colaborador: training -> active
      try {
        const { error: actErr } = await supabase
          .from("employees")
          .update({ status: "active" })
          .eq("id", (candidate as any).created_employee_id)
          .eq("status", "training");
        if (actErr) throw actErr;
        toast({ title: "Colaborador efetivado", description: "Status alterado para Ativo." });
      } catch (e: any) {
        toast({
          title: "Aviso",
          description: `Não foi possível efetivar o colaborador automaticamente: ${e.message ?? e}`,
          variant: "destructive",
        });
      }
    }
    if (shouldRevertTraining(candidate.current_stage, to)) {
      const reverted = await cancelLinkedTraining(candidate.id);
      if (reverted) {
        toast({
          title: "Treinamento cancelado",
          description: "O colaborador vinculado foi marcado como inativo.",
        });
      }
    }
    toast({ title: `Movido para ${STAGES.find((s) => s.value === to)?.label}` });
    load();
    onChanged();
  };

  const downloadResume = async () => {
    if (!candidate?.resume_path) return;
    const { data, error } = await supabase.storage.from("recruitment-cvs").createSignedUrl(candidate.resume_path, 60);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async () => {
    if (!candidate) return;
    if (!confirm("Excluir este candidato?")) return;
    const { error } = await supabase.from("job_candidates").delete().eq("id", candidate.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Candidato excluído" });
    onOpenChange(false);
    onChanged();
  };

  if (!open) return null;

  // Helpers para sidebar
  const phaseMeta = candidate ? getPhaseForStage(candidate.current_stage as StageValue) : null;
  const stageMeta = candidate ? STAGES.find((s) => s.value === candidate.current_stage) : null;
  const trainProg = candidate ? trainingProgress(candidate.current_stage as StageValue) : null;
  const daysSinceLastMove = (() => {
    if (!history.length) return null;
    const last = new Date(history[0].changed_at).getTime();
    return Math.floor((Date.now() - last) / 86400000);
  })();
  const initials = candidate?.full_name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") ?? "?";
  const waNumber = candidate?.phone?.replace(/\D/g, "") ?? "";
  const waLink = waNumber ? `https://wa.me/55${waNumber.replace(/^55/, "")}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col">
        {loading || !candidate ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Header compacto */}
            <DialogHeader className="px-5 py-3 border-b shrink-0 space-y-0">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg truncate">{candidate.full_name}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2 flex-wrap mt-1 text-xs">
                    <Badge variant="outline" className={stageMeta?.color}>{stageMeta?.label}</Badge>
                    {phaseMeta && <Badge variant="outline" className={phaseMeta.badgeColor}>{phaseMeta.label}</Badge>}
                    <span className="text-muted-foreground">· {jobPosition}</span>
                    {candidate.applied_at && (
                      <span className="text-muted-foreground">
                        · inscrito {new Date(candidate.applied_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {daysSinceLastMove !== null && daysSinceLastMove > 5 && (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        Parado há {daysSinceLastMove}d
                      </Badge>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden">
              {/* SIDEBAR ESQUERDA */}
              <aside className="border-r bg-muted/20 overflow-y-auto p-4 space-y-4 text-sm">
                {/* Atalhos de contato */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contato</Label>
                  <div className="space-y-1.5">
                    {candidate.phone && (
                      <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 text-xs hover:text-primary truncate">
                        <span className="text-muted-foreground">📞</span> {candidate.phone}
                      </a>
                    )}
                    {candidate.email && (
                      <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 text-xs hover:text-primary truncate">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{candidate.email}</span>
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {waLink && (
                      <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button size="sm" variant="outline" className="h-8 w-full gap-1 text-xs">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </a>
                    )}
                    {candidate.email && (
                      <a href={`mailto:${candidate.email}`} className="flex-1">
                        <Button size="sm" variant="outline" className="h-8 w-full gap-1 text-xs">
                          <Mail className="h-3.5 w-3.5" /> E-mail
                        </Button>
                      </a>
                    )}
                  </div>
                </div>

                {/* Triagem IA resumida */}
                {candidate.ai_score != null && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1 text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" /> Triagem IA
                      </span>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                        {candidate.ai_score}/100
                      </Badge>
                    </div>
                    {candidate.ai_recommendation && (
                      <p className="text-xs font-medium">
                        {candidate.ai_recommendation === "forte_recomendado" ? "Forte recomendação" :
                         candidate.ai_recommendation === "recomendado" ? "Recomendado" :
                         candidate.ai_recommendation === "neutro" ? "Neutro" :
                         candidate.ai_recommendation === "nao_recomendado" ? "Não recomendado" : candidate.ai_recommendation}
                      </p>
                    )}
                  </div>
                )}

                {/* Progresso treinamento */}
                {trainProg !== null && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Treinamento</span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">{trainProg}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${trainProg}%` }} />
                    </div>
                  </div>
                )}

                {/* Fase atual + progresso linear */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fase atual</Label>
                  <div className="space-y-1">
                    {PHASES.map((p) => {
                      const isCurrent = phaseMeta?.key === p.key;
                      const currentIdx = phaseMeta ? PHASES.findIndex((x) => x.key === phaseMeta.key) : -1;
                      const myIdx = PHASES.findIndex((x) => x.key === p.key);
                      const isPast = currentIdx >= 0 && myIdx < currentIdx;
                      return (
                        <div
                          key={p.key}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                            isCurrent
                              ? `border ${p.color} font-medium`
                              : isPast
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isCurrent ? "bg-primary text-primary-foreground" :
                            isPast ? "bg-emerald-500 text-white" : "bg-muted"
                          }`}>
                            {isPast ? "✓" : myIdx + 1}
                          </span>
                          <span className="truncate">{p.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ações */}
                <div className="pt-2 border-t space-y-1.5">
                  {candidate.resume_path && (
                    <Button variant="outline" size="sm" onClick={downloadResume} className="w-full h-8 gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" /> Currículo
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={remove} className="w-full h-8 gap-1.5 text-xs text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir candidato
                  </Button>
                </div>
              </aside>

              {/* CONTEÚDO PRINCIPAL */}
              <div className="overflow-y-auto p-4 md:p-5">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                  <TabsList className="flex-wrap h-auto w-full justify-start">
                    <TabsTrigger value="info">Dados</TabsTrigger>
                    <TabsTrigger value="hr">Entrevista RH</TabsTrigger>
                    <TabsTrigger value="documents">Documentação</TabsTrigger>
                    <TabsTrigger value="folder">Pasta do candidato</TabsTrigger>
                    <TabsTrigger value="evaluation">Avaliação</TabsTrigger>
                    <TabsTrigger value="training">Treinamento</TabsTrigger>
                    <TabsTrigger value="history">Histórico</TabsTrigger>
                  </TabsList>

            {/* DADOS */}
            <TabsContent value="info" className="space-y-4">
              {/* Triagem por IA — ações (resumo está no sidebar) */}
              {candidate.ai_score == null ? (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Triagem por IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">Este candidato ainda não passou pela triagem da IA. Use os dados do cadastro + descrição da vaga para gerar score, recomendação e pontos de atenção.</p>
                    <Button size="sm" onClick={runAiScreening} disabled={screening} className="gap-2">
                      {screening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Triar com IA
                    </Button>
                  </CardContent>
                </Card>
              ) : (candidate.ai_summary || candidate.ai_concerns) && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> Análise da IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {candidate.ai_summary && <p className="text-muted-foreground">{candidate.ai_summary}</p>}
                    {candidate.ai_concerns && (
                      <div>
                        <span className="font-medium">Pontos a investigar: </span>
                        <span className="text-muted-foreground">{candidate.ai_concerns}</span>
                      </div>
                    )}
                    <Button size="sm" variant="outline" onClick={runAiScreening} disabled={screening} className="gap-2 mt-2">
                      {screening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Triar novamente
                    </Button>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <InfoRow label="CPF" value={candidate.cpf} />
                <InfoRow label="Telefone" value={candidate.phone} />
                <InfoRow label="E-mail" value={candidate.email} />
                <InfoRow label="Cidade" value={candidate.city} />
                <InfoRow label="Origem" value={candidate.source} />
                <InfoRow label="Pretensão" value={candidate.expected_salary ? `R$ ${Number(candidate.expected_salary).toFixed(2)}` : null} />
                <InfoRow label="Disponibilidade" value={candidate.availability} />
                <InfoRow label="Experiência no cargo" value={candidate.has_experience ? "Sim" : "Não"} />
              </div>
              {candidate.notes && (
                <div className="text-sm">
                  <Label>Observações</Label>
                  <p className="text-muted-foreground whitespace-pre-wrap">{candidate.notes}</p>
                </div>
              )}
              {candidate.resume_path && (
                <Button variant="outline" onClick={downloadResume} className="gap-2">
                  <Download className="h-4 w-4" /> Baixar currículo ({candidate.resume_name})
                </Button>
              )}
              <div className="border-t pt-4">
                <Label className="text-xs">Progresso do candidato</Label>
                {(() => {
                  const flow = STAGES.filter((s) => !LEGACY_STAGES.includes(s.value));
                  const currentIdx = flow.findIndex((s) => s.value === candidate.current_stage);
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-y-2">
                      {flow.map((s, idx) => {
                        const isCurrent = candidate.current_stage === s.value;
                        const isPast = currentIdx >= 0 && idx < currentIdx;
                        return (
                          <div key={s.value} className="flex items-center">
                            <button
                              type="button"
                              onClick={async () => {
                                if (isCurrent) {
                                  // Mesmo se já estiver no dia, abre a aba para avaliar
                                  if (s.value === "teste_pratico" || trainingDayFromStage(s.value as StageValue)) {
                                    const day = trainingDayFromStage(s.value as StageValue);
                                    if (day) setTrainingDay(day);
                                    setActiveTab("training");
                                  }
                                  return;
                                }
                                if (s.value === "teste_pratico") {
                                  setActiveTab("training");
                                  return;
                                }
                                const day = trainingDayFromStage(s.value as StageValue);
                                if (day) {
                                  await moveTo(s.value);
                                  setTrainingDay(day);
                                  setActiveTab("training");
                                  return;
                                }
                                moveTo(s.value);
                              }}
                              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                                isCurrent
                                  ? "bg-primary text-primary-foreground border-primary shadow-sm cursor-default"
                                  : isPast
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                  : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                isCurrent
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : isPast
                                  ? "bg-emerald-500 text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {isPast ? "✓" : idx + 1}
                              </span>
                              {s.label}
                            </button>
                            {idx < flow.length - 1 && (
                              <ChevronRight className={`h-4 w-4 mx-0.5 shrink-0 ${
                                isPast || isCurrent ? "text-primary/60" : "text-muted-foreground/40"
                              }`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                  <span className="text-base leading-none">👆</span>
                  <p className="text-xs font-medium text-primary">
                    Clique em qualquer etapa acima para mover o candidato.
                  </p>
                </div>
              </div>
            </TabsContent>



            {/* ENTREVISTA RH (consolidada: comportamental + técnica do cargo + fit cultural) */}
            <TabsContent value="hr" className="space-y-3">
              <GuidedLauncher onClick={() => setGuidedOpen("hr")} label="Iniciar entrevista RH guiada" />
              <ScriptList title="Roteiro: Entrevista RH" questions={HR_INTERVIEW_QUESTIONS} />
              {questionsForPosition(jobPosition).length > 0 && (
                <ScriptList title={`Perguntas técnicas — ${jobPosition}`} questions={questionsForPosition(jobPosition)} />
              )}

              {/* FIT CULTURAL — incorporado na entrevista de RH */}
              <div className="border-t pt-3 space-y-3">
                <GuidedLauncher onClick={() => setGuidedOpen("culture")} label="Iniciar avaliação de fit cultural guiada" />
                <ScriptList title="Fit cultural" questions={CULTURE_FIT_QUESTIONS} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader><CardTitle className="text-sm text-emerald-600 dark:text-emerald-400">✓ Sinais positivos</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
                        {GREEN_FLAGS.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm text-destructive">⚠ Sinais de alerta</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
                        {RED_FLAGS.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* DOCUMENTAÇÃO — após entrevista de RH */}
            <TabsContent value="documents" className="space-y-3">
              <DocumentsRequestPanel candidate={candidate} onSaved={load} onAdvance={() => moveTo("cadastro")} />
            </TabsContent>

            {/* PASTA DO CANDIDATO — todos os arquivos enviados */}
            <TabsContent value="folder" className="space-y-3">
              <CandidateFolderPanel candidateId={candidate.id} candidateName={candidate.full_name} />
            </TabsContent>

            {/* AVALIAÇÃO */}
            <TabsContent value="evaluation" className="space-y-4">
              <EvaluationForm candidateId={candidate.id} stage={candidate.current_stage} onSaved={load} />
              {evaluations.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Avaliações anteriores</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {evaluations.map((ev) => (
                      <div key={ev.id} className="border rounded-md p-3 space-y-1 text-sm">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline">{STAGES.find((s) => s.value === ev.stage)?.label ?? ev.stage}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <ScoreCell label="Geral" value={ev.overall_score} />
                          <ScoreCell label="Técnica" value={ev.technical_score} />
                          <ScoreCell label="Comportamento" value={ev.behavior_score} />
                          <ScoreCell label="Fit cultural" value={ev.culture_fit_score} />
                        </div>
                        {ev.strengths && <p><strong>Pontos fortes:</strong> {ev.strengths}</p>}
                        {ev.concerns && <p><strong>Pontos de atenção:</strong> {ev.concerns}</p>}
                        {ev.recommendation && (
                          <p className={RECOMMENDATIONS.find((r) => r.value === ev.recommendation)?.color}>
                            <strong>Recomendação:</strong> {RECOMMENDATIONS.find((r) => r.value === ev.recommendation)?.label}
                          </p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* TREINAMENTO — colaborador vinculado */}
            <TabsContent value="training" className="space-y-3">
              <CandidateTrainingPanel
                candidateId={candidate.id}
                createdEmployeeId={(candidate as any).created_employee_id ?? null}
                evaluateDay={trainingDay}
                onEvaluateDayConsumed={() => setTrainingDay(null)}
              />
            </TabsContent>

            {/* HISTÓRICO */}
            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle className="text-sm">Movimentações</CardTitle></CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem movimentações ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h) => (
                        <li key={h.id} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{new Date(h.changed_at).toLocaleString("pt-BR")}</span>
                          <Badge variant="outline">{STAGES.find((s) => s.value === h.from_stage)?.label ?? "início"}</Badge>
                          <ChevronRight className="h-3 w-3" />
                          <Badge variant="outline">{STAGES.find((s) => s.value === h.to_stage)?.label ?? h.to_stage}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </>
        )}
      </DialogContent>
      {candidate && guidedOpen && (
        <GuidedInterviewDialog
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          jobPosition={jobPosition}
          stage={candidate.current_stage as StageValue}
          scriptKind={guidedOpen}
          open={!!guidedOpen}
          onOpenChange={(o) => !o && setGuidedOpen(null)}
          onSaved={load}
        />
      )}
    </Dialog>
  );
}

export function GuidedLauncher({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="rounded-md border bg-primary/5 p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm">
        <p className="font-medium">Modo guiado</p>
        <p className="text-xs text-muted-foreground">Passo a passo, com nota e sinais por pergunta. Salva tudo na avaliação.</p>
      </div>
      <Button size="sm" onClick={onClick} className="gap-2">
        <PlayCircle className="h-4 w-4" /> {label}
      </Button>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p>{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export function ScoreCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between border rounded px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold flex items-center gap-1">
        {value ?? "—"}{value !== null && <Star className="h-3 w-3 fill-current" />}
      </span>
    </div>
  );
}

export function ScriptList({ title, questions }: { title: string; questions: ScriptQuestion[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="border rounded-md p-3 space-y-1 text-sm">
            <p className="font-medium">{i + 1}. {q.question}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Esperar: {q.expect}</p>
            {q.redFlag && <p className="text-xs text-destructive">⚠ Alerta: {q.redFlag}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EvaluationForm({ candidateId, stage, onSaved }: { candidateId: string; stage: StageValue; onSaved: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    overall: "", technical: "", behavior: "", culture: "",
    strengths: "", concerns: "", recommendation: "",
  });

  const submit = async () => {
    if (!form.overall) {
      toast({ title: "Informe pelo menos a nota geral", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("candidate_evaluations").insert({
      candidate_id: candidateId,
      stage,
      overall_score: form.overall ? Number(form.overall) : null,
      technical_score: form.technical ? Number(form.technical) : null,
      behavior_score: form.behavior ? Number(form.behavior) : null,
      culture_fit_score: form.culture ? Number(form.culture) : null,
      strengths: form.strengths || null,
      concerns: form.concerns || null,
      recommendation: form.recommendation || null,
      evaluated_by: user?.id,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Avaliação registrada" });
    setForm({ overall: "", technical: "", behavior: "", culture: "", strengths: "", concerns: "", recommendation: "" });
    onSaved();
  };

  const ScoreInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova avaliação ({STAGES.find((s) => s.value === stage)?.label})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ScoreInput label="Nota geral *" value={form.overall} onChange={(v) => setForm({ ...form, overall: v })} />
          <ScoreInput label="Técnica" value={form.technical} onChange={(v) => setForm({ ...form, technical: v })} />
          <ScoreInput label="Comportamento" value={form.behavior} onChange={(v) => setForm({ ...form, behavior: v })} />
          <ScoreInput label="Fit cultural" value={form.culture} onChange={(v) => setForm({ ...form, culture: v })} />
        </div>
        <div className="space-y-2">
          <Label>Pontos fortes</Label>
          <Textarea rows={2} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Pontos de atenção</Label>
          <Textarea rows={2} value={form.concerns} onChange={(e) => setForm({ ...form, concerns: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Recomendação</Label>
          <Select value={form.recommendation} onValueChange={(v) => setForm({ ...form, recommendation: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {RECOMMENDATIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Registrar avaliação
        </Button>
      </CardContent>
    </Card>
  );
}

interface DocItem { label: string; requested: boolean; ok?: boolean }

interface UploadedDoc {
  id: string;
  doc_type: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

const DEFAULT_UNREQUESTED = new Set<string>(["Comprovante de escolaridade"]);

function useCandidateUploads(candidateId: string) {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidate_document_uploads")
      .select("id, doc_type, file_name, file_path, mime_type, size_bytes, uploaded_at")
      .eq("candidate_id", candidateId)
      .order("uploaded_at", { ascending: false });
    if (!error) setDocs((data ?? []) as UploadedDoc[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [candidateId]);

  return { docs, loading, reload: load };
}

async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("candidate-documents")
    .createSignedUrl(filePath, 60 * 10);
  if (error || !data?.signedUrl) {
    toast({ title: "Erro ao abrir arquivo", description: error?.message, variant: "destructive" });
    return null;
  }
  return data.signedUrl;
}

function DocumentPreviewDialog({
  doc,
  onOpenChange,
}: {
  doc: UploadedDoc | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!doc) { setUrl(null); return; }
    setLoading(true);
    getSignedUrl(doc.file_path).then((u) => {
      if (active) { setUrl(u); setLoading(false); }
    });
    return () => { active = false; };
  }, [doc]);

  const isImage = doc?.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(doc?.file_name ?? "");
  const isPdf = doc?.mime_type === "application/pdf" || /\.pdf$/i.test(doc?.file_name ?? "");

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base truncate pr-8">{doc?.file_name}</DialogTitle>
          <DialogDescription className="text-xs">
            {doc?.doc_type}
            {doc?.size_bytes ? ` · ${(doc.size_bytes / 1024).toFixed(0)} KB` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/20 overflow-auto">
          {loading || !url ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : isImage ? (
            <div className="h-full flex items-center justify-center p-2">
              <img src={url} alt={doc?.file_name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : isPdf ? (
            <iframe src={url} title={doc?.file_name} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Pré-visualização não suportada para este tipo de arquivo.
              </p>
              <a href={url} download={doc?.file_name}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" /> Baixar arquivo
                </Button>
              </a>
            </div>
          )}
        </div>
        {url && (isImage || isPdf) && (
          <div className="px-4 py-2 border-t shrink-0 flex justify-end">
            <a href={url} download={doc?.file_name}>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" /> Baixar
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


export function DocumentsRequestPanel({ candidate, onSaved, onAdvance }: { candidate: Candidate; onSaved: () => void; onAdvance: () => void | Promise<void> }) {
  // Migra dados antigos (campo `received`) para o novo modelo (`requested` + `ok`).
  const initial: DocItem[] = Array.isArray(candidate.requested_documents) && candidate.requested_documents.length > 0
    ? (candidate.requested_documents as any[]).map((it) => ({
        label: it.label,
        requested: typeof it.requested === "boolean" ? it.requested
          : typeof it.received === "boolean" ? it.received
          : true,
        ok: typeof it.ok === "boolean" ? it.ok : false,
      }))
    : REQUESTED_DOCUMENTS_CHECKLIST.map((label) => ({ label, requested: !DEFAULT_UNREQUESTED.has(label), ok: false }));

  const [items, setItems] = useState<DocItem[]>(initial);
  const [notes, setNotes] = useState<string>(candidate.documents_requested_notes ?? "");
  const [customLabel, setCustomLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedDoc | null>(null);
  const [savingOk, setSavingOk] = useState(false);
  const { docs: uploads } = useCandidateUploads(candidate.id);

  // Mapeia label -> uploads (case-insensitive, ignora espaços extras)
  const norm = (s: string) => s.trim().toLowerCase();
  const uploadsByLabel = uploads.reduce<Record<string, UploadedDoc[]>>((acc, d) => {
    const k = norm(d.doc_type);
    (acc[k] ??= []).push(d);
    return acc;
  }, {});

  const total = items.length;
  const requestedItemsList = items.filter((i) => i.requested);
  const requestedCount = requestedItemsList.length;
  const okCount = requestedItemsList.filter((i) => i.ok).length;
  const allOk = requestedCount > 0 && okCount === requestedCount;
  const requestedAt = candidate.documents_requested_at;

  const persistItems = async (next: DocItem[]) => {
    setSavingOk(true);
    const { error } = await supabase
      .from("job_candidates")
      .update({ requested_documents: next as any })
      .eq("id", candidate.id);
    setSavingOk(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const toggle = (idx: number, checked: boolean) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, requested: checked, ok: checked ? it.ok : false } : it)));
  };

  const toggleOk = (idx: number) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ok: !it.ok } : it));
      persistItems(next);
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    const v = customLabel.trim();
    if (!v) return;
    setItems((prev) => [...prev, { label: v, requested: true, ok: false }]);
    setCustomLabel("");
  };

  const resetDefaults = () => {
    if (!confirm("Restaurar a lista padrão de documentos? As marcações atuais serão perdidas.")) return;
    setItems(REQUESTED_DOCUMENTS_CHECKLIST.map((label) => ({ label, requested: !DEFAULT_UNREQUESTED.has(label), ok: false })));
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      await persistItems(items);
      await onAdvance();
    } finally {
      setAdvancing(false);
    }
  };

  const sendRequest = async () => {
    const requestedItems = items.filter((i) => i.requested);
    if (requestedItems.length === 0) {
      toast({ title: "Selecione ao menos um documento para solicitar", variant: "destructive" });
      return;
    }
    if (!candidate.email) {
      toast({ title: "Candidato sem e-mail cadastrado", description: "Cadastre o e-mail antes de enviar a solicitação.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      // Garante token de upload no candidato
      let token = (candidate as any).document_upload_token as string | undefined;
      if (!token) {
        const { data: tokRow, error: tokErr } = await supabase
          .from("job_candidates")
          .select("document_upload_token")
          .eq("id", candidate.id)
          .maybeSingle();
        if (tokErr) throw tokErr;
        token = tokRow?.document_upload_token as string | undefined;
      }
      if (!token) throw new Error("Não foi possível gerar o link de envio.");

      // Salva checklist + marca como solicitado
      const update: any = {
        requested_documents: items,
        documents_requested_notes: notes || null,
        documents_requested_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("job_candidates").update(update).eq("id", candidate.id);
      if (error) throw error;

      // Monta URL pública
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const uploadUrl = `${origin}/enviar-documentos/${token}`;

      // Busca título da vaga
      let jobTitle: string | undefined = undefined;
      try {
        const { data: jo } = await supabase
          .from("job_openings")
          .select("title")
          .eq("id", (candidate as any).job_opening_id)
          .maybeSingle();
        jobTitle = (jo?.title as string) ?? undefined;
      } catch { /* opcional */ }

      const { error: mailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "documents-request",
          recipientEmail: candidate.email,
          idempotencyKey: `docs-request-${candidate.id}-${Date.now()}`,
          templateData: {
            name: candidate.full_name,
            jobTitle,
            uploadUrl,
            documents: requestedItems.map((i) => i.label),
            notes: notes || undefined,
          },
        },
      });
      if (mailErr) {
        toast({
          title: "Lista salva, mas o e-mail falhou",
          description: mailErr.message ?? "Tente novamente em instantes.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Solicitação enviada!", description: `E-mail enviado a ${candidate.email} com ${requestedItems.length} documento(s).` });
      }
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Itens solicitados que ainda não vieram OK e não têm upload do candidato
  const pendingItems = items.filter((i) => {
    if (!i.requested || i.ok) return false;
    const sent = uploadsByLabel[norm(i.label)] ?? [];
    return sent.length === 0;
  });
  const pendingCount = pendingItems.length;

  const sendPending = async () => {
    if (pendingCount === 0) {
      toast({ title: "Nenhuma pendência para cobrar" });
      return;
    }
    if (!candidate.email) {
      toast({ title: "Candidato sem e-mail cadastrado", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data: tokRow } = await supabase
        .from("job_candidates")
        .select("document_upload_token")
        .eq("id", candidate.id)
        .maybeSingle();
      const token = tokRow?.document_upload_token as string | undefined;
      if (!token) throw new Error("Não foi possível obter o link de envio.");

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const uploadUrl = `${origin}/enviar-documentos/${token}`;

      let jobTitle: string | undefined;
      try {
        const { data: jo } = await supabase
          .from("job_openings")
          .select("title")
          .eq("id", (candidate as any).job_opening_id)
          .maybeSingle();
        jobTitle = (jo?.title as string) ?? undefined;
      } catch { /* opcional */ }

      const reminderNotes = `Ainda estamos aguardando o envio dos documentos abaixo para dar sequência ao seu processo. Por favor, acesse o link e faça o upload do que falta.${notes ? `\n\nObservações: ${notes}` : ""}`;

      const { error: mailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "documents-request",
          recipientEmail: candidate.email,
          idempotencyKey: `docs-pending-${candidate.id}-${Date.now()}`,
          templateData: {
            name: candidate.full_name,
            jobTitle,
            uploadUrl,
            documents: pendingItems.map((i) => i.label),
            notes: reminderNotes,
          },
        },
      });
      if (mailErr) {
        toast({ title: "Falha ao enviar cobrança", description: mailErr.message ?? "Tente novamente.", variant: "destructive" });
      } else {
        toast({ title: "Cobrança enviada!", description: `E-mail com ${pendingCount} pendência(s) enviado a ${candidate.email}.` });
      }
    } catch (e: any) {
      toast({ title: "Erro ao reenviar pendências", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Solicitação de documentação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Marque abaixo os documentos que vamos <strong>solicitar</strong> ao candidato e clique em
            <strong> Enviar solicitação</strong>. O candidato receberá um e-mail com um link exclusivo
            para enviar os documentos por uma página segura — sem precisar de login. Os arquivos ficam
            guardados na pasta do candidato e poderão ser reaproveitados no cadastro caso ele seja contratado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> A solicitar: {requestedCount}/{total}
            </Badge>
            <Badge variant={allOk ? "default" : "outline"} className="gap-1">
              <Check className="h-3 w-3" /> OK: {okCount}/{requestedCount}
            </Badge>
            {requestedAt && (
              <Badge variant="outline">
                Última solicitação em {new Date(requestedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Documentos a solicitar</CardTitle>
          <Button size="sm" variant="ghost" onClick={resetDefaults} className="text-xs">Restaurar padrão</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, idx) => {
            const sent = uploadsByLabel[norm(item.label)] ?? [];
            return (
              <div key={idx} className="flex items-center gap-3 border rounded-md px-3 py-2">
                <Checkbox
                  id={`doc-${idx}`}
                  checked={item.requested}
                  onCheckedChange={(c) => toggle(idx, !!c)}
                />
                <label
                  htmlFor={`doc-${idx}`}
                  className={`flex-1 text-sm cursor-pointer ${!item.requested ? "text-muted-foreground" : ""}`}
                >
                  {item.label}
                </label>
                {sent.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewDoc(sent[0])}
                    className="h-7 gap-1 text-xs"
                    title={sent.map((s) => s.file_name).join(", ")}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver{sent.length > 1 ? ` (${sent.length})` : ""}
                  </Button>
                )}
                {item.requested && (
                  <Button
                    size="sm"
                    variant={item.ok ? "default" : "outline"}
                    onClick={() => toggleOk(idx)}
                    disabled={savingOk}
                    className={`h-7 gap-1 text-xs ${item.ok ? "" : "text-muted-foreground"}`}
                    title={item.ok ? "Marcado como OK — clique para desmarcar" : "Marcar este documento como OK"}
                  >
                    <Check className="h-3.5 w-3.5" />
                    OK
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Adicionar outro documento..."
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            />
            <Button onClick={addItem} variant="outline" size="sm">Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label>Observações para o candidato (opcional)</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: traga os originais para conferência no dia da entrevista presencial..."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={sendRequest} disabled={sending || requestedCount === 0} variant="outline" className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {requestedAt ? "Reenviar e-mail" : "Enviar solicitação por e-mail"}
          </Button>
          {requestedAt && pendingCount > 0 && (
            <Button
              onClick={sendPending}
              disabled={sending}
              variant="secondary"
              className="gap-2"
              title="Reenvia o e-mail listando apenas o que ainda falta"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Cobrar pendências ({pendingCount})
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {requestedCount} documento(s) serão pedidos ao candidato.
          </span>
        </div>
        <Button
          onClick={handleAdvance}
          disabled={!allOk || advancing}
          className="gap-2"
          title={allOk ? "Marcar documentação como OK e avançar o candidato" : "Marque todos os documentos solicitados como OK para avançar"}
        >
          {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Documentação OK — Iniciar cadastro
        </Button>
      </div>

      <DocumentPreviewDialog doc={previewDoc} onOpenChange={(o) => { if (!o) setPreviewDoc(null); }} />
    </div>
  );
}

// ─── Pasta do candidato — lista todos uploads (preview/download) ─────────────
export function CandidateFolderPanel({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const { docs, loading } = useCandidateUploads(candidateId);
  const [previewDoc, setPreviewDoc] = useState<UploadedDoc | null>(null);

  // Agrupa por doc_type
  const groups = docs.reduce<Record<string, UploadedDoc[]>>((acc, d) => {
    (acc[d.doc_type] ??= []).push(d);
    return acc;
  }, {});

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  if (docs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          O candidato ainda não enviou nenhum documento. Use a aba <strong>Documentação</strong> para enviar a solicitação.
        </CardContent>
      </Card>
    );
  }

  const downloadOne = async (d: UploadedDoc) => {
    const url = await getSignedUrl(d.file_path);
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="space-y-3">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-3 text-sm">
          <strong>{docs.length}</strong> arquivo(s) enviados por <strong>{candidateName}</strong>.
          Estes arquivos ficam guardados aqui e são copiados automaticamente para a pasta do colaborador quando ele for contratado.
        </CardContent>
      </Card>

      {Object.entries(groups).map(([type, list]) => (
        <Card key={type}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> {type}</span>
              <Badge variant="outline">{list.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {list.map((d) => (
              <div key={d.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{d.file_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(d.uploaded_at).toLocaleString("pt-BR")}
                    {d.size_bytes ? ` · ${(d.size_bytes / 1024).toFixed(0)} KB` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPreviewDoc(d)} className="h-7 gap-1 text-xs">
                  <Eye className="h-3.5 w-3.5" /> Ver
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadOne(d)} className="h-7 w-7 p-0" title="Baixar">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <DocumentPreviewDialog doc={previewDoc} onOpenChange={(o) => { if (!o) setPreviewDoc(null); }} />
    </div>
  );
}


