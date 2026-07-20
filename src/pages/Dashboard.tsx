import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Users, Building2, UserCheck, GraduationCap, BookOpen, FileWarning, Plane, AlertTriangle, LayoutDashboard,
  Cake, Award, ShieldAlert, Clock, HeartHandshake, Settings2, RotateCcw, Check, Loader2,
  Wallet, Wrench, Boxes, ChefHat, TrendingUp, AlertCircle, ReceiptText, Megaphone,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getMissingAdmissionDocs } from "@/lib/requiredDocs";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RISK_LABEL, RISK_BADGE, type VacationRisk, type VacationStatus } from "@/lib/vacation";
import ChecklistsByStorePanel from "@/components/checklists/ChecklistsByStorePanel";
import PendingAssignmentsCard from "@/components/dashboard/PendingAssignmentsCard";

import MetricsCard, { type Metric } from "@/components/dashboard/MetricsCard";
import DashboardSection from "@/components/dashboard/DashboardSection";
import ManagerQuickActions from "@/components/dashboard/ManagerQuickActions";
import { SupplierOffersCard } from "@/components/dashboard/SupplierOffersCard";
import ColdChamberStatusCard from "@/components/dashboard/ColdChamberStatusCard";
const AnalyticsCharts = lazy(() => import("@/components/dashboard/AnalyticsCharts"));
import MaintenanceSummaryCard from "@/components/dashboard/MaintenanceSummaryCard";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { useDashboardMetrics } from "@/components/dashboard/useDashboardMetrics";
import { useSegmentMetrics } from "@/components/dashboard/useSegmentMetrics";
import DashboardAiDiagnosisButton from "@/components/dashboard/DashboardAiDiagnosisButton";

interface TrainingItem {
  id: string;
  full_name: string;
  training_start_date: string | null;
  missing: string[];
}

interface VacationAlertItem {
  employee_id: string;
  full_name: string;
  risk: VacationRisk;
  days_until_deadline: number;
  concessive_end: string;
}

const daysBetween = (start: string | null) => {
  if (!start) return 0;
  const ms = new Date().getTime() - new Date(start + "T00:00:00").getTime();
  return Math.max(0, Math.floor(ms / 86_400_000) + 1);
};

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Segmentos (detalhes por área, sanfona fechada por padrão)
const SECTION_IDS = ["rh", "operations", "finance", "inventory"] as const;
type SectionId = typeof SECTION_IDS[number];

const SECTION_INFO: Record<SectionId, { title: string; description: string; icon: any }> = {
  rh: { title: "Pessoas & RH", description: "Colaboradores, ponto, férias, treinamento, clima", icon: Users },
  operations: { title: "Operações & Lojas", description: "Checklists, manutenções, tarefas, avisos", icon: Wrench },
  finance: { title: "Financeiro", description: "Contas a pagar/receber, faturamento", icon: Wallet },
  inventory: { title: "Estoque & Cardápio", description: "Estoque, vendas POS, uniformes", icon: Boxes },
};

const CARD_IDS = [
  "critical-alerts",
  "executive-kpis",
  "quick-actions",
  "priority-grid",
  "analytics-charts",
  "pending-assignments",
] as const;
type CardId = typeof CARD_IDS[number];
const CARD_LABELS: Record<CardId, string> = {
  "critical-alerts": "Alertas críticos",
  "executive-kpis": "KPIs essenciais",
  "quick-actions": "Botões do gestor",
  "priority-grid": "Painel prioritário",
  "analytics-charts": "Gráficos analíticos",
  "pending-assignments": "Pendências de assinatura",
};

