import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupplier } from "@/hooks/useSupplier";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { Loader2, Truck, LogOut, Send, FileText, ClipboardList, Download, Upload, Tag, Package } from "lucide-react";
import { SupplierOffersTab } from "@/components/supplier/SupplierOffersTab";
import SupplierOrdersTab from "@/components/supplier/SupplierOrdersTab";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface Quotation {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  deadline: string;
  status: string;
}

interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  base_unit: string | null;
  notes: string | null;
  category?: string | null;
}

interface BidItem {
  quotation_item_id: string;
  pack_description: string;
  pack_price: string;
  pack_content_qty: string;
  pack_content_unit: string;
  min_order_packs: string;
  available_quantity: string;
  is_fifo: boolean;
  expiry_date: string;
  offered_brand: string;
  notes: string;
}

interface ApprovedBrand {
  id: string;
  quotation_item_id: string;
  brand_name: string;
  is_preferred: boolean;
}

const calcPricePerBase = (price: string, qty: string) => {
  const p = Number(price);
  const q = Number(qty);
  if (!p || !q || q <= 0) return 0;
  return p / q;
};

interface Bid {
  id: string;
  quotation_id: string;
  total_amount: number | null;
  delivery_days: number | null;
  validity_days: number | null;
  payment_terms: string | null;
  notes: string | null;
  submitted_at: string;
}

