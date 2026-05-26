import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, Hourglass, Plus, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, CalendarOff } from "lucide-react";
import { addDays, format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface Employee { id: string; full_name: string; store_id: string; allocated_store_id: string | null }
interface Balance {
  employee_id: string;
  total_credit_minutes: number;
  total_debit_minutes: number;
  available_minutes: number;
  net_minutes: number;
  credits_expiring_soon: number;
}
interface Entry {
  id: string;
  employee_id: string;
  reference_date: string;
  entry_type: string;
  minutes: number;
  minutes_remaining: number;
  expires_at: string | null;
  source_kind: string | null;
  notes: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  overtime: "Hora extra",
  late: "Atraso",
  early_leave: "Saída antecipada",
  manual_credit: "Crédito manual",
  manual_debit: "Débito manual",
  expired: "Expirado",
  payout: "Pago em folha",
};

function fmtMin(min: number) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${m.toString().padStart(2, "0")}`;
}

export default function BancoHoras() {
  const { user, isAdmin, isSuperUser } = useAuth();
  const canManage = isAdmin || isSuperUser;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ employee_id: "", kind: "manual_credit", hours: "0", minutes: "0", date: format(new Date(), "yyyy-MM-dd"), notes: "" });

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    const [{ data: sto }, { data: emp }, { data: bal }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id, allocated_store_id").eq("status", "active").order("full_name"),
      supabase.from("hour_bank_balances").select("*"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees((emp ?? []) as Employee[]);
    setBalances((bal ?? []) as Balance[]);
    setLoading(false);
  };

  const reloadBalances = async () => {
    const { data } = await supabase.from("hour_bank_balances").select("*");
    setBalances((data ?? []) as Balance[]);
  };

  const loadEntries = async (employeeId: string) => {
    setSelectedEmp(employeeId);
    const { data } = await supabase
      .from("hour_bank_entries")
      .select("*")
      .eq("employee_id", employeeId)
      .order("reference_date", { ascending: false })
      .limit(500);
    setEntries((data ?? []) as Entry[]);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const balMap = useMemo(() => Object.fromEntries(balances.map((b) => [b.employee_id, b])), [balances]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (storeId !== "all") {
      list = list.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.full_name.toLowerCase().includes(q));
    }
    // Mostra somente quem tem movimento ou se há filtro ativo (mostra todos quando há busca por nome)
    if (!search.trim()) {
      list = list.filter((e) => balMap[e.id]);
    }
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [employees, storeId, search, balMap]);

  /** Sincroniza com Escala × Ponto: cria entradas do mês atual a partir das divergências calculadas. */
  const syncFromScheduleVsPunch = async () => {
    if (!canManage) return;
    setSyncing(true);
    try {
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

      // Carrega escalas e batidas do mês
      const [{ data: sch }, { data: ent }] = await Promise.all([
        supabase
          .from("work_schedules")
          .select("id, employee_id, schedule_date, is_day_off, start_time, end_time")
          .gte("schedule_date", monthStart)
          .lte("schedule_date", monthEnd)
          .limit(10000),
        supabase
          .from("time_clock_entries")
          .select("employee_id, entry_type, entry_at, reference_date")
          .gte("reference_date", monthStart)
          .lte("reference_date", monthEnd)
          .limit(10000),
      ]);

      // Já registrados no banco no período (para evitar duplicidade — temos índice único)
      const { data: existing } = await supabase
        .from("hour_bank_entries")
        .select("employee_id, reference_date, entry_type")
        .gte("reference_date", monthStart)
        .lte("reference_date", monthEnd)
        .eq("source_kind", "auto_schedule_vs_punch");
      const existingSet = new Set((existing ?? []).map((e: any) => `${e.employee_id}|${e.reference_date}|${e.entry_type}`));

      // Indexa batidas por colaborador|data
      const punchByDay = new Map<string, any[]>();
      for (const e of ent ?? []) {
        const k = `${e.employee_id}|${e.reference_date}`;
        if (!punchByDay.has(k)) punchByDay.set(k, []);
        punchByDay.get(k)!.push(e);
      }

      const TOL = 5; // minutos
      const todayStr = format(new Date(), "yyyy-MM-dd");
      let credits = 0, debitsLate = 0, debitsEarly = 0;

      for (const s of (sch ?? []) as any[]) {
        if (s.is_day_off) continue;
        if (s.schedule_date >= todayStr) continue; // só dias passados
        const k = `${s.employee_id}|${s.schedule_date}`;
        const punches = punchByDay.get(k) ?? [];
        const ci = punches.find((p) => p.entry_type === "clock_in");
        const co = [...punches].reverse().find((p) => p.entry_type === "clock_out");

        // Atraso
        if (ci && s.start_time) {
          const expected = new Date(`${s.schedule_date}T${s.start_time.length <= 5 ? s.start_time + ":00" : s.start_time}`);
          const actual = new Date(ci.entry_at);
          const diff = Math.round((actual.getTime() - expected.getTime()) / 60000);
          if (diff > TOL) {
            const key = `${s.employee_id}|${s.schedule_date}|late`;
            if (!existingSet.has(key)) {
              const { error } = await supabase.rpc("hour_bank_apply_debit", {
                p_employee_id: s.employee_id,
                p_minutes: diff,
                p_reference_date: s.schedule_date,
                p_entry_type: "late",
                p_source_kind: "auto_schedule_vs_punch",
                p_source_id: s.id,
                p_notes: `Atraso de ${diff} min`,
                p_created_by: user?.id ?? null,
              });
              if (!error) debitsLate++;
            }
          }
        }

        // Saída antecipada / Hora extra
        if (co && s.end_time) {
          const expected = new Date(`${s.schedule_date}T${s.end_time.length <= 5 ? s.end_time + ":00" : s.end_time}`);
          const actual = new Date(co.entry_at);
          const diff = Math.round((actual.getTime() - expected.getTime()) / 60000);
          if (diff < -TOL) {
            const key = `${s.employee_id}|${s.schedule_date}|early_leave`;
            if (!existingSet.has(key)) {
              const { error } = await supabase.rpc("hour_bank_apply_debit", {
                p_employee_id: s.employee_id,
                p_minutes: Math.abs(diff),
                p_reference_date: s.schedule_date,
                p_entry_type: "early_leave",
                p_source_kind: "auto_schedule_vs_punch",
                p_source_id: s.id,
                p_notes: `Saída antecipada de ${Math.abs(diff)} min`,
                p_created_by: user?.id ?? null,
              });
              if (!error) debitsEarly++;
            }
          } else if (diff > TOL) {
            const key = `${s.employee_id}|${s.schedule_date}|overtime`;
            if (!existingSet.has(key)) {
              const { error } = await supabase.rpc("hour_bank_register_credit", {
                p_employee_id: s.employee_id,
                p_minutes: diff,
                p_reference_date: s.schedule_date,
                p_entry_type: "overtime",
                p_source_kind: "auto_schedule_vs_punch",
                p_source_id: s.id,
                p_notes: `Hora extra de ${diff} min`,
                p_created_by: user?.id ?? null,
              });
              if (!error) credits++;
            }
          }
        }
      }

      // Expira créditos vencidos
      const { data: expired } = await supabase.rpc("hour_bank_expire_credits");

      await reloadBalances();
      if (selectedEmp) await loadEntries(selectedEmp);

      toast({
        title: "Sincronização concluída",
        description: `+${credits} extras · -${debitsLate} atrasos · -${debitsEarly} saídas antec. · ${expired ?? 0} expirados`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao sincronizar", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const submitAdjust = async () => {
    if (!canManage) return;
    const totalMin = (parseInt(adjustForm.hours) || 0) * 60 + (parseInt(adjustForm.minutes) || 0);
    if (totalMin <= 0 || !adjustForm.employee_id) {
      toast({ title: "Preencha colaborador e quantidade > 0", variant: "destructive" });
      return;
    }
    try {
      if (adjustForm.kind === "manual_credit") {
        const { error } = await supabase.rpc("hour_bank_register_credit", {
          p_employee_id: adjustForm.employee_id,
          p_minutes: totalMin,
          p_reference_date: adjustForm.date,
          p_entry_type: "manual_credit",
          p_source_kind: "manual",
          p_source_id: null,
          p_notes: adjustForm.notes || null,
          p_created_by: user?.id ?? null,
        });
        if (error) throw error;
      } else {
        const entryType = adjustForm.kind === "payout" ? "payout" : "manual_debit";
        const { error } = await supabase.rpc("hour_bank_apply_debit", {
          p_employee_id: adjustForm.employee_id,
          p_minutes: totalMin,
          p_reference_date: adjustForm.date,
          p_entry_type: entryType,
          p_source_kind: "manual",
          p_source_id: null,
          p_notes: adjustForm.notes || null,
          p_created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
      toast({ title: "Lançamento registrado" });
      setAdjustOpen(false);
      setAdjustForm({ employee_id: "", kind: "manual_credit", hours: "0", minutes: "0", date: format(new Date(), "yyyy-MM-dd"), notes: "" });
      await reloadBalances();
      if (selectedEmp === adjustForm.employee_id) await loadEntries(selectedEmp);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const totals = useMemo(() => {
    return balances.reduce(
      (acc, b) => ({
        net: acc.net + Number(b.net_minutes),
        credits: acc.credits + Number(b.available_minutes),
        debits: acc.debits + Number(b.total_debit_minutes),
        expiring: acc.expiring + Number(b.credits_expiring_soon),
      }),
      { net: 0, credits: 0, debits: 0, expiring: 0 },
    );
  }, [balances]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <Hourglass className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Banco de Horas</h1>
            <p className="text-sm text-muted-foreground">Conversão 1:1 · Validade de 6 meses · Atrasos e saídas antec. abatem créditos</p>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button onClick={syncFromScheduleVsPunch} disabled={syncing} variant="outline" className="flex-1 sm:flex-none">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar mês
            </Button>
            <Button onClick={() => setAdjustOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" /> Lançar
            </Button>
          </div>
        )}
      </div>

      {/* Resumo geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500" /> Créditos disp.</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-500">{fmtMin(totals.credits)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> Débitos</div>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{fmtMin(totals.debits)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Saldo líquido</div>
          <div className={`text-xl sm:text-2xl font-bold ${totals.net < 0 ? "text-destructive" : "text-emerald-500"}`}>{fmtMin(totals.net)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><CalendarOff className="h-3 w-3 text-amber-500" /> Vencendo (30d)</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-500">{totals.expiring}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="balances" className="space-y-3">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="balances">Saldos</TabsTrigger>
          <TabsTrigger value="extract" disabled={!selectedEmp}>Extrato {selectedEmp ? `· ${empMap[selectedEmp]?.full_name?.split(" ")[0] ?? ""}` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-3">
          <Card>
            <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Loja</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Buscar colaborador</Label>
                <Input placeholder="Nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-2xl">Saldo por colaborador</CardTitle>
              <CardDescription>{filteredEmployees.length} colaborador(es) com movimento</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {filteredEmployees.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nenhum movimento encontrado. Use "Sincronizar mês" para popular automaticamente.</p>
              ) : (
                <>
                  {/* Mobile: cards */}
                  <div className="md:hidden space-y-2 p-3">
                    {filteredEmployees.map((e) => {
                      const b = balMap[e.id];
                      const net = Number(b?.net_minutes ?? 0);
                      return (
                        <button
                          key={e.id}
                          onClick={() => loadEntries(e.id)}
                          className="w-full text-left rounded-lg border bg-card p-3 space-y-2 hover:bg-accent/50 transition"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{e.full_name}</div>
                              <div className="text-xs text-muted-foreground">
                                Créditos: <span className="text-emerald-500 font-mono">{fmtMin(Number(b?.available_minutes ?? 0))}</span> ·
                                Débitos: <span className="text-destructive font-mono">{fmtMin(Number(b?.total_debit_minutes ?? 0))}</span>
                              </div>
                            </div>
                            <Badge variant={net < 0 ? "destructive" : "success"} className="font-mono">{fmtMin(net)}</Badge>
                          </div>
                          {Number(b?.credits_expiring_soon ?? 0) > 0 && (
                            <div className="text-xs text-amber-500 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {b.credits_expiring_soon} crédito(s) vencendo em 30 dias
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Colaborador</th>
                          <th className="text-center p-2">Créditos disp.</th>
                          <th className="text-center p-2">Débitos</th>
                          <th className="text-center p-2">Saldo líquido</th>
                          <th className="text-center p-2">Vencendo (30d)</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.map((e) => {
                          const b = balMap[e.id];
                          const net = Number(b?.net_minutes ?? 0);
                          return (
                            <tr key={e.id} className="border-t hover:bg-muted/30">
                              <td className="p-2 font-medium">{e.full_name}</td>
                              <td className="p-2 text-center font-mono text-emerald-500">{fmtMin(Number(b?.available_minutes ?? 0))}</td>
                              <td className="p-2 text-center font-mono text-destructive">{fmtMin(Number(b?.total_debit_minutes ?? 0))}</td>
                              <td className={`p-2 text-center font-mono font-bold ${net < 0 ? "text-destructive" : "text-emerald-500"}`}>{fmtMin(net)}</td>
                              <td className="p-2 text-center">{Number(b?.credits_expiring_soon ?? 0) > 0 ? <Badge variant="outline" className="text-amber-500 border-amber-500">{b.credits_expiring_soon}</Badge> : "—"}</td>
                              <td className="p-2 text-right">
                                <Button size="sm" variant="ghost" onClick={() => loadEntries(e.id)}>Extrato</Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extract">
          {selectedEmp && (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-2xl">{empMap[selectedEmp]?.full_name}</CardTitle>
                <CardDescription>{entries.length} movimento(s) · ordenados do mais recente</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {entries.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Sem movimentos.</p>
                ) : (
                  <div className="divide-y">
                    {entries.map((e) => {
                      const isCredit = e.minutes > 0;
                      return (
                        <div key={e.id} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={isCredit ? "success" : "destructive"} className="text-xs">
                                {TYPE_LABEL[e.entry_type] ?? e.entry_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground font-mono">
                                {format(parseISO(e.reference_date), "dd/MM/yyyy")}
                              </span>
                              {e.expires_at && e.minutes_remaining > 0 && (
                                <span className="text-xs text-amber-500 flex items-center gap-1">
                                  <CalendarOff className="h-3 w-3" /> vence {format(parseISO(e.expires_at), "dd/MM/yyyy")}
                                </span>
                              )}
                            </div>
                            {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                            {isCredit && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Restante: <span className="font-mono">{fmtMin(e.minutes_remaining)}</span> de {fmtMin(e.minutes)}
                              </p>
                            )}
                          </div>
                          <div className={`font-mono font-bold ${isCredit ? "text-emerald-500" : "text-destructive"}`}>
                            {isCredit ? "+" : ""}{fmtMin(e.minutes)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de lançamento manual */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançamento manual</DialogTitle>
            <DialogDescription>Registre um crédito ou débito direto no banco de horas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={adjustForm.employee_id} onValueChange={(v) => setAdjustForm({ ...adjustForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={adjustForm.kind} onValueChange={(v) => setAdjustForm({ ...adjustForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_credit">Crédito (somar horas)</SelectItem>
                  <SelectItem value="manual_debit">Débito (subtrair horas)</SelectItem>
                  <SelectItem value="payout">Pago em folha (zerar saldo positivo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Horas</Label>
                <Input type="number" min="0" value={adjustForm.hours} onChange={(e) => setAdjustForm({ ...adjustForm, hours: e.target.value })} />
              </div>
              <div>
                <Label>Minutos</Label>
                <Input type="number" min="0" max="59" value={adjustForm.minutes} onChange={(e) => setAdjustForm({ ...adjustForm, minutes: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Data de referência</Label>
              <Input type="date" value={adjustForm.date} onChange={(e) => setAdjustForm({ ...adjustForm, date: e.target.value })} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea rows={2} value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitAdjust} className="w-full sm:w-auto">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
