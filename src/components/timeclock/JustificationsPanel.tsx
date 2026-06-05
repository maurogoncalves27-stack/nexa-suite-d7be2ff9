import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Wand2, Trash2, MessageSquareWarning } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { TimeClockEntryType, ENTRY_TYPE_LABEL } from "@/lib/timeClock";
import { sortStores } from "@/lib/storeSort";
import { useEmployeesAtStore } from "@/hooks/useEmployeesAtStore";

type JustType = "forgotten_punch" | "late_arrival" | "early_leave" | "absence" | "other";

const JUST_TYPE_LABEL: Record<JustType, string> = {
  forgotten_punch: "Esquecimento de batida",
  late_arrival: "Atraso justificado",
  early_leave: "Saída antecipada",
  absence: "Falta justificada",
  other: "Outro",
};

interface Employee { id: string; full_name: string; store_id: string; allocated_store_id: string | null }
interface Store { id: string; name: string }
interface Justification {
  id: string;
  employee_id: string;
  reference_date: string;
  justification_type: JustType;
  notes: string | null;
  attachment_url: string | null;
  related_entry_id: string | null;
  requested_by_employee: boolean;
  status: "pending" | "resolved" | "rejected";
  created_at: string;
}

const ENTRY_TYPES: TimeClockEntryType[] = [
  "clock_in",
  "break_start",
  "break_end",
  "break_start_2",
  "break_end_2",
  "clock_out",
];

