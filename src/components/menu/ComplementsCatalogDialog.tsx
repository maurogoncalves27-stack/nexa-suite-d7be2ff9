import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmt } from "@/lib/saiposMenu";

interface Group {
  id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  is_active: boolean;
  sort_order: number;
}
interface Option {
  id: string;
  group_id: string;
  name: string;
  extra_price: number;
  is_active: boolean;
  sort_order: number;
  linked_item_id: string | null;
}

interface ComplementsCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ComplementsCatalogDialog({
  open,
  onOpenChange,
}: ComplementsCatalogDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState<{
    name: string;
    min: number;
    max: number;
    required: boolean;
  }>({ name: "", min: 0, max: 1, required: false });

  async function load() {
    setLoading(true);
    const [g, o, l] = await Promise.all([
      (supabase as any).from("complement_groups").select("*").order("name"),
      (supabase as any).from("complement_options").select("*").order("sort_order"),
      (supabase as any).from("menu_item_complement_links").select("group_id"),
    ]);
    setGroups((g.data ?? []) as Group[]);
    setOptions((o.data ?? []) as Option[]);
    const u: Record<string, number> = {};
    for (const row of (l.data ?? []) as any[]) {
      u[row.group_id] = (u[row.group_id] ?? 0) + 1;
    }
    setUsage(u);
    setLoading(false);
  }

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return groups.filter((g) => !s || g.name.toLowerCase().includes(s));
  }, [groups, search]);

  function toggleOpen(id: string) {
    setOpenIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function toggleGroupActive(g: Group) {
    const { error } = await (supabase as any)
      .from("complement_groups")
      .update({ is_active: !g.is_active })
      .eq("id", g.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: g.is_active ? "Grupo pausado" : "Grupo ativado",
      description: "Reflete em todos os pratos.",
    });
    load();
  }

  async function toggleOptionActive(o: Option) {
    const { error } = await (supabase as any)
      .from("complement_options")
      .update({ is_active: !o.is_active })
      .eq("id", o.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  }

  async function deleteGroup(g: Group) {
    const n = usage[g.id] ?? 0;
    if (n > 0) {
      if (
        !confirm(
          `Este grupo está vinculado a ${n} prato(s). Excluir vai REMOVER em todos eles. Confirmar?`
        )
      )
        return;
    } else if (!confirm("Excluir este grupo?")) return;
    const { error } = await (supabase as any)
      .from("complement_groups")
      .delete()
      .eq("id", g.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Grupo excluído" });
    load();
  }

  async function deleteOption(o: Option) {
    if (!confirm("Excluir esta opção?")) return;
    const { error } = await (supabase as any)
      .from("complement_options")
      .delete()
      .eq("id", o.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  }

  function openNew() {
    setEditing(null);
    setForm({ name: "", min: 0, max: 1, required: false });
    setEditorOpen(true);
  }
  function openEdit(g: Group) {
    setEditing(g);
    setForm({ name: g.name, min: g.min_choices, max: g.max_choices, required: g.is_required });
    setEditorOpen(true);
  }

  async function saveGroup() {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      min_choices: Number(form.min) || 0,
      max_choices: Number(form.max) || 1,
      is_required: form.required,
    };
    if (editing) {
      const { error } = await (supabase as any)
        .from("complement_groups")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await (supabase as any).from("complement_groups").insert(payload);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
    }
    setEditorOpen(false);
    load();
  }

  async function addOption(groupId: string) {
    const name = prompt("Nome da opção:");
    if (!name) return;
    const priceStr = prompt("Preço extra (R$, 0 para grátis):", "0");
    const extra = Number((priceStr ?? "0").replace(",", ".")) || 0;
    const { error } = await (supabase as any).from("complement_options").insert({
      group_id: groupId,
      name: name.trim(),
      extra_price: extra,
      sort_order: 0,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setOpenIds((p) => new Set(p).add(groupId));
    load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0">
        <div className="space-y-6 p-6">
          <DialogHeader className="px-0 pt-0">
            <DialogTitle className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              Catálogo de complementos
            </DialogTitle>
            <p className="text-muted-foreground text-sm">
              Grupos reutilizáveis. Pausar aqui pausa em todos os pratos que usam.
            </p>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar grupo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo grupo
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum grupo cadastrado. Crie seu primeiro grupo (ex: "Acompanhamentos", "Adicionais").
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((g) => {
                const opts = options.filter((o) => o.group_id === g.id);
                const isOpen = openIds.has(g.id);
                const used = usage[g.id] ?? 0;
                return (
                  <Card key={g.id} className={!g.is_active ? "opacity-60" : ""}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Button size="icon" variant="ghost" onClick={() => toggleOpen(g.id)}>
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium truncate">{g.name}</span>
                              {g.is_required && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Obrigatório
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                {g.min_choices}–{g.max_choices}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {opts.length} opções
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Usado em {used} prato{used === 1 ? "" : "s"}
                              </Badge>
                              {!g.is_active && (
                                <Badge variant="outline" className="text-[10px]">
                                  Pausado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <Button size="sm" variant="ghost" onClick={() => toggleGroupActive(g)}>
                            {g.is_active ? "Pausar" : "Ativar"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                            Editar
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteGroup(g)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="pl-10 space-y-1.5">
                          {opts.length === 0 && (
                            <p className="text-xs text-muted-foreground">Sem opções ainda.</p>
                          )}
                          {opts.map((o) => (
                            <div
                              key={o.id}
                              className={`flex items-center gap-2 text-sm py-1 ${!o.is_active ? "opacity-60" : ""}`}
                            >
                              <Switch
                                checked={o.is_active}
                                onCheckedChange={() => toggleOptionActive(o)}
                              />
                              <span className="flex-1 truncate">{o.name}</span>
                              {Number(o.extra_price) > 0 && (
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  +{fmt(Number(o.extra_price))}
                                </span>
                              )}
                              {!o.is_active && (
                                <Badge variant="outline" className="text-[10px]">
                                  Pausado
                                </Badge>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => deleteOption(o)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addOption(g.id)}
                            className="gap-1 mt-1"
                          >
                            <Plus className="h-3 w-3" /> Adicionar opção
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar grupo" : "Novo grupo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Acompanhamentos"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Mínimo</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.min}
                    onChange={(e) =>
                      setForm({ ...form, min: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Máximo</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.max}
                    onChange={(e) =>
                      setForm({ ...form, max: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.required}
                  onCheckedChange={(v) => setForm({ ...form, required: v })}
                />
                Obrigatório escolher
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveGroup}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