export default function Dashboard() {
  const { isAdmin, isManager } = useAuth();
  const isStaff = isAdmin || isManager;
  const metrics = useDashboardMetrics();
  const seg = useSegmentMetrics();
  const [editing, setEditing] = useState(false);

  const allCardIds = useMemo(() => [...CARD_IDS], []);
  const allSectionIds = useMemo(() => [...SECTION_IDS], []);
  const { prefs, toggleHidden, setFavoriteSection, setOpenSections, reset } = useDashboardPrefs(
    allCardIds,
    allSectionIds,
  );

  // Segmentos começam fechados por padrão (detalhe sob demanda)
  const orderedSections = useMemo(() => {
    const fav = prefs.favoriteSection as SectionId | null;
    if (!fav) return [...SECTION_IDS];
    return [fav, ...SECTION_IDS.filter((s) => s !== fav)];
  }, [prefs.favoriteSection]);

  const isOpen = (id: SectionId) => prefs.openSections.includes(id);
  const toggleSection = (id: SectionId) => {
    const next = isOpen(id) ? prefs.openSections.filter((x) => x !== id) : [...prefs.openSections, id];
    setOpenSections(next);
  };

  // ---- Treinamentos ----
  const { data: trainingList = [] } = useQuery<TrainingItem[]>({
    queryKey: ["dashboard", "training-list"],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: trainees } = await supabase
        .from("employees")
        .select("id, full_name, training_start_date, gender, contract_type")
        .in("training_status", ["pending", "in_progress"])
        .order("training_start_date", { ascending: true, nullsFirst: false });
      const list = (trainees ?? []) as { id: string; full_name: string; training_start_date: string | null; gender: string | null; contract_type: string | null }[];
      if (list.length === 0) return [];
      const ids = list.map((t) => t.id);
      const { data: docs } = await supabase
        .from("employee_documents")
        .select("employee_id, doc_type")
        .in("employee_id", ids);
      const docsByEmp: Record<string, { doc_type: string }[]> = {};
      (docs ?? []).forEach((d: any) => {
        if (!docsByEmp[d.employee_id]) docsByEmp[d.employee_id] = [];
        docsByEmp[d.employee_id].push({ doc_type: d.doc_type });
      });
      return list.map((t) => ({
        ...t,
        missing: getMissingAdmissionDocs(docsByEmp[t.id] ?? [], t.gender, t.contract_type),
      }));
    },
  });

  // ---- Férias ----
  const { data: vacationData } = useQuery<{ summary: Record<VacationRisk, number>; alerts: VacationAlertItem[] }>({
    queryKey: ["dashboard", "vacation-status"],
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: activeEmps } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("status", "active");
      const counts: Record<VacationRisk, number> = { ok: 0, warning: 0, critical: 0, expired: 0 };
      const alerts: VacationAlertItem[] = [];
      const emps = (activeEmps ?? []) as { id: string; full_name: string }[];
      const BATCH = 8;
      for (let i = 0; i < emps.length; i += BATCH) {
        const slice = emps.slice(i, i + BATCH);
        await Promise.all(slice.map(async (e) => {
          const { data } = await supabase.rpc("employee_vacation_status" as any, { _employee_id: e.id } as any);
          const arr = (data ?? []) as unknown as VacationStatus[];
          const s = arr[0];
          if (!s) return;
          counts[s.risk_level]++;
          if (s.risk_level !== "ok") {
            alerts.push({
              employee_id: e.id,
              full_name: e.full_name,
              risk: s.risk_level,
              days_until_deadline: s.days_until_deadline,
              concessive_end: s.concessive_end,
            });
          }
        }));
      }
      const order: Record<VacationRisk, number> = { expired: 0, critical: 1, warning: 2, ok: 3 };
      alerts.sort((a, b) => order[a.risk] - order[b.risk] || a.days_until_deadline - b.days_until_deadline);
      return { summary: counts, alerts };
    },
  });
  const vacationSummary = vacationData?.summary ?? { ok: 0, warning: 0, critical: 0, expired: 0 };
  const vacationAlerts = vacationData?.alerts ?? [];

  // ---- KPIs essenciais (5 métricas de alto nível) ----
  const executiveMetrics: Metric[] = [
    { label: "Colaboradores ativos", value: metrics.active, icon: UserCheck, color: "text-success", to: "/colaboradores" },
    { label: "Lojas", value: metrics.stores, icon: Building2, color: "text-primary", to: "/lojas" },
    { label: "A pagar (aberto)", value: seg.payablesOpen, icon: ReceiptText, color: "text-primary", to: "/financeiro", hint: BRL(seg.payablesAmountOpen) },
    { label: "A receber", value: seg.receivablesOpen, icon: TrendingUp, color: "text-success", to: "/financeiro", hint: BRL(seg.receivablesAmountOpen) },
    { label: "Vendas POS/mês", value: seg.posSalesMonth, icon: TrendingUp, color: "text-primary", to: "/pdv-novo", hint: BRL(seg.posRevenueMonth) },
  ];

  // ---- Alertas críticos (só mostra se houver algo) ----
  const criticalAlerts: Metric[] = [
    seg.payablesOverdue > 0 && { label: "Contas vencidas", value: seg.payablesOverdue, icon: AlertCircle, color: "text-destructive", to: "/financeiro" },
    seg.maintenanceUrgent > 0 && { label: "Manut. urgentes", value: seg.maintenanceUrgent, icon: Wrench, color: "text-destructive", to: "/nutri-visita" },
    (vacationSummary.expired + vacationSummary.critical) > 0 && { label: "Férias em risco", value: vacationSummary.expired + vacationSummary.critical, icon: Plane, color: "text-destructive", to: "/ferias" },
    seg.productsOutOfStock > 0 && { label: "Sem saldo", value: seg.productsOutOfStock, icon: AlertCircle, color: "text-destructive", to: "/estoque" },
    metrics.missingPunchWeek > 0 && { label: "Pontos não batidos", value: metrics.missingPunchWeek, icon: Clock, color: "text-warning", to: "/ponto" },
    metrics.warningsMonth > 0 && { label: "Advert./mês", value: metrics.warningsMonth, icon: ShieldAlert, color: "text-destructive", to: "/avaliacoes" },
  ].filter(Boolean) as Metric[];

  const hasCriticalAlerts = criticalAlerts.length > 0;

  // ---- Métricas por segmento ----
  const rhMetrics: Metric[] = [
    { label: "Colaboradores", value: metrics.active, icon: Users, to: "/colaboradores", hint: "Ativos" },
    { label: "Em treinamento", value: metrics.inTraining, icon: BookOpen, color: "text-warning", to: "/treinamentos" },
    { label: "Estagiários", value: metrics.trainees, icon: GraduationCap, to: "/estagio" },
    { label: "Aniversariantes", value: metrics.birthdaysMonth, icon: Cake, color: "text-pink-500", hint: "Este mês" },
    { label: "Avaliações pend.", value: metrics.pendingEvaluations, icon: Award, color: "text-warning", to: "/avaliacoes" },
    { label: "Advert./mês", value: metrics.warningsMonth, icon: ShieldAlert, color: "text-destructive", to: "/avaliacoes" },
    { label: "Infrações/mês", value: metrics.infractionsMonth, icon: ShieldAlert, color: "text-destructive", to: "/infracoes" },
    { label: "Pesquisas clima", value: metrics.activeSurveys, icon: HeartHandshake, color: "text-primary", to: "/clima" },
  ];

  const opsMetrics: Metric[] = [
    { label: "Manut. pendentes", value: seg.maintenancePending, icon: Wrench, color: seg.maintenancePending > 0 ? "text-warning" : "text-muted-foreground", to: "/nutri-visita" },
    { label: "Manut. urgentes", value: seg.maintenanceUrgent, icon: AlertTriangle, color: "text-destructive", to: "/nutri-visita" },
    { label: "Avisos ativos", value: seg.announcementsActive, icon: Megaphone, color: "text-primary", to: "/avisos" },
    { label: "Tarefas ativas", value: seg.tasksActive, icon: ShieldAlert, color: "text-accent", to: "/tarefas" },
  ];

  const financeMetrics: Metric[] = [
    { label: "A pagar (em aberto)", value: seg.payablesOpen, icon: ReceiptText, to: "/financeiro", hint: BRL(seg.payablesAmountOpen) },
    { label: "Vencidas", value: seg.payablesOverdue, icon: AlertCircle, color: "text-destructive", to: "/financeiro" },
    { label: "Vencem em 7d", value: seg.payablesDueWeek, icon: Clock, color: "text-warning", to: "/financeiro" },
    { label: "A receber", value: seg.receivablesOpen, icon: TrendingUp, color: "text-success", to: "/financeiro", hint: BRL(seg.receivablesAmountOpen) },
  ];

  const inventoryMetrics: Metric[] = [
    { label: "Sem saldo", value: seg.productsOutOfStock, icon: AlertCircle, color: "text-destructive", to: "/estoque" },
    { label: "Estoque baixo", value: seg.productsLowStock, icon: AlertTriangle, color: "text-warning", to: "/estoque" },
    { label: "Vendas POS/mês", value: seg.posSalesMonth, icon: TrendingUp, color: "text-primary", to: "/pdv-novo", hint: BRL(seg.posRevenueMonth) },
    { label: "Receituário", value: "—", icon: ChefHat, color: "text-emerald-600", to: "/receituario", hint: "Visualizar" },
  ];

  const renderVacationsCard = () => (
    <Card className={vacationSummary.expired > 0 || vacationSummary.critical > 0 ? "border-destructive/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base flex items-center gap-2 min-w-0">
          <Plane className="h-5 w-5 text-primary shrink-0" />
          <span className="truncate">Programação de Férias</span>
          {(vacationSummary.expired > 0 || vacationSummary.critical > 0) && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
        </CardTitle>
        <Link to="/ferias" className="text-xs text-primary hover:underline shrink-0">Ver todas</Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(["ok", "warning", "critical", "expired"] as VacationRisk[]).map((r) => (
            <Link key={r} to="/ferias" className="rounded-md border p-2.5 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">{RISK_LABEL[r]}</span>
                <Badge variant="outline" className={RISK_BADGE[r]}>{r}</Badge>
              </div>
              <div className="text-xl font-bold mt-1">{vacationSummary[r]}</div>
            </Link>
          ))}
        </div>
        {vacationAlerts.length > 0 && (
          <ul className="divide-y divide-border">
            {vacationAlerts.slice(0, 3).map((a) => (
              <li key={a.employee_id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/colaboradores/${a.employee_id}`} className="font-medium text-foreground truncate hover:underline text-sm">{a.full_name}</Link>
                  <div className="text-[11px] text-muted-foreground">
                    {a.days_until_deadline >= 0 ? `${a.days_until_deadline}d restantes` : `vencido há ${Math.abs(a.days_until_deadline)}d`}
                  </div>
                </div>
                <Badge variant="outline" className={RISK_BADGE[a.risk]}>{RISK_LABEL[a.risk]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const renderTrainingCard = () => {
    if (trainingList.length === 0) return null;
    return (
      <Card>
        <Accordion type="single" collapsible defaultValue="t">
          <AccordionItem value="t" className="border-0">
            <div className="flex flex-row items-center justify-between px-4 pt-4">
              <AccordionTrigger className="flex-1 py-0 hover:no-underline">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-warning" />
                  Em treinamento
                  <Badge variant="outline" className="ml-2">{trainingList.length}</Badge>
                </CardTitle>
              </AccordionTrigger>
              <Link to="/treinamentos" className="text-xs text-primary hover:underline ml-3 shrink-0">Ver todos</Link>
            </div>
            <AccordionContent>
              <CardContent className="pt-3">
                <ul className="divide-y divide-border">
                  {trainingList.map((t) => {
                    const day = Math.min(7, daysBetween(t.training_start_date));
                    const pct = Math.round((day / 7) * 100);
                    return (
                      <li key={t.id} className="py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate text-sm">{t.full_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {t.training_start_date ? `Dia ${day}/7` : "Aguardando início"}
                            </div>
                          </div>
                          {t.missing.length > 0 && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
                              <FileWarning className="h-3 w-3 mr-1" />Doc.
                            </Badge>
                          )}
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    );
  };

  const renderSection = (id: SectionId): React.ReactNode => {
    if (!isStaff) return null;
    switch (id) {
      case "rh":
        return (
          <>
            <MetricsCard metrics={rhMetrics} loading={metrics.loading} />
            {renderVacationsCard()}
            {renderTrainingCard()}
          </>
        );
      case "operations":
        return (
          <>
            <MetricsCard metrics={opsMetrics} loading={seg.loading} />
            <ChecklistsByStorePanel />
          </>
        );
      case "finance":
        return (
          <>
            <MetricsCard metrics={financeMetrics} loading={seg.loading} />
            <Card>
              <CardContent className="p-3 sm:p-4 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="min-w-0">Veja DRE, conciliação e visão consolidada do financeiro.</span>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button variant="outline" size="sm" asChild><Link to="/financeiro">Financeiro</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link to="/financeiro/dre">DRE</Link></Button>
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "inventory":
        return (
          <>
            <MetricsCard metrics={inventoryMetrics} loading={seg.loading} />
            <Card>
              <CardContent className="p-3 sm:p-4 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="min-w-0">Acesso rápido a estoque, recebimento e cardápio.</span>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button variant="outline" size="sm" asChild><Link to="/estoque">Estoque</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link to="/recebimento">Recebimento</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link to="/cardapio">Cardápio</Link></Button>
                </div>
              </CardContent>
            </Card>
          </>
        );
    }
  };

  const sectionBadge = (id: SectionId): { value: string | number; variant: "destructive" | "outline" } | undefined => {
    if (id === "rh") {
      const total = vacationSummary.expired + vacationSummary.critical + metrics.warningsMonth;
      if (total > 0) return { value: total, variant: "destructive" };
    }
    if (id === "operations" && seg.maintenanceUrgent > 0) {
      return { value: seg.maintenanceUrgent, variant: "destructive" };
    }
    if (id === "finance" && seg.payablesOverdue > 0) {
      return { value: seg.payablesOverdue, variant: "destructive" };
    }
    if (id === "inventory" && seg.productsOutOfStock > 0) {
      return { value: seg.productsOutOfStock, variant: "destructive" };
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Dashboard
        </h1>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <DashboardAiDiagnosisButton
            buildSnapshot={async () => {
              const today = new Date();
              const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
              const [reservationsMonth, reservationsOpen, psychoOpen, medActive, moodWeek] = await Promise.all([
                supabase.from("reservations").select("id", { count: "exact", head: true }).gte("reservation_date", monthStart),
                supabase.from("reservations").select("id", { count: "exact", head: true }).in("status", ["pending", "confirmed"]).gte("reservation_date", today.toISOString().slice(0, 10)),
                supabase.from("psychosocial_risks").select("id", { count: "exact", head: true }).is("resolved_at", null),
                supabase.from("medical_certificates").select("id", { count: "exact", head: true }).gte("start_date", monthStart),
                supabase.from("mood_checkins").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
              ]);
              return {
                data_referencia: today.toISOString().slice(0, 10),
                rh: {
                  colaboradores_ativos: metrics.active,
                  total_cadastrados: metrics.employees,
                  estagiarios: metrics.trainees,
                  em_treinamento: metrics.inTraining,
                  avaliacoes_pendentes: metrics.pendingEvaluations,
                  advertencias_mes: metrics.warningsMonth,
                  infracoes_mes: metrics.infractionsMonth,
                  aniversariantes_mes: metrics.birthdaysMonth,
                  ponto_nao_batido_semana: metrics.missingPunchWeek,
                  pesquisas_clima_ativas: metrics.activeSurveys,
                },
                ferias: vacationSummary,
                operacoes: {
                  manutencao_pendente: seg.maintenancePending,
                  manutencao_urgente: seg.maintenanceUrgent,
                  avisos_ativos: seg.announcementsActive,
                  tarefas_ativas: seg.tasksActive,
                },
                financeiro: {
                  a_pagar_aberto: seg.payablesOpen,
                  a_pagar_valor: seg.payablesAmountOpen,
                  a_pagar_vencidas: seg.payablesOverdue,
                  vencem_em_7d: seg.payablesDueWeek,
                  a_receber_aberto: seg.receivablesOpen,
                  a_receber_valor: seg.receivablesAmountOpen,
                  vendas_pos_mes: seg.posSalesMonth,
                  receita_pos_mes: seg.posRevenueMonth,
                },
                estoque: {
                  status: "em_testes_nao_produtivo",
                  observacao: "Módulo de estoque ainda em fase de testes — ignorar nas conclusões e não gerar recomendações sobre ruptura/saldo.",
                },
                crm: {
                  reservas_mes: reservationsMonth.count ?? 0,
                  reservas_abertas_futuras: reservationsOpen.count ?? 0,
                },
                saude_ocupacional: {
                  riscos_psicossociais_abertos: psychoOpen.count ?? 0,
                  atestados_medicos_mes: medActive.count ?? 0,
                  mood_checkins_ultimos_7d: moodWeek.count ?? 0,
                },
                lojas: metrics.stores,
              };
            }}
          />
          {isAdmin && (
            <>
              {editing && (
                <Button variant="ghost" size="sm" onClick={reset} title="Restaurar padrão">
                  <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
                </Button>
              )}
              <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? <Check className="h-4 w-4 mr-1" /> : <Settings2 className="h-4 w-4 mr-1" />}
                {editing ? "Concluir" : "Personalizar"}
              </Button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs sm:text-sm text-muted-foreground space-y-2">
          <p>Use o ⭐ para favoritar a seção de detalhes que abre primeiro. Use o olho para ocultar/exibir cards do topo.</p>
          <div className="flex flex-wrap gap-2">
            {allCardIds.map((id) => {
              const hidden = prefs.hidden.includes(id);
              return (
                <Button
                  key={id}
                  variant={hidden ? "outline" : "secondary"}
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => toggleHidden(id)}
                >
                  {hidden ? "Mostrar" : "Ocultar"}: {CARD_LABELS[id as CardId]}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1) Alertas críticos — só se houver algo que precise de atenção */}
      {isStaff && hasCriticalAlerts && !prefs.hidden.includes("critical-alerts") && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">Precisa de atenção</CardTitle>
            <Badge variant="destructive" className="ml-auto">{criticalAlerts.length}</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <MetricsCard metrics={criticalAlerts} loading={metrics.loading || seg.loading} />
          </CardContent>
        </Card>
      )}

      {/* 2) KPIs essenciais (5) */}
      {isStaff && !prefs.hidden.includes("executive-kpis") && (
        <MetricsCard metrics={executiveMetrics} loading={metrics.loading || seg.loading} />
      )}

      {/* 3) Ações rápidas do gestor */}
      {isStaff && !prefs.hidden.includes("quick-actions") && <ManagerQuickActions />}

      {/* 4) Painel prioritário — 2 colunas com cards que exigem monitoramento diário */}
      {isStaff && !prefs.hidden.includes("priority-grid") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ColdChamberStatusCard />
          <MaintenanceSummaryCard />
          {(vacationSummary.expired > 0 || vacationSummary.critical > 0 || vacationAlerts.length > 0) && (
            <div className="lg:col-span-2">{renderVacationsCard()}</div>
          )}
          <div className="lg:col-span-2">
            <SupplierOffersCard />
          </div>
        </div>
      )}

      {/* 5) Gráficos analíticos */}
      {isStaff && !prefs.hidden.includes("analytics-charts") && (
        <Suspense fallback={<Card><CardContent className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></CardContent></Card>}>
          <AnalyticsCharts />
        </Suspense>
      )}

      {/* 6) Pendências de assinatura */}
      {isStaff && !prefs.hidden.includes("pending-assignments") && <PendingAssignmentsCard />}

      {/* 7) Detalhes por segmento — sanfona (fechada por padrão) */}
      {isStaff && (
        <div className="space-y-2 pt-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium px-1">
            Mais detalhes por área
          </div>
          {orderedSections.map((id) => {
            const info = SECTION_INFO[id];
            const badge = sectionBadge(id);
            return (
              <DashboardSection
                key={id}
                id={id}
                title={info.title}
                description={info.description}
                icon={info.icon}
                open={isOpen(id)}
                onToggleOpen={() => toggleSection(id)}
                isFavorite={prefs.favoriteSection === id}
                onToggleFavorite={() => setFavoriteSection(id)}
                badge={badge?.value}
                badgeVariant={badge?.variant}
              >
                {renderSection(id)}
              </DashboardSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
