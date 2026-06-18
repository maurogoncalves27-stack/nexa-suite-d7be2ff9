import { useEffect, useMemo, useState } from "react";
import { Flame, Plus, Package, Loader2, Pencil, Send, BarChart3, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStoreGeofence } from "@/hooks/useStoreGeofence";
import { MapPin } from "lucide-react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Settings = { id: string; unit_price: number };
type Purchase = {
  id: string;
  purchased_at: string;
  total_amount: number;
  unit_price: number;
  quantity: number;
  remaining: number;
  notes: string | null;
  bank_transaction_id: string | null;
};
type StoreRow = { id: string; name: string; code: string | null };
type StoreState = {
  store_id: string;
  has_reserve: boolean;
  in_use_qty: number;
  reserve_qty: number;
  empty_qty: number;
  total_qty: number;
  vouchers_balance: number;
  reserve_activated_at: string | null;
  last_received_at: string | null;
};
type Request = {
  id: string;
  store_id: string;
  status: "requested" | "in_transit" | "received" | "cancelled";
  requested_at: string;
  received_at: string | null;
  notes: string | null;
};
type BankTx = {
  id: string;
  posted_at: string;
  amount: number;
  payee: string | null;
  memo: string | null;
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinanceGasVouchers() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [states, setStates] = useState<Record<string, StoreState>>({});
  const [requests, setRequests] = useState<Request[]>([]);

  // dialogs
  const [addQty, setAddQty] = useState("");
  const [addingStock, setAddingStock] = useState(false);
  const [priceDraft, setPriceDraft] = useState<string>("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [editQtyStoreId, setEditQtyStoreId] = useState<string | null>(null);
  const [consumingStoreId, setConsumingStoreId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmingShipmentId, setConfirmingShipmentId] = useState<string | null>(null);

  const consume = async (storeId: string, kind: "reserve" | "in_use") => {
    setConsumingStoreId(storeId);
    try {
      const { error } = await supabase.rpc("gas_consume" as any, { _store_id: storeId, _kind: kind });
      if (error) throw error;
      await load();
      toast({
        title: kind === "reserve" ? "Reserva entrou em uso" : "Bujão substituído",
        description: "1 vale gás abatido do estoque.",
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setConsumingStoreId(null);
    }
  };

  const addCentralStock = async () => {
    const q = parseInt(addQty, 10);
    if (!q || q <= 0) {
      toast({ title: "Informe uma quantidade válida", variant: "destructive" });
      return;
    }
    const u = settings?.unit_price ?? 0;
    setAddingStock(true);
    try {
      const { error } = await supabase.rpc("gas_register_purchase" as any, {
        _total_amount: q * u,
        _unit_price: u,
        _purchased_at: format(new Date(), "yyyy-MM-dd"),
        _bank_transaction_id: null,
        _quantity: q,
        _notes: null,
      });
      if (error) throw error;
      setAddQty("");
      await load();
      toast({ title: "Estoque atualizado", description: `+${q} vale(s) adicionados.` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setAddingStock(false);
    }
  };

  const totalAvailable = useMemo(
    () => purchases.reduce((s, p) => s + (p.remaining || 0), 0),
    [purchases],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, pRes, stRes, stateRes, reqRes] = await Promise.all([
        supabase.from("gas_voucher_settings").select("id, unit_price").limit(1).maybeSingle(),
        supabase
          .from("gas_voucher_purchases")
          .select("id, purchased_at, total_amount, unit_price, quantity, remaining, notes, bank_transaction_id")
          .order("purchased_at", { ascending: false })
          .limit(50),
        supabase
          .from("stores")
          .select("id, name, code")
          .eq("is_active", true)
          .eq("is_virtual", false)
          .not("name", "ilike", "%escrit%")
          .order("name"),
        supabase
          .from("gas_voucher_store_state")
          .select("store_id, has_reserve, in_use_qty, reserve_qty, empty_qty, total_qty, vouchers_balance, reserve_activated_at, last_received_at"),
        supabase
          .from("gas_voucher_requests")
          .select("id, store_id, status, requested_at, received_at, notes")
          .order("requested_at", { ascending: false })
          .limit(80),
      ]);

      if (sRes.data) {
        setSettings(sRes.data as Settings);
        setPriceDraft(String((sRes.data as Settings).unit_price ?? ""));
      }
      setPurchases((pRes.data ?? []) as Purchase[]);
      setStores((stRes.data ?? []) as StoreRow[]);
      const map: Record<string, StoreState> = {};
      (stateRes.data ?? []).forEach((r: any) => (map[r.store_id] = r));
      setStates(map);
      setRequests((reqRes.data ?? []) as Request[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const savePrice = async () => {
    const v = Number(String(priceDraft).replace(",", "."));
    if (!v || v <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    if (v === settings?.unit_price) return;
    setSavingPrice(true);
    try {
      if (settings?.id) {
        const { error } = await supabase
          .from("gas_voucher_settings")
          .update({ unit_price: v })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gas_voucher_settings").insert({ unit_price: v });
        if (error) throw error;
      }
      setSettings((s) => (s ? { ...s, unit_price: v } : { id: "", unit_price: v }));
      toast({ title: "Preço atualizado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingPrice(false);
    }
  };

  const openRequests = requests.filter((r) => r.status === "requested");
  const inTransitByStore = useMemo(() => {
    const map: Record<string, Request> = {};
    requests.filter((r) => r.status === "in_transit").forEach((r) => {
      // mantém o mais recente por loja
      if (!map[r.store_id] || new Date(r.requested_at) > new Date(map[r.store_id].requested_at)) {
        map[r.store_id] = r;
      }
    });
    return map;
  }, [requests]);

  const confirmShipment = async (requestId: string) => {
    setConfirmingShipmentId(requestId);
    try {
      const { error } = await supabase.rpc("gas_confirm_shipment" as any, { _request_id: requestId, _notes: null });
      if (error) throw error;
      await load();
      toast({ title: "Envio confirmado", description: "Vales creditados no saldo da loja." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setConfirmingShipmentId(null);
    }
  };

  // Geolocalização: colaborador comum só vê/age na loja em que está fisicamente.
  // Staff (admin/manager/super) vê todas as lojas.
  const physicalStoreIds = useMemo(
    () => stores.filter((s) => {
      const st = states[s.id];
      const total = st?.total_qty ?? ((st?.in_use_qty ?? 1) + (st?.reserve_qty ?? 1));
      return total > 0; // ignora "estoque central"
    }).map((s) => s.id),
    [stores, states],
  );
  const geofence = useStoreGeofence(isStaff ? [] : physicalStoreIds);
  const [nearbyStoreIds, setNearbyStoreIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isStaff) return;
    if (geofence.loading) return;
    // Recalcula quais lojas estão dentro do raio individualmente
    (async () => {
      const pos = await (await import("@/lib/timeClock")).getCurrentPosition();
      if (!pos?.coords || physicalStoreIds.length === 0) {
        setNearbyStoreIds(new Set());
        return;
      }
      const { data } = await supabase
        .from("stores")
        .select("id, latitude, longitude, geofence_radius_m")
        .in("id", physicalStoreIds);
      const { haversineDistanceMeters } = await import("@/lib/timeClock");
      const inside = new Set<string>();
      for (const s of data ?? []) {
        if (s.latitude == null || s.longitude == null) continue;
        const d = haversineDistanceMeters(
          pos.coords.latitude, pos.coords.longitude,
          Number(s.latitude), Number(s.longitude),
        );
        const radius = s.geofence_radius_m ?? 200;
        if (d <= radius) inside.add(s.id);
      }
      setNearbyStoreIds(inside);
    })();
  }, [isStaff, geofence.loading, geofence.inside, physicalStoreIds.join(",")]);

  const visibleStores = useMemo(() => {
    if (isStaff) return stores;
    // super-user / bypass: mostra tudo
    if (geofence.inside && nearbyStoreIds.size === 0 && geofence.distanceM === 0) return stores;
    return stores.filter((s) => {
      const st = states[s.id];
      const total = st?.total_qty ?? ((st?.in_use_qty ?? 1) + (st?.reserve_qty ?? 1));
      // mantém estoque central oculto para colaborador
      if (total === 0) return false;
      return nearbyStoreIds.has(s.id);
    });
  }, [isStaff, stores, states, nearbyStoreIds, geofence.inside, geofence.distanceM]);

  // Ranking de uso por loja (últimos 90 dias) — mesma base do Comparativo
  const ranking = useMemo(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const r of requests) {
      if (r.status === "received" && r.received_at && new Date(r.received_at).getTime() >= cutoff) {
        counts.set(r.store_id, (counts.get(r.store_id) ?? 0) + 1);
      }
    }
    const rows = stores.map((s) => ({ id: s.id, qty: counts.get(s.id) ?? 0 }));
    rows.sort((a, b) => b.qty - a.qty);
    const total = rows.reduce((s, r) => s + r.qty, 0);
    const avg = rows.length ? total / rows.length : 0;
    const map = new Map<string, { position: number; qty: number; vsAvg: number }>();
    rows.forEach((r, idx) =>
      map.set(r.id, {
        position: idx + 1,
        qty: r.qty,
        vsAvg: avg > 0 ? ((r.qty - avg) / avg) * 100 : 0,
      }),
    );
    const max = Math.max(1, ...rows.map((r) => r.qty));
    return { map, totalStores: rows.length, avg, total, max };
  }, [stores, requests]);

  // Resumo de urgência (só lojas físicas) — antes do early return p/ não violar regras dos hooks
  const urgencySummary = useMemo(() => {
    let emptyCount = 0;
    let noReserveCount = 0;
    for (const s of stores) {
      const st = states[s.id];
      const total = st?.total_qty ?? ((st?.in_use_qty ?? 1) + (st?.reserve_qty ?? 1));
      if (total === 0) continue;
      if ((st?.empty_qty ?? 0) > 0) emptyCount++;
      else if ((st?.reserve_qty ?? 1) === 0) noReserveCount++;
    }
    return { emptyCount, noReserveCount };
  }, [stores, states]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold md:text-2xl flex items-center gap-2">Controle de Gás</h1>
        <p className="text-xs text-muted-foreground">
          Toque em <span className="font-medium">"Usei reserva"</span> ao trocar o bujão e em <span className="font-medium">"Usei vale"</span> ao receber um novo.
        </p>
        {(urgencySummary.emptyCount > 0 || urgencySummary.noReserveCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {urgencySummary.emptyCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {urgencySummary.emptyCount} loja{urgencySummary.emptyCount > 1 ? "s" : ""} com vazio
              </Badge>
            )}
            {urgencySummary.noReserveCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {urgencySummary.noReserveCount} sem reserva
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              <Flame className="mr-1 h-3 w-3" />
              {totalAvailable} vale{totalAvailable === 1 ? "" : "s"} disponíve{totalAvailable === 1 ? "l" : "is"}
            </Badge>
          </div>
        )}
      </div>

      {/* Barra superior: vales disponíveis + preço editável + botão dashboard */}
      <div className="flex flex-wrap items-stretch gap-2">
        <Card className="flex-1 min-w-[120px]">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vales disp.</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold leading-tight">{totalAvailable}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Preço atual</div>
            {isStaff ? (
              <Input
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                onBlur={savePrice}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                inputMode="decimal"
                disabled={savingPrice}
                className="mt-0.5 h-7 px-1.5 text-base font-bold"
                placeholder="0,00"
              />
            ) : (
              <div className="mt-0.5 text-lg font-bold leading-tight">
                {fmtBRL(settings?.unit_price ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>
        {isStaff && (
          <Button asChild variant="outline" size="sm" className="h-auto gap-1.5 self-stretch">
            <Link to="/financeiro/vale-gas/dashboard">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
        )}
      </div>



      {/* LOJAS */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wide">Lojas</h2>
        {!isStaff && geofence.loading && (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando sua localização...
            </CardContent>
          </Card>
        )}
        {!isStaff && !geofence.loading && visibleStores.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-start gap-2 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <MapPin className="h-4 w-4 text-amber-500" />
                Aproxime-se de uma loja para solicitar ou usar gás reserva.
              </div>
              {geofence.reason && (
                <div className="text-xs text-muted-foreground">{geofence.reason}</div>
              )}
              <Button size="sm" variant="outline" onClick={() => geofence.refresh()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}
        {[...visibleStores]
          .sort((a, b) => {
            const sa = states[a.id];
            const sb = states[b.id];
            const aTotal = sa?.total_qty ?? ((sa?.in_use_qty ?? 1) + (sa?.reserve_qty ?? 1));
            const bTotal = sb?.total_qty ?? ((sb?.in_use_qty ?? 1) + (sb?.reserve_qty ?? 1));
            const aCentral = aTotal === 0;
            const bCentral = bTotal === 0;
            if (aCentral !== bCentral) return aCentral ? -1 : 1;
            // Urgência: vazio > sem reserva > ok
            const urg = (st: StoreState | undefined) => {
              if ((st?.empty_qty ?? 0) > 0) return 0;
              if ((st?.reserve_qty ?? 1) === 0) return 1;
              return 2;
            };
            const ua = urg(sa);
            const ub = urg(sb);
            if (ua !== ub) return ua - ub;
            return (a.name ?? "").localeCompare(b.name ?? "");
          })
          .map((s) => {
          const st = states[s.id];
          const inUseQty = st?.in_use_qty ?? 1;
          const reserveQty = st?.reserve_qty ?? 1;
          const emptyQty = st?.empty_qty ?? 0;
          const hasReserve = reserveQty > 0;
          const totalQty = st?.total_qty ?? (inUseQty + reserveQty);
          const openReq = openRequests.find((r) => r.store_id === s.id);
          const inTransit = inTransitByStore[s.id];
          const inTransitQty = inTransit
            ? Number((inTransit.notes ?? "").match(/Envio de (\d+) vale/)?.[1] ?? 0) || null
            : null;
          // Loja sem bujões = estoque central de vales gás
          const isCentralStock = totalQty === 0;
          const vouchersBalance = st?.vouchers_balance ?? 0;
          return (
            <Card key={s.id} className={emptyQty > 0 ? "border-l-4 border-l-rose-400" : reserveQty === 0 ? "border-l-4 border-l-amber-400" : undefined}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-base font-semibold leading-tight truncate">{s.name}</div>
                    {isCentralStock ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Estoque: {totalAvailable}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="shrink-0 text-[10px] gap-1">
                          <Flame className="h-3 w-3 text-muted-foreground" />
                          {vouchersBalance}
                        </Badge>
                        {isStaff && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditQtyStoreId(s.id)}
                            aria-label="Editar quantidades"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {!isCentralStock && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={reserveQty > 0 ? "outline" : "destructive"} className={reserveQty > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 text-[10px]" : "text-[10px]"}>
                        Reserva: {reserveQty}
                      </Badge>
                      <Badge variant="outline" className={inUseQty > 0 ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900 text-[10px]" : "opacity-50 text-[10px]"}>
                        Em uso: {inUseQty}
                      </Badge>
                      <Badge variant="outline" className={emptyQty > 0 ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 text-[10px]" : "opacity-50 text-[10px]"}>
                        Vazio: {emptyQty}
                      </Badge>
                      {openReq && (
                        <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900">
                          Solicitação aberta
                        </Badge>
                      )}
                      {inTransit && (
                        <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900">
                          Em trânsito{inTransitQty ? `: ${inTransitQty}` : ""}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* mini barra proporcional */}
                  {!isCentralStock && totalQty > 0 && (
                    <div className="mt-3 flex h-1.5 w-full max-w-[280px] overflow-hidden rounded-full">
                      <div
                        className="bg-emerald-400 dark:bg-emerald-600"
                        style={{ width: `${(reserveQty / totalQty) * 100}%` }}
                      />
                      <div
                        className="bg-amber-400 dark:bg-amber-600"
                        style={{ width: `${(inUseQty / totalQty) * 100}%` }}
                      />
                      <div
                        className="bg-rose-400 dark:bg-rose-600"
                        style={{ width: `${(emptyQty / totalQty) * 100}%` }}
                      />
                    </div>
                  )}

                  {isCentralStock && openReq && (
                    <div className="mt-2">
                      <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900">
                        Solicitação aberta
                      </Badge>
                    </div>
                  )}
                </div>

                {isCentralStock && isStaff && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Adicionar:</Label>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        placeholder="Qtde"
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        className="h-9 w-20"
                      />
                      <Button
                        size="sm"
                        onClick={addCentralStock}
                        disabled={addingStock || !addQty}
                        className="gap-1"
                      >
                        <Plus className="h-4 w-4" /> Adicionar
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSendOpen(true)}
                      disabled={totalAvailable <= 0}
                      className="gap-1"
                    >
                      <Send className="h-4 w-4" /> Enviar vales
                    </Button>
                  </div>
                )}

                {!isCentralStock && (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0">
                    {inTransit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={confirmingShipmentId === inTransit.id}
                        onClick={() => confirmShipment(inTransit.id)}
                        className="h-9 w-full text-sm sm:min-w-[200px] border-violet-200 hover:bg-violet-50 dark:border-violet-900 dark:hover:bg-violet-950/30"
                      >
                        {confirmingShipmentId === inTransit.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Package className="mr-1.5 h-4 w-4" />
                        )}
                        Confirmar recebimento{inTransitQty ? ` (${inTransitQty})` : ""}
                      </Button>
                    )}
                    <div className="flex flex-row gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={consumingStoreId === s.id || reserveQty <= 0 || inUseQty <= 0}
                        onClick={() => consume(s.id, "reserve")}
                        title={reserveQty <= 0 ? "Sem reserva disponível" : inUseQty <= 0 ? "Nenhum bujão em uso" : ""}
                        className="h-9 flex-1 px-2 text-xs font-medium sm:flex-none sm:min-w-[100px] border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950/30"
                      >
                        <Flame className="mr-1 h-3.5 w-3.5" /> Usei reserva
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={consumingStoreId === s.id || emptyQty <= 0 || vouchersBalance <= 0}
                        onClick={() => consume(s.id, "in_use")}
                        title={emptyQty <= 0 ? "Nenhum vazio para repor" : vouchersBalance <= 0 ? "Sem vales nesta loja" : ""}
                        className="h-9 flex-1 px-2 text-xs font-medium gap-1 sm:flex-none sm:min-w-[100px] border-amber-200 hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-950/30"
                      >
                        <CreditCard className="h-3.5 w-3.5" /> Usei vale
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {stores.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma loja ativa.
          </div>
        )}
      </section>










      <EditQtyDialog
        storeId={editQtyStoreId}
        store={stores.find((s) => s.id === editQtyStoreId) ?? null}
        state={editQtyStoreId ? states[editQtyStoreId] ?? null : null}
        onClose={() => setEditQtyStoreId(null)}
        onSaved={() => {
          setEditQtyStoreId(null);
          void load();
          toast({ title: "Quantidades atualizadas" });
        }}
      />

      <SendVouchersDialog
        open={sendOpen}
        stores={stores.filter((s) => {
          const st = states[s.id];
          const totalQty = (st?.in_use_qty ?? 1) + (st?.reserve_qty ?? 1);
          return totalQty > 0; // exclui o próprio estoque central
        })}
        availableInStock={totalAvailable}
        onClose={() => setSendOpen(false)}
        onSaved={(qty, storeName) => {
          setSendOpen(false);
          void load();
          toast({ title: "Envio em trânsito", description: `${qty} vale(s) aguardando confirmação de ${storeName}.` });
        }}
      />
    </div>
  );
}

// ============= DIALOGS =============

// PriceDialog removido — preço agora é editável inline no card "Preço atual".

// PurchaseDialog removido — entrada de estoque agora é feita inline no card do Estoque Central.

function UseReserveDialog({
  storeId,
  onClose,
  onSaved,
}: {
  storeId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (storeId) setNotes("");
  }, [storeId]);

  const save = async () => {
    if (!storeId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("gas_use_reserve", { _store_id: storeId, _notes: notes || null });
      if (error) throw error;
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!storeId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Usar bujão reserva</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirme que o bujão reserva entrou em uso. Lembre-se de solicitar um novo à empresa de gás. Quando o vale chegar,
          confirme o recebimento aqui para abater do estoque.
        </p>
        <div className="space-y-1">
          <Label>Observações (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ex: solicitei à empresa Gás XYZ às 10h"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmReceiptDialog({
  requestId,
  onClose,
  onSaved,
}: {
  requestId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (requestId) setNotes("");
  }, [requestId]);

  const save = async () => {
    if (!requestId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("gas_confirm_receipt", { _request_id: requestId, _notes: notes || null });
      if (error) throw error;
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!requestId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar recebimento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ao confirmar, 1 vale será abatido do estoque e o reserva da loja será reposto.
        </p>
        <div className="space-y-1">
          <Label>Observações (opcional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Confirmar recebimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditQtyDialog({
  storeId,
  store,
  state,
  onClose,
  onSaved,
}: {
  storeId: string | null;
  store: StoreRow | null;
  state: StoreState | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inUse, setInUse] = useState("1");
  const [reserve, setReserve] = useState("1");
  const [empty, setEmpty] = useState("0");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!storeId) return;
    setInUse(String(state?.in_use_qty ?? 1));
    setReserve(String(state?.reserve_qty ?? 1));
    setEmpty(String(state?.empty_qty ?? 0));
  }, [storeId, state]);

  const i = parseInt(inUse, 10) || 0;
  const r = parseInt(reserve, 10) || 0;
  const e = parseInt(empty, 10) || 0;
  const total = i + r + e;

  const save = async () => {
    if (!storeId) return;
    if (isNaN(i) || isNaN(r) || isNaN(e) || i < 0 || r < 0 || e < 0) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gas_voucher_store_state")
        .upsert(
          { store_id: storeId, in_use_qty: i, reserve_qty: r, empty_qty: e, total_qty: total, has_reserve: r > 0 },
          { onConflict: "store_id" },
        );
      if (error) throw error;
      onSaved();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!storeId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar bujões — {store?.name ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Reserva
            </Label>
            <Input
              type="number"
              min={0}
              value={reserve}
              onChange={(ev) => setReserve(ev.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Em uso
            </Label>
            <Input
              type="number"
              min={0}
              value={inUse}
              onChange={(ev) => setInUse(ev.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
              Vazio
            </Label>
            <Input
              type="number"
              min={0}
              value={empty}
              onChange={(ev) => setEmpty(ev.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Total fixo de bujões da loja: <span className="font-semibold text-foreground">{total}</span>. Ajuste manual não movimenta vales nem cria solicitações.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ComparisonPanel removido — métricas migradas para o dashboard do topo.

function SendVouchersDialog({
  open,
  stores,
  availableInStock,
  onClose,
  onSaved,
}: {
  open: boolean;
  stores: StoreRow[];
  availableInStock: number;
  onClose: () => void;
  onSaved: (qty: number, storeName: string) => void;
}) {
  const [storeId, setStoreId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setQty("1");
      setStoreId("");
    }
  }, [open]);

  const save = async () => {
    if (!storeId) {
      toast({ title: "Selecione a loja", variant: "destructive" });
      return;
    }
    const n = parseInt(qty, 10);
    if (!n || n <= 0) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }
    if (n > availableInStock) {
      toast({ title: "Estoque insuficiente", description: `Disponível: ${availableInStock}`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("gas_send_vouchers" as any, { _store_id: storeId, _qty: n });
      if (error) throw error;
      const storeName = stores.find((s) => s.id === storeId)?.name ?? "loja";
      onSaved(n, storeName);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar vales do estoque central</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Loja de destino</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              max={availableInStock}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Disponível no estoque central: <strong>{availableInStock}</strong>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Enviando..." : "Enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
