import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, Save, AlertTriangle, ArrowRightLeft, Warehouse } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import {
  UNIFORM_CATEGORIES,
  SIZE_TYPES,
  MOVEMENT_TYPES,
  CONDITION_OPTIONS,
  UNIFORM_CENTRAL_STORE_ID,
  sizesFor,
  type UniformItem,
  type UniformCondition,
} from "@/lib/uniforms";

interface StockRow {
  id: string;
  store_id: string;
  uniform_item_id: string;
  size: string;
  quantity: number;
  min_alert: number;
  condition: UniformCondition;
}

interface Props {
  items: UniformItem[];
  onChanged: () => void;
}

const sizeTypeForCategory = (cat: string): string => {
  if (cat === "calcado") return "numero";
  if (cat === "superior" || cat === "inferior" || cat === "vestuario") return "letra";
  return "unico";
};
const isSizeTypeLocked = (cat: string) =>
  cat === "calcado" || cat === "superior" || cat === "inferior" || cat === "vestuario";

const emptyItem = {
  name: "",
  description: "",
  category: "superior",
  size_type: "letra",
  is_durable: true,
  unit_cost: "",
  replacement_months: "12",
  is_active: true,
};

const emptyMov = {
  uniform_item_id: "",
  size: "",
  movement_type: "entrada",
  quantity: "",
  reason: "",
  condition: "nova" as UniformCondition,
};

