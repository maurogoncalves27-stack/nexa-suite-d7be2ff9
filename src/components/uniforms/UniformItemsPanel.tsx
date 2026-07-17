import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pencil, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { UNIFORM_CATEGORIES, SIZE_TYPES, type UniformItem } from "@/lib/uniforms";
import { Badge } from "@/components/ui/badge";

interface Props {
  items: UniformItem[];
  onChanged: () => void;
}

const empty = {
  name: "",
  description: "",
  category: "vestuario",
  size_type: "letra",
  is_durable: true,
  unit_cost: "",
  replacement_months: "12",
  is_active: true,
};

export function UniformItemsPanel({ items, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const formRef = useRef<HTMLDivElement | null>(null);

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
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const reset = () => { setEditing(null); setForm(empty); };

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
    reset();
    onChanged();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Excluir item "${name}"?`)) return;
    const { error } = await supabase.from("uniform_items").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item excluído" });
    onChanged();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editing ? "Editar item" : "Novo item de uniforme"}</CardTitle>
          <CardDescription>Cadastro do catálogo de uniformes (camisa, calça, sapato, EPI…)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2 md:col-span-2">
            <Label>Item*</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIFORM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo de tamanho</Label>
            <Select value={form.size_type} onValueChange={(v) => setForm({ ...form, size_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
            <Label>Durável (deve ser devolvido no desligamento)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Ativo</Label>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:items-end sm:justify-end gap-2 md:col-span-3">
            {editing && <Button variant="outline" onClick={reset} className="w-full sm:w-auto">Cancelar</Button>}
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Salvar alterações" : "Adicionar item"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Nenhum item cadastrado.</div>
        ) : items.map((it) => (
          <div key={it.id} className="flex items-start sm:items-center gap-2 sm:gap-3 p-3 border rounded-lg hover:bg-muted/30">
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-1.5 sm:gap-2 flex-wrap text-sm sm:text-base">
                <span className="truncate">{it.name}</span>
                <Badge variant="outline" className="capitalize text-[10px] sm:text-xs">{it.category}</Badge>
                {!it.is_active && <Badge variant="outline" className="text-muted-foreground text-[10px] sm:text-xs">inativo</Badge>}
                {it.is_durable && <Badge variant="outline" className="border-primary/50 text-primary text-[10px] sm:text-xs">durável</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {it.size_type === "numero" ? "Numérico" : "PP–EG"} · R$ {Number(it.unit_cost).toFixed(2)} · troca a cada {it.replacement_months} meses
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
    </div>
  );
}
