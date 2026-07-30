import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, CheckCircle2, BarChart3, Target, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Cycle, Criterion } from "@/pages/Evaluations";
import EmployeePerformanceCharts from "./EmployeePerformanceCharts";
import CompetencyEvaluationForm from "./CompetencyEvaluationForm";
import {
  COMMENT_REQUIRED_SCORES,
  DEFAULT_SCALE,
  MEETS_EXPECTATION,
  competencyAverage,
  finalScore10,
  requiredGaps,
  scaleColorClass,
  type CompetencyScoreInput,
  type PositionCompetency,
  type ScaleLevel,
} from "@/lib/competencyEvaluation";

interface Props {
  cycles: Cycle[];
  criteria: Criterion[];
  selectedCycleId: string;
  onSelectCycle: (id: string) => void;
}
interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  position_id: string | null;
  contracting_store?: { name: string } | null;
}
interface EvaluationRow {
  id: string;
  cycle_id: string;
  employee_id: string;
  final_score: number | null;
  competency_avg: number | null;
  competency_count: number;
  general_notes: string | null;
  status: "draft" | "finalized";
}
interface InfractionRow {
  employee_id: string;
  applied_weight: number;
}

const emptyScore = (): CompetencyScoreInput => ({ score: null, not_applicable: false, comment: "" });

