import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarClock, ChevronLeft, ChevronRight, Trash2, Home } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, endOfMonth, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sortStores } from "@/lib/storeSort";
import {
  type Employee,
  type Schedule,
  type Store,
  validateScheduleRule,
} from "@/lib/scheduleRules";
import ScheduleGrid from "@/components/schedules/ScheduleGrid";
import CellEditDialog, { type CellForm } from "@/components/schedules/CellEditDialog";
import AssignScheduleForm, { type AssignForm } from "@/components/schedules/AssignScheduleForm";


export default function Schedules() {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("__all__");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [leaves, setLeaves] = useState<Array<{ employee_id: string; start_date: string; end_date: string; leave_type: string; notes: string | null }>>([]);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [tab, setTab] = useState<string>("grid");

  const [cellDialog, setCellDialog] = useState(false);
  const [cellForm, setCellForm] = useState<CellForm | null>(null);

  const [assignSaving, setAssignSaving] = useState(false);
  const [markingNoSchedule, setMarkingNoSchedule] = useState(false);
  const [assignForm, setAssignForm] = useState<AssignForm>({
    employeeId: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    entry: "08:00",
    breakStart: "12:00",
    breakEnd: "13:00",
    hasSecondBreak: false,
    breakStart2: "15:30",
    breakEnd2: "15:45",
    exit: "17:00",
    offWeekdays: [0],
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const init = async () => {
    setLoading(true);
    const { data: sto } = await supabase
      .from("stores")
      .select("id, name, store_type")
      .eq("is_active", true)
      .eq("is_virtual", false)
      .order("name");
    setStores(sortStores(sto ?? []));
    setLoading(false);
  };

  const loadStoreData = async () => {
    if (!storeId) return;
    const weekEnd = addDays(weekStart, 6);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");
    const isAll = storeId === "__all__";
    const empQuery = supabase.from("employees")
      .select("id, full_name, store_id, allocated_store_id, work_schedule, night_shift_eligible")
      .eq("status", "active")
      .order("full_name");
    const schQuery = supabase.from("work_schedules")
      .select("id, employee_id, schedule_date, is_day_off, is_home_office, start_time, end_time, break_start, break_end, break_start_2, break_end_2, store_id, notes")
      .gte("schedule_date", weekStartStr)
      .lte("schedule_date", weekEndStr);
    const [{ data: emp }, { data: sch }, { data: lv }] = await Promise.all([
      isAll ? empQuery : empQuery.eq("allocated_store_id", storeId),
      isAll ? schQuery : schQuery.eq("store_id", storeId),
      supabase.from("employee_leaves")
        .select("employee_id, start_date, end_date, leave_type, notes")
        .lte("start_date", weekEndStr)
        .gte("end_date", weekStartStr),
    ]);
    setLeaves((lv ?? []) as any);
    const employeesList = emp ?? [];
    const currentSchedules = (sch ?? []) as Schedule[];

    // Auto-replicar: preenche os DIAS FALTANTES do mês (não só quando o mês está vazio)
    // usando o padrão da última semana anterior, por dia da semana.
    const monthStart = startOfMonth(weekStart);
    const monthEnd = endOfMonth(weekStart);
    const monthStartStr = format(monthStart, "yyyy-MM-dd");
    const monthEndStr = format(monthEnd, "yyyy-MM-dd");
    if (!isAll && employeesList.length > 0) {
      const empIds = employeesList.map((e) => e.id);
      const { data: monthExisting } = await supabase
        .from("work_schedules")
        .select("employee_id, schedule_date")
        .eq("store_id", storeId)
        .in("employee_id", empIds)
        .gte("schedule_date", monthStartStr)
        .lte("schedule_date", monthEndStr);
      const existingByEmp = new Map<string, Set<string>>();
      for (const r of monthExisting ?? []) {
        if (!existingByEmp.has(r.employee_id)) existingByEmp.set(r.employee_id, new Set());
        existingByEmp.get(r.employee_id)!.add(r.schedule_date);
      }
      // Quem tem pelo menos 1 dia faltante no mês
      const toFill = employeesList.filter((e) => {
        const set = existingByEmp.get(e.id) ?? new Set();
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          if (!set.has(format(d, "yyyy-MM-dd"))) return true;
        }
        return false;
      });

      const newRows: any[] = [];
      await Promise.all(toFill.map(async (e) => {
        const { data: prev } = await supabase
          .from("work_schedules")
          .select("schedule_date, is_day_off, is_home_office, start_time, end_time, break_start, break_end, break_start_2, break_end_2")
          .eq("employee_id", e.id)
          .eq("store_id", storeId)
          .lt("schedule_date", monthStartStr)
          .order("schedule_date", { ascending: false })
          .limit(14);
        if (!prev || prev.length === 0) return;
        const byDow = new Map<number, any>();
        for (const r of prev) {
          const dow = new Date(r.schedule_date + "T00:00:00").getDay();
          if (!byDow.has(dow)) byDow.set(dow, r);
        }
        const existingSet = existingByEmp.get(e.id) ?? new Set();
        for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (existingSet.has(dateStr)) continue;
          const tpl = byDow.get(d.getDay());
          if (!tpl) continue;
          newRows.push({
            employee_id: e.id,
            store_id: storeId,
            schedule_date: dateStr,
            is_day_off: tpl.is_day_off,
            is_home_office: tpl.is_home_office ?? false,
            start_time: tpl.is_day_off ? null : tpl.start_time,
            end_time: tpl.is_day_off ? null : tpl.end_time,
            break_start: tpl.is_day_off ? null : tpl.break_start,
            break_end: tpl.is_day_off ? null : tpl.break_end,
            break_start_2: tpl.is_day_off ? null : tpl.break_start_2,
            break_end_2: tpl.is_day_off ? null : tpl.break_end_2,
            shift_id: null,
          });
        }
      }));
      if (newRows.length > 0) {
        for (let i = 0; i < newRows.length; i += 500) {
          await supabase.from("work_schedules").insert(newRows.slice(i, i + 500));
        }
        const { data: weekRows } = await supabase
          .from("work_schedules")
          .select("id, employee_id, schedule_date, is_day_off, is_home_office, start_time, end_time, break_start, break_end, break_start_2, break_end_2, store_id, notes")
          .eq("store_id", storeId)
          .in("employee_id", toFill.map((e) => e.id))
          .gte("schedule_date", weekStartStr)
          .lte("schedule_date", weekEndStr);
        if (weekRows) {
          const seen = new Set(currentSchedules.map((s) => s.id));
          for (const r of weekRows as Schedule[]) if (!seen.has(r.id)) currentSchedules.push(r);
        }
      }
    }

    setEmployees(employeesList);
    setSchedules(currentSchedules);
  };

  useEffect(() => { init(); }, []);
  useEffect(() => { loadStoreData(); }, [storeId, weekStart]);

  const getCell = (employeeId: string, date: Date) =>
    schedules.find((s) => s.employee_id === employeeId && s.schedule_date === format(date, "yyyy-MM-dd"));

  const openCellDialog = (emp: Employee, date: Date) => {
    const existing = getCell(emp.id, date);
    setCellForm({
      employeeId: emp.id,
      employeeName: emp.full_name,
      date,
      mode: existing
        ? (existing.is_home_office ? "home_office" : existing.is_day_off ? "off" : "work")
        : "none",
      start_time: existing?.start_time?.slice(0, 5) || "08:00",
      end_time: existing?.end_time?.slice(0, 5) || "17:00",
      break_start: existing?.break_start?.slice(0, 5) || "12:00",
      break_end: existing?.break_end?.slice(0, 5) || "13:00",
      has_second_break: !!(existing?.break_start_2 && existing?.break_end_2),
      break_start_2: existing?.break_start_2?.slice(0, 5) || "15:30",
      break_end_2: existing?.break_end_2?.slice(0, 5) || "15:45",
    });
    setCellDialog(true);
  };

  const saveCell = async () => {
    if (!cellForm) return;
    const dateStr = format(cellForm.date, "yyyy-MM-dd");
    const existing = getCell(cellForm.employeeId, cellForm.date);
    const emp = employees.find((e) => e.id === cellForm.employeeId);

    if (cellForm.mode === "none") {
      if (existing) await supabase.from("work_schedules").delete().eq("id", existing.id);
    } else {
      const isDayOff = cellForm.mode === "off";
      const isHomeOffice = cellForm.mode === "home_office";
      const isWork = cellForm.mode === "work" || isHomeOffice;
      if (!emp?.work_schedule) {
        toast({ title: "Atenção", description: "Colaborador sem escala definida no cadastro.", variant: "default" });
      }
      const err = await validateScheduleRule({
        employeeId: cellForm.employeeId,
        workSchedule: emp?.work_schedule ?? null,
        date: dateStr,
        isDayOff,
        existingId: existing?.id ?? null,
        startTime: isWork ? cellForm.start_time : null,
        endTime: isWork ? cellForm.end_time : null,
      });
      if (err) { toast({ title: "Regra de escala", description: err, variant: "destructive" }); return; }

      const payload: any = {
        employee_id: cellForm.employeeId,
        store_id: storeId,
        schedule_date: dateStr,
        is_day_off: isDayOff,
        is_home_office: isHomeOffice,
        start_time: isWork ? cellForm.start_time : null,
        end_time: isWork ? cellForm.end_time : null,
        break_start: isWork ? cellForm.break_start : null,
        break_end: isWork ? cellForm.break_end : null,
        break_start_2: isWork && cellForm.has_second_break ? cellForm.break_start_2 : null,
        break_end_2: isWork && cellForm.has_second_break ? cellForm.break_end_2 : null,
        shift_id: null,
      };
      if (existing) await supabase.from("work_schedules").update(payload).eq("id", existing.id);
      else await supabase.from("work_schedules").insert(payload);
    }
    setCellDialog(false);
    loadStoreData();
  };

  const generateSchedule = async () => {
    if (!assignForm.employeeId) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    const emp = employees.find((e) => e.id === assignForm.employeeId);
    const sched = (emp?.work_schedule || "").trim().toLowerCase();
    if (!sched) {
      toast({ title: "Escala não definida", description: "Defina a escala no cadastro do colaborador antes de gerar.", variant: "destructive" });
      return;
    }
    if (!["5x2", "6x1", "12x36"].includes(sched)) {
      toast({ title: "Escala não suportada", description: `A escala "${sched}" não é gerada automaticamente. Use a grade da semana.`, variant: "destructive" });
      return;
    }
    const expectedOff = sched === "5x2" ? 2 : sched === "6x1" ? 1 : null;
    if (expectedOff !== null && assignForm.offWeekdays.length !== expectedOff) {
      toast({ title: "Quantidade de folgas inválida", description: `Escala ${sched} exige ${expectedOff} folga(s) por semana.`, variant: "destructive" });
      return;
    }

    if (sched === "12x36") {
      const [sh, sm] = assignForm.entry.split(":").map(Number);
      const [eh, em] = assignForm.exit.split(":").map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      if (mins > 12 * 60) {
        toast({ title: "Jornada acima de 12h", description: "Escala 12x36 permite no máximo 12h/dia.", variant: "destructive" });
        return;
      }
    }

    setAssignSaving(true);
    const start = new Date(assignForm.startDate + "T00:00:00");
    // Gera até o último dia do mês da data de início
    const end = endOfMonth(start);

    const rows: any[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, "yyyy-MM-dd");
      let isOff = false;
      if (sched === "12x36") {
        const diffDays = Math.round((d.getTime() - start.getTime()) / 86400000);
        isOff = diffDays % 2 === 1;
      } else {
        isOff = assignForm.offWeekdays.includes(d.getDay());
      }
      rows.push({
        employee_id: assignForm.employeeId,
        store_id: storeId,
        schedule_date: dateStr,
        is_day_off: isOff,
        start_time: isOff ? null : assignForm.entry,
        end_time: isOff ? null : assignForm.exit,
        break_start: isOff ? null : assignForm.breakStart,
        break_end: isOff ? null : assignForm.breakEnd,
        break_start_2: isOff || !assignForm.hasSecondBreak ? null : assignForm.breakStart2,
        break_end_2: isOff || !assignForm.hasSecondBreak ? null : assignForm.breakEnd2,
        shift_id: null,
      });
    }

    const { error: delErr } = await supabase
      .from("work_schedules")
      .delete()
      .eq("employee_id", assignForm.employeeId)
      .gte("schedule_date", format(start, "yyyy-MM-dd"))
      .lte("schedule_date", format(end, "yyyy-MM-dd"));
    if (delErr) {
      setAssignSaving(false);
      toast({ title: "Erro ao limpar período", description: delErr.message, variant: "destructive" });
      return;
    }

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("work_schedules").insert(chunk);
      if (error) {
        setAssignSaving(false);
        toast({ title: "Erro ao gerar escala", description: error.message, variant: "destructive" });
        return;
      }
    }

    setAssignSaving(false);
    const offCount = rows.filter((r) => r.is_day_off).length;
    toast({ title: "Escala gerada", description: `${rows.length} dia(s) até ${format(end, "dd/MM")} (${offCount} folgas) para ${emp?.full_name}.` });
    loadStoreData();
  };

  const markNoSchedule = async () => {
    if (!assignForm.employeeId) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    const emp = employees.find((e) => e.id === assignForm.employeeId);
    if (!confirm(`Marcar "${emp?.full_name ?? "colaborador"}" como SEM escala?\n\nIsso vai:\n• Limpar todos os registros de escala\n• Zerar a escala no cadastro do colaborador`)) return;
    setMarkingNoSchedule(true);
    const { error: e1 } = await supabase
      .from("work_schedules")
      .delete()
      .eq("employee_id", assignForm.employeeId);
    if (e1) {
      setMarkingNoSchedule(false);
      toast({ title: "Erro ao limpar registros", description: e1.message, variant: "destructive" });
      return;
    }
    const { error: e2 } = await supabase
      .from("employees")
      .update({ work_schedule: null })
      .eq("id", assignForm.employeeId);
    setMarkingNoSchedule(false);
    if (e2) {
      toast({ title: "Erro ao atualizar cadastro", description: e2.message, variant: "destructive" });
      return;
    }
    toast({ title: "Colaborador marcado sem escala", description: `${emp?.full_name ?? ""} agora não possui escala definida.` });
    loadStoreData();
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("work_schedules").delete().eq("id", id);
    loadStoreData();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <CalendarClock className="h-7 w-7 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">Escala de Horários</h1>
            <p className="text-muted-foreground">Defina horários e folgas por colaborador</p>
          </div>
        </div>
        {tab === "grid" && (
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap shrink-0">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium px-2 whitespace-nowrap">
              {format(weekStart, "dd MMM", { locale: ptBR })} – {format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoje</Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="grid">Escala da semana</TabsTrigger>
          <TabsTrigger value="assign">Atribuir horário/folga</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-4">
          <ScheduleGrid
            storeId={storeId}
            stores={stores}
            employees={employees}
            schedules={schedules}
            leaves={leaves}
            days={days}
            onCellClick={openCellDialog}
          />
        </TabsContent>

        <TabsContent value="assign" className="space-y-4">
          <AssignScheduleForm
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            employees={employees}
            form={assignForm}
            setForm={setAssignForm}
            saving={assignSaving}
            onGenerate={generateSchedule}
            onMarkNoSchedule={markNoSchedule}
            markingNoSchedule={markingNoSchedule}
            onEmployeeUpdated={loadStoreData}
          />

          <Card>
            <CardHeader>
              <CardTitle>Atribuições da semana</CardTitle>
              <CardDescription>{format(weekStart, "dd/MM")} – {format(addDays(weekStart, 6), "dd/MM/yyyy")}</CardDescription>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atribuição na semana.</p>
              ) : (
                <ul className="divide-y">
                  {schedules
                    .slice()
                    .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))
                    .map((s) => {
                      const emp = employees.find((e) => e.id === s.employee_id);
                      return (
                        <li key={s.id} className="py-2 flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20">
                            {format(new Date(s.schedule_date + "T00:00:00"), "dd/MM EEE", { locale: ptBR })}
                          </span>
                          <span className="font-medium flex-1">{emp?.full_name ?? "—"}</span>
                          {s.is_day_off ? (
                            <Badge variant="secondary">Folga</Badge>
                          ) : s.is_home_office ? (
                            <Badge className="bg-blue-500 hover:bg-blue-500 text-white gap-1">
                              <Home className="h-3 w-3" />Home office
                            </Badge>
                          ) : s.start_time ? (
                            <span className="text-sm">{s.start_time.slice(0,5)} – {s.end_time?.slice(0,5)}</span>
                          ) : (
                            <Badge variant="outline">Trabalho</Badge>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteEntry(s.id)} aria-label="Remover">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <CellEditDialog
        open={cellDialog}
        onOpenChange={setCellDialog}
        form={cellForm}
        setForm={setCellForm}
        onSave={saveCell}
      />
    </div>
  );
}
