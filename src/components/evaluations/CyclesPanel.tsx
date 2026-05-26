import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Cycle } from "@/pages/Evaluations";

interface Props {
  cycles: Cycle[];
  onChange: () => void;
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmt = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

type Periodicity = "weekly" | "monthly" | "biannual" | "custom";

const computeEnd = (startISO: string, period: Periodicity): string => {
  if (!startISO || period === "custom") return "";
  const [y, m, d] = startISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (period === "weekly") date.setDate(date.getDate() + 6);
  else if (period === "monthly") { date.setMonth(date.getMonth() + 1); date.setDate(date.getDate() - 1); }
  else if (period === "biannual") { date.setMonth(date.getMonth() + 6); date.setDate(date.getDate() - 1); }
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

export default function CyclesPanel({ cycles, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [notes, setNotes] = useState("");
  const [bonusPerPoint, setBonusPerPoint] = useState("0");
  const [periodicity, setPeriodicity] = useState<Periodicity>("monthly");

  const reset = () => {
    setEditing(null);
    setName(""); setStart(""); setEnd(""); setStatus("open"); setNotes(""); setBonusPerPoint("0");
    setPeriodicity("monthly");
  };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (c: Cycle) => {
    setEditing(c);
    setName(c.name); setStart(c.start_date); setEnd(c.end_date);
    setStatus(c.status); setNotes(c.notes ?? "");
    setBonusPerPoint(String(c.bonus_value_per_point ?? 0));
    const p = c.periodicity === "semiannual" ? "biannual" : (c.periodicity ?? "custom");
    setPeriodicity(p as Periodicity);
    setOpen(true);
  };

  const onPeriodicityChange = (p: Periodicity) => {
    setPeriodicity(p);
    if (p !== "custom" && start) setEnd(computeEnd(start, p));
  };
  const onStartChange = (v: string) => {
    setStart(v);
    if (periodicity !== "custom") setEnd(computeEnd(v, periodicity));
  };

  const save = async () => {
    if (!name.trim() || !start || !end) {
      toast({ title: "Preencha nome, início e fim", variant: "destructive" }); return;
    }
    const bpp = Number(bonusPerPoint);
    if (isNaN(bpp) || bpp < 0) {
      toast({ title: "Valor por ponto inválido", variant: "destructive" }); return;
    }
    setSaving(true);
    const dbPeriodicity =
      periodicity === "weekly" ? "weekly"
      : periodicity === "monthly" ? "monthly"
      : periodicity === "biannual" ? "semiannual"
      : "weekly"; // custom → padrão semanal
    const payload = {
      name: name.trim(),
      start_date: start,
      end_date: end,
      status,
      notes: notes.trim() || null,
      bonus_value_per_point: bpp,
      periodicity: dbPeriodicity,
    };
    const { error } = editing
      ? await supabase.from("evaluation_cycles").update(payload).eq("id", editing.id)
      : await supabase.from("evaluation_cycles").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Ciclo atualizado" : "Ciclo criado" });
    setOpen(false);
    onChange();
  };

  const remove = async (c: Cycle) => {
    if (!confirm(`Excluir o ciclo "${c.name}"? Todas as avaliações deste ciclo serão removidas.`)) return;
    const { error } = await supabase.from("evaluation_cycles").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ciclo excluído" });
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo ciclo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar ciclo" : "Novo ciclo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome*</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: 1º Tri 2026" />
              </div>
              <div className="space-y-2">
                <Label>Periodicidade*</Label>
                <Select value={periodicity} onValueChange={(v) => onPeriodicityChange(v as Periodicity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal (7 dias)</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="biannual">Semestral (6 meses)</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {periodicity !== "custom" && (
                  <p className="text-xs text-muted-foreground">
                    A data de fim será calculada automaticamente a partir da data de início.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Início*</Label>
                  <Input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim*</Label>
                  <Input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    disabled={periodicity !== "custom"}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "open" | "closed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="closed">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor por ponto de infração (R$)</Label>
                <Input type="number" min="0" step="0.01" value={bonusPerPoint} onChange={(e) => setBonusPerPoint(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Cada ponto de peso de infração no período descontará este valor do bônus do colaborador.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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

      {cycles.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum ciclo cadastrado.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40">R$/ponto infração</TableHead>
              <TableHead className="text-right w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cycles.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{fmt(c.start_date)} — {fmt(c.end_date)}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "open" ? "default" : "secondary"}>
                    {c.status === "open" ? "Aberto" : "Fechado"}
                  </Badge>
                </TableCell>
                <TableCell>{money(Number(c.bonus_value_per_point ?? 0))}</TableCell>
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
      )}
    </div>
  );
}
