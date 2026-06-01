import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";

interface Responsibility {
  id: string;
  position: string;
  responsibility: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export default function PositionResponsibilitiesPanel() {
  const { user } = useAuth();
  const { positions } = usePositions();
  const [items, setItems] = useState<Responsibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    position: "",
    responsibility: "",
    sort_order: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("position_responsibilities")
      .select("*")
      .order("position", { ascending: true })
      .order("sort_order", { ascending: true });
    setItems((data ?? []) as Responsibility[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const cboByPosition = useMemo(() => {
    const m = new Map<string, { code: string | null; title: string | null }>();
    positions.forEach((p) =>
      m.set(p.name.trim().toLowerCase(), {
        code: p.cbo_code ?? null,
        title: p.cbo_title ?? null,
      }),
    );
    return {
      get: (name: string) => m.get((name ?? "").trim().toLowerCase()),
    };
  }, [positions]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.position === filter);
  }, [items, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Responsibility[]>();
    filtered.forEach((r) => {
      if (!map.has(r.position)) map.set(r.position, []);
      map.get(r.position)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);


  const openNew = () => {
    setEditingId(null);
    setForm({
      position: filter !== "all" ? filter : positions[0]?.name ?? "",
      responsibility: "",
      sort_order: 0,
      is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (r: Responsibility) => {
    setEditingId(r.id);
    setForm({
      position: r.position,
      responsibility: r.responsibility,
      sort_order: r.sort_order,
      is_active: r.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.position) {
      toast({ title: "Selecione o cargo", variant: "destructive" });
      return;
    }
    if (!form.responsibility.trim()) {
      toast({ title: "Descreva a responsabilidade", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      position: form.position,
      responsibility: form.responsibility.trim(),
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
      created_by: user?.id ?? null,
    };
    const { error } = editingId
      ? await supabase
          .from("position_responsibilities")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("position_responsibilities").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Atualizado" : "Adicionado" });
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta responsabilidade?")) return;
    const { error } = await supabase
      .from("position_responsibilities")
      .delete()
      .eq("id", id);
    if (error) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Excluído" });
    load();
  };

  const toggleActive = async (r: Responsibility) => {
    const { error } = await supabase
      .from("position_responsibilities")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Filtrar por cargo:</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cargos</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.cbo_code ? `${p.cbo_code} · ` : ""}
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nova responsabilidade

            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar responsabilidade" : "Nova responsabilidade"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Cargo</Label>
                <Select
                  value={form.position}
                  onValueChange={(v) => setForm({ ...form, position: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cargo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.cbo_code ? `${p.cbo_code} · ` : ""}
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>

                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Para adicionar/editar cargos, vá em Área do Gestor → Cargos.
                </p>
              </div>
              <div>
                <Label>Responsabilidade / Função</Label>
                <Textarea
                  rows={3}
                  value={form.responsibility}
                  onChange={(e) =>
                    setForm({ ...form, responsibility: e.target.value })
                  }
                  placeholder="Ex: Conferir caixa no início e fim do turno"
                />
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
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma responsabilidade cadastrada{" "}
            {filter !== "all" ? `para o cargo "${filter}"` : "ainda"}.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {grouped.map(([position, list]) => (
            <AccordionItem
              key={position}
              value={position}
              className="border rounded-lg bg-card overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 min-w-0 flex-1 text-left flex-wrap">
                  <Briefcase className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-semibold text-sm md:text-base truncate">
                    {position}
                  </span>
                  {cboByPosition.get(position)?.code ? (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] shrink-0"
                      title={cboByPosition.get(position)?.title ?? undefined}
                    >
                      CBO {cboByPosition.get(position)!.code}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      isento de CBO
                    </Badge>
                  )}
                  <Badge variant="outline" className="ml-auto mr-2 shrink-0">
                    {list.length}
                  </Badge>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-3 pb-3">
                <ul className="space-y-2">
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-md border bg-background p-3 space-y-2"
                    >
                      <p
                        className={`text-sm whitespace-pre-wrap break-words ${
                          !r.is_active ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        {r.responsibility}
                      </p>
                      <div className="flex items-center justify-between gap-2 border-t pt-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.is_active}
                            onCheckedChange={() => toggleActive(r)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {r.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => remove(r.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
