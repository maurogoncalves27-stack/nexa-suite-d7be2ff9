import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle2, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { generateTimesheetClosurePdf, type TimesheetClosureRow, type TimesheetClosureEntry } from "@/lib/timesheetPdf";
import { sortStores } from "@/lib/storeSort";
import { useEmployeesAtStore } from "@/hooks/useEmployeesAtStore";

interface Employee { id: string; full_name: string; store_id: string; position: string | null; exempt_from_timeclock: boolean | null }
interface Store { id: string; name: string }
interface Closure {
  id: string;
  employee_id: string;
  reference_year: number;
  reference_month: number;
  status: "open" | "awaiting_acceptance" | "accepted" | "sent_to_accounting";
  summary: any;
  closed_at: string | null;
  accepted_at: string | null;
}
interface Entry { employee_id: string; entry_type: string; entry_at: string; reference_date: string }
interface Schedule { employee_id: string; schedule_date: string; is_day_off: boolean; start_time: string | null; end_time: string | null }

const STATUS_LABEL: Record<Closure["status"], string> = {
  open: "Aberto",
  awaiting_acceptance: "Aguardando aceite",
  accepted: "Aceito",
  sent_to_accounting: "Aceito",
};

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: format(new Date(2000, i, 1), "MMMM", { locale: ptBR }) }));
const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

function pad(n: number) { return n.toString().padStart(2, "0"); }

