import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ListChecks, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sortStores } from "@/lib/storeSort";

type Periodicity = "once" | "daily" | "weekly" | "biweekly" | "monthly";
type Scope = "employee" | "store";

interface Task {
  id: string;
  title: string;
  description: string | null;
  periodicity: Periodicity;
  scope: Scope;
  employee_id: string | null;
  store_id: string | null;
  is_active: boolean;
  is_required: boolean;
  created_at: string;
}

const PERIOD_LABEL: Record<Periodicity, string> = {
  once: "Somente uma vez",
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

interface FormState {
  title: string;
  description: string;
  periodicity: Periodicity;
  scope: Scope;
  employee_id: string;
  store_id: string;
  is_active: boolean;
  is_required: boolean;
}

const EMPTY: FormState = {
  title: "",
  description: "",
  periodicity: "daily",
  scope: "employee",
  employee_id: "",
  store_id: "",
  is_active: true,
  is_required: false,
};

const periodStart = (p: Periodicity): string => {
  const d = new Date();
  if (p === "once") return "1970-01-01";
  if (p === "daily") return d.toISOString().slice(0, 10);
  if (p === "weekly") {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  if (p === "biweekly") {
    const day = d.getDate();
    if (day <= 15) return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    return new Date(d.getFullYear(), d.getMonth(), 16).toISOString().slice(0, 10);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function ManageTasksPanel() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; store_id: string; allocated_store_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // status panel
  const [statusTaskId, setStatusTaskId] = useState<string | null>(null);
  const [statusRows, setStatusRows] = useState<{ employee_id: string; full_name: string; done: boolean; completed_at: string | null }[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  // progress per task for current period
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});

  const computeProgress = async (
    ts: Task[],
    emps: { id: string; store_id: string; allocated_store_id: string | null }[],
  ) => {
    if (ts.length === 0) { setProgress({}); return; }
    const ids = ts.map((t) => t.id);
    const { data: comps } = await supabase
      .from("employee_task_completions")
      .select("task_id, employee_id, period_start")
      .in("task_id", ids);
    const result: Record<string, { done: number; total: number }> = {};
    for (const t of ts) {
      const targets = t.scope === "employee" && t.employee_id
        ? emps.filter((e) => e.id === t.employee_id)
        : t.scope === "store" && t.store_id
          ? emps.filter((e) => e.store_id === t.store_id || e.allocated_store_id === t.store_id)
          : [];
      const total = targets.length;
      const ps = periodStart(t.periodicity);
      const targetIds = new Set(targets.map((e) => e.id));
      const doneSet = new Set(
        (comps ?? [])
          .filter((c: any) => c.task_id === t.id && c.period_start === ps && targetIds.has(c.employee_id))
          .map((c: any) => c.employee_id),
      );
      result[t.id] = { done: doneSet.size, total };
    }
    setProgress(result);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: ts }, { data: st }, { data: emps }] = await Promise.all([
      supabase.from("employee_tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase
        .from("employees")
        .select("id, full_name, store_id, allocated_store_id")
        .eq("status", "active")
        .order("full_name"),
    ]);
    const taskList = (ts ?? []) as Task[];
    setTasks(taskList);
    setStores(sortStores(st ?? []));
    setEmployees(emps ?? []);
    await computeProgress(taskList, (emps ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      periodicity: t.periodicity,
      scope: t.scope,
      employee_id: t.employee_id ?? "",
      store_id: t.store_id ?? "",
      is_active: t.is_active,
      is_required: t.is_required,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    if (form.scope === "employee" && !form.employee_id) { toast({ title: "Selecione o colaborador", variant: "destructive" }); return; }
    if (form.scope === "store" && !form.store_id) { toast({ title: "Selecione a loja", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      periodicity: form.periodicity,
      scope: form.scope,
      employee_id: form.scope === "employee" ? form.employee_id : null,
      store_id: form.scope === "store" ? form.store_id : null,
      is_active: form.is_active,
      is_required: form.is_required,
      created_by: user?.id ?? null,
    };
    const { error } = editingId
      ? await supabase.from("employee_tasks").update(payload).eq("id", editingId)
      : await supabase.from("employee_tasks").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Tarefa atualizada" : "Tarefa criada" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta tarefa? As conclusões registradas também serão removidas.")) return;
    const { error } = await supabase.from("employee_tasks").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tarefa excluída" });
    load();
  };

  const toggleActive = async (t: Task) => {
    const { error } = await supabase.from("employee_tasks").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const openStatus = async (t: Task) => {
    setStatusTaskId(t.id);
    setStatusLoading(true);
    // Quem é alvo da tarefa?
    let targetEmployees: typeof employees = [];
    if (t.scope === "employee" && t.employee_id) {
      targetEmployees = employees.filter((e) => e.id === t.employee_id);
    } else if (t.scope === "store" && t.store_id) {
      targetEmployees = employees.filter((e) => e.store_id === t.store_id || e.allocated_store_id === t.store_id);
    }
    const ps = periodStart(t.periodicity);
    const { data: comps } = await supabase
      .from("employee_task_completions")
      .select("employee_id, completed_at")
      .eq("task_id", t.id)
      .eq("period_start", ps);
    const map = new Map((comps ?? []).map((c: any) => [c.employee_id, c.completed_at]));
    setStatusRows(
      targetEmployees.map((e) => ({
        employee_id: e.id,
        full_name: e.full_name,
        done: map.has(e.id),
        completed_at: map.get(e.id) ?? null,
      })),
    );
    setStatusLoading(false);
  };

  const targetLabel = (t: Task) => {
    if (t.scope === "store") return `Loja: ${stores.find((s) => s.id === t.store_id)?.name ?? "—"}`;
    return `Colaborador: ${employees.find((e) => e.id === t.employee_id)?.full_name ?? "—"}`;
  };

  const statusTask = tasks.find((t) => t.id === statusTaskId) || null;

  return (
    <Tabs defaultValue="list" className="space-y-4">
      <TabsList>
        <TabsTrigger value="list" className="gap-2"><ListChecks className="h-4 w-4" />Tarefas</TabsTrigger>
        <TabsTrigger value="status" className="gap-2" disabled={!statusTaskId}>
          <Eye className="h-4 w-4" />Status atual
        </TabsTrigger>
      </TabsList>

      <TabsContent value="list" className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova tarefa</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Título</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Periodicidade</Label>
                    <Select value={form.periodicity} onValueChange={(v: Periodicity) => setForm({ ...form, periodicity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Somente uma vez</SelectItem>
                        <SelectItem value="daily">Diária</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Atribuir para</Label>
                    <Select value={form.scope} onValueChange={(v: Scope) => setForm({ ...form, scope: v, employee_id: "", store_id: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Um colaborador</SelectItem>
                        <SelectItem value="store">Uma loja inteira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.scope === "employee" && (
                  <div>
                    <Label>Colaborador</Label>
                    <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.scope === "store" && (
                  <div>
                    <Label>Loja</Label>
                    <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <Label className="cursor-pointer">Obrigatória para bater ponto</Label>
                    <p className="text-xs text-muted-foreground">
                      Se ativada, o colaborador só consegue bater a saída do dia após concluir esta tarefa no período atual.
                    </p>
                  </div>
                  <Switch checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label className="cursor-pointer">Ativa</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg sm:text-xl">Tarefas cadastradas</CardTitle></CardHeader>
          <CardContent className="px-3 sm:px-6">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa cadastrada.</p>
            ) : (
              <ul className="space-y-3 sm:space-y-0 sm:divide-y">
                {tasks.map((t) => {
                  const p = progress[t.id] ?? { done: 0, total: 0 };
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                  return (
                    <li
                      key={t.id}
                      className="rounded-lg border bg-card p-3 sm:border-0 sm:rounded-none sm:bg-transparent sm:p-0 sm:py-3"
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        <ListChecks className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base leading-snug break-words">{t.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">{PERIOD_LABEL[t.periodicity]}</Badge>
                            <Badge variant="outline" className="text-[10px] sm:text-xs max-w-full truncate">{targetLabel(t)}</Badge>
                            {t.is_required && <Badge variant="destructive" className="text-[10px] sm:text-xs">Obrigatória p/ ponto</Badge>}
                            {!t.is_active && <Badge variant="outline" className="text-[10px] sm:text-xs">Inativa</Badge>}
                          </div>
                          {t.description && (
                            <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap mt-2">{t.description}</p>
                          )}
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground gap-2">
                              <span className="truncate">Progresso ({PERIOD_LABEL[t.periodicity].toLowerCase()})</span>
                              <span className="font-medium text-foreground shrink-0">{p.done}/{p.total} ({pct}%)</span>
                            </div>
                            <Progress value={pct} className="h-2" />
                          </div>
                          <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
                            Criada em {format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t sm:border-t-0 sm:pt-0 sm:mt-2 sm:pl-8">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                          <span>{t.is_active ? "Ativa" : "Inativa"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" title="Status atual" onClick={() => openStatus(t)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => remove(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="status">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Status: {statusTask?.title}
            </CardTitle>
            {statusTask && (
              <p className="text-sm text-muted-foreground">
                Período atual ({PERIOD_LABEL[statusTask.periodicity]}) — concluídas: {statusRows.filter((r) => r.done).length} / {statusRows.length}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : statusRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum colaborador alvo encontrado.</p>
            ) : (
              <ul className="divide-y">
                {statusRows.map((r) => (
                  <li key={r.employee_id} className="py-2 flex items-center justify-between text-sm">
                    <span>{r.full_name}</span>
                    {r.done ? (
                      <Badge variant="default" className="gap-1">
                        Concluída {r.completed_at && `· ${format(new Date(r.completed_at), "dd/MM HH:mm")}`}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pendente</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
