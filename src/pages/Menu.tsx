import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, FolderPlus, Search, ScanText, Layers, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import AddCategoryDialog from "@/components/menu/AddCategoryDialog";
import MenuItemEditorDialog from "@/components/menu/MenuItemEditorDialog";
import ComplementsCatalogDialog from "@/components/menu/ComplementsCatalogDialog";
import { fmt } from "@/lib/saiposMenu";

interface Brand { id: string; name: string; sort_order: number; }
interface Store { id: string; name: string; }
interface Category { id: string; name: string; sort_order: number; }
interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  recipe_id: string | null;
  price: number;
  is_combo: boolean;
  is_active: boolean;
  sort_order: number;
}

const ACTIVE_BRAND_KEY = "menu.activeBrand";
const ACTIVE_STORE_KEY = "menu.activeStore";
const STORE_NAMES = ["ASA SUL", "ASA NORTE", "ÁGUAS CLARAS", "LAGO SUL"];
const ALLOWED_BRAND_NAMES = ["AQUELA PARME", "AQUELA PARMÊ", "BOX CAIPIRA", "AQUELE ESTROGONOFE"];
const isAllowedBrand = (name: string) =>
  ALLOWED_BRAND_NAMES.some((n) => n.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);

export default function Menu() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrand] = useState<string>("");

  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemBrands, setItemBrands] = useState<Record<string, string[]>>({});
  const [itemStores, setItemStores] = useState<Record<string, string[]>>({});

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catBrands, setCatBrands] = useState<string[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [complementsOpen, setComplementsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [bRes, sRes] = await Promise.all([
        supabase.from("brands").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("stores").select("id,name").eq("is_virtual", false).in("name", STORE_NAMES),
      ]);
      const blist = ((bRes.data ?? []) as Brand[]).filter((b) => isAllowedBrand(b.name));
      setBrands(blist);
      const storedB = localStorage.getItem(ACTIVE_BRAND_KEY);
      setActiveBrand(storedB && blist.some((b) => b.id === storedB) ? storedB : blist[0]?.id ?? "");

      const slist = ((sRes.data ?? []) as Store[]).sort(
        (a, b) => STORE_NAMES.indexOf(a.name) - STORE_NAMES.indexOf(b.name),
      );
      setStores(slist);
      const storedS = localStorage.getItem(ACTIVE_STORE_KEY);
      setActiveStore(storedS && slist.some((s) => s.id === storedS) ? storedS : slist[0]?.id ?? "");
    })();
  }, []);

  useEffect(() => {
    if (activeBrand) localStorage.setItem(ACTIVE_BRAND_KEY, activeBrand);
  }, [activeBrand]);

  useEffect(() => {
    if (activeStore) localStorage.setItem(ACTIVE_STORE_KEY, activeStore);
  }, [activeStore]);

  async function load() {
    if (!activeBrand || !activeStore) return;
    setLoading(true);
    const { data: catLinks } = await (supabase as any)
      .from("menu_category_brands").select("category_id").eq("brand_id", activeBrand);
    const catIds = ((catLinks ?? []) as any[]).map((r) => r.category_id);
    let cat: Category[] = [];
    if (catIds.length) {
      const { data } = await supabase.from("menu_categories")
        .select("id,name,sort_order").in("id", catIds).order("sort_order").order("name");
      cat = (data ?? []) as Category[];
    }
    setCategories(cat);

    const [mibsRes, misRes] = await Promise.all([
      supabase.from("menu_item_brands").select("menu_item_id, brand_id"),
      (supabase as any).from("menu_item_stores").select("menu_item_id, store_id").eq("is_available", true),
    ]);
    const brandMap: Record<string, string[]> = {};
    for (const r of (mibsRes.data ?? []) as any[]) {
      (brandMap[r.menu_item_id] ||= []).push(r.brand_id);
    }
    setItemBrands(brandMap);

    const storeMap: Record<string, string[]> = {};
    for (const r of (misRes.data ?? []) as any[]) {
      (storeMap[r.menu_item_id] ||= []).push(r.store_id);
    }
    setItemStores(storeMap);

    const itemIds = Object.keys(brandMap).filter((id) =>
      brandMap[id].includes(activeBrand) && (storeMap[id] ?? []).includes(activeStore),
    );
    if (itemIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const its = await supabase.from("menu_items").select("*").in("id", itemIds).order("sort_order").order("name");
    setItems((its.data ?? []) as MenuItem[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [activeBrand, activeStore]);

  function openNewCategory() {
    setCatName("");
    setCatBrands(activeBrand ? [activeBrand] : []);
    setCatOpen(true);
  }

  async function saveCategory() {
    const name = catName.trim();
    if (!name) return;
    if (catBrands.length === 0) {
      toast({ title: "Selecione ao menos uma marca", variant: "destructive" });
      return;
    }
    const { data: cat, error } = await supabase.from("menu_categories").insert({
      name, sort_order: categories.length,
    }).select("id").single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const links = catBrands.map((b) => ({ category_id: cat.id, brand_id: b }));
    const { error: e2 } = await (supabase as any).from("menu_category_brands").insert(links);
    if (e2) { toast({ title: "Erro nos vínculos", description: e2.message, variant: "destructive" }); return; }
    setCatOpen(false);
    toast({ title: "Categoria criada" });
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Excluir este item do cardápio?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item excluído" });
    load();
  }

  async function toggleActive(item: MenuItem) {
    const { error } = await supabase.from("menu_items").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function moveCategory(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= categories.length) return;
    const a = categories[idx];
    const b = categories[target];
    // Optimistic local swap
    const next = categories.slice();
    next[idx] = b; next[target] = a;
    setCategories(next.map((c, i) => ({ ...c, sort_order: i })));
    const [r1, r2] = await Promise.all([
      supabase.from("menu_categories").update({ sort_order: target }).eq("id", a.id),
      supabase.from("menu_categories").update({ sort_order: idx }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) {
      toast({ title: "Erro ao reordenar", description: r1.error?.message ?? r2.error?.message, variant: "destructive" });
      load();
    }
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filterCat !== "all" && i.category_id !== filterCat) return false;
      if (s && !i.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, search, filterCat]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of filtered) {
      const key = it.category_id ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [filtered]);

  const catName_ = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? "Sem categoria") : "Sem categoria";

  const activeBrandObj = brands.find((b) => b.id === activeBrand);
  const activeStoreObj = stores.find((s) => s.id === activeStore);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <ScanText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Cardápio
          </h1>
          <p className="text-muted-foreground">
            {activeStoreObj && activeBrandObj
              ? `${activeStoreObj.name} • ${activeBrandObj.name}`
              : "Selecione uma loja e marca"}
          </p>
        </div>
        {stores.length > 0 && (
          <div className="flex items-center gap-2 sm:justify-end">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Loja</Label>
            <Select value={activeStore} onValueChange={setActiveStore}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setComplementsOpen(true)} className="gap-2">
          <Layers className="h-4 w-4" /> Complementos
        </Button>
        <Button variant="outline" size="sm" onClick={openNewCategory} className="gap-2" disabled={!activeBrand}>
          <FolderPlus className="h-4 w-4" /> Categoria
        </Button>
        <Button size="sm" onClick={() => { setEditingId(null); setEditorOpen(true); }} className="gap-2" disabled={!activeBrand || !activeStore}>
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      <ComplementsCatalogDialog open={complementsOpen} onOpenChange={setComplementsOpen} />


      {brands.length > 0 && (
        <Tabs value={activeBrand} onValueChange={setActiveBrand} className="w-full">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto">
            {brands.map((b) => (
              <TabsTrigger key={b.id} value={b.id} className="text-xs sm:text-sm">
                {b.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum item nesta marca ainda. Crie uma categoria e depois adicione seu primeiro item.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(() => {
            const orderedKeys: string[] = categories
              .filter((c) => grouped.has(c.id))
              .map((c) => c.id);
            if (grouped.has("__none__")) orderedKeys.push("__none__");
            return orderedKeys.map((catId) => {
              const list = grouped.get(catId)!;
              const catIdx = catId === "__none__" ? -1 : categories.findIndex((c) => c.id === catId);
              const canUp = catIdx > 0;
              const canDown = catIdx >= 0 && catIdx < categories.length - 1;
              return (
                <Card key={catId}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-base">{catName_(catId === "__none__" ? null : catId)}</CardTitle>
                    {catIdx >= 0 && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!canUp}
                          onClick={() => moveCategory(catIdx, -1)}
                          title="Mover para cima"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={!canDown}
                          onClick={() => moveCategory(catIdx, 1)}
                          title="Mover para baixo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {list.map((it) => {
                      const otherBrands = (itemBrands[it.id] ?? []).filter((b) => b !== activeBrand);
                      return (
                        <div
                          key={it.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-md border bg-card"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{it.name}</span>
                              {it.is_combo && <Badge variant="secondary" className="text-[10px]">Combo</Badge>}
                              {!it.is_active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                              {otherBrands.length > 0 && (
                                <Badge variant="outline" className="text-[10px]">+{otherBrands.length} marca(s)</Badge>
                              )}
                            </div>
                            {it.description && (
                              <p className="text-xs text-muted-foreground truncate">{it.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="tabular-nums font-semibold text-sm w-24 text-right">{fmt(Number(it.price))}</span>
                            <Button size="sm" variant="ghost" onClick={() => toggleActive(it)}>
                              {it.is_active ? "Desativar" : "Ativar"}
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setEditingId(it.id); setEditorOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteItem(it.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>
      )}

      <AddCategoryDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        value={catName}
        onChange={setCatName}
        brands={brands}
        selectedBrands={catBrands}
        onSelectedBrandsChange={setCatBrands}
        onSave={saveCategory}
      />

      <MenuItemEditorDialog
        open={editorOpen}
        onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditingId(null); }}
        itemId={editingId}
        categories={categories}
        brands={brands}
        stores={stores}
        defaultBrandId={activeBrand}
        defaultStoreId={activeStore}
        onSaved={load}
      />
    </div>
  );
}