export function UniformCatalogStockPanel({ items, onChanged }: Props) {
  const { user } = useAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);

  // filtros
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSizeType, setFilterSizeType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showZero, setShowZero] = useState(true);

  // modal item
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<any>(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

  // modal movimentação
  const [movOpen, setMovOpen] = useState(false);
  const [movForm, setMovForm] = useState(emptyMov);
  const [savingMov, setSavingMov] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("uniform_stock")
      .select("*")
      .eq("store_id", UNIFORM_CENTRAL_STORE_ID);
    setStock(((data ?? []) as any[]).map((r) => ({ ...r, condition: (r.condition ?? "nova") as UniformCondition })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ---- Item CRUD ----
  const openNewItem = () => { setEditing(null); setItemForm(emptyItem); setItemOpen(true); };
  const startEdit = (it: UniformItem) => {
    setEditing(it.id);
    setItemForm({
      name: it.name,
      description: it.description ?? "",
      category: it.category,
      size_type: it.size_type,
      is_durable: it.is_durable,
      unit_cost: String(it.unit_cost),
      replacement_months: String(it.replacement_months),
      is_active: it.is_active,
    });
    setItemOpen(true);
  };
  const saveItem = async () => {
    if (!itemForm.name.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    setSavingItem(true);
    const payload = {
      name: itemForm.name.trim(),
      description: itemForm.description?.trim() || null,
      category: itemForm.category,
      size_type: itemForm.size_type,
      is_durable: !!itemForm.is_durable,
      unit_cost: Number(itemForm.unit_cost) || 0,
      replacement_months: Number(itemForm.replacement_months) || 12,
      is_active: !!itemForm.is_active,
    };
    const { error } = editing
      ? await supabase.from("uniform_items").update(payload).eq("id", editing)
      : await supabase.from("uniform_items").insert(payload);
    setSavingItem(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Item atualizado" : "Item criado" });
    setItemOpen(false); setEditing(null); setItemForm(emptyItem);
    onChanged();
  };
  const removeItem = async (id: string, name: string) => {
    if (!confirm(`Excluir item "${name}"?`)) return;
    const { error } = await supabase.from("uniform_items").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item excluído" });
    onChanged();
  };

  // ---- Movimentação ----
  const openMov = (uniform_item_id?: string, size?: string, condition?: UniformCondition) => {
    setMovForm({ ...emptyMov, uniform_item_id: uniform_item_id ?? "", size: size ?? "", condition: condition ?? "nova" });
    setMovOpen(true);
  };
  const submitMov = async () => {
    if (!movForm.uniform_item_id || !movForm.size || !movForm.quantity) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSavingMov(true);
    const { error } = await supabase.from("uniform_stock_movements").insert({
      store_id: UNIFORM_CENTRAL_STORE_ID,
      uniform_item_id: movForm.uniform_item_id,
      size: movForm.size,
      movement_type: movForm.movement_type,
      quantity: Math.max(1, Number(movForm.quantity) || 1),
      reason: movForm.reason || null,
      created_by: user?.id,
      condition: movForm.condition,
    } as any);
    setSavingMov(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Movimentação registrada" });
    setMovOpen(false);
    load();
  };

  const updateMinAlert = async (rowId: string, value: number) => {
    const { error } = await supabase.from("uniform_stock").update({ min_alert: value }).eq("id", rowId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  // ---- Matriz ----
  const stockKey = (itemId: string, size: string, cond: UniformCondition) =>
    stock.find((s) => s.uniform_item_id === itemId && s.size === size && s.condition === cond);

  const filteredItems = items.filter((it) => {
    if (filterCategory !== "all" && it.category !== filterCategory) return false;
    if (filterSizeType !== "all" && it.size_type !== filterSizeType) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalNova = stock.filter((s) => s.condition === "nova").reduce((s, r) => s + r.quantity, 0);
  const totalUsada = stock.filter((s) => s.condition === "usada").reduce((s, r) => s + r.quantity, 0);

  const movItem = items.find((i) => i.id === movForm.uniform_item_id);
  const movSizes = movItem ? sizesFor(movItem.size_type) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" /> Itens e estoque central (sede)
          </CardTitle>
          <CardDescription>
            Catálogo unificado com o estoque. Cada linha é uma peça×tamanho, com quantidades <b>Novas</b> (compra) e <b>Usadas</b> (devolução).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline" className="border-primary/50 text-xs">Novas: <span className="ml-1 font-bold text-foreground">{totalNova}</span></Badge>
            <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300 text-xs">Usadas: <span className="ml-1 font-bold text-foreground">{totalUsada}</span></Badge>
            <div className="ml-auto flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={() => openMov()} className="gap-2">
                <ArrowRightLeft className="h-4 w-4" /> Movimentação
              </Button>
              <Button size="sm" onClick={openNewItem} className="gap-2">
                <Plus className="h-4 w-4" /> Novo item
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input placeholder="Buscar peça..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {UNIFORM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSizeType} onValueChange={setFilterSizeType}>
              <SelectTrigger><SelectValue placeholder="Tipo tam." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tamanhos</SelectItem>
                {SIZE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 px-2 border rounded-md">
              <Switch checked={showZero} onCheckedChange={setShowZero} id="showZero" />
              <Label htmlFor="showZero" className="text-xs cursor-pointer">Mostrar tam. zerados</Label>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Nenhum item encontrado.</div>
          ) : (
            <div className="space-y-6">
              {UNIFORM_CATEGORIES.map((cat) => {
                const catItems = filteredItems.filter((it) => it.category === cat.value);
                if (catItems.length === 0) return null;
                return (
                  <div key={cat.value} className="space-y-2">
                    <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h3>
                      <Badge variant="secondary" className="text-[10px]">{catItems.length}</Badge>
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="text-left text-muted-foreground bg-muted/30 border-b text-xs">
                          <tr>
                            <th className="py-2 px-3">Peça</th>
                            <th className="px-2">Tam.</th>
                            <th className="px-2 text-center">Novas</th>
                            <th className="px-2 text-center">Usadas</th>
                            <th className="px-2 text-center">Mín.</th>
                            <th className="px-2">Status</th>
                            <th className="px-2 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catItems.map((it) => {
                            const sizes = sizesFor(it.size_type);
                            const rows = sizes
                              .map((s) => {
                                const nova = stockKey(it.id, s, "nova");
                                const usada = stockKey(it.id, s, "usada");
                                return { size: s, nova, usada };
                              })
                              .filter((r) => showZero || (r.nova?.quantity ?? 0) + (r.usada?.quantity ?? 0) > 0);

                            if (rows.length === 0) {
                              return (
                                <tr key={it.id} className="border-b hover:bg-muted/20">
                                  <td className="py-2 px-3 font-medium">
                                    {it.name}
                                    {!it.is_active && <Badge variant="outline" className="ml-2 text-[10px]">inativo</Badge>}
                                  </td>
                                  <td colSpan={5} className="px-2 text-xs text-muted-foreground italic">Sem estoque</td>
                                  <td className="px-2">
                                    <div className="flex justify-end">
                                      <Button variant="ghost" size="icon" onClick={() => openMov(it.id)}><Plus className="h-4 w-4" /></Button>
                                      <Button variant="ghost" size="icon" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" /></Button>
                                      <Button variant="ghost" size="icon" onClick={() => removeItem(it.id, it.name)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return rows.map((r, idx) => {
                              const totalQty = (r.nova?.quantity ?? 0) + (r.usada?.quantity ?? 0);
                              const minAlert = Math.max(r.nova?.min_alert ?? 0, r.usada?.min_alert ?? 0);
                              const low = minAlert > 0 && totalQty < minAlert;
                              const stockRowId = r.nova?.id ?? r.usada?.id;
                              return (
                                <tr key={`${it.id}-${r.size}`} className="border-b hover:bg-muted/20">
                                  {idx === 0 ? (
                                    <td className="py-2 px-3 align-top" rowSpan={rows.length}>
                                      <div className="font-medium flex items-center gap-1.5 flex-wrap">
                                        <span>{it.name}</span>
                                        {!it.is_active && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                                        {it.is_durable && <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">durável</Badge>}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground mt-0.5">
                                        R$ {Number(it.unit_cost).toFixed(2)} · {it.replacement_months}m
                                      </div>
                                    </td>
                                  ) : null}
                                  <td className="px-2 font-mono text-xs">{r.size}</td>
                                  <td className="px-2 text-center font-medium">{r.nova?.quantity ?? 0}</td>
                                  <td className="px-2 text-center font-medium text-amber-700 dark:text-amber-300">{r.usada?.quantity ?? 0}</td>
                                  <td className="px-2">
                                    <Input
                                      type="number"
                                      className="h-7 w-16 mx-auto text-center"
                                      value={r.nova?.min_alert ?? r.usada?.min_alert ?? 0}
                                      onChange={(e) => stockRowId && updateMinAlert(stockRowId, Number(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="px-2">
                                    {low ? (
                                      <Badge variant="outline" className="border-destructive/60 text-destructive text-[10px]">
                                        <AlertTriangle className="h-3 w-3 mr-1" /> Repor
                                      </Badge>
                                    ) : totalQty === 0 ? (
                                      <Badge variant="outline" className="text-muted-foreground text-[10px]">Zero</Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-emerald-500/60 text-emerald-700 dark:text-emerald-300 text-[10px]">Ok</Badge>
                                    )}
                                  </td>
                                  <td className="px-2">
                                    <div className="flex justify-end gap-0.5">
                                      <Button variant="ghost" size="icon" title="Movimentar" onClick={() => openMov(it.id, r.size)}>
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                      {idx === 0 && (
                                        <>
                                          <Button variant="ghost" size="icon" title="Editar item" onClick={() => startEdit(it)}>
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button variant="ghost" size="icon" title="Excluir item" onClick={() => removeItem(it.id, it.name)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Item */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item de uniforme"}</DialogTitle>
            <DialogDescription>Cadastro de peças (camisa, calça, sapato, EPI…)</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Item*</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={itemForm.category}
                onValueChange={(v) =>
                  setItemForm({
                    ...itemForm,
                    category: v,
                    size_type: isSizeTypeLocked(v) ? sizeTypeForCategory(v) : itemForm.size_type,
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIFORM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Tipo de tamanho
                {isSizeTypeLocked(itemForm.category) && (
                  <span className="ml-1 text-xs text-muted-foreground">(obrigatório)</span>
                )}
              </Label>
              <Select
                value={itemForm.size_type}
                onValueChange={(v) => setItemForm({ ...itemForm, size_type: v })}
                disabled={isSizeTypeLocked(itemForm.category)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {itemForm.size_type !== "unico" && (
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs text-muted-foreground">Tamanhos disponíveis</Label>
                <div className="flex flex-wrap gap-1.5">
                  {sizesFor(itemForm.size_type).map((s) => (
                    <Badge key={s} variant="outline" className="font-mono">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Valor unitário (R$)</Label>
              <Input type="number" step="0.01" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Troca (meses)</Label>
              <Input type="number" value={itemForm.replacement_months} onChange={(e) => setItemForm({ ...itemForm, replacement_months: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Descrição</Label>
              <Textarea rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={itemForm.is_durable} onCheckedChange={(v) => setItemForm({ ...itemForm, is_durable: v })} />
              <Label>Durável (devolver ao desligar)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={itemForm.is_active} onCheckedChange={(v) => setItemForm({ ...itemForm, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setItemOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={saveItem} disabled={savingItem} className="w-full sm:w-auto gap-2">
              {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Movimentação */}
      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar movimentação</DialogTitle>
            <DialogDescription>Entrada, saída, ajuste ou perda no estoque central.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Peça</Label>
              <Select value={movForm.uniform_item_id} onValueChange={(v) => setMovForm({ ...movForm, uniform_item_id: v, size: "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {items.filter((i) => i.is_active).map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tamanho</Label>
              <Select value={movForm.size} onValueChange={(v) => setMovForm({ ...movForm, size: v })} disabled={!movItem}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {movSizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condição</Label>
              <Select value={movForm.condition} onValueChange={(v) => setMovForm({ ...movForm, condition: v as UniformCondition })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={movForm.movement_type} onValueChange={(v) => setMovForm({ ...movForm, movement_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setMovOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitMov} disabled={savingMov} className="w-full sm:w-auto gap-2">
              {savingMov ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
