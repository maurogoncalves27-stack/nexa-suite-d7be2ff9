import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Check, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface InvoiceItemDraft {
  id?: string;
  product_id: string | null;
  line_number: number | null;
  original_description: string;
  original_code: string | null;
  original_barcode: string | null;
  original_ncm: string | null;
  unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  received: boolean;
  lot_number?: string | null;
  manufacture_date?: string | null;
  expiry_date?: string | null;
}

interface InventoryItemsEditorProps {
  items: InvoiceItemDraft[];
  onChange: (items: InvoiceItemDraft[]) => void;
  invoiceId?: string; // se já salvo, permite "receber" agora
  storeId?: string;
}

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  barcode: string | null;
  internal_code: string | null;
}

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT"];

export const InventoryItemsEditor = ({ items, onChange, invoiceId, storeId }: InventoryItemsEditorProps) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ name: "", unit: "UN", barcode: "", internal_code: "", category: "" });
  const [receivingIdx, setReceivingIdx] = useState<number | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_products")
      .select("id, name, unit, barcode, internal_code")
      .eq("is_active", true)
      .order("name")
      .limit(500);
    setProducts(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const updateItem = (idx: number, patch: Partial<InvoiceItemDraft>) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      if (patch.quantity != null || patch.unit_value != null) {
        merged.total_value = Number((merged.quantity * merged.unit_value).toFixed(4));
      }
      return merged;
    });
    onChange(next);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    onChange([
      ...items,
      {
        product_id: null,
        line_number: items.length + 1,
        original_description: "",
        original_code: null,
        original_barcode: null,
        original_ncm: null,
        unit: "UN",
        quantity: 1,
        unit_value: 0,
        total_value: 0,
        received: false,
        lot_number: null,
        manufacture_date: null,
        expiry_date: null,
      },
    ]);
  };

  const linkProduct = (idx: number, productId: string | null) => {
    const prod = products.find((p) => p.id === productId);
    updateItem(idx, {
      product_id: productId,
      unit: prod?.unit ?? items[idx].unit,
    });
  };

  const handleCreateProduct = async () => {
    if (creatingFor == null) return;
    if (!newProduct.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    const { data, error } = await supabase
      .from("inventory_products")
      .insert({
        name: newProduct.name.toUpperCase(),
        unit: newProduct.unit,
        barcode: newProduct.barcode || null,
        internal_code: newProduct.internal_code || null,
        category: newProduct.category || null,
        created_by: user?.id,
      })
      .select("id, name, unit, barcode, internal_code")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setProducts((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    linkProduct(creatingFor, data.id);
    setCreatingFor(null);
    setNewProduct({ name: "", unit: "UN", barcode: "", internal_code: "", category: "" });
    toast.success("Produto criado e vinculado");
  };

  const receiveItem = async (idx: number, itemId?: string) => {
    if (!itemId) {
      toast.error("Salve a nota antes de receber este item");
      return;
    }
    if (!items[idx].product_id) {
      toast.error("Vincule um produto antes de receber");
      return;
    }
    setReceivingIdx(idx);
    try {
      const { error } = await supabase.rpc("receive_invoice_item", { _item_id: itemId });
      if (error) throw error;
      updateItem(idx, { received: true });
      toast.success("Item recebido — estoque atualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao receber item");
    } finally {
      setReceivingIdx(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "itens"}
        </p>
        <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
          <Plus className="h-4 w-4" />
          Adicionar item
        </Button>
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-md">
          <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Importe um XML, escaneie o QR Code ou adicione itens manualmente.
        </div>
      )}

      {items.map((it, idx) => {
        const linkedProduct = products.find((p) => p.id === it.product_id);
        return (
          <div key={idx} className="border border-border rounded-md p-3 space-y-2 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">#{it.line_number ?? idx + 1}</Badge>
                {it.received && <Badge variant="default">Recebido</Badge>}
                {!it.product_id && <Badge variant="outline">Sem produto</Badge>}
              </div>
              <div className="flex gap-1">
                {!it.received && invoiceId && it.id && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 gap-1"
                    onClick={() => receiveItem(idx, it.id)}
                    disabled={receivingIdx === idx || !it.product_id}
                  >
                    {receivingIdx === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Receber
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(idx)}
                  disabled={it.received}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-12 space-y-1">
                <Label className="text-xs">Descrição (da nota)</Label>
                <Input
                  value={it.original_description}
                  onChange={(e) => updateItem(idx, { original_description: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="sm:col-span-6 space-y-1">
                <Label className="text-xs">Produto vinculado</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
                      <span className="truncate">{linkedProduct?.name ?? "Selecione…"}</span>
                      <Search className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar produto…" />
                      <CommandList>
                        <CommandEmpty>
                          <div className="p-2 space-y-2">
                            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-1"
                              onClick={() => {
                                setNewProduct((p) => ({
                                  ...p,
                                  name: it.original_description,
                                  unit: it.unit,
                                  barcode: it.original_barcode ?? "",
                                  internal_code: it.original_code ?? "",
                                }));
                                setCreatingFor(idx);
                              }}
                            >
                              <Plus className="h-3 w-3" /> Criar novo produto
                            </Button>
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {products.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.name} ${p.barcode ?? ""} ${p.internal_code ?? ""}`}
                              onSelect={() => linkProduct(idx, p.id)}
                            >
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {p.unit}{p.barcode ? ` • ${p.barcode}` : ""}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Select value={it.unit} onValueChange={(v) => updateItem(idx, { unit: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  className="h-9"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Valor unit. (R$)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={it.unit_value}
                  onChange={(e) => updateItem(idx, { unit_value: Number(e.target.value) })}
                  className="h-9"
                />
              </div>

              <div className="sm:col-span-12 text-right text-sm">
                Total: <span className="font-semibold">{it.total_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>

              {/* Validade do lote (opcional) */}
              <div className="sm:col-span-12 pt-2 mt-1 border-t border-dashed border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  📅 Validade do lote <span className="opacity-60">(opcional — preencha apenas para perecíveis)</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nº do lote</Label>
                    <Input
                      value={it.lot_number ?? ""}
                      onChange={(e) => updateItem(idx, { lot_number: e.target.value || null })}
                      className="h-9"
                      placeholder="Ex: L1234"
                      disabled={it.received}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fabricação</Label>
                    <Input
                      type="date"
                      value={it.manufacture_date ?? ""}
                      onChange={(e) => updateItem(idx, { manufacture_date: e.target.value || null })}
                      className="h-9"
                      disabled={it.received}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Validade</Label>
                    <Input
                      type="date"
                      value={it.expiry_date ?? ""}
                      onChange={(e) => updateItem(idx, { expiry_date: e.target.value || null })}
                      className="h-9"
                      disabled={it.received}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <Dialog open={creatingFor != null} onOpenChange={(v) => !v && setCreatingFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar novo produto</DialogTitle>
            <DialogDescription>O produto ficará disponível no catálogo da loja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Unidade</Label>
                <Select value={newProduct.unit} onValueChange={(v) => setNewProduct((p) => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input value={newProduct.category} onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))} placeholder="Bebidas, hortifruti…" />
              </div>
              <div className="space-y-1">
                <Label>Código de barras</Label>
                <Input value={newProduct.barcode} onChange={(e) => setNewProduct((p) => ({ ...p, barcode: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Código interno</Label>
                <Input value={newProduct.internal_code} onChange={(e) => setNewProduct((p) => ({ ...p, internal_code: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingFor(null)}>Cancelar</Button>
            <Button onClick={handleCreateProduct}>Criar produto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryItemsEditor;
