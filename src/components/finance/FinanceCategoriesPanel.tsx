import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Tags } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DRE_GROUP_OPTIONS, DRE_GROUP_LABELS, type DreGroup } from "@/lib/dre";

export interface FinanceCategory {
  id: string;
  name: string;
  kind: "expense" | "income" | "both";
  is_active: boolean;
  sort_order: number;
  dre_group: DreGroup | null;
  subgroup: string | null;
}

const kindLabel: Record<FinanceCategory["kind"], string> = {
  expense: "Despesa",
  income: "Receita",
  both: "Ambos",
};

interface Props {
  onChanged?: () => void;
}

export default function FinanceCategoriesPanel({ onChanged }: Props) {
  const [items, setItems] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<FinanceCategory> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("finance_categories")
      .select("*")
      .order("kind").order("sort_order").order("name");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setItems((data ?? []) as FinanceCategory[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name || !editing?.kind) {
      toast({ title: "Nome e tipo são obrigatórios", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const payload = {
      name: editing.name,
      kind: editing.kind,
      is_active: editing.is_active ?? true,
      sort_order: editing.sort_order ?? 0,
      dre_group: editing.dre_group ?? null,
      subgroup: editing.subgroup?.trim() || null,
    };
    const { error } = editing.id
      ? await supabase.from("finance_categories").update(payload).eq("id", editing.id)
      : await supabase.from("finance_categories").insert(payload);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Categoria atualizada" : "Categoria criada" });
    setEditing(null);
    await load();
    onChanged?.();
  };

  const expenses = items.filter((i) => i.kind === "expense" || i.kind === "both");
  const incomes = items.filter((i) => i.kind === "income" || i.kind === "both");

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Tags className="h-4 w-4" /> Categorias</h3>
            <p className="text-sm text-muted-foreground">Categorize despesas e receitas para relatórios consistentes.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({ kind: "expense", is_active: true, sort_order: 0 })}>
            <Plus className="h-4 w-4 mr-1" /> Nova categoria
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { title: "Despesas", list: expenses, color: "text-rose-500" },
              { title: "Receitas", list: incomes, color: "text-emerald-600" },
            ].map(({ title, list, color }) => {
              const grouped = list.reduce<Record<string, FinanceCategory[]>>((acc, c) => {
                const k = c.subgroup || "Sem subgrupo";
                (acc[k] ??= []).push(c);
                return acc;
              }, {});
              const subgroupNames = Object.keys(grouped).sort((a, b) => {
                if (a === "Sem subgrupo") return 1;
                if (b === "Sem subgrupo") return -1;
                return a.localeCompare(b, "pt-BR");
              });
              return (
                <div key={title}>
                  <h4 className={`text-sm font-medium mb-2 ${color}`}>{title}</h4>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma categoria.</p>
                  ) : (
                    <div className="space-y-3">
                      {subgroupNames.map((sg) => (
                        <div key={sg}>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 font-medium">{sg}</p>
                          <div className="space-y-1">
                            {grouped[sg].map((c) => (
                              <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-sm truncate">{c.name}</span>
                                  {!c.is_active && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                                  {c.dre_group ? (
                                    <Badge variant="secondary" className="text-[10px]">{DRE_GROUP_LABELS[c.dre_group]}</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Sem grupo DRE</Badge>
                                  )}
                                </div>
                                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditing(c)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !submitting && !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editing?.kind ?? "expense"}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as FinanceCategory["kind"] })}
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Grupo DRE</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editing?.dre_group ?? ""}
                onChange={(e) => setEditing({ ...editing, dre_group: (e.target.value || null) as DreGroup | null })}
              >
                <option value="">— Sem grupo —</option>
                {DRE_GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Define em qual linha da DRE essa categoria entra.</p>
            </div>
            <div className="space-y-1">
              <Label>Subgrupo</Label>
              <Input
                placeholder="Ex: Despesas Administrativas"
                value={editing?.subgroup ?? ""}
                onChange={(e) => setEditing({ ...editing, subgroup: e.target.value })}
                list="finance-subgroups"
              />
              <datalist id="finance-subgroups">
                {Array.from(new Set(items.map((i) => i.subgroup).filter(Boolean) as string[])).map((sg) => (
                  <option key={sg} value={sg} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">Agrupa categorias na listagem (livre).</p>
            </div>
            <div className="space-y-1">
              <Label>Ordem</Label>
              <Input type="number" value={editing?.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing?.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              Ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={save} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
