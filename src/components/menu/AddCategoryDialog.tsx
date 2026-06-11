import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Brand { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  brands: Brand[];
  selectedBrands: string[];
  onSelectedBrandsChange: (v: string[]) => void;
  onSave: () => void;
}

export default function AddCategoryDialog({
  open, onOpenChange, value, onChange, brands, selectedBrands, onSelectedBrandsChange, onSave,
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
