import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Scope = "national" | "state" | "municipal" | "store";

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  scope: Scope;
  store_id: string | null;
  notes: string | null;
}

interface Store { id: string; name: string }
interface Employee {
  id: string;
  full_name: string;
  position: string | null;
  store_id: string | null;
  exempt_from_timeclock: boolean | null;
  work_schedule: string | null;
}

/**
 * Colaboradores cujo feriado trabalhado NÃO deve incidir na folha:
 * - Escala 12x36 (já compensa nos 36h de folga)
 * - Supervisores (ponto é só controle interno)
 * Continuam aparecendo na lista para marcação manual, mas não entram no auto-sync
 * e marcações existentes são removidas.
 */
function isPayrollExempt(e: Pick<Employee, "position" | "work_schedule">): boolean {
  const sched = (e.work_schedule ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (sched === "12x36") return true;
  const pos = (e.position ?? "").toLowerCase();
  if (pos.includes("supervisor")) return true;
  return false;
}

const SCOPE_LABEL: Record<Scope, string> = {
  national: "Nacional",
  state: "Estadual",
  municipal: "Municipal",
  store: "Loja",
};

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export default function HolidaysWorked() {
  const today = new Date();
  // Padrão: mês anterior (folha do mês passado é a que será gerada)
  const initialMonth = today.getMonth() === 0 ? 12 : today.getMonth();
  const initialYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [namesByHoliday, setNamesByHoliday] = useState<Record<string, string[]>>({});
  const [year, setYear] = useState<number>(initialYear);
  const [month, setMonth] = useState<number>(initialMonth);
  const [approved, setApproved] = useState<boolean>(false);
  const [savingApproval, setSavingApproval] = useState(false);

  // Novo feriado
  const [openNew, setOpenNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [fDate, setFDate] = useState("");
  const [fName, setFName] = useState("");
  const [fScope, setFScope] = useState<Scope>("national");
  const [fStore, setFStore] = useState<string>("");

  // Dialog colaboradores
  const [manageHoliday, setManageHoliday] = useState<Holiday | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [punched, setPunched] = useState<Set<string>>(new Set());
  const [savingMarks, setSavingMarks] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const [hRes, sRes, eRes, wRes, aRes] = await Promise.all([
      supabase.from("holidays")
        .select("id, holiday_date, name, scope, store_id, notes")
        .gte("holiday_date", start)
        .lte("holiday_date", end)
        .order("holiday_date"),
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
      supabase.from("employees")
        .select("id, full_name, position, store_id, exempt_from_timeclock, work_schedule")
        .eq("status", "active")
        .order("full_name"),
      (supabase as any).from("payroll_holiday_worked").select("holiday_id, employee_id"),
      (supabase as any).from("payroll_holiday_worked_review")
        .select("id")
        .eq("reference_year", year)
        .eq("reference_month", month)
        .maybeSingle(),
    ]);
    if (hRes.error) toast({ title: "Erro ao carregar feriados", description: hRes.error.message, variant: "destructive" });
    const holidaysList = (hRes.data ?? []) as Holiday[];
    const employeesList = (eRes.data ?? []) as Employee[];
    setStores((sRes.data ?? []) as Store[]);
    setEmployees(employeesList);
    setApproved(!!aRes.data);
    setHolidays(holidaysList);

    let workedRows = ((wRes.data ?? []) as Array<{ holiday_id: string; employee_id: string }>);
    const empById = new Map(employeesList.map((e) => [e.id, e]));

    // Remove marcações de quem é isento de folha (12x36 / supervisores)
    if (holidaysList.length > 0) {
      const holidayIds = new Set(holidaysList.map((h) => h.id));
      const toDelete = workedRows.filter((r) => {
        if (!holidayIds.has(r.holiday_id)) return false;
        const emp = empById.get(r.employee_id);
        return emp ? isPayrollExempt(emp) : false;
      });
      if (toDelete.length > 0) {
        for (const r of toDelete) {
          await (supabase as any)
            .from("payroll_holiday_worked")
            .delete()
            .eq("holiday_id", r.holiday_id)
            .eq("employee_id", r.employee_id);
        }
        const removed = new Set(toDelete.map((r) => `${r.holiday_id}:${r.employee_id}`));
        workedRows = workedRows.filter((r) => !removed.has(`${r.holiday_id}:${r.employee_id}`));
      }
    }

    // Auto-sync: para cada feriado do mês, marcar quem bateu ponto e ainda não está marcado
    if (holidaysList.length > 0) {
      const punchRes = await supabase
        .from("time_clock_entries")
        .select("employee_id, reference_date")
        .in("reference_date", holidaysList.map((h) => h.holiday_date));
      const punchedByDate = new Map<string, Set<string>>();
      ((punchRes.data ?? []) as Array<{ employee_id: string; reference_date: string }>).forEach((r) => {
        if (!punchedByDate.has(r.reference_date)) punchedByDate.set(r.reference_date, new Set());
        punchedByDate.get(r.reference_date)!.add(r.employee_id);
      });
      const existing = new Set(workedRows.map((r) => `${r.holiday_id}:${r.employee_id}`));
      const toInsert: Array<{ employee_id: string; holiday_id: string; reference_year: number; reference_month: number }> = [];
      for (const h of holidaysList) {
        const punched = punchedByDate.get(h.holiday_date);
        if (!punched) continue;
        // Se feriado é por loja, só conta quem é da loja
        let candidates = h.scope === "store" && h.store_id
          ? Array.from(punched).filter((eid) => empById.get(eid)?.store_id === h.store_id)
          : Array.from(punched);
        // Exclui isentos de folha
        candidates = candidates.filter((eid) => {
          const emp = empById.get(eid);
          return emp ? !isPayrollExempt(emp) : false;
        });
        for (const eid of candidates) {
          if (!existing.has(`${h.id}:${eid}`)) {
            const [y, m] = h.holiday_date.split("-");
            toInsert.push({ employee_id: eid, holiday_id: h.id, reference_year: Number(y), reference_month: Number(m) });
          }
        }
      }
      if (toInsert.length > 0) {
        const { error: insErr } = await (supabase as any).from("payroll_holiday_worked").insert(toInsert);
        if (!insErr) {
          workedRows = [...workedRows, ...toInsert.map((r) => ({ holiday_id: r.holiday_id, employee_id: r.employee_id }))];
        }
      }
    }

    const empMap = new Map(employeesList.map((e) => [e.id, e.full_name]));
    const grouped: Record<string, string[]> = {};
    workedRows.forEach((r) => {
      const name = empMap.get(r.employee_id);
      if (!name) return;
      if (!grouped[r.holiday_id]) grouped[r.holiday_id] = [];
      if (!grouped[r.holiday_id].includes(name)) grouped[r.holiday_id].push(name);
    });
    Object.values(grouped).forEach((arr) => arr.sort());
    setNamesByHoliday(grouped);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year, month]);

  function resetNew() {
    setFDate(""); setFName(""); setFScope("national"); setFStore("");
  }

  async function handleSaveNew() {
    if (!fDate) return toast({ title: "Informe a data", variant: "destructive" });
    if (!fName.trim()) return toast({ title: "Informe o nome do feriado", variant: "destructive" });
    if (fScope === "store" && !fStore) return toast({ title: "Selecione a loja", variant: "destructive" });
    setSavingNew(true);
    const { error } = await supabase.from("holidays").insert({
      holiday_date: fDate,
      name: fName.trim(),
      scope: fScope,
      store_id: fScope === "store" ? fStore : null,
    });
    setSavingNew(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Feriado adicionado" });
    setOpenNew(false);
    resetNew();
    // Aprovação invalidada se incluir mês atual
    if (approved && fDate.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
      await (supabase as any)
        .from("payroll_holiday_worked_review")
        .delete()
        .eq("reference_year", year)
        .eq("reference_month", month);
    }
    load();
  }

  async function handleDeleteHoliday(id: string) {
    if (!confirm("Remover este feriado? As marcações de colaboradores também serão apagadas.")) return;
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Feriado removido" });
    load();
  }

  async function openManage(h: Holiday) {
    setManageHoliday(h);
    setSearch("");
    setPunched(new Set());
    const [wRes, pRes] = await Promise.all([
      (supabase as any)
        .from("payroll_holiday_worked")
        .select("employee_id")
        .eq("holiday_id", h.id),
      supabase
        .from("time_clock_entries")
        .select("employee_id")
        .eq("reference_date", h.holiday_date),
    ]);
    if (wRes.error) {
      toast({ title: "Erro ao carregar marcações", description: wRes.error.message, variant: "destructive" });
      setMarked(new Set());
      return;
    }
    const existing = new Set(((wRes.data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id));
    const punchedSet = new Set(((pRes.data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id));
    setPunched(punchedSet);
    // Auto-marca quem bateu ponto e ainda não estava marcado (exceto isentos de folha)
    const merged = new Set(existing);
    const empById = new Map(employees.map((e) => [e.id, e]));
    punchedSet.forEach((id) => {
      const emp = empById.get(id);
      if (emp && isPayrollExempt(emp)) return;
      merged.add(id);
    });
    setMarked(merged);
  }

  const filteredEmployees = useMemo(() => {
    if (!manageHoliday) return [];
    let list = employees;
    if (manageHoliday.scope === "store" && manageHoliday.store_id) {
      list = list.filter((e) => e.store_id === manageHoliday.store_id);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.full_name.toLowerCase().includes(q));
    }
    return list;
  }, [employees, manageHoliday, search]);

  const toggleEmp = (id: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function saveMarks() {
    if (!manageHoliday) return;
    const h = manageHoliday;
    const [y, m] = h.holiday_date.split("-");
    const refYear = Number(y);
    const refMonth = Number(m);
    setSavingMarks(true);
    try {
      // Apaga apenas registros desse feriado
      const { error: delErr } = await (supabase as any)
        .from("payroll_holiday_worked")
        .delete()
        .eq("holiday_id", h.id);
      if (delErr) throw delErr;

      if (marked.size > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const rows = Array.from(marked).map((employee_id) => ({
          employee_id,
          holiday_id: h.id,
          reference_year: refYear,
          reference_month: refMonth,
          created_by: user?.id ?? null,
        }));
        const { error: insErr } = await (supabase as any)
          .from("payroll_holiday_worked")
          .insert(rows);
        if (insErr) throw insErr;
      }
      // Invalida aprovação do mês ao mexer nas marcações
      await (supabase as any)
        .from("payroll_holiday_worked_review")
        .delete()
        .eq("reference_year", refYear)
        .eq("reference_month", refMonth);
      toast({
        title: "Salvo",
        description: `${marked.size} colaborador(es) marcado(s) para ${h.name}.`,
      });
      setManageHoliday(null);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingMarks(false);
    }
  }

  async function handleApprove() {
    setSavingApproval(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("payroll_holiday_worked_review")
        .insert({
          reference_year: year,
          reference_month: month,
          approved_by: user?.id ?? null,
        });
      if (error) throw error;
      setApproved(true);
      toast({
        title: "Feriados aprovados",
        description: `Já é possível gerar a folha de ${MONTHS[month - 1]}/${year}.`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingApproval(false);
    }
  }

  const years = [year - 1, year, year + 1];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Feriados trabalhados
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Marque os colaboradores que trabalharam em cada feriado. <strong>É obrigatório aprovar antes de gerar a folha do mês.</strong>
        </p>
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Feriados de {MONTHS[month - 1]}/{year}
              {approved && (
                <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Aprovado
                </Badge>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Mês anterior"
                  onClick={() => {
                    if (month === 1) { setMonth(12); setYear(year - 1); }
                    else setMonth(month - 1);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="capitalize text-sm font-medium min-w-[140px] text-center px-2">
                  {MONTHS[month - 1]} {year}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Próximo mês"
                  onClick={() => {
                    if (month === 12) { setMonth(1); setYear(year + 1); }
                    else setMonth(month + 1);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (!o) resetNew(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                  <DialogHeader><DialogTitle>Novo feriado</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Data</Label>
                      <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nome</Label>
                      <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ex: Aniversário da cidade" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Abrangência</Label>
                      <Select value={fScope} onValueChange={(v) => setFScope(v as Scope)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="national">Nacional</SelectItem>
                          <SelectItem value="state">Estadual</SelectItem>
                          <SelectItem value="municipal">Municipal</SelectItem>
                          <SelectItem value="store">Específico de uma loja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {fScope === "store" && (
                      <div className="space-y-1.5">
                        <Label>Loja</Label>
                        <Select value={fStore} onValueChange={setFStore}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenNew(false)} disabled={savingNew}>Cancelar</Button>
                    <Button onClick={handleSaveNew} disabled={savingNew}>
                      {savingNew && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {!approved ? (
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={savingApproval || loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                >
                  {savingApproval ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar feriados deste mês
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum feriado em {MONTHS[month - 1]}/{year}.</p>
          ) : (
            <ul className="divide-y">
              {holidays.map((h) => {
                const storeName = h.store_id ? stores.find((s) => s.id === h.store_id)?.name : null;
                const names = namesByHoliday[h.id] ?? [];
                return (
                  <li key={h.id} className="flex flex-col sm:flex-row sm:items-start gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{fmtDate(h.holiday_date)}</span>
                        <Badge variant="outline" className="text-xs">{SCOPE_LABEL[h.scope]}</Badge>
                        {storeName && <Badge variant="secondary" className="text-xs">{storeName}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{h.name}</p>
                      {names.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {names.map((n) => (
                            <Badge
                              key={n}
                              variant="secondary"
                              className="text-[11px] font-normal bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                            >
                              {n}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">Ninguém marcado.</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openManage(h)}
                        className="gap-1"
                      >
                        <Users className="h-4 w-4" />
                        Inserção manual
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteHoliday(h.id)} title="Remover">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!manageHoliday} onOpenChange={(o) => { if (!o) setManageHoliday(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Quem trabalhou neste feriado
            </DialogTitle>
            <DialogDescription className="text-xs">
              {manageHoliday && (
                <>
                  <span className="font-medium">{manageHoliday.name}</span> · {fmtDate(manageHoliday.holiday_date)}
                  {manageHoliday.scope === "store" && manageHoliday.store_id && (
                    <> · {stores.find((s) => s.id === manageHoliday.store_id)?.name}</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Buscar colaborador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <div className="text-xs text-muted-foreground">
              {marked.size} marcado(s) de {filteredEmployees.length} listado(s)
              {punched.size > 0 && <> · {punched.size} bateu(ram) ponto neste dia</>}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Colaboradores sem ponto eletrônico precisam ser marcados manualmente.
            </p>
            <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
              {filteredEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum colaborador.</p>
              ) : (
                filteredEmployees.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={marked.has(e.id)}
                      onCheckedChange={() => toggleEmp(e.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {e.full_name}
                        {punched.has(e.id) && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">ponto</Badge>
                        )}
                        {e.exempt_from_timeclock && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">sem ponto</Badge>
                        )}
                        {isPayrollExempt(e) && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-700 dark:text-amber-300">não incide na folha</Badge>
                        )}
                      </div>
                      {e.position && (
                        <div className="text-xs text-muted-foreground truncate">{e.position}</div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setManageHoliday(null)} disabled={savingMarks}>
              Cancelar
            </Button>
            <Button
              onClick={saveMarks}
              disabled={savingMarks}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {savingMarks ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Users className="h-4 w-4 mr-1" />}
              Salvar marcações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
