// Modal único de revisão DF-e: cria/usa inventory_invoice em modo draft e recebe linha a linha (alimenta estoque central).
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, Sparkles, X, Check, Search, Lock, ShieldCheck, Settings2, PackagePlus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import SupplierConversionPopover from "./SupplierConversionPopover";
import QuickCreateProductDialog from "./QuickCreateProductDialog";

interface InvProd {
  id: string; name: string;
  unit?: string | null;
}
interface Store { id: string; name: string }

interface DfeNote {
  id: string;
  supplier_name: string | null;
  supplier_cnpj: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  emission_date: string | null;
  total_amount: number | null;
  status: string;
  target_store_id: string | null;
  imported_invoice_id: string | null;
  raw_payload: any;
}
interface DfeItem {
  id: string;
  line_number: number;
  description: string;
  unit: string | null;
  quantity: number;
  unit_value: number;
  total_value: number;
  suggested_product_id: string | null;
  suggested_confidence: number | null;
  suggested_pack_size: number | null;
  suggested_pack_unit: string | null;
  mapped_product_id: string | null;
}
interface InvItem {
  id: string;
  line_number: number;
  product_id: string | null;
  received: boolean;
}
interface Conv { pack_size: number; purchase_unit: string | null; package_description: string | null }
interface MapEntry { product_id: string; hits: number }
const CONFIRM_THRESHOLD = 3;
const STRONG_CONF = 0.7;
const normDesc = (s: string) => s.trim().toLowerCase();

interface Props {
  noteId: string | null;
  onClose: () => void;
  onImported?: () => void;
}

