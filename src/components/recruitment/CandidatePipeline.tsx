import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Phone, Sparkles, CalendarClock, Clock, Mail, MessageCircle, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { STAGES, PIPELINE_STAGES, LEGACY_STAGES, type StageValue } from "@/lib/recruitment";
import { PHASES, getPhaseForStage, subStatusLabel, trainingProgress } from "@/lib/recruitmentPhases";
import { cancelLinkedTraining, shouldRevertTraining, shouldStartTraining } from "@/lib/recruitmentTransitions";
import { CandidateFlowDialog as CandidateDetailDialog } from "./CandidateFlowDialog";

export interface Candidate {
  id: string;
  job_opening_id: string;
  full_name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  source: string | null;
  current_stage: StageValue;
  expected_salary: number | null;
  availability: string | null;
  resume_path: string | null;
  resume_name: string | null;
  has_experience: boolean | null;
  notes: string | null;
  applied_at: string;
  ai_score: number | null;
  ai_recommendation: string | null;
  ai_summary: string | null;
  ai_concerns: string | null;
  ai_screened_at: string | null;
  interview_scheduled_at: string | null;
  requested_documents: any;
  documents_requested_at: string | null;
  documents_requested_notes: string | null;
  created_employee_id: string | null;
  updated_at?: string;
}

interface Props {
  jobOpeningId: string;
  jobTitle: string;
  jobPosition: string;
}

const STALE_DAYS = 5;

const onlyDigits = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const waLink = (phone?: string | null, msg?: string) => {
  const d = onlyDigits(phone);
  if (!d) return null;
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
};

