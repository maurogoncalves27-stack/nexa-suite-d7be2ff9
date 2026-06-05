import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// filter migrated to checkboxes
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, AlertTriangle, CheckCircle2, XCircle, Clock4, CalendarOff, Plane } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";
import { sortStores } from "@/lib/storeSort";
import { useEmployeesAtStore } from "@/hooks/useEmployeesAtStore";

interface Store { id: string; name: string }
interface Employee { id: string; full_name: string; store_id: string; allocated_store_id: string | null; exempt_from_timeclock?: boolean }
interface Schedule {
  id: string;
  employee_id: string;
  schedule_date: string;
  is_day_off: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  break_start_2: string | null;
  break_end_2: string | null;
  notes: string | null;
}
interface Entry {
  employee_id: string;
  entry_type: string;
  entry_at: string;
  reference_date: string;
}
interface Leave {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  is_paid: boolean | null;
  custom_label?: string | null;
}

type DivergenceKey =
  | "ok"
  | "day_off"           // dia de folga escalado
  | "absent"            // escalado, nada batido
  | "incomplete"        // escalado, batidas incompletas (sem entrada ou sem saída)
  | "late"              // entrada após escala
  | "early_leave"       // saída antes do escalado
  | "overtime"          // saída após escalado (hora extra)
  | "unscheduled"       // batidas sem escala (incl. dia de folga)
  | "on_leave"          // colaborador em afastamento (atestado, férias, INSS, etc.)
  | "no_data";          // não escalado e não bateu

interface DayResult {
  employee_id: string;
  date: string;
  schedule: Schedule | null;
  entries: Entry[];
  leave: Leave | null;
  flags: DivergenceKey[];
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

const LEAVE_LABEL: Record<string, string> = {
  medical_certificate: "Atestado",
  paid_absence: "Falta abonada",
  unpaid_absence: "Falta n/ abonada",
  day_off: "Folga concedida",
  suspension: "Suspensão",
  vacation: "Férias",
  inss: "INSS",
  maternity: "Lic. maternidade",
  paternity: "Lic. paternidade",
  bereavement: "Lic. nojo",
  marriage: "Lic. gala",
  other: "Afastamento",
};

function leaveLabel(lv: Leave | null | undefined): string {
  if (!lv) return "Afastamento";
  return lv.custom_label || LEAVE_LABEL[lv.leave_type] || "Afastamento";
}

const FLAG_LABEL: Record<DivergenceKey, string> = {
  ok: "OK",
  day_off: "Folga",
  absent: "Falta",
  incomplete: "Batidas incompletas",
  late: "Atraso",
  early_leave: "Saída antecipada",
  overtime: "Saída após",
  unscheduled: "Ponto sem escala",
  on_leave: "Afastamento",
  no_data: "Aguardando",
};

const FLAG_VARIANT: Record<DivergenceKey, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  ok: "success",
  day_off: "outline",
  absent: "destructive",
  incomplete: "destructive",
  late: "destructive",
  early_leave: "destructive",
  overtime: "destructive",
  unscheduled: "destructive",
  on_leave: "secondary",
  no_data: "outline",
};

/** Combina data (YYYY-MM-DD) + hora (HH:MM[:SS]) em Date local. */
function combineDateTime(date: string, time: string): Date {
  const t = time.length <= 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`);
}

function diffMinutes(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

function fmtMin(n: number) {
  if (!n) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h > 0 ? `${h}h` : ""}${m.toString().padStart(h ? 2 : 1, "0")}min`;
}

interface Props {
  toleranceMinutes?: number;
}

