import { useEffect, useState, useCallback, lazy, Suspense, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader2, ListChecks, ClipboardCheck, UserCheck, Thermometer, PackageCheck, Droplet, Bug, Wrench, ChevronLeft, MapPin, RefreshCw, ShieldAlert, Megaphone, Plus, Boxes, AlertOctagon, Truck, ArrowLeftRight, AlertTriangle, Siren } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import LabCoatIcon from "@/components/icons/LabCoatIcon";
import AnnouncementsManagerPanel from "@/components/announcements/AnnouncementsManagerPanel";
import QuickInfractionForm from "@/components/evaluations/QuickInfractionForm";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";

import { useStoreGeofence } from "@/hooks/useStoreGeofence";
import EmployeeChecklists from "@/components/checklists/EmployeeChecklists";
import ChecklistsFullPanel from "@/components/checklists/ChecklistsFullPanel";
import { NutriDailyChecklist } from "@/components/nutricontrol/NutriDailyChecklist";
import { NutriTemperatureControl } from "@/components/nutricontrol/NutriTemperatureControl";
import { NutriMerchandiseControl } from "@/components/nutricontrol/NutriMerchandiseControl";
import { NutriOilQualityControl } from "@/components/nutricontrol/NutriOilQualityControl";
import { NutriOilDisposalControl } from "@/components/nutricontrol/NutriOilDisposalControl";
import { NutriPestControl } from "@/components/nutricontrol/NutriPestControl";
import { NutriMaintenanceControl } from "@/components/nutricontrol/NutriMaintenanceControl";

// Lazy: páginas inteiras renderizadas dentro do bottom sheet
const InventoryCountsPage = lazy(() => import("@/pages/InventoryCounts"));
const OccurrencesPage = lazy(() => import("@/pages/Occurrences"));
const AnnouncementsPage = lazy(() => import("@/pages/Announcements"));
const ChecklistsPage = lazy(() => import("@/pages/Checklists"));
const NutricontrolPage = lazy(() => import("@/pages/Nutricontrol"));
const TasksPage = lazy(() => import("@/pages/Tasks"));
const InventoryReceivingPage = lazy(() => import("@/pages/InventoryReceiving"));
const InventoryTransfersPage = lazy(() => import("@/pages/InventoryTransfers"));
const FactoryRequestsPage = lazy(() => import("@/pages/FactoryRequests"));

type Periodicity = "once" | "daily" | "weekly" | "biweekly" | "monthly";
type TabKey = "checklists" | "tasks" | "nutricontrol" | "manutencao" | "avisos" | "infracao" | "estoque" | "ocorrencias" | "recebimento" | "transferencias" | "fabrica";

interface Task {
  id: string;
  title: string;
  description: string | null;
  periodicity: Periodicity;
}

interface TaskWithStatus extends Task {
  period_start: string;
  completion_id: string | null;
}

