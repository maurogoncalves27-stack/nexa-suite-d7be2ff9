import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Upload, Trash2, FileText, Image as ImageIcon, Save, Sparkles, Plus, X, AlertTriangle, FileCode, QrCode, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useInventoryPermission } from "@/hooks/useInventoryPermission";
import { toast } from "sonner";
import { InventoryItemsEditor, InvoiceItemDraft } from "./InventoryItemsEditor";
import { QrCodeScanner } from "./QrCodeScanner";
import { InvoiceDetailDialog } from "./InvoiceDetailDialog";
import { sortStores } from "@/lib/storeSort";

const BUCKET = "inventory-invoices";

interface UploadedFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  kind: "invoice" | "boleto" | "other";
}

interface BoletoDraft {
  parcela: number;
  vencimento: string;
  valor: string;
  codigo_barras: string;
  linha_digitavel: string;
  beneficiario: string;
}

interface InvoiceDraft {
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string;
  valor_total: string;
  observacoes: string;
}

const emptyInvoice: InvoiceDraft = {
  fornecedor_nome: "",
  fornecedor_cnpj: "",
  numero: "",
  serie: "",
  chave_acesso: "",
  data_emissao: "",
  valor_total: "",
  observacoes: "",
};

interface Store {
  id: string;
  name: string;
}

interface InvoiceListItem {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  total_amount: number | null;
  issue_date: string | null;
  extraction_status: string;
  created_at: string;
  store_id: string;
  no_invoice?: boolean | null;
}

