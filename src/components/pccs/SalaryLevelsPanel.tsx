import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

type Level = {
  id: string;
  position_id: string;
  level: string;
  salary: number;
  order_index: number;
};

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function SalaryLevelsPanel() {
  const { positions } = usePositions(true);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Level | null>(null);
  const [form, setForm] = useState<{ position_id: string; level: string; salary: string; order_index: number }>({
    position_id: "", level: "I", salary: "", order_index: 1,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("position_salary_levels")
      .select("*")
      .order("order_index", { ascending: true });
    setLevels((data ?? []) as Level[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byPosition = useMemo(() => {
    const m = new Map<string, Level[]>();
    levels.forEach((l) => {
      const arr = m.get(l.position_id) ?? [];
      arr.push(l);
      m.set(l.position_id, arr);
    });
    return m;
  }, [levels]);

  const openNew = (positionId?: string) => {
    setEditing(null);
    setForm({ position_id: positionId ?? "", level: "I", salary: "", order_index: 1 });
    setOpen(true);
  };
  const openEdit = (l: Level) => {
    setEditing(l);
    setForm({ position_id: l.position_id, level: l.level, salary: String(l.salary), order_index: l.order_index });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.position_id || !form.level.trim() || !form.salary) {
      toast({ title: "Preencha cargo, nível e salário.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      position_id: form.position_id,
      level: form.level.trim(),
      salary: Number(form.salary.replace(",", ".")),
      order_index: form.order_index,
    };
    const { error } = editing
      ? await supabase.from("position_salary_levels").update(payload).eq("id", editing.id)
      : await supabase.from("position_salary_levels").insert(payload);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: editing ? "Nível atualizado" : "Nível criado" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este nível salarial?")) return;
    const { error } = await supabase.from("position_salary_levels").delete().eq("id", id);
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
          Faixas salariais por cargo. Progressão horizontal (mesmo cargo) segue estes níveis.
        </p>
        <Button size="sm" onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" />Novo nível</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {positions.map((p) => {
          const items = (byPosition.get(p.id) ?? []).sort((a, b) => a.order_index - b.order_index);
          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    {p.name}
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => openNew(p.id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem faixas cadastradas.</p>
                ) : (
                  <div className="space-y-1">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">{l.level}</Badge>
                          <span className="font-medium">{BRL(l.salary)}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar nível" : "Novo nível salarial"}</DialogTitle></DialogHeader>
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
                <Label>Nível</Label>
                <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="I, II, III…" />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Salário (R$)</Label>
              <Input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="0,00" />
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
