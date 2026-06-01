import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Download, Building } from "lucide-react";

type Category = "mobiliario" | "equipamento" | "utensilio";

const CATEGORY_LABEL: Record<Category, string> = {
  mobiliario: "Mobiliário",
  equipamento: "Equipamento",
  utensilio: "Utensílio",
};

const CATEGORY_VARIANT: Record<Category, "default" | "secondary" | "outline"> = {
  mobiliario: "default",
  equipamento: "secondary",
  utensilio: "outline",
};

interface Store { id: string; name: string }
interface Asset {
  id: string;
  store_id: string;
  category: Category;
  name: string;
  quantity: number;
  unit_value: number;
  acquired_at: string | null;
  depreciation_rate_yearly: number;
  notes: string | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function yearsBetween(from: string | null): number {
  if (!from) return 0;
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return 0;
  const ms = Date.now() - start;
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 365.25));
}

function currentValue(a: Asset): { gross: number; depreciated: number; current: number } {
  const gross = a.quantity * a.unit_value;
  const years = yearsBetween(a.acquired_at);
  const depRate = Math.min(100, Math.max(0, a.depreciation_rate_yearly)) / 100;
  const depreciated = Math.min(gross, gross * depRate * years);
  return { gross, depreciated, current: Math.max(0, gross - depreciated) };
}

const emptyForm = {
  store_id: "",
  category: "equipamento" as Category,
  name: "",
  quantity: "1",
  unit_value: "0",
  acquired_at: "",
  depreciation_rate_yearly: "10",
  notes: "",
};

