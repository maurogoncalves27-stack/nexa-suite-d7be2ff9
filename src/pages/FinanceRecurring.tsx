import { useEffect, useMemo, useState } from "react";
import { Repeat2, Plus, Loader2, Play, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Template = {
  id: string;
  description: string;
  supplier_id: string | null;
  store_id: string | null;
  category_id: string | null;
  bank_account_id: string | null;
  payment_method: string | null;
  due_day: number;
  default_amount: number | null;
  kind: "fixed" | "variable";
  active: boolean;
  start_month: string;
  end_month: string | null;
  notes: string | null;
};

type Lookup = { id: string; name: string };

const brl = (n: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

const emptyForm: Partial<Template> = {
  description: "",
  supplier_id: null,
  store_id: null,
  category_id: null,
  bank_account_id: null,
  payment_method: "pix",
  due_day: 10,
  default_amount: 0,
  kind: "fixed",
  active: true,
  start_month: new Date().toISOString().slice(0, 7) + "-01",
  end_month: null,
  notes: "",
};

export default function FinanceRecurring() {
  const [rows, setRows] = useState<Template[]>([]);
  const [stores, setStores] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [suppliers, setSuppliers] = useState<Lookup[]>([]);
  const [accounts, setAccounts] = useState<Lookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Template>>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("active");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [tRes, sRes, cRes, supRes, aRes] = await Promise.all([
        supabase.from("recurring_payables").select("*").order("description"),
        supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
        supabase.from("finance_categories").select("id,name").order("name"),
        supabase.from("suppliers").select("id,legal_name,trade_name").order("legal_name"),
        supabase.from("bank_accounts").select("id,name").order("name"),
      ]);
      if (tRes.error) throw tRes.error;
      setRows((tRes.data ?? []) as Template[]);
      setStores((sRes.data ?? []) as Lookup[]);
      setCategories((cRes.data ?? []) as Lookup[]);
      setSuppliers((supRes.data ?? []).map((s: { id: string; legal_name: string; trade_name: string | null }) => ({ id: s.id, name: s.trade_name || s.legal_name })));
      setAccounts((aRes.data ?? []) as Lookup[]);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao carregar contas recorrentes");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () => rows.filter(r =>
      filterActive === "all" ? true : filterActive === "active" ? r.active : !r.active,
    ),
    [rows, filterActive],
  );

  function openNew() {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(t: Template) {
    setForm({ ...t });
    setEditingId(t.id);
    setOpen(true);
  }

  async function save() {
    if (!form.description?.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    if (!form.due_day || form.due_day < 1 || form.due_day > 31) {
      toast.error("Dia de vencimento inválido");
      return;
    }
    const payload = {
      description: form.description.trim(),
      supplier_id: form.supplier_id || null,
      store_id: form.store_id || null,
      category_id: form.category_id || null,
      bank_account_id: form.bank_account_id || null,
      payment_method: form.payment_method || null,
      due_day: Number(form.due_day),
      default_amount: form.kind === "variable" ? null : Number(form.default_amount || 0),
      kind: form.kind || "fixed",
      active: !!form.active,
      start_month: form.start_month || new Date().toISOString().slice(0, 7) + "-01",
      end_month: form.end_month || null,
      notes: form.notes || null,
    };
    const { error } = editingId
      ? await supabase.from("recurring_payables").update(payload).eq("id", editingId)
      : await supabase.from("recurring_payables").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "Template atualizado" : "Template criado");
    setOpen(false);
    void load();
  }

  async function remove(t: Template) {
    if (!confirm(`Excluir "${t.description}"? As contas já geradas serão mantidas.`)) return;
    const { error } = await supabase.from("recurring_payables").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    void load();
  }

  async function generateNow() {
    setGenerating(true);
    try {
      const now = new Date();
      const { data, error } = await supabase.functions.invoke("generate-recurring-payables", {
        body: { year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      if (error) throw error;
      const r = data as { created: number; skipped: number; templates: number; errors?: string[] };
      toast.success(`Geradas ${r.created} contas (puladas ${r.skipped} de ${r.templates})`);
      if (r.errors?.length) console.warn("Erros parciais:", r.errors);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar contas do mês");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Repeat2 className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Contas recorrentes
        </h1>
        <p className="text-muted-foreground">
          Cadastre uma vez e o sistema gera automaticamente todo mês. Fixas entram com valor; variáveis (água/luz) entram aguardando valor.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base">Templates</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterActive} onValueChange={(v) => setFilterActive(v as typeof filterActive)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={generateNow} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Gerar mês atual
              </Button>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Novo template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Tipo</TableHead>
                    <TableHead className="text-center">Vence dia</TableHead>
                    <TableHead className="text-right">Valor padrão</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.description}</TableCell>
                      <TableCell>{stores.find(s => s.id === t.store_id)?.name ?? "—"}</TableCell>
                      <TableCell>{categories.find(c => c.id === t.category_id)?.name ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={t.kind === "fixed" ? "secondary" : "outline"}>
                          {t.kind === "fixed" ? "Fixo" : "Variável"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{t.due_day}</TableCell>
                      <TableCell className="text-right">
                        {t.kind === "variable" ? <span className="text-muted-foreground">—</span> : brl(t.default_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.active ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(t)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum template cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar template" : "Nova conta recorrente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2">
              <Label>Descrição *</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex.: SAIPOS Asa Sul" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.kind ?? "fixed"} onValueChange={(v) => setForm(f => ({ ...f, kind: v as "fixed" | "variable" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixo (valor conhecido)</SelectItem>
                  <SelectItem value="variable">Variável (água, luz…)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dia de vencimento *</Label>
              <Input type="number" min={1} max={31} value={form.due_day ?? 10} onChange={(e) => setForm(f => ({ ...f, due_day: Number(e.target.value) }))} />
            </div>
            {form.kind !== "variable" && (
              <div>
                <Label>Valor padrão (R$)</Label>
                <Input type="number" step="0.01" value={form.default_amount ?? 0} onChange={(e) => setForm(f => ({ ...f, default_amount: Number(e.target.value) }))} />
              </div>
            )}
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={form.payment_method ?? "pix"} onValueChange={(v) => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="debito_automatico">Débito automático</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="ted">TED</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja</Label>
              <Select value={form.store_id ?? ""} onValueChange={(v) => setForm(f => ({ ...f, store_id: v || null }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id ?? ""} onValueChange={(v) => setForm(f => ({ ...f, category_id: v || null }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id ?? ""} onValueChange={(v) => setForm(f => ({ ...f, supplier_id: v || null }))}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta bancária</Label>
              <Select value={form.bank_account_id ?? ""} onValueChange={(v) => setForm(f => ({ ...f, bank_account_id: v || null }))}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Início (mês)</Label>
              <Input type="month" value={(form.start_month ?? "").slice(0, 7)} onChange={(e) => setForm(f => ({ ...f, start_month: e.target.value + "-01" }))} />
            </div>
            <div>
              <Label>Fim (opcional)</Label>
              <Input type="month" value={(form.end_month ?? "").slice(0, 7)} onChange={(e) => setForm(f => ({ ...f, end_month: e.target.value ? e.target.value + "-01" : null }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={!!form.active} onCheckedChange={(v) => setForm(f => ({ ...f, active: v }))} />
              <Label className="cursor-pointer" onClick={() => setForm(f => ({ ...f, active: !f.active }))}>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
