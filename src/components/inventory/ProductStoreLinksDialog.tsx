import { useEffect, useState } from "react";
import { Loader2, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { isFactoryName } from "@/lib/factory";
import { toast } from "sonner";
import { sortStores } from "@/lib/storeSort";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName: string;
}

interface StoreOption {
  id: string;
  name: string;
}

const ProductStoreLinksDialog = ({ open, onOpenChange, productId, productName }: Props) => {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: st }, { data: links }] = await Promise.all([
        supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
        supabase.from("product_store_links").select("store_id").eq("product_id", productId),
      ]);
      // Excluir lojas do tipo CD/central (são origem, não destino)
      const filtered = (st ?? []).filter((s) => !isFactoryName(s.name));
      setStores(sortStores(filtered));
      setSelected(new Set((links ?? []).map((l: { store_id: string }) => l.store_id)));
      setLoading(false);
    };
    load();
  }, [open, productId]);

  const toggle = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const save = async () => {
    if (!productId) return;
    setSaving(true);
    // Diff: deletar removidos e inserir novos
    const { data: current } = await supabase
      .from("product_store_links")
      .select("store_id")
      .eq("product_id", productId);
    const currentSet = new Set((current ?? []).map((c: { store_id: string }) => c.store_id));
    const toDelete = [...currentSet].filter((id) => !selected.has(id));
    const toAdd = [...selected].filter((id) => !currentSet.has(id));

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("product_store_links")
        .delete()
        .eq("product_id", productId)
        .in("store_id", toDelete);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from("product_store_links").insert(
        toAdd.map((store_id) => ({ product_id: productId, store_id })),
      );
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    toast.success("Vínculos atualizados");
    setSaving(false);
    onOpenChange(false);
  };

  const selectAll = () => setSelected(new Set(stores.map((s) => s.id)));
  const clearAll = () => setSelected(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Lojas que recebem
          </DialogTitle>
          <DialogDescription>
            Marque as lojas que vendem/recebem <b>{productName}</b>. Apenas essas lojas entram no cálculo de sugestão de produção.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 text-xs">
              <Button size="sm" variant="outline" onClick={selectAll} className="h-7">
                Todas
              </Button>
              <Button size="sm" variant="outline" onClick={clearAll} className="h-7">
                Nenhuma
              </Button>
              <span className="ml-auto text-muted-foreground self-center">
                {selected.size}/{stores.length}
              </span>
            </div>
            <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
              {stores.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
              {stores.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground text-center">Nenhuma loja disponível.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductStoreLinksDialog;
