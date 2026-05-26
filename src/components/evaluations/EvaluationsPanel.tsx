import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Cycle, Criterion } from "@/pages/Evaluations";

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
  store_id: string;
  contracting_store?: { name: string } | null;
}
interface EvaluationRow {
  id: string;
  cycle_id: string;
  employee_id: string;
  final_score: number | null;
  bonus_amount: number | null;
  bonus_notes: string | null;
  general_notes: string | null;
  status: "draft" | "finalized";
}
interface ScoreRow {
  id?: string;
  criterion_id: string;
  score: number;
}
interface InfractionRow {
  id: string;
  employee_id: string;
  cycle_id: string | null;
  occurred_on: string;
  applied_weight: number;
  infraction_type_id: string;
}
interface InfractionTypeRow {
  id: string;
  name: string;
}
interface PositionBonusRow {
  position: string;
  bonus_amount: number;
}

const money = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EvaluationsPanel({ cycles, criteria, selectedCycleId, onSelectCycle }: Props) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [infractions, setInfractions] = useState<InfractionRow[]>([]);
  const [infractionTypes, setInfractionTypes] = useState<InfractionTypeRow[]>([]);
  const [positionBonuses, setPositionBonuses] = useState<PositionBonusRow[]>([]);
  const [loading, setLoading] = useState(false);

  const cycle = useMemo(() => cycles.find((c) => c.id === selectedCycleId), [cycles, selectedCycleId]);
  const valuePerPoint = Number(cycle?.bonus_value_per_point ?? 0);
  const positionBonusMap = useMemo(
    () => Object.fromEntries(positionBonuses.map((p) => [p.position, Number(p.bonus_amount)])),
    [positionBonuses],
  );

  // Infrações e avaliações de ciclos anteriores no mesmo mês (para desconto acumulado)
  const [priorInfractions, setPriorInfractions] = useState<InfractionRow[]>([]);
  const [priorEvaluations, setPriorEvaluations] = useState<EvaluationRow[]>([]);

  const load = async () => {
    if (!selectedCycleId || !cycle) {
      setEmployees([]); setEvaluations([]); setInfractions([]);
      setPriorInfractions([]); setPriorEvaluations([]);
      return;
    }
    setLoading(true);

    // Janela do mês do ciclo (1º dia do mês até o início do ciclo - 1 dia)
    const cycleStart = new Date(cycle.start_date + "T00:00:00");
    const monthStart = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1);
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    const beforeCycleIso = cycle.start_date; // < start_date

    // Ciclos anteriores no mesmo mês
    const priorCycleIds = cycles
      .filter((c) => c.id !== selectedCycleId && c.start_date >= monthStartIso && c.start_date < beforeCycleIso)
      .map((c) => c.id);

    const priorInfractionsQuery = priorCycleIds.length > 0
      ? supabase
          .from("employee_infractions")
          .select("id, employee_id, cycle_id, occurred_on, applied_weight, infraction_type_id")
          .or(`cycle_id.in.(${priorCycleIds.join(",")}),and(cycle_id.is.null,occurred_on.gte.${monthStartIso},occurred_on.lt.${beforeCycleIso})`)
      : supabase
          .from("employee_infractions")
          .select("id, employee_id, cycle_id, occurred_on, applied_weight, infraction_type_id")
          .is("cycle_id", null)
          .gte("occurred_on", monthStartIso)
          .lt("occurred_on", beforeCycleIso);

    const priorEvalsQuery = priorCycleIds.length > 0
      ? supabase.from("evaluations").select("*").in("cycle_id", priorCycleIds)
      : Promise.resolve({ data: [] as EvaluationRow[] });

    const [
      { data: emps, error: ee },
      { data: evs, error: ev },
      { data: infs },
      { data: itypes },
      { data: pbs },
      { data: priorInfs },
      { data: priorEvs },
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, position, store_id, contracting_store:stores!employees_store_id_fkey(name)")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("evaluations")
        .select("*")
        .eq("cycle_id", selectedCycleId),
      supabase
        .from("employee_infractions")
        .select("id, employee_id, cycle_id, occurred_on, applied_weight, infraction_type_id")
        .or(`cycle_id.eq.${selectedCycleId},and(cycle_id.is.null,occurred_on.gte.${cycle.start_date},occurred_on.lte.${cycle.end_date})`),
      supabase.from("infraction_types").select("id, name"),
      supabase.from("position_bonuses").select("position, bonus_amount"),
      priorInfractionsQuery,
      priorEvalsQuery as any,
    ]);
    if (ee) toast({ title: "Erro", description: ee.message, variant: "destructive" });
    if (ev) toast({ title: "Erro", description: ev.message, variant: "destructive" });
    setEmployees((emps ?? []) as unknown as EmployeeRow[]);
    setEvaluations((evs ?? []) as EvaluationRow[]);
    setInfractions((infs ?? []) as InfractionRow[]);
    setInfractionTypes((itypes ?? []) as InfractionTypeRow[]);
    setPositionBonuses((pbs ?? []) as PositionBonusRow[]);
    setPriorInfractions((priorInfs ?? []) as InfractionRow[]);
    setPriorEvaluations((priorEvs ?? []) as EvaluationRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedCycleId, cycle?.id]);

  const infractionTotals = useMemo(() => {
    const map: Record<string, { totalWeight: number; items: InfractionRow[] }> = {};
    for (const i of infractions) {
      if (!map[i.employee_id]) map[i.employee_id] = { totalWeight: 0, items: [] };
      map[i.employee_id].totalWeight += Number(i.applied_weight);
      map[i.employee_id].items.push(i);
    }
    return map;
  }, [infractions]);

  // Saldo de desconto pendente do mês (pontos anteriores não descontados em ciclos anteriores)
  const carriedDiscount = useMemo(() => {
    const priorWeightByEmp: Record<string, number> = {};
    for (const i of priorInfractions) {
      priorWeightByEmp[i.employee_id] = (priorWeightByEmp[i.employee_id] ?? 0) + Number(i.applied_weight);
    }
    // Quanto já foi descontado em ciclos anteriores (por colaborador)
    const cycleValueMap: Record<string, number> = Object.fromEntries(
      cycles.map((c) => [c.id, Number(c.bonus_value_per_point ?? 0)]),
    );
    const priorWeightByCycle: Record<string, Record<string, number>> = {};
    for (const i of priorInfractions) {
      if (!i.cycle_id) continue;
      priorWeightByCycle[i.cycle_id] = priorWeightByCycle[i.cycle_id] ?? {};
      priorWeightByCycle[i.cycle_id][i.employee_id] =
        (priorWeightByCycle[i.cycle_id][i.employee_id] ?? 0) + Number(i.applied_weight);
    }
    const alreadyDiscountedR$: Record<string, number> = {};
    for (const ev of priorEvaluations) {
      const vpp = cycleValueMap[ev.cycle_id] ?? 0;
      const w = priorWeightByCycle[ev.cycle_id]?.[ev.employee_id] ?? 0;
      const bruto = Number(ev.bonus_amount ?? 0);
      const desc = Math.min(bruto, w * vpp);
      alreadyDiscountedR$[ev.employee_id] = (alreadyDiscountedR$[ev.employee_id] ?? 0) + desc;
    }
    // Total devido em R$ no mês até agora (anterior a este ciclo)
    const owedR$: Record<string, number> = {};
    for (const [empId, w] of Object.entries(priorWeightByEmp)) {
      owedR$[empId] = w * valuePerPoint;
    }
    // Saldo = devido - já descontado (mínimo zero)
    const carry: Record<string, number> = {};
    const empIds = new Set([...Object.keys(owedR$), ...Object.keys(alreadyDiscountedR$)]);
    for (const id of empIds) {
      carry[id] = Math.max(0, (owedR$[id] ?? 0) - (alreadyDiscountedR$[id] ?? 0));
    }
    return carry;
  }, [priorInfractions, priorEvaluations, cycles, valuePerPoint]);

  const typeMap = useMemo(() => Object.fromEntries(infractionTypes.map((t) => [t.id, t.name])), [infractionTypes]);

  // Modal
  const [openId, setOpenId] = useState<string | null>(null);
  const openEmployee = useMemo(() => employees.find((e) => e.id === openId) ?? null, [employees, openId]);
  const openEval = useMemo(
    () => evaluations.find((e) => e.employee_id === openId) ?? null,
    [evaluations, openId]
  );
  const [scores, setScores] = useState<Record<string, string>>({});
  const [bonus, setBonus] = useState("0");
  const [bonusNotes, setBonusNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchScores = async () => {
      if (!openId) {
        setScores({}); setBonus("0"); setBonusNotes(""); setGeneralNotes("");
        return;
      }
      if (!openEval) {
        // Avaliação nova: pré-preenche bônus pelo cargo
        const pos = openEmployee?.position?.trim() ?? "";
        const suggested = pos && positionBonusMap[pos] != null ? positionBonusMap[pos] : 0;
        setScores({});
        setBonus(String(suggested));
        setBonusNotes(suggested > 0 ? `Bônus padrão do cargo "${pos}"` : "");
        setGeneralNotes("");
        return;
      }
      setBonus(String(openEval.bonus_amount ?? 0));
      setBonusNotes(openEval.bonus_notes ?? "");
      setGeneralNotes(openEval.general_notes ?? "");
      const { data } = await supabase
        .from("evaluation_scores")
        .select("criterion_id, score")
        .eq("evaluation_id", openEval.id);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => { map[s.criterion_id] = String(s.score); });
      setScores(map);
    };
    fetchScores();
  }, [openId, openEval, openEmployee, positionBonusMap]);

  const closeModal = () => setOpenId(null);

  // Critérios manuais (excluem os auto-calculados pelo banco, ex.: Disciplina)
  const manualCriteria = useMemo(() => criteria.filter((c) => !c.is_auto), [criteria]);

  const previewScore = useMemo(() => {
    let sw = 0, w = 0;
    manualCriteria.forEach((c) => {
      const s = Number(scores[c.id]);
      if (!isNaN(s)) { sw += s * Number(c.weight); w += Number(c.weight); }
    });
    return w > 0 ? Math.round((sw / w) * 100) / 100 : null;
  }, [scores, manualCriteria]);

  // A nota mostrada na tabela já vem do banco (final_score), que inclui Disciplina via trigger.
  const adjustedScoreFor = (_employeeId: string, baseFinal: number | null): number | null => baseFinal;

  const save = async (finalize: boolean) => {
    if (!openEmployee || !selectedCycleId) return;
    if (manualCriteria.length === 0) {
      toast({ title: "Cadastre critérios primeiro", variant: "destructive" }); return;
    }
    // Valida notas
    const entries: { criterion_id: string; score: number }[] = [];
    for (const c of manualCriteria) {
      const raw = scores[c.id];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (isNaN(n) || n < 0 || n > 10) {
        toast({ title: "Nota inválida", description: `${c.name}: use valores entre 0 e 10`, variant: "destructive" });
        return;
      }
      entries.push({ criterion_id: c.id, score: n });
    }
    if (finalize && entries.length !== manualCriteria.length) {
      toast({ title: "Notas incompletas", description: "Para finalizar, preencha todos os critérios.", variant: "destructive" });
      return;
    }
    const bonusVal = Number(bonus);
    if (isNaN(bonusVal) || bonusVal < 0) {
      toast({ title: "Bônus inválido", variant: "destructive" }); return;
    }
    setSaving(true);

    let evalId = openEval?.id;
    if (!evalId) {
      const { data, error } = await supabase
        .from("evaluations")
        .insert({
          cycle_id: selectedCycleId,
          employee_id: openEmployee.id,
          bonus_amount: bonusVal,
          bonus_notes: bonusNotes || null,
          general_notes: generalNotes || null,
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
          bonus_amount: bonusVal,
          bonus_notes: bonusNotes || null,
          general_notes: generalNotes || null,
          status: finalize ? "finalized" : openEval!.status,
        })
        .eq("id", evalId);
      if (error) {
        setSaving(false);
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    }

    // Sincroniza notas manuais (preserva os scores auto-calculados pelo banco)
    const manualIds = manualCriteria.map((c) => c.id);
    if (manualIds.length > 0) {
      await supabase
        .from("evaluation_scores")
        .delete()
        .eq("evaluation_id", evalId!)
        .in("criterion_id", manualIds);
    }
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

  const totals = useMemo(() => {
    let bruto = 0, desconto = 0;
    evaluations.forEach((e) => {
      const b = Number(e.bonus_amount ?? 0);
      const w = infractionTotals[e.employee_id]?.totalWeight ?? 0;
      const carry = carriedDiscount[e.employee_id] ?? 0;
      const d = Math.min(b, w * valuePerPoint + carry);
      bruto += b;
      desconto += d;
    });
    return { bruto, desconto, liquido: bruto - desconto };
  }, [evaluations, infractionTotals, valuePerPoint, carriedDiscount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-2 min-w-[260px]">
          <Label>Ciclo</Label>
          <Select value={selectedCycleId} onValueChange={onSelectCycle}>
            <SelectTrigger><SelectValue placeholder="Selecione um ciclo" /></SelectTrigger>
            <SelectContent>
              {cycles.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum ciclo</div>}
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.status === "closed" ? "(fechado)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cycle && (
          <div className="text-sm text-muted-foreground space-y-1 text-right">
            <div>Bônus bruto do ciclo: <span className="font-medium text-foreground">{money(totals.bruto)}</span></div>
            <div>Descontos por infrações: <span className="font-medium text-destructive">- {money(totals.desconto)}</span></div>
            <div>Total líquido a pagar: <span className="font-semibold text-foreground">{money(totals.liquido)}</span></div>
            <div className="text-xs">R$ {valuePerPoint.toFixed(2)} por ponto de infração</div>
          </div>
        )}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead className="w-24">Nota</TableHead>
              <TableHead className="w-28">Infrações</TableHead>
              <TableHead className="w-32">Bônus bruto</TableHead>
              <TableHead className="w-32">Bônus líquido</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => {
              const ev = evaluations.find((x) => x.employee_id === e.id);
              const inf = infractionTotals[e.id];
              const totalWeight = inf?.totalWeight ?? 0;
              const carry = carriedDiscount[e.id] ?? 0;
              const bruto = Number(ev?.bonus_amount ?? 0);
              const descontoSemana = totalWeight * valuePerPoint;
              const desconto = Math.min(bruto, descontoSemana + carry);
              const liquido = bruto - desconto;
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.full_name}</TableCell>
                  <TableCell>{e.position ?? "—"}</TableCell>
                  <TableCell>{e.contracting_store?.name ?? "—"}</TableCell>
                  <TableCell>
                    {(() => {
                      const adj = adjustedScoreFor(e.id, ev?.final_score != null ? Number(ev.final_score) : null);
                      if (adj == null) return "—";
                      const base = ev?.final_score != null ? Number(ev.final_score) : null;
                      return (
                        <span>
                          {adj.toFixed(2)}
                          {base != null && Math.abs(adj - base) > 0.01 && (
                            <span className="block text-xs text-muted-foreground">base {base.toFixed(2)}</span>
                          )}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {totalWeight > 0 ? (
                      <Badge variant="destructive">{totalWeight.toFixed(1)} pts</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {carry > 0 && (
                      <div className="text-xs text-destructive mt-1">+ {money(carry)} pendente</div>
                    )}
                  </TableCell>
                  <TableCell>{ev ? money(bruto) : "—"}</TableCell>
                  <TableCell className="font-medium">
                    {ev ? (
                      <span className={desconto > 0 ? "text-foreground" : ""}>
                        {money(liquido)}
                        {desconto > 0 && (
                          <span className="block text-xs text-destructive">- {money(desconto)}</span>
                        )}
                      </span>
                    ) : "—"}
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Avaliar — {openEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              {cycle?.name} · {openEmployee?.position ?? "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Notas por critério (0 a 10)</Label>
              {manualCriteria.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_120px] items-center gap-3">
                  <div>
                    <div className="font-medium">{c.name} <span className="text-xs text-muted-foreground">(peso {c.weight})</span></div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step="0.1"
                    value={scores[c.id] ?? ""}
                    onChange={(e) => setScores((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="—"
                  />
                </div>
              ))}
              <div className="grid grid-cols-[1fr_120px] items-center gap-3 bg-muted/40 p-2 rounded-md">
                <div>
                  <div className="font-medium">Disciplina <span className="text-xs text-muted-foreground">(automático)</span></div>
                  <div className="text-xs text-muted-foreground">
                    Calculado pelo sistema com base nas infrações do período do ciclo, comparado aos demais colaboradores.
                  </div>
                </div>
                <div className="h-10 px-3 flex items-center rounded-md border bg-background font-semibold text-muted-foreground">
                  auto
                </div>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Prévia da nota (apenas critérios manuais):</span>
                <span className="font-semibold">{previewScore != null ? previewScore.toFixed(2) : "—"}</span>
              </div>
            </div>

            {openId && (() => {
              const inf = infractionTotals[openId];
              const totalWeight = inf?.totalWeight ?? 0;
              const carry = carriedDiscount[openId] ?? 0;
              const bruto = Number(bonus) || 0;
              const descontoSemana = totalWeight * valuePerPoint;
              const desconto = Math.min(bruto, descontoSemana + carry);
              return (
                <div className="border-t pt-3 space-y-2">
                  <Label className="text-sm font-semibold">Infrações no período</Label>
                  {totalWeight === 0 && carry === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma infração registrada para este colaborador no ciclo.</p>
                  ) : (
                    <div className="space-y-1 text-sm">
                      {(inf?.items ?? []).map((i) => (
                        <div key={i.id} className="flex justify-between text-muted-foreground">
                          <span>{typeMap[i.infraction_type_id] ?? "—"} ({i.occurred_on})</span>
                          <span className="font-mono">peso {Number(i.applied_weight).toFixed(1)}</span>
                        </div>
                      ))}
                      {totalWeight > 0 && (
                        <>
                          <div className="flex justify-between border-t pt-1">
                            <span>Total de pontos da semana</span>
                            <span className="font-semibold">{totalWeight.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between text-destructive">
                            <span>Desconto da semana ({totalWeight.toFixed(1)} × R$ {valuePerPoint.toFixed(2)})</span>
                            <span className="font-semibold">- {money(descontoSemana)}</span>
                          </div>
                        </>
                      )}
                      {carry > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>Desconto pendente de semanas anteriores</span>
                          <span className="font-semibold">- {money(carry)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 text-destructive">
                        <span>Desconto aplicado neste ciclo</span>
                        <span className="font-semibold">- {money(desconto)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="border-t pt-3 space-y-3">
              <Label className="text-sm font-semibold">Bonificação</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor bruto (R$)</Label>
                  <Input type="number" min="0" step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} />
                </div>
                {(() => {
                  const totalWeight = infractionTotals[openId ?? ""]?.totalWeight ?? 0;
                  const carry = carriedDiscount[openId ?? ""] ?? 0;
                  const bruto = Number(bonus) || 0;
                  const desconto = Math.min(bruto, totalWeight * valuePerPoint + carry);
                  const liquido = bruto - desconto;
                  return (
                    <div className="space-y-2">
                      <Label>Bônus líquido a pagar</Label>
                      <div className="h-10 px-3 flex items-center rounded-md border bg-muted font-semibold">
                        {money(liquido)}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label>Justificativa do bônus</Label>
                <Textarea value={bonusNotes} onChange={(e) => setBonusNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações gerais</Label>
              <Textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar rascunho
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
