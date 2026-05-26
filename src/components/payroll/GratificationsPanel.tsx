import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { sortStores } from "@/lib/storeSort";

interface Employee { id: string; full_name: string; store_id: string; allocated_store_id: string | null }
interface Store { id: string; name: string }
interface Gratification {
  id: string;
  employee_id: string;
  amount: number;
  reference_date: string;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export default function GratificationsPanel() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Gratification[]>([]);
  const [storeId, setStoreId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [from, setFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Gratification | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    amount: "",
    reference_date: format(new Date(), "yyyy-MM-dd"),
    reason: "",
    notes: "",
  });

  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [storeId, employeeId, from, to]);

  const init = async () => {
    const [{ data: emp }, { data: sto }] = await Promise.all([
      supabase.from("employees").select("id, full_name, store_id, allocated_store_id").eq("status", "active").order("full_name"),
      supabase.from("stores").select("id, name, store_type").eq("is_active", true).eq("is_virtual", false).order("name"),
    ]);
    setEmployees(emp ?? []);
    setStores(sortStores(sto ?? []));
    setLoading(false);
  };

  const load = async () => {
    let q = supabase
      .from("employee_gratifications")
      .select("*")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .order("reference_date", { ascending: false });

    if (employeeId !== "all") q = q.eq("employee_id", employeeId);
    else if (storeId !== "all") {
      const ids = employees.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId).map((e) => e.id);
      if (ids.length === 0) { setItems([]); return; }
      q = q.in("employee_id", ids);
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Gratification[]);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const filteredEmployees = useMemo(() => {
    if (storeId === "all") return employees;
    return employees.filter((e) => e.store_id === storeId || e.allocated_store_id === storeId);
  }, [employees, storeId]);

  const total = useMemo(() => items.reduce((acc, i) => acc + Number(i.amount || 0), 0), [items]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      employee_id: employeeId !== "all" ? employeeId : "",
      amount: "",
      reference_date: format(new Date(), "yyyy-MM-dd"),
      reason: "",
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (g: Gratification) => {
    setEditing(g);
    setForm({
      employee_id: g.employee_id,
      amount: String(g.amount),
      reference_date: g.reference_date,
      reason: g.reason ?? "",
      notes: g.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.employee_id) { toast.error("Selecione o colaborador."); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error("Informe um valor válido."); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      employee_id: form.employee_id,
      amount: amt,
      reference_date: form.reference_date,
      reason: form.reason || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    };

    const { error } = editing
      ? await supabase.from("employee_gratifications").update(payload).eq("id", editing.id)
      : await supabase.from("employee_gratifications").insert(payload);

    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Gratificação atualizada." : "Gratificação registrada.");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta gratificação?")) return;
    const { error } = await supabase.from("employee_gratifications").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removida.");
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
          <div>
            <Label className="text-xs md:text-sm">Loja</Label>
            <Select value={storeId} onValueChange={(v) => { setStoreId(v); setEmployeeId("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs md:text-sm">Colaborador</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filteredEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs md:text-sm">De</Label>
            <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs md:text-sm">Até</Label>
            <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-1 flex items-end">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate} className="w-full"><Plus className="h-4 w-4 mr-2" /> Nova</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar gratificação" : "Nova gratificação"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Colaborador</Label>
                    <Select value={form.employee_id} onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Data</Label>
                      <Input type="date" value={form.reference_date} onChange={(e) => setForm((f) => ({ ...f, reference_date: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>Motivo</Label>
                    <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Ex.: desempenho excepcional" />
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
                  <Button onClick={save} className="w-full sm:w-auto">Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex justify-between items-center">
          <div className="text-xs md:text-sm text-muted-foreground">{items.length} registro(s)</div>
          <div className="text-base md:text-lg font-bold">Total: {fmtBRL(total)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma gratificação no período.</p>
          ) : (
            <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {items.map((g) => (
                <div key={g.id} className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{empMap[g.employee_id]?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {format(new Date(g.reference_date + "T00:00"), "dd/MM/yyyy")}
                      </div>
                    </div>
                    <div className="font-bold text-sm shrink-0">{fmtBRL(Number(g.amount))}</div>
                  </div>
                  {g.reason && <div className="text-xs"><span className="text-muted-foreground">Motivo:</span> {g.reason}</div>}
                  {g.notes && <div className="text-xs text-muted-foreground line-clamp-2">{g.notes}</div>}
                  <div className="flex justify-end gap-1 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Excluir</Button>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Colaborador</th>
                  <th className="text-right p-2">Valor</th>
                  <th className="text-left p-2">Motivo</th>
                  <th className="text-left p-2">Observações</th>
                  <th className="text-right p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{format(new Date(g.reference_date + "T00:00"), "dd/MM/yyyy")}</td>
                    <td className="p-2">{empMap[g.employee_id]?.full_name ?? "—"}</td>
                    <td className="p-2 text-right font-semibold">{fmtBRL(Number(g.amount))}</td>
                    <td className="p-2">{g.reason ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{g.notes ?? "—"}</td>
                    <td className="p-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
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
