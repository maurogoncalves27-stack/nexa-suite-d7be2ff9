import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Loader2, Search, Pencil, X } from "lucide-react";

export interface Occurrence {
  id: string;
  code: string;
  category: string | null;
  occurrence: string;
  order_correct: boolean;
  platform: string;
  action: string | null;
  message: string | null;
  prevention_1: string | null;
  prevention_2: string | null;
  sort_order?: number;
  is_active?: boolean;
  requires_subcategory?: boolean;
  subcategory_options?: string[] | null;
}

type Editable = Omit<Occurrence, "id" | "subcategory_options"> & {
  id?: string;
  subcategory_options_text?: string;
};

const CATEGORY_PRESETS = [
  "COZINHA",
  "MONTAGEM",
  "ESTOQUE",
  "LOGISTICA",
  "CLIENTE",
  "PAGAMENTO",
  "INFRAESTRUTURA",
];

const emptyForm: Editable = {
  code: "",
  category: "",
  occurrence: "",
  order_correct: true,
  platform: "iFood",
  action: "",
  message: "",
  prevention_1: "",
  prevention_2: "",
  sort_order: 0,
  is_active: true,
  requires_subcategory: false,
  subcategory_options_text: "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

export default function OccurrencesManagerDialog({ open, onOpenChange, onChanged }: Props) {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Editable>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("occurrences")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setItems((data ?? []) as Occurrence[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      load();
      setForm(emptyForm);
      setEditingId(null);
      setSearch("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.code, i.category, i.occurrence, i.action, i.message]
        .filter(Boolean)
        .some((v) => v!.toString().toLowerCase().includes(q)),
    );
  }, [items, search]);

  const startEdit = (o: Occurrence) => {
    setEditingId(o.id);
    setForm({
      code: o.code,
      category: o.category ?? "",
      occurrence: o.occurrence,
      order_correct: o.order_correct,
      platform: o.platform,
      action: o.action ?? "",
      message: o.message ?? "",
      prevention_1: [o.prevention_1, o.prevention_2].filter(Boolean).join("\n\n"),
      prevention_2: "",
      sort_order: o.sort_order ?? 0,
      is_active: o.is_active ?? true,
      requires_subcategory: o.requires_subcategory ?? false,
      subcategory_options_text: (o.subcategory_options ?? []).join("\n"),
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.occurrence.trim()) {
      toast({ title: "Preencha a ocorrência", variant: "destructive" });
      return;
    }
    setSaving(true);
    const autoCode = form.code?.trim() || `OC-${Date.now().toString(36).toUpperCase()}`;
    const subOpts = (form.subcategory_options_text ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      code: autoCode,
      category: form.category?.trim() || null,
      occurrence: form.occurrence.trim(),
      order_correct: form.order_correct,
      platform: form.platform.trim() || "iFood",
      action: form.action?.trim() || null,
      message: form.message?.trim() || null,
      prevention_1: form.prevention_1?.trim() || null,
      prevention_2: form.prevention_2?.trim() || null,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active ?? true,
      requires_subcategory: !!form.requires_subcategory && subOpts.length > 0,
      subcategory_options: subOpts.length > 0 ? subOpts : null,
    };
    const { error } = editingId
      ? await supabase.from("occurrences").update(payload).eq("id", editingId)
      : await supabase.from("occurrences").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Ocorrência atualizada" : "Ocorrência criada" });
    resetForm();
    await load();
    onChanged?.();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta ocorrência? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("occurrences").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ocorrência excluída" });
    if (editingId === id) resetForm();
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>Gerenciar ocorrências</DialogTitle>
          <DialogDescription>
            Crie, edite e exclua os scripts de atendimento. As alterações ficam disponíveis na consulta imediatamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-0 flex-1 min-h-0 border-t">
          {/* Lista */}
          <div className="flex flex-col min-h-0 border-r">
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loading && (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">Nenhuma ocorrência.</div>
                )}
                {filtered.map((o) => (
                  <div
                    key={o.id}
                    className={`group flex items-start gap-2 rounded-md p-2 hover:bg-muted/60 cursor-pointer ${editingId === o.id ? "bg-muted" : ""}`}
                    onClick={() => startEdit(o)}
                  >
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${o.order_correct ? "bg-primary" : "bg-destructive"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{o.occurrence}</div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); startEdit(o); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); remove(o.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Formulário */}
          <ScrollArea className="min-h-0">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {editingId ? "Editar ocorrência" : "Nova ocorrência"}
                </div>
                {editingId && (
                  <Button size="sm" variant="ghost" onClick={resetForm}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                )}
              </div>
              <div>
                <Label>Ocorrência</Label>
                <Input value={form.occurrence} onChange={(e) => setForm({ ...form, occurrence: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={form.order_correct} onCheckedChange={(v) => setForm({ ...form, order_correct: v })} />
                  <Label className="text-sm">Pedido correto</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label className="text-sm">Ativo</Label>
                </div>
              </div>
              <div>
                <Label>Ação a tomar</Label>
                <Textarea rows={3} value={form.action ?? ""} onChange={(e) => setForm({ ...form, action: e.target.value })} />
              </div>
              <div>
                <Label>Mensagem para o cliente</Label>
                <Textarea rows={4} value={form.message ?? ""} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <div>
                <Label>Como prevenir</Label>
                <Textarea
                  rows={4}
                  value={form.prevention_1 ?? ""}
                  onChange={(e) => setForm({ ...form, prevention_1: e.target.value, prevention_2: "" })}
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="p-4 border-t">
          {editingId && (
            <Button variant="destructive" onClick={() => editingId && remove(editingId)} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {editingId ? "Salvar alterações" : "Criar ocorrência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
