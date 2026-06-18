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
import { Loader2, Plus, Megaphone, AlertTriangle, Info, Pencil, Trash2, CalendarClock, Repeat } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { sortStores } from "@/lib/storeSort";

type Scope = "global" | "store" | "employee";
type Priority = "info" | "warning" | "urgent";
type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  scope: Scope;
  store_id: string | null;
  employee_id: string | null;
  is_active: boolean;
  send_push: boolean;
  created_at: string;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
  recurrence: Recurrence;
  recurrence_day: number | null;
}

const PRIORITY_LABEL: Record<Priority, string> = { info: "Informativo", warning: "Aviso", urgent: "Urgente" };
const PRIORITY_VARIANT: Record<Priority, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary", warning: "default", urgent: "destructive",
};
const SCOPE_LABEL: Record<Scope, string> = { global: "Todos", store: "Loja", employee: "Colaborador" };
const PRIORITY_ICON: Record<Priority, any> = { info: Info, warning: Megaphone, urgent: AlertTriangle };
const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Sem repetição", daily: "Diário", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal",
};
const WEEKDAYS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

interface FormState {
  title: string; message: string; priority: Priority; scope: Scope;
  store_id: string; employee_id: string; is_active: boolean;
  send_push: boolean;
  send_whatsapp: boolean;
  schedule_start_date: string; schedule_end_date: string;
  recurrence: Recurrence; recurrence_day: string;
}
const EMPTY: FormState = {
  title: "", message: "", priority: "info", scope: "global",
  store_id: "", employee_id: "", is_active: true,
  send_push: false,
  send_whatsapp: false,
  schedule_start_date: "", schedule_end_date: "",
  recurrence: "none", recurrence_day: "",
};

