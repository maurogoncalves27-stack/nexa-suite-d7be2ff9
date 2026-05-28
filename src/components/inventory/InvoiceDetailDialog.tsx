import { useEffect, useState } from "react";
import { Loader2, FolderOpen, CheckCircle2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InventoryItemsEditor, InvoiceItemDraft } from "./InventoryItemsEditor";
import EquipmentWarrantyDialog from "./EquipmentWarrantyDialog";

interface InvoiceDetailDialogProps {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

interface InvoiceMeta {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  total_amount: number | null;
  store_id: string;
}

export const InvoiceDetailDialog = ({ invoiceId, open, onClose, onChanged }: InvoiceDetailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<InvoiceMeta | null>(null);
  const [items, setItems] = useState<(InvoiceItemDraft & { id: string })[]>([]);
  const [receivingAll, setReceivingAll] = useState(false);
  const [warrantyItemIds, setWarrantyItemIds] = useState<Set<string>>(new Set());
  const [warrantySource, setWarrantySource] = useState<{
    invoice_item_id: string;
    invoice_id: string;
    store_id: string;
    description: string;
    supplier_name?: string | null;
    invoice_number?: string | null;
    issue_date?: string | null;
    unit_value?: number | null;
    quantity?: number | null;
  } | null>(null);

  const load = async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const [{ data: inv }, { data: its }, { data: warranties }] = await Promise.all([
        supabase
          .from("inventory_invoices")
          .select("id, supplier_name, invoice_number, issue_date, total_amount, store_id")
          .eq("id", invoiceId)
          .maybeSingle(),
        supabase
          .from("inventory_invoice_items")
          .select("id, product_id, line_number, original_description, original_code, original_barcode, original_ncm, unit, quantity, unit_value, total_value, received")
          .eq("invoice_id", invoiceId)
          .order("line_number"),
        supabase
          .from("equipment_warranties")
          .select("invoice_item_id")
          .eq("invoice_id", invoiceId),
      ]);
      setMeta(inv ?? null);
      setItems(
        (its ?? []).map((it) => ({
          id: it.id,
          product_id: it.product_id,
          line_number: it.line_number,
          original_description: it.original_description,
          original_code: it.original_code,
          original_barcode: it.original_barcode,
          original_ncm: it.original_ncm,
          unit: it.unit,
          quantity: Number(it.quantity),
          unit_value: Number(it.unit_value),
          total_value: Number(it.total_value),
          received: it.received,
        })),
      );
      setWarrantyItemIds(
        new Set((warranties ?? []).map((w) => w.invoice_item_id).filter(Boolean) as string[]),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && invoiceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const persistItemPatch = async (
    next: (InvoiceItemDraft & { id?: string })[],
    prev: (InvoiceItemDraft & { id: string })[],
  ) => {
    // Detecta apenas alterações de product_id ou unit/quantity/unit_value (campos editáveis úteis aqui)
    for (const it of next) {
      if (!it.id) continue;
      const before = prev.find((p) => p.id === it.id);
      if (!before) continue;
      if (
        before.product_id !== it.product_id ||
        before.unit !== it.unit ||
        before.quantity !== it.quantity ||
        before.unit_value !== it.unit_value
      ) {
        const { error } = await supabase
          .from("inventory_invoice_items")
          .update({
            product_id: it.product_id,
            unit: it.unit,
            quantity: it.quantity,
            unit_value: it.unit_value,
            total_value: it.total_value,
          })
          .eq("id", it.id);
        if (error) {
          toast.error(`Falha ao atualizar item: ${error.message}`);
          return false;
        }
      }
    }
    return true;
  };

  const handleItemsChange = async (next: InvoiceItemDraft[]) => {
    const previous = items;
    const nextWithIds = next.map((n, i) => ({ ...n, id: previous[i]?.id })) as (InvoiceItemDraft & { id: string })[];
    setItems(nextWithIds);
    await persistItemPatch(nextWithIds, previous);
    // Recarrega para refletir o estado real
    load();
    onChanged?.();
  };

  const receiveAllPending = async () => {
    const pending = items.filter((it) => !it.received && it.product_id);
    if (pending.length === 0) {
      toast.info("Nenhum item pendente com produto vinculado.");
      return;
    }
    setReceivingAll(true);
    let ok = 0;
    let fail = 0;
    for (const it of pending) {
      const { error } = await supabase.rpc("receive_invoice_item", { _item_id: it.id });
      if (error) {
        fail += 1;
        console.error("Falha ao receber", it.id, error);
      } else {
        ok += 1;
      }
    }
    setReceivingAll(false);
    if (ok) toast.success(`${ok} item(s) lançado(s) no estoque`);
    if (fail) toast.error(`${fail} item(s) falharam`);
    load();
    onChanged?.();
  };

  const pendingWithProduct = items.filter((it) => !it.received && it.product_id).length;
  const pendingNoProduct = items.filter((it) => !it.received && !it.product_id).length;
  const receivedCount = items.filter((it) => it.received).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {meta?.supplier_name ?? "Nota fiscal"}
          </DialogTitle>
          <DialogDescription>
            NF {meta?.invoice_number ?? "—"} • Total{" "}
            {meta?.total_amount != null
              ? meta.total_amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "—"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{items.length} itens</Badge>
              <Badge variant="default">{receivedCount} recebidos</Badge>
              {pendingWithProduct > 0 && (
                <Badge variant="outline">{pendingWithProduct} prontos para receber</Badge>
              )}
              {pendingNoProduct > 0 && (
                <Badge variant="destructive">{pendingNoProduct} sem produto</Badge>
              )}
            </div>

            {pendingWithProduct > 0 && (
              <Button
                onClick={receiveAllPending}
                disabled={receivingAll}
                className="gap-2 w-full sm:w-auto"
              >
                {receivingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Receber {pendingWithProduct} pendente(s)
              </Button>
            )}

            <InventoryItemsEditor
              items={items}
              onChange={handleItemsChange}
              invoiceId={meta?.id}
              storeId={meta?.store_id}
            />

            {items.length > 0 && meta && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  É equipamento? Cadastre a garantia
                </div>
                <p className="text-xs text-muted-foreground">
                  Para cada item que seja um equipamento (freezer, balança, forno, etc.), clique em "Cadastrar garantia"
                  para registrar nº de série, prazo e local de instalação.
                </p>
                <div className="space-y-1.5">
                  {items.map((it) => {
                    const has = warrantyItemIds.has(it.id);
                    return (
                      <div
                        key={it.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs border-t pt-2 first:border-t-0 first:pt-0"
                      >
                        <span className="flex-1 truncate">
                          {it.line_number ? `${it.line_number}. ` : ""}
                          {it.original_description}
                        </span>
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {has && <Badge variant="default" className="text-[10px]">Garantia cadastrada</Badge>}
                          <Button
                            size="sm"
                            variant={has ? "outline" : "secondary"}
                            className="h-7 text-xs gap-1"
                            onClick={() =>
                              setWarrantySource({
                                invoice_item_id: it.id,
                                invoice_id: meta.id,
                                store_id: meta.store_id,
                                description: it.original_description,
                                supplier_name: meta.supplier_name,
                                invoice_number: meta.invoice_number,
                                issue_date: meta.issue_date,
                                unit_value: it.unit_value,
                                quantity: it.quantity,
                              })
                            }
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {has ? "Cadastrar outra" : "Cadastrar garantia"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      <EquipmentWarrantyDialog
        open={!!warrantySource}
        source={warrantySource}
        onClose={() => setWarrantySource(null)}
        onSaved={() => {
          setWarrantySource(null);
          void load();
        }}
      />
    </Dialog>
  );
};

export default InvoiceDetailDialog;