export function TimesheetClosurePanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, year, month]);

  const init = async () => {
    const [{ data: sto }, { data: emp }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id, position, exempt_from_timeclock").eq("status", "active").or("exempt_from_timeclock.is.null,exempt_from_timeclock.eq.false").order("full_name"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees(emp ?? []);
    setLoading(false);
  };

  const load = async () => {
    const { data } = await supabase
      .from("timesheet_closures")
      .select("*")
      .eq("reference_year", year)
      .eq("reference_month", month);
    setClosures((data ?? []) as Closure[]);
  };

  const filteredEmployees = useMemo(
    () => storeId === "all" ? employees : employees.filter((e) => e.store_id === storeId),
    [employees, storeId],
  );

  const closuresByEmp = useMemo(() => Object.fromEntries(closures.map((c) => [c.employee_id, c])), [closures]);

  const periodStart = `${year}-${pad(month)}-01`;
  const periodEnd = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

  const computeSummary = async (employeeId: string) => {
    const [{ data: entries }, { data: schedules }, { data: leaves }] = await Promise.all([
      supabase.from("time_clock_entries").select("entry_type, entry_at, reference_date").eq("employee_id", employeeId).gte("reference_date", periodStart).lte("reference_date", periodEnd),
      supabase.from("work_schedules").select("schedule_date, is_day_off, start_time, end_time").eq("employee_id", employeeId).gte("schedule_date", periodStart).lte("schedule_date", periodEnd),
      supabase.from("employee_leaves").select("leave_type, start_date, end_date, is_paid").eq("employee_id", employeeId).lte("start_date", periodEnd).gte("end_date", periodStart),
    ]);
    const ents = (entries ?? []) as Entry[];
    const schs = (schedules ?? []) as Schedule[];
    let workedMin = 0;
    const byDate = new Map<string, Entry[]>();
    for (const e of ents) {
      if (!byDate.has(e.reference_date)) byDate.set(e.reference_date, []);
      byDate.get(e.reference_date)!.push(e);
    }
    for (const list of byDate.values()) {
      const ci = list.find((x) => x.entry_type === "clock_in");
      const co = [...list].reverse().find((x) => x.entry_type === "clock_out");
      const bs = list.find((x) => x.entry_type === "break_start");
      const be = list.find((x) => x.entry_type === "break_end");
      if (ci && co) {
        const total = (new Date(co.entry_at).getTime() - new Date(ci.entry_at).getTime()) / 60000;
        const brk = bs && be ? (new Date(be.entry_at).getTime() - new Date(bs.entry_at).getTime()) / 60000 : 0;
        workedMin += Math.max(0, total - Math.max(0, brk));
      }
    }
    const workedDays = byDate.size;
    const scheduledWorkDays = schs.filter((s) => !s.is_day_off).length;
    const absences = Math.max(0, scheduledWorkDays - workedDays);
    return {
      worked_minutes: Math.round(workedMin),
      worked_days: workedDays,
      scheduled_work_days: scheduledWorkDays,
      absences,
      leaves_count: (leaves ?? []).length,
      generated_at: new Date().toISOString(),
    };
  };

  const notifyEmployee = async (employeeId: string) => {
    const { data: emp } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp?.user_id) return;
    const monthLabel = format(new Date(year, month - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
    try {
      await supabase.functions.invoke("notify-user", {
        body: {
          user_id: emp.user_id,
          title: "Folha de ponto disponível",
          message: `Sua folha de ${monthLabel} está pronta. Confira e confirme suas horas.`,
          url: "/area-colaborador?focus=timesheet",
          tag: `timesheet-${year}-${month}`,
          category: "timesheet",
        },
      });
    } catch (err) {
      console.error("notify-user failed", err);
    }
  };

  const sendForAcceptance = async (employeeId: string) => {
    if (!user) return;
    setWorking(employeeId);
    try {
      const summary = await computeSummary(employeeId);
      const existing = closuresByEmp[employeeId];
      if (existing) {
        const { error } = await supabase.from("timesheet_closures").update({
          status: "awaiting_acceptance",
          summary,
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timesheet_closures").insert({
          employee_id: employeeId,
          reference_year: year,
          reference_month: month,
          status: "awaiting_acceptance",
          summary,
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      await notifyEmployee(employeeId);
      toast({ title: "Folha enviada para aceite do colaborador" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setWorking(null);
    }
  };

  const sendBatch = async () => {
    const pending = filteredEmployees.filter((e) => {
      const c = closuresByEmp[e.id];
      return !c || (c.status !== "accepted" && c.status !== "sent_to_accounting");
    });
    if (pending.length === 0) {
      toast({ title: "Nenhuma folha pendente para envio" });
      return;
    }
    if (!confirm(`Enviar a folha de ${pending.length} colaborador(es) para aceite?`)) return;
    for (const e of pending) {
      await sendForAcceptance(e.id);
    }
  };

  const fetchEntriesByEmployee = async (employeeIds: string[]): Promise<Record<string, TimesheetClosureEntry[]>> => {
    if (employeeIds.length === 0) return {};
    const { data } = await supabase
      .from("time_clock_entries")
      .select("employee_id, entry_type, entry_at, reference_date, is_manual, is_outside_geofence")
      .in("employee_id", employeeIds)
      .gte("reference_date", periodStart)
      .lte("reference_date", periodEnd)
      .order("entry_at", { ascending: true });
    const map: Record<string, TimesheetClosureEntry[]> = {};
    for (const row of (data ?? []) as Array<TimesheetClosureEntry & { employee_id: string }>) {
      if (!map[row.employee_id]) map[row.employee_id] = [];
      map[row.employee_id].push({
        entry_type: row.entry_type,
        entry_at: row.entry_at,
        reference_date: row.reference_date,
        is_manual: row.is_manual ?? null,
        is_outside_geofence: row.is_outside_geofence ?? null,
      });
    }
    return map;
  };

  const buildRowsForPdf = async (emps: Employee[]): Promise<TimesheetClosureRow[]> => {
    const ids = emps.map((e) => e.id);
    const [entriesMap, { data: empDetails }, { data: storeDetails }, { data: schedules }, { data: leavesData }] = await Promise.all([
      fetchEntriesByEmployee(ids),
      ids.length
        ? supabase.from("employees").select("id, cpf, admission_date").in("id", ids)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("stores").select("id, name, address, city, state, cnpj, legal_name, zip_code").eq("is_active", true).eq("is_virtual", false),
      ids.length
        ? supabase
            .from("work_schedules")
            .select("employee_id, schedule_date, is_day_off, start_time, end_time")
            .in("employee_id", ids)
            .gte("schedule_date", periodStart)
            .lte("schedule_date", periodEnd)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase
            .from("employee_leaves")
            .select("employee_id, start_date, end_date, leave_type, notes")
            .in("employee_id", ids)
            .lte("start_date", periodEnd)
            .gte("end_date", periodStart)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const leavesByEmp: Record<string, any[]> = {};
    for (const l of ((leavesData as any[]) ?? [])) {
      (leavesByEmp[l.employee_id] ??= []).push(l);
    }
    const empDetMap = Object.fromEntries(((empDetails as any[]) ?? []).map((x) => [x.id, x]));
    const storeMap = Object.fromEntries(((storeDetails as any[]) ?? []).map((s) => [s.id, s]));
    // Calcula minutos previstos somando duração do schedule por colaborador
    const schedMinByEmp: Record<string, number> = {};
    for (const s of ((schedules as any[]) ?? [])) {
      if (s.is_day_off || !s.start_time || !s.end_time) continue;
      const [sh, sm] = String(s.start_time).split(":").map(Number);
      const [eh, em] = String(s.end_time).split(":").map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      schedMinByEmp[s.employee_id] = (schedMinByEmp[s.employee_id] ?? 0) + mins;
    }
    return emps.map((e) => {
      const c = closuresByEmp[e.id];
      const sum = (c?.summary ?? {}) as any;
      const det = empDetMap[e.id] ?? {};
      const sto = storeMap[e.store_id] ?? {};
      const addr = [sto.address, sto.zip_code, sto.city, sto.state].filter(Boolean).join(", ") || null;
      return {
        employee_name: e.full_name,
        employee_cpf: det.cpf ?? null,
        employee_admission: det.admission_date ?? null,
        store_name: sto.name ?? null,
        store_address: addr,
        company_name: sto.legal_name ?? sto.name ?? null,
        company_cnpj: "44.932.369/0001-08",
        position: e.position,
        worked_days: sum.worked_days ?? null,
        scheduled_work_days: sum.scheduled_work_days ?? null,
        worked_minutes: sum.worked_minutes ?? null,
        scheduled_minutes: schedMinByEmp[e.id] ?? null,
        absences: sum.absences ?? null,
        leaves_count: sum.leaves_count ?? null,
        status: c?.status ?? "open",
        accepted_at: c?.accepted_at ?? null,
        accepted_ip: (c as any)?.accepted_ip ?? null,
        entries: entriesMap[e.id] ?? [],
        leaves: leavesByEmp[e.id] ?? [],
      };
    });
  };

  const downloadPdf = async () => {
    const rows = await buildRowsForPdf(filteredEmployees);
    if (rows.length === 0) {
      toast({ title: "Nenhum colaborador no período" });
      return;
    }
    generateTimesheetClosurePdf({ year, month, rows });
  };

  const downloadEmployeePdf = async (emp: Employee) => {
    const rows = await buildRowsForPdf([emp]);
    const safeName = emp.full_name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase();
    generateTimesheetClosurePdf({
      year,
      month,
      rows,
      fileName: `folha-ponto-${safeName}-${year}-${pad(month)}.pdf`,
    });
  };

  const downloadAcceptedPdfs = async () => {
    const acceptedEmps = filteredEmployees.filter((e) => {
      const c = closuresByEmp[e.id];
      return c?.status === "accepted" || c?.status === "sent_to_accounting";
    });
    if (acceptedEmps.length === 0) {
      toast({ title: "Nenhum aceite disponível para download" });
      return;
    }
    const rows = await buildRowsForPdf(acceptedEmps);
    generateTimesheetClosurePdf({ year, month, rows });
  };

  const allAccepted = filteredEmployees.length > 0 && filteredEmployees.every((e) => {
    const c = closuresByEmp[e.id];
    return c?.status === "accepted" || c?.status === "sent_to_accounting";
  });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
            <Label>Mês</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={sendBatch} className="w-full">
              <Send className="h-4 w-4 mr-2" /> Enviar todos p/ aceite
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={downloadAcceptedPdfs}
              className="w-full"
              disabled={!allAccepted || filteredEmployees.length === 0}
              title={allAccepted ? "Baixar PDFs de todos os aceites" : "Disponível somente após o aceite de todos os colaboradores"}
            >
              <Download className="h-4 w-4 mr-2" /> Baixar todos PDFs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Fechamento — {MONTHS[month - 1].label}/{year}</CardTitle>
          <CardDescription>
            Colaboradores: {filteredEmployees.length} · Aceitos: {closures.filter((c) => c.status === "accepted" || c.status === "sent_to_accounting").length}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Colaborador</th>
                <th className="text-center p-2">Dias trab.</th>
                <th className="text-center p-2">Horas</th>
                <th className="text-center p-2">Faltas</th>
                <th className="text-center p-2">Status</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => {
                const c = closuresByEmp[e.id];
                const sum = c?.summary ?? {};
                const hours = sum.worked_minutes ? `${Math.floor(sum.worked_minutes / 60)}h${pad(sum.worked_minutes % 60)}` : "—";
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{e.full_name}</td>
                    <td className="p-2 text-center font-mono">{sum.worked_days ?? "—"}</td>
                    <td className="p-2 text-center font-mono">{hours}</td>
                    <td className="p-2 text-center font-mono">{sum.absences ?? "—"}</td>
                    <td className="p-2 text-center">
                      {!c && <Badge variant="outline">Aberto</Badge>}
                      {c?.status === "awaiting_acceptance" && <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">Aguardando</Badge>}
                      {(c?.status === "accepted" || c?.status === "sent_to_accounting") && <Badge><CheckCircle2 className="h-3 w-3 mr-1" />Aceito</Badge>}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end flex-wrap">
                        {/* Pré-visualizar a folha completa do mês — sempre disponível */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadEmployeePdf(e)}
                          title="Visualizar folha de ponto completa do mês"
                        >
                          <Download className="h-3 w-3 mr-1" /> Pré-visualizar
                        </Button>
                        {(!c || c.status === "open" || c.status === "awaiting_acceptance") && (
                          <Button size="sm" variant="outline" onClick={() => sendForAcceptance(e.id)} disabled={working === e.id}>
                            {working === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                            {c?.status === "awaiting_acceptance" ? "Reenviar" : "Enviar p/ aceite"}
                          </Button>
                        )}
                        {(c?.status === "accepted" || c?.status === "sent_to_accounting") && (
                          <>
                            {c.accepted_at && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(c.accepted_at), "dd/MM HH:mm")}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm("Reenviar a folha para novo aceite? O aceite atual será substituído.")) {
                                  sendForAcceptance(e.id);
                                }
                              }}
                              disabled={working === e.id}
                              title="Reenviar para novo aceite"
                            >
                              {working === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                              Reenviar
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export default TimesheetClosurePanel;