export default function AnnouncementsManagerPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: anns }, { data: st }, { data: emps }] = await Promise.all([
      supabase.from("hr_announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
    ]);
    setItems((anns ?? []) as Announcement[]);
    setStores(sortStores(st ?? []));
    setEmployees(emps ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title, message: a.message, priority: a.priority, scope: a.scope,
      store_id: a.store_id ?? "", employee_id: a.employee_id ?? "", is_active: a.is_active,
      send_push: a.send_push ?? false,
      send_whatsapp: (a as any).send_whatsapp ?? false,
      schedule_start_date: a.schedule_start_date ?? "",
      schedule_end_date: a.schedule_end_date ?? "",
      recurrence: a.recurrence ?? "none",
      recurrence_day: a.recurrence_day != null ? String(a.recurrence_day) : "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" }); return;
    }
    if (form.message.length > 160) {
      toast({ title: "Mensagem muito longa", description: "Máximo de 160 caracteres.", variant: "destructive" }); return;
    }
    if (form.scope === "store" && !form.store_id) {
      toast({ title: "Selecione a loja", variant: "destructive" }); return;
    }
    if (form.scope === "employee" && !form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" }); return;
    }
    if (form.schedule_start_date && form.schedule_end_date && form.schedule_end_date < form.schedule_start_date) {
      toast({ title: "Data final deve ser igual ou após a inicial", variant: "destructive" }); return;
    }
    if (form.recurrence === "biweekly" && !form.schedule_start_date) {
      toast({ title: "Para recorrência quinzenal, defina a data inicial", variant: "destructive" }); return;
    }
    if (!editingId && user?.id) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { count } = await supabase
        .from("hr_announcements")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if ((count ?? 0) >= 3) {
        toast({ title: "Limite diário atingido", description: "Você só pode criar 3 avisos por dia.", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    let recDay: number | null = null;
    if (form.recurrence === "weekly" || form.recurrence === "monthly") {
      recDay = form.recurrence_day !== "" ? parseInt(form.recurrence_day, 10) : null;
    }
    const payload = {
      title: form.title.trim(), message: form.message.trim(), priority: form.priority,
      scope: form.scope,
      store_id: form.scope === "store" ? form.store_id : null,
      employee_id: form.scope === "employee" ? form.employee_id : null,
      is_active: form.is_active, created_by: user?.id ?? null,
      send_push: form.send_push,
      send_whatsapp: form.send_whatsapp,
      schedule_start_date: form.schedule_start_date || null,
      schedule_end_date: form.schedule_end_date || null,
      recurrence: form.recurrence,
      recurrence_day: recDay,
    };
    const { data: saved, error } = editingId
      ? await supabase.from("hr_announcements").update(payload).eq("id", editingId).select("id").maybeSingle()
      : await supabase.from("hr_announcements").insert(payload).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }

    if (form.send_push && form.is_active && saved?.id) {
      supabase.functions
        .invoke("send-push-notification", { body: { announcement_id: saved.id } })
        .then(({ data, error: pushErr }) => {
          if (pushErr) {
            toast({ title: "Aviso salvo, mas push falhou", description: pushErr.message, variant: "destructive" });
          } else if (data?.sent != null) {
            toast({ title: `Push enviado para ${data.sent} dispositivo(s)` });
          }
        });
    }

    if (form.send_whatsapp && form.is_active && saved?.id) {
      supabase.functions
        .invoke("send-whatsapp-announcement", { body: { announcement_id: saved.id } })
        .then(({ data, error: waErr }) => {
          if (waErr) {
            toast({ title: "Aviso salvo, mas WhatsApp falhou", description: waErr.message, variant: "destructive" });
          } else if (data?.sent != null) {
            toast({ title: `WhatsApp enviado para ${data.sent} colaborador(es)` });
          }
        });
    }

    toast({ title: editingId ? "Aviso atualizado" : "Aviso publicado" });
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este aviso?")) return;
    const { error } = await supabase.from("hr_announcements").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aviso excluído" }); load();
  };

  const toggleActive = async (a: Announcement) => {
    const { error } = await supabase.from("hr_announcements").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo aviso</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar aviso" : "Novo aviso"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Mensagem</Label>
                  <span className={`text-xs ${form.message.length > 160 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {form.message.length}/160
                  </span>
                </div>
                <Textarea
                  rows={4}
                  maxLength={160}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value.slice(0, 160) })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Prioridade</Label>
                  <Select value={form.priority} onValueChange={(v: Priority) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Informativo</SelectItem>
                      <SelectItem value="warning">Aviso</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Destinatário</Label>
                  <Select value={form.scope} onValueChange={(v: Scope) => setForm({ ...form, scope: v, store_id: "", employee_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Todos os colaboradores</SelectItem>
                      <SelectItem value="store">Uma loja</SelectItem>
                      <SelectItem value="employee">Um colaborador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <Label className="font-semibold">Agendamento</Label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input type="date" value={form.schedule_start_date}
                      onChange={(e) => setForm({ ...form, schedule_start_date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Fim (opcional)</Label>
                    <Input type="date" value={form.schedule_end_date}
                      onChange={(e) => setForm({ ...form, schedule_end_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Repetição</Label>
                    <Select value={form.recurrence}
                      onValueChange={(v: Recurrence) => setForm({ ...form, recurrence: v, recurrence_day: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                          <SelectItem key={r} value={r}>{RECURRENCE_LABEL[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.recurrence === "weekly" && (
                    <div>
                      <Label className="text-xs">Dia da semana</Label>
                      <Select value={form.recurrence_day}
                        onValueChange={(v) => setForm({ ...form, recurrence_day: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((d) => (
                            <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {form.recurrence === "monthly" && (
                    <div>
                      <Label className="text-xs">Dia do mês (1–31)</Label>
                      <Input type="number" min={1} max={31} value={form.recurrence_day}
                        onChange={(e) => setForm({ ...form, recurrence_day: e.target.value })} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sem datas e sem repetição, o aviso fica visível enquanto estiver ativo.
                </p>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label className="cursor-pointer">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.send_push} onCheckedChange={(v) => setForm({ ...form, send_push: v })} />
                  <Label className="cursor-pointer">Enviar push</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Salvar" : "Publicar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Avisos publicados</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum aviso ainda. Crie o primeiro.</p>
          ) : (
            <ul className="divide-y">
              {items.map((a) => {
                const Icon = PRIORITY_ICON[a.priority];
                const targetLabel =
                  a.scope === "store"
                    ? stores.find((s) => s.id === a.store_id)?.name ?? "Loja"
                    : a.scope === "employee"
                    ? employees.find((e) => e.id === a.employee_id)?.full_name ?? "Colaborador"
                    : SCOPE_LABEL.global;
                return (
                  <li key={a.id} className="py-3 flex items-start gap-3">
                    <Icon className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.title}</span>
                        <Badge variant={PRIORITY_VARIANT[a.priority]}>{PRIORITY_LABEL[a.priority]}</Badge>
                        <Badge variant="outline">{targetLabel}</Badge>
                        {a.recurrence && a.recurrence !== "none" && (
                          <Badge variant="outline" className="gap-1">
                            <Repeat className="h-3 w-3" />
                            {RECURRENCE_LABEL[a.recurrence]}
                            {a.recurrence === "weekly" && a.recurrence_day != null && ` (${WEEKDAYS[a.recurrence_day]?.l})`}
                            {a.recurrence === "monthly" && a.recurrence_day != null && ` (dia ${a.recurrence_day})`}
                          </Badge>
                        )}
                        {(a.schedule_start_date || a.schedule_end_date) && (
                          <Badge variant="outline" className="gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {a.schedule_start_date ? format(new Date(a.schedule_start_date + "T00:00:00"), "dd/MM/yy") : "—"}
                            {a.schedule_end_date ? ` → ${format(new Date(a.schedule_end_date + "T00:00:00"), "dd/MM/yy")}` : ""}
                          </Badge>
                        )}
                        {!a.is_active && <Badge variant="outline">Inativo</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{a.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)}>
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
    </div>
  );
}