const PERIOD_LABEL: Record<Periodicity, string> = {
  once: "Somente uma vez",
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

const PERIOD_VARIANT: Record<Periodicity, "default" | "secondary" | "outline"> = {
  once: "outline",
  daily: "default",
  weekly: "secondary",
  biweekly: "outline",
  monthly: "outline",
};

const TAB_TITLES: Record<TabKey, string> = {
  checklists: "Check-lists",
  tasks: "Tarefas",
  nutricontrol: "NutriControle",
  manutencao: "Manutenção",
  avisos: "Avisos e agenda",
  infracao: "Registrar infração",
  estoque: "Estoque",
  ocorrencias: "Ocorrências",
  recebimento: "Recebimento",
  transferencias: "Transferências",
  fabrica: "Solicitações ao CD",
};

export default function EmployeeTasksCard({ employeeId, storeId, allocatedStoreId }: {
  employeeId: string;
  storeId: string;
  allocatedStoreId?: string | null;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAdmin, isManager } = useAuth();

  // Usa as roles do contexto (que respeitam impersonação): no modo
  // "Visualizar como colaborador" o gestor deve ver exatamente o que o
  // colaborador vê — sem as abas administrativas "+Infração" e "Avisos".
  // Bypass de geofence: admins e gestores podem acessar fora das lojas.
  const bypassGeofence = isAdmin || isManager;
  // Botão "Registrar infração" deve aparecer apenas para admin e gestor
  const canRegisterInfraction = isAdmin || isManager;
  // Estoque e Ocorrências: apenas colaboradores comuns (não admin nem gestor)
  const canSeeAdminShortcuts = !isAdmin && !isManager;
  const [activeTab, setActiveTab] = useState<TabKey>("tasks");
  const [mobileTab, setMobileTab] = useState<TabKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskWithStatus[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const geofence = useStoreGeofence([storeId, allocatedStoreId]);

  const load = useCallback(async () => {
    setLoading(true);
    const storeIds = [storeId, allocatedStoreId].filter(Boolean) as string[];

    const { data: rawTasks } = await supabase
      .from("employee_tasks")
      .select("id, title, description, periodicity, scope, employee_id, store_id")
      .eq("is_active", true)
      .or(
        `and(scope.eq.employee,employee_id.eq.${employeeId}),` +
          `and(scope.eq.store,store_id.in.(${storeIds.join(",") || "00000000-0000-0000-0000-000000000000"}))`,
      );

    const list = (rawTasks ?? []) as Task[];
    if (list.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const today = new Date();
    const startOf = (p: Periodicity): string => {
      const d = new Date(today);
      if (p === "once") return "1970-01-01";
      if (p === "daily") return d.toISOString().slice(0, 10);
      if (p === "weekly") {
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1 - day);
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      }
      if (p === "biweekly") {
        const day = d.getDate();
        if (day <= 15) return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
        return new Date(d.getFullYear(), d.getMonth(), 16).toISOString().slice(0, 10);
      }
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    };

    const taskIds = list.map((t) => t.id);
    const { data: comps } = await supabase
      .from("employee_task_completions")
      .select("id, task_id, period_start")
      .eq("employee_id", employeeId)
      .in("task_id", taskIds);

    const result: TaskWithStatus[] = list.map((t) => {
      const ps = startOf(t.periodicity);
      const comp = (comps ?? []).find((c: any) => c.task_id === t.id && c.period_start === ps);
      return { ...t, period_start: ps, completion_id: comp?.id ?? null };
    });
    result.sort((a, b) => {
      if (!!a.completion_id !== !!b.completion_id) return a.completion_id ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
    setTasks(result);
    setLoading(false);
  }, [employeeId, storeId, allocatedStoreId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (task: TaskWithStatus, checked: boolean) => {
    setBusyIds((s) => new Set(s).add(task.id));
    if (checked) {
      const { data, error } = await supabase
        .from("employee_task_completions")
        .insert({ task_id: task.id, employee_id: employeeId, period_start: task.period_start })
        .select("id")
        .maybeSingle();
      if (error) {
        toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
      } else if (data) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completion_id: data.id } : t)));
      }
    } else if (task.completion_id) {
      const { error } = await supabase
        .from("employee_task_completions")
        .delete()
        .eq("id", task.completion_id);
      if (error) {
        toast({ title: "Erro ao desmarcar", description: error.message, variant: "destructive" });
      } else {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completion_id: null } : t)));
      }
    }
    setBusyIds((s) => {
      const n = new Set(s);
      n.delete(task.id);
      return n;
    });
  };

  // Conteúdo de cada aba reutilizável (mobile + desktop)
  const renderTasksContent = () => (
    <div className="space-y-3">
      {bypassGeofence && (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link to="/tarefas">
              <Plus className="h-4 w-4 mr-2" />
              Nova tarefa
            </Link>
          </Button>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nenhuma tarefa atribuída no momento.</p>
      ) : (
        <ul className="divide-y">
          {tasks.map((t) => {
            const done = !!t.completion_id;
            const busy = busyIds.has(t.id);
            return (
              <li key={t.id} className="py-3 flex items-start gap-3">
                <Checkbox
                  checked={done}
                  disabled={busy}
                  onCheckedChange={(v) => toggle(t, !!v)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </span>
                    <Badge variant={PERIOD_VARIANT[t.periodicity]} className="text-[10px]">
                      {PERIOD_LABEL[t.periodicity]}
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const renderChecklistsContent = () => bypassGeofence ? <ChecklistsFullPanel /> : <EmployeeChecklists />;

  const renderNutricontrolContent = () => (
    <Tabs defaultValue="higiene" className="w-full">
      <div className="sm:overflow-visible">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-1 w-full h-auto p-1 bg-muted">
          <TabsTrigger value="higiene" className="flex flex-col sm:flex-row items-center justify-center gap-2 py-5 sm:py-4 px-2 text-base sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <UserCheck className="h-7 w-7 sm:h-6 sm:w-6" /><span>Higiene</span>
          </TabsTrigger>
          <TabsTrigger value="temperatura" className="flex flex-col sm:flex-row items-center justify-center gap-2 py-5 sm:py-4 px-2 text-base sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Thermometer className="h-7 w-7 sm:h-6 sm:w-6" /><span>Temperatura</span>
          </TabsTrigger>
          <TabsTrigger value="mercadoria" className="flex flex-col sm:flex-row items-center justify-center gap-2 py-5 sm:py-4 px-2 text-base sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <PackageCheck className="h-7 w-7 sm:h-6 sm:w-6" /><span>Mercadoria</span>
          </TabsTrigger>
          <TabsTrigger value="oleo" className="flex flex-col sm:flex-row items-center justify-center gap-2 py-5 sm:py-4 px-2 text-base sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Droplet className="h-7 w-7 sm:h-6 sm:w-6" /><span>Óleo</span>
          </TabsTrigger>
          <TabsTrigger value="pragas" className="flex flex-col sm:flex-row items-center justify-center gap-2 py-5 sm:py-4 px-2 text-base sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Bug className="h-7 w-7 sm:h-6 sm:w-6" /><span>Pragas</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="higiene" className="mt-4">
        <NutriDailyChecklist currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
      </TabsContent>
      <TabsContent value="temperatura" className="mt-4">
        <NutriTemperatureControl currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
      </TabsContent>
      <TabsContent value="mercadoria" className="mt-4">
        <NutriMerchandiseControl currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
      </TabsContent>
      <TabsContent value="oleo" className="mt-4">
        <NutriOilQualityControl currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
        <NutriOilDisposalControl storeId={allocatedStoreId ?? storeId} />
      </TabsContent>
      <TabsContent value="pragas" className="mt-4">
        <NutriPestControl currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
      </TabsContent>
    </Tabs>
  );

  const renderManutencaoContent = () => (
    <NutriMaintenanceControl currentDate={new Date()} storeId={allocatedStoreId ?? storeId} />
  );

  const renderAvisosContent = () => (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
      <AnnouncementsPage />
    </Suspense>
  );

  const renderInfractionContent = (closeMobile?: () => void) => (
    <QuickInfractionForm
      onSaved={closeMobile}
      onCancel={closeMobile}
      showCancel={!!closeMobile}
    />
  );

  const renderTabContent = (key: TabKey): ReactNode => {
    if (key === "checklists") return renderChecklistsContent();
    if (key === "tasks") return renderTasksContent();
    if (key === "manutencao") return renderManutencaoContent();
    if (key === "avisos") return renderAvisosContent();
    if (key === "infracao") return renderInfractionContent(isMobile ? () => setMobileTab(null) : undefined);
    if (key === "estoque") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <InventoryCountsPage />
      </Suspense>
    );
    if (key === "ocorrencias") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <OccurrencesPage />
      </Suspense>
    );
    if (key === "recebimento") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <InventoryReceivingPage />
      </Suspense>
    );
    if (key === "transferencias") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <InventoryTransfersPage />
      </Suspense>
    );
    if (key === "fabrica") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <FactoryRequestsPage />
      </Suspense>
    );
    return renderNutricontrolContent();
  };

  // No bottom sheet (mobile), Check-lists / NutriControle / Tarefas abrem a página inteira
  // (mesmo padrão de Avisos / Estoque / Ocorrências). Manutenção continua embutida pois
  // não possui rota própria.
  const renderSheetContent = (key: TabKey): ReactNode => {
    if (key === "checklists") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <ChecklistsPage />
      </Suspense>
    );
    if (key === "nutricontrol") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <NutricontrolPage />
      </Suspense>
    );
    if (key === "tasks") return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
        <TasksPage />
      </Suspense>
    );
    return renderTabContent(key);
  };

  // === MOBILE: botões grandes + Sheet full-screen ===
  if (isMobile) {
    const buttons: { key: TabKey; icon: ReactNode; label: string }[] = [
      { key: "checklists", icon: <ClipboardCheck className="!h-7 !w-7 text-success" />, label: "Check-lists" },
      { key: "nutricontrol", icon: <LabCoatIcon className="!h-7 !w-7 text-emerald-600" />, label: "NutriControle" },
      { key: "manutencao", icon: <Wrench className="!h-7 !w-7 text-warning" />, label: "Manutenção" },
      { key: "tasks", icon: <ListChecks className="!h-7 !w-7 text-accent" />, label: "Tarefas" },
    ];
    const blocked = !bypassGeofence && !geofence.loading && !geofence.inside;

    const handleClick = (key: TabKey) => {
      if (!bypassGeofence && geofence.loading) return;
      if (blocked) {
        toast({
          title: "Disponível somente na loja",
          description: geofence.reason ?? undefined,
        });
        return;
      }
      setMobileTab(key);
    };

    const showLoading = !bypassGeofence && geofence.loading;
    const dimmed = blocked || showLoading;

    return (
      <>
        <div className="grid grid-cols-3 gap-2">
          {canRegisterInfraction && (
            <Button
              variant="outline"
              onClick={() => setMobileTab("infracao")}
              className="aspect-square h-auto py-2 px-1 flex flex-col items-center justify-center gap-1.5 text-xs font-medium border-2 transition-all whitespace-normal text-center leading-tight text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
            >
              <ShieldAlert className="!h-7 !w-7" />
              <span>+Infração</span>
            </Button>
          )}
          {bypassGeofence && (
            <Button
              variant="outline"
              onClick={() => setMobileTab("avisos")}
              className="aspect-square h-auto py-2 px-1 flex flex-col items-center justify-center gap-1.5 text-xs font-medium border-2 transition-all whitespace-normal text-center leading-tight hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              <Megaphone className="!h-7 !w-7 text-primary" />
              <span>Avisos</span>
            </Button>
          )}
          {buttons.map((b) => (
            <Button
              key={b.key}
              variant="outline"
              onClick={() => handleClick(b.key)}
              aria-disabled={dimmed}
              className={`aspect-square h-auto py-2 px-1 flex flex-col items-center justify-center gap-1.5 text-xs font-medium border-2 transition-all whitespace-normal text-center leading-tight ${
                dimmed
                  ? "opacity-60 hover:bg-background hover:text-foreground hover:border-input"
                  : "hover:bg-primary hover:text-primary-foreground hover:border-primary"
              }`}
            >
              {showLoading ? <Loader2 className="!h-7 !w-7 animate-spin" /> : b.icon}
              <span>{b.label}</span>
            </Button>
          ))}
          {canSeeAdminShortcuts && (
            <>
              {([
                { key: "estoque" as TabKey, icon: <Boxes className="!h-7 !w-7 text-indigo-500" />, label: "Contagem" },
                { key: "ocorrencias" as TabKey, icon: <Siren className="!h-7 !w-7 text-rose-500" />, label: "Ocorrências" },
                { key: "recebimento" as TabKey, icon: <PackageCheck className="!h-7 !w-7 text-sky-500" />, label: "Recebimento" },
                { key: "transferencias" as TabKey, icon: <ArrowLeftRight className="!h-7 !w-7 text-violet-500" />, label: "Transferências" },
                { key: "fabrica" as TabKey, icon: <AlertTriangle className="!h-7 !w-7 text-amber-500" />, label: "Requisição" },
              ]).map((b) => (
                <Button
                  key={b.key}
                  variant="outline"
                  onClick={() => {
                    if (!bypassGeofence && geofence.loading) return;
                    if (blocked) {
                      toast({ title: "Disponível somente na loja", description: geofence.reason ?? undefined });
                      return;
                    }
                    setMobileTab(b.key);
                  }}
                  aria-disabled={dimmed}
                  className={`aspect-square h-auto py-2 px-1 flex flex-col items-center justify-center gap-1.5 text-xs font-medium border-2 transition-all whitespace-normal text-center leading-tight ${
                    dimmed
                      ? "opacity-60 hover:bg-background hover:text-foreground hover:border-input"
                      : "hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  }`}
                >
                  {showLoading ? <Loader2 className="!h-7 !w-7 animate-spin" /> : b.icon}
                  <span>{b.label}</span>
                </Button>
              ))}
            </>
          )}
        </div>

        <Sheet open={mobileTab !== null} onOpenChange={(o) => { if (!o) setMobileTab(null); }}>
          <SheetContent
            side="bottom"
            className="h-[100dvh] w-full max-w-full p-0 sm:max-w-full flex flex-col gap-0"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-background sticky top-0 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileTab(null)}
                aria-label="Voltar"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <h2 className="text-lg font-semibold text-foreground">
                {mobileTab ? TAB_TITLES[mobileTab] : ""}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {mobileTab && renderSheetContent(mobileTab)}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // === DESKTOP: comportamento original com Tabs inline ===
  const blocked = !bypassGeofence && !geofence.loading && !geofence.inside;

  const handleTabChange = (v: string) => {
    if (!bypassGeofence && geofence.loading) return;
    if (blocked) {
      toast({
        title: "Disponível somente na loja",
        description: geofence.reason ?? undefined,
      });
      return;
    }
    setActiveTab(v as TabKey);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList
            className={`grid ${
              canSeeAdminShortcuts
                ? bypassGeofence ? "grid-cols-11" : canRegisterInfraction ? "grid-cols-10" : "grid-cols-9"
                : bypassGeofence ? "grid-cols-6" : canRegisterInfraction ? "grid-cols-5" : "grid-cols-4"
            } gap-1 w-full h-auto p-1 bg-muted rounded-md`}
          >
            {canRegisterInfraction && (
              <TabsTrigger
                value="infracao"
                className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground data-[state=active]:shadow-md transition-all text-destructive"
              >
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <span className="truncate">+Infração</span>
              </TabsTrigger>
            )}
            {bypassGeofence && (
              <TabsTrigger
                value="__nav_avisos"
                onClick={(e) => { e.preventDefault(); navigate("/avisos"); }}
                className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
              >
                <Megaphone className="h-6 w-6 shrink-0" />
                <span className="truncate">Avisos</span>
              </TabsTrigger>
            )}
            <TabsTrigger
              value="checklists"
              className={`flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all ${blocked ? "opacity-60" : ""}`}
            >
              <ClipboardCheck className="h-6 w-6 shrink-0" />
              <span className="truncate">Check-lists</span>
            </TabsTrigger>
            <TabsTrigger
              value="nutricontrol"
              className={`flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all ${blocked ? "opacity-60" : ""}`}
            >
              <LabCoatIcon className="h-6 w-6 shrink-0" />
              <span className="truncate">NutriControle</span>
            </TabsTrigger>
            <TabsTrigger
              value="manutencao"
              className={`flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all ${blocked ? "opacity-60" : ""}`}
            >
              <Wrench className="h-6 w-6 shrink-0" />
              <span className="truncate">Manutenção</span>
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className={`flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all ${blocked ? "opacity-60" : ""}`}
            >
              <ListChecks className="h-6 w-6 shrink-0" />
              <span className="truncate">Tarefas</span>
            </TabsTrigger>
            {canSeeAdminShortcuts && (
              <>
                <TabsTrigger
                  value="__nav_estoque"
                  onClick={(e) => { e.preventDefault(); navigate("/inventario"); }}
                  className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <Boxes className="h-6 w-6 shrink-0" />
                  <span className="truncate">Contagem</span>
                </TabsTrigger>
                <TabsTrigger
                  value="__nav_ocorrencias"
                  onClick={(e) => { e.preventDefault(); navigate("/ocorrencias"); }}
                  className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <Siren className="h-6 w-6 shrink-0" />
                  <span className="truncate">Ocorrências</span>
                </TabsTrigger>
                <TabsTrigger
                  value="__nav_recebimento"
                  onClick={(e) => { e.preventDefault(); navigate("/recebimento"); }}
                  className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <PackageCheck className="h-6 w-6 shrink-0" />
                  <span className="truncate">Recebimento</span>
                </TabsTrigger>
                <TabsTrigger
                  value="__nav_transferencias"
                  onClick={(e) => { e.preventDefault(); navigate("/transferencias"); }}
                  className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <ArrowLeftRight className="h-6 w-6 shrink-0" />
                  <span className="truncate">Transferências</span>
                </TabsTrigger>
                <TabsTrigger
                  value="__nav_fabrica"
                  onClick={(e) => { e.preventDefault(); navigate("/solicitacoes-fabrica"); }}
                  className="flex items-center justify-center gap-2 py-5 px-2 text-sm xl:text-base font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <AlertTriangle className="h-6 w-6 shrink-0" />
                  <span className="truncate">Requisição</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="tasks">{renderTasksContent()}</TabsContent>
          <TabsContent value="checklists">{renderChecklistsContent()}</TabsContent>
          <TabsContent value="nutricontrol">{renderNutricontrolContent()}</TabsContent>
          <TabsContent value="manutencao">{renderManutencaoContent()}</TabsContent>
          <TabsContent value="avisos">{renderAvisosContent()}</TabsContent>
          {canRegisterInfraction && (
            <TabsContent value="infracao">{renderInfractionContent()}</TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
