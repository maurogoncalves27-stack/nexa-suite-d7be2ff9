import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Loader2, FolderPlus, Search } from "lucide-react";
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
import AddCategoryDialog from "@/components/menu/AddCategoryDialog";
import MenuItemEditorDialog from "@/components/menu/MenuItemEditorDialog";
import { fmt } from "@/lib/saiposMenu";

interface Brand { id: string; name: string; sort_order: number; }
interface Category { id: string; name: string; sort_order: number; brand_id: string | null; }
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

export default function Menu() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrand] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemBrands, setItemBrands] = useState<Record<string, string[]>>({}); // item_id -> brand_ids[]

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load brands once
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("brands").select("*").eq("is_active", true).order("sort_order");
      const list = (data ?? []) as Brand[];
      setBrands(list);
      const stored = localStorage.getItem(ACTIVE_BRAND_KEY);
      const initial = stored && list.some((b) => b.id === stored) ? stored : list[0]?.id ?? "";
      setActiveBrand(initial);
    })();
  }, []);

  useEffect(() => {
    if (activeBrand) localStorage.setItem(ACTIVE_BRAND_KEY, activeBrand);
  }, [activeBrand]);

  async function load() {
    if (!activeBrand) return;
    setLoading(true);
    const [cats, mibs] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("brand_id", activeBrand).order("sort_order").order("name"),
      supabase.from("menu_item_brands").select("menu_item_id, brand_id"),
    ]);
    const cat = (cats.data ?? []) as Category[];
    setCategories(cat);

    const map: Record<string, string[]> = {};
    for (const r of (mibs.data ?? []) as any[]) {
      (map[r.menu_item_id] ||= []).push(r.brand_id);
    }
    setItemBrands(map);

    const itemIds = Object.entries(map).filter(([, bs]) => bs.includes(activeBrand)).map(([id]) => id);
    if (itemIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const its = await supabase.from("menu_items").select("*").in("id", itemIds).order("sort_order").order("name");
    setItems((its.data ?? []) as MenuItem[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [activeBrand]);

  async function saveCategory() {
    const name = catName.trim();
    if (!name || !activeBrand) return;
    const { error } = await supabase.from("menu_categories").insert({
      name, sort_order: categories.length, brand_id: activeBrand,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setCatName(""); setCatOpen(false);
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

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">Cardápio</h1>
          <p className="text-sm text-muted-foreground">
            {activeBrandObj ? `Marca: ${activeBrandObj.name}` : "Selecione uma marca"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatOpen(true)} className="gap-2" disabled={!activeBrand}>
            <FolderPlus className="h-4 w-4" /> Categoria
          </Button>
          <Button size="sm" onClick={() => { setEditingId(null); setEditorOpen(true); }} className="gap-2" disabled={!activeBrand}>
            <Plus className="h-4 w-4" /> Novo item
          </Button>
        </div>
      </div>

      {/* Brand selector */}
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
          {Array.from(grouped.entries()).map(([catId, list]) => (
            <Card key={catId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{catName_(catId === "__none__" ? null : catId)}</CardTitle>
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
          ))}
        </div>
      )}

      <AddCategoryDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        value={catName}
        onChange={setCatName}
        onSave={saveCategory}
      />

      <MenuItemEditorDialog
        open={editorOpen}
        onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditingId(null); }}
        itemId={editingId}
        categories={categories}
        brands={brands}
        defaultBrandId={activeBrand}
        onSaved={load}
      />
    </div>
  );
}
