import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SEVERITY_OPTIONS, severityBadgeClass, severityLabel, type Severity } from "@/lib/severity";

export interface InfractionType {
  id: string;
  name: string;
  description: string | null;
  default_weight: number;
  is_active: boolean;
  severity: Severity;
  default_suspension_weeks: number;
}

interface Props {
  onChange?: () => void;
}

export default function InfractionTypesPanel({ onChange }: Props) {
  const [items, setItems] = useState<InfractionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InfractionType | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("1");
  const [active, setActive] = useState(true);
  const [severity, setSeverity] = useState<Severity>("low");
  const [suspensionWeeks, setSuspensionWeeks] = useState("0");

  const [usage, setUsage] = useState<Record<string, { count: number; weight: number }>>({});

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: occs }] = await Promise.all([
      supabase.from("infraction_types").select("*").order("name"),
      supabase.from("employee_infractions").select("infraction_type_id, applied_weight"),
    ]);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((data ?? []) as InfractionType[]);
    const map: Record<string, { count: number; weight: number }> = {};
    (occs ?? []).forEach((o: any) => {
      const cur = map[o.infraction_type_id] ?? { count: 0, weight: 0 };
      cur.count += 1;
      cur.weight += Number(o.applied_weight);
      map[o.infraction_type_id] = cur;
    });
    setUsage(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditing(null);
    setName(""); setDescription(""); setWeight("1"); setActive(true);
    setSeverity("low"); setSuspensionWeeks("0");
  };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (it: InfractionType) => {
    setEditing(it);
    setName(it.name);
    setDescription(it.description ?? "");
    setWeight(String(it.default_weight));
    setActive(it.is_active);
    setSeverity((it.severity ?? "low") as Severity);
    setSuspensionWeeks(String(it.default_suspension_weeks ?? 0));
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    const w = Number(weight);
    if (isNaN(w) || w <= 0) { toast({ title: "Peso inválido", description: "Deve ser maior que zero", variant: "destructive" }); return; }
    const sw = Number(suspensionWeeks);
    if (!Number.isFinite(sw) || sw < 0) { toast({ title: "Semanas de suspensão inválidas", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      default_weight: w,
      is_active: active,
      severity,
      default_suspension_weeks: Math.floor(sw),
    };
    const { error } = editing
      ? await supabase.from("infraction_types").update(payload).eq("id", editing.id)
      : await supabase.from("infraction_types").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Infração atualizada" : "Infração criada" });
    setOpen(false);
    load();
    onChange?.();
  };

  const remove = async (it: InfractionType) => {
    if (!confirm(`Excluir "${it.name}"? Ocorrências já registradas com este tipo serão afetadas.`)) return;
    const { error } = await supabase.from("infraction_types").delete().eq("id", it.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Infração excluída" });
    load();
    onChange?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Nova infração</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar infração" : "Nova infração"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome*</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atraso, Falta sem justificativa" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-2">
                  <Label>Gravidade*</Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor*</Label>
                  <Input type="number" min="0.1" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Suspensão da bonificação (semanas)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={suspensionWeeks}
                  onChange={(e) => setSuspensionWeeks(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Quantas semanas o colaborador fica sem receber bonificação ao registrar esta infração. Use <strong>0</strong> para não suspender. Ex.: <strong>2</strong> para faltas (semana atual + a próxima).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>Ativa</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Infrações <strong>gravíssimas</strong> também permitem ajustar o período de suspensão em cada ocorrência.
              </p>
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

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhuma infração cadastrada.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">Tipos cadastrados</div>
              <div className="text-2xl font-semibold">{items.length}</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">Tipos ativos</div>
              <div className="text-2xl font-semibold">{items.filter((i) => i.is_active).length}</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">Total de ocorrências</div>
              <div className="text-2xl font-semibold">{Object.values(usage).reduce((a, b) => a + b.count, 0)}</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">Pontos acumulados</div>
              <div className="text-2xl font-semibold text-destructive">
                {Object.values(usage).reduce((a, b) => a + b.weight, 0).toFixed(1)}
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-32">Gravidade</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24">Valor</TableHead>
                <TableHead className="w-24">Suspensão</TableHead>
                <TableHead className="w-28">Ocorrências</TableHead>
                <TableHead className="w-32">Pontos acumulados</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="text-right w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const u = usage[it.id] ?? { count: 0, weight: 0 };
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell>
                      <Badge className={severityBadgeClass(it.severity)}>{severityLabel(it.severity)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{it.description ?? "—"}</TableCell>
                    <TableCell>{Number(it.default_weight).toFixed(1)}</TableCell>
                    <TableCell>
                      {it.default_suspension_weeks > 0
                        ? <span className="text-destructive font-medium">{it.default_suspension_weeks} sem.</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell>{u.count}</TableCell>
                    <TableCell className={u.weight > 0 ? "font-semibold text-destructive" : ""}>
                      {u.weight.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={it.is_active ? "default" : "secondary"}>
                        {it.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(it)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(it)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
