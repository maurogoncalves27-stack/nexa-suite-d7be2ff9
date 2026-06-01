import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, TrendingUp, Package, AlertCircle, DollarSign, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SaleItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  inventory_product_id: string | null;
};

type RecipeIng = { product_id: string; quantity: number };
type Recipe = { id: string; name: string; yield_quantity: number; recipe_ingredients: RecipeIng[] };
type MenuItem = { id: string; name: string; price: number; recipe_id: string | null };
type Mapping = { pos_item_name: string; recipe_id: string | null; inventory_product_id: string | null };
type Product = { id: string; name: string; last_cost: number | null; average_cost: number | null };

type Row = {
  name: string;
  qty: number;
  revenue: number;
  unitCost: number | null;
  totalCost: number | null;
  margin: number | null;
  cmvPct: number | null;
  hasRecipe: boolean;
  hasCost: boolean;
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

export default function FinanceCmv() {
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      // 1. Vendas no período (PDV próprio)
      const { data: sales } = await supabase
        .from("pdv_orders")
        .select("id")
        .eq("status", "concluded")
        .gte("concluded_at", `${from}T00:00:00`)
        .lte("concluded_at", `${to}T23:59:59`);
      const saleIds = (sales ?? []).map((s) => s.id);

      let items: SaleItem[] = [];
      if (saleIds.length > 0) {
        const { data: si } = await supabase
          .from("pdv_order_items")
          .select("name, quantity, unit_price, total, menu_item_id")
          .in("order_id", saleIds);
        items = (si ?? []).map((r: any) => ({
          product_name: r.name,
          quantity: Number(r.quantity ?? 0),
          unit_price: Number(r.unit_price ?? 0),
          total_price: Number(r.total ?? 0),
          inventory_product_id: null,
        })) as any;
      }

      // 2. Cardápio (preço + recipe_id)
      const { data: menu } = await supabase
        .from("menu_items")
        .select("id, name, price, recipe_id")
        .eq("is_active", true);
      const menuByName = new Map<string, MenuItem>();
      for (const m of (menu ?? []) as MenuItem[]) menuByName.set(norm(m.name), m);

      // 3. Mapeamentos PDV → receita
      const { data: maps } = await supabase
        .from("pos_item_mappings")
        .select("pos_item_name, recipe_id, inventory_product_id");
      const mapByName = new Map<string, Mapping>();
      for (const m of (maps ?? []) as Mapping[]) mapByName.set(norm(m.pos_item_name), m);

      // 4. Receitas + ingredientes
      const { data: recipes } = await supabase
        .from("recipes")
        .select("id, name, yield_quantity, recipe_ingredients(product_id, quantity)");
      const recipeById = new Map<string, Recipe>();
      for (const r of (recipes ?? []) as Recipe[]) recipeById.set(r.id, r);

      // 5. Custos dos insumos
      const { data: prods } = await supabase
        .from("inventory_products")
        .select("id, name, last_cost, average_cost");
      const prodById = new Map<string, Product>();
      for (const p of (prods ?? []) as Product[]) prodById.set(p.id, p);

      // 6. Agrega vendas por nome do prato
      const grouped = new Map<string, { qty: number; revenue: number; sample: SaleItem }>();
      for (const it of items) {
        const key = norm(it.product_name);
        const cur = grouped.get(key);
        if (cur) {
          cur.qty += Number(it.quantity ?? 0);
          cur.revenue += Number(it.total_price ?? 0);
        } else {
          grouped.set(key, {
            qty: Number(it.quantity ?? 0),
            revenue: Number(it.total_price ?? 0),
            sample: it,
          });
        }
      }

      // Se não houver itens (caso atual), usa cabeçalho × cardápio como fallback simulado seria misleading.
      // Preferimos mostrar tabela vazia e indicar via banner.

      // 7. Calcula custo unitário de cada prato vendido
      const out: Row[] = [];
      for (const [key, agg] of grouped) {
        // resolve recipe_id: 1) menu_items.recipe_id; 2) pos_item_mappings.recipe_id
        let recipeId: string | null = null;
        const menuMatch = menuByName.get(key);
        if (menuMatch?.recipe_id) recipeId = menuMatch.recipe_id;
        if (!recipeId) {
          const mp = mapByName.get(key);
          if (mp?.recipe_id) recipeId = mp.recipe_id;
        }

        let unitCost: number | null = null;
        let hasCost = false;
        const hasRecipe = !!recipeId;

        if (recipeId) {
          const r = recipeById.get(recipeId);
          if (r) {
            const yieldQ = Number(r.yield_quantity) || 1;
            let totalCost = 0;
            let allCosted = true;
            for (const ing of r.recipe_ingredients ?? []) {
              const p = prodById.get(ing.product_id);
              const cost = p?.last_cost ?? p?.average_cost ?? null;
              if (cost == null || cost <= 0) { allCosted = false; continue; }
              totalCost += Number(ing.quantity) * Number(cost);
            }
            if (allCosted && totalCost > 0) {
              unitCost = totalCost / yieldQ;
              hasCost = true;
            }
          }
        }

        // Fallback: produto direto vendido (não receita)
        if (!hasRecipe && agg.sample.inventory_product_id) {
          const p = prodById.get(agg.sample.inventory_product_id);
          const cost = p?.last_cost ?? p?.average_cost ?? null;
          if (cost && cost > 0) { unitCost = Number(cost); hasCost = true; }
        }

        const totalCost = unitCost != null ? unitCost * agg.qty : null;
        const margin = totalCost != null ? agg.revenue - totalCost : null;
        const cmvPct = totalCost != null && agg.revenue > 0 ? (totalCost / agg.revenue) * 100 : null;

        out.push({
          name: agg.sample.product_name,
          qty: agg.qty,
          revenue: agg.revenue,
          unitCost,
          totalCost,
          margin,
          cmvPct,
          hasRecipe,
          hasCost,
        });
      }

      // Ordena por receita desc (curva ABC)
      out.sort((a, b) => b.revenue - a.revenue);
      setRows(out);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Curva ABC: A = primeiros 80% da receita, B = próximos 15%, C = últimos 5%
  const abcRows = useMemo(() => {
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    let acc = 0;
    return rows.map((r) => {
      acc += r.revenue;
      const cum = totalRev > 0 ? (acc / totalRev) * 100 : 0;
      let curve: "A" | "B" | "C" = "C";
      if (cum <= 80) curve = "A";
      else if (cum <= 95) curve = "B";
      return { ...r, cumPct: cum, curve };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cost = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0);
    const coveredRevenue = rows.filter((r) => r.hasCost).reduce((s, r) => s + r.revenue, 0);
    const coveragePct = revenue > 0 ? (coveredRevenue / revenue) * 100 : 0;
    const cmvPct = coveredRevenue > 0 ? (cost / coveredRevenue) * 100 : 0;
    const margin = coveredRevenue - cost;
    return { revenue, cost, coveragePct, cmvPct, margin, coveredRevenue };
  }, [rows]);

  return (
    <div className="space-y-4 p-3 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-xl font-bold md:text-2xl flex items-center gap-2">CMV — Custo da Mercadoria Vendida</h1>
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
          Calcula custo real de cada prato vendido com base nas fichas técnicas e no último custo dos insumos.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="grid gap-1 flex-1">
            <Label htmlFor="from">De</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1 flex-1">
            <Label htmlFor="to">Até</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={load} disabled={loading} className="sm:w-auto w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Faturamento</CardDescription>
            <CardTitle className="text-xl tabular-nums">{fmtBRL(totals.revenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Package className="h-3 w-3" /> CMV total</CardDescription>
            <CardTitle className="text-xl tabular-nums">{fmtBRL(totals.cost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> CMV %</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {totals.cmvPct > 0 ? fmtPct(totals.cmvPct) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground -mt-2">
            Margem: {fmtBRL(totals.margin)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cobertura</CardDescription>
            <CardTitle className="text-xl tabular-nums">{fmtPct(totals.coveragePct)}</CardTitle>
          </CardHeader>
          <CardContent className="-mt-2">
            <Progress value={totals.coveragePct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">do faturamento com ficha + custo</p>
          </CardContent>
        </Card>
      </div>

      {/* Avisos */}
      {rows.length === 0 && !loading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sem itens de venda no período</AlertTitle>
          <AlertDescription>
            As vendas estão sendo sincronizadas do Saipos só com cabeçalho (sem detalhe dos itens).
            Assim que os itens começarem a entrar em <code>pos_sale_items</code>, este painel popula automaticamente.
          </AlertDescription>
        </Alert>
      )}

      {totals.coveragePct < 100 && rows.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cobertura parcial</AlertTitle>
          <AlertDescription>
            {fmtPct(100 - totals.coveragePct)} do faturamento ainda não tem ficha técnica completa ou custo de insumo.
            Os pratos faltantes aparecem destacados na tabela abaixo.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela curva ABC */}
      <Card>
        <CardHeader>
          <CardTitle>Curva ABC por prato</CardTitle>
          <CardDescription>
            A = 80% do faturamento (priorize fichas) · B = próximos 15% · C = cauda longa
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prato</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead className="text-right">CMV total</TableHead>
                  <TableHead className="text-right">CMV %</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-center">Curva</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abcRows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">
                      {r.name}
                      {!r.hasRecipe && <Badge variant="outline" className="ml-2 text-[10px]">sem ficha</Badge>}
                      {r.hasRecipe && !r.hasCost && <Badge variant="outline" className="ml-2 text-[10px]">sem custo</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.unitCost != null ? fmtBRL(r.unitCost) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totalCost != null ? fmtBRL(r.totalCost) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.cmvPct != null ? fmtPct(r.cmvPct) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.margin != null ? fmtBRL(r.margin) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={r.curve === "A" ? "default" : r.curve === "B" ? "secondary" : "outline"}
                      >
                        {r.curve}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y">
            {abcRows.map((r) => (
              <div key={r.name} className="px-4 py-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm flex-1">{r.name}</p>
                  <Badge
                    variant={r.curve === "A" ? "default" : r.curve === "B" ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {r.curve}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!r.hasRecipe && <Badge variant="outline" className="text-[10px]">sem ficha</Badge>}
                  {r.hasRecipe && !r.hasCost && <Badge variant="outline" className="text-[10px]">sem custo</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground tabular-nums pt-1">
                  <span>Qtd: <strong className="text-foreground">{r.qty}</strong></span>
                  <span>Receita: <strong className="text-foreground">{fmtBRL(r.revenue)}</strong></span>
                  <span>CMV %: <strong className="text-foreground">{r.cmvPct != null ? fmtPct(r.cmvPct) : "—"}</strong></span>
                  <span>Margem: <strong className="text-foreground">{r.margin != null ? fmtBRL(r.margin) : "—"}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