const fmtMoney = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export default function SupplierDashboard() {
  const navigate = useNavigate();
  const { user, isSupplier, signOut, loading: authLoading } = useAuth();
  const { supplier, loading: supLoading, refresh } = useSupplier();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [approvedCategoryIds, setApprovedCategoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [openQuot, setOpenQuot] = useState<Quotation | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [approvedBrands, setApprovedBrands] = useState<Record<string, ApprovedBrand[]>>({});
  const [bidItems, setBidItems] = useState<Record<string, BidItem>>({});
  const [bidMeta, setBidMeta] = useState({ delivery_days: "", validity_days: "", payment_terms: "", notes: "" });
  const [savingBid, setSavingBid] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ phone: "", contact_name: "", payment_terms: "", trade_name: "" });
  const [itemSearch, setItemSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (supplier) {
      setProfileForm({
        phone: supplier.phone ?? "",
        contact_name: supplier.contact_name ?? "",
        payment_terms: supplier.payment_terms ?? "",
        trade_name: supplier.trade_name ?? "",
      });
    }
  }, [supplier]);

  const loadData = async () => {
    setLoading(true);
    const [{ data: qs }, { data: bs }, { data: cats }] = await Promise.all([
      // todas as cotações (precisamos das encerradas para Minhas propostas)
      supabase.from("quotations").select("*").order("deadline", { ascending: false }),
      supabase.from("quotation_bids").select("*").order("submitted_at", { ascending: false }),
      supplier
        ? supabase.from("supplier_approved_categories").select("category_id").eq("supplier_id", supplier.id)
        : Promise.resolve({ data: [] as { category_id: string }[] }),
    ]);
    setQuotations((qs ?? []) as Quotation[]);
    setBids((bs ?? []) as Bid[]);
    setApprovedCategoryIds(((cats ?? []) as { category_id: string }[]).map((c) => c.category_id));
    setLoading(false);
  };

  useEffect(() => {
    if (isSupplier || supplier?.status === "approved") loadData();
  }, [isSupplier, supplier?.status]);

  if (!authLoading && !user) return <Navigate to="/fornecedor/login" replace />;
  if (!authLoading && !supLoading && !isSupplier && supplier?.status !== "approved") {
    return <Navigate to="/fornecedor/aguardando" replace />;
  }

  const openQuotation = async (q: Quotation) => {
    setOpenQuot(q);
    const { data: its } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", q.id)
      .order("sort_order");
    const itemsRaw = (its ?? []) as any[];
    // Buscar categoria via inventory_products
    const productIds = Array.from(new Set(itemsRaw.map((i) => i.product_id).filter(Boolean)));
    const catByProd: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from("inventory_products")
        .select("id, category")
        .in("id", productIds as string[]);
      (prods ?? []).forEach((p: any) => { catByProd[p.id] = p.category ?? ""; });
    }
    const itemsWithCat: QuotationItem[] = itemsRaw.map((i) => ({
      ...i,
      category: i.product_id ? (catByProd[i.product_id] || null) : null,
    }));
    setItems(itemsWithCat);

    // Marcas homologadas
    const itemIds = (its ?? []).map((i: any) => i.id);
    if (itemIds.length > 0) {
      const { data: brs } = await supabase
        .from("quotation_item_approved_brands")
        .select("*")
        .in("quotation_item_id", itemIds);
      const map: Record<string, ApprovedBrand[]> = {};
      (brs ?? []).forEach((b: any) => {
        (map[b.quotation_item_id] ||= []).push(b);
      });
      Object.values(map).forEach((arr) =>
        arr.sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred) || a.brand_name.localeCompare(b.brand_name)),
      );
      setApprovedBrands(map);
    } else {
      setApprovedBrands({});
    }

    // Carrega bid existente se houver
    const existingBid = bids.find((b) => b.quotation_id === q.id);
    if (existingBid) {
      setBidMeta({
        delivery_days: existingBid.delivery_days?.toString() ?? "",
        validity_days: existingBid.validity_days?.toString() ?? "",
        payment_terms: existingBid.payment_terms ?? "",
        notes: existingBid.notes ?? "",
      });
      const { data: bis } = await supabase
        .from("quotation_bid_items")
        .select("*")
        .eq("bid_id", existingBid.id);
      const map: Record<string, BidItem> = {};
      (bis ?? []).forEach((bi: any) => {
        map[bi.quotation_item_id] = {
          quotation_item_id: bi.quotation_item_id,
          pack_description: bi.pack_description ?? "",
          pack_price: bi.pack_price?.toString() ?? (bi.unit_price?.toString() ?? ""),
          pack_content_qty: bi.pack_content_qty?.toString() ?? "1",
          pack_content_unit: bi.pack_content_unit ?? "",
          min_order_packs: bi.min_order_packs?.toString() ?? "1",
          available_quantity: bi.available_quantity?.toString() ?? "",
          is_fifo: !!bi.is_fifo,
          expiry_date: bi.expiry_date ?? "",
          offered_brand: bi.offered_brand ?? "",
          notes: bi.notes ?? "",
        };
      });
      setBidItems(map);
    } else {
      setBidMeta({ delivery_days: "", validity_days: "", payment_terms: "", notes: "" });
      // Pré-preenche com a ÚLTIMA proposta enviada pelo fornecedor (qualquer cotação),
      // casando os itens pela descrição (case-insensitive) para o fornecedor só ajustar o necessário.
      const prefill: Record<string, BidItem> = {};
      try {
        if (supplier && (its ?? []).length > 0) {
          const { data: lastBids } = await supabase
            .from("quotation_bids")
            .select("id, submitted_at, quotation_id")
            .eq("supplier_id", supplier.id)
            .order("submitted_at", { ascending: false })
            .limit(20);
          const bidIds = (lastBids ?? []).map((b: any) => b.id);
          if (bidIds.length > 0) {
            const { data: lastBidItems } = await supabase
              .from("quotation_bid_items")
              .select("*, quotation_items!inner(description)")
              .in("bid_id", bidIds);
            // Mapeia por descrição normalizada — pega o mais recente (lastBids já ordenado desc)
            const bidIdOrder = new Map(bidIds.map((id, idx) => [id, idx]));
            const byDesc = new Map<string, any>();
            for (const bi of (lastBidItems ?? []) as any[]) {
              const desc = String(bi.quotation_items?.description ?? "").trim().toLowerCase();
              if (!desc) continue;
              const prev = byDesc.get(desc);
              if (!prev || (bidIdOrder.get(bi.bid_id) ?? 999) < (bidIdOrder.get(prev.bid_id) ?? 999)) {
                byDesc.set(desc, bi);
              }
            }
            for (const it of its as any[]) {
              const key = String(it.description ?? "").trim().toLowerCase();
              const src = byDesc.get(key);
              if (!src) continue;
              prefill[it.id] = {
                quotation_item_id: it.id,
                pack_description: src.pack_description ?? "",
                pack_price: src.pack_price?.toString() ?? "",
                pack_content_qty: src.pack_content_qty?.toString() ?? "1",
                pack_content_unit: src.pack_content_unit ?? "",
                min_order_packs: src.min_order_packs?.toString() ?? "1",
                available_quantity: src.available_quantity?.toString() ?? "",
                is_fifo: !!src.is_fifo,
                expiry_date: src.expiry_date ?? "",
                offered_brand: src.offered_brand ?? "",
                notes: "",
              };
            }
          }
        }
      } catch {
        // silencioso — pré-preenchimento é opcional
      }
      setBidItems(prefill);
      if (Object.keys(prefill).length > 0) {
        toast({
          title: "Pré-preenchido com sua última proposta",
          description: `${Object.keys(prefill).length} item(ns) reaproveitados. Revise antes de enviar.`,
        });
      }
    }
  };

  const updateBidItem = (itemId: string, patch: Partial<BidItem>, defaultUnit?: string) => {
    setBidItems((prev) => ({
      ...prev,
      [itemId]: {
        quotation_item_id: itemId,
        pack_description: prev[itemId]?.pack_description ?? "",
        pack_price: prev[itemId]?.pack_price ?? "",
        pack_content_qty: prev[itemId]?.pack_content_qty ?? "1",
        pack_content_unit: prev[itemId]?.pack_content_unit ?? (defaultUnit ?? ""),
        min_order_packs: prev[itemId]?.min_order_packs ?? "1",
        available_quantity: prev[itemId]?.available_quantity ?? "",
        is_fifo: prev[itemId]?.is_fifo ?? false,
        expiry_date: prev[itemId]?.expiry_date ?? "",
        offered_brand: prev[itemId]?.offered_brand ?? "",
        notes: prev[itemId]?.notes ?? "",
        ...patch,
      },
    }));
  };

  const submitBid = async () => {
    if (!supplier || !openQuot) return;
    const filled = Object.values(bidItems).filter((b) => b.pack_price && Number(b.pack_price) >= 0 && Number(b.pack_content_qty) > 0);
    if (filled.length === 0) {
      toast({ title: "Preencha ao menos um preço", variant: "destructive" });
      return;
    }
    // Validar marca homologada quando o item exige
    for (const bi of filled) {
      const brands = approvedBrands[bi.quotation_item_id] ?? [];
      if (brands.length > 0) {
        const allowed = brands.map((b) => b.brand_name.toLowerCase());
        if (!bi.offered_brand || !allowed.includes(bi.offered_brand.toLowerCase())) {
          const it = items.find((i) => i.id === bi.quotation_item_id);
          toast({
            title: "Marca obrigatória",
            description: `Selecione uma marca homologada para "${it?.description ?? "item"}". Aceitas: ${brands.map((b) => b.brand_name).join(", ")}`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    setSavingBid(true);

    // Upsert bid
    const existingBid = bids.find((b) => b.quotation_id === openQuot.id);
    let bidId = existingBid?.id;

    if (bidId) {
      const { error } = await supabase
        .from("quotation_bids")
        .update({
          delivery_days: bidMeta.delivery_days ? Number(bidMeta.delivery_days) : null,
          validity_days: bidMeta.validity_days ? Number(bidMeta.validity_days) : null,
          payment_terms: bidMeta.payment_terms || null,
          notes: bidMeta.notes || null,
          status: "submitted",
        })
        .eq("id", bidId);
      if (error) {
        setSavingBid(false);
        toast({ title: "Erro ao salvar proposta", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("quotation_bids")
        .insert({
          quotation_id: openQuot.id,
          supplier_id: supplier.id,
          delivery_days: bidMeta.delivery_days ? Number(bidMeta.delivery_days) : null,
          validity_days: bidMeta.validity_days ? Number(bidMeta.validity_days) : null,
          payment_terms: bidMeta.payment_terms || null,
          notes: bidMeta.notes || null,
        })
        .select("id")
        .single();
      if (error || !data) {
        setSavingBid(false);
        toast({ title: "Erro ao criar proposta", description: error?.message, variant: "destructive" });
        return;
      }
      bidId = data.id;
    }

    // Apaga itens antigos e insere novos
    await supabase.from("quotation_bid_items").delete().eq("bid_id", bidId!);
    const rows = filled.map((bi) => {
      const packPrice = Number(bi.pack_price);
      const packQty = Number(bi.pack_content_qty);
      const unitPrice = packQty > 0 ? packPrice / packQty : packPrice;
      return {
        bid_id: bidId!,
        quotation_item_id: bi.quotation_item_id,
        unit_price: unitPrice,
        pack_description: bi.pack_description || null,
        pack_price: packPrice,
        pack_content_qty: packQty,
        pack_content_unit: bi.pack_content_unit || null,
        min_order_packs: bi.min_order_packs ? Number(bi.min_order_packs) : 1,
        available_quantity: bi.available_quantity ? Number(bi.available_quantity) : null,
        is_fifo: !!bi.is_fifo,
        expiry_date: bi.is_fifo && bi.expiry_date ? bi.expiry_date : null,
        offered_brand: bi.offered_brand?.trim() || null,
        notes: bi.notes || null,
      };
    });
    const { error: itErr } = await supabase.from("quotation_bid_items").insert(rows);
    setSavingBid(false);
    if (itErr) {
      toast({ title: "Erro ao salvar itens", description: itErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Proposta enviada com sucesso!" });
    setOpenQuot(null);
    await loadData();
  };

  const fetchQuotationData = async (q: Quotation): Promise<{ its: QuotationItem[]; brands: Record<string, ApprovedBrand[]>; bidItemsMap: Record<string, BidItem> }> => {
    const { data: its } = await supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", q.id)
      .order("sort_order");
    const itemsArr = (its ?? []) as QuotationItem[];
    const itemIds = itemsArr.map((i) => i.id);
    const brandsMap: Record<string, ApprovedBrand[]> = {};
    if (itemIds.length > 0) {
      const { data: brs } = await supabase
        .from("quotation_item_approved_brands")
        .select("*")
        .in("quotation_item_id", itemIds);
      (brs ?? []).forEach((b: any) => {
        (brandsMap[b.quotation_item_id] ||= []).push(b);
      });
    }
    const bidItemsMap: Record<string, BidItem> = {};
    const existingBid = bids.find((b) => b.quotation_id === q.id);
    if (existingBid) {
      const { data: bis } = await supabase
        .from("quotation_bid_items")
        .select("*")
        .eq("bid_id", existingBid.id);
      (bis ?? []).forEach((bi: any) => {
        bidItemsMap[bi.quotation_item_id] = {
          quotation_item_id: bi.quotation_item_id,
          pack_description: bi.pack_description ?? "",
          pack_price: bi.pack_price?.toString() ?? (bi.unit_price?.toString() ?? ""),
          pack_content_qty: bi.pack_content_qty?.toString() ?? "1",
          pack_content_unit: bi.pack_content_unit ?? "",
          min_order_packs: bi.min_order_packs?.toString() ?? "1",
          available_quantity: bi.available_quantity?.toString() ?? "",
          is_fifo: !!bi.is_fifo,
          expiry_date: bi.expiry_date ?? "",
          offered_brand: bi.offered_brand ?? "",
          notes: bi.notes ?? "",
        };
      });
    }
    return { its: itemsArr, brands: brandsMap, bidItemsMap };
  };

  const buildTemplate = (q: Quotation, itemsArr: QuotationItem[], brandsMap: Record<string, ApprovedBrand[]>, bidItemsMap: Record<string, BidItem>) => {
    const header = [
      "ID Item", "Descrição", "Quantidade", "Unidade pedida", "Unidade-base",
      "Marcas homologadas", "Marca ofertada",
      "Embalagem", "Conteúdo (qtd)", "Unidade do conteúdo", "Preço da embalagem (R$)",
      "Pedido mínimo (emb.)", "Disponível (un. base)", "FIFO (SIM/NÃO)",
      "Validade (DD/MM/AAAA)", "Observações do item",
    ];
    const rows = itemsArr.map((it) => {
      const bi = bidItemsMap[it.id];
      const brs = brandsMap[it.id] ?? [];
      return [
        it.id,
        it.description,
        Number(it.quantity),
        it.unit,
        (it.base_unit || it.unit || "").toUpperCase(),
        brs.map((b) => b.brand_name + (b.is_preferred ? " (preferida)" : "")).join(", "),
        bi?.offered_brand ?? "",
        bi?.pack_description ?? "",
        bi?.pack_content_qty ? Number(bi.pack_content_qty) : "",
        bi?.pack_content_unit ?? "",
        bi?.pack_price ? Number(bi.pack_price) : "",
        bi?.min_order_packs ? Number(bi.min_order_packs) : 1,
        bi?.available_quantity ? Number(bi.available_quantity) : "",
        bi?.is_fifo ? "SIM" : "NÃO",
        bi?.expiry_date ? format(new Date(bi.expiry_date), "dd/MM/yyyy") : "",
        bi?.notes ?? "",
      ];
    });
    const wb = XLSX.utils.book_new();
    const wsHeader = XLSX.utils.aoa_to_sheet([
      ["Cotação", q.title],
      ["ID", q.id],
      ["Prazo", format(new Date(q.deadline), "dd/MM/yyyy HH:mm")],
      [],
      ["Instruções:"],
      ["- Preencha as colunas em branco e mantenha 'ID Item' inalterado."],
      ["- FIFO: escreva SIM ou NÃO. Se SIM, informe a Validade no formato DD/MM/AAAA."],
      ["- Salve e use 'Importar planilha' no portal para enviar."],
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, wsHeader, "Proposta");
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    XLSX.writeFile(wb, `proposta_${q.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.xlsx`);
  };

  const downloadTemplate = () => {
    if (!openQuot || items.length === 0) return;
    buildTemplate(openQuot, items, approvedBrands, bidItems);
  };

  const downloadTemplateFor = async (q: Quotation) => {
    const { its, brands, bidItemsMap } = await fetchQuotationData(q);
    if (its.length === 0) {
      toast({ title: "Cotação sem itens", variant: "destructive" });
      return;
    }
    buildTemplate(q, its, brands, bidItemsMap);
  };

  const importTemplateFor = async (q: Quotation, file: File) => {
    await openQuotation(q);
    await importTemplate(file);
  };

  const importTemplate = async (file: File) => {
    if (!openQuot) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets["Itens"] || wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
      if (!sheet) throw new Error("Aba 'Itens' não encontrada");
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      let imported = 0;
      const itemIds = new Set(items.map((i) => i.id));
      const patches: Record<string, BidItem> = { ...bidItems };
      for (const row of json) {
        const id = String(row["ID Item"] ?? "").trim();
        if (!itemIds.has(id)) continue;
        const it = items.find((i) => i.id === id)!;
        const baseUnit = (it.base_unit || it.unit || "UN").toUpperCase();
        const fifo = String(row["FIFO (SIM/NÃO)"] ?? row["FIFO"] ?? "").trim().toUpperCase().startsWith("S");
        let expiry = "";
        const rawExp = row["Validade (DD/MM/AAAA)"] ?? row["Validade"];
        if (fifo && rawExp) {
          if (rawExp instanceof Date) {
            expiry = rawExp.toISOString().slice(0, 10);
          } else {
            const m = String(rawExp).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) expiry = `${m[3]}-${m[2]}-${m[1]}`;
          }
        }
        patches[id] = {
          quotation_item_id: id,
          pack_description: String(row["Embalagem"] ?? ""),
          pack_price: row["Preço da embalagem (R$)"] !== "" ? String(row["Preço da embalagem (R$)"]) : "",
          pack_content_qty: row["Conteúdo (qtd)"] !== "" ? String(row["Conteúdo (qtd)"]) : "1",
          pack_content_unit: String(row["Unidade do conteúdo"] ?? baseUnit).toUpperCase(),
          min_order_packs: row["Pedido mínimo (emb.)"] !== "" ? String(row["Pedido mínimo (emb.)"]) : "1",
          available_quantity: row["Disponível (un. base)"] !== "" ? String(row["Disponível (un. base)"]) : "",
          is_fifo: fifo,
          expiry_date: expiry,
          offered_brand: String(row["Marca ofertada"] ?? "").trim(),
          notes: String(row["Observações do item"] ?? ""),
        };
        imported++;
      }
      setBidItems(patches);
      toast({ title: `Planilha importada`, description: `${imported} itens carregados. Revise e clique em Enviar/Atualizar.` });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    }
  };

  const saveProfile = async () => {
    if (!supplier) return;
    const { error } = await supabase
      .from("suppliers")
      .update({
        phone: profileForm.phone || null,
        contact_name: profileForm.contact_name || null,
        payment_terms: profileForm.payment_terms || null,
        trade_name: profileForm.trade_name || null,
      })
      .eq("id", supplier.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Perfil atualizado" });
    setProfileOpen(false);
    refresh();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold truncate">{supplier?.legal_name ?? "Fornecedor"}</div>
              <div className="text-xs text-muted-foreground">CNPJ {supplier?.cnpj}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
              Perfil
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {!openQuot && (() => {
          const openList = quotations.filter((q) => q.status === "open" && new Date(q.deadline) >= new Date());
          const filteredList = approvedCategoryIds.length > 0
            ? openList.filter((q) => !q.category_id || approvedCategoryIds.includes(q.category_id))
            : openList;
          const targetQ = filteredList[0];
          return (
        <Tabs defaultValue="open">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList className="inline-flex w-auto">
              <TabsTrigger value="open">
                <ClipboardList className="h-4 w-4 mr-2" /> Cotações abertas
              </TabsTrigger>
              <TabsTrigger value="mine">
                <FileText className="h-4 w-4 mr-2" /> Minhas propostas
              </TabsTrigger>
              <TabsTrigger value="orders">
                <Package className="h-4 w-4 mr-2" /> Pedidos recebidos
              </TabsTrigger>
              <TabsTrigger value="offers">
                <Tag className="h-4 w-4 mr-2" /> Minhas ofertas
              </TabsTrigger>
            </TabsList>
            {targetQ && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadTemplateFor(targetQ)}
                  title={filteredList.length > 1 ? `Aplica à cotação: ${targetQ.title}` : undefined}
                >
                  <Download className="h-4 w-4 mr-1" /> Modelo de importação
                </Button>
                <Label htmlFor="import-xlsx-top" className="inline-flex m-0">
                  <span className="inline-flex items-center text-xs px-3 h-9 rounded-md border bg-background hover:bg-accent cursor-pointer">
                    <Upload className="h-4 w-4 mr-1" /> Importar planilha
                  </span>
                  <input
                    id="import-xlsx-top"
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importTemplateFor(targetQ, f);
                      e.target.value = "";
                    }}
                  />
                </Label>
              </div>
            )}
          </div>

          <TabsContent value="open" className="mt-4">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : quotations.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma cotação aberta no momento.</CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {(() => {
                  if (filteredList.length === 0) {
                    return (
                      <Card>
                        <CardContent className="p-8 text-center text-muted-foreground text-sm">
                          {approvedCategoryIds.length === 0
                            ? "Você ainda não tem categorias homologadas. Aguarde aprovação do administrador."
                            : "Nenhuma cotação aberta para suas categorias homologadas no momento."}
                        </CardContent>
                      </Card>
                    );
                  }
                  return filteredList.map((q) => {
                  const myBid = bids.find((b) => b.quotation_id === q.id);
                  return (
                    <Card key={q.id} className="hover:shadow-md transition">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CardTitle className="text-base cursor-pointer" onClick={() => openQuotation(q)}>{q.title}</CardTitle>
                              {myBid && <Badge variant="secondary">Editar até o prazo</Badge>}
                            </div>
                            <CardDescription className="mt-1">Prazo: {format(new Date(q.deadline), "dd/MM/yyyy HH:mm", { locale: ptBR })}</CardDescription>
                          </div>
                          <Button size="sm" className="shrink-0" onClick={() => openQuotation(q)}>
                            Abrir cotação
                          </Button>
                        </div>
                      </CardHeader>
                      {q.description && (
                        <CardContent className="pt-0 text-sm text-muted-foreground line-clamp-2">{q.description}</CardContent>
                      )}
                    </Card>
                  );
                });
                })()}
              </div>
            )}
          </TabsContent>


          <TabsContent value="mine" className="mt-4">
            {bids.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Você ainda não enviou propostas.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cotação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enviada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bids.map((b) => {
                        const q = quotations.find((qq) => qq.id === b.quotation_id);
                        const editable = !!q && q.status === "open" && new Date(q.deadline) >= new Date();
                        return (
                          <TableRow
                            key={b.id}
                            className={q ? "cursor-pointer hover:bg-muted/50" : ""}
                            onClick={() => q && openQuotation(q)}
                          >
                            <TableCell className="font-medium">{q?.title ?? "—"}</TableCell>
                            <TableCell>
                              {editable ? (
                                <Badge variant="secondary">Editável até {format(new Date(q!.deadline), "dd/MM HH:mm", { locale: ptBR })}</Badge>
                              ) : (
                                <Badge variant="outline">Encerrada</Badge>
                              )}
                            </TableCell>
                            <TableCell>{format(new Date(b.submitted_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <SupplierOrdersTab supplierId={supplier?.id ?? null} />
          </TabsContent>

          <TabsContent value="offers" className="mt-4">
            <SupplierOffersTab supplierId={supplier?.id ?? null} />
          </TabsContent>
        </Tabs>
        );
        })()}

        {openQuot && (() => {
          const expired = new Date(openQuot.deadline) < new Date();
          const closed = openQuot.status !== "open";
          const locked = expired || closed;
          const myBid = bids.find((b) => b.quotation_id === openQuot.id);
          const filledItems = items.filter((it) => {
            const bi = bidItems[it.id];
            return bi && Number(bi.pack_price) > 0 && Number(bi.pack_content_qty) > 0;
          });
          const totalProposta = filledItems.reduce((sum, it) => {
            const bi = bidItems[it.id];
            const ppb = calcPricePerBase(bi.pack_price, bi.pack_content_qty);
            return sum + ppb * Number(it.quantity || 0);
          }, 0);
          return (
          <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => setOpenQuot(null)}>
              ← Voltar para cotações
            </Button>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg">{openQuot.title}</CardTitle>
                  {openQuot.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-xl">{openQuot.description}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-xs mt-2">
                    <Badge variant={locked ? "destructive" : "secondary"}>
                      Prazo para envio: {format(new Date(openQuot.deadline), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </Badge>
                    {myBid && !locked && <Badge variant="outline">Editável até o prazo</Badge>}
                    {locked && <Badge variant="destructive">Encerrada</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setOpenQuot(null)}>
                    {locked ? "Fechar" : "Cancelar"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitBid}
                    disabled={savingBid || locked}
                  >
                    {savingBid ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {myBid ? "Atualizar proposta" : "Enviar proposta"}
                  </Button>
                </div>
              </div>
              {/* Condições + Resumo lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
                <div className="rounded-md border bg-background p-2 grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Prazo entrega (dias)</Label>
                    <Input type="number" className="h-8 text-xs" value={bidMeta.delivery_days} onChange={(e) => setBidMeta({ ...bidMeta, delivery_days: e.target.value })} />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground uppercase">Forma de pagamento</Label>
                    <Input className="h-8 text-xs" value={bidMeta.payment_terms} onChange={(e) => setBidMeta({ ...bidMeta, payment_terms: e.target.value })} placeholder="Ex: 30 dias" />
                  </div>
                </div>
                <div className="rounded-md border bg-background px-3 py-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
                  <span><span className="text-muted-foreground">Itens:</span> <strong>{items.length}</strong></span>
                  <span className="text-muted-foreground">·</span>
                  <span><span className="text-muted-foreground">Preench.:</span> <strong>{filledItems.length}/{items.length}</strong></span>
                  <span className="text-muted-foreground">·</span>
                  <span>
                    <span className="text-muted-foreground">Pendentes:</span>{" "}
                    <strong className={items.length - filledItems.length > 0 ? "text-warning" : "text-success"}>
                      {items.length - filledItems.length}
                    </strong>
                  </span>
                  <span className="ml-auto text-sm"><span className="text-muted-foreground">Total:</span> <strong>{fmtMoney(totalProposta)}</strong></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">Itens para cotar ({items.length})</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Buscar item…"
                    className="h-8 text-xs w-48"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={onlyPending ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setOnlyPending((v) => !v)}
                  >
                    Só pendentes
                  </Button>
                </div>
              </div>
              {(() => {
                const search = itemSearch.trim().toLowerCase();
                const filteredItems = items.filter((it) => {
                  if (search && !String(it.description ?? "").toLowerCase().includes(search)) return false;
                  if (onlyPending) {
                    const bi = bidItems[it.id];
                    const isFilled = !!bi?.pack_price && Number(bi.pack_price) > 0;
                    if (isFilled) return false;
                  }
                  return true;
                });
                // Agrupa por categoria
                const groups = new Map<string, QuotationItem[]>();
                for (const it of filteredItems) {
                  const key = (it.category || "Sem categoria").trim() || "Sem categoria";
                  const arr = groups.get(key) || [];
                  arr.push(it);
                  groups.set(key, arr);
                }
                const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                if (sortedGroups.length === 0) {
                  return <div className="text-xs text-muted-foreground py-6 text-center">Nenhum item corresponde aos filtros.</div>;
                }
                return (
                  <>
                    {/* Header único sticky */}
                    <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur border rounded-md px-3 py-1.5 flex items-center gap-2 flex-wrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <div className="min-w-[180px] flex-1 max-w-[280px]">Item</div>
                      <div className="w-[90px]">Preço R$</div>
                      <div className="w-[110px]">Embalagem</div>
                      <div className="w-[70px]">Conteúdo</div>
                      <div className="w-[60px]">Unid.</div>
                      <div className="w-[60px]">Mín</div>
                      <div className="w-[80px]">Disponível</div>
                      <div className="w-[90px]">Validade</div>
                    </div>
                    {sortedGroups.map(([cat, catItems]) => {
                      const filledCount = catItems.filter((it) => {
                        const bi = bidItems[it.id];
                        return !!bi?.pack_price && Number(bi.pack_price) > 0;
                      }).length;
                      const subtotal = catItems.reduce((sum, it) => {
                        const bi = bidItems[it.id];
                        const p = Number(bi?.pack_price ?? 0);
                        const m = Number(bi?.min_order_packs ?? 1) || 1;
                        return sum + (p > 0 ? p * m : 0);
                      }, 0);
                      const collapsed = !!collapsedCats[cat];
                      return (
                        <div key={cat} className="rounded-md border bg-background overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setCollapsedCats((p) => ({ ...p, [cat]: !p[cat] }))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b hover:bg-muted/60 transition text-left"
                          >
                            <span className="text-xs text-muted-foreground">{collapsed ? "▶" : "▼"}</span>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate flex-1">{cat}</div>
                            <Badge variant="outline" className="text-[10px] h-5 shrink-0">{filledCount}/{catItems.length}</Badge>
                            {subtotal > 0 && (
                              <span className="text-[10px] text-muted-foreground shrink-0">Subtotal: <strong className="text-foreground">{fmtMoney(subtotal)}</strong></span>
                            )}
                          </button>
                          {!collapsed && (
                          <div className="divide-y">
                            {catItems.map((it, idx) => {
                              const bi = bidItems[it.id];
                              const baseUnit = (it.base_unit || it.unit || "UN").toUpperCase();
                              const ppb = bi ? calcPricePerBase(bi.pack_price, bi.pack_content_qty) : 0;
                              const filled = !!bi?.pack_price && Number(bi.pack_price) > 0;
                              const brands = approvedBrands[it.id] ?? [];
                              const showDate = !!bi?.expiry_date;
                              return (
                                <div
                                  key={it.id}
                                  className={`px-3 py-2 border-l-4 ${filled ? "border-l-emerald-500" : "border-l-amber-400"} ${idx % 2 === 0 ? "bg-muted/30" : "bg-background"}`}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* Descrição */}
                                    <div className="min-w-[180px] flex-1 max-w-[280px]">
                                      <div className="font-medium text-xs truncate" title={it.description}>{it.description}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {Number(it.quantity)} {it.unit} · base {baseUnit}
                                        {ppb > 0 && <span className="ml-1 text-foreground font-medium">· {fmtMoney(ppb)}/{baseUnit.toLowerCase()}</span>}
                                      </div>
                                    </div>

                                    {/* Marca (se houver) */}
                                    {brands.length > 0 && (
                                      <Select
                                        value={bi?.offered_brand || ""}
                                        onValueChange={(v) => updateBidItem(it.id, { offered_brand: v }, baseUnit)}
                                      >
                                        <SelectTrigger className="h-8 w-[140px] text-xs" title={`Aceitas: ${brands.map(b => b.brand_name).join(", ")}`}>
                                          <SelectValue placeholder="Marca *" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {brands.map((b) => (
                                            <SelectItem key={b.id} value={b.brand_name}>
                                              {b.brand_name}{b.is_preferred ? " ⭐" : ""}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}

                                    {/* Preço */}
                                    <Input className="h-8 text-xs w-[90px]" type="number" step="0.01" min="0" placeholder="0,00"
                                      value={bi?.pack_price ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { pack_price: e.target.value }, baseUnit)} />

                                    {/* Embalagem */}
                                    <Input className="h-8 text-xs w-[110px]" placeholder="Ex: Fardo 30kg"
                                      value={bi?.pack_description ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { pack_description: e.target.value }, baseUnit)} />

                                    {/* Conteúdo */}
                                    <Input className="h-8 text-xs w-[70px]" type="number" step="0.001" min="0" placeholder="0"
                                      value={bi?.pack_content_qty ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { pack_content_qty: e.target.value }, baseUnit)} />

                                    {/* Unid */}
                                    <Input className="h-8 text-xs w-[60px] uppercase" placeholder={baseUnit}
                                      value={bi?.pack_content_unit ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { pack_content_unit: e.target.value.toUpperCase() }, baseUnit)} />

                                    {/* Pedido mín */}
                                    <Input className="h-8 text-xs w-[60px]" type="number" step="1" min="1" placeholder="1"
                                      value={bi?.min_order_packs ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { min_order_packs: e.target.value }, baseUnit)} />

                                    {/* Disponível */}
                                    <Input className="h-8 text-xs w-[80px]" type="number" step="0.01" min="0" placeholder="0"
                                      value={bi?.available_quantity ?? ""}
                                      onChange={(e) => updateBidItem(it.id, { available_quantity: e.target.value }, baseUnit)} />

                                    {/* Validade — colapsado por padrão */}
                                    {showDate ? (
                                      <Input
                                        type="date"
                                        className="h-8 w-[130px] text-xs"
                                        value={bi?.expiry_date ?? ""}
                                        onChange={(e) => updateBidItem(it.id, { expiry_date: e.target.value, is_fifo: !!e.target.value }, baseUnit)}
                                      />
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                                        onClick={() => updateBidItem(it.id, { expiry_date: new Date().toISOString().slice(0, 10), is_fifo: true }, baseUnit)}
                                      >
                                        + validade
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
            </CardContent>
          </Card>
          </>
          );
        })()}
      </main>


      {/* Modal Perfil */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Meu perfil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome fantasia</Label>
              <Input value={profileForm.trade_name} onChange={(e) => setProfileForm({ ...profileForm, trade_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Pessoa de contato</Label>
              <Input value={profileForm.contact_name} onChange={(e) => setProfileForm({ ...profileForm, contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Condições de pagamento padrão</Label>
              <Textarea rows={2} value={profileForm.payment_terms} onChange={(e) => setProfileForm({ ...profileForm, payment_terms: e.target.value })} placeholder="Ex: 30/60/90 dias" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancelar</Button>
            <Button onClick={saveProfile}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
