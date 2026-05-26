import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Factory, Boxes, ChefHat, AlertTriangle, Sparkles, Hand, Layers, ShoppingCart, CalendarDays, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Source = "auto" | "manual" | "mixed";

interface PlanRow {
  level: "output" | "material";
  source: Source | null;
  recipe_id: string | null;
  recipe_name: string | null;
  product_id: string;
  product_name: string;
  unit: string;
  total_qty: number;
  factory_stock: number;
  deficit: number;
  store_count: number | null;
  manual_qty: number | null;
  auto_qty: number | null;
  details: any;
}

const fmt = (n: number | null | undefined, max = 4) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: max });

const SourceBadge = ({ source }: { source: Source | null }) => {
  if (source === "manual") return <Badge variant="secondary" className="gap-1"><Hand className="h-3 w-3" />Manual</Badge>;
  if (source === "mixed") return <Badge className="gap-1 bg-warning text-warning-foreground hover:bg-warning/90"><Layers className="h-3 w-3" />Misto</Badge>;
  return <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Auto</Badge>;
};

interface ConsolidatedRow {
  product_id: string;
  product_name: string;
  unit: string;
  qty_factory: number;
  qty_stores: number;
  qty_open_quotations: number;
  qty_to_buy: number;
  average_cost: number | null;
  estimated_cost: number;
  sources: string[];
}