export function CandidatePipeline({ jobOpeningId, jobTitle, jobPosition }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("job_candidates")
      .select("*")
      .eq("job_opening_id", jobOpeningId)
      .order("applied_at", { ascending: false });
    setCandidates((data ?? []) as Candidate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [jobOpeningId]);

  const moveStage = async (candidateId: string, from: StageValue, to: StageValue) => {
    if (shouldStartTraining(from, to)) {
      await supabase.from("job_candidates").update({ current_stage: to }).eq("id", candidateId);
      await supabase.from("candidate_stage_history").insert({ candidate_id: candidateId, from_stage: from, to_stage: to });
      navigate(`/colaboradores/novo?fromCandidate=${candidateId}`);
      return;
    }
    const { error } = await supabase.from("job_candidates").update({ current_stage: to }).eq("id", candidateId);
    if (!error) {
      await supabase.from("candidate_stage_history").insert({ candidate_id: candidateId, from_stage: from, to_stage: to });
      if (shouldRevertTraining(from, to)) {
        const reverted = await cancelLinkedTraining(candidateId);
        if (reverted) toast({ title: "Treinamento cancelado", description: "O colaborador vinculado foi marcado como inativo." });
      }
      load();
    }
  };

  // Agrupa candidatos por fase (apenas ativos no pipeline)
  const byPhase = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    PHASES.forEach((p) => map.set(p.key, []));
    candidates
      .filter((c) => PIPELINE_STAGES.includes(c.current_stage) || ["contratado", "reprovado", "desistiu", "talento_futuro"].includes(c.current_stage))
      .forEach((c) => {
        const phase = getPhaseForStage(c.current_stage);
        if (phase) map.get(phase.key)!.push(c);
      });
    return map;
  }, [candidates]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const activeCount = Array.from(byPhase.values()).reduce((acc, list) => acc + list.length, 0);
  if (activeCount === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-md">
        Nenhum candidato ativo nesta vaga ainda.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Kanban responsivo: 1 col mobile, 2 col tablet, 5 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {PHASES.map((phase) => {
          const list = byPhase.get(phase.key) ?? [];
          return (
            <div key={phase.key} className={`rounded-lg border ${phase.color} p-2 flex flex-col min-h-[160px]`}>
              <div className="flex items-center justify-between gap-2 px-1 pb-2 mb-1 border-b border-current/10">
                <div className="text-xs font-bold uppercase tracking-wide truncate">{phase.label}</div>
                <Badge variant="outline" className={`h-5 px-1.5 text-[10px] shrink-0 ${phase.badgeColor}`}>{list.length}</Badge>
              </div>
              {list.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-3 italic">vazio</div>
              ) : (
                <div className="space-y-2">
                  {list.map((c) => (
                    <CandidateMiniCard key={c.id} candidate={c} jobTitle={jobTitle} onOpen={() => setSelectedId(c.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Etapas legadas (mantidas só para limpar dados antigos) */}
      {candidates.some((c) => LEGACY_STAGES.includes(c.current_stage)) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Candidatos em etapas antigas</CardTitle>
            <CardDescription className="text-xs">Mova-os para uma fase atual.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {candidates.filter((c) => LEGACY_STAGES.includes(c.current_stage)).map((c) => {
                const meta = STAGES.find((x) => x.value === c.current_stage)!;
                return (
                  <Card key={c.id} className="cursor-pointer hover:border-primary/50" onClick={() => setSelectedId(c.id)}>
                    <CardContent className="p-2 flex items-center justify-between gap-2">
                      <div className="text-sm truncate">{c.full_name}</div>
                      <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedId && (
        <CandidateDetailDialog
          candidateId={selectedId}
          jobPosition={jobPosition}
          open={!!selectedId}
          onOpenChange={(o) => !o && setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─── Card compacto por candidato ────────────────────────────────────────────
function CandidateMiniCard({
  candidate,
  jobTitle,
  onOpen,
}: {
  candidate: Candidate;
  jobTitle: string;
  onOpen: () => void;
}) {
  const c = candidate;
  const phase = getPhaseForStage(c.current_stage);
  const subStatus = subStatusLabel(c.current_stage);
  const progress = trainingProgress(c.current_stage);

  // Atrasado = mais de 5 dias na mesma fase (usa updated_at)
  const lastChange = c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.applied_at).getTime();
  const daysInStage = Math.floor((Date.now() - lastChange) / (1000 * 60 * 60 * 24));
  const isStale = daysInStage >= STALE_DAYS && phase?.key !== "encerrado";

  const recColor =
    c.ai_recommendation === "forte_recomendado" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
    c.ai_recommendation === "recomendado" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" :
    c.ai_recommendation === "talvez" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" :
    c.ai_recommendation === "nao_recomendado" ? "bg-destructive/10 text-destructive border-destructive/30" :
    "bg-muted text-muted-foreground";

  const wa = waLink(c.phone, `Olá ${c.full_name.split(" ")[0]}, é da equipe NEXA sobre a vaga de ${jobTitle}.`);

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all bg-card"
      onClick={onOpen}
    >
      <CardContent className="p-2 space-y-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-xs flex items-center gap-1 truncate">
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              {c.full_name}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{subStatus}</div>
          </div>
          {isStale && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 bg-destructive/10 text-destructive border-destructive/30 shrink-0">
              <Clock className="h-2.5 w-2.5" />
              {daysInStage}d
            </Badge>
          )}
        </div>

        {progress !== null && (
          <div className="h-1 rounded-full bg-amber-500/20 overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {c.ai_score != null && (
          <Badge variant="outline" className={`gap-0.5 text-[9px] py-0 px-1 h-4 ${recColor}`}>
            <Sparkles className="h-2.5 w-2.5" />
            IA {c.ai_score}
          </Badge>
        )}

        {c.interview_scheduled_at && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarClock className="h-2.5 w-2.5 shrink-0" />
            {new Date(c.interview_scheduled_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}

        <div className="flex items-center gap-1 pt-1 border-t border-border/40">
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground"
              title={`Ligar ${c.phone}`}
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
              title="Abrir WhatsApp"
            >
              <MessageCircle className="h-3 w-3" />
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground"
              title={c.email}
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
          {c.source && <Badge variant="outline" className="ml-auto text-[9px] py-0 px-1 h-4 truncate max-w-[80px]">{c.source}</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
