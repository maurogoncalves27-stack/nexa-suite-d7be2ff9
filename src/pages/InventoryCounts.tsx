import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search, ClipboardList, CheckCircle2, AlertTriangle, Lock, RotateCcw, X, Store as StoreIcon, History, Check, CalendarClock } from "lucide-react";
import CountItemLotsDialog from "@/components/inventory/CountItemLotsDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface CountRow {
  id: string;
  store_id: string;
  reference_date: string;
  status: "open" | "submitted" | "approved" | "cancelled";
  category_filter: string | null;
  total_items: number;
  divergent_items: number;
  total_difference_value: number;
  opened_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  notes: string | null;
  stores: { name: string };
}
interface CountItemRow {
  id: string;
  product_id: string;
  system_quantity: number;
  counted_quantity: number | null;
  unit_cost: number;
  difference: number;
  difference_value: number;
  notes: string | null;
  inventory_products: { name: string; unit: string; category: string | null; requires_expiry: boolean | null };
}

const statusLabel = (s: CountRow["status"]) => ({
  open: "Em contagem",
  submitted: "Enviada",
  approved: "Aprovada",
  cancelled: "Cancelada",
}[s]);

const statusVariant = (s: CountRow["status"]): "default" | "secondary" | "destructive" | "outline" => ({
  open: "secondary",
  submitted: "default",
  approved: "outline",
  cancelled: "destructive",
}[s]) as any;

