import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Brand { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  brands: Brand[];
  selectedBrands: string[];
  onSelectedBrandsChange: (v: string[]) => void;
  isYolo: boolean;
  onIsYoloChange: (v: boolean) => void;
  onSave: () => void;
  editingId?: string | null;
}

export default function AddCategoryDialog({
  open, onOpenChange, value, onChange, brands, selectedBrands, onSelectedBrandsChange,
  isYolo, onIsYoloChange, onSave, editingId,
}: Props) {

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar categoria</DialogTitle>
          <DialogDescription>
            A categoria pode aparecer em uma ou mais marcas. Mudou aqui, muda em todas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          <div className="space-y-2">
            <Label>Marcas que usam esta categoria</Label>
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => {
                const checked = selectedBrands.includes(b.id);
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => onSelectedBrandsChange(
                      checked ? selectedBrands.filter((x) => x !== b.id) : [...selectedBrands, b.id]
                    )}
                    className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${
                      checked
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label className="text-sm">Exclusiva Yolo</Label>
              <p className="text-xs text-muted-foreground">
                Só aparece depois que o cliente validar o código Yolo, nos dias/horários da loja.
              </p>
            </div>
            <Switch checked={isYolo} onCheckedChange={onIsYoloChange} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
