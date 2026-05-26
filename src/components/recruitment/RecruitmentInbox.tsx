import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileCheck2,
  CalendarClock,
  GraduationCap,
  AlertTriangle,
  Megaphone,
  ChevronRight,
  Inbox,
  Sparkles,
} from "lucide-react";

type ActionGroup = {
  key: string;
  icon: typeof Inbox;
  tone: "primary" | "warning" | "danger" | "info" | "success";
  title: string;
  subtitle: string;
  count: number;
  items: { id: string; label: string; meta?: string; jobOpeningId?: string | null }[];
  cta?: { label: string; onClick: () => void };
};

const TONE_STYLES: Record<ActionGroup["tone"], { bg: string; text: string; ring: string; iconBg: string }> = {
  primary: { bg: "bg-primary/5", text: "text-primary", ring: "ring-primary/20", iconBg: "bg-primary/10" },
  warning: { bg: "bg-amber-500/5", text: "text-amber-700 dark:text-amber-400", ring: "ring-amber-500/20", iconBg: "bg-amber-500/10" },
  danger: { bg: "bg-destructive/5", text: "text-destructive", ring: "ring-destructive/20", iconBg: "bg-destructive/10" },
  info: { bg: "bg-cyan-500/5", text: "text-cyan-700 dark:text-cyan-400", ring: "ring-cyan-500/20", iconBg: "bg-cyan-500/10" },
  success: { bg: "bg-emerald-500/5", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-500/20", iconBg: "bg-emerald-500/10" },
};

interface Props {
  /** Quando o usuário clica em um item, abrimos a vaga correspondente no accordion. */
  onFocusJob?: (jobOpeningId: string) => void;
  /** Para CTAs que devem trocar de aba (ex.: agenda, candidaturas). */
  onSwitchTab?: (tab: "applications" | "agenda" | "pipeline" | "training") => void;
}

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (days: number) => {
  const d = today();
  d.setDate(d.getDate() - days);
  return d;
};

export function RecruitmentInbox({ onFocusJob, onSwitchTab }: Props) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ActionGroup[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const startOfToday = today().toISOString();
    const endOfToday = new Date(today().getTime() + 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgoIso = daysAgo(3).toISOString();
    const thirtyDaysAgoIso = daysAgo(30).toISOString();

    // 1) Entrevistas de hoje
    const { data: interviewsToday } = await supabase
      .from("job_candidates")
      .select("id, full_name, interview_scheduled_at, job_opening_id")
      .gte("interview_scheduled_at", startOfToday)
      .lt("interview_scheduled_at", endOfToday)
      .order("interview_scheduled_at", { ascending: true });

    // 2) Dia 7 — decidir contratação
    const { data: day7 } = await supabase
      .from("job_candidates")
      .select("id, full_name, updated_at, job_opening_id")
      .eq("current_stage", "treinamento_dia_7")
      .order("updated_at", { ascending: true });

    // 3) Pendências de docs (solicitado há >3 dias e ainda não OK)
    const { data: pendingDocs } = await supabase
      .from("job_candidates")
      .select("id, full_name, documents_requested_at, requested_documents, job_opening_id, current_stage")
      .not("documents_requested_at", "is", null)
      .lt("documents_requested_at", threeDaysAgoIso)
      .in("current_stage", ["aguardando_inicio", "entrevista_agendada"]);

    const pendingFiltered = (pendingDocs ?? []).filter((c: any) => {
      const docs = Array.isArray(c.requested_documents) ? c.requested_documents : [];
      const requested = docs.filter((d: any) => d.requested);
      const okCount = requested.filter((d: any) => d.ok).length;
      return requested.length > 0 && okCount < requested.length;
    });

    // 4) Docs novos chegando (uploads nas últimas 48h em candidatos com docs não 100% OK)
    const fortyEightAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentUploads } = await supabase
      .from("candidate_document_uploads")
      .select("candidate_id, uploaded_at, candidate:job_candidates!inner(id, full_name, job_opening_id, requested_documents, current_stage)")
      .gte("uploaded_at", fortyEightAgo)
      .order("uploaded_at", { ascending: false });

    const newDocsMap = new Map<string, { id: string; name: string; uploadedAt: string; jobOpeningId: string | null }>();
    (recentUploads ?? []).forEach((u: any) => {
      const c = u.candidate;
      if (!c) return;
      const docs = Array.isArray(c.requested_documents) ? c.requested_documents : [];
      const requested = docs.filter((d: any) => d.requested);
      const okCount = requested.filter((d: any) => d.ok).length;
      if (requested.length === 0 || okCount >= requested.length) return; // já tudo OK
      if (!newDocsMap.has(c.id)) {
        newDocsMap.set(c.id, { id: c.id, name: c.full_name, uploadedAt: u.uploaded_at, jobOpeningId: c.job_opening_id });
      }
    });

    // 5) Vagas abertas há >30 dias com poucos candidatos (<3 nos últimos 30d)
    const { data: oldOpenings } = await supabase
      .from("job_openings")
      .select("id, title, opened_at, position")
      .eq("status", "open")
      .lt("opened_at", thirtyDaysAgoIso);

    const oldWithFewCandidates: { id: string; title: string; position: string }[] = [];
    if (oldOpenings && oldOpenings.length > 0) {
      const ids = oldOpenings.map((o: any) => o.id);
      const { data: cands } = await supabase
        .from("job_candidates")
        .select("job_opening_id, applied_at")
        .in("job_opening_id", ids)
        .gte("applied_at", thirtyDaysAgoIso.slice(0, 10));
      const counts = new Map<string, number>();
      (cands ?? []).forEach((c: any) => counts.set(c.job_opening_id, (counts.get(c.job_opening_id) ?? 0) + 1));
      oldOpenings.forEach((o: any) => {
        if ((counts.get(o.id) ?? 0) < 3) oldWithFewCandidates.push(o);
      });
    }

    const next: ActionGroup[] = [];

    if (newDocsMap.size > 0) {
      next.push({
        key: "new-docs",
        icon: FileCheck2,
        tone: "primary",
        title: "Documentos novos para revisar",
        subtitle: "Candidatos enviaram documentos nas últimas 48h",
        count: newDocsMap.size,
        items: Array.from(newDocsMap.values()).map((c) => ({
          id: c.id,
          label: c.name,
          meta: `Enviou ${new Date(c.uploadedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
          jobOpeningId: c.jobOpeningId,
        })),
      });
    }

    if (interviewsToday && interviewsToday.length > 0) {
      next.push({
        key: "interviews-today",
        icon: CalendarClock,
        tone: "info",
        title: "Entrevistas hoje",
        subtitle: "Acompanhe os horários e confirme presença",
        count: interviewsToday.length,
        items: interviewsToday.map((c: any) => ({
          id: c.id,
          label: c.full_name,
          meta: new Date(c.interview_scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          jobOpeningId: c.job_opening_id,
        })),
        cta: onSwitchTab ? { label: "Abrir agenda", onClick: () => onSwitchTab("agenda") } : undefined,
      });
    }

    if (day7 && day7.length > 0) {
      next.push({
        key: "day-7",
        icon: GraduationCap,
        tone: "success",
        title: "Decisão de contratação",
        subtitle: "Candidatos terminaram o Dia 7 do treinamento",
        count: day7.length,
        items: day7.map((c: any) => ({
          id: c.id,
          label: c.full_name,
          meta: `Em Dia 7 desde ${new Date(c.updated_at).toLocaleDateString("pt-BR")}`,
          jobOpeningId: c.job_opening_id,
        })),
      });
    }

    if (pendingFiltered.length > 0) {
      next.push({
        key: "pending-docs",
        icon: AlertTriangle,
        tone: "warning",
        title: "Documentação atrasada",
        subtitle: "Solicitada há mais de 3 dias e ainda incompleta",
        count: pendingFiltered.length,
        items: pendingFiltered.map((c: any) => {
          const days = Math.floor((Date.now() - new Date(c.documents_requested_at).getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: c.id,
            label: c.full_name,
            meta: `${days} dias sem retorno`,
            jobOpeningId: c.job_opening_id,
          };
        }),
      });
    }

    if (oldWithFewCandidates.length > 0) {
      next.push({
        key: "stale-jobs",
        icon: Megaphone,
        tone: "danger",
        title: "Vagas paradas",
        subtitle: "Abertas há +30 dias com menos de 3 candidatos",
        count: oldWithFewCandidates.length,
        items: oldWithFewCandidates.map((o) => ({
          id: o.id,
          label: o.title,
          meta: o.position,
          jobOpeningId: o.id,
        })),
      });
    }

    setGroups(next);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totalActions = useMemo(() => groups.reduce((acc, g) => acc + g.count, 0), [groups]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Tudo em dia! 🎉</div>
            <div className="text-xs text-muted-foreground">Nenhuma ação urgente no recrutamento agora.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Inbox className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm">Precisa da sua atenção</div>
              <div className="text-xs text-muted-foreground">
                {totalActions} {totalActions === 1 ? "ação pendente" : "ações pendentes"}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={load} className="text-xs h-8">Atualizar</Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const tone = TONE_STYLES[g.tone];
            const Icon = g.icon;
            const isOpen = expanded === g.key;
            return (
              <button
                key={g.key}
                onClick={() => setExpanded(isOpen ? null : g.key)}
                className={`text-left rounded-lg border p-3 transition hover:shadow-sm ${tone.bg} ${tone.ring} ring-1 focus:outline-none focus:ring-2`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${tone.iconBg}`}>
                    <Icon className={`h-4 w-4 ${tone.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {g.title}
                      <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${tone.text}`}>{g.count}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{g.subtitle}</div>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition ${isOpen ? "rotate-90" : ""}`} />
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-1 border-t pt-2">
                    {g.items.slice(0, 6).map((it) => (
                      <div
                        key={it.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (it.jobOpeningId && onFocusJob) onFocusJob(it.jobOpeningId);
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && it.jobOpeningId && onFocusJob) {
                            e.preventDefault();
                            e.stopPropagation();
                            onFocusJob(it.jobOpeningId);
                          }
                        }}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-background/60 cursor-pointer"
                      >
                        <div className="text-xs font-medium truncate">{it.label}</div>
                        {it.meta && <div className="text-[10px] text-muted-foreground shrink-0">{it.meta}</div>}
                      </div>
                    ))}
                    {g.items.length > 6 && (
                      <div className="text-[10px] text-muted-foreground px-2 pt-1">
                        +{g.items.length - 6} {g.items.length - 6 === 1 ? "outro" : "outros"}
                      </div>
                    )}
                    {g.cta && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); g.cta!.onClick(); }}
                      >
                        {g.cta.label}
                      </Button>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
