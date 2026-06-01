import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Eye, ShoppingBag, ArrowRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import QuotationItemComparison from "@/components/quotations/QuotationItemComparison";
import QuotationAwardPanel from "@/components/quotations/QuotationAwardPanel";

interface SuggestionRow {
  product_id: string;
  product_name: string;
  unit: string;
  category: string | null;
  total_stock: number;
  total_min: number;
  total_max: number;
  qty_to_buy: number;
  average_cost: number | null;
  estimated_cost: number;
}

interface Quotation {
  id: string; title: string; description: string | null;
  category_id: string | null; deadline: string; status: string;
  awarded_supplier_id: string | null;
  store_id: string | null;
}
interface Category { id: string; name: string; }
interface Product { id: string; name: string; unit: string; category: string | null; }
interface QItem { id?: string; product_id: string; description: string; quantity: string; unit: string; notes: string; approved_brands: string; sort_order: number; }
interface Bid {
  id: string; quotation_id: string; supplier_id: string; total_amount: number | null;
  delivery_days: number | null; payment_terms: string | null; submitted_at: string;
  suppliers: { legal_name: string; cnpj: string } | null;
}

const fmtMoney = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const statusBadge = (s: string) => {
  const map: Record<string, { label: string; variant: any }> = {
    draft: { label: "Rascunho", variant: "secondary" },
    open: { label: "Aberta", variant: "default" },
    closed: { label: "Encerrada", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
    awarded: { label: "Adjudicada", variant: "default" },
  };
  const c = map[s] ?? { label: s, variant: "outline" };
  return <Badge variant={c.variant}>{c.label}</Badge>;
};

export default function Quotations() {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<Quotation | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);

  // novo / editar (sem título e descrição: agora gerados auto)
  const [form, setForm] = useState({ category_id: "", deadline: "" });
  const [items, setItems] = useState<QItem[]>([{ product_id: "", description: "", quantity: "1", unit: "UN", notes: "", approved_brands: "", sort_order: 0 }]);
  const [saving, setSaving] = useState(false);

  // Novo produto rápido
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProdTargetIdx, setNewProdTargetIdx] = useState<number | null>(null);
  const [newProd, setNewProd] = useState({ name: "", unit: "UN", category: "" });
  const [savingProd, setSavingProd] = useState(false);

  // Sugestões automáticas de compra
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [suggLoading, setSuggLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [creatingFromSugg, setCreatingFromSugg] = useState(false);

  // Modal de revisão (sugeridos + manuais antes de criar)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<QItem[]>([]);
  const [reviewMeta, setReviewMeta] = useState({
    title: "",
    description: "Cotação gerada a partir das sugestões de compra.",
    category_id: "",
    deadline: "",
  });

  const loadSuggestions = async () => {
    setSuggLoading(true);
    const { data, error } = await supabase.rpc("suggest_purchases" as never);
    if (error) {
      toast({ title: "Erro ao carregar sugestões", description: error.message, variant: "destructive" });
    }
    setSuggestions((data as SuggestionRow[]) ?? []);
    setSuggLoading(false);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: qs }, { data: cs }, { data: ps }, { data: allCats }] = await Promise.all([
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("supplier_categories").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("inventory_products").select("id, name, unit, category, product_type").eq("is_active", true).not("product_type", "in", "(produzido,personalizado)").order("name"),
      supabase.from("inventory_products").select("category").eq("is_active", true).not("category", "is", null),
    ]);
    setQuotations((qs ?? []) as Quotation[]);
    setCategories((cs ?? []) as Category[]);
    setProducts((ps ?? []) as Product[]);
    const uniq = Array.from(new Set(((allCats ?? []) as { category: string | null }[])
      .map((r) => (r.category ?? "").trim())
      .filter((c) => c !== "")))
      .sort((a, b) => a.localeCompare(b));
    setProductCategories(uniq);
    setLoading(false);
  };
  useEffect(() => { load(); loadSuggestions(); }, []);

  const totalSelected = useMemo(
    () => suggestions.filter((r) => selected[r.product_id]),
    [suggestions, selected],
  );
  const totalEstimated = useMemo(
    () => totalSelected.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0),
    [totalSelected],
  );
  const allChecked = suggestions.length > 0 && suggestions.every((r) => selected[r.product_id]);

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) suggestions.forEach((r) => (next[r.product_id] = true));
    setSelected(next);
  };

  const openReviewFromSuggestions = () => {
    if (totalSelected.length === 0) {
      return toast({ title: "Selecione ao menos um item", variant: "destructive" });
    }
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);
    // formato datetime-local
    const pad = (n: number) => String(n).padStart(2, "0");
    const deadlineLocal = `${deadline.getFullYear()}-${pad(deadline.getMonth() + 1)}-${pad(deadline.getDate())}T${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`;

    setReviewItems(
      totalSelected.map((r, i) => ({
        product_id: r.product_id,
        description: r.product_name,
        quantity: String(Number(r.qty_to_buy.toFixed(4))),
        unit: r.unit || "UN",
        notes: "",
        approved_brands: "",
        sort_order: i,
      })),
    );
    setReviewMeta({
      title: `Reposição de estoque — ${new Date().toLocaleDateString("pt-BR")}`,
      description: "Cotação gerada a partir das sugestões de compra.",
      category_id: "",
      deadline: deadlineLocal,
    });
    setReviewOpen(true);
  };

  const addReviewItem = () =>
    setReviewItems((p) => [
      ...p,
      { product_id: "", description: "", quantity: "1", unit: "UN", notes: "", approved_brands: "", sort_order: p.length },
    ]);
  const removeReviewItem = (i: number) =>
    setReviewItems((p) => p.filter((_, idx) => idx !== i));
  const updateReviewItem = (i: number, patch: Partial<QItem>) =>
    setReviewItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const parseBrands = (s: string) =>
    s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

  const persistApprovedBrands = async (quotationId: string, sourceItems: QItem[]) => {
    const { data: createdItems } = await supabase
      .from("quotation_items")
      .select("id, sort_order, description")
      .eq("quotation_id", quotationId)
      .order("sort_order");
    if (!createdItems) return;
    const rows: { quotation_item_id: string; brand_name: string; is_preferred: boolean }[] = [];
    sourceItems.forEach((src) => {
      const brands = parseBrands(src.approved_brands || "");
      if (brands.length === 0) return;
      const match = createdItems.find((c: any) => c.sort_order === src.sort_order);
      if (!match) return;
      brands.forEach((b, idx) => {
        rows.push({ quotation_item_id: match.id, brand_name: b, is_preferred: idx === 0 });
      });
    });
    if (rows.length > 0) {
      await supabase.from("quotation_item_approved_brands").insert(rows);
    }
  };

  const confirmCreateFromReview = async () => {
    if (!reviewMeta.title.trim() || !reviewMeta.deadline) {
      return toast({ title: "Preencha título e prazo", variant: "destructive" });
    }
    const valid = reviewItems.filter(
      (it) => it.description.trim() && Number(it.quantity) > 0,
    );
    if (valid.length === 0) {
      return toast({ title: "Adicione ao menos um item válido", variant: "destructive" });
    }
    setCreatingFromSugg(true);
    const { data: q, error } = await supabase
      .from("quotations")
      .insert({
        title: reviewMeta.title.trim(),
        description: reviewMeta.description.trim() || null,
        category_id: reviewMeta.category_id || null,
        deadline: new Date(reviewMeta.deadline).toISOString(),
        status: "open",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !q) {
      setCreatingFromSugg(false);
      return toast({ title: "Erro", description: error?.message, variant: "destructive" });
    }

    const itemsPayload = valid.map((it, i) => ({
      quotation_id: q.id,
      description: it.description.trim(),
      quantity: Number(it.quantity),
      unit: it.unit.trim() || "UN",
      notes: it.notes.trim() || null,
      sort_order: i,
    }));
    const { error: itErr } = await supabase.from("quotation_items").insert(itemsPayload);
    if (!itErr) await persistApprovedBrands(q.id, valid);
    setCreatingFromSugg(false);
    if (itErr) return toast({ title: "Erro nos itens", description: itErr.message, variant: "destructive" });
    toast({ title: "Cotação criada", description: `${itemsPayload.length} item(ns) adicionados.` });
    setReviewOpen(false);
    setSelected({});
    load();
    loadSuggestions();
  };

  const openView = async (q: Quotation) => {
    setViewing(q);
    const { data } = await supabase
      .from("quotation_bids")
      .select("*, suppliers(legal_name, cnpj)")
      .eq("quotation_id", q.id)
      .order("total_amount", { ascending: true });
    setBids((data ?? []) as any);
  };

  const resetForm = () => {
    setForm({ category_id: "", deadline: "" });
    setItems([{ product_id: "", description: "", quantity: "1", unit: "UN", notes: "", approved_brands: "", sort_order: 0 }]);
  };

  const addItem = () => setItems((p) => [...p, { product_id: "", description: "", quantity: "1", unit: "UN", notes: "", approved_brands: "", sort_order: p.length }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<QItem>) =>
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const onPickProduct = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return updateItem(i, { product_id: "" });
    updateItem(i, { product_id: p.id, description: p.name, unit: p.unit || "UN" });
  };

  const openNewProduct = (idx: number) => {
    setNewProdTargetIdx(idx);
    const catName = categories.find((c) => c.id === form.category_id)?.name ?? "";
    setNewProd({ name: "", unit: "UN", category: catName });
    setNewProdOpen(true);
  };

  const createNewProduct = async () => {
    if (!newProd.name.trim()) {
      return toast({ title: "Informe o nome do produto", variant: "destructive" });
    }
    setSavingProd(true);
    const { data, error } = await supabase
      .from("inventory_products")
      .insert({
        name: newProd.name.trim(),
        unit: newProd.unit.trim() || "UN",
        category: newProd.category.trim() || null,
        is_active: true,
      })
      .select("id, name, unit, category")
      .single();
    setSavingProd(false);
    if (error || !data) {
      return toast({ title: "Erro ao criar produto", description: error?.message, variant: "destructive" });
    }
    setProducts((p) => [...p, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
    if (newProdTargetIdx != null) {
      onPickProduct(newProdTargetIdx, data.id);
    }
    setNewProdOpen(false);
    toast({ title: "Produto cadastrado" });
  };

  const create = async () => {
    if (!form.deadline) {
      return toast({ title: "Informe o prazo", variant: "destructive" });
    }
    const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      return toast({ title: "Adicione ao menos um produto", variant: "destructive" });
    }
    setSaving(true);
    const catName = categories.find((c) => c.id === form.category_id)?.name;
    const autoTitle = `Cotação${catName ? ` — ${catName}` : ""} — ${new Date().toLocaleDateString("pt-BR")}`;
    const { data: q, error } = await supabase
      .from("quotations")
      .insert({
        title: autoTitle,
        description: null,
        category_id: form.category_id || null,
        deadline: new Date(form.deadline).toISOString(),
        status: "open",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !q) {
      setSaving(false);
      return toast({ title: "Erro", description: error?.message, variant: "destructive" });
    }
    const validWithOrder = validItems.map((it, i) => ({ ...it, sort_order: i }));
    const { error: itErr } = await supabase.from("quotation_items").insert(
      validWithOrder.map((it) => ({
        quotation_id: q.id,
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unit: it.unit.trim() || "UN",
        notes: it.notes.trim() || null,
        sort_order: it.sort_order,
      }))
    );
    if (!itErr) await persistApprovedBrands(q.id, validWithOrder);
    setSaving(false);
    if (itErr) return toast({ title: "Erro nos itens", description: itErr.message, variant: "destructive" });
    toast({ title: "Cotação criada" });
    setCreateOpen(false); resetForm(); load();
  };

  const updateStatus = async (q: Quotation, status: string) => {
    const { error } = await supabase.from("quotations").update({ status }).eq("id", q.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Status atualizado" });
    setViewing(null); load();
  };

  // adjudicação por item agora é feita pelo QuotationAwardPanel


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">Cotações</h1>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova cotação
        </Button>
      </div>

      {/* Sugestões automáticas de compra */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-primary" /> Itens sugeridos para cotar
              </CardTitle>
              <CardDescription>
                Produtos com estoque abaixo do mínimo configurado, prontos para virar uma cotação.
                {" "}
                <Link to="/sugestao-compras" className="underline text-primary">Ver detalhes</Link>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={loadSuggestions} disabled={suggLoading}>
                <RefreshCw className={`h-4 w-4 ${suggLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                size="sm"
                onClick={openReviewFromSuggestions}
                disabled={totalSelected.length === 0}
              >
                Revisar e criar ({totalSelected.length}) <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {suggLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : suggestions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum item abaixo do mínimo no momento. Configure os mínimos no <Link to="/estoque" className="underline">Saldo de estoque</Link>.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
                    </TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">A comprar</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right">Estimativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((r) => (
                    <TableRow key={r.product_id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[r.product_id]}
                          onCheckedChange={(v) => setSelected((p) => ({ ...p, [r.product_id]: !!v }))}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.total_stock).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right">{Number(r.total_min).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {Number(r.qty_to_buy).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right">{fmtMoney(r.estimated_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="px-4 py-2 border-t text-xs text-muted-foreground flex justify-between">
              <span>{suggestions.length} item(ns) sugerido(s)</span>
              <span>Estimativa selecionada: <b>{fmtMoney(totalEstimated)}</b></span>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : quotations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma cotação cadastrada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.title}</TableCell>
                    <TableCell>{categories.find((c) => c.id === q.category_id)?.name ?? "—"}</TableCell>
                    <TableCell>{format(new Date(q.deadline), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell>{statusBadge(q.status)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openView(q)}>
                        <Eye className="h-4 w-4 mr-2" /> Propostas
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal criar */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Nova cotação</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-2 overflow-y-auto flex-1 min-h-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prazo*</Label>
                <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens para cotar</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Item</Button>
              </div>
              {(() => {
                const catName = categories.find((c) => c.id === form.category_id)?.name?.toLowerCase() ?? "";
                const filtered = catName
                  ? products.filter((p) => (p.category ?? "").toLowerCase().includes(catName))
                  : products;
                const list = filtered.length > 0 ? filtered : products;
                return (
                  <div className="space-y-2">
                    {items.map((it, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-start border rounded-md p-2">
                        <div className="col-span-12 sm:col-span-7 flex gap-1">
                          <Select value={it.product_id} onValueChange={(v) => onPickProduct(i, v)}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {list.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} <span className="text-xs text-muted-foreground">({p.unit})</span>
                                </SelectItem>
                              ))}
                              {list.length === 0 && (
                                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                  Nenhum produto cadastrado
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                          <Button type="button" size="icon" variant="outline" onClick={() => openNewProduct(i)} title="Novo produto">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input className="col-span-6 sm:col-span-2" type="number" step="0.01" placeholder="Qtd" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
                        <Input className="col-span-4 sm:col-span-2" placeholder="Un" value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} />
                        <Button size="icon" variant="ghost" className="col-span-2 sm:col-span-1 justify-self-end" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
                        <Input
                          className="col-span-12"
                          placeholder="Marcas homologadas (opcional) — ex: Heinz, Hemmer, Quero (a 1ª é a preferida)"
                          value={it.approved_brands}
                          onChange={(e) => updateItem(i, { approved_brands: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar e abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal ver propostas */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{viewing?.title}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-2 overflow-y-auto flex-1 min-h-0 space-y-3">
            <div className="text-sm text-muted-foreground flex flex-wrap gap-2 items-center">
              {viewing && <>Prazo: {format(new Date(viewing.deadline), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {statusBadge(viewing.status)} · {bids.length} fornecedor(es) propôs</>}
            </div>

            {viewing && bids.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">Nenhuma proposta recebida ainda.</div>
            ) : viewing && (
              <QuotationAwardPanel
                quotationId={viewing.id}
                storeId={viewing.store_id}
                onClosed={() => { setViewing(null); load(); }}
              />
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background flex-row flex-wrap justify-end gap-2">
            {viewing?.status === "open" && (
              <Button variant="outline" onClick={() => viewing && updateStatus(viewing, "cancelled")}>Cancelar cotação</Button>
            )}
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal de revisão (sugeridos + manuais) */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Revisar cotação</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-2 overflow-y-auto flex-1 min-h-0 space-y-3">
            <div className="space-y-2">
              <Label>Título*</Label>
              <Input
                value={reviewMeta.title}
                onChange={(e) => setReviewMeta((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={reviewMeta.category_id}
                  onValueChange={(v) => setReviewMeta((p) => ({ ...p, category_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prazo*</Label>
                <Input
                  type="datetime-local"
                  value={reviewMeta.deadline}
                  onChange={(e) => setReviewMeta((p) => ({ ...p, deadline: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={reviewMeta.description}
                onChange={(e) => setReviewMeta((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens ({reviewItems.length})</Label>
                <Button size="sm" variant="outline" onClick={addReviewItem}>
                  <Plus className="h-4 w-4 mr-1" /> Item manual
                </Button>
              </div>
              <div className="space-y-2">
                {reviewItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start border rounded-md p-2">
                    <Input
                      className="col-span-12 sm:col-span-6"
                      placeholder="Descrição"
                      value={it.description}
                      onChange={(e) => updateReviewItem(i, { description: e.target.value })}
                    />
                    <Input
                      className="col-span-5 sm:col-span-2"
                      type="number"
                      step="0.01"
                      placeholder="Qtd"
                      value={it.quantity}
                      onChange={(e) => updateReviewItem(i, { quantity: e.target.value })}
                    />
                    <Input
                      className="col-span-5 sm:col-span-2"
                      placeholder="Un"
                      value={it.unit}
                      onChange={(e) => updateReviewItem(i, { unit: e.target.value })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="col-span-2 sm:col-span-2 justify-self-end"
                      onClick={() => removeReviewItem(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Input
                      className="col-span-12"
                      placeholder="Marcas homologadas (opcional) — ex: Heinz, Hemmer (a 1ª é a preferida)"
                      value={it.approved_brands}
                      onChange={(e) => updateReviewItem(i, { approved_brands: e.target.value })}
                    />
                  </div>
                ))}
                {reviewItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum item. Use "Item manual" para adicionar.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancelar</Button>
            <Button onClick={confirmCreateFromReview} disabled={creatingFromSugg}>
              {creatingFromSugg && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar cotação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal novo produto rápido */}
      <Dialog open={newProdOpen} onOpenChange={setNewProdOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo produto</DialogTitle>
            <DialogDescription>Cadastre um produto novo no estoque para usar nesta cotação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome*</Label>
              <Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} placeholder="Ex.: Farinha de trigo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input value={newProd.unit} onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })} placeholder="UN, KG, L..." />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={newProd.category} onValueChange={(v) => setNewProd({ ...newProd, category: v })}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="z-[60] bg-popover">
                    {productCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewProdOpen(false)}>Cancelar</Button>
            <Button onClick={createNewProduct} disabled={savingProd}>
              {savingProd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar e usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
