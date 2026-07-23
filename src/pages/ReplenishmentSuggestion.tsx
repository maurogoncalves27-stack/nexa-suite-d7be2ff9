import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, Factory, ArrowRight, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sortStores } from "@/lib/storeSort";
import { isFactoryName } from "@/lib/factory";

interface StockRow {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  min_qty: number;
  target_qty: number;
  inventory_products: {
    name: string;
    unit: string;
    average_cost: number;
    production_flow: string | null;
    stock_scope: string | null;
    infinite_stock: boolean | null;
  };
  stores: { name: string; is_virtual: boolean };
}

interface Suggestion {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  unit: string;
  current: number;
  min: number;
  target: number;
  need: number;
  flow: "comprado" | "produzido_fabrica" | "misto";
  cost: number;
}

const isCentral = (name: string) => /estoque\s*central/i.test(name);

const ReplenishmentSuggestion = () => {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_stock")
      .select("id, store_id, product_id, quantity, min_qty, target_qty, inventory_products(name, unit, average_cost, production_flow, stock_scope, infinite_stock), stores!inner(name, is_virtual)")
      .eq("stores.is_virtual", false);
    if (error) toast.error(error.message);
    setRows((data as unknown as StockRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    return rows
      .filter((r) => !isCentral(r.stores?.name ?? ""))
      .filter((r) => !r.inventory_products?.infinite_stock)
      .map((r) => {
        const current = Number(r.quantity ?? 0);
        const min = Number(r.min_qty ?? 0);
        const target = Number(r.target_qty ?? 0);
        const goal = Math.max(target, min);
        if (min <= 0 || current >= min || goal <= current) return null;
        const need = goal - current;
        const flow = (r.inventory_products?.production_flow ?? "comprado") as Suggestion["flow"];
        return {
          storeId: r.store_id,
          storeName: r.stores.name,
          productId: r.product_id,
          productName: r.inventory_products?.name ?? "—",
          unit: r.inventory_products?.unit ?? "",
          current,
          min,
          target: goal,
          need,
          flow,
          cost: need * Number(r.inventory_products?.average_cost ?? 0),
        } as Suggestion;
      })
      .filter((s): s is Suggestion => s !== null)
      .filter((s) => storeFilter === "all" || s.storeId === storeFilter)
      .sort((a, b) => a.storeName.localeCompare(b.storeName) || a.productName.localeCompare(b.productName));
  }, [rows, storeFilter]);

  const stores = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (!isCentral(r.stores?.name ?? "")) map.set(r.store_id, r.stores.name); });
    return sortStores(Array.from(map, ([id, name]) => ({ id, name })));
  }, [rows]);

  const groupProduction = suggestions.filter((s) => s.flow === "produzido_fabrica");
  const groupTransfer = suggestions.filter((s) => s.flow !== "produzido_fabrica");
  const totalCost = suggestions.reduce((s, x) => s + x.cost, 0);

  const renderTable = (data: Suggestion[], emptyMsg: string) => {
    if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">{emptyMsg}</p>;
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Atual</TableHead>
              <TableHead className="text-right">Mín</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className="text-right">Repor</TableHead>
              <TableHead>Un.</TableHead>
              <TableHead className="text-right">Custo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => (
              <TableRow key={`${s.storeId}-${s.productId}`}>
                <TableCell>
                  <Badge variant="outline" className={isFactoryName(s.storeName) ? "border-primary/40 text-primary" : undefined}>
                    {s.storeName}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{s.productName}</TableCell>
                <TableCell className="text-right">{s.current.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s.min.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s.target.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                <TableCell className="text-right font-bold text-primary">{s.need.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                <TableCell>{s.unit}</TableCell>
                <TableCell className="text-right">{s.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Sugestão de abastecimento
        </h1>
        <p className="text-muted-foreground">
          Cruza saldo atual × mínimo × meta de cada loja e propõe o que precisa ser <b>produzido pela CD</b> ou <b>transferido do Estoque Central</b>.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recarregar"}
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {suggestions.length} sugestões • Custo estimado: <b>{totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs defaultValue="produzir" className="space-y-3">
              <TabsList className="grid w-full max-w-lg grid-cols-2">
                <TabsTrigger value="produzir" className="gap-2">
                  <Factory className="h-4 w-4" /> Produzir na CD ({groupProduction.length})
                </TabsTrigger>
                <TabsTrigger value="transferir" className="gap-2">
                  <ArrowRight className="h-4 w-4" /> Transferir do Central ({groupTransfer.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="produzir">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Factory className="h-4 w-4 text-primary" /> CD precisa produzir
                    </CardTitle>
                    <CardDescription>Itens de fluxo <b>produzido_fabrica</b> abaixo do mínimo em alguma loja.</CardDescription>
                  </CardHeader>
                  <CardContent>{renderTable(groupProduction, "Nada a produzir agora.")}</CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="transferir">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-primary" /> Estoque Central → Loja
                    </CardTitle>
                    <CardDescription>Itens <b>comprados</b> abaixo do mínimo — devem sair do Central para as lojas.</CardDescription>
                  </CardHeader>
                  <CardContent>{renderTable(groupTransfer, "Nada a transferir agora.")}</CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReplenishmentSuggestion;