export function ScheduleVsPunchPanel({ toleranceMinutes = 5 }: Props) {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [from, setFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), "yyyy-MM-dd"));
  const ALL_FLAGS: DivergenceKey[] = ["absent", "incomplete", "late", "early_leave", "overtime", "unscheduled", "on_leave", "day_off", "ok", "no_data"];
  // Padrão: todas as divergências (oculta OK, Aguardando, Folga, Afastamento)
  const DEFAULT_FLAGS: DivergenceKey[] = ["absent", "incomplete", "late", "early_leave", "overtime", "unscheduled"];
  const [activeFlags, setActiveFlags] = useState<Set<DivergenceKey>>(new Set(DEFAULT_FLAGS));
  const toggleFlag = (f: DivergenceKey) => {
    setActiveFlags((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  };

  const punchedAtStore = useEmployeesAtStore(storeId, from, to);

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, employeeId, from, to, punchedAtStore]);


  const init = async () => {
    const [{ data: sto }, { data: emp }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id, allocated_store_id, exempt_from_timeclock").eq("status", "active").neq("exempt_from_timeclock", true).order("full_name"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees(emp ?? []);
    setLoading(false);
  };

  const load = async () => {
    let schedQ = supabase
      .from("work_schedules")
      .select("id, employee_id, schedule_date, is_day_off, start_time, end_time, break_start, break_end, break_start_2, break_end_2, notes")
      .gte("schedule_date", from)
      .lte("schedule_date", to)
      .limit(5000);
    let entryQ = supabase
      .from("time_clock_entries")
      .select("employee_id, entry_type, entry_at, reference_date")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .limit(5000);
    let leaveQ = supabase
      .from("employee_leaves")
      .select("id, employee_id, leave_type, start_date, end_date, is_paid")
      .lte("start_date", to)
      .gte("end_date", from)
      .limit(5000);

    if (employeeId !== "all") {
      schedQ = schedQ.eq("employee_id", employeeId);
      entryQ = entryQ.eq("employee_id", employeeId);
      leaveQ = leaveQ.eq("employee_id", employeeId);
    } else if (storeId !== "all") {
      // Filtra colaboradores da loja (contratante OU alocação)
      const ids = employees
        .filter((e) => e.store_id === storeId || e.allocated_store_id === storeId)
        .map((e) => e.id);
      if (ids.length === 0) {
        setSchedules([]);
        setEntries([]);
        setLeaves([]);
        return;
      }
      schedQ = schedQ.in("employee_id", ids);
      entryQ = entryQ.in("employee_id", ids);
      leaveQ = leaveQ.in("employee_id", ids);
    }

    const [{ data: sch }, { data: ent }, { data: lv }] = await Promise.all([schedQ, entryQ, leaveQ]);
    setSchedules((sch ?? []) as Schedule[]);
    setEntries((ent ?? []) as Entry[]);
    setLeaves((lv ?? []) as Leave[]);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const filteredEmployees = useMemo(() => {
    if (storeId === "all") return employees;
    return employees.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId);
  }, [employees, storeId]);

  const results: DayResult[] = useMemo(() => {
    // Agrupa por employee_id + date
    const map = new Map<string, DayResult>();
    const key = (eid: string, date: string) => `${eid}|${date}`;

    for (const s of schedules) {
      map.set(key(s.employee_id, s.schedule_date), {
        employee_id: s.employee_id,
        date: s.schedule_date,
        schedule: s,
        entries: [],
        leave: null,
        flags: [],
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
      });
    }
    for (const e of entries) {
      const k = key(e.employee_id, e.reference_date);
      if (!map.has(k)) {
        map.set(k, {
          employee_id: e.employee_id,
          date: e.reference_date,
          schedule: null,
          entries: [e],
          leave: null,
          flags: [],
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeMinutes: 0,
        });
      } else {
        map.get(k)!.entries.push(e);
      }
    }

    // Cria/anexa registro para cada dia de afastamento (cobre dias sem escala/sem ponto)
    for (const lv of leaves) {
      const start = new Date(lv.start_date + "T00:00");
      const end = new Date(lv.end_date + "T00:00");
      for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
        const ds = format(d, "yyyy-MM-dd");
        if (ds < from || ds > to) continue;
        const k = key(lv.employee_id, ds);
        if (!map.has(k)) {
          map.set(k, {
            employee_id: lv.employee_id,
            date: ds,
            schedule: null,
            entries: [],
            leave: lv,
            flags: [],
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeMinutes: 0,
          });
        } else {
          map.get(k)!.leave = lv;
        }
      }
    }

    // Classifica
    const todayStr = format(new Date(), "yyyy-MM-dd");
    for (const r of map.values()) {
      const sched = r.schedule;
      const ents = r.entries.sort((a, b) => a.entry_at.localeCompare(b.entry_at));
      const clockIn = ents.find((x) => x.entry_type === "clock_in");
      const clockOut = [...ents].reverse().find((x) => x.entry_type === "clock_out");
      const isFuture = r.date > todayStr;
      const isToday = r.date === todayStr;

      // Caso 0: dia coberto por afastamento (atestado, férias, INSS, etc.)
      // Sobrepõe escala — colaborador não devia bater ponto. Se bateu, sinaliza ponto sem escala.
      if (r.leave) {
        r.flags.push("on_leave");
        if (ents.length > 0 && !isFuture) r.flags.push("unscheduled");
        continue;
      }

      // Caso 1: sem escala
      if (!sched) {
        if (ents.length > 0) r.flags.push("unscheduled");
        else r.flags.push("no_data");
        continue;
      }

      // Caso 2: dia de folga escalado
      if (sched.is_day_off) {
        // Detecta afastamento gravado na escala via notes (ex: "Afastamento médico — CID ...")
        const noteText = (sched.notes ?? "").trim();
        const isLeaveNote = /^afastamento|atestado|f[ée]rias|inss|licen[çc]a|suspens[ãa]o|abonad/i.test(noteText);
        if (isLeaveNote) {
          // Cria um "leave" sintético a partir da escala para reaproveitar a UI de afastamento
          if (!r.leave) {
            // Pega "Afastamento médico" do texto "Afastamento médico — CID ..." 
            const baseLabel = noteText.split(/\s+[—-]\s+/)[0]?.trim() || "Afastamento";
            r.leave = {
              id: sched.id,
              employee_id: sched.employee_id,
              leave_type: "other",
              start_date: sched.schedule_date,
              end_date: sched.schedule_date,
              is_paid: null,
              custom_label: baseLabel,
            };
          }
          r.flags.push("on_leave");
          if (ents.length > 0 && !isFuture) r.flags.push("unscheduled");
          continue;
        }
        if (ents.length > 0 && !isFuture) r.flags.push("unscheduled");
        else r.flags.push("day_off");
        continue;
      }

      // Datas futuras escaladas: ainda não aconteceu — não marcar falta/incompleto
      if (isFuture) {
        r.flags.push("no_data");
        continue;
      }

      // Caso 3: escalado para trabalhar
      if (ents.length === 0) {
        // Hoje: se ainda não passou do horário de entrada (com tolerância), não é falta
        if (isToday && sched.start_time) {
          const expectedStart = combineDateTime(r.date, sched.start_time);
          if (new Date().getTime() <= expectedStart.getTime() + toleranceMinutes * 60000) {
            r.flags.push("no_data");
            continue;
          }
        }
        r.flags.push("absent");
        continue;
      }
      if (!clockIn || !clockOut) {
        // Hoje: se ainda não passou do horário de saída, não classificar como incompleto ainda
        if (isToday && sched.end_time) {
          const expectedEnd = combineDateTime(r.date, sched.end_time);
          if (new Date().getTime() < expectedEnd.getTime()) {
            // segue para checagem de atraso, mas não marca incomplete
          } else {
            r.flags.push("incomplete");
          }
        } else {
          r.flags.push("incomplete");
        }
      }

      if (clockIn && sched.start_time) {
        const expected = combineDateTime(r.date, sched.start_time);
        const actual = new Date(clockIn.entry_at);
        const diff = diffMinutes(actual, expected);
        if (diff > toleranceMinutes) {
          r.lateMinutes = diff;
          r.flags.push("late");
        }
      }
      if (clockOut && sched.end_time) {
        const expected = combineDateTime(r.date, sched.end_time);
        const actual = new Date(clockOut.entry_at);
        const diff = diffMinutes(actual, expected);
        if (diff < -toleranceMinutes) {
          r.earlyLeaveMinutes = Math.abs(diff);
          r.flags.push("early_leave");
        } else if (diff > toleranceMinutes) {
          r.overtimeMinutes = diff;
          r.flags.push("overtime");
        }
      }

      if (r.flags.length === 0) r.flags.push("ok");
    }

    return Array.from(map.values())
      .filter((r) => empMap[r.employee_id]) // exclui isentos de bater ponto
      .sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : (empMap[a.employee_id]?.full_name ?? "").localeCompare(empMap[b.employee_id]?.full_name ?? "")
      );
  }, [schedules, entries, leaves, empMap, toleranceMinutes, from, to]);

  const filteredResults = useMemo(() => {
    if (activeFlags.size === 0) return [];
    return results.filter((r) => r.flags.some((f) => activeFlags.has(f)));
  }, [results, activeFlags]);

  const summary = useMemo(() => {
    const s = { ok: 0, absent: 0, incomplete: 0, late: 0, early_leave: 0, overtime: 0, unscheduled: 0, day_off: 0, on_leave: 0, totalLate: 0, totalEarly: 0, totalOver: 0 };
    for (const r of results) {
      if (r.schedule?.is_day_off) s.day_off++;
      if (r.flags.includes("ok")) s.ok++;
      if (r.flags.includes("absent")) s.absent++;
      if (r.flags.includes("incomplete")) s.incomplete++;
      if (r.flags.includes("late")) { s.late++; s.totalLate += r.lateMinutes; }
      if (r.flags.includes("early_leave")) { s.early_leave++; s.totalEarly += r.earlyLeaveMinutes; }
      if (r.flags.includes("overtime")) { s.overtime++; s.totalOver += r.overtimeMinutes; }
      if (r.flags.includes("unscheduled")) s.unscheduled++;
      if (r.flags.includes("on_leave")) s.on_leave++;
    }
    return s;
  }, [results]);

  const exportCsv = () => {
    const rows = [["Data", "Colaborador", "Escala entrada", "Escala saída", "Bateu entrada", "Bateu saída", "Atraso", "Saída antecipada", "Hora extra", "Status"]];
    for (const r of filteredResults) {
      const emp = empMap[r.employee_id];
      const ci = r.entries.find((x) => x.entry_type === "clock_in");
      const co = [...r.entries].reverse().find((x) => x.entry_type === "clock_out");
      rows.push([
        r.date,
        emp?.full_name ?? r.employee_id,
        r.schedule?.is_day_off ? "FOLGA" : (r.schedule?.start_time?.slice(0, 5) ?? "—"),
        r.schedule?.is_day_off ? "FOLGA" : (r.schedule?.end_time?.slice(0, 5) ?? "—"),
        ci ? format(new Date(ci.entry_at), "HH:mm") : "—",
        co ? format(new Date(co.entry_at), "HH:mm") : "—",
        r.lateMinutes ? fmtMin(r.lateMinutes) : "",
        r.earlyLeaveMinutes ? fmtMin(r.earlyLeaveMinutes) : "",
        r.overtimeMinutes ? fmtMin(r.overtimeMinutes) : "",
        r.flags.map((f) => f === "on_leave" && r.leave ? `${FLAG_LABEL[f]}: ${leaveLabel(r.leave)}` : FLAG_LABEL[f]).join(" + "),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escala_vs_ponto_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={(v) => { setStoreId(v); setEmployeeId("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Colaborador</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filteredEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={exportCsv} className="w-full">
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
          </div>
        </CardContent>
        <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Mostrar:</Label>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
              {ALL_FLAGS.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={activeFlags.has(f)}
                    onCheckedChange={() => toggleFlag(f)}
                  />
                  <span>{FLAG_LABEL[f]}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setActiveFlags(new Set(ALL_FLAGS))}>Todos</Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveFlags(new Set(DEFAULT_FLAGS))}>Só divergências</Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveFlags(new Set())}>Limpar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3">
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">OK</div>
          <div className="text-xl sm:text-2xl font-bold">{summary.ok}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Faltas</div>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{summary.absent}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Incompl.</div>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{summary.incomplete}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Folgas</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-500">{summary.day_off}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Atrasos</div>
          <div className="text-xl sm:text-2xl font-bold">{summary.late}</div>
          <div className="text-xs text-muted-foreground">{fmtMin(summary.totalLate)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">S. antec.</div>
          <div className="text-xl sm:text-2xl font-bold">{summary.early_leave}</div>
          <div className="text-xs text-muted-foreground">{fmtMin(summary.totalEarly)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">H. extras</div>
          <div className="text-xl sm:text-2xl font-bold">{summary.overtime}</div>
          <div className="text-xs text-muted-foreground">{fmtMin(summary.totalOver)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Afast.</div>
          <div className="text-xl sm:text-2xl font-bold text-blue-500">{summary.on_leave}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-2xl">Cruzamento Escala × Ponto</CardTitle>
          <CardDescription>
            {filteredResults.length} registro(s) — tolerância de {toleranceMinutes} min
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredResults.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum registro com os filtros atuais.</p>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden space-y-2 p-3">
                {filteredResults.map((r) => {
                  const emp = empMap[r.employee_id];
                  const ci = r.entries.find((x) => x.entry_type === "clock_in");
                  const co = [...r.entries].reverse().find((x) => x.entry_type === "clock_out");
                  const sched = r.schedule;
                  return (
                    <div key={`${r.employee_id}-${r.date}`} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{emp?.full_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {format(new Date(r.date + "T00:00"), "dd/MM/yyyy")}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {r.flags.map((f) => (
                            <Badge key={f} variant={FLAG_VARIANT[f]} className="text-xs">
                              {f === "on_leave" && r.leave
                                ? leaveLabel(r.leave)
                                : FLAG_LABEL[f]}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Escala</div>
                          <div className="font-mono font-medium">
                            {r.leave ? leaveLabel(r.leave).toUpperCase()
                              : !sched ? "—"
                              : sched.is_day_off ? "FOLGA"
                              : `${sched.start_time?.slice(0, 5) ?? "—"}–${sched.end_time?.slice(0, 5) ?? "—"}`}
                          </div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Entrada</div>
                          <div className="font-mono font-medium">{ci ? format(new Date(ci.entry_at), "HH:mm") : "—"}</div>
                        </div>
                        <div className="rounded bg-muted/50 p-2">
                          <div className="text-muted-foreground">Saída</div>
                          <div className="font-mono font-medium">{co ? format(new Date(co.entry_at), "HH:mm") : "—"}</div>
                        </div>
                      </div>

                      {(r.lateMinutes > 0 || r.earlyLeaveMinutes > 0 || r.overtimeMinutes > 0) && (
                        <div className="flex flex-wrap gap-3 text-xs pt-1 border-t">
                          {r.lateMinutes > 0 && (
                            <span className="text-destructive">
                              <span className="text-muted-foreground">Atraso:</span> <strong>{fmtMin(r.lateMinutes)}</strong>
                            </span>
                          )}
                          {r.earlyLeaveMinutes > 0 && (
                            <span className="text-destructive">
                              <span className="text-muted-foreground">Saída antec.:</span> <strong>{fmtMin(r.earlyLeaveMinutes)}</strong>
                            </span>
                          )}
                          {r.overtimeMinutes > 0 && (
                            <span>
                              <span className="text-muted-foreground">Hora extra:</span> <strong>{fmtMin(r.overtimeMinutes)}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Colaborador</th>
                      <th className="text-center p-2">Escala</th>
                      <th className="text-center p-2">Entrada</th>
                      <th className="text-center p-2">Saída</th>
                      <th className="text-center p-2">Atraso</th>
                      <th className="text-center p-2">Saída antec.</th>
                      <th className="text-center p-2">Hora extra</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r) => {
                      const emp = empMap[r.employee_id];
                      const ci = r.entries.find((x) => x.entry_type === "clock_in");
                      const co = [...r.entries].reverse().find((x) => x.entry_type === "clock_out");
                      const sched = r.schedule;
                      return (
                        <tr key={`${r.employee_id}-${r.date}`} className="border-t">
                          <td className="p-2 font-mono text-xs">{format(new Date(r.date + "T00:00"), "dd/MM")}</td>
                          <td className="p-2">{emp?.full_name ?? "—"}</td>
                          <td className="p-2 text-center font-mono text-xs">
                            {r.leave ? <Badge variant="secondary">{leaveLabel(r.leave).toUpperCase()}</Badge>
                              : !sched ? <span className="text-muted-foreground">sem escala</span>
                              : sched.is_day_off ? <Badge variant="outline">FOLGA</Badge>
                              : `${sched.start_time?.slice(0, 5) ?? "—"} – ${sched.end_time?.slice(0, 5) ?? "—"}`}
                          </td>
                          <td className="p-2 text-center font-mono">{ci ? format(new Date(ci.entry_at), "HH:mm") : "—"}</td>
                          <td className="p-2 text-center font-mono">{co ? format(new Date(co.entry_at), "HH:mm") : "—"}</td>
                          <td className="p-2 text-center text-destructive">{r.lateMinutes ? fmtMin(r.lateMinutes) : "—"}</td>
                          <td className="p-2 text-center text-destructive">{r.earlyLeaveMinutes ? fmtMin(r.earlyLeaveMinutes) : "—"}</td>
                          <td className="p-2 text-center">{r.overtimeMinutes ? fmtMin(r.overtimeMinutes) : "—"}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {r.flags.map((f) => (
                                <Badge key={f} variant={FLAG_VARIANT[f]}>
                                  {f === "on_leave" && r.leave
                                    ? leaveLabel(r.leave)
                                    : FLAG_LABEL[f]}
                                </Badge>
                              ))}
                            </div>
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
    </div>
  );
}
