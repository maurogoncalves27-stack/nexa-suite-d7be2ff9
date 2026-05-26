import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlayCircle, CheckCircle2, XCircle, AlertTriangle, GraduationCap, CalendarRange, Pencil } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TrainingScheduleDialog from "@/components/recruitment/TrainingScheduleDialog";
import TrainingEvaluationDialog from "@/components/training/TrainingEvaluationDialog";
import AdmissionExamPanel from "@/components/recruitment/AdmissionExamPanel";
import type { TrainingCriterion } from "@/pages/Trainings";

interface Props {
  candidateId: string;
  createdEmployeeId: string | null;
  evaluateDay?: number | null;
  onEvaluateDayConsumed?: () => void;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  status: string;
  training_status: string | null;
  training_start_date: string | null;
  training_end_date: string | null;
  admission_date: string | null;
}

interface ScoreRow {
  criterion_id: string;
  day_number: number;
  score: number;
  notes: string | null;
}

const trainingStatusBadge = (s: string | null) => {
  switch (s) {
    case "in_progress": return <Badge variant="default"><PlayCircle className="h-3 w-3 mr-1" />Em treinamento</Badge>;
    case "approved": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Reprovado</Badge>;
    case "pending": return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Pendente</Badge>;
    case "cancelled": return <Badge variant="outline">Cancelado</Badge>;
    default: return <Badge variant="outline">{s ?? "—"}</Badge>;
  }
};

interface ScheduleRow {
  id: string;
  start_date: string;
  location: string | null;
  responsible_name: string;
  store_id: string | null;
  notes: string | null;
  admission_exam_requested_at: string | null;
  admission_exam_document_id: string | null;
  training_schedule_days: { day_date: string; is_day_off: boolean; start_time: string | null; end_time: string | null }[];
}