export default function PerformancePanel({ cycles, criteria, selectedCycleId, onSelectCycle }: Props) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [infractions, setInfractions] = useState<InfractionRow[]>([]);
  const [competencies, setCompetencies] = useState<PositionCompetency[]>([]);
  const [scale, setScale] = useState<ScaleLevel[]>(DEFAULT_SCALE);
  const [loading, setLoading] = useState(false);
  const [periodicityFilter, setPeriodicityFilter] = useState<"all" | "weekly" | "monthly" | "semiannual">("all");

  const filteredCycles = useMemo(
    () => periodicityFilter === "all" ? cycles : cycles.filter((c) => c.periodicity === periodicityFilter),
    [cycles, periodicityFilter],
  );

  const cycle = useMemo(() => cycles.find((c) => c.id === selectedCycleId), [cycles, selectedCycleId]);

  useEffect(() => {
    if (filteredCycles.length === 0) return;
    if (!filteredCycles.find((c) => c.id === selectedCycleId)) {
      onSelectCycle(filteredCycles[0].id);
    }
  }, [filteredCycles, selectedCycleId, onSelectCycle]);

  useEffect(() => {
    (async () => {
      const [{ data: comps }, { data: lv }] = await Promise.all([
        supabase.from("position_competencies").select("*").order("order_index"),
        supabase.from("competency_scale_levels").select("*").order("score"),
      ]);
      setCompetencies((comps ?? []) as unknown as PositionCompetency[]);
      if (lv && lv.length) setScale(lv as unknown as ScaleLevel[]);
    })();
  }, []);

  const load = async () => {
    if (!selectedCycleId || !cycle) {
      setEmployees([]); setEvaluations([]); setInfractions([]); return;
    }
    setLoading(true);
    const [{ data: emps, error: ee }, { data: evs }, { data: infs }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, position_id, contracting_store:stores!employees_store_id_fkey(name)")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("evaluations")
        .select("id, cycle_id, employee_id, final_score, competency_avg, competency_count, general_notes, status")
        .eq("cycle_id", selectedCycleId),
      supabase
        .from("employee_infractions")
        .select("employee_id, applied_weight, cycle_id, occurred_on")
        .or(`cycle_id.eq.${selectedCycleId},and(cycle_id.is.null,occurred_on.gte.${cycle.start_date},occurred_on.lte.${cycle.end_date})`),
    ]);
    if (ee) toast({ title: "Erro", description: ee.message, variant: "destructive" });
    setEmployees((emps ?? []) as unknown as EmployeeRow[]);
    setEvaluations((evs ?? []) as unknown as EvaluationRow[]);
    setInfractions((infs ?? []) as InfractionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedCycleId, cycle?.id]);

  const infractionWeightByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of infractions) map[i.employee_id] = (map[i.employee_id] ?? 0) + Number(i.applied_weight);
    return map;
  }, [infractions]);

  const compsByPosition = useMemo(() => {
    const m = new Map<string, PositionCompetency[]>();
    competencies.forEach((c) => {
      const arr = m.get(c.position_id) ?? [];
      arr.push(c);
      m.set(c.position_id, arr);
    });
    return m;
  }, [competencies]);

  // Modal de avaliação
  const [openId, setOpenId] = useState<string | null>(null);
  const openEmployee = useMemo(() => employees.find((e) => e.id === openId) ?? null, [employees, openId]);
  const openEval = useMemo(() => evaluations.find((e) => e.employee_id === openId) ?? null, [evaluations, openId]);
  const openComps = useMemo(
    () => (openEmployee?.position_id ? compsByPosition.get(openEmployee.position_id) ?? [] : []),
    [openEmployee, compsByPosition],
  );
  const [scores, setScores] = useState<Record<string, CompetencyScoreInput>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingPdi, setGeneratingPdi] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!openId) { setScores({}); setNotes(""); return; }
      if (!openEval) { setScores({}); setNotes(""); return; }
      setNotes(openEval.general_notes ?? "");
      const { data } = await supabase
        .from("evaluation_competency_scores")
        .select("position_competency_id, score, not_applicable, comment")
        .eq("evaluation_id", openEval.id);
      const map: Record<string, CompetencyScoreInput> = {};
      (data ?? []).forEach((s: any) => {
        map[s.position_competency_id] = {
          score: s.score == null ? null : Number(s.score),
          not_applicable: !!s.not_applicable,
          comment: s.comment ?? "",
        };
      });
      setScores(map);
    };
    fetch();
  }, [openId, openEval]);

  const closeModal = () => setOpenId(null);

  const patchScore = (id: string, patch: Partial<CompetencyScoreInput>) =>
    setScores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyScore()), ...patch } }));

  const openInfractionPoints = openId ? (infractionWeightByEmp[openId] ?? 0) : 0;
  const openSummary = useMemo(() => competencyAverage(openComps, scores), [openComps, scores]);
  const openGaps = useMemo(() => requiredGaps(openComps, scores), [openComps, scores]);

  const save = async (finalize: boolean) => {
    if (!openEmployee || !selectedCycleId) return;
    if (openComps.length === 0) {
      toast({ title: "Cargo sem competências", description: "Cadastre as competências do cargo no Plano de Carreira (PCCS).", variant: "destructive" });
      return;
    }
    const entries = openComps
      .map((c) => ({ comp: c, s: scores[c.id] }))
      .filter(({ s }) => s && (s.not_applicable || s.score != null));

    const missingComment = entries.find(
      ({ s }) => s && !s.not_applicable && s.score != null && COMMENT_REQUIRED_SCORES.includes(s.score) && !s.comment.trim(),
    );
    if (missingComment) {
      toast({ title: "Justificativa obrigatória", description: `Justifique a nota de "${missingComment.comp.name}".`, variant: "destructive" });
      return;
    }
    if (finalize && entries.length !== openComps.length) {
      toast({ title: "Avaliação incompleta", description: "Para finalizar, avalie todas as competências (ou marque \"não se aplica\").", variant: "destructive" });
      return;
    }

    const { avg, count } = competencyAverage(openComps, scores);
    const final = finalScore10(avg, openInfractionPoints);

    setSaving(true);
    let evalId = openEval?.id;
    const payload = {
      general_notes: notes || null,
      status: finalize ? "finalized" : (openEval?.status ?? "draft"),
      final_score: final,
      competency_avg: avg,
      competency_count: count,
    };
    if (!evalId) {
      const { data, error } = await supabase
        .from("evaluations")
        .insert({ ...payload, cycle_id: selectedCycleId, employee_id: openEmployee.id, created_by: user?.id ?? null })
        .select()
        .single();
      if (error || !data) {
        setSaving(false);
        toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
        return;
      }
      evalId = data.id;
    } else {
      const { error } = await supabase.from("evaluations").update(payload).eq("id", evalId);
      if (error) {
        setSaving(false);
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    }

    await supabase.from("evaluation_competency_scores").delete().eq("evaluation_id", evalId!);
    if (entries.length) {
      const { error: insErr } = await supabase.from("evaluation_competency_scores").insert(
        entries.map(({ comp, s }) => ({
          evaluation_id: evalId!,
          position_competency_id: comp.id,
          score: s!.not_applicable ? null : s!.score,
          not_applicable: s!.not_applicable,
          comment: s!.comment.trim() || null,
        })),
      );
      if (insErr) {
        setSaving(false);
        toast({ title: "Erro nas notas", description: insErr.message, variant: "destructive" });
        return;
      }
    }
    setSaving(false);
    toast({ title: finalize ? "Avaliação finalizada" : "Avaliação salva" });
    if (!finalize) { load(); return; }
    closeModal();
    load();
  };

  const generatePdi = async () => {
    if (!openEmployee || openGaps.length === 0) return;
    setGeneratingPdi(true);
    const rows = openGaps.map((c) => ({
      employee_id: openEmployee.id,
      competency: c.name,
      objective: `Desenvolver a competência "${c.name}" até o nível ${MEETS_EXPECTATION} (Atende)`,
      expected_result: `Demonstrar "${c.name}" de forma consistente no dia a dia do cargo ${openEmployee.position ?? ""}`.trim(),
      target_position_id: openEmployee.position_id,
      notes: `Gerado a partir da avaliação por competência${cycle ? ` — ${cycle.name}` : ""}.`,
      created_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("development_plans").insert(rows);
    setGeneratingPdi(false);
    if (error) {
      toast({ title: "Erro ao gerar PDI", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${rows.length} item(ns) de PDI criados` });
  };

  // Modal de gráficos
  const [chartsId, setChartsId] = useState<string | null>(null);
  const chartsEmployee = useMemo(() => employees.find((e) => e.id === chartsId) ?? null, [employees, chartsId]);

  const renderScore = (ev: EvaluationRow | undefined) => {
    if (!ev || ev.final_score == null) return <span className="text-muted-foreground">—</span>;
    const avg = ev.competency_avg != null ? Number(ev.competency_avg) : null;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">{Number(ev.final_score).toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">/ 10</span>
        {avg != null && (
          <Badge variant="outline" className={scaleColorClass(Math.round(avg))}>
            {avg.toFixed(2)} / 5
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div className="space-y-2">
            <Label>Periodicidade</Label>
            <Select value={periodicityFilter} onValueChange={(v) => setPeriodicityFilter(v as typeof periodicityFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="semiannual">Semestral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ciclo</Label>
            <Select value={selectedCycleId} onValueChange={onSelectCycle}>
              <SelectTrigger><SelectValue placeholder="Selecione um ciclo" /></SelectTrigger>
              <SelectContent>
                {filteredCycles.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum ciclo</div>}
                {filteredCycles.map((c) => {
                  const periodLabel = c.periodicity === "weekly" ? "Semanal" : c.periodicity === "monthly" ? "Mensal" : "Semestral";
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {periodLabel} {c.status === "closed" ? "(fechado)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground lg:max-w-xs lg:text-right">
          Cada colaborador é avaliado nas competências do próprio cargo, na escala 1 a 5. Infrações do ciclo entram como Disciplina (20% da nota).
        </p>
      </div>

      {!selectedCycleId ? (
        <div className="text-center text-muted-foreground py-8">Selecione um ciclo para começar.</div>
      ) : loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum colaborador ativo encontrado.</div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {employees.map((e) => {
              const ev = evaluations.find((x) => x.employee_id === e.id);
              const w = infractionWeightByEmp[e.id] ?? 0;
              const comps = e.position_id ? compsByPosition.get(e.position_id) ?? [] : [];
              return (
                <div key={e.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-left font-medium text-sm hover:underline min-w-0" onClick={() => setChartsId(e.id)}>
                      {e.full_name}
                    </button>
                    {ev ? (
                      <Badge variant={ev.status === "finalized" ? "default" : "secondary"} className="shrink-0">
                        {ev.status === "finalized" ? (<><CheckCircle2 className="h-3 w-3 mr-1" /> Finalizada</>) : "Rascunho"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">Pendente</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.position ?? "—"} · {e.contracting_store?.name ?? "—"} · {comps.length} competências
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">Nota final</div>
                      {renderScore(ev)}
                    </div>
                    {w > 0 && <Badge variant="destructive">{w.toFixed(1)} pts</Badge>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setChartsId(e.id)}>
                      <BarChart3 className="h-4 w-4 mr-1" /> Gráficos
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpenId(e.id)}>
                      <Pencil className="h-4 w-4 mr-1" /> Avaliar
                    </Button>
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
                  <TableHead className="w-24">Compet.</TableHead>
                  <TableHead className="w-56">Nota final</TableHead>
                  <TableHead className="w-28">Infrações</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="text-right w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => {
                  const ev = evaluations.find((x) => x.employee_id === e.id);
                  const w = infractionWeightByEmp[e.id] ?? 0;
                  const comps = e.position_id ? compsByPosition.get(e.position_id) ?? [] : [];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        <button className="text-left hover:underline" onClick={() => setChartsId(e.id)}>
                          {e.full_name}
                        </button>
                      </TableCell>
                      <TableCell>{e.position ?? "—"}</TableCell>
                      <TableCell>{e.contracting_store?.name ?? "—"}</TableCell>
                      <TableCell>
                        {comps.length > 0 ? (
                          <span className="text-sm">{comps.length}</span>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-warning border-warning/40">
                            <AlertTriangle className="h-3 w-3" /> 0
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{renderScore(ev)}</TableCell>
                      <TableCell>
                        {w > 0 ? <Badge variant="destructive">{w.toFixed(1)} pts</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {ev ? (
                          <Badge variant={ev.status === "finalized" ? "default" : "secondary"}>
                            {ev.status === "finalized" ? (<><CheckCircle2 className="h-3 w-3 mr-1" /> Finalizada</>) : "Rascunho"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setChartsId(e.id)} title="Ver gráficos">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setOpenId(e.id)} title="Avaliar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Modal de avaliação por competência */}
      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliar — {openEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              {cycle?.name} · {openEmployee?.position ?? "—"} · {openComps.length} competências do cargo
            </DialogDescription>
          </DialogHeader>

          {openComps.length === 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium text-warning">
                <AlertTriangle className="h-4 w-4" /> Cargo sem competências cadastradas
              </div>
              <p className="text-muted-foreground">
                Cadastre as competências deste cargo em Plano de Carreira (PCCS) → Competências para poder avaliar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <CompetencyEvaluationForm
                competencies={openComps}
                scores={scores}
                onChange={patchScore}
                scale={scale}
                infractionPoints={openInfractionPoints}
              />

              {openGaps.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4 text-warning" />
                    {openGaps.length} competência(s) obrigatória(s) abaixo de {MEETS_EXPECTATION}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {openGaps.map((g) => <Badge key={g.id} variant="outline">{g.name}</Badge>)}
                  </div>
                  <Button size="sm" variant="outline" onClick={generatePdi} disabled={generatingPdi}>
                    {generatingPdi && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Gerar PDI a partir dos gaps
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações gerais</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving || openComps.length === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar rascunho
            </Button>
            <Button onClick={() => save(true)} disabled={saving || openComps.length === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Finalizar ({openSummary.count}/{openComps.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de gráficos */}
      <EmployeePerformanceCharts
        open={!!chartsId}
        onClose={() => setChartsId(null)}
        employeeId={chartsId}
        employeeName={chartsEmployee?.full_name ?? ""}
        cycles={cycles}
        criteria={criteria}
        disciplinePenaltyPerPoint={1}
      />
    </div>
  );
}
