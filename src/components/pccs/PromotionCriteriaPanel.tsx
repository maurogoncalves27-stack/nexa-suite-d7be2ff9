import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Trash2, ClipboardCheck, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

type Criteria = {
  id: string;
  position_id: string;
  promotion_type: "level" | "vertical" | "level";
  min_months_in_role: number;
  min_evaluation_score: number;
  min_attendance_pct: number;
  no_warnings_months: number;
  require_training_completion: boolean;
  require_pdi_completion: boolean;
  notes: string | null;
};

export default function PromotionCriteriaPanel() {
  const { positions } = usePositions(true);
  const [rows, setRows] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Criteria | null>(null);
  const [form, setForm] = useState<Omit<Criteria, "id">>({
    position_id: "", promotion_type: "level",
    min_months_in_role: 12, min_evaluation_score: 80, min_attendance_pct: 95,
    no_warnings_months: 6, require_training_completion: true, require_pdi_completion: false, notes: null,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("promotion_criteria").select("*");
    setRows((data ?? []) as Criteria[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p.name])), [positions]);
  const byPosition = useMemo(() => {
    const m = new Map<string, Criteria[]>();
    rows.forEach((r) => {
      const arr = m.get(r.position_id) ?? [];
      arr.push(r);
      m.set(r.position_id, arr);
    });
    return m;
  }, [rows]);

  const openEdit = (c: Criteria) => {
    setEditing(c);
    setForm({ ...c });
    setOpen(true);
  };
  const openNew = () => {
    setEditing(null);
    setForm({
      position_id: "", promotion_type: "level",
      min_months_in_role: 12, min_evaluation_score: 80, min_attendance_pct: 95,
      no_warnings_months: 6, require_training_completion: true, require_pdi_completion: false, notes: null,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.position_id) return toast({ title: "Selecione o cargo.", variant: "destructive" });
    setSaving(true);
    const { error } = editing
      ? await supabase.from("promotion_criteria").update(form).eq("id", editing.id)
      : await supabase.from("promotion_criteria").insert(form);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: editing ? "Critério atualizado" : "Critério criado" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este critério?")) return;
    const { error } = await supabase.from("promotion_criteria").delete().eq("id", id);
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
          Regras que um colaborador precisa cumprir para ser considerado elegível a uma promoção.
        </p>
        <Button size="sm" onClick={openNew}><ClipboardCheck className="h-4 w-4 mr-1" />Novo critério</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from(byPosition.entries()).map(([pid, list]) => (
          <Card key={pid}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{posById.get(pid) ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {list.map((c) => (
                <div key={c.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Progressão por nível
                    </Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    <li>≥ {c.min_months_in_role} meses no nível atual</li>
                    <li>Avaliação ≥ {c.min_evaluation_score}%</li>
                    <li>Frequência ≥ {c.min_attendance_pct}%</li>
                    <li>Sem advertência há {c.no_warnings_months} meses</li>
                    {c.require_training_completion && <li>Treinamentos obrigatórios concluídos</li>}
                    {c.require_pdi_completion && <li>PDI concluído</li>}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {byPosition.size === 0 && (
          <p className="text-sm text-muted-foreground italic col-span-full">Nenhum critério cadastrado.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar critério" : "Novo critério"}</DialogTitle></DialogHeader>
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Meses mínimos no nível</Label>
                <Input type="number" value={form.min_months_in_role} onChange={(e) => setForm({ ...form, min_months_in_role: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Nota mín. avaliação (%)</Label>
                <Input type="number" value={form.min_evaluation_score} onChange={(e) => setForm({ ...form, min_evaluation_score: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Frequência mínima (%)</Label>
                <Input type="number" value={form.min_attendance_pct} onChange={(e) => setForm({ ...form, min_attendance_pct: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Meses sem advertência</Label>
                <Input type="number" value={form.no_warnings_months} onChange={(e) => setForm({ ...form, no_warnings_months: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.require_training_completion} onCheckedChange={(v) => setForm({ ...form, require_training_completion: v })} />
              <Label>Exige treinamentos concluídos</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.require_pdi_completion} onCheckedChange={(v) => setForm({ ...form, require_pdi_completion: v })} />
              <Label>Exige PDI concluído</Label>
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
