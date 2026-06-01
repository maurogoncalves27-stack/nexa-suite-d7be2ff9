import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Package, Save, Link2, CalendarClock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ProductStoreLinksDialog from "@/components/inventory/ProductStoreLinksDialog";
import LotsPanel from "@/components/inventory/LotsPanel";
import { sortStores } from "@/lib/storeSort";

interface StockRow {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  min_qty: number;
  max_qty: number;
  target_qty: number;
  inventory_products: { name: string; unit: string; category: string | null; average_cost: number };
  stores: { name: string };
}

interface Store {
  id: string;
  name: string;
}

const InventoryStock = () => {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const [stock, setStock] = useState<StockRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "below" | "above" | "zero">("all");
  const [edits, setEdits] = useState<Record<string, { min?: string; max?: string; target?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [linksDialog, setLinksDialog] = useState<{ productId: string; productName: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: stk }, { data: st }] = await Promise.all([
      supabase
        .from("inventory_stock")
        .select("id, store_id, product_id, quantity, min_qty, max_qty, target_qty, inventory_products(name, unit, category, average_cost), stores!inner(name, is_virtual)")
        .eq("stores.is_virtual", false)
        .order("quantity", { ascending: false }),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
    ]);
    setStock((stk as unknown as StockRow[]) ?? []);
    setStores(sortStores(st ?? []));
    setEdits({});
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const saveLimits = async (row: StockRow) => {
    const e = edits[row.id] ?? {};
    const min = e.min !== undefined ? Number(e.min) : Number(row.min_qty);
    const max = e.max !== undefined ? Number(e.max) : Number(row.max_qty);
    const target = e.target !== undefined ? Number(e.target) : Number(row.target_qty ?? 0);
    if ([min, max, target].some((n) => Number.isNaN(n) || n < 0)) {
      return toast({ title: "Valores inválidos", variant: "destructive" });
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from("inventory_stock")
      .update({ min_qty: min, max_qty: max, target_qty: target })
      .eq("id", row.id);
    setSavingId(null);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Limites atualizados" });
    setStock((p) => p.map((s) => (s.id === row.id ? { ...s, min_qty: min, max_qty: max, target_qty: target } : s)));
    setEdits((p) => { const n = { ...p }; delete n[row.id]; return n; });
  };

  const filtered = useMemo(() => {
    return stock.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        s.inventory_products?.name?.toLowerCase().includes(q) ||
        s.inventory_products?.category?.toLowerCase().includes(q) ||
        s.stores?.name?.toLowerCase().includes(q);
      const matchStore = storeFilter === "all" || s.store_id === storeFilter;
      const qty = Number(s.quantity);
      const min = Number(s.min_qty ?? 0);
      const max = Number(s.max_qty ?? 0);
      let matchStatus = true;
      if (statusFilter === "below") matchStatus = min > 0 && qty < min && qty > 0;
      else if (statusFilter === "above") matchStatus = max > 0 && qty > max;
      else if (statusFilter === "zero") matchStatus = qty <= 0;
      return matchSearch && matchStore && matchStatus;
    });
  }, [stock, search, storeFilter, statusFilter]);

  const counts = useMemo(() => {
    let below = 0, above = 0, zero = 0;
    stock.forEach((s) => {
      const qty = Number(s.quantity);
      const min = Number(s.min_qty ?? 0);
      const max = Number(s.max_qty ?? 0);
      if (qty <= 0) zero++;
      else if (min > 0 && qty < min) below++;
      if (max > 0 && qty > max) above++;
    });
    return { below, above, zero };
  }, [stock]);

  const totalValue = filtered.reduce((sum, s) => sum + Number(s.quantity) * Number(s.inventory_products?.average_cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-xl font-bold flex items-center gap-2">Estoque</h1>
        <p className="text-muted-foreground">Saldo atual de produtos por loja e controle de validades por lote.</p>
      </div>

      <Tabs defaultValue="saldo" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="saldo" className="gap-2">
            <Package className="h-4 w-4" /> Saldo
          </TabsTrigger>
          <TabsTrigger value="validades" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Validades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saldo" className="space-y-4">
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Saldo de estoque</CardTitle>
          <CardDescription>
            {filtered.length} item(ns) • Valor total: {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto, loja, categoria…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
              Todos
            </Button>
            <Button size="sm" variant={statusFilter === "zero" ? "default" : "outline"} onClick={() => setStatusFilter("zero")} className={statusFilter !== "zero" && counts.zero > 0 ? "border-destructive/50 text-destructive" : undefined}>
              Zerados ({counts.zero})
            </Button>
            <Button size="sm" variant={statusFilter === "below" ? "default" : "outline"} onClick={() => setStatusFilter("below")} className={statusFilter !== "below" && counts.below > 0 ? "border-destructive/50 text-destructive" : undefined}>
              Abaixo do mínimo ({counts.below})
            </Button>
            <Button size="sm" variant={statusFilter === "above" ? "default" : "outline"} onClick={() => setStatusFilter("above")} className={statusFilter !== "above" && counts.above > 0 ? "border-warning/60 text-warning" : undefined}>
              Excesso ({counts.above})
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item em estoque.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right w-24">Mín</TableHead>
                    <TableHead className="text-right w-24">Máx</TableHead>
                    <TableHead className="text-right w-28">Contingência</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    {isStaff && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const qty = Number(s.quantity);
                    const cost = Number(s.inventory_products?.average_cost ?? 0);
                    const min = Number(s.min_qty ?? 0);
                    const max = Number(s.max_qty ?? 0);
                    const belowMin = min > 0 && qty < min;
                    const aboveMax = max > 0 && qty > max;
                    const e = edits[s.id] ?? {};
                    const dirty = e.min !== undefined || e.max !== undefined || e.target !== undefined;
                    return (
                      <TableRow key={s.id} className={belowMin ? "bg-destructive/5" : aboveMax ? "bg-warning/10" : undefined}>
                        <TableCell className="font-medium">{s.inventory_products?.name ?? "—"}</TableCell>
                        <TableCell>{s.stores?.name ?? "—"}</TableCell>
                        <TableCell>{s.inventory_products?.category ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {qty <= 0 && <Badge variant="destructive" className="mr-1">Zerado</Badge>}
                          {belowMin && qty > 0 && <Badge variant="destructive" className="mr-1">Abaixo</Badge>}
                          {aboveMax && <Badge className="mr-1 bg-warning text-warning-foreground hover:bg-warning/90">Excesso</Badge>}
                          {qty.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                        </TableCell>
                        <TableCell>{s.inventory_products?.unit ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {isStaff ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              value={e.min ?? String(s.min_qty ?? 0)}
                              onChange={(ev) => setEdits((p) => ({ ...p, [s.id]: { ...p[s.id], min: ev.target.value } }))}
                            />
                          ) : (
                            Number(s.min_qty ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isStaff ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              value={e.max ?? String(s.max_qty ?? 0)}
                              onChange={(ev) => setEdits((p) => ({ ...p, [s.id]: { ...p[s.id], max: ev.target.value } }))}
                            />
                          ) : (
                            Number(s.max_qty ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isStaff ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              value={e.target ?? String(s.target_qty ?? 0)}
                              onChange={(ev) => setEdits((p) => ({ ...p, [s.id]: { ...p[s.id], target: ev.target.value } }))}
                            />
                          ) : (
                            Number(s.target_qty ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                          )}
                        </TableCell>
                        <TableCell className="text-right">{cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        <TableCell className="text-right font-semibold">{(qty * cost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        {isStaff && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Lojas vinculadas (sugestão de produção)"
                                onClick={() => setLinksDialog({ productId: s.product_id, productName: s.inventory_products?.name ?? "" })}
                              >
                                <Link2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant={dirty ? "default" : "ghost"} disabled={!dirty || savingId === s.id} onClick={() => saveLimits(s)}>
                                {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="validades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" /> Validades por lote
              </CardTitle>
              <CardDescription>
                Lotes ordenados por validade (FEFO — vencer primeiro aparece no topo). Lotes são criados automaticamente ao receber notas com validade preenchida.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LotsPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProductStoreLinksDialog
        open={!!linksDialog}
        onOpenChange={(v) => !v && setLinksDialog(null)}
        productId={linksDialog?.productId ?? null}
        productName={linksDialog?.productName ?? ""}
      />
    </div>
  );
};

export default InventoryStock;
