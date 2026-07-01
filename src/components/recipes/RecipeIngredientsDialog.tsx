import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT", "PORCAO"];

interface Product { id: string; name: string; unit: string; average_cost: number; category: string | null; factory_only: boolean; usage_roles: string[] | null; }
interface RecipeRef { id: string; name: string; yield_unit: string; output_product_id: string; scope: "fabrica" | "loja" | null; }
interface BrandRef { id: string; name: string; }
interface ConvRef { product_id: string; from_qty: number; to_qty: number; from_unit: string; to_unit: string; is_default: boolean; }

interface Item {
  id?: string;
  product_id: string;
  quantity: number;
  unit: string;
  notes: string;
  is_packaging: boolean;
  ingredient_state?: "cru" | "pronto" | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipeId: string;
  recipeName: string;
  yieldQuantity: number;
  yieldUnit: string;
  contextScope?: "fabrica" | "loja";
  brandIds?: string[];
  onSaved?: () => void;
}

const RecipeIngredientsDialog = ({ open, onOpenChange, recipeId, recipeName, yieldQuantity, yieldUnit, contextScope = "loja", brandIds = [], onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipeByOutput, setRecipeByOutput] = useState<Record<string, RecipeRef>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [prepConvByProduct, setPrepConvByProduct] = useState<Record<string, ConvRef>>({});
  const brandKey = brandIds.join("|");

  useEffect(() => {
    if (!open || !recipeId) return;
    (async () => {
      setLoading(true);
      const [{ data: prods }, { data: ings }, { data: recs }, { data: links }, { data: brs }, { data: convs }] = await Promise.all([
        supabase.from("inventory_products").select("id, name, unit, average_cost, category, factory_only, usage_roles").eq("is_active", true).order("name"),
        supabase.from("recipe_ingredients").select("*").eq("recipe_id", recipeId).order("sort_order"),
        supabase.from("recipes").select("id, name, yield_unit, output_product_id, scope").eq("is_active", true).not("output_product_id", "is", null).order("name"),
        supabase.from("recipe_brands").select("recipe_id, brand_id"),
        supabase.from("brands").select("id, name").eq("is_active", true),
        supabase.from("product_conversions").select("product_id, from_qty, to_qty, from_unit, to_unit, is_default").eq("conversion_type", "preparo"),
      ]);
      setProducts((prods as Product[]) ?? []);
      const factoryBrandIds = new Set(
        ((brs as BrandRef[]) ?? [])
          .filter((b) => /pr[eé]\s*preparo|f[aá]brica/i.test(b.name))
          .map((b) => b.id),
      );
      const allowedBrandIds = new Set(brandIds.filter((id) => !factoryBrandIds.has(id)));
      const recipeLinks = new Map<string, Set<string>>();
      (links ?? []).forEach((l: any) => {
        if (!recipeLinks.has(l.recipe_id)) recipeLinks.set(l.recipe_id, new Set());
        recipeLinks.get(l.recipe_id)!.add(l.brand_id);
      });
      const map: Record<string, RecipeRef> = {};
      ((recs as any[]) ?? []).forEach((r) => {
        const linkedBrands = recipeLinks.get(r.id) ?? new Set<string>();
        const linkedFactory = Array.from(linkedBrands).some((id) => factoryBrandIds.has(id));
        if (contextScope === "loja") {
          if (r.scope === "fabrica" || linkedFactory) return;
          if (allowedBrandIds.size > 0 && !Array.from(linkedBrands).some((id) => allowedBrandIds.has(id))) return;
        } else if (r.scope !== "fabrica" && !linkedFactory) {
          return;
        }
        if (r.id !== recipeId && r.output_product_id) {
          map[r.output_product_id] = r as RecipeRef;
        }
      });
      setRecipeByOutput(map);
      const prepMap: Record<string, ConvRef> = {};
      ((convs as ConvRef[]) ?? []).forEach((c) => {
        if (!prepMap[c.product_id] || c.is_default) prepMap[c.product_id] = c;
      });
      setPrepConvByProduct(prepMap);
      setItems(
        (ings ?? []).map((i: any) => ({
          id: i.id,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit: i.unit,
          notes: i.notes ?? "",
          is_packaging: !!i.is_packaging,
          ingredient_state: i.ingredient_state ?? null,
        })),
      );
      setLoading(false);
    })();
  }, [open, recipeId, contextScope, brandKey]);

  // Custo: quando ingrediente é "pronto", converte para cru antes de multiplicar pelo custo real.
  const rawEquivalent = (i: Item): number => {
    if (i.ingredient_state !== "pronto") return i.quantity;
    const c = prepConvByProduct[i.product_id];
    if (!c) return i.quantity;
    const preparedPerRaw = Number(c.to_qty) / Number(c.from_qty);
    return preparedPerRaw > 0 ? i.quantity / preparedPerRaw : i.quantity;
  };

  const totalCost = items.reduce((sum, i) => {
    const p = products.find((p) => p.id === i.product_id);
    return sum + rawEquivalent(i) * Number(p?.average_cost ?? 0);
  }, 0);
  const costPerUnit = yieldQuantity > 0 ? totalCost / yieldQuantity : 0;

  const add = (isPack: boolean) =>
    setItems((arr) => [...arr, { product_id: "", quantity: 1, unit: "UN", notes: "", is_packaging: isPack, ingredient_state: null }]);
  const update = (idx: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((i, k) => (k === idx ? { ...i, ...patch } : i)));
  const remove = (idx: number) => setItems((arr) => arr.filter((_, k) => k !== idx));

  const handleSave = async () => {
    if (items.some((i) => !i.product_id || i.quantity < 0)) {
      toast.error("Preencha os itens corretamente");
      return;
    }
    setSaving(true);
    try {
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
      if (items.length > 0) {
        const { error } = await supabase.from("recipe_ingredients").insert(
          items.map((i, k) => ({
            recipe_id: recipeId,
            product_id: i.product_id,
            quantity: i.quantity,
            unit: i.unit,
            notes: i.notes || null,
            sort_order: k,
            is_packaging: i.is_packaging,
            ingredient_state: i.ingredient_state ?? null,
          })),
        );
        if (error) throw error;
      }
      toast.success("Itens salvos");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ingredientes — {recipeName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {([
              { key: "ing", label: "Ingredientes", isPack: false, empty: "Nenhum ingrediente." },
              { key: "pack", label: "Embalagens / Descartáveis", isPack: true, empty: "Nenhuma embalagem." },
            ] as const).map((group) => {
              const rows = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.is_packaging === group.isPack);
              return (
                <div key={group.key} className="space-y-2 pt-2 border-t first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      <b>{group.label}</b>
                      {group.key === "ing" && (
                        <>
                          {" "}— Custo total: <b>{totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>
                          {yieldQuantity > 0 && (
                            <> • Por {yieldUnit}: <b>{costPerUnit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></>
                          )}
                        </>
                      )}
                    </p>
                    <Button size="sm" onClick={() => add(group.isPack)}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {rows.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{group.empty}</p>
                  )}
                  <div className="space-y-2">
                    {rows.map(({ it: i, idx }) => {
                      const p = products.find((p) => p.id === i.product_id);
                      const subtotal = rawEquivalent(i) * Number(p?.average_cost ?? 0);
                      const prep = prepConvByProduct[i.product_id];
                      return (
                        <div key={idx} className="border rounded-md p-2 space-y-2">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 sm:col-span-6">
                              <Select value={i.product_id} onValueChange={(v) => {
                                const prod = products.find((x) => x.id === v);
                                const ficha = recipeByOutput[v];
                                update(idx, { product_id: v, unit: ficha?.yield_unit ?? prod?.unit ?? i.unit });
                              }}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Produto ou ficha…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {!group.isPack && (
                                    <SelectGroup>
                                      <SelectLabel>Pré-preparos / Fichas</SelectLabel>
                                      {Object.values(recipeByOutput).length === 0 && (
                                        <div className="px-2 py-1 text-xs text-muted-foreground">Nenhuma ficha disponível</div>
                                      )}
                                      {Object.values(recipeByOutput)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((r) => (
                                          <SelectItem key={r.output_product_id} value={r.output_product_id}>
                                            🧪 {r.name}
                                          </SelectItem>
                                        ))}
                                    </SelectGroup>
                                  )}
                                  <SelectGroup>
                                    <SelectLabel>{group.isPack ? "Embalagens / Descartáveis" : "Insumos / Produtos"}</SelectLabel>
                                    {products
                                      .filter((p) => !recipeByOutput[p.id])
                                      .filter((p) => (contextScope === "fabrica" ? p.factory_only : !p.factory_only))
                                      .filter((p) => {
                                        // Ingrediente precisa ser insumo (produção ou montagem). Embalagens usam grupo próprio.
                                        const roles = p.usage_roles ?? [];
                                        if (roles.length === 0) return true; // legado sem classificação
                                        return roles.includes("insumo_producao") || roles.includes("insumo_montagem");
                                      })
                                      .filter((p) => {
                                        const isPack = /embalag/i.test(p.category ?? "");
                                        return group.isPack ? isPack : !isPack;
                                      })
                                      .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              {recipeByOutput[i.product_id] && (
                                <Badge variant="secondary" className="mt-1 text-[10px]">ficha técnica</Badge>
                              )}
                            </div>
                            <div className="col-span-5 sm:col-span-2">
                              <Input
                                type="number" step="0.001" min="0"
                                value={i.quantity}
                                onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                                placeholder="Qtd"
                              />
                            </div>
                            <div className="col-span-5 sm:col-span-2">
                              <Select value={i.unit} onValueChange={(v) => update(idx, { unit: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-2 flex items-center justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(idx)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                            <Input
                              placeholder="Observação (opcional)"
                              value={i.notes}
                              onChange={(e) => update(idx, { notes: e.target.value })}
                              className="h-7 text-xs flex-1"
                            />
                            {prep && !group.isPack && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px]">Estado:</span>
                                <Select
                                  value={i.ingredient_state ?? "cru"}
                                  onValueChange={(v) => update(idx, { ingredient_state: v as "cru" | "pronto" })}
                                >
                                  <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cru">Cru</SelectItem>
                                    <SelectItem value="pronto">Pronto</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <span className="ml-2 whitespace-nowrap">
                              {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                          {prep && i.ingredient_state === "pronto" && (
                            <p className="text-[10px] text-muted-foreground pl-1">
                              Baixa real: {rawEquivalent(i).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {prep.from_unit} de cru
                              (fator {(Number(prep.to_qty) / Number(prep.from_qty)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}× {prep.to_unit}/{prep.from_unit})
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar itens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeIngredientsDialog;
