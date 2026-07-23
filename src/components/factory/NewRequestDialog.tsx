import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DraftItem, Product, Store } from "@/lib/factoryRequests";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  setStoreId: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  items: DraftItem[];
  onAddLine: () => void;
  onRemoveLine: (idx: number) => void;
  onUpdateLine: (idx: number, patch: Partial<DraftItem>) => void;
  requestableStores: Store[];
  products: Product[];
  creating: boolean;
  onSubmit: () => void;
}

export default function NewRequestDialog({
  open,
  onOpenChange,
  storeId,
  setStoreId,
  notes,
  setNotes,
  items,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  requestableStores,
  products,
  creating,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Nova solicitação à CD
          </DialogTitle>
          <DialogDescription>
            Selecione a loja que está solicitando e adicione os itens desejados. A CD vai
            avaliar antes de enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Loja solicitante</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {requestableStores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens</Label>
              <Button type="button" size="sm" variant="outline" onClick={onAddLine} className="h-7 gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const prod = products.find((p) => p.id === it.product_id);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 sm:col-span-6">
                      <Select
                        value={it.product_id}
                        onValueChange={(v) => onUpdateLine(idx, { product_id: v })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} <span className="text-xs text-muted-foreground">({p.unit})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="Qtd"
                        value={it.quantity}
                        onChange={(e) => onUpdateLine(idx, { quantity: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center text-xs text-muted-foreground h-9">
                      {prod?.unit ?? ""}
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <Input
                        placeholder="Obs."
                        value={it.notes}
                        onChange={(e) => onUpdateLine(idx, { notes: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => onRemoveLine(idx)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações (opcional)</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Urgência, prazo desejado, motivo..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar à CD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
