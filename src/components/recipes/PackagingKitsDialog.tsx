import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Brand { id: string; name: string; }
interface Product { id: string; name: string; unit: string; }
interface KitItem { id?: string; product_id: string; quantity: number; }
interface Kit {
  id: string;
  brand_id: string;
  name: string;
  kit_type: "individual" | "casal" | "familia";
  is_active: boolean;
  items: KitItem[];
}

const KIT_TYPES: { value: Kit["kit_type"]; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "casal", label: "Casal" },
  { value: "familia", label: "Família" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

const PackagingKitsDialog = ({ open, onOpenChange, onChanged }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [activeBrand, setActiveBrand] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [{ data: brs }, { data: prods }, { data: ks }, { data: kis }] = await Promise.all([
      supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("inventory_products").select("id, name, unit, category").eq("is_active", true).or("category.ilike.%embal%,category.ilike.%descart%,category.ilike.%personaliz%").order("name"),
      supabase.from("packaging_kits").select("*").order("created_at"),
      supabase.from("packaging_kit_items").select("*"),
    ]);
    const itemsByKit: Record<string, KitItem[]> = {};
    (kis ?? []).forEach((it: any) => {
      (itemsByKit[it.kit_id] ||= []).push({ id: it.id, product_id: it.product_id, quantity: Number(it.quantity) });
    });
    setBrands((brs as Brand[]) ?? []);
    setProducts((prods as Product[]) ?? []);
    setKits(((ks as any[]) ?? []).map((k) => ({ ...k, items: itemsByKit[k.id] ?? [] })));
    if (!activeBrand && brs && brs.length) setActiveBrand((brs as Brand[])[0].id);
    setLoading(false);
  };

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open]);

  const brandKits = useMemo(
    () => kits.filter((k) => k.brand_id === activeBrand),
    [kits, activeBrand],
  );

  const addKit = (type: Kit["kit_type"]) => {
    const newKit: Kit = {
      id: `new-${Date.now()}`,
      brand_id: activeBrand,
      name: KIT_TYPES.find((t) => t.value === type)!.label,
      kit_type: type,
      is_active: true,
      items: [],
    };
    setKits((arr) => [...arr, newKit]);
  };

  const updateKit = (id: string, patch: Partial<Kit>) =>
    setKits((arr) => arr.map((k) => (k.id === id ? { ...k, ...patch } : k)));

  const addItem = (kitId: string) =>
    updateKit(kitId, { items: [...(kits.find((k) => k.id === kitId)?.items ?? []), { product_id: "", quantity: 1 }] });

  const updateItem = (kitId: string, idx: number, patch: Partial<KitItem>) => {
    const k = kits.find((x) => x.id === kitId);
    if (!k) return;
    updateKit(kitId, { items: k.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };

  const removeItem = (kitId: string, idx: number) => {
    const k = kits.find((x) => x.id === kitId);
    if (!k) return;
    updateKit(kitId, { items: k.items.filter((_, i) => i !== idx) });
  };

  const saveKit = async (kit: Kit) => {
    if (!kit.name.trim()) { toast.error("Informe o nome do kit"); return; }
    if (kit.items.some((i) => !i.product_id || i.quantity <= 0)) {
      toast.error("Verifique os itens do kit"); return;
    }
    setSavingId(kit.id);
    try {
      let kitId = kit.id;
      const isNew = kit.id.startsWith("new-");
      if (isNew) {
        const { data, error } = await supabase.from("packaging_kits").insert({
          brand_id: kit.brand_id,
          name: kit.name.trim(),
          kit_type: kit.kit_type,
          is_active: kit.is_active,
          created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        kitId = data.id;
      } else {
        const { error } = await supabase.from("packaging_kits").update({
          name: kit.name.trim(), kit_type: kit.kit_type, is_active: kit.is_active,
        }).eq("id", kit.id);
        if (error) throw error;
      }
      await supabase.from("packaging_kit_items").delete().eq("kit_id", kitId);
      if (kit.items.length) {
        const { error } = await supabase.from("packaging_kit_items").insert(
          kit.items.map((i) => ({ kit_id: kitId, product_id: i.product_id, quantity: i.quantity })),
        );
        if (error) throw error;
      }
      toast.success("Kit salvo");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSavingId(null);
    }
  };

  const deleteKit = async (kit: Kit) => {
    if (kit.id.startsWith("new-")) {
      setKits((arr) => arr.filter((k) => k.id !== kit.id));
      return;
    }
    if (!confirm(`Excluir kit "${kit.name}"?`)) return;
    const { error } = await supabase.from("packaging_kits").delete().eq("id", kit.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kit excluído");
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Kits de embalagens
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : brands.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Cadastre marcas antes.</p>
        ) : (
          <Tabs value={activeBrand} onValueChange={setActiveBrand}>
            <TabsList className="flex flex-wrap h-auto">
              {brands.map((b) => (
                <TabsTrigger key={b.id} value={b.id}>{b.name}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={activeBrand} className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {KIT_TYPES.map((t) => (
                  <Button key={t.value} size="sm" variant="outline" onClick={() => addKit(t.value)} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> {t.label}
                  </Button>
                ))}
              </div>

              {brandKits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum kit nesta marca ainda.</p>
              ) : (
                brandKits.map((kit) => (
                  <div key={kit.id} className="border rounded-md p-3 space-y-3 bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input value={kit.name} onChange={(e) => updateKit(kit.id, { name: e.target.value })} />
                      </div>
                      <div className="space-y-1 sm:w-40">
                        <Label className="text-xs">Tipo</Label>
                        <Select value={kit.kit_type} onValueChange={(v) => updateKit(kit.id, { kit_type: v as Kit["kit_type"] })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {KIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Badge variant={kit.is_active ? "default" : "outline"} className="self-center">
                        {kit.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{kit.items.length} item(ns)</p>
                        <Button size="sm" variant="ghost" onClick={() => addItem(kit.id)} className="h-7 gap-1">
                          <Plus className="h-3.5 w-3.5" /> Item
                        </Button>
                      </div>
                      {kit.items.map((it, idx) => {
                        const p = products.find((x) => x.id === it.product_id);
                        return (
                          <div key={idx} className="grid grid-cols-12 gap-2">
                            <div className="col-span-7 sm:col-span-8">
                              <Select value={it.product_id} onValueChange={(v) => updateItem(kit.id, idx, { product_id: v })}>
                                <SelectTrigger className="h-9"><SelectValue placeholder="Embalagem…" /></SelectTrigger>
                                <SelectContent>
                                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-4 sm:col-span-3">
                              <Input
                                type="number" step="0.01" min="0"
                                value={it.quantity}
                                onChange={(e) => updateItem(kit.id, idx, { quantity: Number(e.target.value) })}
                                placeholder={`Qtd ${p?.unit ?? ""}`}
                                className="h-9"
                              />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(kit.id, idx)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteKit(kit)}>
                        Excluir
                      </Button>
                      <Button size="sm" onClick={() => saveKit(kit)} disabled={savingId === kit.id}>
                        {savingId === kit.id && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Salvar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PackagingKitsDialog;
