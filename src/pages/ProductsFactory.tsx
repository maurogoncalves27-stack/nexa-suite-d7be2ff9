import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Search, Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT", "RL"];
const CATEGORIES = ["AÇOUGUE", "HORTIFRUTI", "MERCEARIA", "PORCIONADOS", "EMBALAGENS", "LIMPEZA", "OUTROS"];
const TYPES = [
  { value: "insumo", label: "Insumo" },
  { value: "produzido", label: "Produzido (saída de ficha)" },
  { value: "embalagem", label: "Embalagem" },
] as const;

interface Product {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  product_type: string;
  is_internal: boolean;
  is_active: boolean;
  average_cost: number;
}

interface Draft {
  name: string;
  category: string;
  unit: string;
  product_type: "insumo" | "produzido" | "embalagem";
  is_internal: boolean;
  is_active: boolean;
}

const empty: Draft = {
  name: "",
  category: "PORCIONADOS",
  unit: "UN",
  product_type: "insumo",
  is_internal: false,
  is_active: true,
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ProductsFactory = () => {
  const { canReceive } = useInventoryPermission();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("inventory_products")
      .select("id, name, category, unit, product_type, is_internal, is_active, average_cost")
      .eq("factory_only", true)
      .order("category")
      .order("name");
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== "all" && (p.category ?? "") !== catFilter) return false;
      if (kindFilter === "produzidos" && p.product_type !== "produzido") return false;
      if (kindFilter === "insumos" && p.product_type === "produzido") return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, catFilter, kindFilter]);

  const handleNew = () => {
    setEditing(null);
    setDraft(empty);
    setOpen(true);
  };

  const handleEdit = (p: Product) => {
    setEditing(p);
    setDraft({
      name: p.name,
      category: p.category ?? "PORCIONADOS",
      unit: p.unit,
      product_type: (p.product_type as Draft["product_type"]) ?? "insumo",
      is_internal: p.is_internal,
      is_active: p.is_active,
    });
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
        product_type: draft.product_type,
        is_internal: draft.product_type === "produzido" ? true : draft.is_internal,
        is_active: draft.is_active,
        factory_only: true,
      };
      const { error } = editing
        ? await supabase.from("inventory_products").update(payload).eq("id", editing.id)
        : await supabase.from("inventory_products").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Produto atualizado" : "Produto cadastrado");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product, value: boolean) => {
    const { error } = await supabase.from("inventory_products").update({ is_active: value }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, is_active: value } : x)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Layers className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Produtos da Fábrica
        </h1>
        <p className="text-muted-foreground">Insumos usados pela fábrica e itens que ela produz. Base exclusiva dos selects das fichas técnicas da fábrica.</p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="insumos">Insumos / Embalagens</SelectItem>
                  <SelectItem value="produzidos">Produzidos pela fábrica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canReceive && (
              <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" /> Novo produto</Button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-center">Ativo</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="secondary">{p.category ?? "—"}</Badge></TableCell>
                      <TableCell>
                        {p.product_type === "produzido" ? (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Produzido</Badge>
                        ) : p.product_type === "embalagem" ? (
                          <Badge variant="outline">Embalagem</Badge>
                        ) : (
                          <Badge variant="outline">Insumo</Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.unit}</TableCell>
                      <TableCell className="text-right">{fmtBRL(Number(p.average_cost || 0))}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p, v)} disabled={!canReceive} />
                      </TableCell>
                      <TableCell>
                        {canReceive && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto da Fábrica"}</DialogTitle></DialogHeader>
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
            <div>
              <Label>Tipo</Label>
              <Select value={draft.product_type} onValueChange={(v) => setDraft({ ...draft, product_type: v as Draft["product_type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label>Ativo</Label>
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
    </div>
  );
};

export default ProductsFactory;