export default function DfeNoteDialog({ noteId, onClose, onImported }: Props) {
  const [note, setNote] = useState<DfeNote | null>(null);
  const [items, setItems] = useState<DfeItem[]>([]);
  const [products, setProducts] = useState<InvProd[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [invItems, setInvItems] = useState<Record<number, InvItem>>({}); // por line_number
  const [conversions, setConversions] = useState<Record<string, Conv>>({}); // por product_id (fornecedor)
  const [productConvs, setProductConvs] = useState<Record<string, { pack_size: number; purchase_unit: string | null }>>({}); // por product_id (product_conversions tipo 'compra')
  const [supplierMap, setSupplierMap] = useState<Record<string, MapEntry>>({}); // por description_norm
  const [loading, setLoading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkReceiving, setBulkReceiving] = useState(false);
  const [receivingLine, setReceivingLine] = useState<number | null>(null);
  const [aiRan, setAiRan] = useState(false);
  const [quickCreateFor, setQuickCreateFor] = useState<DfeItem | null>(null);

  const productById = useMemo(() => {
    const m: Record<string, InvProd> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const reloadInvItems = useCallback(async (invoiceId: string) => {
    const { data } = await supabase
      .from("inventory_invoice_items")
      .select("id, line_number, product_id, received")
      .eq("invoice_id", invoiceId);
    const map: Record<number, InvItem> = {};
    for (const it of (data ?? []) as InvItem[]) map[it.line_number] = it;
    setInvItems(map);
  }, []);

  const reloadConversions = useCallback(async (supplierCnpj: string) => {
    const { data } = await supabase
      .from("dfe_supplier_unit_conversion")
      .select("product_id, pack_size, purchase_unit, package_description")
      .eq("supplier_cnpj", supplierCnpj);
    const m: Record<string, Conv> = {};
    for (const r of (data ?? []) as any[]) {
      m[r.product_id] = {
        pack_size: Number(r.pack_size) || 1,
        purchase_unit: r.purchase_unit,
        package_description: r.package_description,
      };
    }
    setConversions(m);
  }, []);

  const reloadSupplierMap = useCallback(async (supplierCnpj: string) => {
    const { data } = await supabase
      .from("dfe_supplier_product_map")
      .select("description_norm, product_id, hits")
      .eq("supplier_cnpj", supplierCnpj);
    const m: Record<string, MapEntry> = {};
    for (const r of (data ?? []) as any[]) {
      m[r.description_norm] = { product_id: r.product_id, hits: Number(r.hits) || 1 };
    }
    setSupplierMap(m);
    return m;
  }, []);

  const load = useCallback(async () => {
    if (!noteId) return;
    setLoading(true);
    const [noteRes, itemsRes, prodRes, storesRes] = await Promise.all([
      supabase.from("dfe_inbound_notes").select("*").eq("id", noteId).single(),
      supabase.from("dfe_inbound_items").select("*").eq("note_id", noteId).order("line_number"),
      supabase.from("inventory_products")
        .select("id, name, unit")
        .eq("is_active", true).order("name").limit(5000),
      supabase.from("stores").select("id, name").eq("is_virtual", false).eq("is_active", true).order("name"),
    ]);
    const n = (noteRes.data as DfeNote | null) ?? null;
    let rawItems = (itemsRes.data as DfeItem[]) ?? [];
    const storeList = (storesRes.data as Store[]) ?? [];
    setNote(n);
    const prodList = (prodRes.data as InvProd[]) ?? [];
    setProducts(prodList);
    setStores(storeList);

    // Carrega fatores de conversão de compra (tabela product_conversions) para todos os produtos ativos
    if (prodList.length > 0) {
      const { data: pcs } = await supabase
        .from("product_conversions")
        .select("product_id, from_unit, from_qty, to_qty, is_default")
        .eq("conversion_type", "compra")
        .in("product_id", prodList.map((p) => p.id));
      const pcMap: Record<string, { pack_size: number; purchase_unit: string | null }> = {};
      ((pcs ?? []) as any[]).forEach((r) => {
        const packSize = Number(r.from_qty) > 0 ? Number(r.to_qty) / Number(r.from_qty) : Number(r.to_qty);
        if (!pcMap[r.product_id] || r.is_default) {
          pcMap[r.product_id] = { pack_size: packSize, purchase_unit: r.from_unit };
        }
      });
      setProductConvs(pcMap);
    }

    // Default loja destino = ESTOQUE CENTRAL quando ainda não definido e nota não importada
    if (n && !n.target_store_id && !n.imported_invoice_id) {
      const central = storeList.find((s) => s.name.toUpperCase().includes("ESTOQUE CENTRAL"));
      if (central) {
        await supabase.from("dfe_inbound_notes").update({ target_store_id: central.id }).eq("id", n.id);
        n.target_store_id = central.id;
        setNote({ ...n });
      }
    }

    // Auto-reparse: se a nota não tem itens, chama dfe-sync para baixar XML + ciência
    if (rawItems.length === 0 && n && !n.imported_invoice_id) {
      setReparsing(true);
      try {
        await supabase.functions.invoke("dfe-sync", { body: { reparse_note_id: n.id } });
        const re = await supabase.from("dfe_inbound_items").select("*").eq("note_id", n.id).order("line_number");
        rawItems = (re.data as DfeItem[]) ?? [];
        // Recarrega a nota — dfe-sync pode ter preenchido supplier_cnpj a partir do XML
        const { data: refreshed } = await supabase.from("dfe_inbound_notes").select("*").eq("id", n.id).single();
        if (refreshed) { Object.assign(n, refreshed); setNote(refreshed as DfeNote); }
        if (rawItems.length === 0) {
          toast.info("Nota ainda sem XML detalhado disponível na SEFAZ. Tente novamente em alguns minutos.");
        }
      } catch (e: any) {
        toast.error("Falha ao buscar itens da SEFAZ: " + (e.message ?? e));
      } finally {
        setReparsing(false);
      }
    }

    // IA: para itens sem vínculo nem sugestão, pede sugestão ao Lovable AI Gateway
    const semSugestao = rawItems.filter((it) => !it.mapped_product_id && !it.suggested_product_id);
    if (semSugestao.length > 0 && n) {
      setAiSuggesting(true);
      try {
        const { data: aiData } = await supabase.functions.invoke("dfe-suggest-product", { body: { note_id: n.id } });
        if (aiData?.suggested > 0) {
          const re = await supabase.from("dfe_inbound_items").select("*").eq("note_id", n.id).order("line_number");
          rawItems = (re.data as DfeItem[]) ?? rawItems;
          toast.success(`IA sugeriu produto para ${aiData.suggested} item(ns)`);
        }
        setAiRan(true);
      } catch (e: any) {
        console.warn("AI suggest failed", e);
      } finally {
        setAiSuggesting(false);
      }
    } else {
      setAiRan(true);
    }

    const map = n?.supplier_cnpj ? await reloadSupplierMap(n.supplier_cnpj) : {};

    // auto-aplica sugestão (e separa confirmado vs sugestão)
    let autoSug = 0;
    let autoConfirmed = 0;
    const applied = rawItems.map((it) => {
      if (!it.mapped_product_id && it.suggested_product_id) {
        const entry = map[normDesc(it.description)];
        const isConfirmed = entry && entry.product_id === it.suggested_product_id && entry.hits >= CONFIRM_THRESHOLD;
        const isStrong = (it.suggested_confidence ?? 0) >= STRONG_CONF;
        // Só auto-vincula se for confirmado pelo histórico OU sugestão forte da IA.
        // Sugestão fraca fica visível como badge âmbar mas exige aprovação manual.
        if (isConfirmed || isStrong) {
          if (isConfirmed) autoConfirmed++; else autoSug++;
          return { ...it, mapped_product_id: it.suggested_product_id };
        }
      }
      return it;
    });
    setItems(applied);
    const msgs: string[] = [];
    if (autoConfirmed > 0) msgs.push(`${autoConfirmed} padrão deste fornecedor`);
    if (autoSug > 0) msgs.push(`${autoSug} sugestão`);
    if (msgs.length) toast.success(`Vinculados automaticamente: ${msgs.join(" + ")}`);

    if (n?.supplier_cnpj) await reloadConversions(n.supplier_cnpj);
    if (n?.imported_invoice_id) await reloadInvItems(n.imported_invoice_id);

    setLoading(false);
  }, [noteId, reloadConversions, reloadInvItems, reloadSupplierMap]);

  useEffect(() => {
    setAiRan(false);
    if (noteId) load();
    else { setNote(null); setItems([]); setInvItems({}); setConversions({}); setSupplierMap({}); }
  }, [noteId, load]);

  // Cadastra produto rápido a partir da descrição da NF e vincula automaticamente.
  const handleQuickCreated = async (it: DfeItem, created: { id: string; name: string; unit: string | null; purchase_unit: string | null; pack_size: number | null }) => {
    // adiciona ao catálogo local
    setProducts((prev) => prev.some((p) => p.id === created.id) ? prev : [...prev, created]);
    // vincula no item da nota
    setMapped(it.id, created.id);
    await supabase.from("dfe_inbound_items")
      .update({ mapped_product_id: created.id })
      .eq("id", it.id);
    // 1º hit pro fornecedor (alimenta o auto-aceite em 3x)
    if (note?.supplier_cnpj) {
      await supabase.rpc("dfe_register_supplier_map", {
        _cnpj: note.supplier_cnpj,
        _desc_norm: normDesc(it.description),
        _product_id: created.id,
      });
      await reloadSupplierMap(note.supplier_cnpj);
    }
    toast.success(`"${created.name}" cadastrado e vinculado`);
  };

  // ----- métricas -----
  const semProduto = items.filter((i) => !i.mapped_product_id).length;
  const pendentes = items.filter((i) => i.mapped_product_id && !invItems[i.line_number]?.received).length;
  const recebidos = items.filter((i) => invItems[i.line_number]?.received).length;
  const totalGeral = items.reduce((s, i) => s + Number(i.total_value || 0), 0);

  const setMapped = (id: string, productId: string | null) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, mapped_product_id: productId } : i));

  // Aceita sugestão: vincula + incrementa hits no fornecedor (3 → vira padrão)
  const acceptSuggestion = async (it: DfeItem) => {
    if (!it.suggested_product_id) return;
    setMapped(it.id, it.suggested_product_id);
    await supabase.from("dfe_inbound_items")
      .update({ mapped_product_id: it.suggested_product_id })
      .eq("id", it.id);
    if (note?.supplier_cnpj) {
      await supabase.rpc("dfe_register_supplier_map", {
        _cnpj: note.supplier_cnpj,
        _desc_norm: normDesc(it.description),
        _product_id: it.suggested_product_id,
      });
      await reloadSupplierMap(note.supplier_cnpj);
    }
    toast.success("Sugestão aceita");
  };


  const setStore = async (storeId: string) => {
    if (!note) return;
    await supabase.from("dfe_inbound_notes").update({ target_store_id: storeId }).eq("id", note.id);
    setNote({ ...note, target_store_id: storeId });
  };

  // ----- conversão efetiva (fornecedor > produto > NF) -----
  const effectiveConv = (productId: string | null): { pack_size: number; source: "supplier" | "product" | "none" } => {
    if (!productId) return { pack_size: 1, source: "none" };
    if (conversions[productId]) return { pack_size: conversions[productId].pack_size, source: "supplier" };
    const pc = productConvs[productId];
    if (pc && pc.pack_size > 0) return { pack_size: pc.pack_size, source: "product" };
    return { pack_size: 1, source: "none" };
  };

  // ----- garante invoice draft -----
  const ensureInvoice = async (): Promise<string> => {
    if (!note) throw new Error("Nota não carregada");
    if (note.imported_invoice_id) return note.imported_invoice_id;
    if (!note.target_store_id) throw new Error("Defina a loja destino");
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error("Sem usuário autenticado");

    // Reusa invoice existente com a mesma chave_acesso (constraint inventory_invoices_chave_uniq).
    let invId: string | null = null;
    if (note.chave_acesso) {
      const { data: existing } = await supabase
        .from("inventory_invoices")
        .select("id")
        .eq("invoice_key", note.chave_acesso)
        .maybeSingle();
      if (existing?.id) invId = existing.id;
    }

    if (!invId) {
      const { data: inv, error: invErr } = await supabase.from("inventory_invoices").insert({
        store_id: note.target_store_id,
        created_by: uid,
        supplier_name: note.supplier_name,
        supplier_cnpj: note.supplier_cnpj,
        invoice_number: note.numero,
        invoice_series: note.serie,
        invoice_key: note.chave_acesso,
        issue_date: note.emission_date ? note.emission_date.slice(0, 10) : null,
        total_amount: note.total_amount,
        extraction_status: "done",
        raw_extraction: note.raw_payload,
      }).select("id").single();
      if (invErr || !inv) throw invErr ?? new Error("Falha ao criar nota");
      invId = inv.id;

      // cria todas as linhas em draft (sem received)
      const payload = items.map((it) => ({
        invoice_id: invId!,
        line_number: it.line_number,
        original_description: it.description,
        unit: it.unit ?? "UN",
        quantity: it.quantity,
        unit_value: it.unit_value,
        total_value: it.total_value,
        product_id: it.mapped_product_id,
      }));
      if (payload.length > 0) {
        const { error: itemsErr } = await supabase.from("inventory_invoice_items").insert(payload);
        if (itemsErr) throw itemsErr;
      }
    }

    await supabase.from("dfe_inbound_notes").update({
      imported_invoice_id: invId,
      status: "in_review",
    }).eq("id", note.id);

    setNote({ ...note, imported_invoice_id: invId, status: "in_review" });
    await reloadInvItems(invId);
    return invId;
  };

  // ----- recebe 1 item -----
  const receiveOne = async (dfeItem: DfeItem) => {
    if (!note) return;
    if (!dfeItem.mapped_product_id) { toast.error("Vincule um produto antes de receber"); return; }
    setReceivingLine(dfeItem.line_number);
    try {
      const invoiceId = await ensureInvoice();

      // localiza linha do invoice
      let invItem = invItems[dfeItem.line_number];
      if (!invItem) {
        const { data: fresh } = await supabase
          .from("inventory_invoice_items").select("id, line_number, product_id, received")
          .eq("invoice_id", invoiceId).eq("line_number", dfeItem.line_number).maybeSingle();
        invItem = (fresh as InvItem | null) ?? undefined as any;
      }
      if (!invItem) throw new Error("Linha do recebimento não encontrada");
      if (invItem.received) { toast.info("Item já recebido"); return; }

      // aplica conversão e atualiza linha antes do receive
      const { pack_size } = effectiveConv(dfeItem.mapped_product_id);
      const qty = Number(dfeItem.quantity) * pack_size;
      const unitVal = pack_size > 0 ? Number(dfeItem.unit_value) / pack_size : Number(dfeItem.unit_value);
      const total = Number(dfeItem.total_value);
      await supabase.from("inventory_invoice_items").update({
        product_id: dfeItem.mapped_product_id,
        quantity: qty,
        unit_value: unitVal,
        total_value: total,
      }).eq("id", invItem.id);

      // dispara entrada no estoque
      const { error: rpcErr } = await supabase.rpc("receive_invoice_item", { _item_id: invItem.id });
      if (rpcErr) throw rpcErr;

      // grava aprendizado fornecedor↔produto (incrementa hits)
      if (note.supplier_cnpj) {
        await supabase.rpc("dfe_register_supplier_map", {
          _cnpj: note.supplier_cnpj,
          _desc_norm: normDesc(dfeItem.description),
          _product_id: dfeItem.mapped_product_id,
        });
        await reloadSupplierMap(note.supplier_cnpj);
      }

      await reloadInvItems(invoiceId);
      toast.success(`Item #${dfeItem.line_number} recebido no estoque`);

      // se foi o último, marca nota como imported
      const restantes = items.filter((i) => i.id !== dfeItem.id)
        .some((i) => !invItems[i.line_number]?.received);
      if (!restantes) {
        await supabase.from("dfe_inbound_notes").update({ status: "imported" }).eq("id", note.id);
        toast.success("Todos os itens recebidos — nota importada");
        onImported?.();
        onClose();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao receber item");
    } finally {
      setReceivingLine(null);
    }
  };

  const receiveAllPending = async () => {
    setBulkReceiving(true);
    try {
      const pendingItems = items.filter((i) => i.mapped_product_id && !invItems[i.line_number]?.received);
      for (const it of pendingItems) {
        // eslint-disable-next-line no-await-in-loop
        await receiveOne(it);
      }
    } finally { setBulkReceiving(false); }
  };

  const saveMappings = async () => {
    if (!note) return;
    setSaving(true);
    try {
      for (const it of items) {
        await supabase.from("dfe_inbound_items")
          .update({ mapped_product_id: it.mapped_product_id })
          .eq("id", it.id);
        if (it.mapped_product_id && note.supplier_cnpj) {
          await supabase.rpc("dfe_register_supplier_map", {
            _cnpj: note.supplier_cnpj,
            _desc_norm: normDesc(it.description),
            _product_id: it.mapped_product_id,
          });
        }
      }
      // se já tem invoice, sincroniza product_id nas linhas ainda não recebidas
      if (note.imported_invoice_id) {
        for (const it of items) {
          const inv = invItems[it.line_number];
          if (inv && !inv.received) {
            await supabase.from("inventory_invoice_items")
              .update({ product_id: it.mapped_product_id }).eq("id", inv.id);
          }
        }
      }
      if (note.supplier_cnpj) await reloadSupplierMap(note.supplier_cnpj);
      toast.success("Vínculos salvos");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const refuse = async (action: "refuse" | "unknown") => {
    if (!note) return;
    const motivo = prompt(action === "refuse"
      ? "Justificativa (15-255 caracteres) para RECUSAR a nota:"
      : "Justificativa (15-255 caracteres) para DESCONHECER a nota:");
    if (!motivo) return;
    const { error } = await supabase.functions.invoke("dfe-action", {
      body: { note_id: note.id, action, justificativa: motivo },
    });
    if (error) toast.error(error.message);
    else { toast.success("Manifestação enviada"); onImported?.(); onClose(); }
  };

  if (!noteId) return null;

  const storeName = stores.find((s) => s.id === note?.target_store_id)?.name;

  return (
    <Dialog open={!!noteId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {note?.supplier_name ?? "Nota fiscal"}
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            {note?.numero && <span>NF <strong>{note.numero}</strong></span>}
            {note?.total_amount != null && (
              <span>• Total <strong className="text-foreground">R$ {Number(note.total_amount).toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></span>
            )}
            <span className="flex items-center gap-1">•
              <Select value={note?.target_store_id ?? ""} onValueChange={setStore} disabled={!!note?.imported_invoice_id}>
                <SelectTrigger className="h-7 w-[200px] ml-1"><SelectValue placeholder="Loja destino" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </span>
            {note?.emission_date && <span>• Emissão {new Date(note.emission_date).toLocaleDateString("pt-BR")}</span>}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="secondary">{items.length} itens</Badge>
            {pendentes > 0 && <Badge variant="default">{pendentes} pronto{pendentes === 1 ? "" : "s"} para receber</Badge>}
            {semProduto > 0 && <Badge variant="destructive">{semProduto} sem produto</Badge>}
            {recebidos > 0 && <Badge variant="outline" className="border-success text-success">{recebidos} recebido{recebidos === 1 ? "" : "s"}</Badge>}
          </div>
        </DialogHeader>

        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Itens ({items.length})</TabsTrigger>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="warranty">Garantia</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-3 mt-3">
            {pendentes > 0 && (
              <Button
                onClick={receiveAllPending}
                disabled={bulkReceiving || !note?.target_store_id}
                className="w-full sm:w-auto gap-1"
              >
                {bulkReceiving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Check className="h-4 w-4" /> Receber {pendentes} pendente{pendentes === 1 ? "" : "s"}
              </Button>
            )}

            {loading || reparsing || aiSuggesting ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {reparsing && <p className="text-xs text-muted-foreground">Solicitando XML detalhado à SEFAZ (ciência + download)…</p>}
                {aiSuggesting && !reparsing && <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" /> IA analisando itens e sugerindo produtos do estoque…</p>}
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum item disponível ainda — a SEFAZ pode levar alguns minutos para liberar o XML completo após a ciência. Feche e abra novamente em instantes.
              </p>
            ) : items.map((it) => {
              const suggested = it.suggested_product_id ? productById[it.suggested_product_id] : null;
              const mappedProd = it.mapped_product_id ? productById[it.mapped_product_id] : null;
              const conv = effectiveConv(it.mapped_product_id);
              const recebido = invItems[it.line_number]?.received ?? false;
              const isReceiving = receivingLine === it.line_number;
              const mapEntry = supplierMap[normDesc(it.description)];
              const isConfirmed = !!(suggested && mapEntry && mapEntry.product_id === suggested.id && mapEntry.hits >= CONFIRM_THRESHOLD);
              const isStrongSug = (it.suggested_confidence ?? 0) >= STRONG_CONF;

              return (
                <div key={it.id} className={`rounded-lg border p-3 space-y-2 ${recebido ? "bg-muted/30 opacity-70" : ""}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">#{it.line_number}</Badge>
                      {recebido && (
                        <Badge variant="outline" className="border-success text-success gap-1">
                          <Check className="h-3 w-3" /> Recebido
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!it.mapped_product_id && !recebido && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setQuickCreateFor(it)}
                          className="gap-1 border-primary text-primary hover:bg-primary/10"
                        >
                          <PackagePlus className="h-3 w-3" /> Cadastrar produto
                        </Button>
                      )}
                      {suggested && it.mapped_product_id !== suggested.id && !recebido && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acceptSuggestion(it)}
                          className="gap-1 border-primary text-primary hover:bg-primary/10"
                        >
                          {isConfirmed ? <ShieldCheck className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                          Aceitar: {suggested.name}
                        </Button>
                      )}
                      {!recebido && (
                        <Button
                          size="sm"
                          onClick={() => receiveOne(it)}
                          disabled={!it.mapped_product_id || isReceiving || bulkReceiving || !note?.target_store_id}
                          className="gap-1"
                        >
                          {isReceiving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Receber
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Descrição (da nota)</Label>
                    <Input value={it.description} readOnly />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_80px_100px_120px] gap-2">
                    <div>
                      <Label className="text-xs">Produto vinculado</Label>
                      <ProductPicker
                        products={products}
                        value={it.mapped_product_id}
                        onChange={(v) => setMapped(it.id, v)}
                        disabled={recebido}
                      />
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {!recebido && it.mapped_product_id && note?.supplier_cnpj && conv.source === "none" && it.suggested_pack_size && it.suggested_pack_size > 0 && mappedProd?.unit && (it.suggested_pack_unit ?? "").trim().toUpperCase() === mappedProd.unit.trim().toUpperCase() && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              const { error } = await supabase.from("dfe_supplier_unit_conversion").upsert({
                                supplier_cnpj: note.supplier_cnpj,
                                product_id: it.mapped_product_id,
                                purchase_unit: it.unit || null,
                                pack_size: Number(it.suggested_pack_size),
                                package_description: null,
                                last_used_at: new Date().toISOString(),
                              }, { onConflict: "supplier_cnpj,product_id" });
                              if (error) return toast.error(error.message);
                              toast.success("Conversão da NF aceita");
                              if (note?.supplier_cnpj) reloadConversions(note.supplier_cnpj);
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Aceitar sugestão NF: 1 {it.unit ?? "emb"} = {it.suggested_pack_size} {it.suggested_pack_unit}
                          </Button>
                        )}
                        {!recebido && it.mapped_product_id && note?.supplier_cnpj && (
                          <SupplierConversionPopover
                            supplierCnpj={note.supplier_cnpj}
                            productId={it.mapped_product_id}
                            productName={mappedProd?.name}
                            baseUnit={mappedProd?.unit ?? null}
                            nfQuantity={Number(it.quantity)}
                            nfUnitValue={Number(it.quantity) > 0 ? Number(it.total_value) / Number(it.quantity) : Number(it.unit_value)}
                            nfPurchaseUnit={it.unit}
                            suggestedPackSize={it.suggested_pack_size}
                            suggestedPackUnit={it.suggested_pack_unit}
                            onSaved={() => note?.supplier_cnpj && reloadConversions(note.supplier_cnpj)}
                            trigger={
                              <Button
                                type="button"
                                size="sm"
                                variant={conv.source === "supplier" ? "secondary" : "outline"}
                                className="h-7 gap-1 text-xs"
                              >
                                <Settings2 className="h-3 w-3" />
                                {conv.source === "supplier"
                                  ? `Conversão deste fornecedor: 1 ${it.unit ?? "emb"} = ${conv.pack_size} ${mappedProd?.unit ?? "un"}`
                                  : conv.source === "product"
                                    ? `Ajustar p/ este fornecedor (padrão produto ×${conv.pack_size})`
                                    : "Ajustar conversão p/ este fornecedor"}
                              </Button>
                            }
                          />
                        )}
                        {!recebido && it.mapped_product_id && !note?.supplier_cnpj && (
                          <span className="text-[11px] text-muted-foreground italic">
                            Sem CNPJ do fornecedor — conversão por fornecedor indisponível.
                          </span>
                        )}
                        {!it.mapped_product_id && (
                          <span className="text-[10px] text-muted-foreground italic">
                            Vincule um produto para configurar a conversão deste fornecedor.
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Unidade</Label>
                      <Input value={it.unit ?? ""} readOnly />
                    </div>
                     <div>
                       <Label className="text-xs">Quantidade (NF)</Label>
                       <Input value={Number(it.quantity).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:4})} readOnly />
                     </div>
                     <div>
                       <Label className="text-xs">Valor unit. (NF)</Label>
                       <Input
                         value={`R$ ${(Number(it.quantity) > 0 ? Number(it.total_value) / Number(it.quantity) : Number(it.unit_value)).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                         readOnly
                       />
                     </div>
                  </div>
                  {conv.source !== "none" && it.mapped_product_id && conv.pack_size !== 1 && (
                    <div className="rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5 text-[11px] text-foreground">
                      <span className="font-medium">Conversão {conv.source === "supplier" ? "do fornecedor" : "padrão do produto"}:</span>{" "}
                      1 {it.unit ?? "emb"} = {conv.pack_size} {mappedProd?.unit ?? "un"} →{" "}
                      entra no estoque <strong>{(Number(it.quantity) * conv.pack_size).toLocaleString("pt-BR")} {mappedProd?.unit ?? "un"}</strong>
                      {" "}a <strong>R$ {(Number(it.unit_value) / (conv.pack_size || 1)).toLocaleString("pt-BR",{minimumFractionDigits:4})}</strong>/{mappedProd?.unit ?? "un"}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground text-right">
                    Total: R$ {Number(it.total_value).toLocaleString("pt-BR",{minimumFractionDigits:2})}
                  </div>
                </div>
              );
            })}
            {(() => {
              const totalNf = Number(note?.total_amount ?? 0);
              const outras = totalNf > 0 ? Math.max(0, totalNf - totalGeral) : 0;
              return (
                <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Soma dos itens</span>
                    <span className="font-medium">R$ {totalGeral.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outras despesas (frete/seguro/outros)</span>
                    <span className="font-medium">R$ {outras.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="font-semibold">Total da NF</span>
                    <span className="font-bold">R$ {totalNf.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="details" className="text-sm space-y-1 mt-3">
            <p><strong>Fornecedor:</strong> {note?.supplier_name ?? "—"}</p>
            <p><strong>CNPJ:</strong> {note?.supplier_cnpj ?? "—"}</p>
            <p><strong>Chave:</strong> <span className="font-mono text-xs break-all">{note?.chave_acesso ?? "—"}</span></p>
            <p><strong>Série:</strong> {note?.serie ?? "—"} • <strong>Número:</strong> {note?.numero ?? "—"}</p>
            <p><strong>Emissão:</strong> {note?.emission_date ? new Date(note.emission_date).toLocaleString("pt-BR") : "—"}</p>
            <p><strong>Loja destino:</strong> {storeName ?? "—"}</p>
            <p><strong>Status:</strong> {note?.status ?? "—"}</p>
          </TabsContent>

          <TabsContent value="warranty" className="text-sm text-muted-foreground mt-3">
            Garantias de equipamentos vinculadas a esta nota aparecerão aqui após importação.
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" className="text-destructive" onClick={() => refuse("unknown")}>
            <X className="h-4 w-4 mr-1" /> Não reconheço esta nota
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={saveMappings} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar alterações
          </Button>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
      {quickCreateFor && (
        <QuickCreateProductDialog
          open={!!quickCreateFor}
          onOpenChange={(v) => { if (!v) setQuickCreateFor(null); }}
          defaultName={quickCreateFor.description}
          defaultUnit={quickCreateFor.unit}
          defaultPurchaseUnit={quickCreateFor.unit}
          defaultPackSize={1}
          onCreated={(p) => {
            const item = quickCreateFor;
            setQuickCreateFor(null);
            if (item) void handleQuickCreated(item, p);
          }}
        />
      )}
    </Dialog>
  );
}

function ProductPicker({ products, value, onChange, disabled }: {
  products: InvProd[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);
  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 30);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 text-left text-sm border rounded-md bg-background hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 truncate"
      >
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        {selected ? selected.name : <span className="text-muted-foreground">Selecionar produto…</span>}
      </button>
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2 border-b sticky top-0 bg-popover">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-8"
            />
          </div>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => { onChange(null); setOpen(false); }}
          >— sem vínculo —</button>
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(p.id); setOpen(false); setSearch(""); }}
            >{p.name}</button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">Nada encontrado</p>
          )}
        </div>
      )}
    </div>
  );
}
