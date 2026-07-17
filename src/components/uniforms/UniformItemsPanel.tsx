import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { UNIFORM_CATEGORIES, SIZE_TYPES, sizesFor, type UniformItem } from "@/lib/uniforms";
import { Badge } from "@/components/ui/badge";

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

const empty = {
  name: "",
  description: "",
  category: "superior",
  size_type: "letra",
  is_durable: true,
  unit_cost: "",
  replacement_months: "12",
  is_active: true,
};

export function UniformItemsPanel({ items, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSizeType, setFilterSizeType] = useState<string>("all");
  const [search, setSearch] = useState("");


  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const startEdit = (it: UniformItem) => {
    setEditing(it.id);
    setForm({
      name: it.name,
      description: it.description ?? "",
      category: it.category,
      size_type: it.size_type,
      is_durable: it.is_durable,
      unit_cost: String(it.unit_cost),
      replacement_months: String(it.replacement_months),
      is_active: it.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      category: form.category,
      size_type: form.size_type,
      is_durable: !!form.is_durable,
      unit_cost: Number(form.unit_cost) || 0,
      replacement_months: Number(form.replacement_months) || 12,
      is_active: !!form.is_active,
    };
    const { error } = editing
      ? await supabase.from("uniform_items").update(payload).eq("id", editing)
      : await supabase.from("uniform_items").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Item atualizado" : "Item criado" });
    setOpen(false);
    setEditing(null);
    setForm(empty);
    onChanged();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Excluir item "${name}"?`)) return;
    const { error } = await supabase.from("uniform_items").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item excluído" });
    onChanged();
  };

  const filteredItems = items.filter((it) => {
    if (filterCategory !== "all" && it.category !== filterCategory) return false;
    if (filterSizeType !== "all" && it.size_type !== filterSizeType) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {filteredItems.length} de {items.length} {items.length === 1 ? "item" : "itens"}
        </div>
        <Button onClick={openNew} className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {UNIFORM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSizeType} onValueChange={setFilterSizeType}>
          <SelectTrigger><SelectValue placeholder="Tamanho" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tamanhos</SelectItem>
            {SIZE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {filteredItems.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhum item encontrado.</div>
        ) : UNIFORM_CATEGORIES.map((cat) => {
          const catItems = filteredItems.filter((it) => it.category === cat.value);
          if (catItems.length === 0) return null;
          return (
            <div key={cat.value} className="space-y-2">
              <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h3>
                <Badge variant="secondary" className="text-[10px]">{catItems.length}</Badge>
              </div>
              {catItems.map((it) => (
                <div key={it.id} className="flex items-start sm:items-center gap-2 sm:gap-3 p-3 border rounded-lg hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-1.5 sm:gap-2 flex-wrap text-sm sm:text-base">
                      <span className="truncate">{it.name}</span>
                      {!it.is_active && <Badge variant="outline" className="text-muted-foreground text-[10px] sm:text-xs">inativo</Badge>}
                      {it.is_durable && <Badge variant="outline" className="border-primary/50 text-primary text-[10px] sm:text-xs">durável</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.size_type === "numero" ? "Numérico" : it.size_type === "unico" ? "Tamanho único" : "PP–EG"} · R$ {Number(it.unit_cost).toFixed(2)} · troca a cada {it.replacement_months} meses
                      {it.description && ` · ${it.description}`}
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(it.id, it.name)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Novo item de uniforme"}</DialogTitle>
            <DialogDescription>Cadastro do catálogo de uniformes (camisa, calça, sapato, EPI…)</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Item*</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    category: v,
                    size_type: isSizeTypeLocked(v) ? sizeTypeForCategory(v) : form.size_type,
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
                {isSizeTypeLocked(form.category) && (
                  <span className="ml-1 text-xs text-muted-foreground">(obrigatório para {form.category === "calcado" ? "calçado" : "vestuário"})</span>
                )}
              </Label>
              <Select
                value={form.size_type}
                onValueChange={(v) => setForm({ ...form, size_type: v })}
                disabled={isSizeTypeLocked(form.category)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.size_type !== "unico" && (
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs text-muted-foreground">
                  Tamanhos que ficarão disponíveis (escolhidos na entrega/estoque)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {sizesFor(form.size_type).map((s) => (
                    <Badge key={s} variant="outline" className="font-mono">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Valor unitário (R$)</Label>
              <Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Troca a cada (meses)</Label>
              <Input type="number" value={form.replacement_months} onChange={(e) => setForm({ ...form, replacement_months: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_durable} onCheckedChange={(v) => setForm({ ...form, is_durable: v })} />
              <Label>Durável (devolver ao desligar)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Salvar alterações" : "Adicionar item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
