import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Plus, X, PackageCheck, Factory, ClipboardList, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { sortStores } from "@/lib/storeSort";
import type { DraftItem, FactoryRequest, Product, Store } from "@/lib/factoryRequests";
import RequestsList from "@/components/factory/RequestsList";
import NewRequestDialog from "@/components/factory/NewRequestDialog";

export default function FactoryRequests() {
  const { user, isAdmin, isManager } = useAuth();
  const [tab, setTab] = useState<"mine" | "fulfill">("mine");
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<FactoryRequest[]>([]);
  const [worksAtFactory, setWorksAtFactory] = useState(false);

  // Novo pedido
  const [openNew, setOpenNew] = useState(false);
  const [draftStoreId, setDraftStoreId] = useState<string>("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { product_id: "", quantity: "", notes: "" },
  ]);
  const [creating, setCreating] = useState(false);

  // Rejeição
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Confirmação de cancelamento
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Confirmação de recebimento
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Edição de quantidades aprovadas/entregues (gestão da fábrica)
  const [actionsBusy, setActionsBusy] = useState<string | null>(null);

  const isStaff = isAdmin || isManager;
  const canFulfill = isStaff || worksAtFactory;

  const requestableStores = useMemo(
    () => sortStores(stores.filter((s) => s.store_type !== "fabrica")) as Store[],
    [stores],
  );

  // ============== LOAD ==============
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [storesRes, productsRes, requestsRes] = await Promise.all([
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
      supabase
        .from("inventory_products")
        .select("id, name, unit")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("factory_requests")
        .select(
          `id, store_id, status, notes, rejection_reason, requested_at, approved_at, shipped_at, received_at,
           store:stores!factory_requests_store_id_fkey(name),
           items:factory_request_items(id, product_id, quantity_requested, quantity_approved, quantity_delivered, unit, notes, inventory_products(name, unit))`,
        )
        .order("requested_at", { ascending: false }),
    ]);
    setStores((storesRes.data as Store[]) ?? []);
    setProducts((productsRes.data as Product[]) ?? []);
    setRequests((requestsRes.data as unknown as FactoryRequest[]) ?? []);
    setLoading(false);
  }, []);

  // Verifica se o usuário trabalha na fábrica
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase
        .from("employees")
        .select("store_id, allocated_store_id, stores!employees_store_id_fkey(store_type)")
        .eq("user_id", user.id)
        .maybeSingle();
      const sType = (data as any)?.stores?.store_type;
      if (sType === "fabrica") {
        setWorksAtFactory(true);
        return;
      }
      const allocId = (data as any)?.allocated_store_id;
      if (allocId) {
        const { data: s } = await supabase
          .from("stores")
          .select("store_type")
          .eq("id", allocId)
          .maybeSingle();
        setWorksAtFactory(s?.store_type === "fabrica");
      }
    };
    void check();
  }, [user]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Default: pré-seleciona a loja do usuário no novo pedido
  useEffect(() => {
    if (openNew && !draftStoreId && requestableStores.length === 1) {
      setDraftStoreId(requestableStores[0].id);
    }
  }, [openNew, draftStoreId, requestableStores]);

  const myRequests = useMemo(
    () => requests.filter((r) => stores.find((s) => s.id === r.store_id)?.store_type !== "fabrica"),
    [requests, stores],
  );

  const fulfillQueue = useMemo(
    () => requests.filter((r) => r.status === "pending" || r.status === "approved"),
    [requests],
  );

  // ============== CREATE ==============
  const addDraftLine = () =>
    setDraftItems((arr) => [...arr, { product_id: "", quantity: "", notes: "" }]);
  const removeDraftLine = (idx: number) =>
    setDraftItems((arr) => arr.filter((_, k) => k !== idx));
  const updateDraftLine = (idx: number, patch: Partial<DraftItem>) =>
    setDraftItems((arr) => arr.map((it, k) => (k === idx ? { ...it, ...patch } : it)));

  const resetDraft = () => {
    setDraftStoreId("");
    setDraftNotes("");
    setDraftItems([{ product_id: "", quantity: "", notes: "" }]);
  };

  const handleCreate = async () => {
    if (!draftStoreId) {
      toast.error("Selecione a loja solicitante");
      return;
    }
    const valid = draftItems
      .map((it, k) => ({ ...it, idx: k }))
      .filter((it) => it.product_id && Number(it.quantity) > 0);
    if (valid.length === 0) {
      toast.error("Adicione pelo menos um item válido");
      return;
    }
    setCreating(true);
    try {
      const { data: req, error: reqErr } = await supabase
        .from("factory_requests")
        .insert({
          store_id: draftStoreId,
          notes: draftNotes.trim() || null,
          requested_by: user!.id,
        })
        .select("id")
        .single();
      if (reqErr) throw reqErr;

      const itemsPayload = valid.map((it, k) => {
        const prod = products.find((p) => p.id === it.product_id);
        return {
          request_id: req.id,
          product_id: it.product_id,
          quantity_requested: Number(it.quantity),
          unit: prod?.unit ?? "UN",
          notes: it.notes.trim() || null,
          sort_order: k,
        };
      });
      const { error: itemsErr } = await supabase
        .from("factory_request_items")
        .insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      toast.success("Solicitação enviada para a fábrica");
      setOpenNew(false);
      resetDraft();
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar solicitação");
    } finally {
      setCreating(false);
    }
  };

  // ============== ACTIONS ==============
  const setItemField = async (
    itemId: string,
    field: "quantity_approved" | "quantity_delivered",
    value: number | null,
  ) => {
    const payload =
      field === "quantity_approved"
        ? { quantity_approved: value }
        : { quantity_delivered: value };
    const { error } = await supabase
      .from("factory_request_items")
      .update(payload)
      .eq("id", itemId);
    if (error) toast.error(error.message);
    else await loadAll();
  };

  const approveRequest = async (id: string) => {
    setActionsBusy(id);
    try {
      const req = requests.find((r) => r.id === id);
      if (req) {
        const toFill = req.items.filter((i) => i.quantity_approved == null);
        if (toFill.length > 0) {
          await Promise.all(
            toFill.map((i) =>
              supabase
                .from("factory_request_items")
                .update({ quantity_approved: i.quantity_requested })
                .eq("id", i.id),
            ),
          );
        }
      }
      const { error } = await supabase
        .from("factory_requests")
        .update({ status: "approved", approved_by: user!.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Solicitação aprovada");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionsBusy(null);
    }
  };

  const shipRequest = async (id: string) => {
    setActionsBusy(id);
    try {
      const req = requests.find((r) => r.id === id);
      if (req) {
        const toFill = req.items.filter((i) => i.quantity_delivered == null);
        if (toFill.length > 0) {
          await Promise.all(
            toFill.map((i) =>
              supabase
                .from("factory_request_items")
                .update({
                  quantity_delivered: i.quantity_approved ?? i.quantity_requested,
                })
                .eq("id", i.id),
            ),
          );
        }
      }
      const { error } = await supabase
        .from("factory_requests")
        .update({ status: "shipped", shipped_by: user!.id, shipped_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Marcado como enviado. Aguardando confirmação da loja.");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionsBusy(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    setRejecting(true);
    try {
      const { error } = await supabase
        .from("factory_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectReason.trim() || null,
        })
        .eq("id", rejectingId);
      if (error) throw error;
      toast.success("Solicitação recusada");
      setRejectingId(null);
      setRejectReason("");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRejecting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancellingId) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("factory_requests")
        .update({
          status: "cancelled",
          cancelled_by: user!.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", cancellingId);
      if (error) throw error;
      toast.success("Solicitação cancelada");
      setCancellingId(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!confirmingId) return;
    setConfirming(true);
    try {
      const { error } = await supabase.rpc("confirm_factory_request_receipt", {
        _request_id: confirmingId,
      });
      if (error) throw error;
      toast.success("Recebimento confirmado. Estoque atualizado.");
      setConfirmingId(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirming(false);
    }
  };

  // ============== RENDER ==============
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Requisições de urgência
          </h1>
          <p className="text-muted-foreground text-sm">
            Lojas pedem itens avulsos à fábrica. A fábrica aprova, separa e envia. A loja confirma
            o recebimento e o estoque é atualizado automaticamente.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setOpenNew(true)}>
          <Plus className="h-4 w-4" /> Nova solicitação
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "fulfill")}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="mine" className="flex-1 sm:flex-none gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Minhas solicitações
          </TabsTrigger>
          {canFulfill && (
            <TabsTrigger value="fulfill" className="flex-1 sm:flex-none gap-1.5">
              <PackageCheck className="h-4 w-4" />
              Atender ({fulfillQueue.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          <RequestsList
            loading={loading}
            requests={myRequests}
            mode="mine"
            currentUserId={user?.id ?? null}
            onCancel={(id) => setCancellingId(id)}
            onConfirmReceipt={(id) => setConfirmingId(id)}
            emptyMessage="Você ainda não fez nenhuma solicitação."
          />
        </TabsContent>

        {canFulfill && (
          <TabsContent value="fulfill" className="mt-4 space-y-4">
            <RequestsList
              loading={loading}
              requests={fulfillQueue}
              mode="fulfill"
              currentUserId={user?.id ?? null}
              onApprove={approveRequest}
              onShip={shipRequest}
              onReject={(id) => setRejectingId(id)}
              onItemQtyChange={setItemField}
              busyId={actionsBusy}
              emptyMessage="Nenhuma solicitação pendente para atender."
            />

            <details className="border rounded-md">
              <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-muted/40">
                Histórico (enviados, recebidos, recusados, cancelados)
              </summary>
              <div className="p-3 pt-0">
                <RequestsList
                  loading={loading}
                  requests={requests.filter(
                    (r) => !["pending", "approved"].includes(r.status),
                  )}
                  mode="history"
                  currentUserId={user?.id ?? null}
                  emptyMessage="Sem histórico."
                />
              </div>
            </details>
          </TabsContent>
        )}
      </Tabs>

      {/* ============== NOVO PEDIDO ============== */}
      <NewRequestDialog
        open={openNew}
        onOpenChange={(v) => {
          setOpenNew(v);
          if (!v) resetDraft();
        }}
        storeId={draftStoreId}
        setStoreId={setDraftStoreId}
        notes={draftNotes}
        setNotes={setDraftNotes}
        items={draftItems}
        onAddLine={addDraftLine}
        onRemoveLine={removeDraftLine}
        onUpdateLine={updateDraftLine}
        requestableStores={requestableStores}
        products={products}
        creating={creating}
        onSubmit={handleCreate}
      />

      {/* ============== REJEITAR ============== */}
      <Dialog
        open={!!rejectingId}
        onOpenChange={(v) => {
          if (!v) {
            setRejectingId(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa. A loja solicitante será notificada.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Sem estoque, item descontinuado, etc."
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectingId(null)} disabled={rejecting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting} className="gap-2">
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== CANCELAR ============== */}
      <AlertDialog
        open={!!cancellingId}
        onOpenChange={(v) => !v && setCancellingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A solicitação será marcada como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar solicitação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============== CONFIRMAR RECEBIMENTO ============== */}
      <AlertDialog
        open={!!confirmingId}
        onOpenChange={(v) => !v && setConfirmingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, os itens serão dados como <b>baixa no estoque da fábrica</b> e{" "}
              <b>entrada no estoque da loja</b>, usando as quantidades entregues. Confirme apenas
              após conferir fisicamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmReceipt();
              }}
              disabled={confirming}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar recebimento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
