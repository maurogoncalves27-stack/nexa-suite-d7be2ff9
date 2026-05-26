import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Pencil, CheckCircle2, XCircle, AlertTriangle, PlayCircle, FileWarning, Stethoscope, CalendarClock, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StarRating } from "@/components/evaluations/StarRating";
import TrainingEvaluationDialog from "./TrainingEvaluationDialog";
import { getMissingAdmissionDocs } from "@/lib/requiredDocs";
import type { TrainingCriterion } from "@/pages/Trainings";

interface Props {
  criteria: TrainingCriterion[];
  loadingCriteria: boolean;
}

interface TraineeRow {
  id: string;
  full_name: string;
  position: string | null;
  status: string;
  training_status: string;
  training_start_date: string | null;
  training_end_date: string | null;
  admission_date: string | null;
  contracting_store?: { name: string } | null;
}

interface ScoreRow {
  employee_id: string;
  criterion_id: string;
  day_number: number;
  score: number;
}

const trainingStatusBadge = (s: string) => {
  switch (s) {
    case "in_progress": return <Badge variant="default"><PlayCircle className="h-3 w-3 mr-1" />Em treinamento</Badge>;
    case "approved": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Reprovado</Badge>;
    case "pending": return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Pendente</Badge>;
    default: return <Badge variant="outline">{s}</Badge>;
  }
};

const daysBetween = (start: string | null) => {
  if (!start) return 0;
  const ms = new Date().getTime() - new Date(start + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86_400_000) + 1);
};

