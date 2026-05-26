import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, CalendarClock, MapPin, Link2, Pencil, Trash2, Video, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sortStores } from "@/lib/storeSort";

type Scope = "all" | "store" | "employee" | "employees";
type Status = "scheduled" | "cancelled" | "done";

interface Appointment {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  start_at: string;
  end_at: string | null;
  scope: Scope;
  store_id: string | null;
  employee_id: string | null;
  reminder_offsets_min: number[];
  status: Status;
  created_at: string;
}

const SCOPE_LABEL: Record<Scope, string> = { all: "Todos", store: "Loja", employee: "Colaborador", employees: "Colaboradores" };
const STATUS_LABEL: Record<Status, string> = { scheduled: "Agendado", cancelled: "Cancelado", done: "Concluído" };
const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "default", cancelled: "destructive", done: "secondary",
};

const REMINDER_OPTIONS = [
  { v: 15, l: "15 min antes" },
  { v: 30, l: "30 min antes" },
  { v: 60, l: "1 hora antes" },
  { v: 180, l: "3 horas antes" },
  { v: 1440, l: "1 dia antes" },
  { v: 2880, l: "2 dias antes" },
  { v: 10080, l: "1 semana antes" },
];

interface FormState {
  title: string;
  description: string;
  location: string;
  meeting_url: string;
  start_at: string;
  end_at: string;
  scope: Scope;
  store_id: string;
  employee_id: string;
  employee_ids: string[];
  reminders: number[];
  status: Status;
}

const EMPTY: FormState = {
  title: "", description: "", location: "", meeting_url: "",
  start_at: "", end_at: "",
  scope: "all", store_id: "", employee_id: "", employee_ids: [],
  reminders: [60, 1440],
  status: "scheduled",
};