const InventoryCounts = () => {
  const { user, isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const [stores, setStores] = useState<Store[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Loja selecionada no topo (foco da contagem rápida)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [openingForStore, setOpeningForStore] = useState(false);

  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState<CountRow | null>(null);
  const [items, setItems] = useState<CountItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lotsDialogItem, setLotsDialogItem] = useState<CountItemRow | null>(null);

  const loadStoresAndCounts = async () => {
    setLoading(true);
    const [{ data: st }, { data: cs }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase
        .from("inventory_counts")
        .select("id, store_id, reference_date, status, category_filter, total_items, divergent_items, total_difference_value, opened_at, submitted_at, approved_at, notes, stores!inner(name, is_virtual)")
        .eq("stores.is_virtual", false)
        .order("opened_at", { ascending: false }),
    ]);
    setStores(sortStores(st ?? []));
    setCounts((cs as unknown as CountRow[]) ?? []);
    setLoading(false);
  };

  const loadItems = async (countId: string) => {
    setItemsLoading(true);
    const [{ data: c }, { data: its }] = await Promise.all([
      supabase
        .from("inventory_counts")
        .select("id, store_id, reference_date, status, category_filter, total_items, divergent_items, total_difference_value, opened_at, submitted_at, approved_at, notes, stores(name)")
        .eq("id", countId)
        .maybeSingle(),
      supabase
        .from("inventory_count_items")
        .select("id, product_id, system_quantity, counted_quantity, unit_cost, difference, difference_value, notes, inventory_products(name, unit, category, requires_expiry)")
        .eq("count_id", countId)
        .order("inventory_products(name)"),
    ]);
    setActiveCount((c as unknown as CountRow) ?? null);
    setItems((its as unknown as CountItemRow[]) ?? []);
    setEdits({});
    setItemsLoading(false);
  };

  useEffect(() => { loadStoresAndCounts(); }, []);
  useEffect(() => { if (activeCountId) loadItems(activeCountId); else { setActiveCount(null); setItems([]); } }, [activeCountId]);

  // Deep-link: ?store=ID&count=ID&approve=1 vindo da notificação do gestor.
  // Abre direto a contagem específica (em vez de criar uma nova).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (loading) return;
    const storeParam = searchParams.get("store");
    const countParam = searchParams.get("count");
    if (!storeParam && !countParam) return;
    if (countParam) {
      // localiza a contagem; se existir, seleciona-a sem abrir nova
      const c = counts.find((x) => x.id === countParam);
      if (c) {
        setSelectedStoreId(c.store_id);
        setActiveCountId(c.id);
      }
    } else if (storeParam) {
      // sem count: tenta achar a mais recente submitted/open daquela loja
      const c = counts.find((x) => x.store_id === storeParam && (x.status === "submitted" || x.status === "open"));
      if (c) {
        setSelectedStoreId(c.store_id);
        setActiveCountId(c.id);
      } else {
        setSelectedStoreId(storeParam);
      }
    }
    // limpa params para não reprocessar
    const next = new URLSearchParams(searchParams);
    next.delete("store"); next.delete("count"); next.delete("approve");
    setSearchParams(next, { replace: true });
  }, [loading, counts, searchParams, setSearchParams]);

  /**
   * Quando o usuário escolhe uma loja no topo:
   * - Se já existe contagem aberta para a loja → abre ela.
   * - Senão, chama RPC para abrir uma nova capturando o saldo atual.
   */
  const handleSelectStore = async (storeId: string) => {
    setSelectedStoreId(storeId);
    if (!storeId) { setActiveCountId(null); return; }
    // procura contagem aberta para a loja
    const existingOpen = counts.find((c) => c.store_id === storeId && c.status === "open");
    if (existingOpen) {
      setActiveCountId(existingOpen.id);
      return;
    }
    // procura mais recente enviada/aprovada (últimas 24h) para evitar duplicar — opcional
    setOpeningForStore(true);
    const { data, error } = await supabase.rpc("open_inventory_count", {
      _store_id: storeId,
      _category: null,
      _notes: null,
    });
    setOpeningForStore(false);
    if (error) {
      toast({ title: "Erro ao abrir contagem", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contagem aberta", description: "Saldo atual capturado. Comece a contagem." });
    await loadStoresAndCounts();
    setActiveCountId(data as string);
  };

  const saveItem = async (item: CountItemRow) => {
    const v = edits[item.id];
    if (v === undefined) return;
    const num = v === "" ? null : Number(v);
    if (num !== null && (Number.isNaN(num) || num < 0)) {
      return toast({ title: "Quantidade inválida", variant: "destructive" });
    }
    setSavingId(item.id);
    const { error } = await supabase
      .from("inventory_count_items")
      .update({ counted_quantity: num, counted_by: user?.id, counted_at: new Date().toISOString() })
      .eq("id", item.id);
    setSavingId(null);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    setItems((prev) => prev.map((it) => it.id === item.id
      ? { ...it, counted_quantity: num, difference: (num ?? 0) - it.system_quantity, difference_value: ((num ?? 0) - it.system_quantity) * it.unit_cost }
      : it));
    setEdits((p) => { const n = { ...p }; delete n[item.id]; return n; });
  };

  const handleSubmit = async () => {
    if (!activeCountId) return;
    const blanks = items.filter((i) => i.counted_quantity === null).length;
    if (blanks > 0) {
      const ok = window.confirm(`Existem ${blanks} item(ns) sem contagem. Itens não contados serão considerados como ZERO. Deseja continuar?`);
      if (!ok) return;
      await supabase
        .from("inventory_count_items")
        .update({ counted_quantity: 0, counted_by: user?.id, counted_at: new Date().toISOString() })
        .eq("count_id", activeCountId)
        .is("counted_quantity", null);
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_inventory_count", { _count_id: activeCountId });
    setSubmitting(false);
    if (error) return toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    toast({ title: "Contagem enviada", description: "Aguardando aprovação do gestor." });
    await loadItems(activeCountId);
    await loadStoresAndCounts();
  };

  const handleApprove = async () => {
    if (!activeCountId) return;
    if (!window.confirm("Ao aprovar, o sistema gerará as movimentações de ajuste para zerar as diferenças. Confirmar?")) return;
    setApproving(true);
    const { error } = await supabase.rpc("approve_inventory_count", { _count_id: activeCountId });
    setApproving(false);
    if (error) return toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" });
    toast({ title: "Contagem aprovada", description: "Estoque ajustado conforme as diferenças." });
    await loadItems(activeCountId);
    await loadStoresAndCounts();
  };

  const handleReopen = async () => {
    if (!activeCountId) return;
    const { error } = await supabase.rpc("reopen_inventory_count", { _count_id: activeCountId });
    if (error) return toast({ title: "Erro ao reabrir", description: error.message, variant: "destructive" });
    toast({ title: "Contagem reaberta" });
    await loadItems(activeCountId);
    await loadStoresAndCounts();
  };

  const handleCancel = async () => {
    if (!activeCountId) return;
    if (!window.confirm("Cancelar esta contagem? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.rpc("cancel_inventory_count", { _count_id: activeCountId });
    if (error) return toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    toast({ title: "Contagem cancelada" });
    setActiveCountId(null);
    setSelectedStoreId("");
    await loadStoresAndCounts();
  };

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) =>
      !q || i.inventory_products?.name?.toLowerCase().includes(q) || i.inventory_products?.category?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const summary = useMemo(() => {
    let counted = 0, divergent = 0, value = 0;
    items.forEach((i) => {
      if (i.counted_quantity !== null) {
        counted++;
        if (i.difference !== 0) {
          divergent++;
          value += Number(i.difference_value);
        }
      }
    });
    return { counted, divergent, value, total: items.length };
  }, [items]);

  const editable = activeCount?.status === "open" || (activeCount?.status === "submitted" && isStaff);
  const readOnly = !editable;

  // Histórico = todas as contagens da loja selecionada que NÃO são a ativa
  const storeHistory = useMemo(() => {
    if (!selectedStoreId) return [];
    return counts.filter((c) => c.store_id === selectedStoreId && c.id !== activeCountId);
  }, [counts, selectedStoreId, activeCountId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">Contagem de estoque</h1>
        <p className="text-muted-foreground text-sm">
          Selecione a loja e digite a quantidade contada de cada produto. As diferenças são ajustadas após aprovação do gestor.
        </p>
      </div>

      {/* Seletor de loja em destaque */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-medium flex items-center gap-2 shrink-0">
            <StoreIcon className="h-4 w-4 text-primary" />
            Loja para contagem:
          </label>
          <div className="flex-1 min-w-0">
            <Select value={selectedStoreId} onValueChange={handleSelectStore} disabled={openingForStore}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma loja para começar a contagem" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {openingForStore && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Capturando saldo atual…
            </span>
          )}
        </CardContent>
      </Card>

      {/* Estado: nenhuma loja selecionada */}
      {!selectedStoreId && !loading && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Escolha uma loja acima para abrir a contagem e listar os produtos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Contagem ativa: cabeçalho + ações + tabela */}
      {activeCountId && activeCount && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(activeCount.status)} className="h-7 text-sm">
                {statusLabel(activeCount.status)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Aberta em {new Date(activeCount.opened_at).toLocaleString("pt-BR")}
                {activeCount.category_filter ? ` · ${activeCount.category_filter}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeCount.status === "open" && (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Enviar contagem
                </Button>
              )}
              {activeCount.status === "submitted" && isStaff && (
                <>
                  <Button variant="outline" onClick={handleReopen}><RotateCcw className="h-4 w-4" />Reabrir</Button>
                  <Button onClick={handleApprove} disabled={approving}>
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Aprovar e ajustar
                  </Button>
                </>
              )}
              {(activeCount.status === "open" || activeCount.status === "submitted") && isStaff && (
                <Button variant="destructive" onClick={handleCancel}><X className="h-4 w-4" />Cancelar</Button>
              )}
            </div>
          </div>

          {/* Faixa de alerta contextual conforme o status da contagem */}
          {activeCount.status === "open" && (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600">
              <ClipboardList className="h-4 w-4" />
              <AlertTitle>Contagem em andamento</AlertTitle>
              <AlertDescription>
                Preencha as quantidades contadas. Quando terminar, clique em <strong>Enviar contagem</strong> para que o gestor revise e aprove os ajustes no estoque.
              </AlertDescription>
            </Alert>
          )}
          {activeCount.status === "submitted" && isStaff && (
            <Alert className="border-primary/50 bg-primary/10 [&>svg]:text-primary">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Aguardando sua aprovação</AlertTitle>
              <AlertDescription>
                A loja enviou esta contagem. Revise os itens divergentes abaixo e clique em <strong>Aprovar e ajustar</strong> para alterar o estoque efetivamente, ou <strong>Reabrir</strong> para devolver à loja.
              </AlertDescription>
            </Alert>
          )}
          {activeCount.status === "submitted" && !isStaff && (
            <Alert className="border-blue-500/50 bg-blue-500/10 text-blue-900 dark:text-blue-200 [&>svg]:text-blue-600">
              <Lock className="h-4 w-4" />
              <AlertTitle>Contagem enviada — aguardando gestor</AlertTitle>
              <AlertDescription>
                Sua contagem foi enviada e está em modo somente leitura. O gestor vai revisar as diferenças e aprovar os ajustes.
              </AlertDescription>
            </Alert>
          )}
          {activeCount.status === "approved" && (
            <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 [&>svg]:text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Contagem aprovada</AlertTitle>
              <AlertDescription>
                Os ajustes já foram aplicados ao estoque{activeCount.approved_at ? ` em ${new Date(activeCount.approved_at).toLocaleString("pt-BR")}` : ""}.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Itens</p><p className="text-xl font-bold">{summary.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contados</p><p className="text-xl font-bold">{summary.counted}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Divergentes</p><p className={`text-xl font-bold ${summary.divergent > 0 ? "text-destructive" : ""}`}>{summary.divergent}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor da diferença</p><p className={`text-xl font-bold ${summary.value < 0 ? "text-destructive" : summary.value > 0 ? "text-warning" : ""}`}>{summary.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Itens da contagem</CardTitle>
              <CardDescription>
                {readOnly
                  ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Somente leitura — apenas gestor pode alterar.</span>
                  : "Digite a quantidade contada de cada produto. As diferenças são calculadas automaticamente."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar produto ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>

              {itemsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {items.length === 0 ? "Nenhum produto cadastrado para esta loja." : "Nenhum item encontrado para a busca."}
                </p>
              ) : (() => {
                // Agrupa itens filtrados por categoria
                const groups = new Map<string, typeof filteredItems>();
                filteredItems.forEach((it) => {
                  const cat = it.inventory_products?.category?.trim() || "Sem categoria";
                  if (!groups.has(cat)) groups.set(cat, []);
                  groups.get(cat)!.push(it);
                });
                const orderedCats = Array.from(groups.keys()).sort((a, b) => {
                  if (a === "Sem categoria") return 1;
                  if (b === "Sem categoria") return -1;
                  return a.localeCompare(b, "pt-BR");
                });

                const renderRow = (it: typeof filteredItems[number]) => {
                  const e = edits[it.id];
                  const dirty = e !== undefined;
                  const counted = it.counted_quantity;
                  const diff = Number(it.difference);
                  const isDiverg = counted !== null && diff !== 0;
                  const isCounted = counted !== null;
                  const rowClass = isDiverg
                    ? (diff < 0 ? "bg-destructive/5" : "bg-warning/10")
                    : isCounted
                      ? "bg-emerald-500/5"
                      : undefined;
                  return (
                    <TableRow key={it.id} className={rowClass}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isCounted && !isDiverg && (
                            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Contado" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium">{it.inventory_products?.name}</div>
                            <div className="text-xs text-muted-foreground">{it.inventory_products?.category ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{it.inventory_products?.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(it.system_quantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</TableCell>
                      <TableCell className="text-right">
                        {readOnly ? (
                          <span className="tabular-nums">{counted === null ? "—" : Number(counted).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {it.inventory_products?.requires_expiry && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 px-2 shrink-0"
                                title="Informar lotes e validades"
                                onClick={() => setLotsDialogItem(it)}
                              >
                                <CalendarClock className="h-4 w-4" />
                              </Button>
                            )}
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              className="h-9 text-right"
                              placeholder="0"
                              value={e ?? (counted === null ? "" : String(counted))}
                              onChange={(ev) => setEdits((p) => ({ ...p, [it.id]: ev.target.value }))}
                              onBlur={() => dirty && saveItem(it)}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${counted === null ? "text-muted-foreground" : diff < 0 ? "text-destructive font-semibold" : diff > 0 ? "text-warning font-semibold" : ""}`}>
                        {counted === null ? "—" : (diff > 0 ? "+" : "") + diff.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${counted === null ? "text-muted-foreground" : diff < 0 ? "text-destructive font-semibold" : diff > 0 ? "text-warning font-semibold" : ""}`}>
                        {counted === null ? "—" : Number(it.difference_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          {savingId === it.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground inline" />}
                          {dirty && savingId !== it.id && <Button size="sm" variant="default" onClick={() => saveItem(it)}>Salvar</Button>}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                };

                // Abre por padrão categorias com itens pendentes; se todas estiverem contadas, mantém a primeira aberta.
                const defaultOpen = orderedCats.filter((c) =>
                  groups.get(c)!.some((i) => i.counted_quantity === null)
                );
                if (defaultOpen.length === 0 && orderedCats.length > 0) defaultOpen.push(orderedCats[0]);

                return (
                  <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
                    {orderedCats.map((cat) => {
                      const list = groups.get(cat)!;
                      const countedQty = list.filter((i) => i.counted_quantity !== null).length;
                      const total = list.length;
                      const allDone = countedQty === total;
                      const divergQty = list.filter((i) => i.counted_quantity !== null && Number(i.difference) !== 0).length;
                      return (
                        <AccordionItem key={cat} value={cat}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              <span className={`h-2.5 w-2.5 rounded-full ${allDone ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                              <span className="font-medium">{cat}</span>
                              <Badge variant={allDone ? "secondary" : "outline"} className="ml-1">
                                {countedQty}/{total} contados
                              </Badge>
                              {divergQty > 0 && (
                                <Badge variant="destructive">{divergQty} diverg.</Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead>Un.</TableHead>
                                    <TableHead className="text-right">Sistema</TableHead>
                                    <TableHead className="text-right w-32">Contado</TableHead>
                                    <TableHead className="text-right">Diferença</TableHead>
                                    <TableHead className="text-right">Valor diferença</TableHead>
                                    {!readOnly && <TableHead></TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {list.map(renderRow)}
                                </TableBody>
                              </Table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}

      {/* Histórico de contagens da loja selecionada */}
      {selectedStoreId && storeHistory.length > 0 && (
        <Card>
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" /> Contagens anteriores ({storeHistory.length})
                </CardTitle>
                <CardDescription>Clique para {historyOpen ? "ocultar" : "ver"} as contagens passadas desta loja.</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2">
                {storeHistory.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCountId(c.id)}
                    className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{c.stores?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Aberta em {new Date(c.opened_at).toLocaleString("pt-BR")}
                          {c.category_filter ? ` · ${c.category_filter}` : ""}
                        </div>
                      </div>
                      <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                      <div><span className="text-muted-foreground">Itens:</span> <strong>{c.total_items}</strong></div>
                      <div className={c.divergent_items > 0 ? "text-destructive" : ""}>
                        <span className="text-muted-foreground">Divergentes:</span> <strong>{c.divergent_items}</strong>
                      </div>
                      <div className={Number(c.total_difference_value) < 0 ? "text-destructive" : Number(c.total_difference_value) > 0 ? "text-warning" : ""}>
                        <span className="text-muted-foreground">Valor:</span> <strong>{Number(c.total_difference_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}

      <div className="bg-muted/40 border rounded-md p-3 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Não é possível abrir duas contagens simultâneas para a mesma loja. Ao selecionar uma loja sem contagem aberta, o sistema captura automaticamente o saldo atual de cada produto para você conferir.</span>
      </div>

      {lotsDialogItem && activeCount && (
        <CountItemLotsDialog
          open={!!lotsDialogItem}
          onClose={() => setLotsDialogItem(null)}
          countItemId={lotsDialogItem.id}
          storeId={activeCount.store_id}
          productId={lotsDialogItem.product_id}
          productName={lotsDialogItem.inventory_products?.name ?? ""}
          unit={lotsDialogItem.inventory_products?.unit ?? ""}
          systemQuantity={Number(lotsDialogItem.system_quantity)}
          onSaved={(total) => {
            // atualiza linha localmente
            setItems((prev) => prev.map((x) => x.id === lotsDialogItem.id
              ? { ...x, counted_quantity: total, difference: total - x.system_quantity, difference_value: (total - x.system_quantity) * x.unit_cost }
              : x));
          }}
        />
      )}
    </div>
  );
};

export default InventoryCounts;
