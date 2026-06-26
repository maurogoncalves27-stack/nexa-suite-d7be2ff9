import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, ChefHat, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { useAuth } from "@/hooks/useAuth";
import RecipeFormCard from "@/components/recipes/RecipeFormCard";
import { cn } from "@/lib/utils";

interface RecipeRow {
  id: string;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_active: boolean;
  output_product_id: string;
  category: "individual" | "casal" | "familia" | null;
}

interface Brand { id: string; name: string; slug: string; }

type CategoryKey = "all" | "individual" | "casal" | "familia";
type ScopeTab = "pratos" | "preparos";

const CATEGORY_META: Record<Exclude<CategoryKey, "all">, { label: string; bg: string; text: string }> = {
  individual: { label: "Individual", bg: "#0ea5e9", text: "#ffffff" },
  casal: { label: "Casal", bg: "#a855f7", text: "#ffffff" },
  familia: { label: "Família", bg: "#f59e0b", text: "#1f2937" },
};

const Recipes = () => {
  const { canReceive } = useInventoryPermission();
  const { isAdmin, isManager } = useAuth();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [recipeBrandMap, setRecipeBrandMap] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBrand, setActiveBrand] = useState<string>("");
  const [scope, setScope] = useState<ScopeTab>("pratos");
  const [categoryChip, setCategoryChip] = useState<CategoryKey>("all");
  const [creatingNew, setCreatingNew] = useState(false);
  const [kitsOpen, setKitsOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    individual: true,
    casal: true,
    familia: true,
  });

  const load = async () => {
    setLoading(true);
    const [{ data: recs }, { data: brs }, { data: links }] = await Promise.all([
      supabase
        .from("recipes")
        .select("id, name, yield_quantity, yield_unit, is_active, output_product_id, category")
        .order("name"),
      supabase.from("brands").select("id, name, slug").eq("is_active", true).order("sort_order"),
      supabase.from("recipe_brands").select("recipe_id, brand_id"),
    ]);
    setRecipes((recs as unknown as RecipeRow[]) ?? []);
    const HIDDEN_BRAND_SLUGS = new Set(["totem", "salao", "salão", "site"]);
    const filteredBrands = ((brs as Brand[]) ?? []).filter(
      (b) => !HIDDEN_BRAND_SLUGS.has((b.slug ?? "").toLowerCase()) &&
             !HIDDEN_BRAND_SLUGS.has((b.name ?? "").toLowerCase())
    );
    setBrands(filteredBrands);
    const map: Record<string, Set<string>> = {};
    (links ?? []).forEach((l: any) => {
      if (!map[l.recipe_id]) map[l.recipe_id] = new Set();
      map[l.recipe_id].add(l.brand_id);
    });
    setRecipeBrandMap(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!activeBrand && brands.length > 0) setActiveBrand(brands[0].id);
  }, [brands, activeBrand]);

  // Aplica busca + marca + escopo (pratos prontos vs preparos)
  const visibleByScope = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter((r) => {
      if (activeBrand) {
        const set = recipeBrandMap[r.id];
        if (!set || !set.has(activeBrand)) return false;
      }
      if (scope === "pratos" && !r.category) return false;
      if (scope === "preparos" && r.category) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [recipes, search, activeBrand, recipeBrandMap, scope]);

  // Contagens por categoria (no escopo de pratos, ignorando o chip atual)
  const categoryCounts = useMemo(() => {
    const counts = { all: 0, individual: 0, casal: 0, familia: 0 } as Record<CategoryKey, number>;
    for (const r of recipes) {
      if (activeBrand) {
        const set = recipeBrandMap[r.id];
        if (!set || !set.has(activeBrand)) continue;
      }
      if (!r.category) continue;
      counts.all++;
      counts[r.category]++;
    }
    return counts;
  }, [recipes, recipeBrandMap, activeBrand]);

  const preparosCount = useMemo(() => {
    return recipes.filter((r) => {
      if (activeBrand) {
        const set = recipeBrandMap[r.id];
        if (!set || !set.has(activeBrand)) return false;
      }
      return !r.category;
    }).length;
  }, [recipes, recipeBrandMap, activeBrand]);

  // Aplica chip de categoria sobre o que já passou pelo escopo
  const filtered = useMemo(() => {
    if (scope !== "pratos" || categoryChip === "all") return visibleByScope;
    return visibleByScope.filter((r) => r.category === categoryChip);
  }, [visibleByScope, scope, categoryChip]);

  // Agrupa por nome-base do item (sem o sufixo Individual/Casal/Família)
  const itemGroups = useMemo(() => {
    if (scope !== "pratos") return null;
    const stripVariation = (n: string) =>
      n.replace(/\s*[-–|]?\s*(individual|casal|fam[ií]lia)\b.*$/i, "").trim();
    const map = new Map<string, { label: string; items: RecipeRow[] }>();
    for (const r of filtered) {
      const base = stripVariation(r.name) || r.name;
      const key = base.toLowerCase();
      if (!map.has(key)) map.set(key, { label: base, items: [] });
      map.get(key)!.items.push(r);
    }
    const order: Record<string, number> = { individual: 0, casal: 1, familia: 2 };
    for (const g of map.values()) {
      g.items.sort((a, b) => (order[a.category ?? ""] ?? 9) - (order[b.category ?? ""] ?? 9));
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered, scope]);

  const activeBrandId = activeBrand || null;

  const renderList = (items: RecipeRow[]) => (
    <div className="flex flex-col gap-2">
      {items.map((r) => (
        <RecipeFormCard
          key={r.id}
          recipeId={r.id}
          onSaved={load}
          onDeleted={load}
          onDuplicated={load}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Fichas técnicas
          </h1>
          <p className="text-muted-foreground">Receitas de produção que dão baixa nos ingredientes e geram o produto final.</p>
        </div>
        {canReceive && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreatingNew(true)} className="gap-2" disabled={creatingNew}>
              <Plus className="h-4 w-4" /> Nova ficha
            </Button>
          </div>
        )}
      </div>


      <Tabs value={activeBrand} onValueChange={setActiveBrand}>
        <TabsList className="flex flex-wrap h-auto">
          {brands.map((b) => (
            <TabsTrigger key={b.id} value={b.id}>{b.name}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeBrand} className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4 space-y-3">
              {/* Sub-tabs Pratos × Preparos */}
              <Tabs value={scope} onValueChange={(v) => { setScope(v as ScopeTab); setCategoryChip("all"); }}>
                <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                  <TabsTrigger value="pratos" className="gap-2">
                    Pratos prontos
                    <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">{categoryCounts.all}</span>
                  </TabsTrigger>
                  <TabsTrigger value="preparos" className="gap-2">
                    Preparos & insumos
                    <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">{preparosCount}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Chips de categoria (apenas no escopo de pratos) */}
              {scope === "pratos" && (
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "individual", "casal", "familia"] as CategoryKey[]).map((k) => {
                    const active = categoryChip === k;
                    const meta = k !== "all" ? CATEGORY_META[k] : null;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCategoryChip(k)}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1.5",
                          active
                            ? "border-transparent shadow-sm"
                            : "bg-background text-muted-foreground border-border hover:bg-muted",
                        )}
                        style={
                          active && meta
                            ? { backgroundColor: meta.bg, color: meta.text }
                            : active
                              ? { backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                              : undefined
                        }
                      >
                        {k === "all" ? "Todas" : meta!.label}
                        <span
                          className={cn(
                            "text-[10px] rounded-full px-1.5",
                            active ? "bg-background/25" : "bg-muted",
                          )}
                        >
                          {categoryCounts[k]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-3">
                  {creatingNew && canReceive && (
                    <RecipeFormCard
                      recipeId={null}
                      defaultOpen
                      initialBrandId={activeBrandId}
                      onCancelNew={() => setCreatingNew(false)}
                      onSaved={() => { setCreatingNew(false); load(); }}
                    />
                  )}

                  {filtered.length === 0 && !creatingNew ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma ficha técnica nesta aba.
                    </p>
                  ) : itemGroups ? (
                    // Agrupado por item — variações em sanfona
                    <div className="flex flex-col gap-2">
                      {itemGroups.map((g) => {
                        const open = openSections[g.label] ?? false;
                        return (
                          <Collapsible
                            key={g.label}
                            open={open}
                            onOpenChange={(v) => setOpenSections((s) => ({ ...s, [g.label]: v }))}
                            className="border rounded-md bg-card"
                          >
                            <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/40 transition rounded-md">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <ChefHat className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-semibold truncate">{g.label}</span>
                                <span className="text-[10px] text-muted-foreground">{g.items.length} variação(ões)</span>
                                <div className="flex items-center gap-1 ml-1">
                                  {g.items.map((it) =>
                                    it.category ? (
                                      <span
                                        key={it.id}
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                        style={{
                                          backgroundColor: CATEGORY_META[it.category].bg,
                                          color: CATEGORY_META[it.category].text,
                                        }}
                                      >
                                        {CATEGORY_META[it.category].label[0]}
                                      </span>
                                    ) : null,
                                  )}
                                </div>
                              </div>
                              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-2 pb-2 pt-1">
                              {renderList(g.items)}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  ) : (
                    renderList(filtered)
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Recipes;
