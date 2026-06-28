import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Pencil, Trash2, CheckCircle2, RotateCcw, Download, ChevronLeft, ChevronRight, CalendarDays, HandCoins } from "lucide-react";
import { exportC6PixFile } from "@/lib/c6Export";
import { sortStores } from "@/lib/storeSort";

type Freelancer = {
  id: string;
  full_name: string;
  pix_key: string | null;
  pix_key_type: string | null;
  store_id: string | null;
};
type Store = { id: string; name: string };
type Payment = {
  id: string;
  freelancer_id: string;
  store_id: string | null;
  work_date: string;
  amount: number;
  notes: string | null;
  status: "pending" | "paid";
  paid_at: string | null;
  freelancers?: { full_name: string; pix_key: string | null; pix_key_type: string | null } | null;
  stores?: { name: string } | null;
};

const monthLabel = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDateBR = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function FreelancerDailyPayments() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<Payment[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    freelancer_id: "",
    store_id: "",
    work_date: todayISO(),
    amount: "",
    notes: "",
  });

  const periodStart = useMemo(() => `${year}-${String(month).padStart(2, "0")}-01`, [year, month]);
  const periodEnd = useMemo(() => {
    const d = new Date(year, month, 0);
    return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [year, month]);

  const load = async () => {
    setLoading(true);
    const [{ data: pays, error }, { data: fl }, { data: st }] = await Promise.all([
      supabase
        .from("freelancer_daily_payments")
        .select("*, freelancers(full_name, pix_key, pix_key_type), stores(name)")
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd)
        .order("work_date", { ascending: false }),
      supabase.from("freelancers").select("id, full_name, pix_key, pix_key_type, store_id").eq("status", "active").order("full_name"),
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
    ]);
    if (error) toast.error(error.message);
    setItems((pays ?? []) as Payment[]);
    setFreelancers((fl ?? []) as Freelancer[]);
    setStores(sortStores((st ?? []) as Store[]));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [periodStart, periodEnd]);

  const reset = () => {
    setEditingId(null);
    setForm({ freelancer_id: "", store_id: "", work_date: todayISO(), amount: "", notes: "" });
  };

  const openNew = () => { reset(); setOpen(true); };

  const openEdit = (p: Payment) => {
    setEditingId(p.id);
    setForm({
      freelancer_id: p.freelancer_id,
      store_id: p.store_id ?? "",
      work_date: p.work_date,
      amount: String(p.amount),
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.freelancer_id) { toast.error("Selecione o freelancer."); return; }
    const amount = Number(String(form.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Valor inválido."); return; }
    setSaving(true);
    const payload = {
      freelancer_id: form.freelancer_id,
      store_id: form.store_id || null,
      work_date: form.work_date,
      amount,
      notes: form.notes.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("freelancer_daily_payments").update(payload).eq("id", editingId)
      : await supabase.from("freelancer_daily_payments").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? "Pagamento atualizado." : "Pagamento registrado.");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este pagamento?")) return;
    const { error } = await supabase.from("freelancer_daily_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido.");
    load();
  };

  const togglePaid = async (p: Payment) => {
    const next = p.status === "paid" ? { status: "pending", paid_at: null } : { status: "paid", paid_at: new Date().toISOString() };
    const { error } = await supabase.from("freelancer_daily_payments").update(next).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const movePeriod = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
  };

  const totalPeriodo = items.reduce((s, p) => s + Number(p.amount), 0);
  const totalPago = items.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const totalPendente = totalPeriodo - totalPago;

  const exportC6 = async () => {
    const pendings = items.filter((p) => p.status === "pending");
    if (pendings.length === 0) { toast.error("Sem pagamentos pendentes no período."); return; }
    const rows = pendings.map((p) => ({
      name: p.freelancers?.full_name ?? "",
      pixKey: p.freelancers?.pix_key ?? "",
      pixKeyType: p.freelancers?.pix_key_type ?? null,
      amount: Number(p.amount),
      description: "DIARIA FREELANCER",
      storeId: p.store_id ?? null,
    }));
    const sem = rows.filter((r) => !r.pixKey || !r.name);
    if (sem.length > 0) {
      const ok = window.confirm(
        `${sem.length} freelancer(s) sem PIX serão IGNORADOS:\n\n${sem.map((r) => `• ${r.name || "(sem nome)"}`).join("\n")}\n\nContinuar?`
      );
      if (!ok) return;
    }
    try {
      const { included, skipped } = await exportC6PixFile({
        rows,
        fileName: `diarias-freelancers-${year}-${String(month).padStart(2, "0")}`,
        paymentDate: new Date(),
        source: "freelancer",
        sourceRef: `Diárias freelancers ${String(month).padStart(2, "0")}/${year}`,
      });
      if (included === 0) { toast.error("Nenhum pagamento válido para exportar."); return; }
      const ids = pendings
        .filter((p) => p.freelancers?.pix_key && p.freelancers?.full_name)
        .map((p) => p.id);
      await supabase
        .from("freelancer_daily_payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);
      toast.success(`Arquivo C6 gerado com ${included} pagamento(s)${skipped.length ? ` (${skipped.length} ignorado(s))` : ""}.`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao exportar.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <HandCoins className="h-7 w-7 text-primary" /> Diárias de freelancers
        </h1>
        <p className="text-muted-foreground text-sm">Lance e pague diárias avulsas dos freelancers.</p>
      </div>

      {/* Seletor de mês (mesmo padrão folha/VT/feriado) */}
      <Card>
        <CardContent className="p-3 md:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-2 min-w-[180px] justify-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold capitalize">{monthLabel(year, month)}</span>
            </div>
            <Button variant="outline" size="icon" onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild>
                <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova diária</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? "Editar diária" : "Nova diária"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Freelancer *</Label>
                    <Select value={form.freelancer_id} onValueChange={(v) => {
                      const f = freelancers.find((x) => x.id === v);
                      setForm((s) => ({ ...s, freelancer_id: v, store_id: s.store_id || (f?.store_id ?? "") }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {freelancers.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Loja</Label>
                      <Select value={form.store_id} onValueChange={(v) => setForm((s) => ({ ...s, store_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Data do trabalho *</Label>
                      <Input type="date" value={form.work_date} onChange={(e) => setForm((s) => ({ ...s, work_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Valor da diária (R$) *</Label>
                    <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Observação</Label>
                    <Textarea rows={2} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={exportC6}><Download className="h-4 w-4 mr-1" /> Exportar C6 (PIX)</Button>
          </div>
        </CardContent>
      </Card>

      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total no mês</div>
          <div className="text-xl font-bold">{fmtMoney(totalPeriodo)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pago</div>
          <div className="text-xl font-bold text-green-600">{fmtMoney(totalPago)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pendente</div>
          <div className="text-xl font-bold text-amber-600">{fmtMoney(totalPendente)}</div>
        </CardContent></Card>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma diária no período.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {items.map((p) => (
                  <div key={p.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{p.freelancers?.full_name}</div>
                        <div className="text-xs text-muted-foreground">{fmtDateBR(p.work_date)} · {p.stores?.name ?? "—"}</div>
                      </div>
                      <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                        {p.status === "paid" ? "Pago" : "Pendente"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{fmtMoney(Number(p.amount))}</div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" onClick={() => togglePaid(p)} title={p.status === "paid" ? "Reabrir" : "Marcar pago"}>
                          {p.status === "paid" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="outline" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Freelancer</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{fmtDateBR(p.work_date)}</TableCell>
                        <TableCell className="font-medium">{p.freelancers?.full_name}</TableCell>
                        <TableCell>{p.stores?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">{fmtMoney(Number(p.amount))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">{p.notes ?? ""}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : "secondary"}>
                            {p.status === "paid" ? "Pago" : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button size="icon" variant="outline" onClick={() => togglePaid(p)} title={p.status === "paid" ? "Reabrir" : "Marcar pago"}>
                              {p.status === "paid" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            </Button>
                            <Button size="icon" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="outline" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
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
    </div>
  );
}
