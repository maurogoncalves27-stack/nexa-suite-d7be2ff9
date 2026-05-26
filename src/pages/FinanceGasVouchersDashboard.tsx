import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowLeft, Flame, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StoreRow = { id: string; name: string };
type StoreState = {
  store_id: string;
  in_use_qty: number;
  reserve_qty: number;
  empty_qty: number;
  total_qty: number;
  vouchers_balance: number;
};
type Request = {
  id: string;
  store_id: string;
  status: "requested" | "received" | "cancelled";
  received_at: string | null;
  notes: string | null;
};
type Purchase = {
  id: string;
  purchased_at: string;
  total_amount: number;
  unit_price: number;
  quantity: number;
  remaining: number;
};

const PERIODS = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "180", label: "180d" },
  { value: "365", label: "12m" },
] as const;

const PIE_COLORS = ["hsl(142 71% 45%)", "hsl(43 96% 56%)", "hsl(0 84% 60%)"];

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinanceGasVouchersDashboard() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("90");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [states, setStates] = useState<Record<string, StoreState>>({});
  const [requests, setRequests] = useState<Request[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [unitPrice, setUnitPrice] = useState(0);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [s, st, rq, pu, se] = await Promise.all([
        supabase.from("stores").select("id, name").eq("is_active", true).eq("is_virtual", false).not("name", "ilike", "%escrit%").order("name"),
        supabase
          .from("gas_voucher_store_state")
          .select("store_id, in_use_qty, reserve_qty, empty_qty, total_qty, vouchers_balance"),
        supabase
          .from("gas_voucher_requests")
          .select("id, store_id, status, received_at, notes")
          .order("received_at", { ascending: false })
          .limit(2000),
        supabase
          .from("gas_voucher_purchases")
          .select("id, purchased_at, total_amount, unit_price, quantity, remaining")
          .order("purchased_at", { ascending: false })
          .limit(200),
        supabase.from("gas_voucher_settings").select("unit_price").limit(1).maybeSingle(),
      ]);
      setStores((s.data ?? []) as StoreRow[]);
      const map: Record<string, StoreState> = {};
      ((st.data ?? []) as StoreState[]).forEach((row) => {
        map[row.store_id] = row;
      });
      setStates(map);
      setRequests((rq.data ?? []) as Request[]);
      setPurchases((pu.data ?? []) as Purchase[]);
      setUnitPrice((se.data as any)?.unit_price ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const days = parseInt(period, 10);
  const cutoff = subDays(new Date(), days).getTime();

  // Filtra apenas trocas via vale (consumo real de vales = "Troca via vale")
  const consumptions = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "received" &&
          r.received_at &&
          new Date(r.received_at).getTime() >= cutoff &&
          (r.notes?.toLowerCase().includes("vazio→cheio") || r.notes?.toLowerCase().includes("troca")),
      ),
    [requests, cutoff],
  );

  // KPIs
  const kpis = useMemo(() => {
    const totalConsumed = consumptions.length;
    const realStores = stores.filter((s) => (states[s.id]?.total_qty ?? 0) > 0);
    const totalBujoes = realStores.reduce((sum, s) => sum + (states[s.id]?.total_qty ?? 0), 0);
    const totalEmpty = realStores.reduce((sum, s) => sum + (states[s.id]?.empty_qty ?? 0), 0);
    const totalReserve = realStores.reduce((sum, s) => sum + (states[s.id]?.reserve_qty ?? 0), 0);
    const totalInUse = realStores.reduce((sum, s) => sum + (states[s.id]?.in_use_qty ?? 0), 0);
    const totalVouchersInStores = realStores.reduce(
      (sum, s) => sum + (states[s.id]?.vouchers_balance ?? 0),
      0,
    );
    const totalCentral = purchases.reduce((sum, p) => sum + (p.remaining || 0), 0);
    const inventoryValue = (totalCentral + totalVouchersInStores) * unitPrice;
    const periodCost = totalConsumed * unitPrice;
    const storesEmpty = realStores.filter((s) => (states[s.id]?.reserve_qty ?? 0) === 0).length;
    return {
      totalConsumed,
      totalBujoes,
      totalEmpty,
      totalReserve,
      totalInUse,
      totalCentralStock: totalCentral,
      totalVouchersInStores,
      inventoryValue,
      periodCost,
      storesEmpty,
      realStoresCount: realStores.length,
    };
  }, [consumptions, stores, states, purchases, unitPrice]);

  // Consumo por loja
  const byStore = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of consumptions) counts.set(c.store_id, (counts.get(c.store_id) ?? 0) + 1);
    return stores
      .filter((s) => (states[s.id]?.total_qty ?? 0) > 0)
      .map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name, qty: counts.get(s.id) ?? 0 }))
      .sort((a, b) => b.qty - a.qty);
  }, [consumptions, stores, states]);

  // Consumo mensal (últimos 6 meses)
  const monthly = useMemo(() => {
    const months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() });
    return months.map((m) => {
      const start = startOfMonth(m).getTime();
      const end = endOfMonth(m).getTime();
      const qty = requests.filter(
        (r) =>
          r.status === "received" &&
          r.received_at &&
          new Date(r.received_at).getTime() >= start &&
          new Date(r.received_at).getTime() <= end &&
          (r.notes?.toLowerCase().includes("vazio→cheio") || r.notes?.toLowerCase().includes("troca")),
      ).length;
      return {
        month: format(m, "MMM/yy", { locale: ptBR }),
        qty,
        custo: qty * unitPrice,
      };
    });
  }, [requests, unitPrice]);

  // Variação do preço unitário (últimas 10 compras)
  const priceTrend = useMemo(() => {
    return [...purchases]
      .filter((p) => p.unit_price > 0)
      .sort((a, b) => new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime())
      .slice(-10)
      .map((p) => ({
        date: format(new Date(p.purchased_at), "dd/MM"),
        preco: Number(p.unit_price),
      }));
  }, [purchases]);

  // Distribuição global dos bujões
  const distribution = useMemo(
    () => [
      { name: "Reserva", value: kpis.totalReserve },
      { name: "Em uso", value: kpis.totalInUse },
      { name: "Vazio", value: kpis.totalEmpty },
    ],
    [kpis],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/financeiro/vale-gas">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
          <TabsList className="h-8">
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value} className="h-7 px-2 text-xs">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Flame className="h-3 w-3" /> Consumo {period}d
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight">{kpis.totalConsumed}</div>
            <div className="text-[10px] text-muted-foreground">{fmtBRL(kpis.periodCost)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <DollarSign className="h-3 w-3" /> Estoque (R$)
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight">{fmtBRL(kpis.inventoryValue)}</div>
            <div className="text-[10px] text-muted-foreground">
              {kpis.totalCentralStock + kpis.totalVouchersInStores} vales
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Bujões totais
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight">{kpis.totalBujoes}</div>
            <div className="text-[10px] text-muted-foreground">{kpis.realStoresCount} lojas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Sem reserva
            </div>
            <div className="mt-0.5 text-lg font-bold leading-tight text-destructive">{kpis.storesEmpty}</div>
            <div className="text-[10px] text-muted-foreground">lojas críticas</div>
          </CardContent>
        </Card>
      </div>

      {/* Consumo por loja */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Consumo por loja ({period}d)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={Math.max(180, byStore.length * 28)}>
            <BarChart data={byStore} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="name" width={90} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Tendência mensal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência mensal (6m)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="qty" stroke="hsl(var(--primary))" strokeWidth={2} name="Vales" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição de bujões */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição dos bujões</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={distribution} dataKey="value" nameKey="name" outerRadius={70} label={(e) => `${e.name}: ${e.value}`} fontSize={11}>
                  {distribution.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Variação de preço */}
      {priceTrend.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico do preço unitário</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={priceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(v: number) => fmtBRL(v)}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="preco" stroke="hsl(var(--primary))" strokeWidth={2} name="Preço" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top consumidoras */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ranking — Top consumidoras ({period}d)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {byStore.slice(0, 5).map((row, idx) => (
            <div key={idx} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">#{idx + 1}</Badge>
                {row.name}
              </span>
              <span className="font-semibold tabular-nums">{row.qty}</span>
            </div>
          ))}
          {byStore.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-4">Sem consumo no período.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
