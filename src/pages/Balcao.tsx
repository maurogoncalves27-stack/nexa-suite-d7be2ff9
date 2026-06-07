// Modo Balcão — painel touch fullscreen para a loja física.
// SEM cardápio. SEM carrinho. SEM checkout.
// Pedidos do iFood/canais já entram aceitos e em PREPARANDO (auto-accept + impressão automática).
// Painel só monitora: Preparando → Pronto → (Aguardando retirada | Em entrega) → concluído.
// Cancelamento fica escondido em menu "⋮" (raro, evita toque acidental).
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Maximize2, Bike, ChefHat, Hand,
  Clock, Package, RefreshCw, Loader2, X, MapPin, Phone, Settings, MoreVertical, Printer, CheckCircle2, Receipt,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

// Itens do check-list de conferência antes de marcar pedido como pronto.
// Editáveis depois — por enquanto placeholders (6 itens).
const READY_CHECKLIST = [
  "Item 1",
  "Item 2",
  "Item 3",
  "Item 4",
  "Item 5",
  "Item 6",
];
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { sortStores } from "@/lib/storeSort";
import { printOrderReceipt } from "@/lib/printOrder";
import { routePrintOrder } from "@/lib/routePrint";
import { PrintersPanel } from "@/components/pdv-novo/PrintersPanel";
import { PrintLayoutPanel } from "@/components/pdv-novo/PrintLayoutPanel";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

interface Store { id: string; name: string; is_virtual: boolean; pdv_sla_minutes?: number | null }
interface Channel { id: string; name: string; code: string }
interface Order {
  id: string; order_number: string | null; status: string; total: number;
  opened_at: string; channel_id: string;
  customer_name: string | null; customer_phone: string | null;
  order_type: string | null; delivery_address: any;
  notes: string | null;
}
interface OrderItem {
  id: string; order_id: string; name: string; quantity: number;
  unit_price: number; total: number; notes: string | null;
}

// "Aguardando retirada" é uma view virtual: status=ready + order_type ∈ (pickup, counter).
// Status reais: preparing → ready → (dispatched | concluded).
const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  preparing:  { label: "Preparando",         color: "bg-amber-500",   icon: ChefHat },
  ready:      { label: "Aguardando entregador", color: "bg-emerald-500", icon: Package },
  pickup:     { label: "Aguardando retirada", color: "bg-cyan-600",   icon: Hand },
  dispatched: { label: "Em entrega",         color: "bg-purple-500",  icon: Bike },
};

// Próxima ação visível para a equipe.
// Pedidos chegam já em "preparing" (auto-accept + impressão automática); não há botão "Iniciar preparo".
// Caso algum pedido legado venha em placed/confirmed, tratamos como já em preparo (próximo passo: Marcar pronto).
function nextStatus(o: Order): { value: string; label: string } | null {
  switch (o.status) {
    case "placed":
    case "confirmed":
    case "preparing": return { value: "ready", label: "Preparo concluído" };
    case "ready":
      // Delivery (iFood): nada manual — webhook do iFood (DSP/CON) move o pedido sozinho.
      // Retirada/balcão: cliente vem buscar, equipe confirma.
      return o.order_type === "delivery"
        ? null
        : { value: "concluded", label: "Cliente retirou" };
    // Em entrega: webhook do iFood (CON) finaliza automaticamente. Sem ação manual.
    case "dispatched": return null;
    default: return null;
  }
}

const STATUS_TIME_FIELD: Record<string, string> = {
  confirmed: "confirmed_at",
  preparing: "preparation_started_at",
  ready: "ready_at",
  dispatched: "dispatched_at",
  concluded: "concluded_at",
  cancelled: "cancelled_at",
};

