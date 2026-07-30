import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Award, Brain, Wrench, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";
import { DEFAULT_SCALE, REQUIRED_MULTIPLIER, scaleColorClass } from "@/lib/competencyEvaluation";

type Comp = {
  id: string;
  position_id: string;
  name: string;
  description: string | null;
  competency_type: "technical" | "behavioral";
  is_required: boolean;
  weight: number;
  order_index: number;
  level_descriptors: Record<string, string> | null;
};

type Form = {
  position_id: string;
  name: string;
  description: string;
  competency_type: "technical" | "behavioral";
  is_required: boolean;
  weight: number;
  level_descriptors: Record<string, string>;
};

const emptyForm = (position_id = ""): Form => ({
  position_id, name: "", description: "", competency_type: "technical",
  is_required: true, weight: 1, level_descriptors: {},
});

export default function CompetenciesPanel() {
  const { positions } = usePositions(true);
  const [rows, setRows] = useState<Comp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Comp | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("position_competencies")
      .select("*")
      .order("order_index", { ascending: true });
    setRows((data ?? []) as unknown as Comp[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, { technical: Comp[]; behavioral: Comp[] }>();
    rows.forEach((c) => {
      const bucket = m.get(c.position_id) ?? { technical: [], behavioral: [] };
      bucket[c.competency_type].push(c);
      m.set(c.position_id, bucket);
    });
    return m;
  }, [rows]);

  const openNew = (positionId?: string) => {
    setEditing(null);
    setForm(emptyForm(positionId ?? ""));
    setOpen(true);
  };

  const openEdit = (c: Comp) => {
    setEditing(c);
    setForm({
      position_id: c.position_id,
      name: c.name,
      description: c.description ?? "",
      competency_type: c.competency_type,
      is_required: c.is_required,
      weight: Number(c.weight ?? 1),
      level_descriptors: c.level_descriptors ?? {},
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.position_id || !form.name.trim()) {
      toast({ title: "Preencha cargo e nome.", variant: "destructive" });
      return;
    }
    if (!(form.weight > 0)) {
      toast({ title: "Peso inválido", description: "Use um número maior que 0.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      position_id: form.position_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      competency_type: form.competency_type,
      is_required: form.is_required,
      weight: form.weight,
      level_descriptors: form.level_descriptors,
    };
    const max = rows.filter((r) => r.position_id === form.position_id).reduce((m, r) => Math.max(m, r.order_index), 0);
    const { error } = editing
      ? await supabase.from("position_competencies").update(payload).eq("id", editing.id)
      : await supabase.from("position_competencies").insert({ ...payload, order_index: max + 1 });
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: editing ? "Competência atualizada" : "Competência adicionada" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta competência? As notas já lançadas nela também serão apagadas.")) return;
    const { error } = await supabase.from("position_competencies").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Competências técnicas e comportamentais exigidas por cargo. São exatamente estes itens que o gestor avalia na escala 1 a 5 —
          obrigatórias pesam {REQUIRED_MULTIPLIER}x na nota final.
        </p>
        <Button size="sm" onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" />Nova competência</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {positions.map((p) => {
          const b = grouped.get(p.id);
          const total = (b?.technical.length ?? 0) + (b?.behavioral.length ?? 0);
          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" />
                    {p.name}
                    <Badge variant="outline" className="text-[10px]">{total}</Badge>
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => openNew(p.id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <Section title="Técnicas" icon={<Wrench className="h-3.5 w-3.5" />} items={b?.technical ?? []} onEdit={openEdit} onRemove={remove} />
                <Section title="Comportamentais" icon={<Brain className="h-3.5 w-3.5" />} items={b?.behavioral ?? []} onEdit={openEdit} onRemove={remove} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar competência" : "Nova competência"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cargo</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.position_id}
                onChange={(e) => setForm({ ...form, position_id: e.target.value })}
              >
                <option value="">Selecione…</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Liderança" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="O que se espera nesta competência" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <div className="flex gap-2 mt-1">
                  <Button
                    type="button" variant={form.competency_type === "technical" ? "default" : "outline"} size="sm"
                    onClick={() => setForm({ ...form, competency_type: "technical" })}
                  >
                    <Wrench className="h-4 w-4 mr-1" />Técnica
                  </Button>
                  <Button
                    type="button" variant={form.competency_type === "behavioral" ? "default" : "outline"} size="sm"
                    onClick={() => setForm({ ...form, competency_type: "behavioral" })}
                  >
                    <Brain className="h-4 w-4 mr-1" />Comport.
                  </Button>
                </div>
              </div>
              <div>
                <Label>Peso</Label>
                <Input
                  type="number" min={0.5} step={0.5} value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
              <Label>Obrigatória para promoção (peso x{REQUIRED_MULTIPLIER})</Label>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs uppercase text-muted-foreground">Descritores por nível (opcional)</Label>
              {DEFAULT_SCALE.map((lvl) => (
                <div key={lvl.score} className="flex items-start gap-2">
                  <Badge variant="outline" className={`mt-1 shrink-0 ${scaleColorClass(lvl.score)}`}>{lvl.score}</Badge>
                  <Input
                    placeholder={lvl.description ?? lvl.label}
                    value={form.level_descriptors[String(lvl.score)] ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      level_descriptors: { ...form.level_descriptors, [String(lvl.score)]: e.target.value },
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title, icon, items, onEdit, onRemove,
}: {
  title: string; icon: React.ReactNode; items: Comp[];
  onEdit: (c: Comp) => void; onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase mb-1">
        {icon}{title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">—</p>
      ) : (
        <div className="space-y-1">
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate flex items-center gap-1.5">
                  {c.name}
                  {c.is_required && <Badge variant="secondary" className="text-[10px]">Obrig.</Badge>}
                  <span className="text-[10px] text-muted-foreground">peso {Number(c.weight ?? 1)}</span>
                </div>
                {c.description && <div className="text-[11px] text-muted-foreground truncate">{c.description}</div>}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onEdit(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onRemove(c.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
