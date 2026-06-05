import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";
import { useEmployeesAtStore } from "@/hooks/useEmployeesAtStore";

type LeaveType =
  | "medical_certificate" | "paid_absence" | "unpaid_absence" | "day_off"
  | "suspension" | "vacation" | "inss" | "maternity" | "paternity"
  | "bereavement" | "marriage" | "other";

const LEAVE_LABEL: Record<LeaveType, string> = {
  medical_certificate: "Atestado médico",
  paid_absence: "Falta abonada",
  unpaid_absence: "Falta não abonada",
  day_off: "Folga",
  suspension: "Suspensão",
  vacation: "Férias",
  inss: "Afastamento INSS",
  maternity: "Licença maternidade",
  paternity: "Licença paternidade",
  bereavement: "Licença nojo",
  marriage: "Licença gala",
  other: "Outro",
};

interface Employee { id: string; full_name: string; store_id: string }
interface Store { id: string; name: string }
interface Leave {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  notes: string | null;
  is_paid: boolean;
}

export function EmployeeLeavesPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Leave[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [from, setFrom] = useState(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd"));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Leave | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "medical_certificate" as LeaveType,
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
    is_paid: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, from, to]);

  const init = async () => {
    const [{ data: sto }, { data: emp }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
      supabase.from("employees").select("id, full_name, store_id").eq("status", "active").order("full_name"),
    ]);
    setStores(sortStores(sto ?? []));
    setEmployees(emp ?? []);
    setLoading(false);
  };

  const load = async () => {
    // Sobreposição de períodos: start <= to AND end >= from
    const { data } = await supabase
      .from("employee_leaves")
      .select("*")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date", { ascending: false })
      .limit(500);
    let list = (data ?? []) as Leave[];
    if (storeId !== "all") {
      const allowed = new Set(employees.filter((e) => e.store_id === storeId).map((e) => e.id));
      list = list.filter((l) => allowed.has(l.employee_id));
    }
    setItems(list);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const filteredEmployees = useMemo(
    () => storeId === "all" ? employees : employees.filter((e) => e.store_id === storeId),
    [employees, storeId],
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      employee_id: "",
      leave_type: "medical_certificate",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      is_paid: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (l: Leave) => {
    setEditing(l);
    setForm({
      employee_id: l.employee_id,
      leave_type: l.leave_type,
      start_date: l.start_date,
      end_date: l.end_date,
      notes: l.notes ?? "",
      is_paid: l.is_paid,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user || !form.employee_id) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    if (form.end_date < form.start_date) {
      toast({ title: "Período inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("employee_leaves").update({
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          notes: form.notes.trim() || null,
          is_paid: form.is_paid,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_leaves").insert({
          employee_id: form.employee_id,
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          notes: form.notes.trim() || null,
          is_paid: form.is_paid,
          created_by: user.id,
        });
        if (error) throw error;
      }
      toast({ title: "Afastamento salvo" });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: Leave) => {
    if (!confirm("Remover este afastamento?")) return;
    const { error } = await supabase.from("employee_leaves").delete().eq("id", l.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removido" });
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="flex items-end">
            <Button onClick={openNew} className="w-full"><Plus className="h-4 w-4 mr-2" /> Novo afastamento</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Afastamentos</CardTitle>
          <CardDescription>{items.length} registro(s) no período</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum afastamento.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Colaborador</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Início</th>
                  <th className="text-left p-2">Fim</th>
                  <th className="text-center p-2">Remunerado</th>
                  <th className="text-left p-2">Observação</th>
                  <th className="text-right p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => {
                  const emp = empMap[l.employee_id];
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{emp?.full_name ?? "—"}</td>
                      <td className="p-2">{LEAVE_LABEL[l.leave_type]}</td>
                      <td className="p-2 font-mono text-xs">{format(new Date(l.start_date + "T00:00"), "dd/MM/yyyy")}</td>
                      <td className="p-2 font-mono text-xs">{format(new Date(l.end_date + "T00:00"), "dd/MM/yyyy")}</td>
                      <td className="p-2 text-center">
                        {l.is_paid ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}
                      </td>
                      <td className="p-2 text-muted-foreground max-w-xs truncate">{l.notes ?? "—"}</td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(l)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <DialogTitle>{editing ? "Editar afastamento" : "Novo afastamento"}</DialogTitle>
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
            <div>
              <Label>Tipo</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v as LeaveType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEAVE_LABEL) as LeaveType[]).map((t) => (
                    <SelectItem key={t} value={t}>{LEAVE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} className="h-4 w-4" />
              Remunerado
            </label>
            <div>
              <Label>Observação</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

export default EmployeeLeavesPanel;
