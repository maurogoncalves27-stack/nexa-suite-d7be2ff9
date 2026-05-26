import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, AlertTriangle, TrendingUp, Undo2, DollarSign, Boxes } from "lucide-react";
import type { UniformItem } from "@/lib/uniforms";

interface Props {
  items: UniformItem[];
  stores: { id: string; name: string }[];
}

interface StockRow {
  store_id: string;
  uniform_item_id: string;
  size: string;
  quantity: number;
  min_alert: number;
}

interface DeliveryRow {
  id: string;
  delivered_on: string;
  total_cost: number;
  charge_to_employee: number;
  store_id: string;
}

interface DeliveryItemRow {
  delivery_id: string;
  quantity: number;
  returned_quantity: number;
  expected_return: boolean;
  unit_cost: number;
}

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function UniformDashboardPanel({ items, stores }: Props) {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString().slice(0, 10);

      const [{ data: st }, { data: dl }, { data: di }] = await Promise.all([
        supabase.from("uniform_stock").select("store_id, uniform_item_id, size, quantity, min_alert"),
        supabase
          .from("uniform_deliveries")
          .select("id, delivered_on, total_cost, charge_to_employee, store_id")
          .gte("delivered_on", sinceISO),
        supabase
          .from("uniform_delivery_items")
          .select("delivery_id, quantity, returned_quantity, expected_return, unit_cost"),
      ]);
      setStock((st ?? []) as StockRow[]);
      setDeliveries((dl ?? []) as DeliveryRow[]);
      setDeliveryItems((di ?? []) as DeliveryItemRow[]);
      setLoading(false);
    };
    load();
  }, []);

  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.name])), [stores]);

  const stats = useMemo(() => {
    const totalUnits = stock.reduce((s, r) => s + r.quantity, 0);
    const stockValue = stock.reduce((s, r) => {
      const cost = Number(itemMap[r.uniform_item_id]?.unit_cost ?? 0);
      return s + r.quantity * cost;
    }, 0);
    const lowStock = stock.filter((r) => r.min_alert > 0 && r.quantity <= r.min_alert);
    const outOfStock = stock.filter((r) => r.quantity <= 0);

    const last30Cost = deliveries.reduce((s, d) => s + Number(d.total_cost ?? 0), 0);
    const last30Charged = deliveries.reduce((s, d) => s + Number(d.charge_to_employee ?? 0), 0);
    const last30Count = deliveries.length;

    const pendingReturns = deliveryItems.reduce((s, di) => {
      if (!di.expected_return) return s;
      return s + Math.max(0, (di.quantity ?? 0) - (di.returned_quantity ?? 0));
    }, 0);

    return {
      totalUnits,
      stockValue,
      lowStock,
      outOfStock,
      last30Cost,
      last30Charged,
      last30Count,
      pendingReturns,
    };
  }, [stock, deliveries, deliveryItems, itemMap]);

  const stockByStore = useMemo(() => {
    const map: Record<string, { units: number; value: number }> = {};
    for (const r of stock) {
      const cost = Number(itemMap[r.uniform_item_id]?.unit_cost ?? 0);
      map[r.store_id] ||= { units: 0, value: 0 };
      map[r.store_id].units += r.quantity;
      map[r.store_id].value += r.quantity * cost;
    }
    return Object.entries(map)
      .map(([sid, v]) => ({ store: storeMap[sid] ?? "—", ...v }))
      .sort((a, b) => b.units - a.units);
  }, [stock, itemMap, storeMap]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Boxes className="h-4 w-4" /> Unidades em estoque</CardDescription>
            <CardTitle className="text-2xl">{stats.totalUnits.toLocaleString("pt-BR")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Em {stockByStore.length} {stockByStore.length === 1 ? "loja" : "lojas"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> Valor em estoque</CardDescription>
            <CardTitle className="text-2xl">{BRL(stats.stockValue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            A custo unitário do catálogo
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Entregas (30 dias)</CardDescription>
            <CardTitle className="text-2xl">{stats.last30Count}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Custo: {BRL(stats.last30Cost)} · Cobrado: {BRL(stats.last30Charged)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Undo2 className="h-4 w-4" /> Devoluções pendentes</CardDescription>
            <CardTitle className="text-2xl">{stats.pendingReturns}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Itens duráveis ainda não devolvidos
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Alertas de estoque
            </CardTitle>
            <CardDescription>
              {stats.outOfStock.length} sem saldo · {stats.lowStock.length} abaixo do mínimo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.outOfStock.length === 0 && stats.lowStock.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                Nenhum alerta no momento.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-auto">
                {[...stats.outOfStock, ...stats.lowStock.filter((l) => !stats.outOfStock.some((o) => o.store_id === l.store_id && o.uniform_item_id === l.uniform_item_id && o.size === l.size))]
                  .slice(0, 30)
                  .map((r, idx) => {
                    const it = itemMap[r.uniform_item_id];
                    const isOut = r.quantity <= 0;
                    return (
                      <div key={`${r.store_id}-${r.uniform_item_id}-${r.size}-${idx}`} className="flex items-center justify-between gap-2 p-2 border rounded-md text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{it?.name ?? "Item"} <span className="text-muted-foreground">· tam {r.size}</span></div>
                          <div className="text-xs text-muted-foreground truncate">{storeMap[r.store_id] ?? "—"}</div>
                        </div>
                        <Badge variant={isOut ? "destructive" : "outline"} className={isOut ? "" : "border-amber-500 text-amber-600"}>
                          {isOut ? "Sem saldo" : `${r.quantity}/${r.min_alert}`}
                        </Badge>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Estoque por loja
            </CardTitle>
            <CardDescription>Distribuição de unidades e valor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stockByStore.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                Sem estoque registrado.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-auto">
                {stockByStore.map((s) => (
                  <div key={s.store} className="flex items-center justify-between gap-2 p-2 border rounded-md text-sm">
                    <div className="font-medium truncate flex-1">{s.store}</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {s.units} un · {BRL(s.value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
