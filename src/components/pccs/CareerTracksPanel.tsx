import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ArrowDown, Route } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

type Step = {
  id: string;
  track_name: string;
  from_position_id: string | null;
  to_position_id: string;
  order_index: number;
  notes: string | null;
};

export default function CareerTracksPanel() {
  const { positions } = usePositions(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ track_name: string; from_position_id: string; to_position_id: string; notes: string }>({
    track_name: "", from_position_id: "", to_position_id: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("career_track_steps")
      .select("*")
      .order("track_name", { ascending: true })
      .order("order_index", { ascending: true });
    setSteps((data ?? []) as Step[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p.name])), [positions]);

  const tracks = useMemo(() => {
    const m = new Map<string, Step[]>();
    steps.forEach((s) => {
      const arr = m.get(s.track_name) ?? [];
      arr.push(s);
      m.set(s.track_name, arr);
    });
    return Array.from(m.entries()).map(([name, list]) => ({
      name,
      steps: list.sort((a, b) => a.order_index - b.order_index),
    }));
  }, [steps]);

  const openNew = (trackName?: string) => {
    setForm({ track_name: trackName ?? "", from_position_id: "", to_position_id: "", notes: "" });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.track_name.trim() || !form.to_position_id) {
      toast({ title: "Trilha e cargo destino são obrigatórios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const max = steps.filter((s) => s.track_name === form.track_name.trim()).reduce((m, s) => Math.max(m, s.order_index), 0);
    const { error } = await supabase.from("career_track_steps").insert({
      track_name: form.track_name.trim(),
      from_position_id: form.from_position_id || null,
      to_position_id: form.to_position_id,
      order_index: max + 1,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Passo adicionado" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este passo da trilha?")) return;
    const { error } = await supabase.from("career_track_steps").delete().eq("id", id);
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
          Caminhos possíveis de crescimento. Um colaborador pode seguir mais de uma trilha.
        </p>
        <Button size="sm" onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" />Novo passo</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tracks.map((t) => (
          <Card key={t.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  {t.name}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => openNew(t.name)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1">
                {t.steps.map((s, i) => (
                  <div key={s.id}>
                    {i === 0 && s.from_position_id && (
                      <div className="text-xs font-medium py-1 px-2 rounded bg-muted">
                        {posById.get(s.from_position_id) ?? "?"}
                      </div>
                    )}
                    {i === 0 && !s.from_position_id && (
                      <div className="text-xs italic text-muted-foreground py-1 px-2">Início da trilha</div>
                    )}
                    <div className="flex justify-center py-0.5"><ArrowDown className="h-3.5 w-3.5 text-muted-foreground" /></div>
                    <div className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-primary/5 border border-primary/20">
                      <span className="text-sm font-medium">{posById.get(s.to_position_id) ?? "?"}</span>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {tracks.length === 0 && (
          <p className="text-sm text-muted-foreground italic col-span-full">Nenhuma trilha cadastrada.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo passo de trilha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da trilha</Label>
              <Input value={form.track_name} onChange={(e) => setForm({ ...form, track_name: e.target.value })} placeholder="Ex.: Cozinha → Gestão" />
            </div>
            <div>
              <Label>De (cargo atual — opcional se for o início)</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.from_position_id}
                onChange={(e) => setForm({ ...form, from_position_id: e.target.value })}
              >
                <option value="">— início —</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Para (próximo cargo)</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.to_position_id}
                onChange={(e) => setForm({ ...form, to_position_id: e.target.value })}
              >
                <option value="">Selecione…</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
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
