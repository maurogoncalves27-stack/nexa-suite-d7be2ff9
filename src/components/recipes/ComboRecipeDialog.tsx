import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RecipeOption {
  id: string;
  name: string;
  yield_unit: string;
  output_product_id: string;
}

interface BrandRef { id: string; name: string; }

interface ComboLine {
  recipe_id: string;
  quantity: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string | null;
  onCreated?: (recipeId: string) => void;
}

const ComboRecipeDialog = ({ open, onOpenChange, brandId, onCreated }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [options, setOptions] = useState<RecipeOption[]>([]);
  const [brandsList, setBrandsList] = useState<BrandRef[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<ComboLine[]>([
    { recipe_id: "", quantity: 1 },
    { recipe_id: "", quantity: 1 },
  ]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLines([
      { recipe_id: "", quantity: 1 },
      { recipe_id: "", quantity: 1 },
    ]);
    setSelectedBrands(new Set(brandId ? [brandId] : []));
    (async () => {
      setLoading(true);
      // Fichas com produto de saída, ativas, somente do universo das lojas.
      const [{ data: recs }, { data: links }, { data: brs }] = await Promise.all([
        supabase
          .from("recipes")
          .select("id, name, yield_unit, output_product_id, scope")
          .eq("is_active", true)
          .not("output_product_id", "is", null)
          .order("name"),
        supabase.from("recipe_brands").select("recipe_id, brand_id"),
        supabase.from("brands").select("id, name, slug").eq("is_active", true).order("sort_order"),
      ]);
      const factoryBrandIds = new Set(
        ((brs as any[]) ?? [])
          .filter((b) => /pr[eé]\s*preparo|f[aá]brica/i.test(b.name))
          .map((b) => b.id),
      );
      const HIDDEN = new Set(["totem", "salao", "salão", "site"]);
      const visibleBrands = ((brs as any[]) ?? []).filter(
        (b) =>
          !factoryBrandIds.has(b.id) &&
          !HIDDEN.has((b.slug ?? "").toLowerCase()) &&
          !HIDDEN.has((b.name ?? "").toLowerCase()),
      );
      setBrandsList(visibleBrands as BrandRef[]);

      const factoryRecipeIds = new Set(
        (links ?? [])
          .filter((l: any) => factoryBrandIds.has(l.brand_id))
          .map((l: any) => l.recipe_id),
      );
      let allowed = ((recs as any[]) ?? []).filter((r) => r.scope !== "fabrica" && !factoryRecipeIds.has(r.id));

      if (brandId) {
        const ids = new Set((links ?? []).filter((l: any) => l.brand_id === brandId).map((l: any) => l.recipe_id));
        allowed = allowed.filter((r) => ids.has(r.id));
      }
      setOptions(allowed as RecipeOption[]);
      setLoading(false);
    })();
  }, [open, brandId]);

  const toggleBrand = (id: string) =>
    setSelectedBrands((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });


  const addLine = () => setLines((arr) => [...arr, { recipe_id: "", quantity: 1 }]);
  const updateLine = (idx: number, patch: Partial<ComboLine>) =>
    setLines((arr) => arr.map((l, k) => (k === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines((arr) => arr.filter((_, k) => k !== idx));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do combo");
      return;
    }
    const valid = lines.filter((l) => l.recipe_id && l.quantity > 0);
    if (valid.length < 2) {
      toast.error("Selecione pelo menos 2 fichas para o combo");
      return;
    }
    setSaving(true);
    try {
      // 1. Cria a ficha "combo"
      const { data: newRec, error: e1 } = await supabase
        .from("recipes")
        .insert({
          name: name.trim(),
          yield_quantity: 1,
          yield_unit: "UN",
          scope: "loja",
          
          is_active: true,
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const newId = newRec!.id as string;

      // 2. Vincula às marcas selecionadas
      const brandRows = Array.from(selectedBrands).map((bId) => ({ recipe_id: newId, brand_id: bId }));
      if (brandRows.length > 0) {
        await supabase.from("recipe_brands").insert(brandRows);
      }

      // 3. Insere ingredientes (cada item = output_product_id da ficha selecionada)
      const ingRows = valid.map((l, k) => {
        const opt = options.find((o) => o.id === l.recipe_id)!;
        return {
          recipe_id: newId,
          product_id: opt.output_product_id,
          quantity: l.quantity,
          unit: opt.yield_unit || "UN",
          sort_order: k,
          is_packaging: false,
        };
      });
      const { error: e3 } = await supabase.from("recipe_ingredients").insert(ingRows);
      if (e3) throw e3;

      toast.success("Combo criado");
      onOpenChange(false);
      onCreated?.(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar combo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Novo combo
          </DialogTitle>
          <DialogDescription>
            Junte 2 ou mais fichas existentes em um combo. O custo é somado automaticamente a partir das fichas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do combo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Parmegiana + Churros"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fichas do combo</Label>
                <Button size="sm" variant="outline" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar ficha
                </Button>
              </div>

              {options.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma ficha disponível nesta marca.
                </p>
              )}

              <div className="space-y-2">
                {lines.map((l, idx) => (
                  <div key={idx} className="border rounded-md p-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 sm:col-span-8">
                        <Select
                          value={l.recipe_id}
                          onValueChange={(v) => updateLine(idx, { recipe_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a ficha…" />
                          </SelectTrigger>
                          <SelectContent>
                            {options
                              .filter(
                                (o) =>
                                  o.id === l.recipe_id ||
                                  !lines.some((x, k) => k !== idx && x.recipe_id === o.id),
                              )
                              .map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-9 sm:col-span-3">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={l.quantity}
                          onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                          placeholder="Qtd"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1 flex justify-end">
                        {lines.length > 2 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Criar combo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ComboRecipeDialog;
