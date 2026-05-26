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
import { Loader2, Pencil, CheckCircle2, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Cycle, Criterion } from "@/pages/Evaluations";
import { StarRating } from "./StarRating";
import EmployeePerformanceCharts from "./EmployeePerformanceCharts";

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
  contracting_store?: { name: string } | null;
}
interface EvaluationRow {
  id: string;
  cycle_id: string;
  employee_id: string;
  final_score: number | null;
  general_notes: string | null;
  status: "draft" | "finalized";
}
interface InfractionRow {
  employee_id: string;
  applied_weight: number;
}

// 5 estrelas = 10 na escala interna. Penalidade: 0.5★ por ponto = 1 ponto na escala 10.
const PENALTY_PER_POINT_10 = 1;
const DISCIPLINE_WEIGHT = 1;

const tenToStars = (v: number) => Math.round((v / 2) * 10) / 10;
const starsToTen = (v: number) => v * 2;

export default function PerformancePanel({ cycles, criteria, selectedCycleId, onSelectCycle }: Props) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [infractions, setInfractions] = useState<InfractionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodicityFilter, setPeriodicityFilter] = useState<"all" | "weekly" | "monthly" | "semiannual">("all");

  const filteredCycles = useMemo(
    () => periodicityFilter === "all" ? cycles : cycles.filter((c) => c.periodicity === periodicityFilter),
    [cycles, periodicityFilter],
  );

  const cycle = useMemo(() => cycles.find((c) => c.id === selectedCycleId), [cycles, selectedCycleId]);

  // Se o ciclo selecionado não está no filtro, seleciona o primeiro do filtro
  useEffect(() => {
    if (filteredCycles.length === 0) return;
    if (!filteredCycles.find((c) => c.id === selectedCycleId)) {
      onSelectCycle(filteredCycles[0].id);
    }
  }, [filteredCycles, selectedCycleId, onSelectCycle]);

  const load = async () => {
    if (!selectedCycleId || !cycle) {
      setEmployees([]); setEvaluations([]); setInfractions([]); return;
    }
    setLoading(true);
    const [{ data: emps, error: ee }, { data: evs }, { data: infs }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, contracting_store:stores!employees_store_id_fkey(name)")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("evaluations")
        .select("id, cycle_id, employee_id, final_score, general_notes, status")
        .eq("cycle_id", selectedCycleId),
      supabase
        .from("employee_infractions")
        .select("employee_id, applied_weight, cycle_id, occurred_on")
        .or(`cycle_id.eq.${selectedCycleId},and(cycle_id.is.null,occurred_on.gte.${cycle.start_date},occurred_on.lte.${cycle.end_date})`),
    ]);
    if (ee) toast({ title: "Erro", description: ee.message, variant: "destructive" });
    setEmployees((emps ?? []) as unknown as EmployeeRow[]);
    setEvaluations((evs ?? []) as EvaluationRow[]);
    setInfractions((infs ?? []) as InfractionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedCycleId, cycle?.id]);

  const infractionWeightByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of infractions) map[i.employee_id] = (map[i.employee_id] ?? 0) + Number(i.applied_weight);
    return map;
  }, [infractions]);

  const totalCriteriaWeight = useMemo(
    () => criteria.reduce((acc, c) => acc + Number(c.weight), 0),
    [criteria],
  );

  const adjustedStars = (employeeId: string, baseFinal10: number | null): number | null => {
    const w = infractionWeightByEmp[employeeId] ?? 0;
    const disc10 = Math.max(0, 10 - w * PENALTY_PER_POINT_10);
    if (baseFinal10 == null && w === 0) return null;
    const baseW = totalCriteriaWeight;
    const baseSum = (baseFinal10 ?? 0) * baseW;
    const total = baseSum + disc10 * DISCIPLINE_WEIGHT;
    const div = baseW + DISCIPLINE_WEIGHT;
    const adj10 = div > 0 ? total / div : 0;
    return tenToStars(adj10);
  };

  // Modal de avaliação
  const [openId, setOpenId] = useState<string | null>(null);
  const openEmployee = useMemo(() => employees.find((e) => e.id === openId) ?? null, [employees, openId]);
  const openEval = useMemo(() => evaluations.find((e) => e.employee_id === openId) ?? null, [evaluations, openId]);
  const [starScores, setStarScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!openId) { setStarScores({}); setNotes(""); return; }
      if (!openEval) { setStarScores({}); setNotes(""); return; }
      setNotes(openEval.general_notes ?? "");
      const { data } = await supabase
        .from("evaluation_scores")
        .select("criterion_id, score")
        .eq("evaluation_id", openEval.id);
      const map: Record<string, number> = {};
      (data ?? []).forEach((s: any) => { map[s.criterion_id] = tenToStars(Number(s.score)); });
      setStarScores(map);
    };
    fetch();
  }, [openId, openEval]);

  const closeModal = () => setOpenId(null);

  const disciplineStars = useMemo(() => {
    if (!openId) return 5;
    const w = infractionWeightByEmp[openId] ?? 0;
    return Math.max(0, 5 - w * 0.5);
  }, [openId, infractionWeightByEmp]);

  const previewStars = useMemo(() => {
    let sw = 0, w = 0;
    criteria.forEach((c) => {
      const s = starScores[c.id];
      if (s != null) { sw += s * Number(c.weight); w += Number(c.weight); }
    });
    sw += disciplineStars * DISCIPLINE_WEIGHT;
    w += DISCIPLINE_WEIGHT;
    return w > 0 ? Math.round((sw / w) * 10) / 10 : null;
  }, [starScores, criteria, disciplineStars]);

  const save = async (finalize: boolean) => {
    if (!openEmployee || !selectedCycleId) return;
    if (criteria.length === 0) {
      toast({ title: "Cadastre critérios primeiro", variant: "destructive" }); return;
    }
    const entries: { criterion_id: string; score: number }[] = [];
    for (const c of criteria) {
      const stars = starScores[c.id];
      if (stars == null) continue;
      entries.push({ criterion_id: c.id, score: starsToTen(stars) });
    }
    if (finalize && entries.length !== criteria.length) {
      toast({ title: "Notas incompletas", description: "Para finalizar, avalie todos os critérios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    let evalId = openEval?.id;
    if (!evalId) {
      const { data, error } = await supabase
        .from("evaluations")
        .insert({
          cycle_id: selectedCycleId,
          employee_id: openEmployee.id,
          general_notes: notes || null,
          status: finalize ? "finalized" : "draft",
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error || !data) {
        setSaving(false);
        toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
        return;
      }
      evalId = data.id;
    } else {
      const { error } = await supabase
        .from("evaluations")
        .update({
          general_notes: notes || null,
          status: finalize ? "finalized" : openEval!.status,
        })
        .eq("id", evalId);
      if (error) {
        setSaving(false);
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    }
    await supabase.from("evaluation_scores").delete().eq("evaluation_id", evalId!);
    if (entries.length) {
      const { error: insErr } = await supabase
        .from("evaluation_scores")
        .insert(entries.map((e) => ({ ...e, evaluation_id: evalId! })));
      if (insErr) {
        setSaving(false);
        toast({ title: "Erro nas notas", description: insErr.message, variant: "destructive" });
        return;
      }
    }
    setSaving(false);
    toast({ title: finalize ? "Avaliação finalizada" : "Avaliação salva" });
    closeModal();
    load();
  };

  // Modal de gráficos
  const [chartsId, setChartsId] = useState<string | null>(null);
  const chartsEmployee = useMemo(() => employees.find((e) => e.id === chartsId) ?? null, [employees, chartsId]);

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
          Avaliação por estrelas (1 a 5, com meias). O critério "Disciplina" desconta automaticamente 0,5★ por ponto de infração no ciclo.
        </p>
      </div>

      {!selectedCycleId ? (
        <div className="text-center text-muted-foreground py-8">Selecione um ciclo para começar.</div>
      ) : loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : employees.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum colaborador ativo encontrado.</div>
      ) : criteria.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          Cadastre ao menos um critério ativo na aba "Critérios" para iniciar as avaliações.
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {employees.map((e) => {
              const ev = evaluations.find((x) => x.employee_id === e.id);
              const w = infractionWeightByEmp[e.id] ?? 0;
              const stars = adjustedStars(e.id, ev?.final_score != null ? Number(ev.final_score) : null);
              return (
                <div key={e.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left font-medium text-sm hover:underline min-w-0"
                      onClick={() => setChartsId(e.id)}
                    >
                      {e.full_name}
                    </button>
                    {ev ? (
                      <Badge variant={ev.status === "finalized" ? "default" : "secondary"} className="shrink-0">
                        {ev.status === "finalized" ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" /> Finalizada</>
                        ) : "Rascunho"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">Pendente</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.position ?? "—"} · {e.contracting_store?.name ?? "—"}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">Nota final</div>
                      {stars != null ? (
                        <div className="flex items-center gap-2">
                          <StarRating value={stars} readOnly size={14} />
                          <span className="text-muted-foreground">{stars.toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                  const stars = adjustedStars(e.id, ev?.final_score != null ? Number(ev.final_score) : null);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        <button
                          className="text-left hover:underline"
                          onClick={() => setChartsId(e.id)}
                        >
                          {e.full_name}
                        </button>
                      </TableCell>
                      <TableCell>{e.position ?? "—"}</TableCell>
                      <TableCell>{e.contracting_store?.name ?? "—"}</TableCell>
                      <TableCell>
                        {stars != null ? (
                          <div className="flex items-center gap-2">
                            <StarRating value={stars} readOnly size={16} />
                            <span className="text-xs text-muted-foreground">{stars.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {w > 0 ? (
                          <Badge variant="destructive">{w.toFixed(1)} pts</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ev ? (
                          <Badge variant={ev.status === "finalized" ? "default" : "secondary"}>
                            {ev.status === "finalized" ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> Finalizada</>
                            ) : "Rascunho"}
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

      {/* Modal de avaliação por estrelas */}
      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliar — {openEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              {cycle?.name} · {openEmployee?.position ?? "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Avaliação por critério (1 a 5 estrelas)</Label>
              {criteria.map((c) => (
                <div key={c.id} className="flex flex-col sm:grid sm:grid-cols-[1fr_auto] sm:items-center gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{c.name} <span className="text-xs text-muted-foreground">(peso {c.weight})</span></div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating
                      value={starScores[c.id] ?? 0}
                      onChange={(v) => setStarScores((prev) => ({ ...prev, [c.id]: v }))}
                    />
                    <span className="text-xs text-muted-foreground w-8">{(starScores[c.id] ?? 0).toFixed(1)}</span>
                  </div>
                </div>
              ))}
              <div className="flex flex-col sm:grid sm:grid-cols-[1fr_auto] sm:items-center gap-2 sm:gap-3 bg-muted/40 p-2 rounded-md">
                <div className="min-w-0">
                  <div className="font-medium">Disciplina <span className="text-xs text-muted-foreground">(automático · peso {DISCIPLINE_WEIGHT})</span></div>
                  <div className="text-xs text-muted-foreground">5★ menos 0,5★ por ponto de infração no ciclo</div>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating value={disciplineStars} readOnly />
                  <span className="text-xs text-muted-foreground w-8">{disciplineStars.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Nota final (média ponderada):</span>
                <div className="flex items-center gap-2">
                  {previewStars != null && <StarRating value={previewStars} readOnly size={18} />}
                  <span className="font-semibold">{previewStars != null ? `${previewStars.toFixed(1)} ★` : "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações gerais</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar rascunho
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Finalizar
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
        disciplinePenaltyPerPoint={PENALTY_PER_POINT_10}
      />
    </div>
  );
}
