import { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, UserCircle, Plane, Shirt, Award, AlertTriangle, Plus, MessageSquare, Clock, CalendarClock, ChevronLeft, ChevronRight, FileText, Home, Flame } from "lucide-react";
import EmployeeTasksCard from "@/components/tasks/EmployeeTasksCard";
import BirthdaysCard from "@/components/employees/BirthdaysCard";
import TimeClockPunch from "@/components/timeclock/TimeClockPunch";
import FaceEnrollment from "@/components/timeclock/FaceEnrollment";
import EmployeeTimeClockCards from "@/components/timeclock/EmployeeTimeClockCards";
import EmployeePunchHistory from "@/components/timeclock/EmployeePunchHistory";
import PushNotificationSettings from "@/components/auth/PushNotificationSettings";
import WhatsAppOptOutCard from "@/components/employees/WhatsAppOptOutCard";

import UpcomingAppointmentsCard from "@/components/announcements/UpcomingAppointmentsCard";
import EmployeeDocumentsTab from "@/components/auth/EmployeeDocumentsTab";
import ProfileAvatarUpload from "@/components/auth/ProfileAvatarUpload";
import BirthdayBanner from "@/components/employees/BirthdayBanner";
import ClimatePendingBanner from "@/components/climate/ClimatePendingBanner";
import DocumentsPendingBanner from "@/components/auth/DocumentsPendingBanner";
import EmployeeInfractionsAlert from "@/components/evaluations/EmployeeInfractionsAlert";
import EmployeeMaintenanceAlert from "@/components/nutricontrol/EmployeeMaintenanceAlert";
import ShiftSwapPendingBanner from "@/components/schedules/ShiftSwapPendingBanner";
import ShiftSwapManagerBanner from "@/components/schedules/ShiftSwapManagerBanner";
import NoticesStack from "@/components/employees/NoticesStack";
import ShiftSwapCard from "@/components/schedules/ShiftSwapCard";
import { toast } from "@/hooks/use-toast";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGuidedTour } from "@/hooks/useGuidedTour";
import { getEmployeeAreaTourSteps } from "@/lib/tours/employeeAreaTour";
import { HelpCircle } from "lucide-react";

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  store_id: string;
  allocated_store_id: string | null;
  admission_date: string | null;
  cpf: string | null;
  birth_date: string | null;
  exempt_from_timeclock: boolean | null;
  avatar_path: string | null;
  work_schedule?: string | null;
}

interface Request {
  id: string;
  request_type: string;
  subject: string;
  description: string | null;
  status: string;
  hr_response: string | null;
  responded_at: string | null;
  created_at: string;
}

