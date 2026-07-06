import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plane, Plus, AlertTriangle, Loader2, Trash2, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { RISK_LABEL, RISK_BADGE, STATUS_LABEL, formatDate, type VacationRisk, type VacationStatus } from "@/lib/vacation";

interface VacationReceipt {
  id: string;
  vacation_schedule_id: string;
  gross_total: number;
  net_total: number;
  payment_status: string;
  payment_due_date: string | null;
  pdf_url: string | null;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  store_id: string;
  admission_date: string | null;
  hire_date: string | null;
  status: string;
}

interface Schedule {
  id: string;
  employee_id: string;
  acquisition_start: string;
  acquisition_end: string;
  installment_number: number;
  start_date: string;
  end_date: string;
  days_count: number;
  sell_days: number;
  status: string;
  notes: string | null;
}

interface Row {
  employee: EmployeeRow;
  status: VacationStatus | null;
  schedules: Schedule[];
}

const calcAcquisitions = (hire: string): { start: string; end: string }[] => {
  const out: { start: string; end: string }[] = [];
  const hireDate = new Date(hire + "T00:00:00");
  const today = new Date();
  let s = new Date(hireDate);
  while (true) {
    const e = new Date(s);
    e.setMonth(e.getMonth() + 12);
    if (e > today) {
      // próximo aquisitivo (futuro) ainda incluímos para planejamento antecipado
      out.push({ start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) });
      break;
    }
    out.push({ start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) });
    s = e;
    if (out.length > 30) break;
  }
  return out;
};

