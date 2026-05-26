import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT", "PORCAO"];

interface Product { id: string; name: string; unit: string; average_cost: number; }
interface KitOption { id: string; name: string; brand_name: string; kit_type: string; items: { product_id: string; quantity: number }[]; }

interface Item {
  id?: string;
  product_id: string;
  quantity: number;
  unit: string;
  notes: string;
  is_packaging: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recipeId: string;
  recipeName: string;
  yieldQuantity: number;
  yieldUnit: string;
  onSaved?: () => void;
}

const RecipeIngredientsDialog = ({ open, onOpenChange, recipeId, recipeName, yieldQuantity, yieldUnit, onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [kits, setKits] = useState<KitOption[]>([]);
  const [kitToApply, setKitToApply] = useState<string>("");

  useEffect(() => {
    if (!open || !recipeId) return;
    (async () => {
      setLoading(true);
      const [{ data: prods }, { data: ings }, { data: ks }, { data: kis }] = await Promise.all([
        supabase.from("inventory_products").select("id, name, unit, average_cost").eq("is_active", true).order("name"),
        supabase.from("recipe_ingredients").select("*").eq("recipe_id", recipeId).order("sort_order"),
        supabase.from("packaging_kits").select("id, name, kit_type, brand_id, is_active, brands(name)").eq("is_active", true).order("name"),
        supabase.from("packaging_kit_items").select("kit_id, product_id, quantity"),
      ]);
      setProducts((prods as Product[]) ?? []);
      setItems(
        (ings ?? []).map((i: any) => ({
          id: i.id,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit: i.unit,
          notes: i.notes ?? "",
          is_packaging: !!i.is_packaging,
        })),
      );
      const itemsByKit: Record<string, { product_id: string; quantity: number }[]> = {};
      (kis ?? []).forEach((it: any) => {
        (itemsByKit[it.kit_id] ||= []).push({ product_id: it.product_id, quantity: Number(it.quantity) });
      });
      setKits(((ks as any[]) ?? []).map((k) => ({
        id: k.id, name: k.name, kit_type: k.kit_type,
        brand_name: k.brands?.name ?? "—",
        items: itemsByKit[k.id] ?? [],
      })));
      setLoading(false);
    })();
  }, [open, recipeId]);

  const applyKit = () => {
    const kit = kits.find((k) => k.id === kitToApply);
    if (!kit) return;
    setItems((arr) => {
      const next = [...arr];
      kit.items.forEach((ki) => {
        const prod = products.find((p) => p.id === ki.product_id);
        const existingIdx = next.findIndex((x) => x.product_id === ki.product_id && x.is_packaging);
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], quantity: Number(next[existingIdx].quantity) + ki.quantity };
        } else {
          next.push({ product_id: ki.product_id, quantity: ki.quantity, unit: prod?.unit ?? "UN", notes: "", is_packaging: true });
        }
      });
      return next;
    });
    toast.success(`Kit "${kit.name}" aplicado`);
    setKitToApply("");
  };

  const totalCost = items.reduce((sum, i) => {
    const p = products.find((p) => p.id === i.product_id);
    return sum + i.quantity * Number(p?.average_cost ?? 0);
  }, 0);
  const costPerUnit = yieldQuantity > 0 ? totalCost / yieldQuantity : 0;

  const add = (isPack: boolean) =>
    setItems((arr) => [...arr, { product_id: "", quantity: 1, unit: "UN", notes: "", is_packaging: isPack }]);
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
                  {group.isPack && kits.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2 bg-muted/40 rounded-md p-2">
                      <Select value={kitToApply} onValueChange={setKitToApply}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aplicar kit pronto…" /></SelectTrigger>
                        <SelectContent>
                          {kits.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.brand_name} • {k.name} ({k.kit_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="secondary" disabled={!kitToApply} onClick={applyKit}>
                        Aplicar kit
                      </Button>
                    </div>
                  )}
                  {rows.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{group.empty}</p>
                  )}
                  <div className="space-y-2">
                    {rows.map(({ it: i, idx }) => {
                      const p = products.find((p) => p.id === i.product_id);
                      const subtotal = i.quantity * Number(p?.average_cost ?? 0);
                      return (
                        <div key={idx} className="border rounded-md p-2 space-y-2">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 sm:col-span-6">
                              <Select value={i.product_id} onValueChange={(v) => {
                                const prod = products.find((x) => x.id === v);
                                update(idx, { product_id: v, unit: prod?.unit ?? i.unit });
                              }}>
                                <SelectTrigger><SelectValue placeholder="Produto…" /></SelectTrigger>
                                <SelectContent>
                                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
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
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <Input
                              placeholder="Observação (opcional)"
                              value={i.notes}
                              onChange={(e) => update(idx, { notes: e.target.value })}
                              className="h-7 text-xs"
                            />
                            <span className="ml-2 whitespace-nowrap">
                              {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
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
