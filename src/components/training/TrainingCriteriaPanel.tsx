import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { TrainingCriterion } from "@/pages/Trainings";

interface Props {
  criteria: TrainingCriterion[];
  onChange: () => void;
}

export default function TrainingCriteriaPanel({ criteria, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingCriterion | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("1");
  const [isActive, setIsActive] = useState(true);

  const reset = () => {
    setEditing(null);
    setName(""); setDescription(""); setWeight("1"); setIsActive(true);
  };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (c: TrainingCriterion) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setWeight(String(c.weight));
    setIsActive(c.is_active);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const w = Number(weight);
    if (isNaN(w) || w <= 0) {
      toast({ title: "Peso inválido", description: "Use um número maior que 0", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null, weight: w, is_active: isActive };
    const { error } = editing
      ? await supabase.from("training_criteria").update(payload).eq("id", editing.id)
      : await supabase.from("training_criteria").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Critério atualizado" : "Critério criado" });
    setOpen(false);
    onChange();
  };

  const remove = async (c: TrainingCriterion) => {
    if (!confirm(`Excluir o critério "${c.name}"? Avaliações que usam este critério serão afetadas — prefira desativá-lo.`)) return;
    const { error } = await supabase.from("training_criteria").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Critério excluído" });
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Defina os critérios usados nas avaliações diárias dos 7 dias de treinamento.
        </p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4" /> Novo critério</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar critério" : "Novo critério de treinamento"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome*</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pontualidade, Aprendizado, Postura" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Peso*</Label>
                  <Input type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ativo</Label>
                  <div className="h-10 flex items-center">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {criteria.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum critério cadastrado.</div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {criteria.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                    )}
                  </div>
                  <Badge variant={c.is_active ? "default" : "secondary"} className="shrink-0">
                    {c.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Peso: <span className="font-medium text-foreground">{c.weight}</span></div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-24">Peso</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="text-right w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteria.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell>{c.weight}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
