import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, CheckCircle2, AlertTriangle, Clock, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { FinanceCategory } from "./FinanceCategoriesPanel";
import type { BankAccount } from "./BankAccountsManager";
import { sortStores } from "@/lib/storeSort";

interface Receivable {
  id: string;
  store_id: string;
  description: string;
  payer_name: string | null;
  category_id: string | null;
  amount: number;
  due_date: string | null;
  received_at: string | null;
  status: string;
  bank_account_id: string | null;
  notes: string | null;
  finance_categories?: { name: string } | null;
  stores?: { name: string } | null;
}

interface Store { id: string; name: string }

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string | null) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const statusBadge = (status: string, dueDate: string | null) => {
  if (status === "received") return <Badge className="bg-emerald-500 hover:bg-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" />Recebida</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelada</Badge>;
  if (dueDate) {
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(dueDate + "T00:00:00");
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Vencida</Badge>;
    if (diff <= 3) return <Badge className="bg-amber-500 hover:bg-amber-500"><Clock className="h-3 w-3 mr-1" />Vence em {diff}d</Badge>;
  }
  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />A receber</Badge>;
};

export default function AccountsReceivablePanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<Receivable[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Receivable> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiving, setReceiving] = useState<Receivable | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, s, c, a] = await Promise.all([
      supabase.from("accounts_receivable")
        .select("*, finance_categories(name), stores(name)")
        .order("status", { ascending: true })
        .order("due_date", { ascending: true })
        .limit(500),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).neq("store_type", "central").order("name"),
      supabase.from("finance_categories").select("*").in("kind", ["income","both"]).eq("is_active", true).order("sort_order"),
      supabase.from("bank_accounts").select("*").eq("is_active", true).order("name"),
    ]);
    if (r.error) toast({ title: "Erro", description: r.error.message, variant: "destructive" });
    else setItems((r.data ?? []) as Receivable[]);
    setStores(sortStores((s.data ?? [])) as Store[]);
    setCategories((c.data ?? []) as FinanceCategory[]);
    setAccounts((a.data ?? []) as BankAccount[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((it) => {
    if (statusFilter !== "all" && it.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return it.description?.toLowerCase().includes(s)
        || (it.payer_name ?? "").toLowerCase().includes(s)
        || String(it.amount).includes(s);
    }
    return true;
  }), [items, statusFilter, search]);

  const totals = useMemo(() => {
    const open = items.filter((i) => i.status === "open").reduce((sum, i) => sum + Number(i.amount), 0);
    const received = items.filter((i) => i.status === "received").reduce((sum, i) => sum + Number(i.amount), 0);
    const overdue = items.filter((i) => {
      if (i.status !== "open" || !i.due_date) return false;
      return new Date(i.due_date + "T00:00:00").getTime() < Date.now() - 86400000;
    }).reduce((sum, i) => sum + Number(i.amount), 0);
    return { open, received, overdue };
  }, [items]);

  const save = async () => {
    if (!editing?.description || !editing?.amount || !editing?.store_id) {
      toast({ title: "Descrição, valor e loja são obrigatórios", variant: "destructive" });
      return;
    }
    if (!user?.id) return;
    setSubmitting(true);
    const payload = {
      store_id: editing.store_id,
      description: editing.description,
      payer_name: editing.payer_name || null,
      category_id: editing.category_id || null,
      amount: Number(editing.amount),
      due_date: editing.due_date || null,
      bank_account_id: editing.bank_account_id || null,
      notes: editing.notes || null,
      created_by: user.id,
    };
    const { error } = editing.id
      ? await supabase.from("accounts_receivable").update(payload).eq("id", editing.id)
      : await supabase.from("accounts_receivable").insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Conta atualizada" : "Conta criada" });
    setEditing(null);
    await load();
  };

  const markReceived = async () => {
    if (!receiving || !user?.id) return;
    setSubmitting(true);
    const { error } = await supabase.from("accounts_receivable")
      .update({ status: "received", received_at: new Date().toISOString().slice(0,10), received_by: user.id })
      .eq("id", receiving.id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marcada como recebida" });
    setReceiving(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">A receber</div>
          <div className="text-xl font-bold text-amber-600">{fmtBRL(totals.open)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Vencidas</div>
          <div className="text-xl font-bold text-destructive">{fmtBRL(totals.overdue)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Recebidas (período)</div>
          <div className="text-xl font-bold text-emerald-600">{fmtBRL(totals.received)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 justify-between">
            <div className="flex flex-col sm:flex-row gap-2">
              <select className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos status</option>
                <option value="open">A receber</option>
                <option value="received">Recebidas</option>
                <option value="cancelled">Canceladas</option>
              </select>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8" />
              </div>
            </div>
            <Button size="sm" onClick={() => setEditing({ store_id: stores[0]?.id })}>
              <Plus className="h-4 w-4 mr-1" /> Nova conta a receber
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lançamento.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Pagador</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDate(it.due_date)}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{it.description}</TableCell>
                      <TableCell className="text-sm">{it.payer_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{it.finance_categories?.name || "—"}</TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap text-emerald-600">{fmtBRL(Number(it.amount))}</TableCell>
                      <TableCell>{statusBadge(it.status, it.due_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {it.status === "open" && (
                            <Button size="sm" onClick={() => setReceiving(it)}>Receber</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditing(it)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !submitting && !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar conta a receber" : "Nova conta a receber"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Descrição *</Label>
              <Input value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Loja *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editing?.store_id ?? ""} onChange={(e) => setEditing({ ...editing, store_id: e.target.value })}>
                <option value="">Selecione...</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editing?.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Pagador</Label>
              <Input value={editing?.payer_name ?? ""} onChange={(e) => setEditing({ ...editing, payer_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Conta bancária</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editing?.bank_account_id ?? ""} onChange={(e) => setEditing({ ...editing, bank_account_id: e.target.value || null })}>
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Valor *</Label>
              <Input type="number" step="0.01" value={editing?.amount ?? ""}
                onChange={(e) => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1">
              <Label>Vencimento</Label>
              <Input type="date" value={editing?.due_date ?? ""}
                onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={editing?.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={save} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiving} onOpenChange={(o) => !submitting && !o && setReceiving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar recebimento</DialogTitle></DialogHeader>
          <p className="text-sm">Marcar <strong>{receiving?.description}</strong> ({receiving && fmtBRL(Number(receiving.amount))}) como recebida hoje?</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiving(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={markReceived} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
