import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { MenuItem } from "@/lib/menuFormat";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: MenuItem[];
  selectedId: string;
  onSelect: (v: string) => void;
  duplicating: boolean;
  onConfirm: () => void;
}

export default function DuplicateItemDialog({
  open, onOpenChange, items, selectedId, onSelect, duplicating, onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar item</DialogTitle>
          <DialogDescription>
            Cria uma cópia do prato escolhido (com adicionais) com o sufixo "(cópia)".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Item de origem</Label>
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um item" />
            </SelectTrigger>
            <SelectContent>
              {items.map((it) => (
                <SelectItem key={it.product_id} value={it.product_id}>
                  {it.name} — {it.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={duplicating}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={duplicating || !selectedId} className="gap-2">
            {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