export default function FactoryWeeklyPlan() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [consolidated, setConsolidated] = useState<ConsolidatedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [actualQty, setActualQty] = useState<Record<string, string>>({});
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [factoryStoreId, setFactoryStoreId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: cons, error: cErr }] = await Promise.all([
      supabase.rpc("factory_weekly_plan"),
      supabase.rpc("consolidated_purchase_plan" as any),
    ]);
    if (error) toast.error(error.message);
    if (cErr) toast.error(cErr.message);
    setRows((data ?? []) as unknown as PlanRow[]);
    setConsolidated((cons ?? []) as unknown as ConsolidatedRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("id")
        .eq("store_type", "fabrica")
        .eq("is_virtual", false)
        .limit(1)
        .maybeSingle();
      if (data?.id) setFactoryStoreId(data.id);
    })();
  }, []);

  const registerActual = async (row: PlanRow) => {
    if (!row.recipe_id) {
      toast.error("Esta sugestão não tem ficha técnica vinculada — registre a produção pela tela de Ficha Técnica.");
      return;
    }
    if (!factoryStoreId) {
      toast.error("Loja FÁBRICA não encontrada.");
      return;
    }
    const raw = (actualQty[row.product_id] ?? "").replace(",", ".").trim();
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Informe a produção real (quantidade do produto acabado).");
      return;
    }
    // Buscar yield_quantity da receita para calcular multiplicador real
    const { data: recipe, error: rErr } = await supabase
      .from("recipes")
      .select("yield_quantity")
      .eq("id", row.recipe_id)
      .maybeSingle();
    if (rErr || !recipe?.yield_quantity) {
      toast.error("Falha ao ler rendimento da ficha técnica.");
      return;
    }
    const multiplier = qty / Number(recipe.yield_quantity);
    setRegisteringId(row.product_id);
    try {
      const { error } = await supabase.rpc("produce_recipe", {
        _recipe_id: row.recipe_id,
        _store_id: factoryStoreId,
        _multiplier: multiplier,
        _notes: `Plano semanal — produção real ${qty} ${row.unit} (previsto ${row.total_qty} ${row.unit})`,
      });
      if (error) throw error;
      toast.success(`Produção registrada: ${qty} ${row.unit} de ${row.product_name}. Estoque ajustado.`);
      setActualQty((s) => ({ ...s, [row.product_id]: "" }));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao registrar produção real");
    } finally {
      setRegisteringId(null);
    }
  };

  const outputs = useMemo(() => rows.filter((r) => r.level === "output"), [rows]);
  const materials = useMemo(() => rows.filter((r) => r.level === "material"), [rows]);
  const deficitItems = useMemo(() => materials.filter((m) => m.deficit > 0), [materials]);
  const materialDeficit = deficitItems.length;
  const consolidatedTotal = useMemo(
    () => consolidated.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0),
    [consolidated]
  );

  const createQuotation = async () => {
    if (consolidated.length === 0) {
      toast.info("Nada a cotar: nenhum item em déficit nas lojas ou na fábrica.");
      return;
    }
    setCreatingQuote(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 3);

      const fabCount = consolidated.filter((r) => r.qty_factory > 0).length;
      const lojCount = consolidated.filter((r) => r.qty_stores > 0).length;

      const { data: q, error } = await supabase
        .from("quotations")
        .insert({
          title: `Cotação consolidada — ${new Date().toLocaleDateString("pt-BR")}`,
          description: `Gerada automaticamente: ${fabCount} insumo(s) da fábrica + ${lojCount} produto(s) abaixo do mínimo nas lojas (descontando cotações abertas).`,
          deadline: deadline.toISOString(),
          status: "open",
          created_by: uid,
        })
        .select("id")
        .single();
      if (error || !q) throw error ?? new Error("Falha ao criar cotação");

      const items = consolidated.map((r, i) => {
        const parts: string[] = [];
        if (r.qty_factory > 0) parts.push(`Fábrica: ${r.qty_factory}`);
        if (r.qty_stores > 0) parts.push(`Lojas: ${r.qty_stores}`);
        if (r.qty_open_quotations > 0) parts.push(`Já cotado: ${r.qty_open_quotations}`);
        return {
          quotation_id: q.id,
          product_id: r.product_id,
          description: r.product_name,
          quantity: Number(Number(r.qty_to_buy).toFixed(4)),
          unit: r.unit || "UN",
          notes: parts.join(" • "),
          sort_order: i,
        };
      });
      const { error: itErr } = await supabase.from("quotation_items").insert(items);
      if (itErr) throw itErr;

      toast.success(`Cotação criada com ${items.length} item(ns).`);
      navigate("/cotacoes");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar cotação");
    } finally {
      setCreatingQuote(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary" /> Plano semanal da fábrica
          </h1>
          <p className="text-muted-foreground text-sm">
            Consolida sugestões automáticas (estoque mínimo das lojas) + solicitações manuais e
            calcula a matéria-prima necessária no estoque central.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recalcular
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><ChefHat className="h-4 w-4" /> A produzir</CardDescription>
            <CardTitle className="text-2xl">{outputs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><Boxes className="h-4 w-4" /> Matérias-primas</CardDescription>
            <CardTitle className="text-2xl">{materials.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={materialDeficit > 0 ? "border-destructive/40" : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Insumos em déficit</CardDescription>
            <CardTitle className={`text-2xl ${materialDeficit > 0 ? "text-destructive" : ""}`}>{materialDeficit}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="outputs" className="space-y-4">
        <TabsList className="grid w-full sm:max-w-md grid-cols-2">
          <TabsTrigger value="outputs" className="gap-2"><ChefHat className="h-4 w-4" /> Produtos a produzir</TabsTrigger>
          <TabsTrigger value="materials" className="gap-2"><Boxes className="h-4 w-4" /> Matéria-prima</TabsTrigger>
        </TabsList>

        <TabsContent value="outputs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nível 1 — Produto acabado</CardTitle>
              <CardDescription>O que a fábrica precisa entregar esta semana, considerando todas as lojas.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : outputs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  ✅ Nenhuma produção pendente. Lojas dentro da contingência e sem solicitações abertas.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="hidden sm:table-cell">Ficha técnica</TableHead>
                        <TableHead className="text-right">Total previsto</TableHead>
                        <TableHead className="text-right">Estoque fábrica</TableHead>
                        <TableHead className="text-right">A produzir</TableHead>
                        <TableHead className="text-right min-w-[200px]">Produção real</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outputs.map((r) => {
                        const canRegister = !!r.recipe_id;
                        const busy = registeringId === r.product_id;
                        return (
                          <TableRow key={r.product_id} className={r.deficit > 0 ? "bg-warning/5" : undefined}>
                            <TableCell className="font-medium">
                              {r.product_name}
                              <div className="sm:hidden text-xs text-muted-foreground">
                                Auto {fmt(r.auto_qty)} · Manual {fmt(r.manual_qty)}
                              </div>
                            </TableCell>
                            <TableCell><SourceBadge source={r.source} /></TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{r.recipe_name ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{fmt(r.total_qty)} {r.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.factory_stock)}</TableCell>
                            <TableCell className="text-right tabular-nums font-bold text-primary">{fmt(r.deficit)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.0001"
                                  min={0}
                                  placeholder={String(r.deficit > 0 ? r.deficit : r.total_qty)}
                                  className="h-8 w-24 text-right tabular-nums"
                                  value={actualQty[r.product_id] ?? ""}
                                  onChange={(e) =>
                                    setActualQty((s) => ({ ...s, [r.product_id]: e.target.value }))
                                  }
                                  disabled={!canRegister || busy}
                                />
                                <span className="text-xs text-muted-foreground hidden sm:inline">{r.unit}</span>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-8 gap-1"
                                  disabled={!canRegister || busy || !(actualQty[r.product_id]?.trim())}
                                  onClick={() => registerActual(r)}
                                  title={canRegister ? "Registrar produção real (consome insumos e dá entrada do produto)" : "Sem ficha técnica vinculada"}
                                >
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  <span className="hidden sm:inline">Registrar</span>
                                </Button>
                              </div>
                            </TableCell>
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

        <TabsContent value="materials">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Nível 2 — Matéria-prima do estoque central</CardTitle>
                  <CardDescription>
                    Insumos necessários explodindo as fichas técnicas das produções acima.
                    {consolidated.length > 0 && (
                      <> A cotação consolida estes insumos com a sugestão de compra das lojas (estimativa: <strong>{consolidated.length} item(ns)</strong>, R$ {consolidatedTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).</>
                    )}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="gap-2 shrink-0"
                  disabled={creatingQuote || consolidated.length === 0}
                  onClick={createQuotation}
                  title={consolidated.length === 0 ? "Sem itens a cotar" : `Criar cotação consolidada com ${consolidated.length} item(ns)`}
                >
                  {creatingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Gerar cotação consolidada ({consolidated.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : materials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sem matéria-prima a consumir no momento.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Insumo</TableHead>
                        <TableHead className="text-right">Necessário</TableHead>
                        <TableHead className="text-right">No central</TableHead>
                        <TableHead className="text-right">Falta</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map((m) => (
                        <TableRow key={m.product_id} className={m.deficit > 0 ? "bg-destructive/5" : undefined}>
                          <TableCell className="font-medium">{m.product_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.total_qty)} {m.unit}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.factory_stock)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${m.deficit > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {m.deficit > 0 ? fmt(m.deficit) : "—"}
                          </TableCell>
                          <TableCell>
                            {m.deficit > 0 ? (
                              <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Comprar</Badge>
                            ) : (
                              <Badge variant="outline">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
