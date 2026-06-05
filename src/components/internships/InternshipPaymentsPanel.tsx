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
import { Loader2, Pencil, Trash2, ArrowUp, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { exportC6PixFile } from "@/lib/c6Export";

interface Internship {
  id: string;
  employee_id: string;
  status: string;
  start_date: string;
  end_date: string;
}
interface Employee { id: string; full_name: string; pix_key: string | null; pix_key_type: string | null; salary: number | null }
interface Payment {
  id: string;
  internship_id: string;
  employee_id: string;
  amount: number;
  reference_date: string;
  payment_date: string | null;
  notes: string | null;
  exported_at: string | null;
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export default function InternshipPaymentsPanel() {
  const [loading, setLoading] = useState(true);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Payment[]>([]);
  const today = new Date();
  const [refDate, setRefDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth();
  const from = format(new Date(refYear, refMonth, 1), "yyyy-MM-dd");
  const to = format(new Date(refYear, refMonth + 1, 0), "yyyy-MM-dd");
  const isCurrentMonth = refYear === today.getFullYear() && refMonth === today.getMonth();
  const monthLabel = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const goPrev = () => setRefDate(new Date(refYear, refMonth - 1, 1));
  const goNext = () => setRefDate(new Date(refYear, refMonth + 1, 1));
  const goCurrent = () => setRefDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const daysInRefMonth = new Date(refYear, refMonth + 1, 0).getDate();
  const [form, setForm] = useState({
    internship_id: "",
    amount: "",
    reference_date: format(today, "yyyy-MM-dd"),
    payment_date: format(today, "yyyy-MM-dd"),
    notes: "",
    days_worked: "",
    days_in_month: "",
    base_salary: "",
  });


  useEffect(() => { init(); }, []);
  useEffect(() => { load(); }, [from, to]);

  const init = async () => {
    const [{ data: it }, { data: em }] = await Promise.all([
      supabase.from("internships").select("id, employee_id, status, start_date, end_date").eq("status", "active"),
      supabase.from("employees").select("id, full_name, pix_key, pix_key_type, salary").order("full_name"),
    ]);
    setInternships((it ?? []) as Internship[]);
    setEmployees((em ?? []) as Employee[]);
    setLoading(false);
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("internship_payments")
      .select("*")
      .gte("reference_date", from)
      .lte("reference_date", to)
      .order("reference_date", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Payment[]);
  };

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const intMap = useMemo(() => Object.fromEntries(internships.map((i) => [i.id, i])), [internships]);
  const total = useMemo(() => items.reduce((acc, i) => acc + Number(i.amount || 0), 0), [items]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      internship_id: "",
      amount: "",
      reference_date: format(today, "yyyy-MM-dd"),
      payment_date: format(today, "yyyy-MM-dd"),
      notes: "",
      days_worked: String(daysInRefMonth),
      days_in_month: String(daysInRefMonth),
      base_salary: "",
    });
    setOpen(true);
  };

  const onSelectInternship = (v: string) => {
    const it = intMap[v];
    const sal = it ? Number(empMap[it.employee_id]?.salary ?? 0) : 0;
    setForm((f) => {
      const dm = Number(f.days_in_month) || daysInRefMonth;
      const dw = Number(f.days_worked) || dm;
      const amt = sal > 0 ? (sal / dm) * dw : Number(f.amount) || 0;
      return {
        ...f,
        internship_id: v,
        base_salary: sal > 0 ? String(sal) : f.base_salary,
        amount: sal > 0 ? amt.toFixed(2) : f.amount,
      };
    });
  };

  const recalcByDays = (next: { days_worked?: string; days_in_month?: string; base_salary?: string }) => {
    setForm((f) => {
      const merged = { ...f, ...next };
      const sal = Number(merged.base_salary) || 0;
      const dm = Number(merged.days_in_month) || daysInRefMonth;
      const dw = Number(merged.days_worked) || 0;
      const amt = sal > 0 && dm > 0 ? (sal / dm) * dw : Number(merged.amount) || 0;
      return { ...merged, amount: amt > 0 ? amt.toFixed(2) : merged.amount };
    });
  };

  const openEdit = (p: Payment) => {
    setEditing(p);
    const emp = empMap[p.employee_id];
    const sal = Number(emp?.salary ?? 0);
    setForm({
      internship_id: p.internship_id,
      amount: String(p.amount),
      reference_date: p.reference_date,
      payment_date: p.payment_date ?? format(today, "yyyy-MM-dd"),
      notes: p.notes ?? "",
      days_worked: String(daysInRefMonth),
      days_in_month: String(daysInRefMonth),
      base_salary: sal > 0 ? String(sal) : "",
    });
    setOpen(true);
  };


  const generateMonth = async () => {
    if (internships.length === 0) { toast.error("Nenhum estagiário ativo."); return; }
    const ref = from;
    const eligible = internships.filter((i) => Number(empMap[i.employee_id]?.salary ?? 0) > 0);
    if (eligible.length === 0) { toast.error("Cadastre o salário (valor da bolsa) no cadastro do colaborador."); return; }
    const existing = new Set(items.filter((i) => i.reference_date === ref).map((i) => i.internship_id));
    const toInsert = eligible.filter((i) => !existing.has(i.id)).map((i) => ({
      internship_id: i.id,
      employee_id: i.employee_id,
      amount: Number(empMap[i.employee_id]?.salary ?? 0),
      reference_date: ref,
      payment_date: ref,
    }));
    if (toInsert.length === 0) { toast.info("Pagamentos já gerados para esta data."); return; }
    const { error } = await supabase.from("internship_payments").insert(toInsert);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toInsert.length} pagamento(s) gerado(s).`);
    load();
  };

  const save = async () => {
    if (!form.internship_id) { toast.error("Selecione o estágio."); return; }
    const it = intMap[form.internship_id];
    if (!it) { toast.error("Estágio inválido."); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error("Informe um valor válido."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      internship_id: form.internship_id,
      employee_id: it.employee_id,
      amount: amt,
      reference_date: form.reference_date,
      payment_date: form.payment_date || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    };
    const { error } = editing
      ? await supabase.from("internship_payments").update(payload).eq("id", editing.id)
      : await supabase.from("internship_payments").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Pagamento atualizado." : "Pagamento registrado.");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este pagamento?")) return;
    const { error } = await supabase.from("internship_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido.");
    load();
  };

  const exportC6 = async () => {
    if (items.length === 0) { toast.error("Sem pagamentos no período."); return; }
    const rows = items.map((p) => {
      const e = empMap[p.employee_id];
      return {
        name: e?.full_name ?? "",
        pixKey: e?.pix_key ?? "",
        pixKeyType: e?.pix_key_type ?? null,
        amount: Number(p.amount),
        description: "BOLSA ESTAGIO",
      };
    });
    const ignorados = rows.filter((r) => !r.pixKey || !r.name || r.amount <= 0);
    if (ignorados.length > 0) {
      const ok = window.confirm(
        `${ignorados.length} estagiário(s) sem PIX serão IGNORADOS:\n\n${ignorados.map((r) => `• ${r.name || "(sem nome)"}`).join("\n")}\n\nContinuar?`
      );
      if (!ok) return;
    }
    try {
      const paymentDate = items[0]?.payment_date ? new Date(items[0].payment_date + "T00:00") : new Date();
      const { included, skipped } = await exportC6PixFile({
        rows,
        fileName: `bolsa-estagio-${from}-a-${to}`,
        paymentDate,
      });
      if (included === 0) { toast.error("Nenhum pagamento válido para exportar."); return; }
      const ids = items.map((i) => i.id);
      await supabase.from("internship_payments").update({ exported_at: new Date().toISOString() }).in("id", ids);
      toast.success(`Arquivo C6 gerado com ${included} pagamento(s)${skipped.length ? ` (${skipped.length} ignorado(s))` : ""}.`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao exportar.");
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 md:p-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs md:text-sm">
              <CalendarDays className="h-4 w-4" /> Mês de referência
            </Label>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Button variant="outline" size="icon" onClick={goPrev} aria-label="Mês anterior" className="shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-2 sm:px-3 py-2 border rounded-md text-xs sm:text-sm flex-1 sm:min-w-[220px] text-center capitalize">
                <span className="font-medium">{monthLabel}</span>
                {isCurrentMonth && <span className="ml-1 sm:ml-2 text-xs text-primary">(atual)</span>}
              </div>
              <Button variant="outline" size="icon" onClick={goNext} aria-label="Próximo mês" className="shrink-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="ghost" size="sm" onClick={goCurrent} className="text-xs">Atual</Button>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={generateMonth}>Gerar do mês</Button>
            <Button onClick={exportC6} disabled={items.length === 0}>
              <ArrowUp className="h-4 w-4 mr-2" /> Exportar C6
            </Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Editar pagamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Estagiário</Label>
                  <Select value={form.internship_id} onValueChange={onSelectInternship}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {internships.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{empMap[i.employee_id]?.full_name ?? "—"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Bolsa cheia (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.base_salary}
                      onChange={(e) => recalcByDays({ base_salary: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Dias trab.</Label>
                    <Input type="number" step="1" min="0" max="31" value={form.days_worked}
                      onChange={(e) => recalcByDays({ days_worked: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Dias do mês</Label>
                    <Input type="number" step="1" min="28" max="31" value={form.days_in_month}
                      onChange={(e) => recalcByDays({ days_in_month: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Data referência</Label>
                    <Input type="date" value={form.reference_date} onChange={(e) => setForm((f) => ({ ...f, reference_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} />
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex justify-between items-center">
          <div className="text-xs md:text-sm text-muted-foreground">{items.length} pagamento(s)</div>
          <div className="text-base md:text-lg font-bold">Total: {fmtBRL(total)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum pagamento no período.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {items.map((p) => (
                  <div key={p.id} className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{empMap[p.employee_id]?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          Ref: {format(new Date(p.reference_date + "T00:00"), "dd/MM/yyyy")}
                          {p.payment_date && ` · Pago: ${format(new Date(p.payment_date + "T00:00"), "dd/MM/yyyy")}`}
                        </div>
                      </div>
                      <div className="font-bold text-sm shrink-0">{fmtBRL(Number(p.amount))}</div>
                    </div>
                    {p.notes && <div className="text-xs text-muted-foreground line-clamp-2">{p.notes}</div>}
                    {p.exported_at && <div className="text-[10px] text-emerald-600">Exportado</div>}
                    <div className="flex justify-end gap-1 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Excluir</Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Referência</th>
                      <th className="text-left p-2">Pagamento</th>
                      <th className="text-left p-2">Estagiário</th>
                      <th className="text-right p-2">Valor</th>
                      <th className="text-left p-2">Observações</th>
                      <th className="text-center p-2">Exportado</th>
                      <th className="text-right p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{format(new Date(p.reference_date + "T00:00"), "dd/MM/yyyy")}</td>
                        <td className="p-2 font-mono text-xs">{p.payment_date ? format(new Date(p.payment_date + "T00:00"), "dd/MM/yyyy") : "—"}</td>
                        <td className="p-2">{empMap[p.employee_id]?.full_name ?? "—"}</td>
                        <td className="p-2 text-right font-semibold">{fmtBRL(Number(p.amount))}</td>
                        <td className="p-2 text-muted-foreground">{p.notes ?? "—"}</td>
                        <td className="p-2 text-center text-xs">{p.exported_at ? "✓" : "—"}</td>
                        <td className="p-2 text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
