import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Utensils, Plus, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";

const UNITS = ["UN", "KG", "G", "L", "ML", "PCT", "PORCAO"];
const CATEGORIES = ["PORCIONADOS", "MOLHOS", "PRE-PREPARO", "OUTROS"];

interface Item {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  is_active: boolean;
  average_cost: number;
}

interface Draft {
  name: string;
  category: string;
  unit: string;
  is_active: boolean;
}

const empty: Draft = { name: "", category: "PORCIONADOS", unit: "UN", is_active: true };

const FactoryMenu = () => {
  const { canReceive } = useInventoryPermission();
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "on" | "off">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_products")
      .select("id, name, category, unit, is_active, average_cost")
      .contains("usage_roles", ["venda_fabrica"])
      .order("category")
      .order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (r: Item, value: boolean) => {
    setSavingId(r.id);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: value } : x)));
    const { error } = await supabase.from("inventory_products").update({ is_active: value }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !value } : x)));
      return;
    }
    toast.success(value ? "No cardápio" : "Fora do cardápio");
  };

  const handleNew = () => { setEditing(null); setDraft(empty); setOpen(true); };
  const handleEdit = (r: Item) => {
    setEditing(r);
    setDraft({ name: r.name, category: r.category ?? "PORCIONADOS", unit: r.unit, is_active: r.is_active });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        category: draft.category,
        unit: draft.unit,
        is_active: draft.is_active,
        product_type: "produzido",
        is_internal: true,
        factory_only: true,
        stock_scope: "factory_and_store",
        usage_roles: ["venda_fabrica", "insumo_montagem"],
        production_flow: "produzido_fabrica",
      };
      const { error } = editing
        ? await supabase.from("inventory_products").update(payload).eq("id", editing.id)
        : await supabase.from("inventory_products").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Item atualizado" : "Item adicionado ao cardápio");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Soft-remove: retira do cardápio convertendo em pré-preparo/insumo interno.
    // Evita quebrar FKs (contagens, fichas, transferências) e preserva histórico.
    const { error } = await supabase
      .from("inventory_products")
      .update({ product_type: "insumo", is_internal: true })
      .eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido do cardápio");
    setDeleteTarget(null);
    load();
  };


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "on" && !r.is_active) return false;
      if (status === "off" && r.is_active) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [rows, search, status]);

  const totalOn = rows.filter((r) => r.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Utensils className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Cardápio da Fábrica
          </h1>
          <p className="text-muted-foreground">
            Itens que a fábrica produz. Desmarcar retira do cardápio sem excluir o cadastro.
          </p>
        </div>
        {canReceive && (
          <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" /> Novo item</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as "all" | "on" | "off")}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="on">No cardápio</SelectItem>
                <SelectItem value="off">Fora do cardápio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{totalOn} de {rows.length} itens no cardápio</p>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item encontrado.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">{r.category ?? "—"}</Badge>
                      <span>Unidade: {r.unit}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {savingId === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => toggle(r, v)}
                      disabled={!canReceive || savingId === r.id}
                    />
                    {canReceive && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item do cardápio"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Categoria</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label>No cardápio</Label>
              <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{deleteTarget?.name}” do cardápio?</AlertDialogTitle>
            <AlertDialogDescription>
              O item sai do Cardápio da Fábrica e passa a valer como pré-preparo/insumo interno. O cadastro, o histórico e as fichas técnicas que o utilizam permanecem intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FactoryMenu;