export default function TrainingDashboard({ criteria, loadingCriteria }: Props) {
  const [trainees, setTrainees] = useState<TraineeRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [missingByEmp, setMissingByEmp] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: emps, error } = await supabase
      .from("employees")
      .select("id, full_name, position, status, training_status, training_start_date, training_end_date, admission_date, gender, contract_type, contracting_store:stores!employees_store_id_fkey(name)")
      .in("training_status", ["pending", "in_progress"])
      .order("training_start_date", { ascending: true, nullsFirst: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });

    const list = (emps ?? []) as unknown as TraineeRow[];
    setTrainees(list);

    if (list.length > 0) {
      const ids = list.map((t) => t.id);
      const [{ data: sc }, { data: docs }] = await Promise.all([
        supabase
          .from("training_evaluations")
          .select("employee_id, criterion_id, day_number, score")
          .in("employee_id", ids),
        supabase
          .from("employee_documents")
          .select("employee_id, doc_type")
          .in("employee_id", ids),
      ]);
      setScores((sc ?? []) as ScoreRow[]);

      const docsByEmp: Record<string, { doc_type: string }[]> = {};
      (docs ?? []).forEach((d: any) => {
        if (!docsByEmp[d.employee_id]) docsByEmp[d.employee_id] = [];
        docsByEmp[d.employee_id].push({ doc_type: d.doc_type });
      });
      const genderByEmp: Record<string, string | null> = {};
      const contractByEmp: Record<string, string | null> = {};
      list.forEach((e: any) => {
        genderByEmp[e.id] = e.gender ?? null;
        contractByEmp[e.id] = e.contract_type ?? null;
      });
      const missing: Record<string, string[]> = {};
      ids.forEach((id) => {
        missing[id] = getMissingAdmissionDocs(docsByEmp[id] ?? [], genderByEmp[id], contractByEmp[id]);
      });
      setMissingByEmp(missing);
    } else {
      setScores([]);
      setMissingByEmp({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalCriteriaWeight = useMemo(
    () => criteria.reduce((acc, c) => acc + Number(c.weight), 0),
    [criteria],
  );

  const computeAverage = (employeeId: string): { avg: number | null; daysFilled: number } => {
    const empScores = scores.filter((s) => s.employee_id === employeeId);
    if (empScores.length === 0 || criteria.length === 0) return { avg: null, daysFilled: 0 };
    const days = new Set(empScores.map((s) => s.day_number));
    let sumWeighted = 0, sumWeights = 0;
    for (const s of empScores) {
      const c = criteria.find((x) => x.id === s.criterion_id);
      if (!c) continue;
      sumWeighted += Number(s.score) * Number(c.weight);
      sumWeights += Number(c.weight);
    }
    const avg = sumWeights > 0 ? sumWeighted / sumWeights : null;
    return { avg, daysFilled: days.size };
  };

  /** Alertas de fluxo de treinamento por colaborador */
  const alerts = useMemo(() => {
    const missingToday: TraineeRow[] = [];     // dia atual sem avaliação
    const needExam: TraineeRow[] = [];         // 3º+ dia sem exame admissional
    const readyToHire: TraineeRow[] = [];      // dia 7 atingido

    for (const t of trainees) {
      if (t.training_status !== "in_progress" || !t.training_start_date) continue;
      const currentDay = Math.min(7, daysBetween(t.training_start_date));
      if (currentDay < 1) continue;

      // 1) Avaliação obrigatória do dia atual
      const hasToday = scores.some(
        (s) => s.employee_id === t.id && s.day_number === currentDay,
      );
      if (!hasToday) missingToday.push(t);

      // 2) Exame admissional a partir do 3º dia
      const missing = missingByEmp[t.id] ?? [];
      if (currentDay >= 3 && missing.includes("Exame Admissional")) {
        needExam.push(t);
      }

      // 3) Dia 7 → evoluir para contratação
      if (currentDay >= 7) readyToHire.push(t);
    }

    return { missingToday, needExam, readyToHire };
  }, [trainees, scores, missingByEmp]);

  const updateTrainingStatus = async (id: string, newStatus: string, employeeStatus?: string) => {
    const payload: {
      training_status: string;
      status?: string;
      training_start_date?: string;
    } = { training_status: newStatus };
    if (employeeStatus) payload.status = employeeStatus;
    if (newStatus === "in_progress") payload.training_start_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("employees").update(payload).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Status atualizado" });
    load();
  };

  const approve = async (t: TraineeRow) => {
    const missing = missingByEmp[t.id] ?? [];
    if (missing.length > 0) {
      toast({
        title: "Documentação incompleta",
        description: `Não é possível admitir. Faltam: ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`Aprovar admissão de ${t.full_name}? O status passará para Ativo.`)) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("employees").update({
      training_status: "approved",
      status: "active",
      admission_date: t.admission_date ?? today,
      training_end_date: t.training_end_date ?? today,
    }).eq("id", t.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Colaborador admitido" });
    load();
  };

  const reject = async (t: TraineeRow) => {
    const reason = prompt(`Motivo da reprovação de ${t.full_name}? (opcional)`);
    if (reason === null) return;
    const { error } = await supabase.from("employees").update({
      training_status: "rejected",
      status: "rejected",
      training_end_date: new Date().toISOString().slice(0, 10),
      notes: reason ? `[Reprovado em treinamento] ${reason}` : undefined,
    }).eq("id", t.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Treinamento reprovado" });
    load();
  };

  const openTrainee = useMemo(() => trainees.find((t) => t.id === openId) ?? null, [trainees, openId]);

  if (loadingCriteria || loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (criteria.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        Cadastre ao menos um critério ativo na aba <strong>Critérios</strong> antes de iniciar avaliações.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Lista de colaboradores em fase de treinamento de 7 dias. Avalie diariamente nos critérios próprios e, ao final, decida pela admissão.
      </p>

      {/* Banner de pendências do gestor */}
      {(alerts.missingToday.length + alerts.needExam.length + alerts.readyToHire.length) > 0 && (
        <div className="space-y-2">
          {alerts.missingToday.length > 0 && (
            <Alert>
              <CalendarClock className="h-4 w-4" />
              <AlertTitle>Avaliação diária pendente</AlertTitle>
              <AlertDescription>
                <div className="text-sm mb-2">
                  Avaliação obrigatória do dia atual ainda não registrada para {alerts.missingToday.length} colaborador(es):
                </div>
                <div className="flex flex-wrap gap-2">
                  {alerts.missingToday.map((t) => (
                    <Button key={t.id} size="sm" variant="outline" onClick={() => setOpenId(t.id)}>
                      <Pencil className="h-3 w-3 mr-1" /> {t.full_name}
                    </Button>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {alerts.needExam.length > 0 && (
            <Alert variant="destructive">
              <Stethoscope className="h-4 w-4" />
              <AlertTitle>Solicitar exame admissional</AlertTitle>
              <AlertDescription>
                <div className="text-sm mb-2">
                  Já no 3º+ dia de treinamento e ainda sem Exame Admissional anexado. Solicite ao colaborador e anexe na pasta:
                </div>
                <div className="flex flex-wrap gap-2">
                  {alerts.needExam.map((t) => (
                    <Badge key={t.id} variant="outline" className="bg-background">
                      {t.full_name}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {alerts.readyToHire.length > 0 && (
            <Alert className="border-emerald-500/50">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <AlertTitle>Pronto para contratação</AlertTitle>
              <AlertDescription>
                <div className="text-sm mb-2">
                  Treinamento de 7 dias concluído. Avalie a documentação e prossiga com a admissão:
                </div>
                <div className="flex flex-wrap gap-2">
                  {alerts.readyToHire.map((t) => {
                    const blocked = (missingByEmp[t.id] ?? []).length > 0;
                    return (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={blocked ? "outline" : "default"}
                        onClick={() => approve(t)}
                        disabled={blocked}
                        title={blocked ? `Faltam: ${(missingByEmp[t.id] ?? []).join(", ")}` : "Aprovar admissão"}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Admitir {t.full_name}
                      </Button>
                    );
                  })}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {trainees.length === 0 ? (
        <div className="text-center text-muted-foreground py-10">
          Nenhum colaborador em treinamento. Cadastre um novo colaborador e defina o status como <strong>Em treinamento</strong>.
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {trainees.map((t) => {
              const { avg, daysFilled } = computeAverage(t.id);
              const currentDay = Math.min(7, daysBetween(t.training_start_date));
              const missing = missingByEmp[t.id] ?? [];
              return (
                <div key={t.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.position ?? "—"} · {t.contracting_store?.name ?? "—"}
                      </div>
                    </div>
                    {trainingStatusBadge(t.training_status)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Início</div>
                      <div>{t.training_start_date ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Dia atual</div>
                      <div className={currentDay >= 7 ? "text-emerald-600 font-medium" : ""}>
                        {t.training_start_date ? `${currentDay}/7` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Média</div>
                    {avg != null ? (
                      <div className="flex items-center gap-2">
                        <StarRating value={avg} readOnly size={14} />
                        <span className="text-muted-foreground">{avg.toFixed(1)} · {daysFilled}/7d</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sem avaliações</span>
                    )}
                  </div>
                  <div>
                    {missing.length > 0 ? (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
                        <FileWarning className="h-3 w-3 mr-1" />
                        Doc. devendo: {missing.length}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Doc. completa
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {t.training_status === "pending" && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => updateTrainingStatus(t.id, "in_progress", "in_training")}>
                        <PlayCircle className="h-4 w-4 mr-1" /> Iniciar
                      </Button>
                    )}
                    {t.training_status === "in_progress" && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpenId(t.id)}>
                          <Pencil className="h-4 w-4 mr-1" /> Avaliar
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => approve(t)} disabled={missing.length > 0}>
                          <CheckCircle2 className={`h-4 w-4 mr-1 ${missing.length > 0 ? "text-muted-foreground" : "text-emerald-600"}`} /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => reject(t)}>
                          <XCircle className="h-4 w-4 mr-1 text-destructive" /> Reprovar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Início treinamento</TableHead>
                  <TableHead>Dia atual</TableHead>
                  <TableHead className="w-48">Média</TableHead>
                  <TableHead>Documentação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-44">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainees.map((t) => {
                  const { avg, daysFilled } = computeAverage(t.id);
                  const currentDay = Math.min(7, daysBetween(t.training_start_date));
                  const missing = missingByEmp[t.id] ?? [];
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.full_name}</TableCell>
                      <TableCell>{t.position ?? "—"}</TableCell>
                      <TableCell>{t.contracting_store?.name ?? "—"}</TableCell>
                      <TableCell>{t.training_start_date ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {t.training_start_date ? (
                          <span className={currentDay >= 7 ? "text-emerald-600 font-medium" : ""}>
                            {currentDay}/7
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {avg != null ? (
                          <div className="flex items-center gap-2">
                            <StarRating value={avg} readOnly size={14} />
                            <span className="text-xs text-muted-foreground">
                              {avg.toFixed(1)} · {daysFilled}/7d
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem avaliações</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {missing.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 cursor-help">
                                <FileWarning className="h-3 w-3 mr-1" />
                                Devendo
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Faltam: {missing.join(", ")}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Completa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{trainingStatusBadge(t.training_status)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {t.training_status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => updateTrainingStatus(t.id, "in_progress", "in_training")}>
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Iniciar
                          </Button>
                        )}
                        {t.training_status === "in_progress" && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => setOpenId(t.id)} title="Avaliar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => approve(t)}
                              title={missing.length > 0 ? `Bloqueado: faltam ${missing.join(", ")}` : "Aprovar admissão"}
                              disabled={missing.length > 0}
                            >
                              <CheckCircle2 className={`h-4 w-4 ${missing.length > 0 ? "text-muted-foreground" : "text-emerald-600"}`} />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => reject(t)} title="Reprovar">
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <TrainingEvaluationDialog
        open={!!openId}
        onClose={() => setOpenId(null)}
        employee={openTrainee}
        criteria={criteria}
        onSaved={load}
      />
    </div>
  );
}
