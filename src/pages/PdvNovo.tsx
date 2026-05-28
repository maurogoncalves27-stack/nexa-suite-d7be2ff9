import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShoppingBag,
  Loader2,
  Plus,
  Lock,
  Unlock,
  Sparkles,
  CheckCircle2,
  Clock,
  ChefHat,
  Bike,
  AlertCircle,
  RefreshCw,
  Settings as SettingsIcon,
  MoreVertical,
  AlertTriangle,
  ArrowRight,
  CalendarIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortStores } from "@/lib/storeSort";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import NfceSection from "@/components/pdv-novo/NfceSection";
import TefConfigPanel from "@/components/pdv-novo/TefConfigPanel";
import StockShortagesPanel from "@/components/pdv-novo/StockShortagesPanel";
import { routePrintOrder } from "@/lib/routePrint";


// ===== Tipos ============================================================
interface Store {
  id: string;
  name: string;
  is_virtual?: boolean;
  parent_store_id?: string | null;
  brand_id?: string | null;
  ifood_merchant_id?: string | null;
  ifood_merchant_uuid?: string | null;
  ifood_environment?: "sandbox" | "production" | null;
  cnpj?: string | null;
  legal_name?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  regime_tributario?: number | null;
  nfce_csc_id_homolog?: string | null; // mantido p/ compat (não usado)
  nfce_csc_token_homolog?: string | null;
  nfce_csc_id_prod?: string | null;
  nfce_csc_token_prod?: string | null;
  nfce_serie?: number | null;
  nfce_next_number?: number | null;
  nfce_environment?: "homologacao" | "producao" | null;
}
interface Channel {
  id: string;
  store_id: string;
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}
interface CashSession {
  id: string;
  store_id: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  closed_at: string | null;
  closing_amount: number | null;
  status: "open" | "closed";
}
interface Order {
  id: string;
  store_id: string;
  channel_id: string;
  order_number: string | null;
  external_order_id: string | null;
  external_display_id: string | null;
  customer_name: string | null;
  status: PdvStatus;
  total: number;
  opened_at: string;
  order_type?: string | null;
  delivery_by?: string | null;
  packed_at?: string | null;
}


type PdvStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "dispatched"
  | "concluded"
  | "cancelled"
  | "dispute";

