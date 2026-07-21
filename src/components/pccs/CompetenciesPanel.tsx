import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Award, Brain, Wrench } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

type Comp = {
  id: string;
  position_id: string;
  name: string;
  competency_type: "technical" | "behavioral";
  is_required: boolean;
  order_index: number;
};

export default function CompetenciesPanel() {
  const { positions } = usePositions(true);
  const [rows, setRows] = useState<Comp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ position_id: string; name: string; competency_type: "technical" | "behavioral"; is_required: boolean }>({
    position_id: "", name: "", competency_type: "technical", is_required: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("position_competencies")
      .select("*")
      .order("order_index", { ascending: true });
    setRows((data ?? []) as Comp[]);
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
    setForm({ position_id: positionId ?? "", name: "", competency_type: "technical", is_required: true });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.position_id || !form.name.trim()) {
      toast({ title: "Preencha cargo e nome.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const max = rows.filter((r) => r.position_id === form.position_id).reduce((m, r) => Math.max(m, r.order_index), 0);
    const { error } = await supabase.from("position_competencies").insert({
      position_id: form.position_id,
      name: form.name.trim(),
      competency_type: form.competency_type,
      is_required: form.is_required,
      order_index: max + 1,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Competência adicionada" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta competência?")) return;
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
          Competências técnicas e comportamentais exigidas por cargo. Base para o PDI e critérios de promoção.
        </p>
        <Button size="sm" onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" />Nova competência</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {positions.map((p) => {
          const b = grouped.get(p.id);
          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" />
                    {p.name}
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => openNew(p.id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <Section
                  title="Técnicas" icon={<Wrench className="h-3.5 w-3.5" />}
                  items={b?.technical ?? []} onRemove={remove}
                />
                <Section
                  title="Comportamentais" icon={<Brain className="h-3.5 w-3.5" />}
                  items={b?.behavioral ?? []} onRemove={remove}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova competência</DialogTitle></DialogHeader>
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
              <Label>Tipo</Label>
              <div className="flex gap-2">
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
                  <Brain className="h-4 w-4 mr-1" />Comportamental
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
              <Label>Obrigatória para promoção</Label>
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

function Section({ title, icon, items, onRemove }: { title: string; icon: React.ReactNode; items: Comp[]; onRemove: (id: string) => void }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase mb-1">
        {icon}{title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((c) => (
            <Badge key={c.id} variant={c.is_required ? "default" : "secondary"} className="gap-1">
              {c.name}
              <button onClick={() => onRemove(c.id)} className="ml-1 opacity-70 hover:opacity-100">×</button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
