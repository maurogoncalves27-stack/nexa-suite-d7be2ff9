import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Send, Check, X, Truck, ArrowRight, Trash2, Lightbulb, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import TransferSuggestionsPanel from "@/components/inventory/TransferSuggestionsPanel";
import { sortStores } from "@/lib/storeSort";

interface Store { id: string; name: string }
interface Product { id: string; name: string; unit: string }
interface DraftItem { product_id: string; quantity: string; lot_id: string }
interface ProductLot { id: string; lot_number: string | null; quantity: number; expiry_date: string }

interface Transfer {
  id: string;
  origin_store_id: string;
  destination_store_id: string;
  status: "in_transit" | "received" | "cancelled";
  sender_name: string | null;
  receiver_name: string | null;
  notes: string | null;
  sent_at: string;
  received_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  origin: { name: string } | null;
  destination: { name: string } | null;
  items: { id: string; product_id: string; quantity: number; product: { name: string; unit: string } | null }[];
}

const STATUS_LABEL: Record<Transfer["status"], string> = {
  in_transit: "Em trânsito",
  received: "Recebido",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<Transfer["status"], "default" | "secondary" | "destructive" | "outline"> = {
  in_transit: "secondary",
  received: "default",
  cancelled: "outline",
};

const InventoryTransfers = () => {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [accessibleStoreIds, setAccessibleStoreIds] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"in_transit" | "received" | "cancelled">("in_transit");

  // diálogo novo envio
  const [open, setOpen] = useState(false);
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ product_id: "", quantity: "", lot_id: "" }]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [lotsByProduct, setLotsByProduct] = useState<Record<string, ProductLot[]>>({});
  const [saving, setSaving] = useState(false);

  // diálogo confirmar
  const [confirmTransfer, setConfirmTransfer] = useState<Transfer | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [confirming, setConfirming] = useState(false);

  // diálogo cancelar
  const [cancelTransfer, setCancelTransfer] = useState<Transfer | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: sts }, { data: prods }] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase.from("inventory_products").select("id, name, unit").eq("is_active", true).order("name"),
    ]);
    setStores(sortStores((sts as Store[])) ?? []);
    setProducts((prods as Product[]) ?? []);

    // lojas acessíveis ao usuário (para definir origem permitida)
    if (user) {
      const { data: acc } = await supabase.rpc("user_accessible_stores", { _user_id: user.id });
      setAccessibleStoreIds(new Set((acc ?? []).map((r: any) => r as string)));
    }

    const { data: ts } = await supabase
      .from("inventory_transfers")
      .select(`
        id, origin_store_id, destination_store_id, status, sender_name, receiver_name, notes,
        sent_at, received_at, cancelled_at, cancel_reason,
        origin:stores!inventory_transfers_origin_store_id_fkey(name),
        destination:stores!inventory_transfers_destination_store_id_fkey(name),
        items:inventory_transfer_items(id, product_id, quantity, product:inventory_products(name, unit))
      `)
      .order("sent_at", { ascending: false });
    setTransfers((ts as unknown as Transfer[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Carrega saldo da loja origem ao mudar
  useEffect(() => {
    if (!originId) { setStockMap({}); setLotsByProduct({}); return; }
    const run = async () => {
      const { data } = await supabase
        .from("inventory_stock")
        .select("product_id, quantity")
        .eq("store_id", originId);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.product_id] = Number(r.quantity); });
      setStockMap(map);
      setLotsByProduct({});
    };
    run();
  }, [originId]);

  // Carrega lotes ativos por produto na loja origem (sob demanda)
  const ensureLotsLoaded = async (productId: string) => {
    if (!originId || !productId || lotsByProduct[productId]) return;
    const { data } = await supabase
      .from("inventory_lots")
      .select("id, lot_number, quantity, expiry_date")
      .eq("store_id", originId)
      .eq("product_id", productId)
      .eq("status", "active")
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true });
    setLotsByProduct((prev) => ({ ...prev, [productId]: (data as ProductLot[]) ?? [] }));
  };

  const originStores = useMemo(
    () => stores.filter((s) => accessibleStoreIds.has(s.id)),
    [stores, accessibleStoreIds],
  );
  const destinationStores = useMemo(
    () => stores.filter((s) => s.id !== originId),
    [stores, originId],
  );

  const filteredTransfers = useMemo(
    () => transfers.filter((t) => t.status === tab),
    [transfers, tab],
  );

  const resetForm = () => {
    setOriginId("");
    setDestinationId("");
    setSenderName("");
    setNotes("");
    setItems([{ product_id: "", quantity: "", lot_id: "" }]);
    setStockMap({});
    setLotsByProduct({});
  };

  const addItemRow = () => setItems((prev) => [...prev, { product_id: "", quantity: "", lot_id: "" }]);
  const removeItemRow = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const handleCreate = async () => {
    if (!originId || !destinationId) return toast.error("Selecione origem e destino");
    if (originId === destinationId) return toast.error("Origem e destino devem ser diferentes");
    const valid = items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (valid.length === 0) return toast.error("Adicione ao menos um item válido");

    // valida estoque
    for (const it of valid) {
      const have = stockMap[it.product_id] ?? 0;
      const need = Number(it.quantity);
      if (have < need) {
        const p = products.find((p) => p.id === it.product_id);
        return toast.error(`Estoque insuficiente de ${p?.name ?? "item"} (saldo: ${have}, pedido: ${need})`);
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_inventory_transfer", {
        _origin_store_id: originId,
        _destination_store_id: destinationId,
        _items: valid.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          lot_id: it.lot_id || null,
        })),
        _sender_name: senderName || null,
        _notes: notes || null,
      });
      if (error) throw error;
      toast.success("Envio criado com sucesso");
      resetForm();
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar envio");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmTransfer) return;
    setConfirming(true);
    try {
      const { error } = await supabase.rpc("confirm_inventory_transfer", {
        _transfer_id: confirmTransfer.id,
        _receiver_name: receiverName || null,
      });
      if (error) throw error;
      toast.success("Recebimento confirmado");
      setConfirmTransfer(null);
      setReceiverName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao confirmar");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTransfer) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_inventory_transfer", {
        _transfer_id: cancelTransfer.id,
        _reason: cancelReason || null,
      });
      if (error) throw error;
      toast.success("Envio cancelado e estoque devolvido");
      setCancelTransfer(null);
      setCancelReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> Transferências
          </h1>
          <p className="text-muted-foreground">Sugestões automáticas e envios entre lojas físicas.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo envio
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" /> Sugestão de transferência
            </CardTitle>
            <CardDescription>
              Itens que cada loja precisa receber para atingir o mínimo configurado, limitados ao estoque disponível na origem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransferSuggestionsPanel onTransfersCreated={load} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Envios e histórico
            </CardTitle>
            <CardDescription>{transfers.length} envio(s) registrado(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="in_transit">Em trânsito</TabsTrigger>
                <TabsTrigger value="received">Recebidos</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="mt-3">
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : filteredTransfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum envio neste status.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Trajeto</TableHead>
                          <TableHead>Itens</TableHead>
                          <TableHead>Responsáveis</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransfers.map((t) => {
                          const canReceive = accessibleStoreIds.has(t.destination_store_id);
                          const canCancel = accessibleStoreIds.has(t.origin_store_id);
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs">
                                {format(new Date(t.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-sm">
                                  <span className="font-medium">{t.origin?.name ?? "—"}</span>
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-medium">{t.destination?.name ?? "—"}</span>
                                </div>
                                {t.notes && <p className="text-xs text-muted-foreground mt-0.5">{t.notes}</p>}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-0.5 text-xs">
                                  {t.items.map((it) => (
                                    <div key={it.id}>
                                      <span className="font-mono">
                                        {Number(it.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {it.product?.unit}
                                      </span>{" "}
                                      {it.product?.name ?? "—"}
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">
                                <div>
                                  <span className="text-muted-foreground">Enviou:</span> {t.sender_name ?? "—"}
                                </div>
                                {t.status === "received" && (
                                  <div>
                                    <span className="text-muted-foreground">Recebeu:</span> {t.receiver_name ?? "—"}
                                  </div>
                                )}
                                {t.status === "cancelled" && t.cancel_reason && (
                                  <div className="text-destructive">{t.cancel_reason}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {t.status === "in_transit" && (
                                  <div className="flex justify-end gap-1">
                                    {canReceive && (
                                      <Button size="sm" variant="default" className="gap-1" onClick={() => setConfirmTransfer(t)}>
                                        <Check className="h-3.5 w-3.5" /> Receber
                                      </Button>
                                    )}
                                    {canCancel && (
                                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setCancelTransfer(t)}>
                                        <X className="h-3.5 w-3.5" /> Cancelar
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Novo envio */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Novo envio entre lojas</DialogTitle>
            <DialogDescription>
              Os itens são debitados imediatamente da loja de origem e ficam "em trânsito" até a loja de destino confirmar o recebimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Loja de origem *</Label>
                <Select value={originId} onValueChange={setOriginId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {originStores.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Você não tem acesso a nenhuma loja.</div>}
                    {originStores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Loja de destino *</Label>
                <Select value={destinationId} onValueChange={setDestinationId} disabled={!originId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {destinationStores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Quem está enviando (responsável)</Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Nome" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Itens *</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addItemRow} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <div className="space-y-1.5">
                {items.map((it, idx) => {
                  const have = stockMap[it.product_id] ?? 0;
                  const need = Number(it.quantity) || 0;
                  const insufficient = it.product_id && need > 0 && have < need;
                  const product = products.find((p) => p.id === it.product_id);
                  const productLots = lotsByProduct[it.product_id] ?? [];
                  return (
                    <div key={idx} className="space-y-1 border rounded-md p-2 bg-muted/20">
                      <div className="grid grid-cols-12 gap-1.5 items-end">
                        <div className="col-span-7">
                          <Select
                            value={it.product_id}
                            onValueChange={(v) => {
                              updateItem(idx, { product_id: v, lot_id: "" });
                              ensureLotsLoaded(v);
                            }}
                          >
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Produto" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {it.product_id && originId && (
                            <p className={`text-[11px] mt-0.5 ${insufficient ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              Saldo na origem: {have.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {product?.unit}
                            </p>
                          )}
                        </div>
                        <div className="col-span-4">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="Qtd"
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="col-span-1">
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItemRow(idx)} disabled={items.length === 1}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {it.product_id && productLots.length > 0 && (
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Lote (opcional — recomendado: o mais próximo do vencimento)</Label>
                          <Select value={it.lot_id || "none"} onValueChange={(v) => updateItem(idx, { lot_id: v === "none" ? "" : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem lote" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem lote (envio genérico)</SelectItem>
                              {productLots.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.lot_number || "S/N"} — venc. {format(new Date(l.expiry_date), "dd/MM/yy", { locale: ptBR })} — saldo {Number(l.quantity).toLocaleString("pt-BR")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar recebimento */}
      <Dialog open={!!confirmTransfer} onOpenChange={(v) => { if (!v) { setConfirmTransfer(null); setReceiverName(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar recebimento</DialogTitle>
            <DialogDescription>
              Os itens serão adicionados ao estoque de <b>{confirmTransfer?.destination?.name}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {confirmTransfer?.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm border-b pb-1">
                <span>{it.product?.name}</span>
                <span className="font-mono">{Number(it.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {it.product?.unit}</span>
              </div>
            ))}
            <div className="space-y-1 pt-2">
              <Label>Quem está recebendo</Label>
              <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Nome" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTransfer(null)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar envio */}
      <Dialog open={!!cancelTransfer} onOpenChange={(v) => { if (!v) { setCancelTransfer(null); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar envio</DialogTitle>
            <DialogDescription>
              Os itens voltarão para o estoque de <b>{cancelTransfer?.origin?.name}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTransfer(null)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Cancelar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryTransfers;
