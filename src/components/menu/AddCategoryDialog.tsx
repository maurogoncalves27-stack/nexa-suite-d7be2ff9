import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}

export default function AddCategoryDialog({ open, onOpenChange, value, onChange, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar categoria</DialogTitle>
          <DialogDescription>
            A categoria aparecerá na lista. Crie um item para que ela seja salva permanentemente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-category">Nome</Label>
          <Input
            id="new-category"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ex: Bebidas"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