const STATUS_LABEL: Record<PdvStatus, { label: string; icon: typeof Clock; tone: string }> = {
  placed:     { label: "Recebido",      icon: Clock,        tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  confirmed:  { label: "Confirmado",    icon: CheckCircle2, tone: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  preparing:  { label: "Em preparo",    icon: ChefHat,      tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  ready:      { label: "Pronto",        icon: CheckCircle2, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  dispatched: { label: "Despachado",    icon: Bike,         tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  concluded:  { label: "Concluído",     icon: CheckCircle2, tone: "bg-green-500/15 text-green-600 dark:text-green-400" },
  cancelled:  { label: "Cancelado",     icon: AlertCircle,  tone: "bg-red-500/15 text-red-600 dark:text-red-400" },
  dispute:    { label: "Em disputa",    icon: AlertCircle,  tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

// Próxima transição "feliz" sugerida pra cada status
const NEXT_STEP: Partial<Record<PdvStatus, { to: PdvStatus; label: string; icon: typeof Clock }>> = {
  placed:     { to: "confirmed",  label: "Confirmar pedido", icon: CheckCircle2 },
  confirmed:  { to: "preparing",  label: "Iniciar preparo",  icon: ChefHat },
  preparing:  { to: "ready",      label: "Marcar como pronto", icon: CheckCircle2 },
  ready:      { to: "dispatched", label: "Despachar entrega", icon: Bike },
  dispatched: { to: "concluded",  label: "Concluir pedido",  icon: CheckCircle2 },
};

// Checklist interno (conferência ao marcar "Pronto p/ retirada").
// NÃO interfere na homologação iFood — é apenas um passo visual no PDV.
const READY_CHECKLIST: { key: string; label: string }[] = [
  { key: "montagem", label: "Montagem / enfeite" },
  { key: "sal_talher", label: "Sal / Talher" },
  { key: "folder", label: "Folder" },
];

const REFRI_RE = /refri|coca|guaran|sprite|fanta|pepsi|kuat|schweppes|soda|h2o/i;



// Motivos padrão de cancelamento (espelha cancellationReasons do iFood)
const CANCEL_REASONS: { code: string; label: string }[] = [
  { code: "501", label: "Erro no sistema" },
  { code: "502", label: "Pedido duplicado" },
  { code: "503", label: "Item indisponível" },
  { code: "504", label: "Restaurante sem entregador" },
  { code: "505", label: "Cliente desistiu" },
  { code: "506", label: "Endereço fora da área" },
  { code: "507", label: "Estabelecimento fechando" },
];

const fmt = (v: number) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

// =========================================================================
// PÁGINA
// =========================================================================
export default function PdvNovo({ hideHeader }: { hideHeader?: boolean } = {}) {
  const { user, isManager, isAdmin } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [lockedStoreId, setLockedStoreId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [session, setSession] = useState<CashSession | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCashDialog, setOpenCashDialog] = useState(false);
  const [closeCashDialog, setCloseCashDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("503");
  // Motivos vindos do iFood (GET /cancellationReasons). null = ainda não carregou para este pedido.
  const [ifoodCancelReasons, setIfoodCancelReasons] = useState<{ cancelCodeId: string; description: string }[] | null>(null);
  const [loadingCancelReasons, setLoadingCancelReasons] = useState(false);
  const [readyChecklistOrder, setReadyChecklistOrder] = useState<Order | null>(null);
  const [readyChecks, setReadyChecks] = useState<Record<string, boolean>>({});
  const [checkedByName, setCheckedByName] = useState("");
  const [readyItems, setReadyItems] = useState<Array<{ id: string; name: string; quantity: number; notes: string | null; complements: any }> | null>(null);
  const [loadingReadyItems, setLoadingReadyItems] = useState(false);

  // Histórico de pedidos — filtro por período (data inicial e final)
  const [historyDateStart, setHistoryDateStart] = useState<Date | undefined>(new Date());
  const [historyDateEnd, setHistoryDateEnd] = useState<Date | undefined>(new Date());
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // IDs agregados: quando a loja selecionada é uma física real (não virtual),
  // inclui ela própria + todas as lojas virtuais filhas (marcas Estroga, Box),
  // mas NUNCA inclui a "iFood Homologação" automaticamente.
  // Quando storeId === "ALL", inclui TODAS as lojas físicas + filhas.
  const aggregatedStoreIds = useMemo(() => {
    if (!storeId) return [] as string[];
    if (storeId === "ALL") {
      const realStores = stores.filter(
        (s) => s.is_virtual === false && !/escrit|fabri|estoque/i.test(s.name ?? "")
      );
      const allIds = new Set<string>();
      realStores.forEach((rs) => {
        allIds.add(rs.id);
        stores
          .filter((s) => s.is_virtual && s.parent_store_id === rs.id && !/homolog/i.test(s.name ?? ""))
          .forEach((c) => allIds.add(c.id));
      });
      return Array.from(allIds);
    }
    const sel = stores.find((s) => s.id === storeId);
    if (!sel) return [storeId];
    if (sel.is_virtual) return [sel.id]; // virtual selecionada diretamente (ex.: homolog)
    const children = stores.filter(
      (s) => s.is_virtual && s.parent_store_id === sel.id && !/homolog/i.test(s.name ?? "")
    );
    return [sel.id, ...children.map((c) => c.id)];
  }, [storeId, stores]);

  const channelsByStore = useMemo(
    () => channels.filter((c) => aggregatedStoreIds.includes(c.store_id)),
    [channels, aggregatedStoreIds]
  );


  const loadStores = useCallback(async () => {
    // Descobre se o usuário logado é um terminal de loja travado
    let locked: string | null = lockedStoreId;
    if (locked === null && user) {
      const { data: lockRes } = await supabase.rpc("get_terminal_store_id" as any, { _uid: user.id } as any);
      const lockedId = (typeof lockRes === "string" ? lockRes : null) as string | null;
      if (lockedId) {
        locked = lockedId;
        setLockedStoreId(lockedId);
      } else {
        setLockedStoreId(""); // marcou que já tentou, sem lock
      }
    }

    // Carrega todas as lojas ativas (físicas + virtuais por marca) para poder
    // agregar pedidos das marcas filhas (Estroga, Box) sob a loja física.
    const { data } = await supabase
      .from("stores")
      .select("id,name,store_type,is_virtual,parent_store_id,brand_id,is_active,ifood_merchant_id,ifood_merchant_uuid,ifood_environment,cnpj,legal_name,inscricao_estadual,inscricao_municipal,regime_tributario,nfce_serie,nfce_next_number,nfce_environment")
      .eq("is_active", true)
      .order("name");
    let list = sortStores(data ?? []) as Store[];

    if (locked) {
      // Terminal travado: só vê a própria loja
      list = list.filter((s) => s.id === locked);
      setStores(list);
      setStoreId(locked);
      return;
    }

    setStores(list);
    if (!storeId && list.length > 0) {
      // Padrão: "Ver todas as lojas"
      setStoreId("ALL");
    }
  }, [storeId, user, lockedStoreId]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  // Calcula IDs agregados a partir de um storeId raiz (loja física = inclui marcas virtuais filhas)
  // "ALL" = todas as lojas físicas + suas filhas virtuais
  const computeAggregatedIds = useCallback(
    (sid: string): string[] => {
      if (sid === "ALL") {
        const realStores = stores.filter(
          (s) => s.is_virtual === false && !/escrit|fabri|estoque/i.test(s.name ?? "")
        );
        const allIds = new Set<string>();
        realStores.forEach((rs) => {
          allIds.add(rs.id);
          stores
            .filter((s) => s.is_virtual && s.parent_store_id === rs.id && !/homolog/i.test(s.name ?? ""))
            .forEach((c) => allIds.add(c.id));
        });
        return Array.from(allIds);
      }
      const sel = stores.find((s) => s.id === sid);
      if (!sel) return [sid];
      if (sel.is_virtual) return [sel.id];
      const children = stores.filter(
        (s) => s.is_virtual && s.parent_store_id === sel.id && !/homolog/i.test(s.name ?? "")
      );
      return [sel.id, ...children.map((c) => c.id)];
    },
    [stores]
  );


  const loadForStore = useCallback(
    async (sid: string) => {
      setLoading(true);
      const ids = computeAggregatedIds(sid);
      const isAll = sid === "ALL";
      const [chRes, sessRes, ordRes] = await Promise.all([
        supabase
          .from("pdv_channels")
          .select("id,store_id,code,name,is_active,sort_order")
          .in("store_id", ids)
          .order("sort_order"),
        isAll
          ? Promise.resolve({ data: null })
          : supabase
              .from("pdv_cash_sessions")
              .select("id,store_id,opened_by,opened_at,opening_amount,closed_at,closing_amount,status")
              .eq("store_id", sid)
              .eq("status", "open")
              .maybeSingle(),
        supabase
          .from("pdv_orders")
          .select("id,store_id,channel_id,order_number,external_order_id,external_display_id,customer_name,status,total,opened_at,order_type,delivery_by,packed_at")
          .in("store_id", ids)
          .order("opened_at", { ascending: false })
          .limit(150),
      ]);
      setChannels(chRes.data ?? []);
      if (isAll) {
        setSession(null);
      } else {
        let sess = (sessRes.data ?? null) as CashSession | null;
        // Auto-abre sessão "virtual" (sem dinheiro físico) se não houver — vendas só por totem/cartão/Pix
        if (!sess && user) {
          const { data: created } = await supabase
            .from("pdv_cash_sessions")
            .insert({ store_id: sid, opened_by: user.id, opening_amount: 0, status: "open" })
            .select("id,store_id,opened_by,opened_at,opening_amount,closed_at,closing_amount,status")
            .maybeSingle();
          if (created) sess = created as CashSession;
        }
        setSession(sess);
      }
      setOrders((ordRes.data ?? []) as Order[]);
      setLoading(false);
    },
    [user, computeAggregatedIds]
  );
  const loadHistoryOrders = useCallback(
    async (sid: string, startDate: Date, endDate: Date) => {
      setHistoryLoading(true);
      const ids = computeAggregatedIds(sid);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("pdv_orders")
        .select("id,store_id,channel_id,order_number,external_order_id,external_display_id,customer_name,status,total,opened_at,order_type,delivery_by,packed_at")
        .in("store_id", ids)
        .gte("opened_at", start.toISOString())
        .lte("opened_at", end.toISOString())
        .order("opened_at", { ascending: false });
      setHistoryOrders((data ?? []) as Order[]);
      setHistoryLoading(false);
    },
    [computeAggregatedIds]
  );

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (storeId) void loadForStore(storeId);
  }, [storeId, loadForStore]);

  useEffect(() => {
    if (storeId && historyDateStart && historyDateEnd) void loadHistoryOrders(storeId, historyDateStart, historyDateEnd);
  }, [storeId, historyDateStart, historyDateEnd, loadHistoryOrders]);

  // ===== Caixa ===========================================================
  const handleOpenCash = async () => {
    if (!user || !storeId) return;
    setBusy(true);
    const { error } = await supabase.from("pdv_cash_sessions").insert({
      store_id: storeId,
      opened_by: user.id,
      opening_amount: Number(openingAmount.replace(",", ".")) || 0,
      status: "open",
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao abrir caixa", description: error.message, variant: "destructive" });
      return;
    }
    setOpenCashDialog(false);
    setOpeningAmount("0");
    toast({ title: "Caixa aberto" });
    void loadForStore(storeId);
  };

  const handleCloseCash = async () => {
    if (!session) return;
    setBusy(true);
    const closing = Number(closingAmount.replace(",", ".")) || 0;
    const { error } = await supabase
      .from("pdv_cash_sessions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: user?.id,
        closing_amount: closing,
      })
      .eq("id", session.id);
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao fechar caixa", description: error.message, variant: "destructive" });
      return;
    }
    setCloseCashDialog(false);
    setClosingAmount("0");
    toast({ title: "Caixa fechado" });
    void loadForStore(storeId);
  };

  // ===== Mock iFood ======================================================
  const handleMockIfoodOrder = async () => {
    if (!storeId) return;
    const ifoodChannel = channelsByStore.find((c) => c.code === "ifood");
    if (!ifoodChannel) {
      toast({
        title: "Canal iFood não configurado",
        description: "Crie o canal 'ifood' na aba Configuração.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const fakeOrderNumber = `MOCK-${Math.floor(Math.random() * 9000 + 1000)}`;
    const fakeTotal = Number((Math.random() * 80 + 25).toFixed(2));
    const { error } = await supabase.from("pdv_orders").insert({
      store_id: storeId,
      channel_id: ifoodChannel.id,
      cash_session_id: session?.id ?? null,
      order_number: fakeOrderNumber,
      external_order_id: `ifood-mock-${Date.now()}`,
      customer_name: "Cliente iFood (mock)",
      status: "placed",
      order_type: "delivery",
      delivery_by: "IFOOD",
      subtotal: fakeTotal,
      total: fakeTotal,
      created_by: user?.id ?? null,
      source_payload: { mock: true, generated_at: new Date().toISOString() },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao simular pedido", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Pedido ${fakeOrderNumber} recebido`, description: "Simulação iFood inserida (status: placed)." });
    void loadForStore(storeId);
  };

  // ===== Máquina de estados =============================================
  // Mapeia nosso status pra ação iFood correspondente
  const STATUS_TO_IFOOD_ACTION: Partial<Record<PdvStatus, "confirm" | "startPreparation" | "readyToPickup" | "dispatch">> = {
    confirmed: "confirm",
    preparing: "startPreparation",
    ready: "readyToPickup",
    dispatched: "dispatch",
  };

  const isIfoodOrder = (order: Order) => {
    const ch = channels.find((c) => c.id === order.channel_id);
    if (!ch) return false;
    if (!/ifood/i.test(ch.name)) return false;
    const store = stores.find((s) => s.id === order.store_id);
    return Boolean(store?.ifood_merchant_uuid);
  };

  // Quando o operador abre o diálogo de cancelamento de um pedido iFood,
  // PRECISAMOS chamar GET /cancellationReasons antes de qualquer requestCancellation
  // (requisito da homologação iFood). Os motivos retornados substituem a lista padrão.
  useEffect(() => {
    if (!cancelOpen || !selectedOrder) {
      setIfoodCancelReasons(null);
      return;
    }
    if (!isIfoodOrder(selectedOrder)) {
      setIfoodCancelReasons(null);
      return;
    }
    let cancelled = false;
    setLoadingCancelReasons(true);
    setIfoodCancelReasons(null);
    const env = stores.find((s) => s.id === selectedOrder.store_id)?.ifood_environment ?? "sandbox";
    supabase.functions
      .invoke("ifood-cancellation-reasons", { body: { orderId: selectedOrder.id, environment: env } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || (data as { ok?: boolean })?.ok === false) {
          const msg = error?.message || (data as { error?: string })?.error || "Falha ao buscar motivos no iFood";
          toast({ title: "Não foi possível carregar motivos do iFood", description: msg, variant: "destructive" });
          setIfoodCancelReasons([]);
          return;
        }
        const reasons = ((data as { reasons?: { cancelCodeId: string; description: string }[] })?.reasons) ?? [];
        setIfoodCancelReasons(reasons);
        if (reasons[0]) setCancelReason(reasons[0].cancelCodeId);
      })
      .finally(() => { if (!cancelled) setLoadingCancelReasons(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelOpen, selectedOrder?.id]);

  const advanceStatus = async (order: Order, newStatus: PdvStatus, eventCode?: string) => {
    setBusy(true);
    const ifoodAction = STATUS_TO_IFOOD_ACTION[newStatus];
    if (isIfoodOrder(order) && ifoodAction) {
      const env = stores.find((s) => s.id === order.store_id)?.ifood_environment ?? "sandbox";
      const { data, error } = await supabase.functions.invoke("ifood-action", {
        body: { orderId: order.id, action: ifoodAction, environment: env },
      });
      setBusy(false);
      if (error || (data as { ok?: boolean })?.ok === false) {
        const msg = error?.message || (data as { error?: string })?.error || "Falha ao notificar iFood";
        toast({ title: "Não foi possível avançar", description: msg, variant: "destructive" });
        return;
      }
      toast({ title: `Pedido ${STATUS_LABEL[newStatus].label.toLowerCase()} (iFood)` });
      void loadForStore(storeId);
      return;
    }

    const { data, error } = await supabase.rpc("pdv_advance_order_status", {
      p_order_id: order.id,
      p_new_status: newStatus,
      p_event_code: eventCode ?? null,
      p_payload: {},
      p_source: "internal",
      p_external_event_id: null,
      p_reason_code: null,
      p_reason_text: null,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Não foi possível avançar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Pedido ${STATUS_LABEL[newStatus].label.toLowerCase()}` });
    if (data && typeof data === "object" && "id" in data) {
      setSelectedOrder(data as Order);
    }
    void loadForStore(storeId);
  };

  const cancelOrder = async () => {
    if (!selectedOrder) return;
    const reason = CANCEL_REASONS.find((r) => r.code === cancelReason);
    setBusy(true);

    if (isIfoodOrder(selectedOrder)) {
      // Para iFood: usa SOMENTE o motivo retornado por GET /cancellationReasons.
      const ifoodReason = ifoodCancelReasons?.find((r) => r.cancelCodeId === cancelReason);
      if (!ifoodReason) {
        setBusy(false);
        toast({
          title: "Selecione um motivo do iFood",
          description: "É preciso escolher um motivo retornado por /cancellationReasons antes de cancelar.",
          variant: "destructive",
        });
        return;
      }
      const env = stores.find((s) => s.id === selectedOrder.store_id)?.ifood_environment ?? "sandbox";
      const { data, error } = await supabase.functions.invoke("ifood-action", {
        body: {
          orderId: selectedOrder.id,
          action: "cancel",
          environment: env,
          reason: { cancellationCode: ifoodReason.cancelCodeId, reason: ifoodReason.description },
        },
      });
      setBusy(false);
      if (error || (data as { ok?: boolean })?.ok === false) {
        const msg = error?.message || (data as { error?: string })?.error || "Falha ao cancelar no iFood";
        toast({ title: "Erro ao cancelar", description: msg, variant: "destructive" });
        return;
      }
      toast({ title: "Cancelamento enviado ao iFood" });
      setCancelOpen(false);
      setSelectedOrder(null);
      void loadForStore(storeId);
      return;
    }

    const { error } = await supabase.rpc("pdv_advance_order_status", {
      p_order_id: selectedOrder.id,
      p_new_status: "cancelled",
      p_event_code: "CANCELLATION_REQUESTED",
      p_payload: { reason_code: cancelReason, reason_text: reason?.label },
      p_source: "internal",
      p_external_event_id: null,
      p_reason_code: cancelReason,
      p_reason_text: reason?.label ?? null,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido cancelado" });
    setCancelOpen(false);
    setSelectedOrder(null);
    void loadForStore(storeId);
  };

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "—";
  const orderLabel = (o: Order) => {
    const ch = channels.find((c) => c.id === o.channel_id);
    const raw = (ch?.name ?? "").toUpperCase();
    const prefix = raw.includes("IFOOD") || raw.includes("I-FOOD") || raw.includes("IFD")
      ? "IFOOD"
      : raw.includes("TOTEM")
      ? "TOTEM"
      : raw.includes("SAL")
      ? "SALÃO"
      : raw.includes("BALC")
      ? "BALCÃO"
      : raw || "PEDIDO";
    const num = o.external_display_id ?? o.order_number ?? "—";
    return `${prefix} - ${num}`;
  };


  const [settingsOpen, setSettingsOpen] = useState(false);
  const AUTO_ACCEPT_KEY = "pdvNovo:autoAcceptEnabled";
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(AUTO_ACCEPT_KEY) === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTO_ACCEPT_KEY, autoAcceptEnabled ? "1" : "0");
    }
  }, [autoAcceptEnabled]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const realtimeRefreshRef = useRef<number | null>(null);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const firstOrdersLoadRef = useRef<boolean>(false);

  // Marca os pedidos já existentes como "vistos" no 1º carregamento para não imprimir histórico
  useEffect(() => {
    if (firstOrdersLoadRef.current) return;
    if (orders.length === 0 && !storeId) return;
    orders.forEach((o) => seenOrderIdsRef.current.add(o.id));
    firstOrdersLoadRef.current = true;
  }, [orders, storeId]);

  // Imprime comanda + cupom de um pedido recém-chegado
  const printNewOrder = useCallback(async (orderId: string, orderStoreId: string) => {
    try {
      const [ordRes, itemsRes, chRes, stRes] = await Promise.all([
        supabase.from("pdv_orders")
          .select("id,order_number,external_display_id,customer_name,customer_phone,delivery_address,notes,total,opened_at,order_type,channel_id")
          .eq("id", orderId).maybeSingle(),
        supabase.from("pdv_order_items")
          .select("name,quantity,unit_price,total_price,notes")
          .eq("order_id", orderId).order("created_at"),
        supabase.from("pdv_channels").select("id,name").eq("store_id", orderStoreId),
        supabase.from("stores").select("name").eq("id", orderStoreId).maybeSingle(),
      ]);
      const ord = ordRes.data as any;
      if (!ord) return;
      const chName = (chRes.data ?? []).find((c: any) => c.id === ord.channel_id)?.name ?? "";
      const sName = (stRes.data as any)?.name ?? "";
      // sino curto
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [0, 180, 360].forEach((delay) => setTimeout(() => {
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.type = "sine"; osc.connect(g); g.connect(ctx.destination);
          osc.frequency.value = 1480; g.gain.value = 0.18;
          osc.start(); setTimeout(() => osc.stop(), 140);
        }, delay));
        setTimeout(() => ctx.close(), 1200);
      } catch {}
      await routePrintOrder({
        storeId: orderStoreId,
        storeName: sName,
        order: {
          id: ord.id,
          order_number: ord.external_display_id ?? ord.order_number,
          channel_name: chName,
          order_type: ord.order_type,
          customer_name: ord.customer_name,
          customer_phone: ord.customer_phone,
          delivery_address: ord.delivery_address,
          notes: ord.notes,
          total: Number(ord.total ?? 0),
          opened_at: ord.opened_at,
          items: (itemsRes.data ?? []).map((it: any) => ({
            name: it.name,
            quantity: Number(it.quantity ?? 1),
            unit_price: Number(it.unit_price ?? 0),
            total: Number(it.total_price ?? 0),
            notes: it.notes,
          })),
        },
      });
    } catch (e) {
      console.warn("[pdv-novo] falha ao imprimir comanda automática", e);
    }
  }, []);

  useEffect(() => {
    if (!storeId) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadForStore(storeId);
    }, 30_000);
    return () => clearInterval(t);
  }, [storeId, loadForStore]);
  useEffect(() => {
    if (!storeId || aggregatedStoreIds.length === 0) return;

    const refreshVisibleData = (changedStoreId?: string | null) => {
      if (changedStoreId && !aggregatedStoreIds.includes(changedStoreId)) return;
      if (realtimeRefreshRef.current) {
        window.clearTimeout(realtimeRefreshRef.current);
      }
      realtimeRefreshRef.current = window.setTimeout(() => {
        void loadForStore(storeId);
        if (historyDateStart && historyDateEnd) {
          void loadHistoryOrders(storeId, historyDateStart, historyDateEnd);
        }
      }, 350);
    };

    const channel = supabase
      .channel(`pdv-orders-live:${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pdv_orders" },
        (payload) => {
          const nextStoreId = (payload.new as { store_id?: string } | null)?.store_id;
          const prevStoreId = (payload.old as { store_id?: string } | null)?.store_id;
          const sid = nextStoreId ?? prevStoreId ?? null;
          // Auto-impressão de comanda em pedido NOVO
          if (
            payload.eventType === "INSERT" &&
            nextStoreId &&
            aggregatedStoreIds.includes(nextStoreId) &&
            firstOrdersLoadRef.current
          ) {
            const newId = (payload.new as { id?: string } | null)?.id;
            if (newId && !seenOrderIdsRef.current.has(newId)) {
              seenOrderIdsRef.current.add(newId);
              // pequeno atraso pra garantir que pdv_order_items já chegou
              window.setTimeout(() => { void printNewOrder(newId, nextStoreId); }, 600);
            }
          }
          refreshVisibleData(sid);
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefreshRef.current) {
        window.clearTimeout(realtimeRefreshRef.current);
        realtimeRefreshRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [aggregatedStoreIds, historyDateEnd, historyDateStart, loadForStore, loadHistoryOrders, storeId, printNewOrder]);



  // Carrega itens reais do pedido ao abrir o checklist
  useEffect(() => {
    if (!readyChecklistOrder) {
      setReadyItems(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingReadyItems(true);
      const { data, error } = await supabase
        .from("pdv_order_items")
        .select("id,name,quantity,notes,complements")
        .eq("order_id", readyChecklistOrder.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setLoadingReadyItems(false);
      if (error) {
        setReadyItems([]);
        return;
      }
      setReadyItems((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [readyChecklistOrder]);


  type KanbanCol = {
    key: string;
    label: string;
    statuses: PdvStatus[];
    headerCls: string;
    accentCls: string;
    nextLabel?: string;
    nextTo?: PdvStatus;
    nextBtnCls?: string;
    /** Predicado opcional. Quando definido, sobrepõe statuses.includes(o.status). */
    match?: (o: Order) => boolean;
    /** Ação alternativa do botão "próximo" — usada por colunas internas (ex.: Embalar). */
    customAction?: "pack";
  };

  // Predicados auxiliares para distinguir "Em produção" de "Pedido embalado"
  const inProductionStatuses: PdvStatus[] = autoAcceptEnabled
    ? ["placed", "confirmed", "preparing"]
    : ["confirmed", "preparing"];
  const isInProduction = (o: Order) => inProductionStatuses.includes(o.status) && !o.packed_at;
  const isPacked = (o: Order) => o.status === "preparing" && !!o.packed_at;

  const ALL_COLUMNS: KanbanCol[] = [
    { key: "analise",    label: "Em análise",         statuses: ["placed"],                   headerCls: "bg-amber-500 text-white border-amber-600",
      accentCls: "border-l-amber-500",   nextLabel: "Aceitar pedido", nextTo: "confirmed", nextBtnCls: "bg-blue-600 hover:bg-blue-700 text-white" },
    { key: "producao",   label: "Em produção",
      statuses: inProductionStatuses,
      match: isInProduction,
      headerCls: "bg-orange-500 text-white border-orange-600",
      accentCls: "border-l-orange-500",  nextLabel: "Embalar", customAction: "pack", nextBtnCls: "bg-purple-600 hover:bg-purple-700 text-white" },
    { key: "embalado",   label: "Pedido embalado",
      statuses: ["preparing"],
      match: isPacked,
      headerCls: "bg-secondary text-secondary-foreground border-border",
      accentCls: "border-l-secondary",   nextLabel: "Pronto p/ retirada", nextTo: "ready", nextBtnCls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { key: "pronto",     label: "Pronto p/ retirada", statuses: ["ready"],                    headerCls: "bg-emerald-500 text-white border-emerald-600",
      accentCls: "border-l-emerald-500", nextLabel: "Despachar", nextTo: "dispatched", nextBtnCls: "bg-blue-600 hover:bg-blue-700 text-white" },
    { key: "entrega",    label: "Em entrega",         statuses: ["dispatched"],               headerCls: "bg-blue-600 text-white border-blue-700",
      accentCls: "border-l-blue-600",    nextLabel: "Concluir", nextTo: "concluded", nextBtnCls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { key: "concluido",  label: "Concluído",          statuses: ["concluded"],                headerCls: "bg-card text-foreground border-border",
      accentCls: "border-l-muted-foreground/40" },
    { key: "cancelado",  label: "Cancelado",          statuses: ["cancelled", "dispute"],     headerCls: "bg-red-500 text-white border-red-600",
      accentCls: "border-l-destructive" },
  ];
  // "Concluído" e "Cancelado" não aparecem no kanban — consulta-se pela aba "Histórico de pedidos".
  // Quando "Aceitar automaticamente" está ligado, "Em análise" também some.
  const COLUMNS: KanbanCol[] = ALL_COLUMNS.filter(
    (c) => c.key !== "concluido" && c.key !== "cancelado" && (!autoAcceptEnabled || c.key !== "analise")
  );

  // Helper: pertence à coluna?
  const matchesCol = (c: KanbanCol, o: Order) =>
    c.match ? c.match(o) : c.statuses.includes(o.status);

  // Marca pedido como embalado (uso interno, não toca em status do iFood).
  const packOrder = useCallback(async (o: Order) => {
    setBusy(true);
    const { error } = await supabase
      .from("pdv_orders")
      .update({ packed_at: new Date().toISOString() })
      .eq("id", o.id);
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao marcar como embalado", description: error.message, variant: "destructive" });
      return;
    }
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, packed_at: new Date().toISOString() } : x)));
  }, []);


  // Auto-confirma pedidos em "placed" quando o toggle está ligado (notifica iFood se aplicável).
  const autoConfirmingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoAcceptEnabled) return;
    const placedOrders = orders.filter((o) => o.status === "placed");
    placedOrders.forEach((o) => {
      if (autoConfirmingRef.current.has(o.id)) return;
      autoConfirmingRef.current.add(o.id);
      void advanceStatus(o, "confirmed").catch(() => {
        autoConfirmingRef.current.delete(o.id);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, autoAcceptEnabled]);


  const ordersByColumn = useMemo(() => {
    const m: Record<string, Order[]> = {};
    for (const col of COLUMNS) {
      m[col.key] = orders.filter((o) => matchesCol(col, o));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const minutesSince = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 60000);
  const fmtElapsed = (iso: string) => {
    const m = minutesSince(iso);
    if (m < 1) return "agora";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  };

  const activeStatuses: PdvStatus[] = ["placed", "confirmed", "preparing", "ready", "dispatched"];
  const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));
  const lateOrders = activeOrders.filter((o) => minutesSince(o.opened_at) >= 60);
  const inPrepCount = orders.filter((o) => o.status === "confirmed" || o.status === "preparing").length;
  // Pedidos exibidos na linha do tempo: ativos + finalizados/cancelados do dia atual.
  // No dia seguinte, finalizados/cancelados saem da operação e ficam só no histórico.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const isToday = (iso: string) => new Date(iso).getTime() >= startOfToday.getTime();
  const displayOrders = orders
    .filter((o) => activeStatuses.includes(o.status))
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());


  // ===== Render ==========================================================
  return (
    <div className={cn("space-y-6", hideHeader && "pt-0")}>
      {!hideHeader && (
        <>
          {/* Cabeçalho padrão */}
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              PDV
            </h1>
            <p className="text-muted-foreground">
              Painel do gestor. Acompanhe pedidos do iFood e dos demais canais em tempo real.
            </p>
          </div>
        </>
      )}

      <Tabs defaultValue="operacao">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="operacao">Operação</TabsTrigger>
            <TabsTrigger value="historico">Histórico de pedidos</TabsTrigger>
          </TabsList>

          <div className="w-full sm:w-[260px]">
            {lockedStoreId ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/40 text-sm font-medium">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{selectedStore?.name ?? "—"}</span>
              </div>
            ) : (
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Loja / canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Ver todas as lojas</SelectItem>
                  {stores
                    .filter((s) => s.is_virtual === false && !/escrit|fabri|estoque/i.test(s.name))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
            {inPrepCount > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                <ChefHat className="h-3 w-3 mr-1" />
                {inPrepCount} em preparo
              </Badge>
            )}
            {lateOrders.length > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {lateOrders.length} atrasado{lateOrders.length > 1 ? "s" : ""}
              </Badge>
            )}
            <Button size="icon" variant="outline" onClick={() => storeId && loadForStore(storeId)} disabled={loading} title="Atualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setSettingsOpen(true)} title="Configurações do PDV">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ========== OPERAÇÃO — KANBAN ========== */}
        <TabsContent value="operacao" className="mt-4 space-y-4">

          {/* Kanban — um card por pedido em linha; colunas kanban dentro do card */}
          <div className="space-y-2">
            {/* Cabeçalho fixo das colunas (fica grudado no topo ao rolar) */}
            <div className="sticky top-0 z-20 rounded-lg border bg-card shadow-sm">
              <div className="grid gap-px bg-border rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(0, 1fr))` }}>
                {COLUMNS.map((c) => {
                  const count = activeOrders.filter((o) => matchesCol(c, o)).length;
                  return (
                    <div key={c.key} className={`px-2 py-2 ${c.headerCls} flex items-center justify-between min-w-0`}>
                      <span className="text-[10px] md:text-xs font-semibold uppercase tracking-tight truncate">{c.label}</span>
                      <span className="text-xs font-bold ml-1 shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {displayOrders.length === 0 ? (
              <div className="rounded-lg border bg-card p-10">
                <p className="text-xs text-muted-foreground text-center">
                  Nenhum pedido hoje. Pedidos de dias anteriores aparecem no histórico.
                </p>
              </div>
            ) : (
              displayOrders.map((o) => {
                const colIdx = COLUMNS.findIndex((c) => matchesCol(c, o));
                if (colIdx === -1) return null;
                const col = COLUMNS[colIdx];
                const elapsed = minutesSince(o.opened_at);
                const num = orderLabel(o);

                const isDone = o.status === "concluded";
                const isCancel = o.status === "cancelled" || o.status === "dispute";
                const isFinal = isDone || isCancel;
                const late = !isFinal && elapsed >= 60;
                const warning = !late && !isFinal && elapsed >= 45;
                const blinkCls = late
                  ? "animate-blink-late border-destructive"
                  : warning
                  ? "animate-blink-warning border-warning"
                  : "";

                if (isFinal) {
                  const cls = isDone
                    ? "border-success/60 bg-success/5 text-success hover:bg-success/10"
                    : "border-destructive/60 bg-destructive/5 text-destructive hover:bg-destructive/10";
                  const label = isDone ? "Concluído" : "Cancelado";

                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrder(o)}
                      className={`w-full rounded-lg border shadow-sm px-3 py-3 flex items-center justify-center gap-3 transition-colors ${cls}`}
                      title="Ver detalhes do pedido"
                    >
                      <span className="font-extrabold text-base">{num}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                    </button>
                  );
                }

                return (
                  <div
                    key={o.id}
                    className={`rounded-lg border bg-card shadow-sm overflow-hidden ${blinkCls}`}
                  >
                    <div className="grid gap-px bg-border" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(0, 1fr))` }}>
                      {COLUMNS.map((c, i) => {
                        const active = i === colIdx;
                        return (
                          <div
                            key={c.key}
                            className={`min-h-[72px] flex items-center justify-center px-2 py-1.5 ${
                              active ? "bg-card" : "bg-muted/30"
                            }`}
                          >
                            {active && (
                              <div className="flex flex-col items-center gap-1.5 w-full">
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrder(o)}
                                  className="font-extrabold text-base hover:underline"
                                  title="Ver detalhes do pedido"
                                >
                                  {orderLabel(o)}

                                </button>
                                {(c.nextTo || c.customAction) && c.nextLabel && (
                                  <Button
                                    size="sm"
                                    className={`h-8 text-[11px] px-3 ${c.nextBtnCls ?? ""}`}
                                    disabled={busy}
                                    onClick={() => {
                                      if (c.customAction === "pack") {
                                        packOrder(o);
                                      } else if (c.nextTo === "ready") {
                                        setReadyChecks({});
                                        setCheckedByName("");
                                        setReadyChecklistOrder(o);
                                      } else if (c.nextTo) {
                                        advanceStatus(o, c.nextTo);
                                      }
                                    }}
                                  >
                                    {c.nextTo === "confirmed" ? "Aceitar" : c.nextLabel}
                                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );



              })
            )}
          </div>

        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Histórico de pedidos</CardTitle>
                  <CardDescription className="text-xs">
                    Pedidos no período selecionado.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Data inicial */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal text-xs",
                          !historyDateStart && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {historyDateStart ? (
                          format(historyDateStart, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span>Data inicial</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={historyDateStart}
                        onSelect={setHistoryDateStart}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground text-xs">até</span>
                  {/* Data final */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal text-xs",
                          !historyDateEnd && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {historyDateEnd ? (
                          format(historyDateEnd, "dd/MM/yyyy", { locale: ptBR })
                        ) : (
                          <span>Data final</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={historyDateEnd}
                        onSelect={setHistoryDateEnd}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <OrdersList
                  orders={historyOrders}
                  channelName={channelName}
                  emptyMsg="Nenhum pedido no período selecionado."
                  onSelect={setSelectedOrder}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Dialog: configurações do PDV (iFood / NFC-e / Canais / TEF / Estoque) ===== */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              Configurações do PDV
            </DialogTitle>
            <DialogDescription>
              Vínculo iFood, fiscal NFC-e, canais, TEF e estoque da loja <strong>{selectedStore?.name ?? "—"}</strong>.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="ifood">
            <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full">
              <TabsTrigger value="ifood" className="text-xs">iFood</TabsTrigger>
              <TabsTrigger value="nfce" className="text-xs">NFC-e</TabsTrigger>
              <TabsTrigger value="canais" className="text-xs">Canais</TabsTrigger>
              <TabsTrigger value="tef" className="text-xs">TEF</TabsTrigger>
              <TabsTrigger value="estoque" className="text-xs">Estoque</TabsTrigger>
            </TabsList>

            <TabsContent value="ifood" className="mt-4 space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-accept-toggle" className="text-sm font-medium">
                    Receber pedidos automaticamente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, a coluna "Em análise" some do kanban — os pedidos novos já entram direto em produção.
                  </p>
                </div>
                <Switch
                  id="auto-accept-toggle"
                  checked={autoAcceptEnabled}
                  onCheckedChange={setAutoAcceptEnabled}
                />
              </div>

              {/* Um editor de vínculo iFood por marca: a loja física (Aquela Parmê)
                  + cada loja virtual filha (ex.: AQUELE ESTROGONOFE, BOX CAIPIRA).
                  A "iFood Homologação" não entra aqui — fica no botão separado abaixo. */}
              {selectedStore && (() => {
                const brandStores = selectedStore.is_virtual
                  ? [selectedStore]
                  : [
                      selectedStore,
                      ...stores.filter(
                        (s) =>
                          s.is_virtual &&
                          s.parent_store_id === selectedStore.id &&
                          !/homolog/i.test(s.name ?? "")
                      ),
                    ];
                return (
                  <div className="space-y-4">
                    {brandStores.map((bs) => (
                      <div key={bs.id} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{bs.name}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {bs.is_virtual ? "Marca virtual" : "Loja física"}
                          </Badge>
                        </div>
                        <IfoodStoreEditor store={bs} onSaved={() => void loadStores()} />
                      </div>
                    ))}
                  </div>
                );
              })()}
              {selectedStore?.ifood_merchant_uuid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    const env = selectedStore.ifood_environment ?? "sandbox";
                    toast({ title: "Buscando pedidos no iFood…" });
                    const { data, error } = await supabase.functions.invoke("ifood-poll", { body: { environment: env } });
                    if (error) {
                      toast({ title: "Erro no polling", description: error.message, variant: "destructive" });
                      return;
                    }
                    const d = data as { events?: number; message?: string };
                    toast({ title: d?.events ? `${d.events} evento(s) processado(s)` : "Sem novos pedidos", description: d?.message });
                    if (storeId) void loadForStore(storeId);
                  }}
                >
                  Buscar pedidos no iFood agora
                </Button>
              )}

              {(() => {
                const homolog = stores.find((s: any) => (s.name ?? "").toLowerCase().includes("homolog"));
                if (!homolog || homolog.id === storeId) return null;
                return (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setStoreId(homolog.id);
                      setSettingsOpen(false);
                      toast({ title: "Acessando iFood Homologação" });
                    }}
                  >
                    Acessar iFood Homologação
                  </Button>
                );
              })()}
            </TabsContent>

            <TabsContent value="nfce" className="mt-4">
              {selectedStore && <NfceStoreEditor store={selectedStore} onSaved={() => void loadStores()} />}
            </TabsContent>

            <TabsContent value="canais" className="mt-4">
              {channelsByStore.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum canal cadastrado para esta loja.</p>
              ) : (
                <ul className="divide-y">
                  {channelsByStore.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">code: {c.code}</p>
                      </div>
                      <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "ativo" : "inativo"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="tef" className="mt-4">
              <TefConfigPanel />
            </TabsContent>

            <TabsContent value="estoque" className="mt-4">
              <StockShortagesPanel storeId={storeId} />
            </TabsContent>
          </Tabs>

        </DialogContent>
      </Dialog>

      {/* ===== Dialog: detalhes + ações do pedido ===== */}
      <Dialog open={!!selectedOrder && !cancelOpen} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          {selectedOrder && (() => {
            const meta = STATUS_LABEL[selectedOrder.status] ?? STATUS_LABEL.placed;
            const next = NEXT_STEP[selectedOrder.status];
            const isTakeout = selectedOrder.order_type === "takeout" || selectedOrder.order_type === "dineIn";
            const closeable = selectedOrder.status === "ready" && isTakeout;
            const NextIcon = next?.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                    Pedido {orderLabel(selectedOrder)}

                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                      <meta.icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{channelName(selectedOrder.channel_id)}</Badge>
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{selectedOrder.customer_name ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span className="font-medium">{selectedOrder.order_type ?? "—"}{selectedOrder.delivery_by ? ` • ${selectedOrder.delivery_by}` : ""}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aberto em</span><span className="font-medium">{fmtDateTime(selectedOrder.opened_at)}</span></div>
                  <div className="flex justify-between border-t pt-2 mt-2"><span className="text-muted-foreground">Total</span><span className="font-bold">{fmt(selectedOrder.total)}</span></div>
                </div>

                {selectedOrder.status === "concluded" && (
                  <NfceSection orderId={selectedOrder.id} />
                )}

                <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse sm:items-stretch">
                  {!["concluded", "cancelled"].includes(selectedOrder.status) && (
                    <div className="flex justify-center">
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10 h-8 px-3 text-xs" disabled={busy} onClick={() => setCancelOpen(true)}>
                        <AlertCircle className="h-3.5 w-3.5 mr-1.5" />Cancelar pedido
                      </Button>
                    </div>
                  )}
                  {closeable && (
                    <Button variant="secondary" disabled={busy} onClick={() => advanceStatus(selectedOrder, "concluded", "PICKED_UP")}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />Cliente retirou
                    </Button>
                  )}
                  {next && NextIcon && (
                    <Button disabled={busy} onClick={() => {
                      if (next.to === "ready") {
                        setReadyChecks({});
                        setCheckedByName("");
                        setReadyChecklistOrder(selectedOrder);
                      } else {
                        advanceStatus(selectedOrder, next.to);
                      }
                    }}>
                      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <NextIcon className="h-4 w-4 mr-2" />}
                      {next.label}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: motivo do cancelamento ===== */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          {(() => {
            const isIfood = !!selectedOrder && isIfoodOrder(selectedOrder);
            const ifoodReady = isIfood && !loadingCancelReasons && (ifoodCancelReasons?.length ?? 0) > 0;
            const ifoodEmpty = isIfood && !loadingCancelReasons && (ifoodCancelReasons?.length ?? 0) === 0;
            const confirmDisabled = busy
              || (isIfood && (loadingCancelReasons || !ifoodReady))
              || (isIfood && ifoodReady && !ifoodCancelReasons!.some((r) => r.cancelCodeId === cancelReason));
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Cancelar pedido</DialogTitle>
                  <DialogDescription>
                    {isIfood
                      ? "Motivos obtidos do iFood (GET /cancellationReasons). Selecione um para enviar o cancelamento."
                      : "Selecione o motivo do cancelamento."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  {isIfood && loadingCancelReasons && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Buscando motivos no iFood…
                    </div>
                  )}
                  {isIfood && ifoodEmpty && (
                    <p className="text-sm text-destructive">
                      O iFood não retornou motivos válidos para este pedido. Tente novamente em instantes.
                    </p>
                  )}
                  {isIfood && ifoodReady && (
                    <Select value={cancelReason} onValueChange={setCancelReason}>
                      <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                      <SelectContent>
                        {ifoodCancelReasons!.map((r) => (
                          <SelectItem key={r.cancelCodeId} value={r.cancelCodeId}>
                            {r.cancelCodeId} — {r.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isIfood && (
                    <Select value={cancelReason} onValueChange={setCancelReason}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CANCEL_REASONS.map((r) => (
                          <SelectItem key={r.code} value={r.code}>{r.code} — {r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button>
                  <Button variant="destructive" onClick={cancelOrder} disabled={confirmDisabled}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* ===== Dialog: checklist interno antes de marcar pronto p/ retirada ===== */}
      <Dialog open={!!readyChecklistOrder} onOpenChange={(v) => !v && setReadyChecklistOrder(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferência do pedido</DialogTitle>
            <DialogDescription>
              Confira cada item antes de marcar como pronto. Este checklist é apenas para controle interno.
            </DialogDescription>
          </DialogHeader>
          {readyChecklistOrder && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="font-semibold">
                  Pedido {orderLabel(readyChecklistOrder)}

                </div>
                <div className="text-xs text-muted-foreground">
                  {readyChecklistOrder.customer_name ?? "Sem cliente"} • {fmt(readyChecklistOrder.total)}
                </div>
              </div>

              {/* Itens reais do pedido */}
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Itens da comanda</div>
                {loadingReadyItems ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens…
                  </div>
                ) : !readyItems || readyItems.length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Nenhum item registrado para este pedido.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {readyItems.map((it) => {
                      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
                      const isRefri = REFRI_RE.test(it.name || "");
                      const comps = Array.isArray(it.complements)
                        ? it.complements
                        : (it.complements && typeof it.complements === "object" ? Object.values(it.complements as any) : []);
                      return (
                        <li key={it.id} className="rounded-md border">
                          {/* Uma linha por unidade (sem "Nx") */}
                          {Array.from({ length: qty }).map((_, u) => {
                            const itemKey = `item:${it.id}:${u}`;
                            const itemChecked = !!readyChecks[itemKey];
                            const zeroKey = `zero:${it.id}:${u}`;
                            const zeroChecked = !!readyChecks[zeroKey];
                            return (
                              <div key={itemKey} className={u > 0 ? "border-t" : ""}>
                                <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors">
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 mt-0.5 accent-primary"
                                    checked={itemChecked}
                                    onChange={(e) => setReadyChecks((s) => ({ ...s, [itemKey]: e.target.checked }))}
                                  />
                                  <div className={`text-sm flex-1 min-w-0 font-medium ${itemChecked ? "line-through text-muted-foreground" : ""}`}>
                                    {it.name}
                                  </div>
                                </label>
                                {isRefri && (
                                  <label className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/30 cursor-pointer hover:bg-accent/30 transition-colors pl-10">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-primary"
                                      checked={zeroChecked}
                                      onChange={(e) => setReadyChecks((s) => ({ ...s, [zeroKey]: e.target.checked }))}
                                    />
                                    <span className={`text-xs flex-1 min-w-0 ${zeroChecked ? "line-through text-muted-foreground" : ""}`}>
                                      Zero / Normal
                                    </span>
                                  </label>
                                )}
                              </div>
                            );
                          })}

                          {/* Checkbox de verificação da observação */}
                          {it.notes && (() => {
                            const obsKey = `obs:${it.id}`;
                            const obsChecked = !!readyChecks[obsKey];
                            return (
                              <label className="flex items-start gap-3 px-3 py-1.5 border-t bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:bg-accent/30 transition-colors pl-10">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 mt-0.5 accent-primary"
                                  checked={obsChecked}
                                  onChange={(e) => setReadyChecks((s) => ({ ...s, [obsKey]: e.target.checked }))}
                                />
                                <span className={`text-xs italic flex-1 min-w-0 ${obsChecked ? "line-through text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
                                  Obs.: {it.notes}
                                </span>
                              </label>
                            );
                          })()}

                          {/* Acompanhamentos como checkboxes hierárquicos */}
                          {comps && comps.length > 0 && (
                            <ul className="border-t bg-muted/20">
                              {comps.map((c: any, i: number) => {
                                const compLabel = typeof c === "string"
                                  ? c
                                  : `${c?.quantity ? `${c.quantity}× ` : ""}${c?.name ?? JSON.stringify(c)}`;
                                const compKey = `comp:${it.id}:${i}`;
                                const compChecked = !!readyChecks[compKey];
                                return (
                                  <li key={compKey}>
                                    <label className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-accent/30 transition-colors pl-10">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-primary"
                                        checked={compChecked}
                                        onChange={(e) => setReadyChecks((s) => ({ ...s, [compKey]: e.target.checked }))}
                                      />
                                      <span className={`text-xs flex-1 min-w-0 ${compChecked ? "line-through text-muted-foreground" : ""}`}>
                                        {compLabel}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                )}
              </div>

              {/* Conferência geral (controle interno) */}
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Conferência geral</div>
                <ul className="space-y-1">
                  {READY_CHECKLIST.map((item) => (
                    <li key={item.key}>
                      <label className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-primary"
                          checked={!!readyChecks[item.key]}
                          onChange={(e) => setReadyChecks((s) => ({ ...s, [item.key]: e.target.checked }))}
                        />
                        <span className={`text-sm ${readyChecks[item.key] ? "line-through text-muted-foreground" : ""}`}>
                          {item.label}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Conferido por */}
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">
                  Conferido por <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Digite seu nome"
                  value={checkedByName}
                  onChange={(e) => setCheckedByName(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReadyChecklistOrder(null)}>Cancelar</Button>
            <Button
              disabled={(() => {
                if (busy || !readyChecklistOrder || loadingReadyItems) return true;
                if (checkedByName.trim().length < 2) return true;
                if (READY_CHECKLIST.some((i) => !readyChecks[i.key])) return true;
                for (const it of readyItems ?? []) {
                  const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
                  const isRefri = REFRI_RE.test(it.name || "");
                  for (let u = 0; u < qty; u++) {
                    if (!readyChecks[`item:${it.id}:${u}`]) return true;
                    if (isRefri && !readyChecks[`zero:${it.id}:${u}`]) return true;
                  }
                  if (it.notes && !readyChecks[`obs:${it.id}`]) return true;

                  const comps = Array.isArray(it.complements)
                    ? it.complements
                    : (it.complements && typeof it.complements === "object" ? Object.values(it.complements as any) : []);
                  for (let i = 0; i < comps.length; i++) {
                    if (!readyChecks[`comp:${it.id}:${i}`]) return true;
                  }
                }
                return false;
              })()}

              onClick={async () => {
                const o = readyChecklistOrder;
                if (!o) return;
                console.log("[PDV] Pedido conferido por:", checkedByName.trim(), "order:", o.id);
                setReadyChecklistOrder(null);
                setCheckedByName("");
                await advanceStatus(o, "ready");
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e marcar pronto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// =========================================================================
// Lista de pedidos (mobile-first: cards no mobile, tabela leve no desktop)
// =========================================================================
function OrdersList({
  orders,
  channelName,
  emptyMsg,
  onSelect,
}: {
  orders: Order[];
  channelName: (id: string) => string;
  emptyMsg: string;
  onSelect?: (o: Order) => void;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{emptyMsg}</p>;
  }
  return (
    <ul className="space-y-2">
      {orders.map((o) => {
        const meta = STATUS_LABEL[o.status] ?? STATUS_LABEL.placed;
        const Icon = meta.icon;
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect?.(o)}
              className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent/40 transition-colors active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {orderLabel(o)}

                  </span>
                  <Badge variant="outline" className="text-[10px] py-0">
                    {channelName(o.channel_id)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {o.customer_name ?? "Sem cliente"} • {fmtDateTime(o.opened_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <span className="text-sm font-semibold">{fmt(o.total)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// =========================================================================
// Editor inline dos campos iFood (merchantId, UUID, ambiente) por loja
// =========================================================================
function IfoodStoreEditor({
  store,
  onSaved,
}: {
  store: Store;
  onSaved: () => void;
}) {
  const [merchantId, setMerchantId] = useState(store.ifood_merchant_id ?? "");
  const [merchantUuid, setMerchantUuid] = useState(store.ifood_merchant_uuid ?? "");
  const [env, setEnv] = useState<"sandbox" | "production">(
    store.ifood_environment ?? "production"
  );
  const [saving, setSaving] = useState(false);

  // Reset quando muda de loja
  useEffect(() => {
    setMerchantId(store.ifood_merchant_id ?? "");
    setMerchantUuid(store.ifood_merchant_uuid ?? "");
    setEnv(store.ifood_environment ?? "production");
  }, [store.id, store.ifood_merchant_id, store.ifood_merchant_uuid, store.ifood_environment]);

  const dirty =
    (merchantId || "") !== (store.ifood_merchant_id ?? "") ||
    (merchantUuid || "") !== (store.ifood_merchant_uuid ?? "") ||
    env !== (store.ifood_environment ?? "production");

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("stores")
      .update({
        ifood_merchant_id: merchantId.trim() || null,
        ifood_merchant_uuid: merchantUuid.trim() || null,
        ifood_environment: env,
      })
      .eq("id", store.id);
    setSaving(false);
    if (error) {
      toast({
        title: "Erro ao salvar vínculo iFood",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Vínculo iFood atualizado" });
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ifood-merchant-id" className="text-xs">
            Merchant ID
          </Label>
          <Input
            id="ifood-merchant-id"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="3771231"
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ifood-environment" className="text-xs">
            Ambiente
          </Label>
          <Select value={env} onValueChange={(v) => setEnv(v as "sandbox" | "production")}>
            <SelectTrigger id="ifood-environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (homologação)</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ifood-merchant-uuid" className="text-xs">
          Merchant UUID
        </Label>
        <Input
          id="ifood-merchant-uuid"
          value={merchantUuid}
          onChange={(e) => setMerchantUuid(e.target.value)}
          placeholder="1c7f678a-d9fd-4bd1-90c8-c4220b45d76b"
          className="font-mono text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-muted-foreground">
          {store.ifood_merchant_id ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Vínculo ativo ({env})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              Sem vínculo iFood
            </span>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ===== Editor Fiscal NFC-e ==============================================
function NfceStoreEditor({
  store,
  onSaved,
}: {
  store: Store;
  onSaved: () => void;
}) {
  const [cnpj, setCnpj] = useState(store.cnpj ?? "");
  const [legalName, setLegalName] = useState(store.legal_name ?? "");
  const [ie, setIe] = useState(store.inscricao_estadual ?? "");
  const [im, setIm] = useState(store.inscricao_municipal ?? "");
  const [regime, setRegime] = useState<string>(
    store.regime_tributario != null ? String(store.regime_tributario) : ""
  );
  const [env, setEnv] = useState<"homologacao" | "producao">(
    store.nfce_environment ?? "homologacao"
  );
  const [serie, setSerie] = useState<string>(
    store.nfce_serie != null ? String(store.nfce_serie) : "1"
  );
  const [nextNumber, setNextNumber] = useState<string>(
    store.nfce_next_number != null ? String(store.nfce_next_number) : "1"
  );
  const [cscIdHomolog, setCscIdHomolog] = useState("");
  const [cscTokenHomolog, setCscTokenHomolog] = useState("");
  const [cscIdProd, setCscIdProd] = useState("");
  const [cscTokenProd, setCscTokenProd] = useState("");
  const [hasCreds, setHasCreds] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCnpj(store.cnpj ?? "");
    setLegalName(store.legal_name ?? "");
    setIe(store.inscricao_estadual ?? "");
    setIm(store.inscricao_municipal ?? "");
    setRegime(store.regime_tributario != null ? String(store.regime_tributario) : "");
    setEnv(store.nfce_environment ?? "homologacao");
    setSerie(store.nfce_serie != null ? String(store.nfce_serie) : "1");
    setNextNumber(store.nfce_next_number != null ? String(store.nfce_next_number) : "1");
    // Carrega credenciais NF-e da tabela protegida
    (async () => {
      const { data } = await supabase
        .from("store_fiscal_credentials" as any)
        .select("nfce_csc_id_homolog,nfce_csc_token_homolog,nfce_csc_id_prod,nfce_csc_token_prod")
        .eq("store_id", store.id)
        .maybeSingle();
      const c = (data ?? {}) as any;
      setCscIdHomolog(c.nfce_csc_id_homolog ?? "");
      setCscTokenHomolog(c.nfce_csc_token_homolog ?? "");
      setCscIdProd(c.nfce_csc_id_prod ?? "");
      setCscTokenProd(c.nfce_csc_token_prod ?? "");
      setHasCreds(!!data);
    })();
  }, [store.id]);

  const save = async () => {
    const cnpjDigits = cnpj.replace(/\D/g, "") || null;
    if (cnpjDigits && cnpjDigits.length !== 14) {
      toast({ title: "CNPJ inválido", description: "Informe 14 dígitos.", variant: "destructive" });
      return;
    }
    const serieNum = parseInt(serie, 10);
    const nextNum = parseInt(nextNumber, 10);
    if (isNaN(serieNum) || serieNum < 1) {
      toast({ title: "Série inválida", variant: "destructive" });
      return;
    }
    if (isNaN(nextNum) || nextNum < 1) {
      toast({ title: "Próximo número inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("stores")
      .update({
        cnpj: cnpjDigits,
        legal_name: legalName.trim() || null,
        inscricao_estadual: ie.trim() || null,
        inscricao_municipal: im.trim() || null,
        regime_tributario: regime ? parseInt(regime, 10) : null,
        nfce_environment: env,
        nfce_serie: serieNum,
        nfce_next_number: nextNum,
      })
      .eq("id", store.id);
    if (!error) {
      const { error: credErr } = await supabase
        .from("store_fiscal_credentials" as any)
        .upsert({
          store_id: store.id,
          nfce_csc_id_homolog: cscIdHomolog.trim() || null,
          nfce_csc_token_homolog: cscTokenHomolog.trim() || null,
          nfce_csc_id_prod: cscIdProd.trim() || null,
          nfce_csc_token_prod: cscTokenProd.trim() || null,
        }, { onConflict: "store_id" });
      if (credErr) {
        setSaving(false);
        toast({ title: "Erro ao salvar credenciais", description: credErr.message, variant: "destructive" });
        return;
      }
      setHasCreds(true);
    }
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuração fiscal atualizada" });
    onSaved();
  };

  const ready =
    !!store.cnpj &&
    !!store.legal_name &&
    !!store.inscricao_estadual &&
    store.regime_tributario != null &&
    hasCreds &&
    ((env === "homologacao" && !!cscIdHomolog && !!cscTokenHomolog) ||
      (env === "producao" && !!cscIdProd && !!cscTokenProd));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nfce-cnpj" className="text-xs">CNPJ</Label>
          <Input
            id="nfce-cnpj"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-legal" className="text-xs">Razão social</Label>
          <Input
            id="nfce-legal"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-ie" className="text-xs">Inscrição Estadual</Label>
          <Input
            id="nfce-ie"
            value={ie}
            onChange={(e) => setIe(e.target.value)}
            placeholder="ISENTO ou número"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-im" className="text-xs">Inscrição Municipal</Label>
          <Input id="nfce-im" value={im} onChange={(e) => setIm(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-regime" className="text-xs">Regime tributário</Label>
          <Select value={regime} onValueChange={setRegime}>
            <SelectTrigger id="nfce-regime">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Simples Nacional</SelectItem>
              <SelectItem value="2">2 - Simples Nacional (excesso)</SelectItem>
              <SelectItem value="3">3 - Regime Normal</SelectItem>
              <SelectItem value="4">4 - MEI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-env" className="text-xs">Ambiente NFC-e</Label>
          <Select value={env} onValueChange={(v) => setEnv(v as "homologacao" | "producao")}>
            <SelectTrigger id="nfce-env">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacao">Homologação</SelectItem>
              <SelectItem value="producao">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-serie" className="text-xs">Série</Label>
          <Input
            id="nfce-serie"
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nfce-next" className="text-xs">Próximo número</Label>
          <Input
            id="nfce-next"
            value={nextNumber}
            onChange={(e) => setNextNumber(e.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="border-t pt-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          CSC (Código de Segurança do Contribuinte)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="csc-id-h" className="text-xs">CSC ID — Homologação</Label>
            <Input id="csc-id-h" value={cscIdHomolog} onChange={(e) => setCscIdHomolog(e.target.value)} placeholder="000001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csc-tk-h" className="text-xs">CSC Token — Homologação</Label>
            <Input id="csc-tk-h" value={cscTokenHomolog} onChange={(e) => setCscTokenHomolog(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csc-id-p" className="text-xs">CSC ID — Produção</Label>
            <Input id="csc-id-p" value={cscIdProd} onChange={(e) => setCscIdProd(e.target.value)} placeholder="000001" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csc-tk-p" className="text-xs">CSC Token — Produção</Label>
            <Input id="csc-tk-p" value={cscTokenProd} onChange={(e) => setCscTokenProd(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-muted-foreground">
          {ready ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Pronto para emitir ({store.nfce_environment})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              Configuração incompleta
            </span>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
