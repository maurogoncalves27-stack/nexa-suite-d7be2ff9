import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Link2, Layers } from "lucide-react";
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
interface Brand { id: string; name: string; }
interface Store { id: string; name: string; }

interface Component {
  id?: string;
  child_item_id: string;
  quantity: number;
}

interface CatalogOption {
  id: string;
  group_id: string;
  name: string;
  extra_price: number;
  linked_item_id: string | null;
  is_active: boolean;
  sort_order: number;
}
interface CatalogGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  categories: Category[];
  brands: Brand[];
  stores: Store[];
  defaultBrandId: string;
  defaultStoreId: string;
  onSaved: () => void;
}

export default function MenuItemEditorDialog({
  open, onOpenChange, itemId, categories, brands, stores, defaultBrandId, defaultStoreId, onSaved,
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
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [linkedGroupIds, setLinkedGroupIds] = useState<string[]>([]);

  const [recipes, setRecipes] = useState<RecipeOpt[]>([]);
  const [allItems, setAllItems] = useState<ItemOpt[]>([]);
  const [catalogGroups, setCatalogGroups] = useState<CatalogGroup[]>([]);
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);

  const [linkerOpen, setLinkerOpen] = useState(false);
  const [linkerSearch, setLinkerSearch] = useState("");

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({ name: "", min: 0, max: 1, required: false });

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [recRes, itRes, gRes, oRes] = await Promise.all([
        supabase.from("recipes").select("id,name").eq("is_active", true).order("name"),
        supabase.from("menu_items").select("id,name,price").order("name"),
        (supabase as any).from("complement_groups").select("*").order("name"),
        (supabase as any).from("complement_options").select("*").order("sort_order"),
      ]);
      setRecipes((recRes.data ?? []) as RecipeOpt[]);
      setAllItems(((itRes.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, price: Number(r.price) })));
      setCatalogGroups((gRes.data ?? []) as CatalogGroup[]);
      setCatalogOptions((oRes.data ?? []) as CatalogOption[]);

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
        const [compRes, brRes, linksRes, stRes] = await Promise.all([
          supabase.from("menu_item_components").select("*").eq("parent_item_id", itemId).order("sort_order"),
          supabase.from("menu_item_brands").select("brand_id").eq("menu_item_id", itemId),
          (supabase as any).from("menu_item_complement_links").select("group_id, sort_order")
            .eq("menu_item_id", itemId).order("sort_order"),
          (supabase as any).from("menu_item_stores").select("store_id").eq("menu_item_id", itemId).eq("is_available", true),
        ]);
        setComponents((compRes.data ?? []).map((c: any) => ({
          id: c.id, child_item_id: c.child_item_id, quantity: Number(c.quantity),
        })));
        setSelectedBrands(((brRes.data ?? []) as any[]).map((r) => r.brand_id));
        setLinkedGroupIds(((linksRes.data ?? []) as any[]).map((r) => r.group_id));
        setSelectedStores(((stRes.data ?? []) as any[]).map((r) => r.store_id));
      } else {
        setName(""); setDescription(""); setCategoryId("__none__"); setRecipeId("__none__");
        setPrice("0"); setIsCombo(false); setIsActive(true);
        setComponents([]); setLinkedGroupIds([]);
        setSelectedBrands(defaultBrandId ? [defaultBrandId] : []);
        // Por padrão, novos itens ficam disponíveis em todas as 4 lojas
        setSelectedStores(stores.map((s) => s.id));
      }
      setLoading(false);
    })();
  }, [open, itemId, defaultBrandId, defaultStoreId, stores]);

  const componentSum = useMemo(() => components.reduce((sum, c) => {
    const it = allItems.find((x) => x.id === c.child_item_id);
    return sum + (it ? it.price * c.quantity : 0);
  }, 0), [components, allItems]);

  function addComponent() { setComponents((p) => [...p, { child_item_id: "", quantity: 1 }]); }
  function applySumToPrice() { setPrice(componentSum.toFixed(2)); }

  const linkedGroups = useMemo(
    () => linkedGroupIds.map((id) => catalogGroups.find((g) => g.id === id)).filter(Boolean) as CatalogGroup[],
    [linkedGroupIds, catalogGroups],
  );

  async function createNewGroup() {
    const n = newGroupForm.name.trim();
    if (!n) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    const { data, error } = await (supabase as any).from("complement_groups").insert({
      name: n,
      min_choices: Number(newGroupForm.min) || 0,
      max_choices: Number(newGroupForm.max) || 1,
      is_required: newGroupForm.required,
    }).select("*").single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setCatalogGroups((p) => [...p, data as CatalogGroup]);
    setLinkedGroupIds((p) => [...p, data.id]);
    setNewGroupOpen(false);
    setNewGroupForm({ name: "", min: 0, max: 1, required: false });
    toast({ title: "Grupo criado e vinculado", description: "Edite as opções na página Complementos." });
  }

  async function save() {
    if (!name.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    if (selectedBrands.length === 0) { toast({ title: "Selecione ao menos uma marca", variant: "destructive" }); return; }
    if (selectedStores.length === 0) { toast({ title: "Selecione ao menos uma loja", variant: "destructive" }); return; }
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

      // Componentes do combo
      await supabase.from("menu_item_components").delete().eq("parent_item_id", id!);
      if (isCombo && components.length) {
        const rows = components
          .filter((c) => c.child_item_id && c.child_item_id !== id)
          .map((c, idx) => ({
            parent_item_id: id!, child_item_id: c.child_item_id, quantity: c.quantity, sort_order: idx,
          }));
        if (rows.length) {
          const { error } = await supabase.from("menu_item_components").insert(rows);
          if (error) throw error;
        }
      }

      // Links de grupos (novo modelo)
      await (supabase as any).from("menu_item_complement_links").delete().eq("menu_item_id", id!);
      if (linkedGroupIds.length) {
        const linkRows = linkedGroupIds.map((gid, idx) => ({
          menu_item_id: id!, group_id: gid, sort_order: idx,
        }));
        const { error } = await (supabase as any).from("menu_item_complement_links").insert(linkRows);
        if (error) throw error;
      }

      // Mirror para tabelas legadas (consumido por PDV/Totem/Garçom até Fase 4)
      await supabase.from("menu_item_complement_groups").delete().eq("menu_item_id", id!);
      for (let i = 0; i < linkedGroupIds.length; i++) {
        const gid = linkedGroupIds[i];
        const g = catalogGroups.find((x) => x.id === gid);
        if (!g) continue;
        const { data: gIns, error: gErr } = await supabase
          .from("menu_item_complement_groups")
          .insert({
            menu_item_id: id!,
            name: g.name,
            is_required: g.is_required,
            min_choices: g.min_choices,
            max_choices: g.max_choices,
            sort_order: i,
          })
          .select("id").single();
        if (gErr) throw gErr;
        const opts = catalogOptions.filter((o) => o.group_id === gid && o.is_active);
        if (opts.length) {
          const rows = opts.map((o, oi) => ({
            group_id: gIns.id,
            name: o.name,
            extra_price: Number(o.extra_price) || 0,
            linked_item_id: o.linked_item_id || null,
            sort_order: oi,
          }));
          const { error } = await supabase.from("menu_item_complement_options").insert(rows);
          if (error) throw error;
        }
      }

      // Marcas
      await supabase.from("menu_item_brands").delete().eq("menu_item_id", id!);
      if (selectedBrands.length) {
        const brandRows = selectedBrands.map((b) => ({ menu_item_id: id!, brand_id: b }));
        const { error } = await supabase.from("menu_item_brands").insert(brandRows);
        if (error) throw error;
      }

      // Lojas (disponibilidade física)
      await (supabase as any).from("menu_item_stores").delete().eq("menu_item_id", id!);
      if (selectedStores.length) {
        const storeRows = selectedStores.map((s) => ({ menu_item_id: id!, store_id: s, is_available: true }));
        const { error } = await (supabase as any).from("menu_item_stores").insert(storeRows);
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

  const availableGroups = useMemo(() => {
    const s = linkerSearch.trim().toLowerCase();
    return catalogGroups
      .filter((g) => !linkedGroupIds.includes(g.id))
      .filter((g) => !s || g.name.toLowerCase().includes(s));
  }, [catalogGroups, linkedGroupIds, linkerSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemId ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>
            Defina nome, marcas, preço, combo e grupos de complementos (catálogo reutilizável).
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
                        type="button" key={b.id}
                        onClick={() => setSelectedBrands((p) =>
                          checked ? p.filter((x) => x !== b.id) : [...p, b.id])}
                        className={`px-3 py-1.5 rounded-md border text-xs sm:text-sm transition-colors ${
                          checked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
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
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows={2} />
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
                      type="number" step="0.001" min="0.001" className="sm:w-24"
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

            {/* Grupos de complementos vinculados do catálogo */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Grupos de complementos
                </h4>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLinkerOpen(true)} className="gap-1">
                    <Link2 className="h-3 w-3" /> Vincular existente
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setNewGroupOpen(true)} className="gap-1">
                    <Plus className="h-3 w-3" /> Criar novo
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Grupos vêm do catálogo. Editar um grupo afeta TODOS os pratos que usam.
                Gerencie opções em <span className="font-medium">Cardápio → Complementos</span>.
              </p>
              {linkedGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum grupo vinculado.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedGroups.map((g, idx) => {
                    const optCount = catalogOptions.filter((o) => o.group_id === g.id).length;
                    return (
                      <div key={g.id} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm truncate">{g.name}</span>
                            {g.is_required && <Badge variant="secondary" className="text-[10px]">Obrigatório</Badge>}
                            <Badge variant="outline" className="text-[10px]">{g.min_choices}–{g.max_choices}</Badge>
                            <Badge variant="outline" className="text-[10px]">{optCount} opções</Badge>
                            {!g.is_active && <Badge variant="outline" className="text-[10px]">Pausado</Badge>}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setLinkedGroupIds((p) => p.filter((x) => x !== g.id))}
                          title="Desvincular (não apaga do catálogo)">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>

        {/* Linker sub-dialog */}
        <Dialog open={linkerOpen} onOpenChange={setLinkerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Vincular grupo do catálogo</DialogTitle></DialogHeader>
            <Input
              placeholder="Buscar grupo..."
              value={linkerSearch}
              onChange={(e) => setLinkerSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-1 mt-2">
              {availableGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum grupo disponível. Crie um novo.
                </p>
              ) : availableGroups.map((g) => {
                const optCount = catalogOptions.filter((o) => o.group_id === g.id).length;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setLinkedGroupIds((p) => [...p, g.id]);
                      setLinkerOpen(false);
                      setLinkerSearch("");
                    }}
                    className="w-full text-left p-2 rounded-md border bg-card hover:bg-muted transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{g.name}</span>
                      <Badge variant="outline" className="text-[10px]">{optCount} opções</Badge>
                      {!g.is_active && <Badge variant="outline" className="text-[10px]">Pausado</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* New group sub-dialog */}
        <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Novo grupo de complementos</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={newGroupForm.name}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                  placeholder="Ex: Acompanhamentos"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Mínimo</Label>
                  <Input type="number" min="0" value={newGroupForm.min}
                    onChange={(e) => setNewGroupForm({ ...newGroupForm, min: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Máximo</Label>
                  <Input type="number" min="1" value={newGroupForm.max}
                    onChange={(e) => setNewGroupForm({ ...newGroupForm, max: Number(e.target.value) || 1 })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={newGroupForm.required}
                  onCheckedChange={(v) => setNewGroupForm({ ...newGroupForm, required: v })} />
                Obrigatório escolher
              </label>
              <p className="text-xs text-muted-foreground">
                Adicione as opções depois em Cardápio → Complementos.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Cancelar</Button>
              <Button onClick={createNewGroup}>Criar e vincular</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
