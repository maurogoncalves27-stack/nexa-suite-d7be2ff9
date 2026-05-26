import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmt } from "@/lib/saiposMenu";

interface Category { id: string; name: string; }
interface RecipeOpt { id: string; name: string; }
interface ItemOpt { id: string; name: string; price: number; }

interface Component {
  id?: string;
  child_item_id: string;
  quantity: number;
  // ui only
  _name?: string;
  _price?: number;
}

interface ComplementOption {
  id?: string;
  name: string;
  extra_price: number;
  linked_item_id: string | null;
}
interface ComplementGroup {
  id?: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  options: ComplementOption[];
  _open?: boolean;
}

interface Brand { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  categories: Category[];
  brands: Brand[];
  defaultBrandId: string;
  onSaved: () => void;
}

export default function MenuItemEditorDialog({
  open, onOpenChange, itemId, categories, brands, defaultBrandId, onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [recipeId, setRecipeId] = useState<string>("__none__");
  const [price, setPrice] = useState<string>("0");
  const [isCombo, setIsCombo] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [components, setComponents] = useState<Component[]>([]);
  const [groups, setGroups] = useState<ComplementGroup[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const [recipes, setRecipes] = useState<RecipeOpt[]>([]);
  const [allItems, setAllItems] = useState<ItemOpt[]>([]);

  // Reset / load
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [recRes, itRes] = await Promise.all([
        supabase.from("recipes").select("id,name").eq("is_active", true).order("name"),
        supabase.from("menu_items").select("id,name,price").order("name"),
      ]);
      setRecipes((recRes.data ?? []) as RecipeOpt[]);
      setAllItems(((itRes.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, price: Number(r.price) })));

      if (itemId) {
        const { data: it } = await supabase.from("menu_items").select("*").eq("id", itemId).maybeSingle();
        if (it) {
          setName(it.name);
          setDescription(it.description ?? "");
          setCategoryId(it.category_id ?? "__none__");
          setRecipeId(it.recipe_id ?? "__none__");
          setPrice(String(it.price));
          setIsCombo(!!it.is_combo);
          setIsActive(!!it.is_active);
        }
        const [compRes, grpRes, brRes] = await Promise.all([
          supabase.from("menu_item_components").select("*").eq("parent_item_id", itemId).order("sort_order"),
          supabase.from("menu_item_complement_groups").select("*").eq("menu_item_id", itemId).order("sort_order"),
          supabase.from("menu_item_brands").select("brand_id").eq("menu_item_id", itemId),
        ]);
        const comps: Component[] = (compRes.data ?? []).map((c: any) => ({
          id: c.id, child_item_id: c.child_item_id, quantity: Number(c.quantity),
        }));
        setComponents(comps);
        setSelectedBrands(((brRes.data ?? []) as any[]).map((r) => r.brand_id));

        const grpIds = (grpRes.data ?? []).map((g: any) => g.id);
        let opts: any[] = [];
        if (grpIds.length) {
          const { data } = await supabase.from("menu_item_complement_options")
            .select("*").in("group_id", grpIds).order("sort_order");
          opts = data ?? [];
        }
        setGroups((grpRes.data ?? []).map((g: any) => ({
          id: g.id,
          name: g.name,
          is_required: g.is_required,
          min_choices: g.min_choices,
          max_choices: g.max_choices,
          _open: false,
          options: opts.filter((o) => o.group_id === g.id).map((o) => ({
            id: o.id, name: o.name, extra_price: Number(o.extra_price), linked_item_id: o.linked_item_id,
          })),
        })));
      } else {
        setName(""); setDescription(""); setCategoryId("__none__"); setRecipeId("__none__");
        setPrice("0"); setIsCombo(false); setIsActive(true);
        setComponents([]); setGroups([]);
        setSelectedBrands(defaultBrandId ? [defaultBrandId] : []);
      }
      setLoading(false);
    })();
  }, [open, itemId, defaultBrandId]);

  const componentSum = useMemo(() => {
    return components.reduce((sum, c) => {
      const it = allItems.find((x) => x.id === c.child_item_id);
      return sum + (it ? it.price * c.quantity : 0);
    }, 0);
  }, [components, allItems]);

  function addComponent() {
    setComponents((p) => [...p, { child_item_id: "", quantity: 1 }]);
  }
  function applySumToPrice() { setPrice(componentSum.toFixed(2)); }

  function addGroup() {
    setGroups((p) => [...p, {
      name: "Novo grupo", is_required: false, min_choices: 0, max_choices: 1, options: [], _open: true,
    }]);
  }
  function addOption(gi: number) {
    setGroups((p) => p.map((g, i) => i === gi
      ? { ...g, options: [...g.options, { name: "", extra_price: 0, linked_item_id: null }] }
      : g));
  }

  async function save() {
    if (!name.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    if (selectedBrands.length === 0) { toast({ title: "Selecione ao menos uma marca", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category_id: categoryId === "__none__" ? null : categoryId,
        recipe_id: recipeId === "__none__" ? null : recipeId,
        price: Number(price) || 0,
        is_combo: isCombo,
        is_active: isActive,
      };

      let id = itemId;
      if (id) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("menu_items").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      // Components: replace all
      await supabase.from("menu_item_components").delete().eq("parent_item_id", id!);
      if (isCombo && components.length) {
        const rows = components
          .filter((c) => c.child_item_id && c.child_item_id !== id)
          .map((c, idx) => ({
            parent_item_id: id!,
            child_item_id: c.child_item_id,
            quantity: c.quantity,
            sort_order: idx,
          }));
        if (rows.length) {
          const { error } = await supabase.from("menu_item_components").insert(rows);
          if (error) throw error;
        }
      }

      // Groups: replace all (cascade deletes options)
      await supabase.from("menu_item_complement_groups").delete().eq("menu_item_id", id!);
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const { data: gIns, error: gErr } = await supabase
          .from("menu_item_complement_groups")
          .insert({
            menu_item_id: id!,
            name: g.name.trim() || "Grupo",
            is_required: g.is_required,
            min_choices: g.min_choices,
            max_choices: g.max_choices,
            sort_order: gi,
          })
          .select("id").single();
        if (gErr) throw gErr;
        if (g.options.length) {
          const optRows = g.options
            .filter((o) => o.name.trim())
            .map((o, oi) => ({
              group_id: gIns.id,
              name: o.name.trim(),
              extra_price: Number(o.extra_price) || 0,
              linked_item_id: o.linked_item_id || null,
              sort_order: oi,
            }));
          if (optRows.length) {
            const { error } = await supabase.from("menu_item_complement_options").insert(optRows);
            if (error) throw error;
          }
        }
      }

      // Brands: replace all
      await supabase.from("menu_item_brands").delete().eq("menu_item_id", id!);
      if (selectedBrands.length) {
        const brandRows = selectedBrands.map((b) => ({ menu_item_id: id!, brand_id: b }));
        const { error } = await supabase.from("menu_item_brands").insert(brandRows);
        if (error) throw error;
      }

      toast({ title: itemId ? "Item atualizado" : "Item criado" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemId ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>
            Defina nome, categoria, preço, componentes do combo e grupos de complementos.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Marcas (em quais cardápios aparece)</Label>
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => {
                    const checked = selectedBrands.includes(b.id);
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => setSelectedBrands((p) =>
                          checked ? p.filter((x) => x !== b.id) : [...p, b.id]
                        )}
                        className={`px-3 py-1.5 rounded-md border text-xs sm:text-sm transition-colors ${
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: X-Burger" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Opcional"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ficha técnica (opcional)</Label>
                <Select value={recipeId} onValueChange={setRecipeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem ficha</SelectItem>
                    {recipes.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Preço (R$)</Label>
                <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-4 pt-6">
                <div className="flex items-center gap-2">
                  <Switch checked={isCombo} onCheckedChange={setIsCombo} id="is-combo" />
                  <Label htmlFor="is-combo">É combo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
                  <Label htmlFor="is-active">Ativo</Label>
                </div>
              </div>
            </div>

            {/* Combo components */}
            {isCombo && (
              <div className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Componentes do combo</h4>
                  <Button size="sm" variant="outline" onClick={addComponent} className="gap-1">
                    <Plus className="h-3 w-3" /> Item
                  </Button>
                </div>
                {components.length === 0 && (
                  <p className="text-xs text-muted-foreground">Adicione os itens que fazem parte deste combo.</p>
                )}
                {components.map((c, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <Select
                      value={c.child_item_id}
                      onValueChange={(v) => setComponents((p) => p.map((x, idx) => idx === i ? { ...x, child_item_id: v } : x))}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um item" /></SelectTrigger>
                      <SelectContent>
                        {allItems.filter((x) => x.id !== itemId).map((x) => (
                          <SelectItem key={x.id} value={x.id}>{x.name} — {fmt(x.price)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="0.001" min="0.001"
                      className="sm:w-24"
                      value={c.quantity}
                      onChange={(e) => setComponents((p) => p.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))}
                    />
                    <Button size="icon" variant="ghost" onClick={() => setComponents((p) => p.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {components.length > 0 && (
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Soma dos componentes:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{fmt(componentSum)}</span>
                      <Button size="sm" variant="ghost" onClick={applySumToPrice}>Usar como preço</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Complement groups */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Grupos de complementos</h4>
                <Button size="sm" variant="outline" onClick={addGroup} className="gap-1">
                  <Plus className="h-3 w-3" /> Grupo
                </Button>
              </div>
              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground">Ex: "Escolha 1 bebida", "Adicionais (até 3)".</p>
              )}
              {groups.map((g, gi) => (
                <div key={gi} className="border rounded-md p-2 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => setGroups((p) => p.map((x, i) => i === gi ? { ...x, _open: !x._open } : x))}
                    >
                      {g._open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Input
                      value={g.name}
                      onChange={(e) => setGroups((p) => p.map((x, i) => i === gi ? { ...x, name: e.target.value } : x))}
                      className="flex-1"
                    />
                    <Badge variant="outline" className="text-[10px] hidden sm:inline">{g.options.length} opções</Badge>
                    <Button size="icon" variant="ghost" onClick={() => setGroups((p) => p.filter((_, i) => i !== gi))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {g._open && (
                    <div className="space-y-2 pl-2">
                      <div className="flex flex-wrap gap-3 items-center text-xs">
                        <label className="flex items-center gap-1">
                          <Switch
                            checked={g.is_required}
                            onCheckedChange={(v) => setGroups((p) => p.map((x, i) => i === gi ? { ...x, is_required: v } : x))}
                          />
                          Obrigatório
                        </label>
                        <label className="flex items-center gap-1">Min
                          <Input
                            type="number" min="0" className="h-7 w-16"
                            value={g.min_choices}
                            onChange={(e) => setGroups((p) => p.map((x, i) => i === gi ? { ...x, min_choices: Number(e.target.value) || 0 } : x))}
                          />
                        </label>
                        <label className="flex items-center gap-1">Max
                          <Input
                            type="number" min="1" className="h-7 w-16"
                            value={g.max_choices}
                            onChange={(e) => setGroups((p) => p.map((x, i) => i === gi ? { ...x, max_choices: Number(e.target.value) || 1 } : x))}
                          />
                        </label>
                        <Button size="sm" variant="outline" className="gap-1 ml-auto" onClick={() => addOption(gi)}>
                          <Plus className="h-3 w-3" /> Opção
                        </Button>
                      </div>
                      {g.options.map((o, oi) => (
                        <div key={oi} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <Input
                            placeholder="Nome da opção"
                            value={o.name}
                            onChange={(e) => setGroups((p) => p.map((x, i) => i === gi
                              ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, name: e.target.value } : y) } : x))}
                            className="flex-1"
                          />
                          <Select
                            value={o.linked_item_id ?? "__none__"}
                            onValueChange={(v) => setGroups((p) => p.map((x, i) => i === gi
                              ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, linked_item_id: v === "__none__" ? null : v } : y) } : x))}
                          >
                            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Vincular a item" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sem vínculo</SelectItem>
                              {allItems.filter((x) => x.id !== itemId).map((x) => (
                                <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number" step="0.01"
                            placeholder="+R$"
                            className="sm:w-24"
                            value={o.extra_price}
                            onChange={(e) => setGroups((p) => p.map((x, i) => i === gi
                              ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, extra_price: Number(e.target.value) || 0 } : y) } : x))}
                          />
                          <Button size="icon" variant="ghost" onClick={() => setGroups((p) => p.map((x, i) => i === gi
                            ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
