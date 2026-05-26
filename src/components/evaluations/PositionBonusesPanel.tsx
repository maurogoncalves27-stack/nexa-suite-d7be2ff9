import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Plus, Trash2, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

interface PositionBonus {
  id: string;
  position_id: string;
  position: string; // nome espelhado (mantido por compatibilidade/legado)
  bonus_amount: number;
}

const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PositionBonusesPanel() {
  const { positions } = usePositions();
  const [rows, setRows] = useState<PositionBonus[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PositionBonus | null>(null);
  const [positionId, setPositionId] = useState("");
  const [bonus, setBonus] = useState("0");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: pb, error: pbe } = await supabase
      .from("position_bonuses")
      .select("id, position_id, position, bonus_amount")
      .order("position");
    if (pbe) toast({ title: "Erro", description: pbe.message, variant: "destructive" });
    setRows((pb ?? []) as PositionBonus[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const configuredSet = useMemo(() => new Set(rows.map((r) => r.position_id)), [rows]);
  const availablePositions = useMemo(
    () => editing
      ? positions.filter((p) => p.id === editing.position_id || !configuredSet.has(p.id))
      : positions.filter((p) => !configuredSet.has(p.id)),
    [positions, configuredSet, editing],
  );
  const missingPositions = useMemo(
    () => positions.filter((p) => !configuredSet.has(p.id)).map((p) => p.name),
    [positions, configuredSet],
  );

  const reset = () => { setEditing(null); setPositionId(""); setBonus("0"); };

  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (r: PositionBonus) => {
    setEditing(r);
    setPositionId(r.position_id);
    setBonus(String(r.bonus_amount));
    setOpen(true);
  };

  const save = async () => {
    if (!positionId) {
      toast({ title: "Selecione um cargo", variant: "destructive" }); return;
    }
    const v = Number(bonus);
    if (isNaN(v) || v < 0) {
      toast({ title: "Valor inválido", variant: "destructive" }); return;
    }
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) {
      toast({ title: "Cargo inválido", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      position_id: positionId,
      position: pos.name, // espelha o nome oficial
      bonus_amount: v,
    };
    const { error } = editing
      ? await supabase.from("position_bonuses").update(payload).eq("id", editing.id)
      : await supabase.from("position_bonuses").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Cargo atualizado" : "Cargo cadastrado" });
    setOpen(false);
    reset();
    load();
  };

  const remove = async (r: PositionBonus) => {
    if (!confirm(`Remover bônus do cargo "${r.position}"?`)) return;
    const { error } = await supabase.from("position_bonuses").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removido" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Briefcase className="h-4 w-4" />
          Defina o valor padrão de bônus para cada cargo CBO oficial.
        </p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar bônus do cargo" : "Cadastrar bônus por cargo"}</DialogTitle>
              <DialogDescription>
                Selecione um cargo da lista oficial. Para adicionar novos cargos, use Configurações → Cargos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Cargo (CBO oficial)</Label>
                <Select value={positionId} onValueChange={setPositionId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cargo" /></SelectTrigger>
                  <SelectContent>
                    {availablePositions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.cbo_code ? `[${p.cbo_code}] ${p.name}` : p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor do bônus (R$)</Label>
                <Input type="number" min="0" step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum cargo configurado ainda.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cargo</TableHead>
              <TableHead className="w-40">Bônus padrão</TableHead>
              <TableHead className="text-right w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const pos = positions.find((p) => p.id === r.position_id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{pos?.name ?? r.position}</div>
                    {pos?.cbo_code && (
                      <div className="text-xs text-muted-foreground font-mono">
                        CBO {pos.cbo_code}{pos.cbo_title ? ` · ${pos.cbo_title}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{money(Number(r.bonus_amount))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {missingPositions.length > 0 && (
        <div className="text-xs text-muted-foreground border-t pt-3">
          Cargos sem valor definido: {missingPositions.join(", ")}
        </div>
      )}
    </div>
  );
}
