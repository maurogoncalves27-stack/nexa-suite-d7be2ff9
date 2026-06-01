import { useEffect, useMemo, useState } from "react";
import { Loader2, Calculator, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";

type Brand = { id: string; name: string };
type Recipe = { id: string; yield_quantity: number; recipe_ingredients: { product_id: string; quantity: number }[] };
type Product = { id: string; last_cost: number | null; average_cost: number | null };
type MenuItem = {
  id: string;
  name: string;
  price: number;
  recipe_id: string | null;
  category_id: string | null;
  is_active: boolean;
  menu_item_brands: { brand_id: string }[];
};

type Row = {
  id: string;
  brandNames: string;
  name: string;
  price: number;
  unitCost: number | null;
  hasRecipe: boolean;
  hasCost: boolean;
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

// % digitado como 26 → 0.26
const parsePct = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n / 100;
};

export default function FinancePricing() {
  const { isPartner, isAdmin, isManager } = useAuth();
  const { mode: viewMode } = useViewMode();
  const readOnly = viewMode === "socio" || (isPartner && !isAdmin && !isManager);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Parâmetros (defaults da planilha base)
  const [pctEntrega, setPctEntrega] = useState("0");
  const [pctVendas, setPctVendas] = useState("12");
  const [pctImposto, setPctImposto] = useState("6");
  const [pctDespesas, setPctDespesas] = useState("15");
  const [cmvAlvo, setCmvAlvo] = useState("26");
  const [saldoAlvo, setSaldoAlvo] = useState("5");

  const load = async () => {
    setLoading(true);
    try {
      const [brandsRes, menuRes, recipesRes, prodsRes] = await Promise.all([
        supabase.from("brands").select("id, name").order("name"),
        supabase
          .from("menu_items")
          .select("id, name, price, recipe_id, category_id, is_active, menu_item_brands(brand_id)")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("recipes")
          .select("id, yield_quantity, recipe_ingredients(product_id, quantity)"),
        supabase.from("inventory_products").select("id, last_cost, average_cost"),
      ]);

      setBrands((brandsRes.data ?? []) as Brand[]);
      const brandMap = new Map<string, string>();
      for (const b of (brandsRes.data ?? []) as Brand[]) brandMap.set(b.id, b.name);

      const recipeById = new Map<string, Recipe>();
      for (const r of (recipesRes.data ?? []) as Recipe[]) recipeById.set(r.id, r);

      const prodById = new Map<string, Product>();
      for (const p of (prodsRes.data ?? []) as Product[]) prodById.set(p.id, p);

      const out: Row[] = [];
      for (const m of (menuRes.data ?? []) as MenuItem[]) {
        let unitCost: number | null = null;
        let hasCost = false;
        const hasRecipe = !!m.recipe_id;

        if (m.recipe_id) {
          const r = recipeById.get(m.recipe_id);
          if (r) {
            const yieldQ = Number(r.yield_quantity) || 1;
            let total = 0;
            let allCosted = true;
            for (const ing of r.recipe_ingredients ?? []) {
              const p = prodById.get(ing.product_id);
              const cost = p?.last_cost ?? p?.average_cost ?? null;
              if (cost == null || cost <= 0) { allCosted = false; continue; }
              total += Number(ing.quantity) * Number(cost);
            }
            if (allCosted && total > 0) {
              unitCost = total / yieldQ;
              hasCost = true;
            }
          }
        }

        const brandNames = (m.menu_item_brands ?? [])
          .map((b) => brandMap.get(b.brand_id) ?? "")
          .filter(Boolean)
          .join(", ") || "—";

        out.push({
          id: m.id,
          brandNames,
          name: m.name,
          price: Number(m.price ?? 0),
          unitCost,
          hasRecipe,
          hasCost,
        });
      }

      // Ordena por nome
      out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setRows(out);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Cálculos por linha
  const enriched = useMemo(() => {
    const pE = parsePct(pctEntrega);
    const pV = parsePct(pctVendas);
    const pI = parsePct(pctImposto);
    const pD = parsePct(pctDespesas);
    const totalPct = pE + pV + pI + pD; // % aplicados ao preço
    const cmvT = parsePct(cmvAlvo);
    const saldoT = parsePct(saldoAlvo);
    // saldo% = 1 - cmv% - totalPct  →  preço sugerido tal que saldo% = saldoT
    // saldo = preço - custo - preço*totalPct  →  saldo% = 1 - custo/preço - totalPct
    // preço* = custo / (1 - totalPct - saldoT)
    const denomSaldo = 1 - totalPct - saldoT;

    return rows.map((r) => {
      const custoPorcao = r.unitCost;
      let cmv: number | null = null;
      let custosEntrega: number | null = null;
      let custosVendas: number | null = null;
      let imposto: number | null = null;
      let despesas: number | null = null;
      let saldo: number | null = null;
      let saldoPct: number | null = null;
      let precoCmv: number | null = null;
      let difCmv: number | null = null;
      let precoSugerido: number | null = null;
      let difSaldo: number | null = null;

      if (custoPorcao != null && r.price > 0) {
        cmv = custoPorcao / r.price;
        custosEntrega = r.price * pE;
        custosVendas = r.price * pV;
        imposto = r.price * pI;
        despesas = r.price * pD;
        saldo = r.price - custoPorcao - custosEntrega - custosVendas - imposto - despesas;
        saldoPct = saldo / r.price;
      }
      if (custoPorcao != null && cmvT > 0) {
        precoCmv = custoPorcao / cmvT;
        difCmv = precoCmv - r.price;
      }
      if (custoPorcao != null && denomSaldo > 0) {
        precoSugerido = custoPorcao / denomSaldo;
        difSaldo = precoSugerido - r.price;
      }

      return {
        ...r,
        custoPorcao,
        cmv,
        custosEntrega,
        custosVendas,
        imposto,
        despesas,
        saldo,
        saldoPct,
        precoCmv,
        difCmv,
        precoSugerido,
        difSaldo,
      };
    });
  }, [rows, pctEntrega, pctVendas, pctImposto, pctDespesas, cmvAlvo, saldoAlvo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (brandFilter !== "all" && !r.brandNames.toLowerCase().includes(
        (brands.find((b) => b.id === brandFilter)?.name ?? "").toLowerCase()
      )) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, brandFilter, brands, search]);

  const totalPctSum = parsePct(pctEntrega) + parsePct(pctVendas) + parsePct(pctImposto) + parsePct(pctDespesas);
  const denomSaldoCheck = 1 - totalPctSum - parsePct(saldoAlvo);

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold flex items-center gap-2 md:text-2xl">
          <Calculator className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Precificação
        </h1>
        <p className="text-sm text-muted-foreground">
          Simule preços com base em CMV, custos variáveis e saldo desejado. Nada é gravado — só simulação.
        </p>
      </div>

      {/* Parâmetros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros globais</CardTitle>
          <CardDescription>
            Custos aplicados como % do preço de venda. Total atual: <strong>{fmtPct(totalPctSum * 100)}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="ent">Entrega grátis %</Label>
            <Input id="ent" inputMode="decimal" value={pctEntrega} onChange={(e) => setPctEntrega(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ven">Custos vendas %</Label>
            <Input id="ven" inputMode="decimal" value={pctVendas} onChange={(e) => setPctVendas(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="imp">Imposto %</Label>
            <Input id="imp" inputMode="decimal" value={pctImposto} onChange={(e) => setPctImposto(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="des">Despesas fixas %</Label>
            <Input id="des" inputMode="decimal" value={pctDespesas} onChange={(e) => setPctDespesas(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cmv">CMV alvo %</Label>
            <Input id="cmv" inputMode="decimal" value={cmvAlvo} onChange={(e) => setCmvAlvo(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sal">Saldo alvo %</Label>
            <Input id="sal" inputMode="decimal" value={saldoAlvo} onChange={(e) => setSaldoAlvo(e.target.value)} readOnly={readOnly} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      {denomSaldoCheck <= 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Parâmetros inviáveis</AlertTitle>
          <AlertDescription>
            A soma de custos % + saldo alvo % chegou a {fmtPct((totalPctSum + parsePct(saldoAlvo)) * 100)}.
            Sem margem para o custo do insumo. Reduza algum %.
          </AlertDescription>
        </Alert>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
          <div className="grid gap-1 flex-1">
            <Label>Buscar prato</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do item..." />
          </div>
          <div className="grid gap-1 sm:w-64">
            <Label>Marca</Label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as marcas</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `${filtered.length} pratos`}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Preço cardápio</TableHead>
                  <TableHead className="text-right">Custo porção</TableHead>
                  <TableHead className="text-right">CMV</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Saldo %</TableHead>
                  <TableHead className="text-right">Preço por CMV</TableHead>
                  <TableHead className="text-right">Dif. CMV</TableHead>
                  <TableHead className="text-right">Preço sugerido</TableHead>
                  <TableHead className="text-right">Dif. saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{r.brandNames}</TableCell>
                    <TableCell className="font-medium">
                      {r.name}
                      {!r.hasRecipe && <Badge variant="outline" className="ml-2 text-[10px]">sem ficha</Badge>}
                      {r.hasRecipe && !r.hasCost && <Badge variant="outline" className="ml-2 text-[10px]">sem custo</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.price)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.custoPorcao != null ? fmtBRL(r.custoPorcao) : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums",
                      r.cmv != null && r.cmv > parsePct(cmvAlvo) && "text-destructive")}>
                      {r.cmv != null ? fmtPct(r.cmv * 100) : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums",
                      r.saldo != null && r.saldo < 0 && "text-destructive")}>
                      {r.saldo != null ? fmtBRL(r.saldo) : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums",
                      r.saldoPct != null && r.saldoPct < parsePct(saldoAlvo) && "text-destructive")}>
                      {r.saldoPct != null ? fmtPct(r.saldoPct * 100) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.precoCmv != null ? fmtBRL(r.precoCmv) : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums",
                      r.difCmv != null && r.difCmv > 0 && "text-amber-600")}>
                      {r.difCmv != null ? fmtBRL(r.difCmv) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {r.precoSugerido != null ? fmtBRL(r.precoSugerido) : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums",
                      r.difSaldo != null && r.difSaldo > 0 && "text-amber-600")}>
                      {r.difSaldo != null ? fmtBRL(r.difSaldo) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile/Tablet */}
          <div className="lg:hidden divide-y">
            {filtered.map((r) => (
              <div key={r.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">{r.brandNames}</p>
                    <p className="font-medium text-sm">{r.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Preço</p>
                    <p className="font-semibold tabular-nums">{fmtBRL(r.price)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!r.hasRecipe && <Badge variant="outline" className="text-[10px]">sem ficha</Badge>}
                  {r.hasRecipe && !r.hasCost && <Badge variant="outline" className="text-[10px]">sem custo</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums pt-1">
                  <span className="text-muted-foreground">Custo: <strong className="text-foreground">{r.custoPorcao != null ? fmtBRL(r.custoPorcao) : "—"}</strong></span>
                  <span className="text-muted-foreground">CMV: <strong className={cn(r.cmv != null && r.cmv > parsePct(cmvAlvo) ? "text-destructive" : "text-foreground")}>{r.cmv != null ? fmtPct(r.cmv * 100) : "—"}</strong></span>
                  <span className="text-muted-foreground">Saldo: <strong className={cn(r.saldo != null && r.saldo < 0 ? "text-destructive" : "text-foreground")}>{r.saldo != null ? fmtBRL(r.saldo) : "—"}</strong></span>
                  <span className="text-muted-foreground">Saldo %: <strong className={cn(r.saldoPct != null && r.saldoPct < parsePct(saldoAlvo) ? "text-destructive" : "text-foreground")}>{r.saldoPct != null ? fmtPct(r.saldoPct * 100) : "—"}</strong></span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Preço por CMV</p>
                    <p className="font-medium tabular-nums">{r.precoCmv != null ? fmtBRL(r.precoCmv) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Preço sugerido</p>
                    <p className="font-semibold tabular-nums">{r.precoSugerido != null ? fmtBRL(r.precoSugerido) : "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum prato encontrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
