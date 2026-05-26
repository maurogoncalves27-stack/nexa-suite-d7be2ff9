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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, AlertTriangle, ShieldAlert, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Cycle } from "@/pages/Evaluations";
import type { InfractionType } from "./InfractionTypesPanel";
import { severityBadgeClass, severityLabel, severityTileClass } from "@/lib/severity";

interface EmployeeRow {
  id: string;
  full_name: string;
  store_id: string;
}
interface InfractionRow {
  id: string;
  employee_id: string;
  infraction_type_id: string;
  cycle_id: string | null;
  occurred_on: string;
  applied_weight: number;
  notes: string | null;
  suspension_weeks: number;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  suspension_revoked_at: string | null;
}

const fmt = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function InfractionsPanel({ cycles }: { cycles: Cycle[] }) {
  const { user, isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [types, setTypes] = useState<InfractionType[]>([]);
  const [items, setItems] = useState<InfractionRow[]>([]);
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [suspensionWeeks, setSuspensionWeeks] = useState<string>("4");
  const [occurredOn, setOccurredOn] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    const [{ data: emps }, { data: tps }, { data: infs, error }] = await Promise.all([
      supabase.from("employees").select("id, full_name, store_id").eq("status", "active").order("full_name"),
      supabase.from("infraction_types").select("*").order("name"),
      supabase.from("employee_infractions").select("*").order("occurred_on", { ascending: false }),
    ]);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setEmployees((emps ?? []) as EmployeeRow[]);
    setTypes((tps ?? []) as InfractionType[]);
    setItems((infs ?? []) as InfractionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const typeMap = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const cycleMap = useMemo(() => Object.fromEntries(cycles.map((c) => [c.id, c])), [cycles]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterCycle !== "all" && (i.cycle_id ?? "none") !== filterCycle) return false;
      if (filterEmployee !== "all" && i.employee_id !== filterEmployee) return false;
      return true;
    });
  }, [items, filterCycle, filterEmployee]);

  const summary = useMemo(() => {
    const map = new Map<string, { employeeId: string; count: number; totalWeight: number; lastDate: string }>();
    for (const i of filtered) {
      const cur = map.get(i.employee_id) ?? { employeeId: i.employee_id, count: 0, totalWeight: 0, lastDate: i.occurred_on };
      cur.count += 1;
      cur.totalWeight += Number(i.applied_weight);
      if (i.occurred_on > cur.lastDate) cur.lastDate = i.occurred_on;
      map.set(i.employee_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalWeight - a.totalWeight);
  }, [filtered]);

  const openNew = () => {
    setEmployeeId("");
    setEmployeeSearch("");
    setNotes("");
    setSelectedTypeIds([]);
    setSuspensionWeeks("4");
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setSaving(false);
    setOpen(true);
  };

  const toggleType = (id: string) => {
    setSelectedTypeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const hasCriticalSelected = useMemo(
    () => selectedTypeIds.some((id) => typeMap[id]?.severity === "critical"),
    [selectedTypeIds, typeMap],
  );

  const save = async () => {
    if (!employeeId) { toast({ title: "Selecione um colaborador", variant: "destructive" }); return; }
    if (selectedTypeIds.length === 0) { toast({ title: "Selecione ao menos uma infração", variant: "destructive" }); return; }
    const weeksNum = Number(suspensionWeeks);
    if (hasCriticalSelected && (!Number.isFinite(weeksNum) || weeksNum <= 0)) {
      toast({ title: "Informe as semanas de suspensão", description: "Infração gravíssima exige um período de suspensão.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const occurred = occurredOn || new Date().toISOString().slice(0, 10);
    const trimmedNotes = notes.trim() || null;
    const rows = selectedTypeIds.map((typeId) => {
      const t = typeMap[typeId];
      const isCritical = t?.severity === "critical";
      const defaultWeeks = Number((t as any)?.default_suspension_weeks ?? 0) || 0;
      const manualWeeks = isCritical ? Math.floor(weeksNum) : 0;
      const weeks = Math.max(defaultWeeks, manualWeeks);
      return {
        employee_id: employeeId,
        infraction_type_id: typeId,
        cycle_id: null,
        occurred_on: occurred,
        applied_weight: t ? Number(t.default_weight) : 1,
        notes: trimmedNotes,
        created_by: user?.id ?? null,
        suspension_weeks: weeks,
      };
    });
    const { error } = await supabase.from("employee_infractions").insert(rows);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: rows.length > 1 ? `${rows.length} infrações registradas` : "Infração registrada" });
    setOpen(false);
    load();
  };

  const remove = async (it: InfractionRow) => {
    if (!confirm("Excluir esta ocorrência?")) return;
    const { error } = await supabase.from("employee_infractions").delete().eq("id", it.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ocorrência excluída" });
    load();
  };

  const revokeSuspension = async (it: InfractionRow) => {
    const reason = prompt("Motivo da revogação da suspensão (opcional):") ?? "";
    const { error } = await supabase
      .from("employee_infractions")
      .update({
        suspension_revoked_at: new Date().toISOString(),
        suspension_revoked_by: user?.id ?? null,
        suspension_revoke_reason: reason.trim() || null,
      })
      .eq("id", it.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Suspensão revogada" });
    load();
  };

  const activeTypes = types.filter((t) => t.is_active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2 min-w-[200px]">
            <Label>Filtrar por ciclo</Label>
            <Select value={filterCycle} onValueChange={setFilterCycle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="none">Sem ciclo</SelectItem>
                {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-[220px]">
            <Label>Filtrar por colaborador</Label>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Registrar infração</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar infração</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Colaborador*</Label>
                <Input
                  type="search"
                  value={employeeSearch}
                  onChange={(e) => { setEmployeeSearch(e.target.value); setEmployeeId(""); }}
                  placeholder="Pesquisar pelo nome..."
                  autoFocus
                />
                {employeeSearch.trim() && !employeeId && (
                  <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                    {employees
                      .filter((e) => e.full_name.toLowerCase().includes(employeeSearch.trim().toLowerCase()))
                      .slice(0, 20)
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => { setEmployeeId(e.id); setEmployeeSearch(e.full_name); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        >
                          {e.full_name}
                        </button>
                      ))}
                    {employees.filter((e) => e.full_name.toLowerCase().includes(employeeSearch.trim().toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>
                    )}
                  </div>
                )}
                {employeeId && (
                  <p className="text-xs text-primary">Selecionado: {empMap[employeeId]?.full_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Tipo de infração*</Label>
                {activeTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma infração ativa cadastrada.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {activeTypes.map((t) => {
                      const selected = selectedTypeIds.includes(t.id);
                      const disabled = !employeeId || saving;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleType(t.id)}
                          className={[
                            "flex items-center justify-center rounded-lg border-2 px-3 py-4 text-center transition-all",
                            "hover:shadow-md hover:-translate-y-0.5 font-semibold",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none",
                            severityTileClass(t.severity, selected),
                          ].join(" ")}
                        >
                          <span className="font-semibold text-sm leading-tight">{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Selecione uma ou mais infrações e clique em Salvar.
                </p>
              </div>

              {hasCriticalSelected && (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <Label className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-4 w-4" /> Suspensão da bonificação*
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={suspensionWeeks}
                      onChange={(e) => setSuspensionWeeks(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">semana(s)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por se tratar de infração gravíssima, o colaborador ficará suspenso de receber bonificação durante este período (a partir de hoje).
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Detalhes da ocorrência (opcional)"
                />
              </div>
            </div>
            <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="infraction-occurred-on" className="text-xs whitespace-nowrap">Data</Label>
                <Input
                  id="infraction-occurred-on"
                  type="date"
                  value={occurredOn}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className="h-9 w-[150px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving || !employeeId || selectedTypeIds.length === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
          <AlertTriangle className="h-8 w-8 opacity-50" />
          Nenhuma infração registrada.
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Resumo por colaborador</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="w-32">Ocorrências</TableHead>
                  <TableHead className="w-32">Total de pontos</TableHead>
                  <TableHead className="w-40">Última infração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => (
                  <TableRow key={s.employeeId}>
                    <TableCell className="font-medium">{empMap[s.employeeId]?.full_name ?? "—"}</TableCell>
                    <TableCell>{s.count}</TableCell>
                    <TableCell className="font-semibold text-destructive">{s.totalWeight.toFixed(1)}</TableCell>
                    <TableCell>{fmt(s.lastDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Ocorrências detalhadas</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Infração</TableHead>
                  <TableHead className="w-32">Gravidade</TableHead>
                  <TableHead className="w-48">Suspensão</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((it) => {
                  const t = typeMap[it.infraction_type_id];
                  const today = new Date().toISOString().slice(0, 10);
                  const isActiveSusp =
                    it.suspension_weeks > 0 &&
                    !it.suspension_revoked_at &&
                    it.suspension_end_date != null &&
                    it.suspension_end_date >= today;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{fmt(it.occurred_on)}</TableCell>
                      <TableCell className="font-medium">{empMap[it.employee_id]?.full_name ?? "—"}</TableCell>
                      <TableCell>{t?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={severityBadgeClass(t?.severity)}>{severityLabel(t?.severity)}</Badge>
                      </TableCell>
                      <TableCell>
                        {it.suspension_weeks > 0 ? (
                          it.suspension_revoked_at ? (
                            <span className="text-xs text-muted-foreground">Revogada</span>
                          ) : isActiveSusp ? (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="h-3 w-3" />
                              até {fmt(it.suspension_end_date!)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Encerrada em {fmt(it.suspension_end_date!)}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[280px] truncate">{it.notes ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {isActiveSusp && (
                          <Button variant="ghost" size="icon" onClick={() => revokeSuspension(it)} title="Revogar suspensão">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => remove(it)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