const REQUEST_TYPES = [
  { value: "vacation", label: "Solicitação de Férias" },
  { value: "data_update", label: "Atualização Cadastral" },
  { value: "document", label: "Solicitação de Documento" },
  { value: "other", label: "Outros" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendente", variant: "outline" },
  approved: { label: "Aprovada", variant: "default" },
  rejected: { label: "Rejeitada", variant: "destructive" },
  in_review: { label: "Em análise", variant: "secondary" },
};

interface EmployeeAreaProps {
  /** Quando definido, renderiza a área do colaborador correspondente a este user_id (modo visualização para gestores). */
  impersonateUserId?: string;
  /** Modo "Área do Gestor": esconde bottom nav, Controle de Gás e abas Ponto/Escala; troca abas por cards. */
  managerView?: boolean;
}

export default function EmployeeArea({ impersonateUserId, managerView = false }: EmployeeAreaProps = {}) {
  const { user, isAdmin, isManager, isSupplier, isImpersonating, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const focusParam = new URLSearchParams(location.search).get("focus");
  // Quando estamos dentro do ImpersonationProvider, user.id já é o do colaborador alvo.
  const effectiveUserId = impersonateUserId ?? user?.id ?? null;
  const isStaff = (isAdmin || isManager) && !isImpersonating;
  const [loading, setLoading] = useState(true);
  const [evaluationsOpen, setEvaluationsOpen] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [vacations, setVacations] = useState<any[]>([]);
  const [pendingUniforms, setPendingUniforms] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [teamAvgScore, setTeamAvgScore] = useState<number | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ request_type: "vacation", subject: "", description: "" });
  const [scheduleWeekStart, setScheduleWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [activeTab, setActiveTab] = useState<string>(managerView ? "vacation" : "timeclock");
  const [headerCompact, setHeaderCompact] = useState(false);

  useEffect(() => {
    // Histerese para evitar oscilação: encolhe ao passar de 90, só expande ao voltar abaixo de 30
    const onScroll = () => {
      const y = window.scrollY;
      setHeaderCompact((prev) => (prev ? y > 30 : y > 90));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Tour guiado de boas-vindas — só dispara para o próprio colaborador (nunca em impersonate de gestor)
  const { start: startTour } = useGuidedTour({
    tourKey: "employee-area-v1",
    steps: getEmployeeAreaTourSteps(),
    autoStart: !impersonateUserId && !isStaff,
    ready: !loading && !!employee,
  });
  const [schedule, setSchedule] = useState<Array<{ id: string; schedule_date: string; is_day_off: boolean; is_home_office: boolean; start_time: string | null; end_time: string | null; break_start: string | null; break_end: string | null; break_start_2: string | null; break_end_2: string | null }>>([]);

  const loadAvatar = async (emp: Employee) => {
    // 1) Prioriza foto de perfil escolhida pelo colaborador
    if (emp.avatar_path) {
      const { data } = await supabase.storage
        .from("time-clock-photos")
        .createSignedUrl(emp.avatar_path, 60 * 60);
      if (data?.signedUrl) {
        setAvatarUrl(data.signedUrl);
        return;
      }
    }
    // 2) Fallback: foto do cadastro de biometria facial
    const { data: face } = await supabase
      .from("employee_face_descriptors")
      .select("photo_path")
      .eq("employee_id", emp.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!face?.photo_path) {
      setAvatarUrl(null);
      return;
    }
    const { data } = await supabase.storage
      .from("time-clock-photos")
      .createSignedUrl(face.photo_path, 60 * 60);
    setAvatarUrl(data?.signedUrl ?? null);
  };

  const loadAll = async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    const { data: emp } = await supabase
      .from("employees")
      .select("id, full_name, email, phone, position, store_id, allocated_store_id, admission_date, cpf, birth_date, exempt_from_timeclock, avatar_path, contract_type, work_schedule")
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    if (!emp) {
      setEmployee(null);
      setLoading(false);
      return;
    }
    setEmployee(emp);

    const [{ data: vac }, { data: pend }, { data: evals }, { data: reqs }] = await Promise.all([
      supabase
        .from("vacation_schedules")
        .select("id, start_date, end_date, days_count, sell_days, status, notice_pdf_url, notice_generated_at, notice_acknowledged_at, acquisition_start, acquisition_end")
        .eq("employee_id", emp.id)
        .order("start_date", { ascending: false }),
      supabase.rpc("employee_uniform_pending", { _employee_id: emp.id }),
      supabase
        .from("evaluations")
        .select("id, final_score, status, general_notes, created_at, evaluation_cycles(name), evaluation_scores(score, evaluation_criteria(name, weight))")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("employee_requests")
        .select("*")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false }),
    ]);

    setVacations(vac ?? []);
    setPendingUniforms((pend ?? []).filter((p: any) => p.pending > 0));
    setEvaluations(evals ?? []);
    setRequests((reqs ?? []) as Request[]);
    loadAvatar(emp);

    // Se for gerente, calcular média da última nota de cada colaborador ativo da loja
    const isManagerPos = (emp.position ?? "").toUpperCase().includes("GERENTE");
    if (isManagerPos) {
      const storeIds = [emp.store_id, emp.allocated_store_id].filter(Boolean) as string[];
      const { data: team } = await supabase
        .from("employees")
        .select("id")
        .eq("status", "active")
        .or(storeIds.map((s) => `store_id.eq.${s},allocated_store_id.eq.${s}`).join(","));
      const teamIds = (team ?? []).map((t: any) => t.id).filter((id: string) => id !== emp.id);
      if (teamIds.length) {
        const { data: teamEvals } = await supabase
          .from("evaluations")
          .select("employee_id, final_score, created_at")
          .in("employee_id", teamIds)
          .in("status", ["completed", "finalized"])
          .not("final_score", "is", null)
          .order("created_at", { ascending: false });
        const lastByEmp = new Map<string, number>();
        for (const ev of teamEvals ?? []) {
          if (!lastByEmp.has(ev.employee_id)) lastByEmp.set(ev.employee_id, Number(ev.final_score));
        }
        const scores = Array.from(lastByEmp.values()).filter((n) => !isNaN(n));
        setTeamAvgScore(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null);
      } else {
        setTeamAvgScore(null);
      }
    } else {
      setTeamAvgScore(null);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [effectiveUserId]);

  // Scroll automático ao card de aceite quando vindo da notificação
  useEffect(() => {
    if (loading || !employee || focusParam !== "timesheet") return;
    const t = setTimeout(() => {
      const el = document.getElementById("timesheet-acceptance");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(t);
  }, [loading, employee?.id, focusParam]);

  // Carrega a escala da semana selecionada
  useEffect(() => {
    if (!employee) return;
    const weekEnd = addDays(scheduleWeekStart, 6);
    (async () => {
      const { data } = await supabase
        .from("work_schedules")
        .select("id, schedule_date, is_day_off, is_home_office, start_time, end_time, break_start, break_end, break_start_2, break_end_2")
        .eq("employee_id", employee.id)
        .gte("schedule_date", format(scheduleWeekStart, "yyyy-MM-dd"))
        .lte("schedule_date", format(weekEnd, "yyyy-MM-dd"))
        .order("schedule_date");
      setSchedule((data ?? []) as any);
    })();
  }, [employee?.id, scheduleWeekStart]);

  const submitRequest = async () => {
    if (!employee || !form.subject.trim()) {
      toast({ title: "Preencha o assunto", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("employee_requests").insert({
      employee_id: employee.id,
      request_type: form.request_type,
      subject: form.subject.trim(),
      description: form.description.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Solicitação enviada" });
    setForm({ request_type: "vacation", subject: "", description: "" });
    loadAll();
  };

  if (authLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (isSupplier) {
    return <Navigate to="/fornecedor/painel" replace />;
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 border-2 border-primary/30">
            <AvatarFallback className="bg-primary/10 text-primary">
              <UserCircle className="h-7 w-7" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Área do Colaborador</h1>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Sua conta de usuário ainda não está vinculada a um cadastro de colaborador. Solicite ao RH para fazer o vínculo.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isManagerPosition = (employee.position ?? "").toUpperCase().includes("GERENTE");
  const ownScore = evaluations[0]?.final_score;
  const lastScore = isManagerPosition ? (teamAvgScore ?? ownScore) : ownScore;

  return (
    <div className={`space-y-3 md:space-y-6 ${managerView ? "pb-6" : "pb-28 md:pb-6"}`}>
      {/* Header card unificado — sticky compacto no mobile */}
      <Card data-tour="employee-header" className="overflow-hidden border-primary/25 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm sticky top-12 md:top-14 z-20 md:relative md:top-auto md:bg-card md:backdrop-blur-0 -mx-4 sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x">
        <CardContent className={`transition-all duration-200 ${headerCompact ? "p-2 md:p-6" : "p-4 md:p-6"}`}>
          <div className={`flex items-center gap-3 md:gap-4 transition-all`}>
            <div className={`transition-all ${headerCompact ? "scale-75 -ml-2 md:scale-100 md:ml-0" : ""}`}>
              <ProfileAvatarUpload
                employeeId={employee.id}
                hasAvatar={!!employee.avatar_path}
                avatarUrl={avatarUrl}
                fullName={employee.full_name}
                onChanged={loadAll}
              />
            </div>
            <div className="min-w-0 flex-1">
              {!headerCompact && (
                <p className="text-sm md:text-xs text-muted-foreground uppercase tracking-wide">Olá,</p>
              )}
              <h1 className={`font-bold leading-tight text-card-foreground truncate transition-all ${headerCompact ? "text-base md:text-2xl" : "text-xl md:text-2xl"}`}>
                {employee.full_name.split(" ").slice(0, 2).join(" ")}
              </h1>
              <p className="hidden md:block text-sm text-muted-foreground truncate">{employee.position ?? "Colaborador"}</p>
            </div>
            {lastScore != null && (
              <button
                type="button"
                onClick={() => isStaff ? navigate("/avaliacoes") : setEvaluationsOpen(true)}
                className="flex items-center gap-1.5 shrink-0 text-warning rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors hover:bg-warning/10 active:bg-warning/15 focus:outline-none focus:ring-2 focus:ring-warning/40"
                aria-label="Ver avaliações"
              >
                <Award className="h-5 w-5" />
                <span className={`font-bold leading-none transition-all ${headerCompact ? "text-base md:text-xl" : "text-xl"}`}>
                  {Number(lastScore).toFixed(1)}
                </span>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <NoticesStack>
        <ClimatePendingBanner />
        <BirthdayBanner birthDate={employee.birth_date} fullName={employee.full_name} />
        <EmployeeInfractionsAlert employeeId={employee.id} />
        <DocumentsPendingBanner
          employeePosition={employee.position}
          employeeContractType={(employee as any).contract_type}
        />
        <EmployeeMaintenanceAlert />
        <ShiftSwapPendingBanner />
        <ShiftSwapManagerBanner />
        <UpcomingAppointmentsCard
          employeeId={employee.id}
          storeId={employee.store_id}
          allocatedStoreId={employee.allocated_store_id}
        />
      </NoticesStack>

      {/* Pendências de assinatura agora ficam todas concentradas na aba "Docs"
          (junto ao contrato), evitando duplicidade entre o banner de alerta
          e cards soltos no topo da página. */}


      <BirthdaysCard storeId={employee.store_id} allocatedStoreId={employee.allocated_store_id} />

      <EmployeeTasksCard
        employeeId={employee.id}
        storeId={employee.store_id}
        allocatedStoreId={employee.allocated_store_id}
      />

      {!managerView && (
        <button
          type="button"
          onClick={() => navigate("/financeiro/vale-gas")}
          className="flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground shadow-sm transition-all hover:text-foreground"
        >
          <Flame className="h-4 w-4 text-warning" />
          Controle de Gás
        </button>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div id="employee-tabs-anchor" aria-hidden className="scroll-mt-20" />
        {managerView ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "vacation", icon: Plane, label: "Férias", color: "text-sky-500" },
              { value: "uniforms", icon: Shirt, label: "Uniforme", color: "text-success" },
              { value: "documents", icon: FileText, label: "Docs", color: "text-violet-500" },
            ].map((t) => {
              const active = activeTab === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActiveTab(t.value)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-3 text-center transition-colors min-h-[78px] ${
                    active ? "border-primary/60 ring-1 ring-primary/30 bg-primary/5" : "hover:bg-muted/50 hover:border-primary/40"
                  }`}
                  aria-pressed={active}
                >
                  <Icon className={`h-5 w-5 ${t.color}`} />
                  <span className="text-[11px] sm:text-xs font-medium text-foreground leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
        <TabsList className="hidden md:grid grid-cols-5 w-full h-auto p-1.5 gap-1 border bg-card rounded-xl shadow-sm">
          <TabsTrigger value="timeclock" data-tour="tab-timeclock" className="flex-col gap-1 py-2.5 px-0.5 h-auto text-[11px] md:text-xs font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Clock className="h-5 w-5 md:h-6 md:w-6 text-primary group-data-[state=active]:text-primary-foreground" />
            Ponto
          </TabsTrigger>
          <TabsTrigger value="schedule" data-tour="tab-schedule" className="group flex-col gap-1 py-2.5 px-0.5 h-auto text-[11px] md:text-xs font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <CalendarClock className="h-5 w-5 md:h-6 md:w-6 text-indigo-500 group-data-[state=active]:text-primary-foreground" />
            Escala
          </TabsTrigger>
          <TabsTrigger value="vacation" data-tour="tab-vacation" className="group flex-col gap-1 py-2.5 px-0.5 h-auto text-[11px] md:text-xs font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Plane className="h-5 w-5 md:h-6 md:w-6 text-sky-500 group-data-[state=active]:text-primary-foreground" />
            Férias
          </TabsTrigger>
          <TabsTrigger value="uniforms" data-tour="tab-uniforms" className="group flex-col gap-1 py-2.5 px-0.5 h-auto text-[11px] md:text-xs font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <Shirt className="h-5 w-5 md:h-6 md:w-6 text-success group-data-[state=active]:text-primary-foreground" />
            Uniforme
          </TabsTrigger>
          <TabsTrigger value="documents" data-tour="tab-documents" className="group flex-col gap-1 py-2.5 px-0.5 h-auto text-[11px] md:text-xs font-semibold rounded-lg text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
            <FileText className="h-5 w-5 md:h-6 md:w-6 text-violet-500 group-data-[state=active]:text-primary-foreground" />
            Docs
          </TabsTrigger>
        </TabsList>
        )}

        {!managerView && (
        <TabsContent value="timeclock" className="space-y-4">
          {!employee.exempt_from_timeclock && (
            <TimeClockPunch employeeId={employee.id} storeId={employee.store_id} />
          )}
          {!employee.exempt_from_timeclock && (
            <EmployeeTimeClockCards employeeId={employee.id} />
          )}
          {!employee.exempt_from_timeclock && (
            <EmployeePunchHistory employeeId={employee.id} />
          )}
          <FaceEnrollment employeeId={employee.id} onEnrolled={() => loadAvatar(employee)} />
          <PushNotificationSettings />
          <WhatsAppOptOutCard />
        </TabsContent>
        )}


        {!managerView && (
        <TabsContent value="schedule">
          {!(employee.work_schedule ?? "").toString().trim() ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Você não possui escala definida.
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0"><CalendarClock className="h-5 w-5 text-indigo-500" />Minha escala</CardTitle>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="outline" size="icon" onClick={() => setScheduleWeekStart(addDays(scheduleWeekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setScheduleWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Hoje</Button>
                <Button variant="outline" size="icon" onClick={() => setScheduleWeekStart(addDays(scheduleWeekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                {Array.from({ length: 7 }, (_, i) => addDays(scheduleWeekStart, i)).map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const cell = schedule.find((s) => s.schedule_date === dateStr);
                  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
                  return (
                    <div
                      key={dateStr}
                      className={`rounded-md border p-3 text-center transition-colors ${
                        cell?.is_home_office
                          ? "border-primary/50 bg-primary/10"
                          : cell?.is_day_off
                            ? "border-warning/60 bg-warning/10"
                            : isToday
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card"
                      }`}
                    >
                      <div className={`text-xl font-bold uppercase ${
                        cell?.is_home_office
                          ? "text-primary"
                          : cell?.is_day_off
                            ? "text-warning"
                            : "text-foreground"
                      }`}>
                        {format(d, "EEE", { locale: ptBR })}
                      </div>
                      <div className="text-lg font-semibold">{format(d, "dd/MM")}</div>
                      <div className="mt-2 min-h-[44px] flex flex-col items-center justify-center">
                        {!cell && <span className="text-base text-muted-foreground">—</span>}
                        {cell?.is_day_off && (
                          <Badge className="bg-warning hover:bg-warning text-warning-foreground text-base font-bold px-3 py-1">
                            FOLGA
                          </Badge>
                        )}
                        {cell?.is_home_office && (
                          <Badge className="bg-primary hover:bg-primary text-primary-foreground text-sm font-bold px-2 py-1 gap-1">
                            <Home className="h-3.5 w-3.5" />HOME
                          </Badge>
                        )}
                        {cell && !cell.is_day_off && !cell.is_home_office && cell.start_time && (
                          <div className="text-lg font-bold whitespace-nowrap">
                            {cell.start_time.slice(0,5)}–{cell.end_time?.slice(0,5)}
                          </div>
                        )}
                        {cell && !cell.is_day_off && !cell.is_home_office && !cell.start_time && (
                          <Badge variant="outline">Trabalho</Badge>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
              {schedule.length === 0 && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Nenhuma escala definida para esta semana.
                </p>
              )}
            </CardContent>
          </Card>
          )}
          <ShiftSwapCard
            employeeId={employee.id}
            storeId={employee.allocated_store_id ?? employee.store_id}
            userId={effectiveUserId!}
            fullName={employee.full_name}
          />
        </TabsContent>
        )}

        <TabsContent value="vacation">
          {vacations.filter((v: any) => v.status === "approved" && v.notice_pdf_url && !v.notice_acknowledged_at).map((v: any) => (
            <Card key={`notice-${v.id}`} className="mb-4 border-warning bg-warning/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Aviso prévio de férias — ação necessária
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Suas férias de <strong>{format(new Date(v.start_date), "dd/MM/yyyy")}</strong> a{" "}
                  <strong>{format(new Date(v.end_date), "dd/MM/yyyy")}</strong> ({v.days_count} dias
                  {v.sell_days > 0 ? ` + ${v.sell_days} de abono` : ""}) foram aprovadas.
                </p>
                <p className="text-xs text-muted-foreground">
                  Leia o aviso prévio (art. 135 CLT) e confirme a ciência.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("employee-documents")
                        .createSignedUrl(v.notice_pdf_url, 300);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1" /> Ver aviso (PDF)
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const { error } = await supabase.rpc("acknowledge_vacation_notice", {
                        _schedule_id: v.id,
                        _ip: null,
                      });
                      if (error) {
                        toast({ title: "Erro", description: error.message, variant: "destructive" });
                        return;
                      }
                      toast({ title: "Ciência registrada", description: "Obrigado por confirmar." });
                      loadAll();
                    }}
                  >
                    Confirmo ciência
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle>Histórico de férias</CardTitle></CardHeader>
            <CardContent>
              {vacations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum período registrado.</p>
              ) : (
                <ul className="divide-y">
                  {vacations.map((v: any) => (
                    <li key={v.id} className="py-2 flex items-center justify-between text-sm gap-2 flex-wrap">
                      <span>{format(new Date(v.start_date), "dd/MM/yyyy")} → {format(new Date(v.end_date), "dd/MM/yyyy")} ({v.days_count} dias)</span>
                      <div className="flex items-center gap-2">
                        {v.notice_acknowledged_at && (
                          <Badge variant="outline" className="text-[10px] text-success border-success/50">
                            Aviso ciente
                          </Badge>
                        )}
                        <Badge variant="outline">{v.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uniforms">
          <Card>
            <CardHeader><CardTitle>Uniformes em uso</CardTitle></CardHeader>
            <CardContent>
              {pendingUniforms.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
              ) : (
                <ul className="divide-y">
                  {pendingUniforms.map((p, i) => (
                    <li key={i} className="py-2 flex items-center justify-between text-sm">
                      <span>{p.item_name} ({p.size})</span>
                      <span className="font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-warning" />{p.pending}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <EmployeeDocumentsTab
            employeeId={employee.id}
            employeeName={employee.full_name}
            employeeCpf={employee.cpf}
            employeePosition={employee.position}
            employeeContractType={(employee as any).contract_type}
          />
        </TabsContent>
      </Tabs>

      {/* Bottom Tab Bar fixa — apenas mobile, escondida na Área do Gestor */}
      {!managerView && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-[0_-2px_10px_-4px_rgba(0,0,0,0.1)] dark:bg-[hsl(0_0%_14%)] dark:border-[hsl(0_0%_28%)] dark:shadow-[0_-2px_12px_-2px_rgba(0,0,0,0.6)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5 gap-1 px-1.5 pt-2 pb-1.5">
          {[
            { value: "timeclock", icon: Clock, label: "Ponto", color: "text-primary" },
            { value: "schedule", icon: CalendarClock, label: "Escala", color: "text-indigo-500" },
            { value: "vacation", icon: Plane, label: "Férias", color: "text-sky-500" },
            { value: "uniforms", icon: Shirt, label: "Uniforme", color: "text-success" },
            { value: "documents", icon: FileText, label: "Docs", color: "text-violet-500" },
          ].map((t) => {
            const active = activeTab === t.value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                data-tour={`tab-${t.value}-m`}
                onClick={() => {
                  setActiveTab(t.value);
                  requestAnimationFrame(() => {
                    document
                      .getElementById("employee-tabs-anchor")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground dark:text-[hsl(0_0%_85%)] hover:bg-muted/50"
                }`}
                aria-pressed={active}
              >
                <Icon className={`h-6 w-6 ${active ? "text-primary-foreground" : t.color}`} />
                <span className="leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      )}

      {/* Refazer tutorial — sempre visível na própria área (oculto só em impersonate de gestor) */}
      {!impersonateUserId && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startTour}
            className="text-muted-foreground hover:text-foreground gap-2"
          >
            <HelpCircle className="h-4 w-4" />
            Refazer tutorial
          </Button>
        </div>
      )}

      <Dialog open={evaluationsOpen} onOpenChange={setEvaluationsOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Minhas avaliações
            </DialogTitle>
          </DialogHeader>
          {evaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Você ainda não possui avaliações registradas.
            </p>
          ) : (
            <div className="space-y-3">
              {evaluations.map((e: any) => {
                const scores = (e.evaluation_scores ?? []) as Array<{
                  score: number;
                  evaluation_criteria: { name: string; weight: number } | null;
                }>;
                return (
                  <div key={e.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {e.evaluation_cycles?.name ?? "Avaliação"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(e.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-primary shrink-0">
                        <Award className="h-4 w-4" />
                        <span className="text-lg font-bold leading-none">
                          {Number(e.final_score ?? 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                    {scores.length > 0 && (
                      <ul className="divide-y border-t pt-1">
                        {scores.map((s, idx) => (
                          <li key={idx} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-foreground/90">
                              {s.evaluation_criteria?.name ?? "Critério"}
                            </span>
                            <span className="font-semibold text-foreground shrink-0">
                              {Number(s.score ?? 0).toFixed(1)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.general_notes && (
                      <p className="text-xs text-muted-foreground border-t pt-2 whitespace-pre-wrap">
                        {e.general_notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