export default function Balcao() {
  useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>(() => localStorage.getItem("balcao:storeId") ?? "");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);


  const [selected, setSelected] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slaInput, setSlaInput] = useState("25");
  const [readyCheckOrder, setReadyCheckOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<boolean[]>(() => READY_CHECKLIST.map(() => false));

  const prevPlacedCount = useRef(0);
  const seenOrderIds = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);
  const storesRef = useRef<Store[]>([]);

  // 🌐 Detecção de queda de internet / API
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [apiReachable, setApiReachable] = useState(true);
  const offlineAlertRef = useRef(0);

  useEffect(() => {
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
    };
  }, []);

  // Heartbeat: ping leve ao Supabase a cada 20s. Se falhar 2x seguidas, marca apiReachable=false.
  useEffect(() => {
    let fails = 0;
    let cancelled = false;
    const ping = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const { error } = await supabase.from("stores").select("id", { count: "exact", head: true }).limit(1).abortSignal(ctrl.signal);
        clearTimeout(t);
        if (cancelled) return;
        if (error) { fails++; } else { fails = 0; setApiReachable(true); }
      } catch { if (!cancelled) fails++; }
      if (!cancelled && fails >= 2) setApiReachable(false);
    };
    void ping();
    const i = setInterval(ping, 20000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const isOffline = !online || !apiReachable;

  // Bipe grave contínuo enquanto offline (a cada 8s)
  useEffect(() => {
    if (!isOffline) return;
    const beep = () => {
      if (Date.now() - offlineAlertRef.current < 7000) return;
      offlineAlertRef.current = Date.now();
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = "square";
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 220; g.gain.value = 0.18;
        osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 600);
      } catch {}
    };
    beep();
    const t = setInterval(beep, 8000);
    return () => clearInterval(t);
  }, [isOffline]);


  // Carrega lojas
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("stores")
        .select("id,name,is_virtual,pdv_sla_minutes")
        .eq("is_active", true).eq("is_virtual", false).order("name");
      const list = sortStores((data ?? []) as Store[]);
      setStores(list);
      storesRef.current = list;
      if (!storeId && list.length) setStoreId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (storeId) localStorage.setItem("balcao:storeId", storeId);
  }, [storeId]);

  const load = useCallback(async (sid: string) => {
    if (!sid) return;
    const [chs, ords] = await Promise.all([
      supabase.from("pdv_channels").select("id,name,code").eq("store_id", sid).eq("is_active", true).order("sort_order"),
      supabase.from("pdv_orders")
        .select("id,order_number,status,total,opened_at,channel_id,customer_name,customer_phone,order_type,delivery_address,notes")
        .eq("store_id", sid)
        .in("status", ["placed", "confirmed", "preparing", "ready", "dispatched"])
        .order("opened_at", { ascending: true })
        .limit(100),
    ]);
    setChannels((chs.data ?? []) as Channel[]);
    const list = (ords.data ?? []) as Order[];
    setOrders(list);

    // Itens de cada pedido (carregados ANTES da impressão p/ ter linhas)
    let grouped: Record<string, OrderItem[]> = {};
    if (list.length) {
      const { data: its } = await supabase.from("pdv_order_items")
        .select("id,order_id,name,quantity,unit_price,total,notes")
        .in("order_id", list.map((o) => o.id));
      (its ?? []).forEach((it: any) => {
        (grouped[it.order_id] ||= []).push(it as OrderItem);
      });
      setItems(grouped);
    } else {
      setItems({});
    }

    // 🔔 Detecta pedidos NOVOS (não vistos antes) e dispara sino + impressão automática.
    // No primeiro carregamento, apenas registra os ids existentes (sem alarme).
    const channelsList = (chs.data ?? []) as Channel[];
    if (firstLoadDone.current) {
      const novos = list.filter((o) => !seenOrderIds.current.has(o.id));
      if (novos.length > 0) {
        // Toca sino (bell) — sequência de 3 toques curtos agudos.
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          [0, 180, 360].forEach((delay) => setTimeout(() => {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = "sine";
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.value = 1480; g.gain.value = 0.18;
            osc.start(); setTimeout(() => osc.stop(), 140);
          }, delay));
          setTimeout(() => ctx.close(), 1200);
        } catch {}
        // Imprime cupom de cada pedido novo.
        novos.forEach((o) => {
          const chName = channelsList.find((c) => c.id === o.channel_id)?.name ?? "";
          const sName = storesRef.current.find((s) => s.id === sid)?.name ?? "";
          void routePrintOrder({
            storeId: sid,
            storeName: sName,
            order: {
              id: o.id,
              order_number: o.order_number,
              channel_name: chName,
              order_type: o.order_type,
              customer_name: o.customer_name,
              customer_phone: o.customer_phone,
              delivery_address: o.delivery_address,
              notes: o.notes,
              total: o.total,
              opened_at: o.opened_at,
              items: grouped[o.id] ?? [],
            },
          });
        });
      }
    }
    list.forEach((o) => seenOrderIds.current.add(o.id));
    firstLoadDone.current = true;

    setLoading(false);
  }, []);

  useEffect(() => {
    if (storeId) { setLoading(true); void load(storeId); }
  }, [storeId, load]);

  // Polling a cada 15s
  useEffect(() => {
    if (!storeId) return;
    const t = setInterval(() => { void load(storeId); }, 15000);
    return () => clearInterval(t);
  }, [storeId, load]);

  // ⏰ Alerta de demora: pedidos "preparing" há mais de SLA_MIN minutos (configurável por loja).
  // Toca bipe agudo a cada 60s enquanto houver pedidos atrasados.
  const currentStore = useMemo(() => stores.find((s) => s.id === storeId), [stores, storeId]);
  const SLA_MIN = currentStore?.pdv_sla_minutes ?? 25;
  useEffect(() => { setSlaInput(String(SLA_MIN)); }, [SLA_MIN]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const lateOrders = useMemo(
    () => orders.filter((o) =>
      o.status === "preparing" &&
      (now - new Date(o.opened_at).getTime()) / 60000 > SLA_MIN
    ),
    [orders, now],
  );
  const lateAlertRef = useRef(0);
  useEffect(() => {
    if (lateOrders.length === 0) return;
    const tick = () => {
      if (Date.now() - lateAlertRef.current < 60000) return;
      lateAlertRef.current = Date.now();
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        // Dois bipes curtos, freq alta
        [0, 300].forEach((delay) => setTimeout(() => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 1200; g.gain.value = 0.2;
          o.start(); setTimeout(() => o.stop(), 180);
        }, delay));
        setTimeout(() => ctx.close(), 800);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [lateOrders.length]);


  // Realtime — atualiza ao receber novo pedido / mudança
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase.channel(`balcao-${storeId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pdv_orders",
        filter: `store_id=eq.${storeId}`,
      }, () => { void load(storeId); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [storeId, load]);

  const channelName = useCallback(
    (cid: string) => channels.find((c) => c.id === cid)?.name ?? "—",
    [channels],
  );

  // 4 colunas. "ready" se divide entre delivery (Pronto, sai p/ entrega) e retirada/balcão (Aguardando retirada).
  // Pedidos legados em "placed"/"confirmed" caem em "preparing" para não sumirem.
  const grouped = useMemo(() => ({
    preparing: orders.filter((o) => ["placed", "confirmed", "preparing"].includes(o.status)),
    ready:     orders.filter((o) => o.status === "ready" && o.order_type === "delivery"),
    pickup:    orders.filter((o) => o.status === "ready" && o.order_type !== "delivery"),
    dispatched: orders.filter((o) => o.status === "dispatched"),
  }), [orders]);

  const advance = async (o: Order) => {
    const next = nextStatus(o);
    if (!next) return;
    // Intercepta passagem para "ready" — exige conferência via checklist.
    if (next.value === "ready") {
      setReadyCheckOrder(o);
      setCheckedItems(READY_CHECKLIST.map(() => false));
      return;
    }
    setBusy(true);
    const patch: any = { status: next.value };
    const tf = STATUS_TIME_FIELD[next.value];
    if (tf) patch[tf] = new Date().toISOString();
    const { error } = await supabase.from("pdv_orders").update(patch as never).eq("id", o.id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: next.label });
    if (selected?.id === o.id && next.value === "concluded") setSelected(null);
    void load(storeId);
  };

  const confirmReady = async () => {
    if (!readyCheckOrder) return;
    setBusy(true);
    const { error } = await supabase.from("pdv_orders").update({
      status: "ready",
      ready_at: new Date().toISOString(),
    } as never).eq("id", readyCheckOrder.id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pedido pronto" });
    setReadyCheckOrder(null);
    setCheckedItems(READY_CHECKLIST.map(() => false));
    void load(storeId);
  };

  const cancel = async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from("pdv_orders").update({
      status: "cancelled", cancelled_at: new Date().toISOString(),
      cancellation_reason_text: cancelReason || "Cancelado no balcão",
    }).eq("id", selected.id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pedido cancelado" });
    setCancelDialog(false); setSelected(null); setCancelReason("");
    void load(storeId);
  };

  const reprint = (o: Order, target: "customer" | "kitchen" | "both" = "both") => {
    void routePrintOrder({
      storeId,
      storeName: currentStore?.name ?? "",
      manual: true,
      target,
      order: {
        id: o.id,
        order_number: o.order_number,
        channel_name: channelName(o.channel_id),
        order_type: o.order_type,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        delivery_address: o.delivery_address,
        notes: o.notes,
        total: o.total,
        opened_at: o.opened_at,
        items: items[o.id] ?? [],
      },
    });
    const label = target === "customer" ? "cupom do cliente"
      : target === "kitchen" ? "comanda da cozinha"
      : "cupom e comanda";
    toast({ title: `Reimprimindo ${label}` });
  };

  const goFullscreen = () => {
    const el = document.documentElement as any;
    if (el.requestFullscreen) el.requestFullscreen();
  };

  const saveSla = async () => {
    const n = parseInt(slaInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 240) {
      toast({ title: "Valor inválido", description: "Informe um número entre 1 e 240 minutos.", variant: "destructive" });
      return;
    }
    if (!storeId) return;
    setBusy(true);
    const { error } = await supabase.from("stores").update({ pdv_sla_minutes: n } as never).eq("id", storeId);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setStores((prev) => prev.map((s) => s.id === storeId ? { ...s, pdv_sla_minutes: n } : s));
    setSettingsOpen(false);
    toast({ title: "SLA atualizado", description: `Alerta após ${n} min em preparo.` });
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-14 sm:h-16 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv-novo")} title="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-lg sm:text-xl">Balcão</span>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-9 sm:h-10 w-[150px] sm:w-[200px] font-medium">
              <SelectValue placeholder="Loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {grouped.preparing.length > 0 && (
          <Badge className="bg-amber-500 text-white text-base px-3 py-1 hidden sm:inline-flex">
            <ChefHat className="h-4 w-4 mr-1" /> {grouped.preparing.length} em preparo
          </Badge>
        )}
        {lateOrders.length > 0 && (
          <Badge className="bg-red-600 text-white text-base px-3 py-1 inline-flex animate-pulse">
            <Clock className="h-4 w-4 mr-1" /> {lateOrders.length} atrasado{lateOrders.length > 1 ? "s" : ""}
          </Badge>
        )}


        <Button variant="ghost" size="icon" onClick={() => void load(storeId)} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Configurações">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={goFullscreen} title="Tela cheia" className="hidden sm:inline-flex">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </header>

      {isOffline && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 font-bold text-sm sm:text-base animate-pulse shrink-0">
          <X className="h-5 w-5" />
          {!online
            ? "SEM INTERNET — verifique o roteador/Wi-Fi da loja"
            : "SERVIDOR INACESSÍVEL — pedidos podem não estar chegando"}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
          <Package className="h-16 w-16 text-muted-foreground/40" />
          <p className="text-xl font-semibold text-muted-foreground">Nenhum pedido em andamento</p>
          <p className="text-sm text-muted-foreground">Pedidos novos aparecem aqui automaticamente.</p>
        </div>
      ) : (
        // Mobile: lista única; lg+: kanban por colunas
        <div className="flex-1 overflow-hidden">
          {/* Mobile (lista) */}
          <div className="lg:hidden h-full overflow-y-auto p-3 space-y-2">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} channelName={channelName(o.channel_id)}
                isLate={lateOrders.some((l) => l.id === o.id)}
                onClick={() => setSelected(o)} onAdvance={() => advance(o)}
                onCancel={() => { setSelected(o); setCancelDialog(true); }}
                onReprint={() => reprint(o)} compact />
            ))}
          </div>

          {/* Desktop (kanban — 4 colunas) */}
          <div className="hidden lg:grid h-full grid-cols-4 gap-2 p-2">
            {(["preparing", "ready", "pickup", "dispatched"] as const).map((st) => {
              const meta = STATUS_META[st]; const Icon = meta.icon;
              const list = grouped[st];
              return (
                <div key={st} className="flex flex-col min-h-0 bg-muted/30 rounded-lg overflow-hidden">
                  <div className={`${meta.color} text-white px-3 py-2 flex items-center justify-between shrink-0`}>
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon className="h-4 w-4" /> {meta.label}
                    </div>
                    <Badge variant="secondary" className="bg-white/25 text-white border-0">{list.length}</Badge>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">vazio</p>
                    ) : list.map((o) => (
                      <OrderCard key={o.id} order={o} channelName={channelName(o.channel_id)}
                        isLate={lateOrders.some((l) => l.id === o.id)}
                        onClick={() => setSelected(o)} onAdvance={() => advance(o)}
                        onCancel={() => { setSelected(o); setCancelDialog(true); }}
                        onReprint={() => reprint(o)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detalhes do pedido */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const meta = STATUS_META[selected.status] ?? { label: selected.status, color: "bg-muted", icon: Clock };
            const Icon = meta.icon;
            const next = nextStatus(selected);
            const list = items[selected.id] ?? [];
            const addr = selected.delivery_address;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-2">
                    <span>Pedido #{selected.order_number ?? selected.id.slice(0, 6)}</span>
                    <Badge className={`${meta.color} text-white gap-1`}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{channelName(selected.channel_id)}</Badge>
                    <Badge variant="outline">
                      {selected.order_type === "delivery" ? "Delivery" :
                       selected.order_type === "pickup"   ? "Retirada" :
                       selected.order_type === "counter"  ? "Balcão" : (selected.order_type ?? "—")}
                    </Badge>
                    <Badge variant="outline">
                      {new Date(selected.opened_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </Badge>
                  </div>

                  {(selected.customer_name || selected.customer_phone) && (
                    <div className="rounded-md border p-2 space-y-1">
                      {selected.customer_name && <p className="font-semibold">{selected.customer_name}</p>}
                      {selected.customer_phone && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {selected.customer_phone}
                        </p>
                      )}
                    </div>
                  )}

                  {addr && typeof addr === "object" && (addr.street || addr.address) && (
                    <div className="rounded-md border p-2 text-xs flex gap-2">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{[addr.street ?? addr.address, addr.number, addr.complement, addr.neighborhood, addr.city].filter(Boolean).join(", ")}</span>
                    </div>
                  )}

                  <div>
                    <p className="font-semibold mb-1">Itens</p>
                    <div className="space-y-1">
                      {list.map((it) => (
                        <div key={it.id} className="flex justify-between gap-2 py-1 border-b last:border-0">
                          <span><strong>{it.quantity}×</strong> {it.name}{it.notes && <span className="text-muted-foreground italic"> — {it.notes}</span>}</span>
                          <span className="tabular-nums">{fmt(it.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selected.notes && (
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs">
                      <strong>Obs:</strong> {selected.notes}
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold pt-2 border-t">
                    <span>Total</span><span>{fmt(selected.total)}</span>
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => reprint(selected, "kitchen")} disabled={busy}>
                    <ChefHat className="h-4 w-4 mr-1" /> Comanda
                  </Button>
                  <Button variant="outline" onClick={() => reprint(selected, "customer")} disabled={busy}>
                    <Receipt className="h-4 w-4 mr-1" /> Cupom
                  </Button>
                  {next && (
                    <Button onClick={() => advance(selected)} disabled={busy} className="h-12 text-base font-semibold">
                      {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {next.label}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Conferência antes de marcar pronto */}
      <Dialog open={!!readyCheckOrder} onOpenChange={(v) => { if (!v) { setReadyCheckOrder(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Conferência do pedido
              {readyCheckOrder && (
                <span className="text-muted-foreground font-normal text-sm ml-1">
                  #{readyCheckOrder.order_number ?? readyCheckOrder.id.slice(0, 6)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Confirme cada item antes de liberar o pedido como pronto.
            </p>
            <div className="space-y-2">
              {READY_CHECKLIST.map((label, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/40 active:scale-[0.99] transition"
                >
                  <Checkbox
                    checked={checkedItems[i] ?? false}
                    onCheckedChange={(v) => {
                      setCheckedItems((prev) => {
                        const next = [...prev];
                        next[i] = v === true;
                        return next;
                      });
                    }}
                    className="h-5 w-5"
                  />
                  <span className={`text-sm flex-1 ${checkedItems[i] ? "line-through text-muted-foreground" : ""}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setReadyCheckOrder(null)} disabled={busy}>
              Voltar
            </Button>
            <Button
              onClick={confirmReady}
              disabled={busy || checkedItems.some((c) => !c)}
              className="h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pedido pronto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancelar pedido</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo</label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: cliente desistiu, item em falta…" className="h-11" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)} disabled={busy}>Voltar</Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configurações da loja */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do Balcão</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tempo para alerta de atraso (minutos)</label>
              <div className="flex gap-2">
                <Input
                  type="number" min={1} max={240} value={slaInput}
                  onChange={(e) => setSlaInput(e.target.value)} className="h-10 flex-1"
                />
                <Button onClick={saveSla} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pedidos em "Preparando" há mais que esse tempo disparam alerta visual e sonoro.
                Configuração específica da loja <strong>{currentStore?.name ?? ""}</strong>.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Printer className="h-4 w-4" /> Impressoras desta loja
              </h3>
              {storeId && currentStore && (
                <PrintersPanel storeId={storeId} storeName={currentStore.name} />
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Printer className="h-4 w-4" /> Layout de impressão
              </h3>
              {storeId && <PrintLayoutPanel storeId={storeId} />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const r = min % 60;
  return `${h}h${r ? ` ${r}m` : ""}`;
}

function OrderCard({
  order, channelName, onClick, onAdvance, onCancel, onReprint, compact = false, isLate = false,
}: {
  order: Order; channelName: string;
  onClick: () => void; onAdvance: () => void;
  onCancel: () => void; onReprint: (target?: "customer" | "kitchen" | "both") => void;
  compact?: boolean; isLate?: boolean;
}) {
  // Status visual: pedidos "ready" de retirada usam o mock "pickup" (visual cyan).
  const visualStatus = order.status === "ready" && order.order_type !== "delivery" ? "pickup" : order.status;
  const meta = STATUS_META[visualStatus] ?? { label: order.status, color: "bg-muted", icon: Clock };
  const Icon = meta.icon;
  const next = nextStatus(order);
  const since = elapsed(order.opened_at);
  const typeLabel = order.order_type === "delivery" ? "Delivery" :
                    order.order_type === "pickup"   ? "Retirada" :
                    order.order_type === "counter"  ? "Balcão"   : "—";

  return (
    <div
      className={`rounded-lg bg-card border-2 overflow-hidden transition active:scale-[0.99] ${
        isLate ? "border-red-600 shadow-lg shadow-red-600/30 animate-pulse" : "border-border"
      }`}
    >
      <div className="flex items-stretch">
        <button onClick={onClick} className="flex-1 text-left p-3 hover:bg-accent/40 transition min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-bold text-base leading-tight truncate">
              #{order.order_number ?? order.id.slice(0, 6)}
            </p>
            {compact && (
              <Badge className={`${meta.color} text-white gap-1 shrink-0 text-xs`}>
                <Icon className="h-3 w-3" />{meta.label}
              </Badge>
            )}
          </div>
          {order.customer_name && (
            <p className="text-sm font-medium truncate">{order.customer_name}</p>
          )}
          <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
            <span className="truncate">{channelName} · {typeLabel}</span>
            <span className={`shrink-0 ${isLate ? "text-red-600 font-bold" : ""}`}>{since}{isLate ? " ⚠️" : ""}</span>
          </div>
          <p className="text-sm font-bold text-primary mt-1">{fmt(order.total)}</p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="px-2 border-l border-border text-muted-foreground hover:bg-accent/40 transition"
              title="Mais opções"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onReprint}>
              <Printer className="h-4 w-4 mr-2" /> Reimprimir cupom
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCancel} className="text-destructive focus:text-destructive">
              <X className="h-4 w-4 mr-2" /> Cancelar pedido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {next && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvance(); }}
          className="w-full h-12 bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition"
        >
          {next.label} →
        </button>
      )}
    </div>
  );
}
