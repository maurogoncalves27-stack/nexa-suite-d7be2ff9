import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Siren, Camera, Copy, ChevronUp, ChevronDown, Users,
} from "lucide-react";

interface Group { id: string; name: string; sort_order: number }
interface Item {
  id?: string;
  label: string;
  description: string;
  is_priority: boolean;
  requires_photo: boolean;
  sort_order?: number;
}
interface Template {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  deadline_time: string | null;
  weekdays: number[] | null;
  sort_order: number;
  checklist_items: Item[];
  template_access_groups: { group_id: string; access_groups: { name: string } | null }[];
}

const WEEKDAY_KEYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function AdminTemplatesPanel() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([
    { label: "", description: "", is_priority: false, requires_photo: false },
  ]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deadlineTime, setDeadlineTime] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);

  useEffect(() => { loadTemplates(); loadGroups(); }, []);

  const loadGroups = async () => {
    const { data } = await supabase
      .from("access_groups")
      .select("id, name, sort_order")
      .order("sort_order");
    if (data) setGroups(data as Group[]);
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from("checklist_templates")
      .select(
        "id, title, description, is_active, deadline_time, weekdays, sort_order, checklist_items(id, label, description, sort_order, is_priority, requires_photo), template_access_groups(group_id, access_groups(name))",
      )
      .order("sort_order");
    if (data) setTemplates(data as unknown as Template[]);
  };

  const resetForm = () => {
    setTitle(""); setDescription("");
    setItems([{ label: "", description: "", is_priority: false, requires_photo: false }]);
    setSelectedGroups([]); setEditingId(null); setDeadlineTime(""); setSelectedWeekdays([]);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (tp: Template) => {
    setEditingId(tp.id); setTitle(tp.title); setDescription(tp.description || "");
    setDeadlineTime(tp.deadline_time ? tp.deadline_time.slice(0, 5) : "");
    setItems(
      [...tp.checklist_items]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i) => ({
          label: i.label, description: i.description || "",
          is_priority: i.is_priority, requires_photo: i.requires_photo,
        })),
    );
    setSelectedGroups(tp.template_access_groups.map((tag) => tag.group_id));
    setSelectedWeekdays(tp.weekdays || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !title.trim()) return;
    setSaving(true);
    const validItems = items.filter((i) => i.label.trim());
    if (validItems.length === 0) {
      toast.error("Adicione ao menos um item"); setSaving(false); return;
    }
    if (selectedGroups.length === 0) {
      toast.error("Selecione ao menos um grupo de acesso"); setSaving(false); return;
    }

    if (editingId) {
      const { error } = await supabase.from("checklist_templates").update({
        title: title.trim(),
        description: description.trim() || null,
        deadline_time: deadlineTime || null,
        weekdays: selectedWeekdays.length > 0 ? selectedWeekdays : null,
      }).eq("id", editingId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await supabase.from("checklist_items").delete().eq("template_id", editingId);
      await supabase.from("checklist_items").insert(validItems.map((item, i) => ({
        template_id: editingId, label: item.label.trim(),
        description: item.description.trim() || null, sort_order: i,
        is_priority: item.is_priority, requires_photo: item.requires_photo,
      })));
      await supabase.from("template_access_groups").delete().eq("template_id", editingId);
      await supabase.from("template_access_groups").insert(
        selectedGroups.map((gid) => ({ template_id: editingId, group_id: gid })),
      );
      toast.success("Template atualizado");
    } else {
      const { data: tmpl, error } = await supabase.from("checklist_templates").insert({
        title: title.trim(),
        description: description.trim() || null,
        created_by: user.id,
        deadline_time: deadlineTime || null,
        weekdays: selectedWeekdays.length > 0 ? selectedWeekdays : null,
      }).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }

      await supabase.from("checklist_items").insert(validItems.map((item, i) => ({
        template_id: tmpl.id, label: item.label.trim(),
        description: item.description.trim() || null, sort_order: i,
        is_priority: item.is_priority, requires_photo: item.requires_photo,
      })));
      await supabase.from("template_access_groups").insert(
        selectedGroups.map((gid) => ({ template_id: tmpl.id, group_id: gid })),
      );
      toast.success("Template criado");
    }
    setDialogOpen(false); resetForm(); loadTemplates(); setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("checklist_templates").update({ is_active: !current }).eq("id", id);
    loadTemplates();
    toast.success(!current ? "Ativado" : "Desativado");
  };
  const deleteTemplate = async (id: string) => {
    if (!confirm("Excluir este checklist? Esta ação remove respostas associadas.")) return;
    await supabase.from("checklist_templates").delete().eq("id", id);
    loadTemplates(); toast.success("Excluído");
  };
  const duplicateTemplate = async (tp: Template) => {
    if (!user) return;
    const { data: tmpl, error } = await supabase.from("checklist_templates").insert({
      title: `${tp.title} (cópia)`, description: tp.description, created_by: user.id,
      deadline_time: tp.deadline_time, weekdays: tp.weekdays,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const sortedItems = [...tp.checklist_items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    if (sortedItems.length > 0) {
      await supabase.from("checklist_items").insert(sortedItems.map((item, i) => ({
        template_id: tmpl.id, label: item.label, description: item.description,
        sort_order: i, is_priority: item.is_priority, requires_photo: item.requires_photo,
      })));
    }
    const groupIds = tp.template_access_groups.map((tag) => tag.group_id);
    if (groupIds.length > 0) {
      await supabase.from("template_access_groups").insert(
        groupIds.map((gid) => ({ template_id: tmpl.id, group_id: gid })),
      );
    }
    loadTemplates(); toast.success("Duplicado");
  };

  // Agrupa templates por grupo de acesso (um template pode aparecer em múltiplos grupos)
  const templatesByGroup = (() => {
    const map = new Map<string, { groupId: string | null; groupName: string; sortOrder: number; templates: Template[] }>();
    for (const tp of templates) {
      if (!tp.template_access_groups || tp.template_access_groups.length === 0) {
        const key = "__none__";
        if (!map.has(key)) map.set(key, { groupId: null, groupName: "Sem grupo", sortOrder: 99999, templates: [] });
        map.get(key)!.templates.push(tp);
      } else {
        for (const tag of tp.template_access_groups) {
          const key = tag.group_id;
          if (!map.has(key)) {
            const g = groups.find((gg) => gg.id === tag.group_id);
            map.set(key, {
              groupId: tag.group_id,
              groupName: tag.access_groups?.name || g?.name || "Grupo",
              sortOrder: g?.sort_order ?? 9999,
              templates: [],
            });
          }
          map.get(key)!.templates.push(tp);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  })();

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Check-list</h2>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum template criado ainda.
          </CardContent>
        </Card>
      ) : (
        <Accordion
          type="multiple"
          className="space-y-2"
        >
          {templatesByGroup.map((grp) => (
            <AccordionItem
              key={grp.groupId ?? "__none__"}
              value={grp.groupId ?? "__none__"}
              className="border rounded-lg bg-card px-3"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 text-left">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{grp.groupName}</span>
                  <Badge variant="secondary" className="ml-1">{grp.templates.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pb-2">
                  {grp.templates.map((tp) => (
                    <Card key={`${grp.groupId}-${tp.id}`}>
                      <CardHeader className="py-4 pb-2 space-y-3">
                        <div className="space-y-2 min-w-0 flex-1">
                          <CardTitle className="text-base break-words">{tp.title}</CardTitle>
                          {tp.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                              {tp.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {tp.template_access_groups?.map((tag) => (
                              <Badge key={tag.group_id} variant="outline" className="text-xs">
                                {tag.access_groups?.name}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {tp.checklist_items.length} itens
                            {tp.deadline_time && ` · prazo: ${tp.deadline_time.slice(0, 5)}`}
                            {tp.weekdays && tp.weekdays.length > 0 &&
                              ` · ${[...tp.weekdays].sort().map((d) => WEEKDAY_KEYS[d]).join(" ")}`}
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-1 border-t pt-2">
                          <Badge
                            className={tp.is_active ? "bg-success text-success-foreground cursor-pointer" : "cursor-pointer"}
                            variant={tp.is_active ? "default" : "secondary"}
                            onClick={() => toggleActive(tp.id, tp.is_active)}
                          >
                            {tp.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(tp)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => duplicateTemplate(tp)} title="Duplicar">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTemplate(tp.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-1">
                          {[...tp.checklist_items]
                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                            .map((item) => (
                              <div
                                key={item.id}
                                className={`text-sm flex items-center gap-2 ${
                                  item.is_priority ? "text-destructive font-semibold" : "text-muted-foreground"
                                }`}
                              >
                                {item.is_priority ? (
                                  <Siren className="h-3 w-3 text-destructive shrink-0" />
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                )}
                                {item.label}
                                {item.requires_photo && <Camera className="h-3 w-3 text-primary shrink-0" />}
                                {item.description && (
                                  <span className="text-xs text-muted-foreground font-normal ml-2">
                                    — {item.description}
                                  </span>
                                )}
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Abertura da loja" />
            </div>
            <div className="space-y-2">
              <Label>Prazo (horário limite)</Label>
              <Input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
              <p className="text-xs text-muted-foreground">Após esse horário o checklist aparece como expirado.</p>
            </div>
            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex gap-1">
                {WEEKDAY_KEYS.map((key, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={selectedWeekdays.includes(i) ? "default" : "outline"}
                    className="w-9 h-9 p-0 text-xs font-semibold"
                    title={WEEKDAY_FULL[i]}
                    onClick={() =>
                      setSelectedWeekdays((prev) =>
                        prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i],
                      )
                    }
                  >
                    {key}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Vazio = todos os dias.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Instruções gerais (opcional)" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Grupos de acesso</Label>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum grupo cadastrado. Crie grupos na aba Grupos.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedGroups.includes(g.id)}
                        onCheckedChange={() =>
                          setSelectedGroups((prev) =>
                            prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                          )
                        }
                      />
                      <span className="text-sm">{g.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Itens do checklist</Label>
              {items.map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <div className="flex flex-col shrink-0">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={i === 0}
                        onClick={() => {
                          const c = [...items];
                          [c[i - 1], c[i]] = [c[i], c[i - 1]];
                          setItems(c);
                        }}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={i === items.length - 1}
                        onClick={() => {
                          const c = [...items];
                          [c[i], c[i + 1]] = [c[i + 1], c[i]];
                          setItems(c);
                        }}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={item.label}
                      onChange={(e) => {
                        const c = [...items]; c[i] = { ...c[i], label: e.target.value }; setItems(c);
                      }}
                      placeholder={`Item ${i + 1}`}
                      className={item.is_priority ? "border-destructive" : ""}
                    />
                    <Button
                      variant="ghost" size="icon"
                      title={item.requires_photo ? "Remover foto obrigatória" : "Tornar foto obrigatória"}
                      onClick={() => {
                        const c = [...items];
                        c[i] = { ...c[i], requires_photo: !c[i].requires_photo };
                        setItems(c);
                      }}
                    >
                      <Camera className={`h-4 w-4 ${item.requires_photo ? "text-primary" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      title={item.is_priority ? "Remover prioridade" : "Marcar como prioridade"}
                      onClick={() => {
                        const c = [...items];
                        c[i] = { ...c[i], is_priority: !c[i].is_priority };
                        setItems(c);
                      }}
                    >
                      <Siren className={`h-4 w-4 ${item.is_priority ? "text-destructive" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    value={item.description}
                    onChange={(e) => {
                      const c = [...items]; c[i] = { ...c[i], description: e.target.value }; setItems(c);
                    }}
                    placeholder="Descrição (opcional)"
                    className="text-xs ml-7 w-[calc(100%-1.75rem)]"
                  />
                </div>
              ))}
              <Button
                variant="outline" size="sm" className="gap-2 w-full"
                onClick={() =>
                  setItems([...items, { label: "", description: "", is_priority: false, requires_photo: false }])
                }
              >
                <Plus className="h-3 w-3" /> Adicionar item
              </Button>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