export default function AssetInventory() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    const [storesRes, assetsRes] = await Promise.all([
      supabase.from("stores").select("id, name").eq("is_virtual", false).order("name"),
      supabase.from("asset_inventory").select("*").order("created_at", { ascending: false }),
    ]);
    if (storesRes.error) toast({ title: "Erro ao carregar lojas", description: storesRes.error.message, variant: "destructive" });
    if (assetsRes.error) toast({ title: "Erro ao carregar patrimônio", description: assetsRes.error.message, variant: "destructive" });
    setStores(storesRes.data ?? []);
    setAssets((assetsRes.data ?? []) as Asset[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return assets.filter((a) =>
      (storeFilter === "all" || a.store_id === storeFilter) &&
      (categoryFilter === "all" || a.category === categoryFilter),
    );
  }, [assets, storeFilter, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of filtered) {
      const arr = map.get(a.store_id) ?? [];
      arr.push(a);
      map.set(a.store_id, arr);
    }
    return Array.from(map.entries()).map(([sid, items]) => ({
      store: stores.find((s) => s.id === sid),
      items,
    }));
  }, [filtered, stores]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, a) => {
        const v = currentValue(a);
        acc.gross += v.gross;
        acc.depreciated += v.depreciated;
        acc.current += v.current;
        return acc;
      },
      { gross: 0, depreciated: 0, current: 0 },
    );
  }, [filtered]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, store_id: stores[0]?.id ?? "" });
    setDialogOpen(true);
  }

  function openEdit(a: Asset) {
    setEditing(a);
    setForm({
      store_id: a.store_id,
      category: a.category,
      name: a.name,
      quantity: String(a.quantity),
      unit_value: String(a.unit_value),
      acquired_at: a.acquired_at ?? "",
      depreciation_rate_yearly: String(a.depreciation_rate_yearly),
      notes: a.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.store_id || !form.name.trim()) {
      toast({ title: "Preencha loja e item", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      store_id: form.store_id,
      category: form.category,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 0,
      unit_value: Number(form.unit_value) || 0,
      acquired_at: form.acquired_at || null,
      depreciation_rate_yearly: Number(form.depreciation_rate_yearly) || 0,
      notes: form.notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("asset_inventory").update(payload).eq("id", editing.id)
      : await supabase.from("asset_inventory").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Item atualizado" : "Item adicionado" });
    setDialogOpen(false);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("asset_inventory").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item excluído" });
    load();
  }

  function exportCsv() {
    const rows = [
      ["Loja", "Categoria", "Item", "Qtde", "Valor unit.", "Valor bruto", "Aquisição", "Depreciação a.a. (%)", "Depreciação acumulada", "Valor atual", "Observações"],
      ...filtered.map((a) => {
        const store = stores.find((s) => s.id === a.store_id)?.name ?? "—";
        const v = currentValue(a);
        return [
          store, CATEGORY_LABEL[a.category], a.name,
          String(a.quantity),
          a.unit_value.toFixed(2),
          v.gross.toFixed(2),
          a.acquired_at ?? "",
          String(a.depreciation_rate_yearly),
          v.depreciated.toFixed(2),
          v.current.toFixed(2),
          a.notes ?? "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patrimonio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">Patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            Inventário de mobiliário, equipamentos e utensílios por loja
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar item" : "Novo item de patrimônio"}</DialogTitle>
                <DialogDescription>
                  Informe os dados do item. O valor atual é calculado automaticamente
                  a partir da depreciação anual e da data de aquisição.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Loja</Label>
                  <Select value={form.store_id} onValueChange={(v) => setForm((f) => ({ ...f, store_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as Category }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobiliario">Mobiliário</SelectItem>
                      <SelectItem value="equipamento">Equipamento</SelectItem>
                      <SelectItem value="utensilio">Utensílio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Item</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Mesa de aço inox" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Quantidade</Label>
                    <Input type="number" step="1" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Valor unitário (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.unit_value} onChange={(e) => setForm((f) => ({ ...f, unit_value: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Data de aquisição</Label>
                    <Input type="date" value={form.acquired_at} onChange={(e) => setForm((f) => ({ ...f, acquired_at: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Depreciação anual (%)</Label>
                    <Input type="number" step="0.1" min="0" max="100" value={form.depreciation_rate_yearly} onChange={(e) => setForm((f) => ({ ...f, depreciation_rate_yearly: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Observações</Label>
                  <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Valor bruto</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtBRL(totals.gross)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Depreciação acumulada</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{fmtBRL(totals.depreciated)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Valor atual</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">{fmtBRL(totals.current)}</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="mobiliario">Mobiliário</SelectItem>
            <SelectItem value="equipamento">Equipamento</SelectItem>
            <SelectItem value="utensilio">Utensílio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum item cadastrado. Clique em "Adicionar item" para começar.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ store, items }) => {
            const subtotal = items.reduce((s, a) => s + currentValue(a).current, 0);
            return (
              <Card key={store?.id ?? "sem-loja"}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">{store?.name ?? "Sem loja"}</CardTitle>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Subtotal atual: </span>
                      <span className="font-semibold">{fmtBRL(subtotal)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Qtde</TableHead>
                          <TableHead className="text-right">Valor unit.</TableHead>
                          <TableHead className="text-right">Bruto</TableHead>
                          <TableHead className="text-right">Atual</TableHead>
                          <TableHead className="w-[90px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((a) => {
                          const v = currentValue(a);
                          return (
                            <TableRow key={a.id}>
                              <TableCell>
                                <div className="font-medium">{a.name}</div>
                                {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                              </TableCell>
                              <TableCell><Badge variant={CATEGORY_VARIANT[a.category]}>{CATEGORY_LABEL[a.category]}</Badge></TableCell>
                              <TableCell className="text-right tabular-nums">{a.quantity}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtBRL(a.unit_value)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtBRL(v.gross)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{fmtBRL(v.current)}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => remove(a.id)}>Excluir</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile */}
                  <div className="md:hidden divide-y">
                    {items.map((a) => {
                      const v = currentValue(a);
                      return (
                        <div key={a.id} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{a.name}</p>
                              <Badge variant={CATEGORY_VARIANT[a.category]} className="mt-1 text-[10px]">{CATEGORY_LABEL[a.category]}</Badge>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => remove(a.id)}>Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Qtde:</span> <span className="tabular-nums">{a.quantity}</span></div>
                            <div><span className="text-muted-foreground">Unit.:</span> <span className="tabular-nums">{fmtBRL(a.unit_value)}</span></div>
                            <div><span className="text-muted-foreground">Bruto:</span> <span className="tabular-nums">{fmtBRL(v.gross)}</span></div>
                            <div><span className="text-muted-foreground">Atual:</span> <span className="font-semibold tabular-nums">{fmtBRL(v.current)}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