export default function Vacations() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [receiptMap, setReceiptMap] = useState<Record<string, VacationReceipt>>({});
  const [filter, setFilter] = useState<"all" | VacationRisk>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [form, setForm] = useState({
    acquisition_start: "",
    acquisition_end: "",
    start_date: "",
    end_date: "",
    sell_days: "0",
    status: "pending",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: emps } = await supabase
      .from("employees")
      .select("id, full_name, store_id, admission_date, hire_date, status")
      .eq("status", "active")
      .order("full_name");
    const list = (emps ?? []) as EmployeeRow[];

    const schedRes = await supabase
      .from("vacation_schedules" as any)
      .select("*")
      .order("start_date", { ascending: true });
    const allSchedules = ((schedRes.data ?? []) as unknown) as Schedule[];

    const statuses: Record<string, VacationStatus | null> = {};
    await Promise.all(
      list.map(async (e) => {
        const { data } = await supabase.rpc("employee_vacation_status" as any, { _employee_id: e.id } as any);
        const arr = (data ?? []) as unknown as VacationStatus[];
        statuses[e.id] = arr[0] ?? null;
      }),
    );

    const newRows: Row[] = list.map((e) => ({
      employee: e,
      status: statuses[e.id],
      schedules: allSchedules.filter((s) => s.employee_id === e.id),
    }));
    setRows(newRows);

    const scheduleIds = allSchedules.map((s) => s.id);
    if (scheduleIds.length > 0) {
      const { data: recData } = await supabase
        .from("vacation_receipts" as any)
        .select("id, vacation_schedule_id, gross_total, net_total, payment_status, payment_due_date, pdf_url")
        .in("vacation_schedule_id", scheduleIds);
      const map: Record<string, VacationReceipt> = {};
      ((recData ?? []) as any[]).forEach((r) => { map[r.vacation_schedule_id] = r as VacationReceipt; });
      setReceiptMap(map);
    } else {
      setReceiptMap({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const counts = { ok: 0, warning: 0, critical: 0, expired: 0 };
    rows.forEach((r) => {
      if (r.status) counts[r.status.risk_level]++;
    });
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status?.risk_level === filter);
  }, [rows, filter]);

  const openDialog = (employeeId: string) => {
    const row = rows.find((r) => r.employee.id === employeeId);
    setSelectedEmployeeId(employeeId);
    // Pré-preenche com o aquisitivo do status (já vencido) ou, no 1º ano, com o aquisitivo em curso (admissão → +12m).
    let preStart = row?.status?.acquisition_start ?? "";
    let preEnd = row?.status?.acquisition_end ?? "";
    if (!preStart) {
      const hire = row?.employee.admission_date ?? row?.employee.hire_date;
      if (hire) {
        const opts = calcAcquisitions(hire);
        if (opts.length > 0) {
          preStart = opts[0].start;
          preEnd = opts[0].end;
        }
      }
    }
    setForm({
      acquisition_start: preStart,
      acquisition_end: preEnd,
      start_date: "",
      end_date: "",
      sell_days: "0",
      status: "pending",
      notes: "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEmployeeId) return;
    if (!form.acquisition_start || !form.acquisition_end || !form.start_date || !form.end_date) {
      toast({ title: "Preencha período aquisitivo e datas", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("vacation_schedules" as any).insert({
      employee_id: selectedEmployeeId,
      acquisition_start: form.acquisition_start,
      acquisition_end: form.acquisition_end,
      start_date: form.start_date,
      end_date: form.end_date,
      sell_days: Number(form.sell_days) || 0,
      status: form.status,
      notes: form.notes || null,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Programação salva" });
    setDialogOpen(false);
    load();
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("vacation_schedules" as any)
      .update({ status: "approved", approved_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Programação aprovada" });
    load();
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancelar esta programação?")) return;
    const { error } = await supabase
      .from("vacation_schedules" as any)
      .update({ status: "cancelled" } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cancelada" });
    load();
  };

  const selectedEmployee = rows.find((r) => r.employee.id === selectedEmployeeId)?.employee;
  const acquisitionOptions = useMemo(() => {
    const hire = selectedEmployee?.admission_date ?? selectedEmployee?.hire_date;
    if (!hire) return [];
    return calcAcquisitions(hire);
  }, [selectedEmployee]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Plane className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Programação de Férias
          </h1>
          <p className="text-muted-foreground">
            Regra CLT: 12 meses para conquistar + 12 meses para usar (limite 24 meses sob risco de multa em dobro).
          </p>
        </div>
      </div>

      {(summary.expired > 0 || summary.critical > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenção: férias em risco de multa</AlertTitle>
          <AlertDescription>
            {summary.expired > 0 && <><strong>{summary.expired}</strong> colaborador(es) com período concessivo vencido. </>}
            {summary.critical > 0 && <><strong>{summary.critical}</strong> a menos de 30 dias do limite. </>}
            Programe as férias o quanto antes para evitar pagamento em dobro.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["ok", "warning", "critical", "expired"] as VacationRisk[]).map((r) => (
          <Card
            key={r}
            className={`cursor-pointer transition ${filter === r ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter(filter === r ? "all" : r)}
          >
            <CardHeader className="pb-2">
              <CardDescription>{RISK_LABEL[r]}</CardDescription>
              <CardTitle className="text-3xl">{summary[r]}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Colaboradores</CardTitle>
              <CardDescription>
                {filter === "all" ? "Todos os colaboradores ativos" : `Filtrando: ${RISK_LABEL[filter]}`}
              </CardDescription>
            </div>
            {filter !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                Limpar filtro
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum colaborador nesta condição.</p>
          ) : (() => {
            // Agrupa por categoria de risco; "first_year" para quem ainda não fechou o 1º aquisitivo.
            type GroupKey = VacationRisk | "first_year";
            const GROUP_ORDER: GroupKey[] = ["expired", "critical", "warning", "ok", "first_year"];
            const GROUP_LABEL: Record<GroupKey, string> = {
              expired: "Vencido",
              critical: "Crítico (até 30 dias)",
              warning: "Atenção (até 60 dias)",
              ok: "Em dia",
              first_year: "Ainda no 1º ano",
            };
            const GROUP_DOT: Record<GroupKey, string> = {
              expired: "bg-red-500",
              critical: "bg-orange-500",
              warning: "bg-amber-500",
              ok: "bg-emerald-500",
              first_year: "bg-muted-foreground",
            };
            const groups: Record<GroupKey, typeof filteredRows> = {
              expired: [], critical: [], warning: [], ok: [], first_year: [],
            };
            filteredRows.forEach((r) => {
              const k: GroupKey = r.status?.risk_level ?? "first_year";
              groups[k].push(r);
            });
            const visibleGroups = GROUP_ORDER.filter((g) => groups[g].length > 0);
            // Abre por padrão os grupos críticos.
            const defaultOpen = visibleGroups.filter((g) => g === "expired" || g === "critical");

            return (
              <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
                {visibleGroups.map((g) => (
                  <AccordionItem key={g} value={g}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`h-2.5 w-2.5 rounded-full ${GROUP_DOT[g]}`} />
                        <span className="font-medium">{GROUP_LABEL[g]}</span>
                        <Badge variant="secondary" className="ml-1">{groups[g].length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {/* Mobile: cards */}
                      <div className="md:hidden space-y-2 pt-1">
                        {groups[g].map((r) => (
                          <div key={r.employee.id} className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm">{r.employee.full_name}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  Admissão: {formatDate(r.employee.admission_date ?? r.employee.hire_date)}
                                </div>
                              </div>
                              {r.status ? (
                                <Badge variant="outline" className={`${RISK_BADGE[r.status.risk_level]} shrink-0`}>
                                  {RISK_LABEL[r.status.risk_level]}
                                </Badge>
                              ) : <Badge variant="outline" className="shrink-0">1º ano</Badge>}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded bg-muted/50 p-2">
                                <div className="text-muted-foreground">Aquisitivo</div>
                                <div className="font-medium">
                                  {r.status
                                    ? `${formatDate(r.status.acquisition_start)} → ${formatDate(r.status.acquisition_end)}`
                                    : "Ainda no 1º ano"}
                                </div>
                              </div>
                              <div className="rounded bg-muted/50 p-2">
                                <div className="text-muted-foreground">Limite</div>
                                <div className="font-medium">
                                  {r.status ? formatDate(r.status.concessive_end) : "—"}
                                </div>
                                {r.status && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {r.status.days_until_deadline >= 0
                                      ? `em ${r.status.days_until_deadline} dias`
                                      : `${Math.abs(r.status.days_until_deadline)} dias atrás`}
                                  </div>
                                )}
                              </div>
                              <div className="rounded bg-muted/50 p-2">
                                <div className="text-muted-foreground">Programados</div>
                                <div className="font-medium">{r.status?.days_scheduled ?? 0}</div>
                              </div>
                              <div className="rounded bg-muted/50 p-2">
                                <div className="text-muted-foreground">Restantes</div>
                                <div className="font-medium">{r.status?.days_remaining ?? "—"}</div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDialog(r.employee.id)}
                              className="w-full gap-1"
                            >
                              <Plus className="h-3 w-3" /> Agendar
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Desktop: table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Colaborador</TableHead>
                              <TableHead>Admissão</TableHead>
                              <TableHead>Aquisitivo</TableHead>
                              <TableHead>Limite</TableHead>
                              <TableHead className="text-center">Dias programados</TableHead>
                              <TableHead className="text-center">Restantes</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groups[g].map((r) => (
                              <TableRow key={r.employee.id}>
                                <TableCell className="font-medium">{r.employee.full_name}</TableCell>
                                <TableCell className="text-sm whitespace-nowrap">
                                  {formatDate(r.employee.admission_date ?? r.employee.hire_date)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {r.status
                                    ? `${formatDate(r.status.acquisition_start)} → ${formatDate(r.status.acquisition_end)}`
                                    : <span className="text-muted-foreground">Ainda no 1º ano</span>}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {r.status ? (
                                    <>
                                      {formatDate(r.status.concessive_end)}
                                      <div className="text-xs text-muted-foreground">
                                        {r.status.days_until_deadline >= 0
                                          ? `em ${r.status.days_until_deadline} dias`
                                          : `${Math.abs(r.status.days_until_deadline)} dias atrás`}
                                      </div>
                                    </>
                                  ) : "—"}
                                </TableCell>
                                <TableCell className="text-center">{r.status?.days_scheduled ?? 0}</TableCell>
                                <TableCell className="text-center">{r.status?.days_remaining ?? "—"}</TableCell>
                                <TableCell>
                                  {r.status ? (
                                    <Badge variant="outline" className={RISK_BADGE[r.status.risk_level]}>
                                      {RISK_LABEL[r.status.risk_level]}
                                    </Badge>
                                  ) : <Badge variant="outline">1º ano</Badge>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDialog(r.employee.id)}
                                    className="gap-1"
                                  >
                                    <Plus className="h-3 w-3" /> Agendar
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programações cadastradas</CardTitle>
          <CardDescription>Lista completa de períodos agendados.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.flatMap((r) => r.schedules.map((s) => ({ ...s, name: r.employee.full_name }))).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma programação cadastrada.</p>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden space-y-2">
                {rows
                  .flatMap((r) => r.schedules.map((s) => ({ ...s, name: r.employee.full_name })))
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((s) => (
                    <div key={s.id} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm min-w-0 flex-1">{s.name}</div>
                        <Badge variant={s.status === "cancelled" ? "outline" : "secondary"} className="shrink-0">
                          {STATUS_LABEL[s.status] ?? s.status}
                        </Badge>
                      </div>
                      <div className="text-xs space-y-1">
                        <div><span className="text-muted-foreground">Período:</span> <span className="font-mono">{formatDate(s.start_date)} → {formatDate(s.end_date)}</span></div>
                        <div className="flex gap-3">
                          <span><span className="text-muted-foreground">Dias:</span> <strong>{s.days_count}</strong></span>
                          <span><span className="text-muted-foreground">Abono:</span> <strong>{s.sell_days > 0 ? `${s.sell_days} d` : "—"}</strong></span>
                        </div>
                      </div>
                      {(s.status === "pending" || (s.status !== "cancelled" && s.status !== "completed")) && (
                        <div className="flex gap-2 pt-1">
                          {s.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => handleApprove(s.id)} className="flex-1 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Aprovar
                            </Button>
                          )}
                          {s.status !== "cancelled" && s.status !== "completed" && (
                            <Button size="sm" variant="ghost" onClick={() => handleCancel(s.id)} className="flex-1 gap-1 text-destructive">
                              <Trash2 className="h-3 w-3" /> Cancelar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead>Abono</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows
                      .flatMap((r) => r.schedules.map((s) => ({ ...s, name: r.employee.full_name })))
                      .sort((a, b) => a.start_date.localeCompare(b.start_date))
                      .map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{formatDate(s.start_date)} → {formatDate(s.end_date)}</TableCell>
                          <TableCell>{s.days_count}</TableCell>
                          <TableCell>{s.sell_days > 0 ? `${s.sell_days} d` : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={s.status === "cancelled" ? "outline" : "secondary"}>
                              {STATUS_LABEL[s.status] ?? s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {s.status === "pending" && (
                              <Button size="sm" variant="outline" onClick={() => handleApprove(s.id)} className="gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Aprovar
                              </Button>
                            )}
                            {s.status !== "cancelled" && s.status !== "completed" && (
                              <Button size="sm" variant="ghost" onClick={() => handleCancel(s.id)} className="gap-1 text-destructive">
                                <Trash2 className="h-3 w-3" /> Cancelar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendar férias — {selectedEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              Admissão: <strong>{formatDate(selectedEmployee?.admission_date ?? selectedEmployee?.hire_date)}</strong>.
              Até 3 parcelas por aquisitivo, mín. 5 dias cada e ao menos uma com 14+ dias quando parcelar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Período aquisitivo</Label>
              <Select
                value={form.acquisition_start}
                onValueChange={(v) => {
                  const opt = acquisitionOptions.find((o) => o.start === v);
                  setForm({ ...form, acquisition_start: v, acquisition_end: opt?.end ?? "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {acquisitionOptions.map((o) => (
                    <SelectItem key={o.start} value={o.start}>
                      {formatDate(o.start)} → {formatDate(o.end)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início das férias</Label>
                <Input type="date" value={form.start_date} min={form.acquisition_end}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Fim das férias</Label>
                <Input type="date" value={form.end_date} min={form.start_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Abono pecuniário (dias)</Label>
                <Input type="number" min={0} max={10} value={form.sell_days}
                  onChange={(e) => setForm({ ...form, sell_days: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="approved">Aprovada</SelectItem>
                    <SelectItem value="completed">Concluída (já gozada)</SelectItem>
                  </SelectContent>
                </Select>
                {form.status === "completed" && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Use para registrar férias passadas. As datas devem ser as reais em que foram gozadas.
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar programação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