export function CandidateTrainingPanel({ candidateId, createdEmployeeId, evaluateDay, onEvaluateDayConsumed }: Props) {
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [criteria, setCriteria] = useState<TrainingCriterion[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [evalDay, setEvalDay] = useState<number | null>(null);

  // Quando o pai pede para avaliar um dia específico, abre o diálogo
  useEffect(() => {
    if (evaluateDay && createdEmployeeId) {
      setEvalDay(evaluateDay);
      onEvaluateDayConsumed?.();
    }
  }, [evaluateDay, createdEmployeeId, onEvaluateDayConsumed]);

  const load = async () => {
    if (!createdEmployeeId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: emp }, { data: crit }, { data: sc }, { data: sch }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, status, training_status, training_start_date, training_end_date, admission_date")
        .eq("id", createdEmployeeId)
        .maybeSingle(),
      supabase
        .from("training_criteria")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("training_evaluations")
        .select("criterion_id, day_number, score, notes")
        .eq("employee_id", createdEmployeeId),
      supabase
        .from("training_schedules")
        .select("id, start_date, location, responsible_name, store_id, notes, admission_exam_requested_at, admission_exam_document_id, training_schedule_days(day_date, is_day_off, start_time, end_time)")
        .eq("employee_id", createdEmployeeId)
        .maybeSingle(),
    ]);
    setEmployee(emp as EmployeeRow | null);
    setCriteria((crit ?? []) as TrainingCriterion[]);
    setScores((sc ?? []) as ScoreRow[]);
    setSchedule((sch ?? null) as ScheduleRow | null);
    if (sch?.store_id) {
      const { data: st } = await supabase.from("stores").select("name").eq("id", sch.store_id).maybeSingle();
      setStoreName(st?.name ?? null);
    } else {
      setStoreName(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [createdEmployeeId]);

  if (!createdEmployeeId) {
    return (
      <Alert>
        <GraduationCap className="h-4 w-4" />
        <AlertTitle>Aguardando cadastro do colaborador</AlertTitle>
        <AlertDescription>
          Para iniciar o treinamento, primeiro avance o candidato para a etapa <strong>Cadastro</strong> e
          conclua o cadastro do colaborador. Após salvar, ele será movido automaticamente para
          <strong> Em treinamento</strong> e os dados aparecerão aqui.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  if (!employee) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Colaborador não encontrado</AlertTitle>
        <AlertDescription>O colaborador vinculado a este candidato não foi localizado.</AlertDescription>
      </Alert>
    );
  }

  // Agrupa scores por critério
  const byCriterion = new Map<string, ScoreRow[]>();
  scores.forEach((s) => {
    const arr = byCriterion.get(s.criterion_id) ?? [];
    arr.push(s);
    byCriterion.set(s.criterion_id, arr);
  });
  const evaluatedCount = byCriterion.size;
  const totalCriteria = criteria.length;
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b.score, 0) / scores.length : null;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              {employee.full_name}
            </span>
            {trainingStatusBadge(employee.training_status)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Info label="Cargo" value={employee.position} />
            <Info label="Início treinamento" value={employee.training_start_date ? new Date(employee.training_start_date + "T00:00:00").toLocaleDateString("pt-BR") : null} />
            <Info label="Fim treinamento" value={employee.training_end_date ? new Date(employee.training_end_date + "T00:00:00").toLocaleDateString("pt-BR") : null} />
            <Info label="Admissão" value={employee.admission_date ? new Date(employee.admission_date + "T00:00:00").toLocaleDateString("pt-BR") : null} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <Stat label="Critérios" value={`${evaluatedCount}/${totalCriteria}`} />
            <Stat label="Avaliações" value={String(scores.length)} />
            <Stat label="Média" value={avg != null ? avg.toFixed(1) : "—"} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setScheduleOpen(true)} className="gap-2">
              <CalendarRange className="h-3.5 w-3.5" /> {schedule ? "Editar agendamento" : "Agendar treinamento"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {schedule && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> Agendamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Info label="Início" value={new Date(schedule.start_date + "T00:00:00").toLocaleDateString("pt-BR")} />
              <Info label="Local" value={schedule.location || storeName} />
              <Info label="Responsável" value={schedule.responsible_name} />
            </div>
            {schedule.training_schedule_days?.length > 0 && (
              <div className="border-t pt-2">
                <p className="text-xs font-medium mb-1.5">Escala</p>
                <ul className="space-y-1">
                  {[...schedule.training_schedule_days]
                    .sort((a, b) => a.day_date.localeCompare(b.day_date))
                    .map((d, i) => (
                      <li key={i} className="flex items-center justify-between text-xs border rounded-md px-2 py-1">
                        <span>{new Date(d.day_date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                        <span className="text-muted-foreground">
                          {d.is_day_off
                            ? "Folga"
                            : `${(d.start_time ?? "").slice(0, 5)} - ${(d.end_time ?? "").slice(0, 5)}`}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {scores.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notas por critério</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {criteria.map((c) => {
                const items = byCriterion.get(c.id) ?? [];
                if (items.length === 0) return null;
                const a = items.reduce((s, x) => s + x.score, 0) / items.length;
                return (
                  <li key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2 gap-2">
                    <span className="truncate">{c.name}</span>
                    <Badge variant="outline">{a.toFixed(1)} ({items.length}x)</Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <AdmissionExamPanel
        employeeId={employee.id}
        scheduleId={schedule?.id ?? null}
        requestedAt={schedule?.admission_exam_requested_at ?? null}
        documentId={schedule?.admission_exam_document_id ?? null}
        onChanged={load}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Avaliação por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const dayScores = scores.filter((s) => s.day_number === d);
              const evaluated = dayScores.length > 0;
              const avgD = evaluated ? dayScores.reduce((a, b) => a + b.score, 0) / dayScores.length : null;
              return (
                <Button
                  key={d}
                  variant={evaluated ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEvalDay(d)}
                  className="flex flex-col h-auto py-2 gap-0.5"
                >
                  <span className="text-xs font-semibold">Dia {d}</span>
                  <span className="text-[10px] opacity-80">
                    {evaluated ? `${avgD!.toFixed(1)} ★` : "—"}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {scheduleOpen && employee && (
        <TrainingScheduleDialog
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          employeeId={employee.id}
          employeeName={employee.full_name}
          onSaved={load}
        />
      )}

      {evalDay && employee && (
        <TrainingEvaluationDialog
          open={!!evalDay}
          onClose={() => { setEvalDay(null); load(); }}
          employee={{
            id: employee.id,
            full_name: employee.full_name,
            position: employee.position,
            training_start_date: employee.training_start_date,
          }}
          criteria={criteria}
          initialDay={evalDay}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
