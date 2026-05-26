import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Crown, TrendingUp, Wallet, FileBarChart, Landmark, Calculator, Percent, Loader2, Trophy, AlertTriangle, LayoutDashboard, Star, Receipt, PieChart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { setViewMode } from "@/hooks/useViewMode";
import { useGuidedTour } from "@/hooks/useGuidedTour";
import { getPartnerDashboardTourSteps } from "@/lib/tours/partnerDashboardTour";

interface RevenueRow {
  store_id: string | null;
  brand_id: string | null;
  amount: number | null;
  reference_month: string;
}

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const QUICK_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-primary", bg: "bg-primary/10" },
  { to: "/faturamento", label: "Faturamento", icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
  { to: "/financeiro/dre", label: "DRE", icon: FileBarChart, color: "text-violet-500", bg: "bg-violet-50" },
  { to: "/financeiro", label: "Extrato", icon: Wallet, color: "text-warning", bg: "bg-warning/10" },
  { to: "/financeiro/cmv", label: "CMV", icon: Percent, color: "text-rose-500", bg: "bg-rose-50" },
  { to: "/financeiro/precificacao", label: "Precificação", icon: Calculator, color: "text-cyan-500", bg: "bg-cyan-50" },
  { to: "/conciliacao", label: "Conciliação", icon: Landmark, color: "text-indigo-500", bg: "bg-indigo-50" },
  { to: "/ranking", label: "Ranking", icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-50" },
  { to: "/ocorrencias/relatorio", label: "Ocorrências", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  { to: "/avaliacoes-clientes", label: "Avaliações", icon: Star, color: "text-orange-500", bg: "bg-orange-50" },
  { to: "/financeiro/contas", label: "Contas", icon: Receipt, color: "text-teal-500", bg: "bg-teal-50" },
  { to: "/financeiro/categorias", label: "Categorias", icon: PieChart, color: "text-pink-500", bg: "bg-pink-50" },
] as const;

export default function PartnerDashboard() {
  const { isPartner, isSuperUser, isAdmin, isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentMonthTotal, setCurrentMonthTotal] = useState(0);
  const [previousMonthTotal, setPreviousMonthTotal] = useState(0);

  // Tour de boas-vindas para sócios (autostart só para role 'partner', uma vez)
  const partnerTourSteps = useMemo(() => getPartnerDashboardTourSteps(), []);
  useGuidedTour({
    tourKey: "partner-dashboard-v1",
    steps: partnerTourSteps,
    autoStart: isPartner && !isAdmin && !isManager,
    ready: !loading,
    delayMs: 1000,
  });

  useEffect(() => {
    // Só força modo sócio quando o usuário entrou direto no painel sem ter escolhido um modo.
    if ((isPartner || isSuperUser) && !sessionStorage.getItem("rh:viewMode")) {
      setViewMode("socio");
    }
  }, [isPartner, isSuperUser]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const today = new Date();
        const curr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);

        const client: any = supabase;
        const { data } = await client
          .from("monthly_revenue")
          .select("amount, reference_month")
          .in("reference_month", [curr, prev]);

        const sum = (m: string) =>
          (data ?? [])
            .filter((r: any) => String(r.reference_month).slice(0, 10) === m)
            .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

        setCurrentMonthTotal(sum(curr));
        setPreviousMonthTotal(sum(prev));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const variation =
    previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2" data-tour="partner-header">
        <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
          <Crown className="h-5 w-5 sm:h-7 sm:w-7 text-primary" /> Painel do Sócio
        </h1>
      </div>

      <div className="grid gap-2 grid-cols-2" data-tour="partner-kpis">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardDescription className="text-[11px]">Fat. do mês</CardDescription>
            <CardTitle className="text-lg sm:text-2xl tabular-nums leading-tight">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : BRL(currentMonthTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-[10px] text-muted-foreground">
              {variation >= 0 ? "↑" : "↓"} {Math.abs(variation).toFixed(1)}% vs. mês anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardDescription className="text-[11px]">Mês anterior</CardDescription>
            <CardTitle className="text-lg sm:text-2xl tabular-nums leading-tight">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : BRL(previousMonthTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-[10px] text-muted-foreground">Soma de todas as lojas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-2 grid-cols-3" data-tour="partner-quick-links">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to}>
            <Card className="h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-border/60">
              <CardContent className="p-3 flex flex-col items-center text-center gap-1.5">
                <div className={`h-10 w-10 rounded-full ${l.bg} ${l.color} flex items-center justify-center shrink-0`}>
                  <l.icon className="h-5 w-5" />
                </div>
                <div className="font-medium text-xs leading-tight">{l.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
