import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import RecipeFormCard from "@/components/recipes/RecipeFormCard";

interface RecipeRow {
  id: string;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_active: boolean;
  output_product_id: string | null;
  scope: "fabrica" | "loja" | null;
}

interface Brand { id: string; name: string; slug: string; }

const Recipes = () => {
  const { canReceive } = useInventoryPermission();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [recipeBrandMap, setRecipeBrandMap] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBrand, setActiveBrand] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "factory" | "ready">("all");
  const [creatingNew, setCreatingNew] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: recs }, { data: brs }, { data: links }] = await Promise.all([
      supabase
        .from("recipes")
        .select("id, name, yield_quantity, yield_unit, is_active, output_product_id, scope")
        .order("name"),
      supabase.from("brands").select("id, name, slug").eq("is_active", true).order("sort_order"),
      supabase.from("recipe_brands").select("recipe_id, brand_id"),
    ]);
    setRecipes((recs as unknown as RecipeRow[]) ?? []);
    const HIDDEN_BRAND_SLUGS = new Set(["totem", "salao", "salão", "site"]);
    const filteredBrands = ((brs as Brand[]) ?? []).filter(
      (b) => !HIDDEN_BRAND_SLUGS.has((b.slug ?? "").toLowerCase()) &&
             !HIDDEN_BRAND_SLUGS.has((b.name ?? "").toLowerCase()) &&
             !/pr[eé]\s*preparo|f[aá]brica/i.test(b.name)
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

  const factoryBrandId = useMemo(
    () => brands.find((b) => /pr[eé]\s*preparo|f[aá]brica/i.test(b.name))?.id ?? null,
    [brands]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter((r) => {
      const set = recipeBrandMap[r.id];
      const linkedFactory = !!(factoryBrandId && set?.has(factoryBrandId));
      // Fichas da fábrica têm página própria — não aparecem aqui
      if (r.scope === "fabrica" || linkedFactory) return false;

      if (activeBrand && (!set || !set.has(activeBrand))) return false;

      if (typeFilter === "factory") {
        if (r.output_product_id) return false;
      } else if (typeFilter === "ready") {
        if (!r.output_product_id) return false;
      }
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [recipes, search, activeBrand, recipeBrandMap, typeFilter, factoryBrandId]);



  const activeBrandId = activeBrand || null;

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
          {brands
            .filter((b) => !/^(totem|sal[aã]o|site)$/i.test(b.name.trim()))
            .map((b) => (
              <TabsTrigger key={b.id} value={b.id}>{b.name}</TabsTrigger>
            ))}
        </TabsList>

        <TabsContent value={activeBrand} className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={typeFilter === "all" ? "default" : "outline"}
                    onClick={() => setTypeFilter("all")}
                  >
                    Todas
                  </Button>
                  <Button
                    size="sm"
                    variant={typeFilter === "factory" ? "default" : "outline"}
                    onClick={() => setTypeFilter("factory")}
                  >
                    Pré-preparo
                  </Button>
                  <Button
                    size="sm"
                    variant={typeFilter === "ready" ? "default" : "outline"}
                    onClick={() => setTypeFilter("ready")}
                  >
                    Prato pronto
                  </Button>
                </div>
              </div>

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
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filtered.map((r) => (
                        <RecipeFormCard
                          key={r.id}
                          recipeId={r.id}
                          onSaved={load}
                          onDeleted={load}
                          onDuplicated={load}
                        />
                      ))}
                    </div>
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
