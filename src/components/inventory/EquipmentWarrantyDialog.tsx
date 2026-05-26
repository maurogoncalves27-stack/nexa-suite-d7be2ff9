import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SourceItem {
  invoice_item_id: string;
  invoice_id: string;
  store_id: string;
  description: string;
  supplier_name?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  unit_value?: number | null;
  quantity?: number | null;
}

interface EquipmentWarrantyDialogProps {
  open: boolean;
  onClose: () => void;
  source: SourceItem | null;
  warrantyId?: string | null;
  onSaved?: () => void;
}

export const EquipmentWarrantyDialog = ({ open, onClose, source, warrantyId, onSaved }: EquipmentWarrantyDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [equipmentName, setEquipmentName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState<number>(12);
  const [purchaseDate, setPurchaseDate] = useState<string>("");
  const [purchaseValue, setPurchaseValue] = useState<string>("");
  const [installationLocation, setInstallationLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const init = async () => {
      if (warrantyId) {
        setLoading(true);
        const { data } = await supabase
          .from("equipment_warranties")
          .select("*")
          .eq("id", warrantyId)
          .maybeSingle();
        if (data) {
          setEquipmentName(data.equipment_name ?? "");
          setSerialNumber(data.serial_number ?? "");
          setAssetTag(data.asset_tag ?? "");
          setWarrantyMonths(Number(data.warranty_months ?? 12));
          setPurchaseDate(data.purchase_date ?? "");
          setPurchaseValue(data.purchase_value != null ? String(data.purchase_value) : "");
          setInstallationLocation(data.installation_location ?? "");
          setNotes(data.notes ?? "");
        }
        setLoading(false);
      } else if (source) {
        setEquipmentName(source.description ?? "");
        setSerialNumber("");
        setAssetTag("");
        setWarrantyMonths(12);
        setPurchaseDate(source.issue_date ?? new Date().toISOString().slice(0, 10));
        setPurchaseValue(source.unit_value != null ? String(source.unit_value) : "");
        setInstallationLocation("");
        setNotes("");
      }
    };
    void init();
  }, [open, warrantyId, source]);

  const handleSave = async () => {
    if (!user) return;
    if (!equipmentName.trim()) {
      toast.error("Informe o nome do equipamento");
      return;
    }
    if (!warrantyId && !source) {
      toast.error("Origem inválida");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        equipment_name: equipmentName.trim(),
        serial_number: serialNumber.trim() || null,
        asset_tag: assetTag.trim() || null,
        warranty_months: Number(warrantyMonths) || 12,
        purchase_date: purchaseDate || null,
        purchase_value: purchaseValue ? Number(purchaseValue) : null,
        installation_location: installationLocation.trim() || null,
        notes: notes.trim() || null,
      };
      if (warrantyId) {
        const { error } = await supabase
          .from("equipment_warranties")
          .update(payload)
          .eq("id", warrantyId);
        if (error) throw error;
        toast.success("Garantia atualizada");
      } else if (source) {
        const { error } = await supabase.from("equipment_warranties").insert({
          ...payload,
          store_id: source.store_id,
          invoice_id: source.invoice_id,
          invoice_item_id: source.invoice_item_id,
          supplier_name: source.supplier_name ?? null,
          invoice_number: source.invoice_number ?? null,
          created_by: user.id,
        });
        if (error) throw error;
        toast.success("Garantia cadastrada");
      }
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {warrantyId ? "Editar garantia" : "Cadastrar garantia de equipamento"}
          </DialogTitle>
          <DialogDescription>
            {source?.invoice_number
              ? `Vinculado à NF ${source.invoice_number}`
              : "Preencha os dados do equipamento e o prazo de garantia"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-name">Nome do equipamento *</Label>
              <Input
                id="eq-name"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                placeholder="Ex.: Freezer horizontal Consul 500L"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="eq-serial">Nº de série</Label>
                <Input id="eq-serial" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="eq-asset">Patrimônio</Label>
                <Input id="eq-asset" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="eq-date">Data da compra</Label>
                <Input id="eq-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="eq-months">Garantia (meses)</Label>
                <Input
                  id="eq-months"
                  type="number"
                  min={0}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="eq-value">Valor de compra (R$)</Label>
              <Input
                id="eq-value"
                type="number"
                step="0.01"
                value={purchaseValue}
                onChange={(e) => setPurchaseValue(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="eq-loc">Local de instalação</Label>
              <Input
                id="eq-loc"
                value={installationLocation}
                onChange={(e) => setInstallationLocation(e.target.value)}
                placeholder="Ex.: Cozinha — Loja Centro"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="eq-notes">Observações</Label>
              <Textarea id="eq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            {purchaseDate && warrantyMonths > 0 && (
              <p className="text-xs text-muted-foreground">
                Vencimento estimado:{" "}
                <span className="font-medium text-foreground">
                  {new Date(
                    new Date(purchaseDate).setMonth(new Date(purchaseDate).getMonth() + Number(warrantyMonths)),
                  ).toLocaleDateString("pt-BR")}
                </span>
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentWarrantyDialog;
