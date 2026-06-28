import { useEffect, useMemo, useState } from "react";
import { Loader2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Store { id: string; name: string; }
interface Category { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stores: Store[];
  categories: Category[];
  brandId: string;
  defaultSourceStoreId: string;
  onDone: () => void;
}

/**
 * Copia a disponibilidade (linhas em menu_item_stores) de uma loja origem
 * para uma ou mais lojas destino. Pode ser TOTAL (cardápio inteiro da marca)
 * ou restrita a CATEGORIAS selecionadas.
 */
export default function ReplicateMenuDialog({
  open, onOpenChange, stores, categories, brandId, defaultSourceStoreId, onDone,
}: Props) {
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState(defaultSourceStoreId);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"all" | "categories">("all");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSourceId(defaultSourceStoreId);
      setTargetIds([]);
      setMode("all");
      setSelectedCats([]);
    }
  }, [open, defaultSourceStoreId]);

  const targetOptions = useMemo(
    () => stores.filter((s) => s.id !== sourceId),
    [stores, sourceId],
  );

  const toggleTarget = (id: string) =>
    setTargetIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleCat = (id: string) =>
    setSelectedCats((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function handleReplicate() {
    if (!sourceId || targetIds.length === 0) {
      toast({ title: "Selecione a loja origem e ao menos uma loja destino", variant: "destructive" });
      return;
    }
    if (mode === "categories" && selectedCats.length === 0) {
      toast({ title: "Selecione ao menos uma categoria", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: mib, error: e1 } = await (supabase as any)
        .from("menu_item_brands").select("menu_item_id").eq("brand_id", brandId);
      if (e1) throw e1;
      let itemIds = ((mib ?? []) as any[]).map((r) => r.menu_item_id as string);

      if (mode === "categories") {
        const { data: mItems } = await supabase
          .from("menu_items").select("id, category_id").in("id", itemIds);
        itemIds = ((mItems ?? []) as any[])
          .filter((m) => m.category_id && selectedCats.includes(m.category_id))
          .map((m) => m.id as string);
      }

      if (itemIds.length === 0) {
        toast({ title: "Nada para replicar", description: "Nenhum item nessa seleção." });
        setBusy(false);
        return;
      }

      const { data: srcRows, error: e2 } = await (supabase as any)
        .from("menu_item_stores")
        .select("menu_item_id, is_available")
        .eq("store_id", sourceId)
        .in("menu_item_id", itemIds);
      if (e2) throw e2;

      const availableSet = new Set<string>(
        ((srcRows ?? []) as any[])
          .filter((r) => r.is_available)
          .map((r) => r.menu_item_id as string),
      );

      for (const dest of targetIds) {
        const { error: eDel } = await (supabase as any)
          .from("menu_item_stores")
          .delete()
          .eq("store_id", dest)
          .in("menu_item_id", itemIds);
        if (eDel) throw eDel;

        const rowsToInsert = itemIds
          .filter((id) => availableSet.has(id))
          .map((id) => ({ menu_item_id: id, store_id: dest, is_available: true }));

        if (rowsToInsert.length > 0) {
          const { error: eIns } = await (supabase as any)
            .from("menu_item_stores").insert(rowsToInsert);
          if (eIns) throw eIns;
        }
      }

      toast({
        title: "Replicação concluída",
        description: `${itemIds.length} item(ns) replicado(s) para ${targetIds.length} loja(s).`,
      });
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ title: "Erro ao replicar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> Replicar cardápio entre lojas
          </DialogTitle>
          <DialogDescription>
            Copia exatamente quais itens estão disponíveis ou pausados da loja origem para as lojas destino.
            Sobrescreve a configuração atual das lojas destino para o conjunto selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Loja origem</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Lojas destino</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {targetOptions.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <Checkbox
                    checked={targetIds.includes(s.id)}
                    onCheckedChange={() => toggleTarget(s.id)}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Escopo</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "all" | "categories")}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="all" /> <span className="text-sm">Cardápio inteiro</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="categories" /> <span className="text-sm">Por categoria</span>
              </label>
            </RadioGroup>
          </div>

          {mode === "categories" && (
            <div className="space-y-2 max-h-48 overflow-auto rounded-md border p-2">
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">Nenhuma categoria nesta marca.</p>
              )}
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={selectedCats.includes(c.id)}
                    onCheckedChange={() => toggleCat(c.id)}
                  />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleReplicate} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Replicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
