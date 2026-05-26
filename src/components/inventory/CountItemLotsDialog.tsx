import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, CalendarClock, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LotInput {
  key: string;
  quantity: string;
  expiry_date: string; // YYYY-MM-DD
  lot_number: string;
  manufacture_date: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  countItemId: string;
  storeId: string;
  productId: string;
  productName: string;
  unit: string;
  systemQuantity: number;
  onSaved: (totalCounted: number) => void;
}

const newLot = (): LotInput => ({
  key: crypto.randomUUID(),
  quantity: "",
  expiry_date: "",
  lot_number: "",
  manufacture_date: "",
});

export default function CountItemLotsDialog({
  open, onClose, countItemId, storeId, productId, productName, unit, systemQuantity, onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<LotInput[]>([newLot()]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_product_active_lots" as any, {
        _store_id: storeId,
        _product_id: productId,
      });
      setLoading(false);
      if (error) {
        console.error(error);
        setLots([newLot()]);
        return;
      }
      const rows = (data as any[]) ?? [];
      if (rows.length === 0) {
        setLots([newLot()]);
        return;
      }
      setLots(rows.map((r) => ({
        key: crypto.randomUUID(),
        quantity: String(r.quantity ?? ""),
        expiry_date: r.expiry_date ?? "",
        lot_number: r.lot_number ?? "",
        manufacture_date: r.manufacture_date ?? "",
      })));
    })();
  }, [open, storeId, productId]);

  const addLot = () => setLots((p) => [...p, newLot()]);
  const removeLot = (key: string) => setLots((p) => p.length === 1 ? p : p.filter((l) => l.key !== key));
  const updateLot = (key: string, patch: Partial<LotInput>) =>
    setLots((p) => p.map((l) => l.key === key ? { ...l, ...patch } : l));

  const total = lots.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  const diff = total - Number(systemQuantity || 0);

  const handleSave = async () => {
    // valida
    for (const l of lots) {
      const q = Number(l.quantity);
      if (!q || q <= 0) {
        return toast({ title: "Quantidade inválida", description: "Cada lote precisa de quantidade > 0.", variant: "destructive" });
      }
      if (!l.expiry_date) {
        return toast({ title: "Validade obrigatória", description: "Informe a validade de todos os lotes.", variant: "destructive" });
      }
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("set_count_item_lots" as any, {
      _count_item_id: countItemId,
      _lots: lots.map((l) => ({
        quantity: Number(l.quantity),
        expiry_date: l.expiry_date,
        lot_number: l.lot_number || null,
        manufacture_date: l.manufacture_date || null,
      })),
    });
    setSaving(false);
    if (error) {
      return toast({ title: "Erro ao salvar lotes", description: error.message, variant: "destructive" });
    }
    toast({ title: "Lotes registrados", description: `Quantidade contada: ${Number(data).toLocaleString("pt-BR")} ${unit}` });
    onSaved(Number(data));
    onClose();
  };

  const today = new Date();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" /> Lotes e validades
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span> — informe a quantidade por validade.
            A soma vira a quantidade contada e substitui os lotes ativos atuais.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {lots.map((lot, idx) => {
              const days = lot.expiry_date ? differenceInDays(parseISO(lot.expiry_date), today) : null;
              const expWarn = days !== null && days <= 7;
              const expDanger = days !== null && days < 0;
              return (
                <div key={lot.key} className="rounded-lg border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground">Lote #{idx + 1}</div>
                    {lots.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLot(lot.key)} className="h-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade ({unit}) *</Label>
                      <Input
                        type="number" inputMode="decimal" step="0.01" min="0"
                        value={lot.quantity}
                        onChange={(e) => updateLot(lot.key, { quantity: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Validade *</Label>
                      <Input
                        type="date"
                        value={lot.expiry_date}
                        onChange={(e) => updateLot(lot.key, { expiry_date: e.target.value })}
                        className={`h-9 ${expDanger ? "border-destructive" : expWarn ? "border-warning" : ""}`}
                      />
                      {lot.expiry_date && (
                        <p className={`text-[11px] ${expDanger ? "text-destructive" : expWarn ? "text-warning" : "text-muted-foreground"}`}>
                          {expDanger
                            ? `Vencido há ${Math.abs(days!)} dia(s)`
                            : days === 0 ? "Vence hoje"
                            : `Vence em ${days} dia(s) — ${format(parseISO(lot.expiry_date), "dd/MM/yyyy", { locale: ptBR })}`}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nº do lote (opcional)</Label>
                      <Input
                        value={lot.lot_number}
                        onChange={(e) => updateLot(lot.key, { lot_number: e.target.value })}
                        className="h-9 font-mono"
                        placeholder="Ex: L2026-001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fabricação (opcional)</Label>
                      <Input
                        type="date"
                        value={lot.manufacture_date}
                        onChange={(e) => updateLot(lot.key, { manufacture_date: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button variant="outline" onClick={addLot} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar lote
            </Button>

            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Soma dos lotes:</span>
                <span className="font-bold tabular-nums">{total.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {unit}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sistema:</span>
                <span className="tabular-nums">{Number(systemQuantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {unit}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t pt-1.5">
                <span className="text-muted-foreground">Diferença:</span>
                <span className={`font-bold tabular-nums ${diff < 0 ? "text-destructive" : diff > 0 ? "text-warning" : "text-emerald-600"}`}>
                  {diff > 0 ? "+" : ""}{diff.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                </span>
              </div>
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded p-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Ao salvar, os lotes ativos atuais deste produto na loja serão <strong>substituídos</strong> pelos informados acima, e a quantidade contada será preenchida automaticamente.</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Salvar lotes ({lots.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
