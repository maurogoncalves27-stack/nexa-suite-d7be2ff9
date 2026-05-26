import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  
  Sparkles,
  Mail,
  MessageCircle,
  Download,
  Trash2,
  PlayCircle,
  CheckCircle2,
  XCircle,
  History,
  ChevronRight,
  Phone,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  STAGES,
  HR_INTERVIEW_QUESTIONS,
  CULTURE_FIT_QUESTIONS,
  questionsForPosition,
  GREEN_FLAGS,
  RED_FLAGS,
  trainingDayFromStage,
  type StageValue,
} from "@/lib/recruitment";
import { PHASES, getPhaseForStage, type PhaseKey, trainingProgress } from "@/lib/recruitmentPhases";
import {
  cancelLinkedTraining,
  shouldRevertTraining,
  shouldStartTraining,
} from "@/lib/recruitmentTransitions";
import {
  DocumentsRequestPanel,
  EvaluationForm,
  ScriptList,
  GuidedLauncher,
  InfoRow,
} from "./CandidateDetailDialog";
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

interface HistoryRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  notes: string | null;
  changed_at: string;
}

/** Stage destino padrão para entrar em uma fase a partir de outra */
const PHASE_ENTRY_STAGE: Record<PhaseKey, StageValue> = {
  inscritos: "novos",
  entrevista: "entrevista_agendada",
  documentacao: "aguardando_inicio",
  cadastro: "cadastro",
  treinamento: "teste_pratico",
  encerrado: "contratado",
};

