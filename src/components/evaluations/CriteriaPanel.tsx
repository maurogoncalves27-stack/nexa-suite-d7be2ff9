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
import type { Criterion } from "@/pages/Evaluations";

interface Props {
  criteria: Criterion[];
  onChange: () => void;
}

export default function CriteriaPanel({ criteria, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Criterion | null>(null);
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
  const openEdit = (c: Criterion) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setWeight(String(c.weight));
    setIsActive(c.is_active);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" }); return;
    }
    const w = Number(weight);
    if (isNaN(w) || w <= 0) {
      toast({ title: "Peso inválido", description: "Use um número maior que 0", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      weight: w,
      is_active: isActive,
    };
    const { error } = editing
      ? await supabase.from("evaluation_criteria").update(payload).eq("id", editing.id)
      : await supabase.from("evaluation_criteria").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" }); return;
    }
    toast({ title: editing ? "Critério atualizado" : "Critério criado" });
    setOpen(false);
    onChange();
  };

  const remove = async (c: Criterion) => {
    if (!confirm(`Excluir o critério "${c.name}"? Avaliações já lançadas que usam este critério não podem ser excluídas — desative em vez disso.`)) return;
    const { error } = await supabase.from("evaluation_criteria").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Critério excluído" });
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo critério</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar critério" : "Novo critério"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome*</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pontualidade" />
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
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.name}
                    {c.is_auto && (
                      <Badge variant="outline" className="text-[10px]">automático</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                <TableCell>{c.weight}</TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} disabled={c.is_auto}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c)} disabled={c.is_auto}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
