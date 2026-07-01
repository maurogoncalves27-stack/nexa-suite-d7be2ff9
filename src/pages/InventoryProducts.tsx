import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Search, Store as StoreIcon, Package, Sparkles, AlertCircle, Check, X, Tag, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";
import { suggestCategory } from "@/lib/categorySuggestion";
import { sortStores } from "@/lib/storeSort";
import { ProductStoresDialog } from "@/components/inventory/ProductStoresDialog";

const UNITS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "FD", "DZ", "MT"];

interface Product {
  id: string;
  name: string;
  internal_code: string | null;
  barcode: string | null;
  unit: string;
  category: string | null;
  average_cost: number;
  last_cost: number | null;
  is_active: boolean;
  is_custom: boolean;
  print_run: number | null;
  unit_value: number | null;
  fixed_supplier_id: string | null;
  art_file_url: string | null;
  lead_time_days: number | null;
  custom_notes: string | null;
  factory_only: boolean;
  product_type: "insumo" | "revenda" | "produzido" | "embalagem" | "personalizado";
  requires_expiry: boolean;
}

interface Store {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
}

type DraftProduct = Omit<Product, "id" | "average_cost" | "last_cost">;

const empty: DraftProduct = {
  name: "",
  internal_code: "",
  barcode: "",
  unit: "UN",
  category: "",
  is_active: true,
  is_custom: false,
  print_run: null,
  unit_value: null,
  fixed_supplier_id: null,
  art_file_url: "",
  lead_time_days: null,
  custom_notes: "",
  factory_only: false,
  product_type: "insumo",
  requires_expiry: false,
  purchase_unit: null,
  pack_size: null,
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const InventoryProducts = () => {
  const { user } = useAuth();
  const { canReceive } = useInventoryPermission();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<DraftProduct>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [storesDialogProduct, setStoresDialogProduct] = useState<Product | null>(null);
  const [productStoreCounts, setProductStoreCounts] = useState<Record<string, number>>({});

  const loadStoreLinks = async () => {
    const { data } = await supabase.from("product_store_links").select("product_id");
    const map: Record<string, number> = {};
    (data ?? []).forEach((row: { product_id: string }) => {
      map[row.product_id] = (map[row.product_id] ?? 0) + 1;
    });
    setProductStoreCounts(map);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: prods }, { data: sts }, { data: sups }] = await Promise.all([
      supabase.from("inventory_products").select("*").eq("is_active", true).order("name"),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase.from("suppliers").select("id, trade_name, legal_name").eq("status", "approved").order("trade_name"),
    ]);
    setProducts((prods as Product[]) ?? []);
    setStores(sortStores((sts as Store[])) ?? []);
    setSuppliers((sups as Supplier[]) ?? []);
    await loadStoreLinks();
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Carrega saldo agregado por produto conforme filtro de loja
  useEffect(() => {
    const loadStock = async () => {
      let query = supabase.from("inventory_stock").select("product_id, quantity, store_id");
      if (storeFilter !== "all") query = query.eq("store_id", storeFilter);
      const { data } = await query;
      const map: Record<string, number> = {};
      (data ?? []).forEach((row: { product_id: string; quantity: number }) => {
        map[row.product_id] = (map[row.product_id] ?? 0) + Number(row.quantity);
      });
      setStockMap(map);
    };
    loadStock();
  }, [storeFilter]);

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q) ||
          (p.internal_code ?? "").toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q);
        const cat = (p.category ?? "").trim();
        const matchesCategory =
          categoryFilter === "all" ||
          (categoryFilter === "__none__" && !cat) ||
          cat === categoryFilter;
        return matchesSearch && matchesCategory;
      }),
    [products, search, categoryFilter],
  );

  // Agrupa por categoria
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const cat = (p.category ?? "").trim() || "__none__";
      const arr = map.get(cat) ?? [];
      arr.push(p);
      map.set(cat, arr);
    }
    const entries = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      return a.localeCompare(b, "pt-BR");
    });
    return entries;
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const cat = (p.category ?? "").trim() || "__none__";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  // KPIs no escopo atual (filtro de loja)
  const kpis = useMemo(() => {
    let totalValue = 0;
    let semSaldo = 0;
    for (const p of products) {
      const qty = stockMap[p.id] ?? 0;
      totalValue += qty * Number(p.average_cost ?? 0);
      if (qty <= 0) semSaldo += 1;
    }
    return { total: products.length, totalValue, semSaldo };
  }, [products, stockMap]);

  const applyCategory = async (productId: string, category: string) => {
    setSavingCategoryId(productId);
    const { error } = await supabase
      .from("inventory_products")
      .update({ category })
      .eq("id", productId);
    setSavingCategoryId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, category } : p)));
    toast.success(`Categoria definida: ${category}`);
  };

  // Gestão de categorias dentro do modal
  const handleNewCategory = async () => {
    const name = window.prompt("Nome da nova categoria:")?.trim().toUpperCase();
    if (!name) return;
    if (existingCategories.some((c) => c.toUpperCase() === name)) {
      toast.error("Categoria já existe");
      setDraft((p) => ({ ...p, category: name }));
      return;
    }
    // Cria categoria "fantasma" — só aparece quando vinculada a um produto.
    // Para já listar no select, injeta no estado local de produtos vazio? Simples: deixa o draft com ela.
    setDraft((p) => ({ ...p, category: name }));
    toast.success(`Categoria "${name}" pronta para uso — salve o produto para confirmar.`);
  };

  const handleRenameCategory = async () => {
    const current = draft.category?.trim();
    if (!current) {
      toast.error("Selecione uma categoria primeiro");
      return;
    }
    const next = window.prompt(`Renomear "${current}" para:`, current)?.trim().toUpperCase();
    if (!next || next === current) return;
    const { error } = await supabase
      .from("inventory_products")
      .update({ category: next })
      .eq("category", current);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Categoria renomeada para "${next}"`);
    setDraft((p) => ({ ...p, category: next }));
    await load();
  };

  const handleDeleteCategory = async () => {
    const current = draft.category?.trim();
    if (!current) {
      toast.error("Selecione uma categoria primeiro");
      return;
    }
    if (!window.confirm(`Excluir a categoria "${current}"? Os produtos ficarão sem categoria.`)) return;
    const { error } = await supabase
      .from("inventory_products")
      .update({ category: null })
      .eq("category", current);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Categoria "${current}" excluída`);
    setDraft((p) => ({ ...p, category: "" }));
    await load();
  };

  const openNew = () => {
    setEditing(null);
    setDraft(empty);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setDraft({
      name: p.name,
      internal_code: p.internal_code ?? "",
      barcode: p.barcode ?? "",
      unit: p.unit,
      category: p.category ?? "",
      is_active: p.is_active,
      is_custom: p.is_custom ?? false,
      print_run: p.print_run,
      unit_value: p.unit_value,
      fixed_supplier_id: p.fixed_supplier_id,
      art_file_url: p.art_file_url ?? "",
      lead_time_days: p.lead_time_days,
      custom_notes: p.custom_notes ?? "",
      factory_only: p.factory_only ?? false,
      product_type: p.product_type ?? "insumo",
      requires_expiry: p.requires_expiry ?? false,
      purchase_unit: p.purchase_unit ?? null,
      pack_size: p.pack_size ?? null,
    });
    setOpen(true);
  };

  const removeProduct = async (p: Product) => {
    if (!window.confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("inventory_products").delete().eq("id", p.id);
    if (error) {
      if (error.code === "23503" || /foreign key/i.test(error.message)) {
        const { error: e2 } = await supabase.from("inventory_products").update({ is_active: false }).eq("id", p.id);
        if (e2) { toast.error(e2.message); return; }
        toast.success("Produto possui vínculos — foi desativado em vez de excluído.");
      } else {
        toast.error(error.message);
        return;
      }
    } else {
      toast.success("Produto excluído");
    }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.toUpperCase(),
        internal_code: draft.internal_code || null,
        barcode: draft.barcode || null,
        unit: draft.unit,
        category: draft.category || null,
        is_active: draft.is_active,
        is_custom: draft.product_type === "personalizado",
        factory_only: draft.factory_only,
        product_type: draft.product_type,
        requires_expiry: draft.requires_expiry,
        purchase_unit: draft.purchase_unit || null,
        pack_size: draft.purchase_unit && draft.pack_size ? Number(draft.pack_size) : null,
        print_run: draft.is_custom ? draft.print_run : null,
        unit_value: draft.is_custom ? draft.unit_value : null,
        fixed_supplier_id: draft.is_custom ? draft.fixed_supplier_id : null,
        art_file_url: draft.is_custom ? (draft.art_file_url || null) : null,
        lead_time_days: draft.is_custom ? draft.lead_time_days : null,
        custom_notes: draft.is_custom ? (draft.custom_notes || null) : null,
      };
      if (editing) {
        const { error } = await supabase.from("inventory_products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Produto atualizado");
      } else {
        const { error } = await supabase.from("inventory_products").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Produto criado");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const stockLabel = storeFilter === "all" ? "Saldo total" : "Saldo na loja";
  const valueLabel =
    storeFilter === "all"
      ? "Valor em estoque (todas)"
      : `Valor em estoque (${stores.find((s) => s.id === storeFilter)?.name ?? "loja"})`;

  // Inclui a categoria do draft mesmo se ainda não existir
  const categoryOptions = useMemo(() => {
    const set = new Set(existingCategories);
    if (draft.category && draft.category.trim()) set.add(draft.category.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [existingCategories, draft.category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:justify-between">
        <div>
          <h1 className="text-xl md:text-xl font-bold flex items-center gap-2">
            <Package className="md: md: h-6 w-6 md:h-7 md:w-7 text-primary" />
            Produtos
          </h1>
          <p className="text-muted-foreground">Catálogo de produtos para recebimento e estoque.</p>
        </div>
        {canReceive && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-xs tracking-wide">Total de produtos</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-xs tracking-wide">{valueLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtBRL(kpis.totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="uppercase text-xs tracking-wide">Sem saldo</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {kpis.semSaldo} <span className="text-sm font-normal text-muted-foreground">itens críticos</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>{products.length} produto(s) cadastrado(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, código, EAN…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categoryCounts["__none__"] ? (
                  <SelectItem value="__none__">Sem categoria ({categoryCounts["__none__"]})</SelectItem>
                ) : null}
                {existingCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c} ({categoryCounts[c] ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas (saldo total)</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <TableHead>Cód. interno</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">{stockLabel}</TableHead>
                    <TableHead className="text-right">Custo médio</TableHead>
                    <TableHead className="text-right">Último custo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(([catKey, rows]) => (
                    <Fragment key={catKey}>
                      <TableRow className="hover:bg-transparent border-0">
                        <TableCell colSpan={9} className="py-2 px-0">
                          <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                            <span>{catKey === "__none__" ? "SEM CATEGORIA" : catKey}</span>
                            <span className="text-primary/70">{rows.length} PRODUTOS</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {rows.map((p) => {
                        const qty = stockMap[p.id] ?? 0;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="font-mono text-xs">{p.internal_code ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.barcode ?? "—"}</TableCell>
                            <TableCell>{p.unit}</TableCell>
                            <TableCell>
                              {p.is_custom ? (
                                <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />Personalizado</Badge>
                              ) : p.category && p.category.trim() ? (
                                <span className="text-sm">{p.category}</span>
                              ) : (
                                <CategoryCell
                                  suggestion={suggestCategory(p.name, existingCategories)}
                                  busy={savingCategoryId === p.id}
                                  canEdit={!!canReceive}
                                  onAccept={(cat) => applyCategory(p.id, cat)}
                                  onEdit={() => openEdit(p)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {qty <= 0 ? (
                                <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 rounded-full bg-destructive/10 text-destructive text-xs font-semibold">
                                  0
                                </span>
                              ) : (
                                <span className="font-mono">{qty.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{fmtBRL(Number(p.average_cost))}</TableCell>
                            <TableCell className="text-right">{p.last_cost != null ? fmtBRL(Number(p.last_cost)) : "—"}</TableCell>
                            <TableCell className="text-right">
                              {canReceive && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 relative"
                                    title={
                                      productStoreCounts[p.id]
                                        ? `Vinculado a ${productStoreCounts[p.id]} loja(s)`
                                        : "Disponível em todas as lojas"
                                    }
                                    onClick={() => setStoresDialogProduct(p)}
                                  >
                                    <MapPin className="h-4 w-4" />
                                    {productStoreCounts[p.id] ? (
                                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                                        {productStoreCounts[p.id]}
                                      </span>
                                    ) : null}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => removeProduct(p)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Novo / Editar produto */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Dados gerais</TabsTrigger>
              <TabsTrigger value="custom">Personalizado</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 mt-3">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Unidade</Label>
                  <Select value={draft.unit} onValueChange={(v) => setDraft((p) => ({ ...p, unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select
                    value={draft.category || undefined}
                    onValueChange={(v) => setDraft((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Ações de categoria */}
              <div className="flex flex-wrap gap-2 -mt-1">
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={handleNewCategory}>
                  <Plus className="h-3.5 w-3.5" /> Nova
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={handleRenameCategory}>
                  <Pencil className="h-3.5 w-3.5" /> Renomear
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={handleDeleteCategory}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>EAN / Código de barras</Label>
                  <Input value={draft.barcode ?? ""} onChange={(e) => setDraft((p) => ({ ...p, barcode: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Código interno</Label>
                  <Input value={draft.internal_code ?? ""} onChange={(e) => setDraft((p) => ({ ...p, internal_code: e.target.value }))} />
                </div>
              </div>

              {/* Conversão de compra → estoque */}
              <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                <div className="text-xs font-semibold">Conversão de compra → estoque (opcional)</div>
                <p className="text-xs text-muted-foreground">
                  Use quando o fornecedor vende em embalagem maior (ex: 1 fardo de 5kg).
                  O recebimento da NF entrará automaticamente convertido na unidade de estoque ({draft.unit}).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Unidade de compra</Label>
                    <Select
                      value={draft.purchase_unit ?? "__none__"}
                      onValueChange={(v) =>
                        setDraft((p) => ({
                          ...p,
                          purchase_unit: v === "__none__" ? null : v,
                          pack_size: v === "__none__" ? null : p.pack_size,
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sem conversão —</SelectItem>
                        {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd. por embalagem ({draft.unit})</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      placeholder="Ex: 5"
                      disabled={!draft.purchase_unit}
                      value={draft.pack_size ?? ""}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, pack_size: e.target.value ? Number(e.target.value) : null }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft((p) => ({ ...p, is_active: v }))} />
                  <Label>Produto ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.requires_expiry}
                    onCheckedChange={(v) => setDraft((p) => ({ ...p, requires_expiry: v }))}
                  />
                  <Label>Controla validade (lote/vencimento)</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-3 mt-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">
                  Campos disponíveis quando o tipo do produto for <b>Personalizado</b> (sob encomenda — embalagens com arte, sacolas, materiais gráficos, brindes).
                </div>
              </div>

              <div className="space-y-1">
                <Label>Tipo do produto</Label>
                <Select
                  value={draft.product_type}
                  onValueChange={(v) => setDraft((p) => ({ ...p, product_type: v as Product["product_type"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insumo">Insumo (compra → produz)</SelectItem>
                    <SelectItem value="revenda">Revenda (compra → vende)</SelectItem>
                    <SelectItem value="produzido">Produzido (fabrica → vende)</SelectItem>
                    <SelectItem value="embalagem">Embalagem (uso interno)</SelectItem>
                    <SelectItem value="personalizado">Personalizado (sob encomenda)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.product_type !== "personalizado" ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Mude o tipo do produto para <b>Personalizado</b> para preencher tiragem, fornecedor fixo, arte e prazo.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Tiragem padrão</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Ex: 1000"
                        value={draft.print_run ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, print_run: e.target.value ? Number(e.target.value) : null }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor unitário (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0,00"
                        value={draft.unit_value ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, unit_value: e.target.value ? Number(e.target.value) : null }))
                        }
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label>Fornecedor fixo</Label>
                      <Select
                        value={draft.fixed_supplier_id ?? "none"}
                        onValueChange={(v) =>
                          setDraft((p) => ({ ...p, fixed_supplier_id: v === "none" ? null : v }))
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Sem fornecedor fixo —</SelectItem>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.trade_name || s.legal_name || "Fornecedor sem nome"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Prazo de produção (dias)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Ex: 15"
                        value={draft.lead_time_days ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, lead_time_days: e.target.value ? Number(e.target.value) : null }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Link da arte / layout</Label>
                      <Input
                        placeholder="https://…"
                        value={draft.art_file_url ?? ""}
                        onChange={(e) => setDraft((p) => ({ ...p, art_file_url: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Observações (cor, medida, acabamento…)</Label>
                    <Textarea
                      rows={3}
                      value={draft.custom_notes ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, custom_notes: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductStoresDialog
        productId={storesDialogProduct?.id ?? null}
        productName={storesDialogProduct?.name}
        open={!!storesDialogProduct}
        onOpenChange={(o) => { if (!o) setStoresDialogProduct(null); }}
        onSaved={loadStoreLinks}
      />
    </div>
  );
};

interface CategoryCellProps {
  suggestion: string | null;
  busy: boolean;
  canEdit: boolean;
  onAccept: (category: string) => void;
  onEdit: () => void;
}

function CategoryCell({ suggestion, busy, canEdit, onAccept, onEdit }: CategoryCellProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
        <AlertCircle className="h-3 w-3" />
        Sem categoria
      </Badge>
      {suggestion && canEdit && (
        <div className="flex items-center gap-1 rounded-md border bg-muted/40 pl-2 pr-1 py-0.5 text-xs">
          <span className="text-muted-foreground">Sugestão:</span>
          <span className="font-medium">{suggestion}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-primary"
            disabled={busy}
            onClick={() => onAccept(suggestion)}
            title="Confirmar sugestão"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground"
            disabled={busy}
            onClick={onEdit}
            title="Escolher outra categoria"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {!suggestion && canEdit && (
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onEdit}>
          Definir
        </Button>
      )}
    </div>
  );
}

export default InventoryProducts;