export const InventoryReceivingPanel = () => {
  const { user } = useAuth();
  const { canReceive, storeId: defaultStoreId, loading: permLoading } = useInventoryPermission();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [parsingXml, setParsingXml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDraft>(emptyInvoice);
  const [boletos, setBoletos] = useState<BoletoDraft[]>([]);
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);
  const [recent, setRecent] = useState<InvoiceListItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [savingBoletos, setSavingBoletos] = useState(false);
  const [noInvoice, setNoInvoice] = useState(false);

  // Atalhos via hash:
  // #boletos -> rola até a seção de boletos e adiciona uma linha em branco
  // #sem-nota -> ativa o modo "compra sem nota" e rola até o topo
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#sem-nota") {
      setNoInvoice(true);
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
      return;
    }
    if (hash !== "#boletos") return;
    const t = setTimeout(() => {
      const el = document.getElementById("boletos");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setBoletos((prev) => (prev.length === 0
        ? [{ parcela: 1, vencimento: "", valor: "", codigo_barras: "", linha_digitavel: "", beneficiario: "" }]
        : prev));
    }, 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name");
      setStores(sortStores(data ?? []));
      if (defaultStoreId && !selectedStore) setSelectedStore(defaultStoreId);
      else if (!selectedStore && data && data.length === 1) setSelectedStore(data[0].id);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStoreId]);

  const loadRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from("inventory_invoices")
      .select("id, supplier_name, invoice_number, total_amount, issue_date, extraction_status, created_at, store_id, no_invoice")
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent((data ?? []) as InvoiceListItem[]);
    setLoadingRecent(false);
  };

  useEffect(() => {
    loadRecent();
  }, []);

  const handleSelectFiles = () => fileInputRef.current?.click();
  const handleSelectXml = () => xmlInputRef.current?.click();

  const runExtraction = async (sourceFiles = files) => {
    if (!sourceFiles.length) {
      toast.error("Envie ao menos um arquivo");
      return;
    }
    // Aceita imagens e PDFs — a edge function baixa e envia inline para a IA.
    const aiFiles = sourceFiles.filter(
      (f) => f.mime.startsWith("image/") || f.mime === "application/pdf",
    );
    if (aiFiles.length === 0) {
      toast.error("Envie fotos (JPG/PNG) ou PDF da nota.");
      return;
    }
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-invoice", {
        body: { files: aiFiles.map((f) => ({ url: f.url, mime_type: f.mime })) },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha na extração");
      const ext = data.data as {
        nota?: Partial<InvoiceDraft> & { valor_total?: number };
        boletos?: Array<Partial<BoletoDraft> & { valor?: number }>;
        observacoes?: string;
      };
      const hasNota =
        ext.nota &&
        Object.values(ext.nota).some((v) => v !== null && v !== undefined && v !== "");
      const hasBoletos = (ext.boletos?.length ?? 0) > 0;

      if (ext.nota) {
        setInvoice({
          fornecedor_nome: ext.nota.fornecedor_nome ?? "",
          fornecedor_cnpj: ext.nota.fornecedor_cnpj ?? "",
          numero: ext.nota.numero ?? "",
          serie: ext.nota.serie ?? "",
          chave_acesso: ext.nota.chave_acesso ?? "",
          data_emissao: ext.nota.data_emissao ?? "",
          valor_total: ext.nota.valor_total != null ? String(ext.nota.valor_total) : "",
          observacoes: ext.observacoes ?? "",
        });
      }
      if (hasBoletos) {
        setBoletos(
          ext.boletos!.map((b, i) => ({
            parcela: b.parcela ?? i + 1,
            vencimento: b.vencimento ?? "",
            valor: b.valor != null ? String(b.valor) : "",
            codigo_barras: b.codigo_barras ?? "",
            linha_digitavel: b.linha_digitavel ?? "",
            beneficiario: b.beneficiario ?? "",
          })),
        );
      }
      if (!hasNota && !hasBoletos) {
        toast.warning(
          "A IA não conseguiu identificar dados da nota. Tente uma foto mais nítida, sem reflexos, ou anexe o XML.",
        );
      } else {
        toast.success("Dados extraídos. Revise antes de salvar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na extração");
    } finally {
      setExtracting(false);
    }
  };

  const onFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length || !user) return;
    if (files.length + list.length > 12) {
      toast.error("Máximo de 12 arquivos por nota");
      return;
    }
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of list) {
        if (f.size > 20 * 1024 * 1024) {
          toast.error(`${f.name}: maior que 20MB`);
          continue;
        }
        const ext = f.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
          contentType: f.type || undefined,
          upsert: false,
        });
        if (error) {
          toast.error(`Falha ao enviar ${f.name}: ${error.message}`);
          continue;
        }
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
        uploaded.push({
          path,
          name: f.name,
          mime: f.type || "application/octet-stream",
          size: f.size,
          url: signed?.signedUrl ?? "",
          kind: "invoice",
        });
      }
      setFiles((prev) => [...prev, ...uploaded]);
      if (uploaded.length) {
        toast.success(`${uploaded.length} arquivo(s) enviado(s)`);
        if (!noInvoice) await runExtraction(uploaded);
      }
    } finally {
      setUploading(false);
    }
  };

  const readXmlFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!bytes.length) return "";

    for (const encoding of ["utf-8", "iso-8859-1", "windows-1252"] as const) {
      try {
        const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
        if (text.trim()) return text;
      } catch {
        // tenta a próxima codificação
      }
    }

    return "";
  };

  const toBase64 = async (file: File) => {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const onXmlChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      e.target.value = "";
      toast.error("Selecione um arquivo .xml");
      return;
    }
    if (file.size === 0) {
      e.target.value = "";
      toast.error("O arquivo XML está vazio");
      return;
    }

    setParsingXml(true);
    try {
      const [xml, xmlBase64] = await Promise.all([readXmlFile(file), toBase64(file)]);
      if (!xml.trim() && !xmlBase64) {
        throw new Error("Não foi possível ler o conteúdo do XML");
      }

      const { data, error } = await supabase.functions.invoke("parse-nfe-xml", {
        body: { xml, xmlBase64, fileName: file.name, fileSize: file.size },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao ler o XML");
      const ext = data.data as {
        nota: Partial<InvoiceDraft> & { valor_total?: number };
        itens: Array<Omit<InvoiceItemDraft, "product_id" | "received">>;
      };
      if (ext.nota) {
        setInvoice({
          fornecedor_nome: ext.nota.fornecedor_nome ?? "",
          fornecedor_cnpj: ext.nota.fornecedor_cnpj ?? "",
          numero: ext.nota.numero ?? "",
          serie: ext.nota.serie ?? "",
          chave_acesso: ext.nota.chave_acesso ?? "",
          data_emissao: ext.nota.data_emissao ?? "",
          valor_total: ext.nota.valor_total != null ? String(ext.nota.valor_total) : "",
          observacoes: "",
        });
      }
      if (ext.itens && ext.itens.length > 0) {
        const barcodes = ext.itens.map((i) => i.original_barcode).filter(Boolean) as string[];
        let productMap: Record<string, string> = {};
        if (barcodes.length) {
          const { data: prods } = await supabase
            .from("inventory_products")
            .select("id, barcode")
            .in("barcode", barcodes);
          productMap = Object.fromEntries((prods ?? []).map((p) => [p.barcode!, p.id]));
        }
        setItems(
          ext.itens.map((it) => ({
            ...it,
            product_id: it.original_barcode ? productMap[it.original_barcode] ?? null : null,
            received: false,
          })),
        );
      }
      toast.success(`XML lido: ${ext.itens?.length ?? 0} itens importados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar XML");
    } finally {
      e.target.value = "";
      setParsingXml(false);
    }
  };

  const onQrScanned = (text: string) => {
    setScannerOpen(false);
    // QR de NFC-e/DANFE costuma ser uma URL contendo a chave de 44 dígitos (parâmetro p ou após p=)
    const match = text.match(/(\d{44})/);
    if (match) {
      setInvoice((p) => ({ ...p, chave_acesso: match[1] }));
      toast.success("Chave de acesso capturada do QR Code. Anexe o XML para importar os itens.");
      return;
    }
    // Senão, pode ser linha digitável de boleto (47 ou 48 dígitos)
    const digits = text.replace(/\D/g, "");
    if (digits.length === 47 || digits.length === 48) {
      setBoletos((prev) => [
        ...prev,
        {
          parcela: prev.length + 1,
          vencimento: "",
          valor: "",
          codigo_barras: digits.length === 44 ? digits : "",
          linha_digitavel: digits,
          beneficiario: invoice.fornecedor_nome || "",
        },
      ]);
      toast.success("Linha digitável do boleto adicionada");
      return;
    }
    toast.info(`QR lido: ${text.slice(0, 80)}…`);
  };

  const removeFile = async (path: string) => {
    await supabase.storage.from(BUCKET).remove([path]);
    setFiles((prev) => prev.filter((f) => f.path !== path));
  };

  const setFileKind = (path: string, kind: UploadedFile["kind"]) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, kind } : f)));
  };

  const addBoleto = () => {
    setBoletos((prev) => [
      ...prev,
      { parcela: prev.length + 1, vencimento: "", valor: "", codigo_barras: "", linha_digitavel: "", beneficiario: "" },
    ]);
  };

  const removeBoleto = (i: number) => {
    setBoletos((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateBoleto = (i: number, patch: Partial<BoletoDraft>) => {
    setBoletos((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };

  const reset = () => {
    setFiles([]);
    setInvoice(emptyInvoice);
    setBoletos([]);
    setItems([]);
    setSavedInvoiceId(null);
    setNoInvoice(false);
  };

  const saveInvoice = async () => {
    if (!user) return;
    if (!selectedStore) {
      toast.error("Selecione a loja");
      return;
    }
    if (savedInvoiceId) {
      toast.info("Esta nota já foi salva. Limpe para iniciar uma nova.");
      return;
    }
    if (noInvoice) {
      if (!invoice.fornecedor_nome.trim()) {
        toast.error("Informe o fornecedor");
        return;
      }
      if (items.length === 0) {
        toast.error("Adicione ao menos um produto");
        return;
      }
    } else if (!files.length && items.length === 0) {
      toast.error("Envie um arquivo da nota ou importe um XML");
      return;
    }
    setSaving(true);
    try {
      const { data: invRow, error: invErr } = await supabase
        .from("inventory_invoices")
        .insert({
          store_id: selectedStore,
          created_by: user.id,
          no_invoice: noInvoice,
          supplier_name: invoice.fornecedor_nome || null,
          supplier_cnpj: noInvoice ? null : (invoice.fornecedor_cnpj || null),
          invoice_number: noInvoice ? null : (invoice.numero || null),
          invoice_series: noInvoice ? null : (invoice.serie || null),
          invoice_key: noInvoice ? null : (invoice.chave_acesso || null),
          issue_date: invoice.data_emissao || null,
          total_amount: invoice.valor_total ? Number(invoice.valor_total) : null,
          notes: invoice.observacoes || null,
          extraction_status: noInvoice ? "no_invoice" : (items.length > 0 ? "done" : "manual"),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        } as any)
        .select()
        .single();
      if (invErr) throw invErr;

      // Arquivos
      if (files.length) {
        const filesPayload = files.map((f) => ({
          invoice_id: invRow.id,
          kind: f.kind,
          file_path: f.path,
          file_name: f.name,
          mime_type: f.mime,
          size_bytes: f.size,
          uploaded_by: user.id,
        }));
        const { error: fErr } = await supabase.from("inventory_invoice_files").insert(filesPayload);
        if (fErr) throw fErr;
      }

      // Itens
      let receivedCount = 0;
      let createdProductsCount = 0;
      let hasLinkedItems = false;
      if (items.length) {
        const safeNum = (v: any, d = 0) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : d;
        };

        // Auto-criar produtos no catálogo para itens sem vínculo
        // e sincronizar a unidade do produto vinculado com a unidade da nota.
        const enrichedItems = await Promise.all(
          items.map(async (it) => {
            const noteUnit = (it.unit ?? "").toString().trim().toUpperCase() || "UN";

            if (it.product_id) {
              // Atualiza unidade do produto existente se a nota trouxer unidade diferente.
              const { data: existing } = await supabase
                .from("inventory_products")
                .select("unit")
                .eq("id", it.product_id)
                .maybeSingle();
              if (existing && existing.unit !== noteUnit) {
                await supabase
                  .from("inventory_products")
                  .update({ unit: noteUnit })
                  .eq("id", it.product_id);
              }
              return it;
            }

            const name = (it.original_description ?? "").toString().trim();
            if (!name) return it;
            const barcode = it.original_barcode?.trim() || null;
            const internalCode = it.original_code?.trim() || null;

            if (barcode) {
              const { data: byBarcode } = await supabase
                .from("inventory_products")
                .select("id, unit")
                .eq("barcode", barcode)
                .maybeSingle();
              if (byBarcode) {
                if (byBarcode.unit !== noteUnit) {
                  await supabase
                    .from("inventory_products")
                    .update({ unit: noteUnit })
                    .eq("id", byBarcode.id);
                }
                return { ...it, product_id: byBarcode.id };
              }
            }

            const { data: newProd, error: createErr } = await supabase
              .from("inventory_products")
              .insert({
                name: name.toUpperCase(),
                unit: noteUnit,
                barcode,
                internal_code: internalCode,
                created_by: user.id,
              })
              .select("id")
              .single();
            if (createErr) {
              console.error("Falha ao criar produto auto:", name, createErr);
              return it;
            }
            createdProductsCount += 1;
            return { ...it, product_id: newProd.id };
          }),
        );

        const itemsPayload = enrichedItems.map((it, idx) => ({
          invoice_id: invRow.id,
          product_id: it.product_id || null,
          line_number: safeNum(it.line_number, idx + 1),
          original_description: (it.original_description ?? "").toString().trim() || "(sem descrição)",
          original_code: it.original_code || null,
          original_barcode: it.original_barcode || null,
          original_ncm: it.original_ncm ? String(it.original_ncm) : null,
          unit: (it.unit ?? "").toString().trim().toUpperCase() || "UN",
          quantity: safeNum(it.quantity, 0),
          unit_value: safeNum(it.unit_value, 0),
          total_value: safeNum(it.total_value, 0),
          lot_number: it.lot_number || null,
          manufacture_date: it.manufacture_date || null,
          expiry_date: it.expiry_date || null,
        }));

        hasLinkedItems = itemsPayload.some((it) => Boolean(it.product_id));

        const { error: iErr } = await supabase
          .from("inventory_invoice_items")
          .insert(itemsPayload);
        if (iErr) throw iErr;

        const expectedReceiveCount = itemsPayload.filter((it) => it.product_id).length;
        const { data: itemsForReceive, error: fetchReceiveErr } = await supabase
          .from("inventory_invoice_items")
          .select("id, product_id, received")
          .eq("invoice_id", invRow.id)
          .eq("received", false)
          .not("product_id", "is", null);
        if (fetchReceiveErr) throw fetchReceiveErr;

        const toReceive = itemsForReceive ?? [];
        const failures: string[] = [];

        if (expectedReceiveCount > 0 && toReceive.length === 0) {
          console.error("Nenhum item elegível retornou para entrada automática", {
            invoiceId: invRow.id,
            expectedReceiveCount,
          });
          failures.push("os itens da nota foram salvos, mas não puderam ser reconsultados para entrada automática no estoque");
        }

        for (const it of toReceive) {
          const { error: rErr } = await supabase.rpc("receive_invoice_item", { _item_id: it.id });
          if (rErr) {
            console.error("Falha ao receber item", {
              invoiceId: invRow.id,
              itemId: it.id,
              error: rErr,
            });
            failures.push(rErr.message || "erro desconhecido");
          } else {
            receivedCount += 1;
          }
        }

        if (failures.length > 0) {
          toast.error(`Nota salva, mas ${failures.length} item(ns) não entraram no estoque: ${failures[0]}`);
        }
      }

      setSavedInvoiceId(invRow.id);

      if (items.length === 0) {
        toast.success("Nota registrada. Agora você pode salvar os boletos abaixo.");
      } else if (receivedCount === 0 && hasLinkedItems) {
        toast.error("Nota registrada, mas nenhum item vinculado foi lançado no estoque.");
      } else {
        const parts = [`${receivedCount} item(s) lançado(s) no estoque`];
        if (createdProductsCount > 0) parts.push(`${createdProductsCount} produto(s) novo(s) criado(s) no catálogo`);
        toast.success(`Nota registrada. ${parts.join(" • ")}.`);
      }
      loadRecent();
    } catch (err: any) {
      const detail = err?.message || err?.error_description || err?.details || err?.hint;
      console.error("Falha ao salvar nota:", err);
      toast.error(detail ? `Falha ao salvar: ${detail}` : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const saveBoletos = async () => {
    if (!user) return;
    if (boletos.length === 0) {
      toast.error("Adicione ao menos um boleto");
      return;
    }
    if (!selectedStore) {
      toast.error("Selecione a loja");
      return;
    }
    setSavingBoletos(true);
    try {
      const payable = boletos.map((b) => ({
        invoice_id: savedInvoiceId,
        store_id: selectedStore,
        installment_number: b.parcela || 1,
        due_date: b.vencimento || null,
        amount: b.valor ? Number(b.valor) : 0,
        barcode: b.codigo_barras || null,
        digitable_line: b.linha_digitavel || null,
        beneficiary: b.beneficiario || invoice.fornecedor_nome || null,
        created_by: user.id,
      }));
      const { error: pErr } = await supabase.from("accounts_payable").insert(payable);
      if (pErr) throw pErr;
      toast.success(`${boletos.length} boleto(s) lançado(s) no contas a pagar.`);
      setBoletos([]);
    } catch (err: any) {
      const detail = err?.message || err?.error_description || err?.details || err?.hint;
      console.error("Falha ao salvar boletos:", err);
      toast.error(detail ? `Falha ao salvar boletos: ${detail}` : "Falha ao salvar boletos");
    } finally {
      setSavingBoletos(false);
    }
  };

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canReceive) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-semibold">Você não tem permissão para registrar recebimentos.</p>
          <p className="text-sm text-muted-foreground">
            Solicite ao administrador para liberar seu cargo em Configurações &gt; Recebimento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Loja e captura</CardTitle>
          <CardDescription>
            {noInvoice
              ? "Compra sem nota fiscal (CEASA, feira, mercado). Anexe o comprovante (recibo/PIX) se tiver."
              : "Importe o XML da NF-e (preenche tudo + itens), escaneie o QR do DANFE, ou fotografe a nota."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Loja</Label>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={noInvoice}
              onChange={(e) => setNoInvoice(e.target.checked)}
              disabled={!!savedInvoiceId}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Compra sem nota fiscal</p>
              <p className="text-xs text-muted-foreground">
                Use para CEASA, feira, mercado e outras compras sem NF. Gera estoque + conta a pagar normalmente.
              </p>
            </div>
          </label>

          <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onFilesChosen} />
          <input ref={xmlInputRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={onXmlChosen} />

          {noInvoice ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleSelectFiles} disabled={uploading} className="gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Anexar comprovante (opcional)
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button onClick={handleSelectXml} disabled={parsingXml} className="gap-2">
                {parsingXml ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />}
                Importar XML
              </Button>
              <Button variant="outline" onClick={() => setScannerOpen(true)} className="gap-2">
                <QrCode className="h-4 w-4" />
                Escanear QR
              </Button>
              <Button variant="outline" onClick={handleSelectFiles} disabled={uploading} className="gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Fotos / PDF
              </Button>
              <Button variant="outline" onClick={() => runExtraction()} disabled={extracting || files.length === 0} className="gap-2">
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Extrair com IA
              </Button>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Arquivos enviados</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 border border-border rounded-md p-2 bg-card">
                    {f.mime.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Select value={f.kind} onValueChange={(v) => setFileKind(f.path, v as UploadedFile["kind"])}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">Nota</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFile(f.path)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. {noInvoice ? "Dados da compra" : "Dados da nota"}</CardTitle>
          <CardDescription>
            {noInvoice
              ? "Informe fornecedor, data e valor total da compra."
              : "Revise os dados extraídos ou preencha manualmente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Fornecedor{noInvoice ? " *" : ""}</Label>
            <Input
              value={invoice.fornecedor_nome}
              onChange={(e) => setInvoice((p) => ({ ...p, fornecedor_nome: e.target.value }))}
              placeholder={noInvoice ? "Ex: Hortifruti CEASA — barraca 12" : ""}
            />
          </div>
          {!noInvoice && (
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={invoice.fornecedor_cnpj} onChange={(e) => setInvoice((p) => ({ ...p, fornecedor_cnpj: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{noInvoice ? "Data da compra" : "Data de emissão"}</Label>
            <Input type="date" value={invoice.data_emissao} onChange={(e) => setInvoice((p) => ({ ...p, data_emissao: e.target.value }))} />
          </div>
          {!noInvoice && (
            <>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={invoice.numero} onChange={(e) => setInvoice((p) => ({ ...p, numero: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Série</Label>
                <Input value={invoice.serie} onChange={(e) => setInvoice((p) => ({ ...p, serie: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Chave de acesso (44 dígitos)</Label>
                <Input value={invoice.chave_acesso} onChange={(e) => setInvoice((p) => ({ ...p, chave_acesso: e.target.value }))} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Valor total (R$)</Label>
            <Input type="number" step="0.01" value={invoice.valor_total} onChange={(e) => setInvoice((p) => ({ ...p, valor_total: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={invoice.observacoes} onChange={(e) => setInvoice((p) => ({ ...p, observacoes: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> 3. Itens / produtos</CardTitle>
          <CardDescription>
            Vincule cada item a um produto. Itens com produto vinculado entram no estoque ao salvar{noInvoice ? " a compra." : " a nota."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InventoryItemsEditor items={items} onChange={setItems} storeId={selectedStore} />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button variant="outline" onClick={reset}>Limpar</Button>
        <Button onClick={saveInvoice} disabled={saving || !!savedInvoiceId} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {savedInvoiceId
            ? (noInvoice ? "Compra salva" : "NF salva")
            : (noInvoice ? "Salvar compra" : "Salvar NF")}
        </Button>
      </div>

      <Card id="boletos">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>4. {noInvoice ? "Pagamento" : "Boletos"}</CardTitle>
            <CardDescription>
              {noInvoice
                ? "Lance o(s) pagamento(s) desta compra (vencimento + valor). Vira conta a pagar e pode ser quitado pela conciliação bancária."
                : savedInvoiceId
                ? "Boletos serão vinculados à nota recém-salva."
                : "Cada parcela vira uma conta a pagar. Salve sem vincular ou primeiro salve a NF."}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addBoleto} className="gap-1">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {boletos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum boleto. Use o scanner de QR ou adicione manualmente.
            </p>
          )}
          {boletos.map((b, i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-card">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Parcela {b.parcela || i + 1}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeBoleto(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Vencimento</Label>
                  <Input type="date" value={b.vencimento} onChange={(e) => updateBoleto(i, { vencimento: e.target.value })} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input type="number" step="0.01" value={b.valor} onChange={(e) => updateBoleto(i, { valor: e.target.value })} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Beneficiário</Label>
                  <Input value={b.beneficiario} onChange={(e) => updateBoleto(i, { beneficiario: e.target.value })} className="h-9" />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-3">
                  <Label className="text-xs">Linha digitável</Label>
                  <Input value={b.linha_digitavel} onChange={(e) => updateBoleto(i, { linha_digitavel: e.target.value })} className="h-9 font-mono text-xs" />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-3">
                  <Label className="text-xs">Código de barras</Label>
                  <Input value={b.codigo_barras} onChange={(e) => updateBoleto(i, { codigo_barras: e.target.value })} className="h-9 font-mono text-xs" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <Button
          onClick={saveBoletos}
          disabled={savingBoletos || boletos.length === 0}
          className="gap-2"
        >
          {savingBoletos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar boletos
        </Button>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="recent" className="border border-border rounded-md bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="font-semibold">Notas recentes</span>
              <Badge variant="secondary" className="ml-1">{recent.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {loadingRecent ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma nota registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOpenInvoiceId(r.id)}
                    className="w-full text-left border border-border rounded-md p-3 bg-background hover:bg-accent hover:border-accent-foreground/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.supplier_name ?? "Sem fornecedor"}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.no_invoice
                            ? "Compra s/ NF"
                            : `NF ${r.invoice_number ?? "—"}`}
                          {" • "}
                          {r.issue_date ? format(new Date(r.issue_date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "sem data"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          {r.total_amount != null ? r.total_amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                        </p>
                        <Badge variant={r.extraction_status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                          {r.no_invoice ? "s/ NF" : r.extraction_status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <QrCodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={onQrScanned} />
      <InvoiceDetailDialog
        invoiceId={openInvoiceId}
        open={openInvoiceId !== null}
        onClose={() => setOpenInvoiceId(null)}
        onChanged={loadRecent}
      />
    </div>
  );
};

export default InventoryReceivingPanel;
