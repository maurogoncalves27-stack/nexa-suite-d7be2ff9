import { useEffect, useState } from "react";
import { Loader2, Store as StoreIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sortStores } from "@/lib/storeSort";
import { toast } from "sonner";

interface Store {
  id: string;
  name: string;
  store_type: string | null;
}

interface ProductStoresDialogProps {
  productId: string | null;
  productName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ProductStoresDialog({
  productId,
  productName,
  open,
  onOpenChange,
  onSaved,
}: ProductStoresDialogProps) {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: sts }, { data: links }] = await Promise.all([
        supabase
          .from("stores")
          .select("id, name, store_type")
          .eq("is_virtual", false)
          .order("name"),
        supabase
          .from("product_store_links")
          .select("store_id")
          .eq("product_id", productId),
      ]);
      if (!active) return;
      setStores(sortStores((sts as Store[]) ?? []));
      const linked = new Set<string>((links ?? []).map((l: { store_id: string }) => l.store_id));
      setSelected(linked);
      setOriginal(linked);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, productId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (val: boolean) => {
    setSelected(val ? new Set(stores.map((s) => s.id)) : new Set());
  };

  const save = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      const toAdd = [...selected].filter((id) => !original.has(id));
      const toRemove = [...original].filter((id) => !selected.has(id));

      if (toRemove.length) {
        const { error } = await supabase
          .from("product_store_links")
          .delete()
          .eq("product_id", productId)
          .in("store_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("product_store_links").insert(
          toAdd.map((store_id) => ({
            product_id: productId,
            store_id,
            created_by: user?.id ?? null,
          })),
        );
        if (error) throw error;
      }

      toast.success(
        selected.size === 0
          ? "Vínculo removido — produto disponível em todas as lojas"
          : `Produto vinculado a ${selected.size} loja(s)`,
      );
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    selected.size !== original.size ||
    [...selected].some((id) => !original.has(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StoreIcon className="h-5 w-5 text-primary" />
            Lojas vinculadas
          </DialogTitle>
          <DialogDescription>
            {productName ? (
              <span className="font-medium text-foreground">{productName}</span>
            ) : null}
            <span className="block mt-1 text-xs">
              Marque as lojas onde este produto deve aparecer (catálogo, contagem, recebimento).
              Se nenhuma for selecionada, o produto aparece em <b>todas</b>.
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <Badge variant="outline" className="text-xs">
                {selected.size === 0
                  ? "Todas as lojas"
                  : `${selected.size} de ${stores.length}`}
              </Badge>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setAll(true)}
                >
                  Marcar tudo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setAll(false)}
                >
                  Limpar
                </Button>
              </div>
            </div>

            <div className="space-y-1 rounded-md border divide-y">
              {stores.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.name}</span>
                        {s.store_type === "fabrica" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5 h-4 border-primary text-primary"
                          >
                            Fábrica
                          </Badge>
                        )}
                        {s.store_type === "estoque_central" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5 h-4"
                          >
                            Estoque central
                          </Badge>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
              {stores.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma loja física cadastrada.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !dirty || loading} className="w-full sm:w-auto">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar vínculos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
