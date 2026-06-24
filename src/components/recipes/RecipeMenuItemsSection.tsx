import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, X, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface Item {
  id: string;
  name: string;
  price: number;
}

interface Props {
  recipeId: string;
}

/**
 * Lista os itens do cardápio vinculados a esta ficha técnica
 * e permite vincular itens "soltos" (sem ficha) com 1 clique.
 */
export default function RecipeMenuItemsSection({ recipeId }: Props) {
  const [linked, setLinked] = useState<Item[]>([]);
  const [available, setAvailable] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [linkedRes, availRes] = await Promise.all([
      supabase
        .from("menu_items")
        .select("id, name, price")
        .eq("recipe_id", recipeId)
        .order("name"),
      supabase
        .from("menu_items")
        .select("id, name, price")
        .is("recipe_id", null)
        .eq("is_active", true)
        .order("name")
        .limit(500),
    ]);
    setLinked((linkedRes.data ?? []) as Item[]);
    setAvailable((availRes.data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    if (recipeId) load();
  }, [recipeId]);

  async function link(itemId: string) {
    setBusyId(itemId);
    const { error } = await supabase
      .from("menu_items")
      .update({ recipe_id: recipeId })
      .eq("id", itemId);
    setBusyId(null);
    if (error) {
      toast.error("Erro ao vincular: " + error.message);
      return;
    }
    toast.success("Item vinculado à ficha");
    setSearch("");
    load();
  }

  async function unlink(itemId: string) {
    setBusyId(itemId);
    const { error } = await supabase
      .from("menu_items")
      .update({ recipe_id: null })
      .eq("id", itemId);
    setBusyId(null);
    if (error) {
      toast.error("Erro ao desvincular: " + error.message);
      return;
    }
    toast.success("Item desvinculado");
    load();
  }

  const filteredAvail = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available.slice(0, 50);
    return available.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 50);
  }, [available, search]);

  return (
    <div className="space-y-2 pt-1 border-t">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-sm">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          Itens do cardápio que usam esta ficha
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7">
              <Link2 className="h-3.5 w-3.5" /> Vincular item
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-2" align="end">
            <Input
              autoFocus
              placeholder="Buscar item sem ficha…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 mb-2"
            />
            <div className="max-h-72 overflow-auto space-y-1">
              {filteredAvail.length === 0 && (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  Nenhum item disponível.
                </p>
              )}
              {filteredAvail.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => link(it.id)}
                  disabled={busyId === it.id}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between gap-2 disabled:opacity-60"
                >
                  <span className="truncate">{it.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    R$ {Number(it.price).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum item vinculado. Use <em>Vincular item</em> para conectar produtos do cardápio
          a esta ficha — as vendas passarão a baixar o estoque automaticamente.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((it) => (
            <Badge
              key={it.id}
              variant="secondary"
              className="gap-1.5 pr-1 py-1"
            >
              <span className="text-xs">{it.name}</span>
              <button
                type="button"
                onClick={() => unlink(it.id)}
                disabled={busyId === it.id}
                title="Desvincular"
                className="rounded hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