export function JustificationsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Justification[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [from, setFrom] = useState(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("all");
  const punchedAtStore = useEmployeesAtStore(storeId, from, to);


  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Justification | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    reference_date: format(new Date(), "yyyy-MM-dd"),
    justification_type: "forgotten_punch" as JustType,
    notes: "",
    create_entry: true,
    entry_type: "clock_in" as TimeClockEntryType,
    entry_time: "08:00",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, from, to, statusFilter]);

  const init = async () => {
    const [{ data: sto }, { data: emp }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id, allocated_store_id").eq("status", "active").order("full_name"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees(emp ?? []);
    setLoading(false);
  };

  const load = async () => {
    let q = supabase
      .from("time_clock_justifications")
      .select("*")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .order("reference_date", { ascending: false })
      .limit(500);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    let list = (data ?? []) as Justification[];
    if (storeId !== "all") {
      const allowed = new Set([
        ...employees.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId).map((e) => e.id),
        ...punchedAtStore,
      ]);
      list = list.filter((j) => allowed.has(j.employee_id));
    }
    setItems(list);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const filteredEmployees = useMemo(() => {
    if (storeId === "all") return employees;
    return employees.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId || punchedAtStore.has(e.id));
  }, [employees, storeId, punchedAtStore]);

  const openNew = () => {
    setEditing(null);
    setForm({
      employee_id: "",
      reference_date: format(new Date(), "yyyy-MM-dd"),
      justification_type: "forgotten_punch",
      notes: "",
      create_entry: true,
      entry_type: "clock_in",
      entry_time: "08:00",
    });
    setDialogOpen(true);
  };

  const openResolvePending = (j: Justification) => {
    setEditing(j);
    setForm({
      employee_id: j.employee_id,
      reference_date: j.reference_date,
      justification_type: j.justification_type,
      notes: j.notes ?? "",
      create_entry: j.justification_type === "forgotten_punch",
      entry_type: "clock_in",
      entry_time: "08:00",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user || !form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const emp = empMap[form.employee_id];
      let relatedEntryId: string | null = null;

      // Cria a batida manual quando for esquecimento e o gestor pediu
      if (form.create_entry && form.justification_type === "forgotten_punch") {
        const effectiveStoreId = emp?.allocated_store_id ?? emp?.store_id ?? null;
        const entryAt = new Date(`${form.reference_date}T${form.entry_time}:00`).toISOString();
        const { data: entry, error: entryErr } = await supabase
          .from("time_clock_entries")
          .insert({
            employee_id: form.employee_id,
            store_id: effectiveStoreId,
            entry_type: form.entry_type,
            entry_at: entryAt,
            reference_date: form.reference_date,
            is_manual: true,
            created_by: user.id,
            notes: form.notes.trim() || "Tratativa lançada manualmente pelo gestor",
          })
          .select("id")
          .single();
        if (entryErr) throw entryErr;
        relatedEntryId = entry.id;
      }

      if (editing) {
        const { error } = await supabase
          .from("time_clock_justifications")
          .update({
            justification_type: form.justification_type,
            notes: form.notes.trim() || null,
            related_entry_id: relatedEntryId ?? editing.related_entry_id,
            status: "resolved",
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Tratativa registrada" });
      } else {
        const { error } = await supabase.from("time_clock_justifications").insert({
          employee_id: form.employee_id,
          reference_date: form.reference_date,
          justification_type: form.justification_type,
          notes: form.notes.trim() || null,
          related_entry_id: relatedEntryId,
          requested_by_employee: false,
          status: "resolved",
          created_by: user.id,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast({ title: "Tratativa registrada" });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reject = async (j: Justification) => {
    if (!user) return;
    const { error } = await supabase
      .from("time_clock_justifications")
      .update({ status: "rejected", resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", j.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido rejeitado" });
    load();
  };

  const remove = async (j: Justification) => {
    if (!confirm("Remover esta tratativa?")) return;
    const { error } = await supabase.from("time_clock_justifications").delete().eq("id", j.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removida" });
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const pendingCount = items.filter((i) => i.status === "pending").length;

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
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={openNew} className="w-full"><Plus className="h-4 w-4 mr-2" /> Nova tratativa</Button>
          </div>
        </CardContent>
      </Card>

      {pendingCount > 0 && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-500/10">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <MessageSquareWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {pendingCount} pedido(s) de ajuste de batida aguardando sua tratativa.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Tratativas</CardTitle>
          <CardDescription>{items.length} registro(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma tratativa no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Colaborador</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Observação</th>
                  <th className="text-center p-2">Origem</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-right p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((j) => {
                  const emp = empMap[j.employee_id];
                  return (
                    <tr key={j.id} className="border-t">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">{format(new Date(j.reference_date + "T00:00"), "dd/MM/yyyy")}</td>
                      <td className="p-2">{emp?.full_name ?? "—"}</td>
                      <td className="p-2">{JUST_TYPE_LABEL[j.justification_type]}</td>
                      <td className="p-2 text-muted-foreground max-w-xs truncate">{j.notes ?? "—"}</td>
                      <td className="p-2 text-center">
                        {j.requested_by_employee ? <Badge variant="outline">Colaborador</Badge> : <Badge variant="secondary">Gestor</Badge>}
                      </td>
                      <td className="p-2 text-center">
                        {j.status === "pending" && <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">Pendente</Badge>}
                        {j.status === "resolved" && <Badge>Resolvido</Badge>}
                        {j.status === "rejected" && <Badge variant="destructive">Rejeitado</Badge>}
                      </td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        {j.status === "pending" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => openResolvePending(j)}>
                              <Wand2 className="h-3 w-3 mr-1" /> Resolver
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reject(j)}>Rejeitar</Button>
                          </>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => remove(j)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Resolver pedido" : "Nova tratativa"}</DialogTitle>
            <DialogDescription>
              Justifique uma divergência ou lance uma batida esquecida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filteredEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.reference_date} onChange={(e) => setForm({ ...form, reference_date: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.justification_type} onValueChange={(v) => setForm({ ...form, justification_type: v as JustType, create_entry: v === "forgotten_punch" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JUST_TYPE_LABEL) as JustType[]).map((t) => (
                      <SelectItem key={t} value={t}>{JUST_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.justification_type === "forgotten_punch" && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Lançar batida manual</Label>
                  <input
                    type="checkbox"
                    checked={form.create_entry}
                    onChange={(e) => setForm({ ...form, create_entry: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
                {form.create_entry && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={form.entry_type} onValueChange={(v) => setForm({ ...form, entry_type: v as TimeClockEntryType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ENTRY_TYPES.map((t) => <SelectItem key={t} value={t}>{ENTRY_TYPE_LABEL[t]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Hora</Label>
                      <Input type="time" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>Observação</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Motivo, contexto, evidência..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default JustificationsPanel;
