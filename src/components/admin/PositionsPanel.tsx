import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { usePositions, type Position } from "@/hooks/usePositions";
import CboSelect from "@/components/admin/CboSelect";

export default function PositionsPanel() {
  const { positions, loading, reload } = usePositions(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<{
    name: string;
    sort_order: number;
    is_active: boolean;
    cbo_code: string | null;
    cbo_title: string | null;
  }>({ name: "", sort_order: 0, is_active: true, cbo_code: null, cbo_title: null });
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      sort_order: positions.length ? Math.max(...positions.map((p) => p.sort_order)) + 1 : 1,
      is_active: true,
      cbo_code: null,
      cbo_title: null,
    });
    setOpen(true);
  };

  const openEdit = (p: Position) => {
    setEditing(p);
    setForm({
      name: p.name,
      sort_order: p.sort_order,
      is_active: p.is_active,
      cbo_code: p.cbo_code ?? null,
      cbo_title: p.cbo_title ?? null,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome do cargo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
      cbo_code: form.cbo_code,
      cbo_title: form.cbo_title,
    };
    const { error } = editing
      ? await supabase.from("positions").update(payload).eq("id", editing.id)
      : await supabase.from("positions").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Cargo atualizado" : "Cargo cadastrado" });
    setOpen(false);
    reload();
  };

  const toggleActive = async (p: Position) => {
    const { error } = await supabase
      .from("positions")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    reload();
  };

  const remove = async (p: Position) => {
    if (!confirm(`Excluir o cargo "${p.name}"?\nIsso pode afetar colaboradores que já o utilizam.`)) return;
    const { error } = await supabase.from("positions").delete().eq("id", p.id);
    if (error) {
      toast({
        title: "Não foi possível excluir",
        description: error.message + " — considere apenas desativar.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Cargo excluído" });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Lista oficial de cargos. Usada em colaboradores, uniformes, bônus, responsabilidades, etc.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo cargo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cargo" : "Novo cargo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome do cargo</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Auxiliar de Cozinha"
                />
              </div>
              <div>
                <Label>CBO (Classificação Brasileira de Ocupações)</Label>
                <CboSelect
                  value={form.cbo_code}
                  onChange={(code, title) =>
                    setForm({ ...form, cbo_code: code, cbo_title: title })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional — usado para emissão de contratos, eSocial e relatórios.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label className="cursor-pointer">Ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhum cargo cadastrado.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {positions.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className={`${!p.is_active ? "text-muted-foreground line-through" : ""}`}>
                      {p.name}
                    </div>
                    {p.cbo_code && (
                      <Badge variant="outline" className="mt-1 text-xs font-mono">
                        CBO {p.cbo_code}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {p.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={() => toggleActive(p)}
                      aria-label={p.is_active ? "Desativar cargo" : "Ativar cargo"}
                      title={p.is_active ? "Desativar cargo" : "Ativar cargo"}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