export default function AppointmentsManagerPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<Appointment[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [{ data: apts }, { data: st }, { data: emps }] = await Promise.all([
      supabase.from("appointments").select("*").order("start_at", { ascending: true }),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id,full_name").eq("status", "active").order("full_name"),
    ]);
    setItems((apts as Appointment[]) || []);
    setStores(sortStores(st || []));
    setEmployees(emps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (a: Appointment) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      description: a.description ?? "",
      location: a.location ?? "",
      meeting_url: a.meeting_url ?? "",
      start_at: a.start_at ? a.start_at.slice(0, 16) : "",
      end_at: a.end_at ? a.end_at.slice(0, 16) : "",
      scope: a.scope,
      store_id: a.store_id ?? "",
      employee_id: a.employee_id ?? "",
      employee_ids: [],
      reminders: a.reminder_offsets_min ?? [],
      status: a.status,
    });
    setOpen(true);
  };

  const toggleReminder = (v: number) => {
    setForm((f) => ({
      ...f,
      reminders: f.reminders.includes(v) ? f.reminders.filter((x) => x !== v) : [...f.reminders, v].sort((a, b) => a - b),
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_at) {
      toast({ title: "Preencha título e data/hora de início", variant: "destructive" });
      return;
    }
    if (form.scope === "store" && !form.store_id) {
      toast({ title: "Selecione a loja", variant: "destructive" });
      return;
    }
    if (form.scope === "employee" && !form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    if (form.scope === "employees" && form.employee_ids.length === 0) {
      toast({ title: "Selecione ao menos um colaborador", variant: "destructive" });
      return;
    }
    setSaving(true);

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      meeting_url: form.meeting_url.trim() || null,
      start_at: new Date(form.start_at).toISOString(),
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      reminder_offsets_min: form.reminders,
      status: form.status,
      created_by: user?.id ?? null,
    };

    // Quando múltiplos colaboradores, cria 1 appointment por colaborador (scope=employee)
    if (!editingId && form.scope === "employees") {
      const rows = form.employee_ids.map((empId) => ({
        ...basePayload,
        scope: "employee" as const,
        store_id: null,
        employee_id: empId,
      }));
      const { data: inserted, error } = await supabase.from("appointments").insert(rows).select("id, employee_id, scope, store_id");
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      try {
        for (const row of inserted ?? []) {
          const { data: ann } = await supabase
            .from("hr_announcements")
            .insert({
              title: `📅 Novo compromisso: ${basePayload.title}`,
              message: buildAnnouncementMessage(basePayload, stores),
              priority: "high",
              scope: "employee",
              employee_id: (row as any).employee_id,
              send_push: true,
            })
            .select("id")
            .maybeSingle();
          if (ann?.id) {
            await supabase.functions.invoke("send-push-notification", { body: { announcement_id: ann.id } });
          }
        }
      } catch (e) {
        console.warn("Falha ao enviar notificação inicial", e);
      }
      toast({ title: `Compromisso criado para ${form.employee_ids.length} colaborador(es)` });
      setOpen(false);
      resetForm();
      load();
      setSaving(false);
      return;
    }

    const payload = {
      ...basePayload,
      scope: form.scope,
      store_id: form.scope === "store" ? form.store_id : null,
      employee_id: form.scope === "employee" ? form.employee_id : null,
    };
    const res = editingId
      ? await supabase.from("appointments").update(payload).eq("id", editingId)
      : await supabase.from("appointments").insert(payload);

    if (res.error) {
      toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Notificação imediata na criação
    if (!editingId) {
      try {
        const recipients = await resolveRecipients(payload.scope, payload.store_id, payload.employee_id, employees, stores);
        for (const empId of recipients) {
          const { data: ann } = await supabase
            .from("hr_announcements")
            .insert({
              title: `📅 Novo compromisso: ${payload.title}`,
              message: buildAnnouncementMessage(payload, stores),
              priority: "high",
              scope: "employee",
              employee_id: empId,
              send_push: true,
            })
            .select("id")
            .maybeSingle();
          if (ann?.id) {
            await supabase.functions.invoke("send-push-notification", { body: { announcement_id: ann.id } });
          }
        }
      } catch (e) {
        console.warn("Falha ao enviar notificação inicial", e);
      }
    }

    toast({ title: editingId ? "Compromisso atualizado" : "Compromisso criado" });
    setOpen(false);
    resetForm();
    load();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este compromisso?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Compromisso excluído" });
    load();
  };

  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";
  const empName = (id: string | null) => employees.find((e) => e.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">{items.length} compromisso(s)</div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Novo compromisso</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle>{editingId ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto px-6 py-2 flex-1 min-h-0">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Reunião mensal de equipe" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes, pauta, instruções..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Início *</Label>
                  <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Término</Label>
                  <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Local</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Sala de reuniões / Loja Centro" />
                </div>
                <div className="space-y-2">
                  <Label>Link da reunião online</Label>
                  <Input value={form.meeting_url} onChange={(e) => setForm({ ...form, meeting_url: e.target.value })} placeholder="https://meet.google.com/..." />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Destinatários</Label>
                  <Select
                    value={form.scope}
                    onValueChange={(v: Scope) =>
                      setForm({ ...form, scope: v, store_id: "", employee_id: "", employee_ids: [] })
                    }
                    disabled={!!editingId}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="store">Loja específica</SelectItem>
                      <SelectItem value="employee">Colaborador específico</SelectItem>
                      <SelectItem value="employees">Vários colaboradores</SelectItem>
                    </SelectContent>
                  </Select>
                  {editingId && (
                    <p className="text-xs text-muted-foreground">Destinatários não podem ser alterados na edição.</p>
                  )}
                </div>
                {form.scope === "store" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Loja</Label>
                    <Select value={form.store_id} onValueChange={(v) => setForm({ ...form, store_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}
                {form.scope === "employee" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Colaborador</Label>
                    <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{employees.map((e) => (<SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {form.scope === "employees" && !editingId && (
                <div className="space-y-2">
                  <Label>Colaboradores ({form.employee_ids.length} selecionado(s))</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select value={pendingEmployee} onValueChange={setPendingEmployee}>
                        <SelectTrigger><SelectValue placeholder="Selecione um colaborador..." /></SelectTrigger>
                        <SelectContent>
                          {employees
                            .filter((e) => !form.employee_ids.includes(e.id))
                            .map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                            ))}
                          {employees.filter((e) => !form.employee_ids.includes(e.id)).length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">Todos já adicionados</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="default"
                      disabled={!pendingEmployee}
                      onClick={() => {
                        if (!pendingEmployee) return;
                        setForm((f) => ({ ...f, employee_ids: [...f.employee_ids, pendingEmployee] }));
                        setPendingEmployee("");
                      }}
                      aria-label="Adicionar colaborador"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {form.employee_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 rounded-md border bg-muted/30">
                      {form.employee_ids.map((id) => {
                        const emp = employees.find((e) => e.id === id);
                        if (!emp) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1">
                            <span className="truncate max-w-[200px]">{emp.full_name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((f) => ({ ...f, employee_ids: f.employee_ids.filter((x) => x !== id) }))
                              }
                              className="ml-1 rounded-sm hover:bg-background/50 p-0.5"
                              aria-label={`Remover ${emp.full_name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setForm((f) => ({ ...f, employee_ids: employees.map((e) => e.id) }))}
                    >Selecionar todos</Button>
                    {form.employee_ids.length > 0 && (
                      <Button
                        type="button" size="sm" variant="ghost"
                        onClick={() => setForm((f) => ({ ...f, employee_ids: [] }))}
                      >Limpar</Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Será criado um compromisso individual para cada colaborador adicionado.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Lembretes automáticos</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-md border bg-muted/30">
                  {REMINDER_OPTIONS.map((r) => (
                    <label key={r.v} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={form.reminders.includes(r.v)} onCheckedChange={() => toggleReminder(r.v)} />
                      <span className="text-sm">{r.l}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Os colaboradores receberão notificação push e aviso interno em cada lembrete configurado.</p>
              </div>

              {editingId && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v: Status) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Agendado</SelectItem>
                      <SelectItem value="done">Concluído</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background flex-row justify-end gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Nenhum compromisso agendado.</div>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border p-3 space-y-2 bg-card overflow-hidden">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <CalendarClock className="h-5 w-5 text-primary shrink-0" />
                  <div className="font-semibold min-w-0 break-words">{a.title}</div>
                  <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {a.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{a.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>📅 {format(new Date(a.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                {a.end_at && <span>até {format(new Date(a.end_at), "HH:mm", { locale: ptBR })}</span>}
                {a.location && <span className="flex items-center gap-1 break-words"><MapPin className="h-3 w-3 shrink-0" />{a.location}</span>}
                {a.meeting_url && (
                  <a href={a.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline break-all">
                    <Video className="h-3 w-3 shrink-0" />Link da reunião
                  </a>
                )}
                <span className="break-words">👥 {SCOPE_LABEL[a.scope]}{a.scope === "store" ? `: ${storeName(a.store_id)}` : a.scope === "employee" ? `: ${empName(a.employee_id)}` : ""}</span>
                {a.reminder_offsets_min?.length > 0 && (
                  <span className="break-words">🔔 {a.reminder_offsets_min.map((m) => REMINDER_OPTIONS.find((o) => o.v === m)?.l ?? `${m}min`).join(", ")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function resolveRecipients(
  scope: Scope,
  storeId: string | null,
  employeeId: string | null,
  allEmployees: { id: string; full_name: string }[],
  _stores: { id: string; name: string }[],
): Promise<string[]> {
  if (scope === "employee" && employeeId) return [employeeId];
  if (scope === "store" && storeId) {
    const { data } = await supabase
      .from("employees")
      .select("id")
      .eq("status", "active")
      .or(`store_id.eq.${storeId},allocated_store_id.eq.${storeId}`);
    return (data ?? []).map((e: any) => e.id);
  }
  // all
  return allEmployees.map((e) => e.id);
}

function buildAnnouncementMessage(payload: any, stores: { id: string; name: string }[]) {
  const when = format(new Date(payload.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const parts: string[] = [];
  parts.push(`🗓️ Quando: ${when}`);
  if (payload.location) parts.push(`📍 Local: ${payload.location}`);
  if (payload.meeting_url) parts.push(`🎥 Link: ${payload.meeting_url}`);
  if (payload.description) parts.push(`\n${payload.description}`);
  return parts.join("\n");
}
