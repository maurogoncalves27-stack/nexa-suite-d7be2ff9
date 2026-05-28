// Dialog rápido: cria inventory_products a partir da descrição da NF-e e devolve o produto criado.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";

interface Created { id: string; name: string; unit: string | null; pack_size: number | null; purchase_unit: string | null }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName: string;
  defaultUnit: string | null;
  defaultPurchaseUnit?: string | null;
  defaultPackSize?: number | null;
  onCreated: (p: Created) => void;
}

const UNIT_OPTIONS = ["UN", "KG", "G", "L", "ML", "CX", "PC", "DZ", "FD", "PCT", "SC"];

export default function QuickCreateProductDialog({
  open, onOpenChange, defaultName, defaultUnit, defaultPurchaseUnit, defaultPackSize, onCreated,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [unit, setUnit] = useState((defaultUnit || "UN").toUpperCase());
  const [purchaseUnit, setPurchaseUnit] = useState((defaultPurchaseUnit || defaultUnit || "UN").toUpperCase());
  const [packSize, setPackSize] = useState<string>(defaultPackSize ? String(defaultPackSize) : "1");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setUnit((defaultUnit || "UN").toUpperCase());
      setPurchaseUnit((defaultPurchaseUnit || defaultUnit || "UN").toUpperCase());
      setPackSize(defaultPackSize ? String(defaultPackSize) : "1");
      setCategory("");
    }
  }, [open, defaultName, defaultUnit, defaultPurchaseUnit, defaultPackSize]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Informe o nome do produto"); return; }
    const pack = Number(packSize) || 1;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("inventory_products")
        .insert({
          name: name.trim(),
          unit,
          purchase_unit: purchaseUnit || unit,
          pack_size: pack > 0 ? pack : 1,
          category: category.trim() || null,
          is_active: true,
        })
        .select("id, name, unit, purchase_unit, pack_size")
        .single();
      if (error) throw error;
      toast.success("Produto cadastrado no estoque");
      onCreated({
        id: data.id,
        name: data.name,
        unit: data.unit,
        purchase_unit: data.purchase_unit,
        pack_size: data.pack_size,
      } as Created);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Falha ao cadastrar: " + (e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Cadastrar produto no estoque
          </DialogTitle>
          <DialogDescription>
            Cadastro rápido a partir da descrição da nota fiscal. Você pode editar depois em /estoque.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome do produto</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: CARNE BOVINA CORAÇÃO DA ALCATRA" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Unidade do estoque</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Como você conta no estoque</p>
            </div>
            <div>
              <Label className="text-xs">Categoria (opcional)</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Carnes" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Unidade de compra</Label>
              <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Como o fornecedor vende (fardo, caixa…)</p>
            </div>
            <div>
              <Label className="text-xs">Tamanho da embalagem</Label>
              <Input type="number" min={1} step="0.01" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">1 {purchaseUnit} = N {unit}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar e vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
