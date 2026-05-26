import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Link2, Package, ChefHat, Search, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface UnlinkedRow {
  product_name: string;
  total_quantity: number;
  occurrences: number;
  last_sold_at: string;
  stores_count: number;
}
interface InvProduct { id: string; name: string }
interface RecipeOpt { id: string; name: string }

export default function UnlinkedItemsPanel() {
  const [rows, setRows] = useState<UnlinkedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [linkTarget, setLinkTarget] = useState<UnlinkedRow | null>(null);
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [recipes, setRecipes] = useState<RecipeOpt[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [unlinkedRes, productsRes, recipesRes] = await Promise.all([
      supabase.rpc("list_unlinked_pos_items"),
      supabase.from("inventory_products").select("id, name").order("name").limit(2000),
      supabase.from("recipes").select("id, name").eq("is_active", true).order("name").limit(500),
    ]);
    setRows((unlinkedRes.data as UnlinkedRow[] | null) ?? []);
    setProducts(productsRes.data ?? []);
    setRecipes(recipesRes.data ?? []);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const link = async (kind: "product" | "recipe", id: string) => {
    if (!linkTarget) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("link_pos_item", {
        _pos_item_name: linkTarget.product_name,
        _inventory_product_id: kind === "product" ? id : null,
        _recipe_id: kind === "recipe" ? id : null,
      });
      if (error) throw error;
      const res = data as { items_updated: number; movements_created: number } | null;
      toast({
        title: "Vínculo aplicado",
        description: `${res?.items_updated ?? 0} vendas atualizadas, ${res?.movements_created ?? 0} baixas de estoque geradas.`,
      });
      setLinkTarget(null);
      setProductSearch("");
      setRecipeSearch("");
      await load();
    } catch (err) {
      toast({
        title: "Erro ao vincular",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRows = rows.filter((r) =>
    r.product_name.toLowerCase().includes(search.toLowerCase()),
  );
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()),
  ).slice(0, 50);
  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(recipeSearch.toLowerCase()),
  ).slice(0, 50);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.product_name));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredRows.forEach((r) => next.delete(r.product_name));
      } else {
        filteredRows.forEach((r) => next.add(r.product_name));
      }
      return next;
    });
  };
  const toggleOne = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedNames = useMemo(() => Array.from(selected), [selected]);

  const bulkCreateRecipes = async () => {
    if (selectedNames.length === 0) return;
    setBulkSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("bulk_create_recipes_from_pos_names", {
        _names: selectedNames,
      });
      if (error) throw error;
      const res = data as {
        recipes_created: number;
        products_created: number;
        mappings_created: number;
        items_updated: number;
      } | null;
      toast({
        title: "Receitas criadas",
        description: `${res?.recipes_created ?? 0} receitas, ${res?.products_created ?? 0} produtos de saída e ${res?.mappings_created ?? 0} vínculos. Adicione os ingredientes em "Fichas técnicas" para baixar estoque.`,
      });
      setBulkOpen(false);
      await load();
    } catch (err) {
      toast({
        title: "Erro ao criar receitas",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setBulkSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Itens vendidos no PDV Saipos que ainda não estão vinculados ao seu inventário ou a uma receita. Selecione vários para criar receitas em lote, ou vincule um a um para mapear a produtos/receitas existentes.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item..."
              className="pl-8"
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm">
              <strong>{selected.size}</strong> item(ns) selecionado(s)
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </Button>
              <Button size="sm" onClick={() => setBulkOpen(true)} className="gap-1">
                <Sparkles className="h-3 w-3" /> Criar receitas em lote
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            🎉 Nenhum item sem vínculo. Tudo está mapeado!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Item no PDV</TableHead>
                  <TableHead className="text-right">Total vendido</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead>Última venda</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => (
                  <TableRow key={r.product_name} data-state={selected.has(r.product_name) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.product_name)}
                        onCheckedChange={() => toggleOne(r.product_name)}
                        aria-label={`Selecionar ${r.product_name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.total_quantity))}</TableCell>
                    <TableCell className="text-right">{r.occurrences}</TableCell>
                    <TableCell>{fmtDate(r.last_sold_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setLinkTarget(r)}>
                        <Link2 className="h-3 w-3 mr-1" /> Vincular
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Dialog: vincular individual */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular "{linkTarget?.product_name}"</DialogTitle>
            <DialogDescription>
              Escolha um produto do inventário para baixa direta, ou uma receita para baixar os ingredientes proporcionais. O vínculo é aplicado retroativamente em todas as vendas já importadas.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="product">
            <TabsList className="w-full">
              <TabsTrigger value="product" className="flex-1 gap-2">
                <Package className="h-4 w-4" /> Produto direto
              </TabsTrigger>
              <TabsTrigger value="recipe" className="flex-1 gap-2">
                <ChefHat className="h-4 w-4" /> Receita
              </TabsTrigger>
            </TabsList>

            <TabsContent value="product" className="space-y-3 mt-4">
              <Input
                placeholder="Buscar produto..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <div className="max-h-[320px] overflow-y-auto border rounded-md divide-y">
                {filteredProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">Nenhum produto encontrado</p>
                ) : filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    disabled={submitting}
                    onClick={() => link("product", p.id)}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between disabled:opacity-50"
                  >
                    <span>{p.name}</span>
                    <Badge variant="outline" className="text-xs">Vincular</Badge>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recipe" className="space-y-3 mt-4">
              <Input
                placeholder="Buscar receita..."
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
              />
              <div className="max-h-[320px] overflow-y-auto border rounded-md divide-y">
                {filteredRecipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    Nenhuma receita ativa. Cadastre em <strong>Fichas técnicas</strong>.
                  </p>
                ) : filteredRecipes.map((r) => (
                  <button
                    key={r.id}
                    disabled={submitting}
                    onClick={() => link("recipe", r.id)}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between disabled:opacity-50"
                  >
                    <span>{r.name}</span>
                    <Badge variant="outline" className="text-xs">Vincular</Badge>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkTarget(null)} disabled={submitting}>
              Cancelar
            </Button>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: criação em lote */}
      <Dialog open={bulkOpen} onOpenChange={(o) => !bulkSubmitting && setBulkOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Criar receitas em lote
            </DialogTitle>
            <DialogDescription>
              Será criada <strong>uma receita vazia</strong> para cada item selecionado, junto com um produto de saída no inventário. Você precisará abrir cada receita em <strong>Fichas técnicas</strong> e adicionar os ingredientes para que o estoque comece a ser baixado nas próximas vendas.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[280px] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            {selectedNames.map((n) => (
              <div key={n} className="truncate">• {n}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>
              Cancelar
            </Button>
            <Button onClick={bulkCreateRecipes} disabled={bulkSubmitting} className="gap-2">
              {bulkSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar {selectedNames.length} receita{selectedNames.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