export function CandidateFlowDialog({
  candidateId,
  jobPosition,
  open,
  onOpenChange,
  onChanged,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState<null | "hr" | "culture">(null);
  const [showHistory, setShowHistory] = useState(false);
  /** Se o usuário clicou no stepper para visualizar uma fase diferente da atual. */
  const [viewingPhase, setViewingPhase] = useState<PhaseKey | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: h }] = await Promise.all([
      supabase.from("job_candidates").select("*").eq("id", candidateId).maybeSingle(),
      supabase
        .from("candidate_stage_history")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("changed_at", { ascending: false }),
    ]);
    setCandidate(c as Candidate | null);
    setHistory((h ?? []) as HistoryRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setViewingPhase(null);
      setShowHistory(false);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidateId]);

  const currentPhase = candidate
    ? getPhaseForStage(candidate.current_stage as StageValue)
    : null;
  const phaseToShow: PhaseKey =
    viewingPhase ?? (currentPhase?.key ?? "inscritos");
  const isViewingDifferent = viewingPhase !== null && viewingPhase !== currentPhase?.key;

  const moveTo = async (to: StageValue, opts?: { silent?: boolean }) => {
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
      onChanged();
      onOpenChange(false);
      navigate(`/colaboradores/novo?fromCandidate=${candidate.id}`);
      return;
    }
    setBusy(true);
    try {
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
          if (!ok) {
            setBusy(false);
            return;
          }
        }
      }

      const { error } = await supabase
        .from("job_candidates")
        .update({ current_stage: to })
        .eq("id", candidate.id);
      if (error) throw error;

      await supabase.from("candidate_stage_history").insert({
        candidate_id: candidate.id,
        from_stage: candidate.current_stage,
        to_stage: to,
        changed_by: user?.id,
      });

      // Contratado → transfere docs + efetiva colaborador
      if (to === "contratado" && (candidate as any).created_employee_id) {
        try {
          await supabase.functions.invoke("transfer-candidate-documents", {
            body: {
              candidate_id: candidate.id,
              employee_id: (candidate as any).created_employee_id,
            },
          });
        } catch (e: any) {
          toast({
            title: "Aviso",
            description: `Não foi possível transferir documentos: ${e.message ?? e}`,
            variant: "destructive",
          });
        }
        try {
          await supabase
            .from("employees")
            .update({ status: "active" })
            .eq("id", (candidate as any).created_employee_id)
            .eq("status", "training");
        } catch {
          /* opcional */
        }
      }
      if (shouldRevertTraining(candidate.current_stage, to)) {
        await cancelLinkedTraining(candidate.id);
      }

      if (!opts?.silent) {
        toast({
          title: `Movido para ${STAGES.find((s) => s.value === to)?.label ?? to}`,
        });
      }
      setViewingPhase(null);
      await load();
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!candidate) return;
    if (!confirm("Excluir este candidato?")) return;
    const { error } = await supabase.from("job_candidates").delete().eq("id", candidate.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Candidato excluído" });
    onOpenChange(false);
    onChanged();
  };

  const downloadResume = async () => {
    if (!candidate?.resume_path) return;
    const { data, error } = await supabase.storage
      .from("recruitment-cvs")
      .createSignedUrl(candidate.resume_path, 60);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (!open) return null;

  const initials =
    candidate?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") ?? "?";
  const waNumber = candidate?.phone?.replace(/\D/g, "") ?? "";
  const waLink = waNumber ? `https://wa.me/55${waNumber.replace(/^55/, "")}` : null;
  const stageMeta = candidate ? STAGES.find((s) => s.value === candidate.current_stage) : null;
  const trainProg = candidate
    ? trainingProgress(candidate.current_stage as StageValue)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[94vh] p-0 gap-0 flex flex-col overflow-hidden">
        {loading || !candidate ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* HEADER fixo */}
            <header className="px-4 sm:px-5 py-3 border-b shrink-0 flex items-start gap-3">
              <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-semibold truncate">
                    {candidate.full_name}
                  </h2>
                  {currentPhase && (
                    <Badge variant="outline" className={currentPhase.badgeColor}>
                      {currentPhase.label}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5 text-xs text-muted-foreground">
                  <span className="truncate">{jobPosition}</span>
                  {stageMeta && (
                    <>
                      <span>·</span>
                      <span className="truncate">{stageMeta.label}</span>
                    </>
                  )}
                  {candidate.applied_at && (
                    <>
                      <span>·</span>
                      <span>
                        inscrito {new Date(candidate.applied_at).toLocaleDateString("pt-BR")}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Atalhos rápidos no header */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                {candidate.phone && (
                  <a href={`tel:${candidate.phone}`} title={candidate.phone}>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Phone className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                {candidate.email && (
                  <a href={`mailto:${candidate.email}`} title={candidate.email}>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Mail className="h-4 w-4" />
                    </Button>
                  </a>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 mr-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-xs">Ações</DropdownMenuLabel>
                  {candidate.resume_path && (
                    <DropdownMenuItem onClick={downloadResume}>
                      <Download className="h-3.5 w-3.5 mr-2" /> Baixar currículo
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowHistory((v) => !v)}>
                    <History className="h-3.5 w-3.5 mr-2" />
                    {showHistory ? "Ocultar histórico" : "Ver histórico"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Mover para…</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => moveTo("reprovado")} disabled={busy}>
                    <XCircle className="h-3.5 w-3.5 mr-2 text-destructive" /> Reprovar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => moveTo("desistiu")} disabled={busy}>
                    Marcar como desistente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => moveTo("talento_futuro")} disabled={busy}>
                    Talento futuro
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={remove}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir candidato
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            </header>

            {/* STEPPER */}
            <div className="px-4 sm:px-5 py-3 border-b bg-muted/20 shrink-0">
              <Stepper
                currentPhase={currentPhase?.key ?? "inscritos"}
                viewingPhase={phaseToShow}
                onJump={(p) => {
                  // Permite só visualizar — só MOVE se confirmar via ação principal da fase
                  setViewingPhase(p === currentPhase?.key ? null : p);
                }}
              />
              {trainProg !== null && currentPhase?.key === "treinamento" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Treinamento</span>
                  <div className="flex-1 h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${trainProg}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {trainProg}%
                  </span>
                </div>
              )}
            </div>

            {/* CONTEÚDO da fase */}
            <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              {isViewingDifferent && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <span>
                    Visualizando fase <strong>{PHASES.find((p) => p.key === phaseToShow)?.label}</strong> — o
                    candidato está em <strong>{currentPhase?.label}</strong>.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setViewingPhase(null)}
                  >
                    Voltar à fase atual
                  </Button>
                </div>
              )}

              {phaseToShow === "inscritos" && (
                <PhaseInscritos candidate={candidate} onChanged={load} />
              )}
              {phaseToShow === "entrevista" && (
                <PhaseEntrevista
                  candidate={candidate}
                  jobPosition={jobPosition}
                  onLaunchGuided={(k) => setGuidedOpen(k)}
                  onChanged={load}
                />
              )}
              {phaseToShow === "documentacao" && (
                <PhaseDocumentacao
                  candidate={candidate}
                  onSaved={load}
                  onAdvance={() => moveTo("cadastro")}
                />
              )}
              {phaseToShow === "treinamento" && (
                <PhaseTreinamento candidate={candidate} />
              )}
              {phaseToShow === "encerrado" && (
                <PhaseEncerrado candidate={candidate} stageMeta={stageMeta} />
              )}

              {showHistory && <HistoryPanel history={history} />}
            </main>

            {/* FOOTER de ação */}
            <footer className="px-4 sm:px-5 py-3 border-t bg-card shrink-0 flex flex-wrap items-center gap-2">
              <PhaseActions
                phase={phaseToShow}
                isViewingDifferent={isViewingDifferent}
                candidate={candidate}
                busy={busy}
                onMove={moveTo}
                onResetView={() => setViewingPhase(null)}
              />
            </footer>
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

/* ============================================================
   STEPPER
   ============================================================ */

function Stepper({
  currentPhase,
  viewingPhase,
  onJump,
}: {
  currentPhase: PhaseKey;
  viewingPhase: PhaseKey;
  onJump: (p: PhaseKey) => void;
}) {
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);
  return (
    <ol className="flex items-center gap-1 flex-wrap">
      {PHASES.map((p, idx) => {
        const isCurrent = p.key === currentPhase;
        const isViewing = p.key === viewingPhase;
        const isPast = idx < currentIdx;
        const isFuture = idx > currentIdx;
        return (
          <li key={p.key} className="flex items-center min-w-0">
            <button
              type="button"
              onClick={() => onJump(p.key)}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium border transition-all max-w-full ${
                isCurrent
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : isViewing
                  ? "bg-accent text-accent-foreground border-accent-foreground/30"
                  : isPast
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              } ${isFuture && !isViewing ? "opacity-70" : ""}`}
              title={isFuture ? `Pré-visualizar ${p.label}` : p.label}
            >
              <span
                className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isCurrent
                    ? "bg-primary-foreground/20"
                    : isPast
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isPast ? "✓" : idx + 1}
              </span>
              <span className="truncate">{p.shortLabel}</span>
            </button>
            {idx < PHASES.length - 1 && (
              <ChevronRight className="h-3 w-3 mx-0.5 text-muted-foreground/40 shrink-0" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ============================================================
   FASE: INSCRITOS
   ============================================================ */

function PhaseInscritos({
  candidate,
  onChanged,
}: {
  candidate: Candidate;
  onChanged: () => void;
}) {
  const [screening, setScreening] = useState(false);

  const runAi = async () => {
    setScreening(true);
    const { data, error } = await supabase.functions.invoke("screen-candidate", {
      body: { candidate_id: candidate.id },
    });
    setScreening(false);
    if (error || (data as any)?.error) {
      toast({
        title: "Erro na triagem",
        description: (data as any)?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Triagem concluída", description: `Score: ${(data as any)?.score}/100` });
    onChanged();
  };

  return (
    <div className="space-y-4">
      {/* Análise IA */}
      {candidate.ai_score != null ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Análise da IA
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {candidate.ai_score}/100
                </Badge>
                {candidate.ai_recommendation && (
                  <Badge variant="outline" className="text-xs">
                    {recommendationLabel(candidate.ai_recommendation)}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {candidate.ai_summary && (
              <p className="text-muted-foreground">{candidate.ai_summary}</p>
            )}
            {candidate.ai_concerns && (
              <div className="text-xs">
                <span className="font-medium">Pontos a investigar: </span>
                <span className="text-muted-foreground">{candidate.ai_concerns}</span>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={runAi}
              disabled={screening}
              className="gap-2 mt-1"
            >
              {screening ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Triar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Triagem por IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Use os dados do cadastro + descrição da vaga para gerar score, recomendação e pontos
              de atenção.
            </p>
            <Button onClick={runAi} disabled={screening} size="sm" className="gap-2">
              {screening ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Triar com IA
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dados básicos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados do candidato</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="CPF" value={candidate.cpf} />
            <InfoRow label="Telefone" value={candidate.phone} />
            <InfoRow label="E-mail" value={candidate.email} />
            <InfoRow label="Cidade" value={candidate.city} />
            <InfoRow label="Origem" value={candidate.source} />
            <InfoRow
              label="Pretensão"
              value={
                candidate.expected_salary
                  ? `R$ ${Number(candidate.expected_salary).toFixed(2)}`
                  : null
              }
            />
            <InfoRow label="Disponibilidade" value={candidate.availability} />
            <InfoRow
              label="Experiência no cargo"
              value={candidate.has_experience ? "Sim" : "Não"}
            />
          </div>
          {candidate.notes && (
            <div className="mt-3 text-sm">
              <Label className="text-xs">Observações</Label>
              <p className="text-muted-foreground whitespace-pre-wrap">{candidate.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
   FASE: ENTREVISTA
   ============================================================ */

function PhaseEntrevista({
  candidate,
  jobPosition,
  onLaunchGuided,
  onChanged,
}: {
  candidate: Candidate;
  jobPosition: string;
  onLaunchGuided: (k: "hr" | "culture") => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"roteiro" | "cultura" | "avaliar">("roteiro");
  const techQuestions = useMemo(() => questionsForPosition(jobPosition), [jobPosition]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 border-b">
        <SubTab active={tab === "roteiro"} onClick={() => setTab("roteiro")}>
          Roteiro RH
        </SubTab>
        <SubTab active={tab === "cultura"} onClick={() => setTab("cultura")}>
          Fit cultural
        </SubTab>
        <SubTab active={tab === "avaliar"} onClick={() => setTab("avaliar")}>
          Avaliar
        </SubTab>
      </div>

      {tab === "roteiro" && (
        <div className="space-y-3">
          <GuidedLauncher
            onClick={() => onLaunchGuided("hr")}
            label="Iniciar entrevista guiada"
          />
          <ScriptList title="Roteiro de RH" questions={HR_INTERVIEW_QUESTIONS} />
          {techQuestions.length > 0 && (
            <ScriptList
              title={`Perguntas técnicas — ${jobPosition}`}
              questions={techQuestions}
            />
          )}
        </div>
      )}

      {tab === "cultura" && (
        <div className="space-y-3">
          <GuidedLauncher
            onClick={() => onLaunchGuided("culture")}
            label="Iniciar fit cultural guiado"
          />
          <ScriptList title="Perguntas de fit cultural" questions={CULTURE_FIT_QUESTIONS} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Sinais positivos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
                  {GREEN_FLAGS.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-destructive">⚠ Sinais de alerta</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
                  {RED_FLAGS.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "avaliar" && (
        <EvaluationForm
          candidateId={candidate.id}
          stage={candidate.current_stage as StageValue}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ============================================================
   FASE: DOCUMENTAÇÃO
   ============================================================ */

function PhaseDocumentacao({
  candidate,
  onSaved,
  onAdvance,
}: {
  candidate: Candidate;
  onSaved: () => void;
  onAdvance: () => void | Promise<void>;
}) {
  return <DocumentsRequestPanel candidate={candidate} onSaved={onSaved} onAdvance={onAdvance} />;
}

/* ============================================================
   FASE: TREINAMENTO
   ============================================================ */

function PhaseTreinamento({ candidate }: { candidate: Candidate }) {
  const day = trainingDayFromStage(candidate.current_stage as StageValue);
  return (
    <CandidateTrainingPanel
      candidateId={candidate.id}
      createdEmployeeId={(candidate as any).created_employee_id ?? null}
      evaluateDay={day}
      onEvaluateDayConsumed={() => {
        /* noop */
      }}
    />
  );
}

/* ============================================================
   FASE: ENCERRADO
   ============================================================ */

function PhaseEncerrado({
  candidate,
  stageMeta,
}: {
  candidate: Candidate;
  stageMeta: { label: string; color: string } | null | undefined;
}) {
  const isHired = candidate.current_stage === "contratado";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {isHired ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          Processo encerrado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Status final: <strong>{stageMeta?.label ?? candidate.current_stage}</strong>
        </p>
        {isHired && (candidate as any).created_employee_id && (
          <p className="text-xs text-muted-foreground">
            Colaborador vinculado — acesse a ficha em <em>Colaboradores</em>.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Para reabrir o processo, use o menu <strong>⋮</strong> ou clique em uma fase anterior no
          stepper acima.
        </p>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   HISTORICO
   ============================================================ */

function HistoryPanel({ history }: { history: HistoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Histórico de movimentações</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem movimentações ainda.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-muted-foreground">
                  {new Date(h.changed_at).toLocaleString("pt-BR")}
                </span>
                <Badge variant="outline">
                  {STAGES.find((s) => s.value === h.from_stage)?.label ?? "início"}
                </Badge>
                <ChevronRight className="h-3 w-3" />
                <Badge variant="outline">
                  {STAGES.find((s) => s.value === h.to_stage)?.label ?? h.to_stage}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   AÇÕES POR FASE (footer)
   ============================================================ */

function PhaseActions({
  phase,
  isViewingDifferent,
  candidate,
  busy,
  onMove,
  onResetView,
}: {
  phase: PhaseKey;
  isViewingDifferent: boolean;
  candidate: Candidate;
  busy: boolean;
  onMove: (s: StageValue) => void | Promise<void>;
  onResetView: () => void;
}) {
  // Se está apenas visualizando outra fase, oferece mover para ela
  if (isViewingDifferent) {
    return (
      <Button variant="ghost" onClick={onResetView} disabled={busy} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
    );
  }

  // Ações da fase atual
  switch (phase) {
    case "inscritos":
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => onMove("reprovado")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Reprovar
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => onMove("entrevista_agendada")}
            disabled={busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Avançar para Entrevista
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      );

    case "entrevista":
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => onMove("reprovado")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Reprovar
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => onMove("aguardando_inicio")}
            disabled={busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Aprovar — Solicitar documentos
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      );

    case "documentacao":
      // O próprio painel de docs já oferece "Documentação OK — Avançar" (vai para Cadastro).
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => onMove("reprovado")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Reprovar
          </Button>
        </>
      );

    case "cadastro":
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => onMove("reprovado")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Reprovar
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={() => onMove("teste_pratico")}
            disabled={busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastro OK — Iniciar treinamento
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      );

    case "treinamento": {
      const day = trainingDayFromStage(candidate.current_stage as StageValue);
      const nextDayStage =
        day && day < 7
          ? (`treinamento_dia_${day + 1}` as StageValue)
          : day === 7
          ? ("contratado" as StageValue)
          : ("treinamento_dia_1" as StageValue);
      const nextLabel =
        day && day < 7
          ? `Avançar para Dia ${day + 1}`
          : day === 7
          ? "Efetivar contratação"
          : "Iniciar Dia 1";
      return (
        <>
          <Button
            variant="ghost"
            onClick={() => onMove("reprovado")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            Reprovar
          </Button>
          <div className="flex-1" />
          <Button onClick={() => onMove(nextDayStage)} disabled={busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {nextLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      );
    }

    case "encerrado":
      return (
        <>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={() => onMove("novos")}
            disabled={busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <PlayCircle className="h-4 w-4" /> Reabrir processo
          </Button>
        </>
      );

    default:
      return null;
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case "forte_recomendado":
      return "Forte recomendação";
    case "recomendado":
      return "Recomendado";
    case "neutro":
      return "Neutro";
    case "nao_recomendado":
      return "Não recomendado";
    default:
      return rec;
  }
}
