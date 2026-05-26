import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Check,
  X,
  Sparkles,
  Phone,
  MapPin,
  Clock,
  Briefcase,
  Inbox,
  CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sendApplicationDecisionEmail } from "@/lib/applicationEmails";
import RescheduleInterviewDialog from "./RescheduleInterviewDialog";

interface Application {
  id: string;
  job_opening_id: string;
  full_name: string;
  email: string | null;
  phone: string;
  city: string | null;
  neighborhood: string | null;
  birth_date: string | null;
  has_transport: boolean | null;
  availability: string[] | null;
  experience_years: number | null;
  last_job: string | null;
  last_job_company: string | null;
  behavioral_answers: Record<string, string> | null;
  screening_score: number | null;
  screening_summary: string | null;
  screening_recommendation: string | null;
  selected_slot_id: string | null;
  interview_status: string;
  manager_notes: string | null;
  created_at: string;
  resume_path: string | null;
  resume_name: string | null;
}

interface JobOpening {
  id: string;
  title: string;
  position: string;
}

interface Slot {
  id: string;
  start_at: string;
  duration_min: number;
  location: string | null;
}

const REC_LABEL: Record<string, { label: string; cls: string }> = {
  forte_recomendado: {
    label: "Forte",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  recomendado: {
    label: "Recomendado",
    cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  neutro: {
    label: "Neutro",
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  nao_recomendado: {
    label: "Não recomendado",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Aguardando", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  approved: { label: "Aprovada", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "Rejeitada", cls: "bg-destructive/10 text-destructive" },
};

export default function ExternalApplicationsPanel() {
  const [tab, setTab] = useState("pending");
  const [apps, setApps] = useState<Application[]>([]);
  const [openingsMap, setOpeningsMap] = useState<Record<string, JobOpening>>({});
  const [slotsMap, setSlotsMap] = useState<Record<string, Slot>>({});
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Application | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: a } = await supabase
      .from("job_applications")
      .select("*")
      .order("created_at", { ascending: false });

    const list = ((a ?? []) as unknown) as Application[];
    setApps(list);

    const openingIds = Array.from(new Set(list.map((x) => x.job_opening_id))).filter(Boolean);
    const slotIds = Array.from(new Set(list.map((x) => x.selected_slot_id).filter(Boolean))) as string[];

    const [{ data: jo }, { data: sl }] = await Promise.all([
      openingIds.length
        ? supabase.from("job_openings").select("id, title, position").in("id", openingIds)
        : Promise.resolve({ data: [] as JobOpening[] }),
      slotIds.length
        ? supabase
            .from("interview_slots")
            .select("id, start_at, duration_min, location")
            .in("id", slotIds)
        : Promise.resolve({ data: [] as Slot[] }),
    ]);

    setOpeningsMap(Object.fromEntries(((jo ?? []) as JobOpening[]).map((j) => [j.id, j])));
    setSlotsMap(Object.fromEntries(((sl ?? []) as Slot[]).map((s) => [s.id, s])));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (status: "approved" | "rejected") => {
    if (!detail) return;
    setSavingDecision(true);

    const { error } = await supabase
      .from("job_applications")
      .update({ interview_status: status, reviewed_at: new Date().toISOString() })
      .eq("id", detail.id);

    if (error) {
      setSavingDecision(false);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    if (status === "approved") {
      let interviewAt: string | null = null;
      if (detail.selected_slot_id) {
        const slot = slotsMap[detail.selected_slot_id];
        interviewAt = slot?.start_at ?? null;
      }
      const { error: candErr } = await supabase.from("job_candidates").insert({
        job_opening_id: detail.job_opening_id,
        full_name: detail.full_name,
        email: detail.email,
        phone: detail.phone,
        city: detail.city,
        source: "Página pública /vagas",
        current_stage: interviewAt ? "entrevista_agendada" : "novos",
        expected_salary: null,
        availability: (detail.availability ?? []).join(", ") || null,
        has_experience: (detail.experience_years ?? 0) > 0,
        notes: detail.last_job
          ? `Última experiência: ${detail.last_job}${
              detail.last_job_company ? " — " + detail.last_job_company : ""
            }`
          : null,
        ai_score: detail.screening_score,
        ai_recommendation: detail.screening_recommendation,
        ai_summary: detail.screening_summary,
        ai_screened_at: new Date().toISOString(),
        interview_scheduled_at: interviewAt,
        interview_slot_id: detail.selected_slot_id,
        resume_path: detail.resume_path,
        resume_name: detail.resume_name,
      });
      if (candErr) {
        setSavingDecision(false);
        toast({ title: "Erro ao criar candidato", description: candErr.message, variant: "destructive" });
        return;
      }
    } else if (detail.selected_slot_id) {
      // Rejeitou: libera o slot
      await supabase
        .from("interview_slots")
        .update({ is_available: true, booked_at: null, booked_by_candidate_id: null })
        .eq("id", detail.selected_slot_id);
    }

    setSavingDecision(false);
    toast({
      title: status === "approved" ? "Candidato adicionado ao pipeline" : "Candidatura rejeitada",
    });

    // Envia email cordial ao candidato (não bloqueante)
    sendApplicationDecisionEmail({
      applicationId: detail.id,
      status,
      recipientEmail: detail.email,
      recipientName: detail.full_name,
      jobOpeningId: detail.job_opening_id,
      selectedSlotId: detail.selected_slot_id,
      slotsTable: "interview_slots",
    });

    setDetail(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const pending = apps.filter((a) => a.interview_status === "pending");
  const approved = apps.filter((a) => a.interview_status === "approved");
  const rejected = apps.filter((a) => a.interview_status === "rejected");

  const renderList = (list: Application[]) =>
    list.length === 0 ? (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
          <Inbox className="h-8 w-8 mx-auto opacity-50" />
          <p>Nenhuma candidatura por aqui.</p>
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-2">
        {list.map((a) => {
          const rec = a.screening_recommendation ? REC_LABEL[a.screening_recommendation] : null;
          const st = STATUS_LABEL[a.interview_status] ?? STATUS_LABEL.pending;
          const slot = a.selected_slot_id ? slotsMap[a.selected_slot_id] : null;
          const job = openingsMap[a.job_opening_id];
          return (
            <Card
              key={a.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setDetail(a)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.full_name}</div>
                    {job && (
                      <div className="text-xs text-primary flex items-center gap-1 mt-0.5">
                        <Briefcase className="h-3 w-3" />
                        {job.title}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {a.phone}
                      </span>
                      {a.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {a.city}
                          {a.neighborhood ? ` · ${a.neighborhood}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={st.cls} variant="outline">
                      {st.label}
                    </Badge>
                    {a.screening_score !== null && (
                      <Badge variant="outline" className="gap-1">
                        <Sparkles className="h-3 w-3" />
                        {a.screening_score}/100
                      </Badge>
                    )}
                  </div>
                </div>
                {rec && (
                  <Badge variant="outline" className={rec.cls}>
                    IA: {rec.label}
                  </Badge>
                )}
                {slot && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(slot.start_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {slot.location ? ` · ${slot.location}` : ""}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending">Aguardando ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Aprovadas ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitadas ({rejected.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="pt-3">
          {renderList(pending)}
        </TabsContent>
        <TabsContent value="approved" className="pt-3">
          <p className="text-xs text-muted-foreground mb-2">Removidas automaticamente após 3 meses.</p>
          {renderList(approved)}
        </TabsContent>
        <TabsContent value="rejected" className="pt-3">
          <p className="text-xs text-muted-foreground mb-2">Removidas automaticamente após 3 meses.</p>
          {renderList(rejected)}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.full_name}</DialogTitle>
                <DialogDescription>
                  {openingsMap[detail.job_opening_id]?.title ?? "Vaga"} · Recebida em{" "}
                  {new Date(detail.created_at).toLocaleString("pt-BR")}
                </DialogDescription>
              </DialogHeader>

              {detail.screening_score !== null && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Pré-triagem por IA
                      </div>
                      <div className="text-2xl font-bold">
                        {detail.screening_score}
                        <span className="text-sm text-muted-foreground">/100</span>
                      </div>
                    </div>
                    {detail.screening_recommendation && (
                      <Badge
                        variant="outline"
                        className={REC_LABEL[detail.screening_recommendation]?.cls}
                      >
                        {REC_LABEL[detail.screening_recommendation]?.label}
                      </Badge>
                    )}
                    {detail.screening_summary && <p className="text-sm">{detail.screening_summary}</p>}
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Telefone:</span> {detail.phone}
                </div>
                <div>
                  <span className="text-muted-foreground">E-mail:</span> {detail.email || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Nascimento:</span> {detail.birth_date || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Cidade/Bairro:</span>{" "}
                  {detail.city || "—"} / {detail.neighborhood || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Transporte próprio:</span>{" "}
                  {detail.has_transport ? "Sim" : "Não"}
                </div>
                <div>
                  <span className="text-muted-foreground">Disponibilidade:</span>{" "}
                  {(detail.availability ?? []).join(", ") || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Experiência:</span>{" "}
                  {detail.experience_years ?? "—"} anos
                </div>
                <div>
                  <span className="text-muted-foreground">Último cargo:</span>{" "}
                  {detail.last_job || "—"}{" "}
                  {detail.last_job_company ? `(${detail.last_job_company})` : ""}
                </div>
              </div>

              {Object.keys(detail.behavioral_answers ?? {}).length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-sm">Respostas comportamentais</div>
                  {Object.entries(detail.behavioral_answers ?? {}).map(([q, ans]) => (
                    <div key={q} className="text-sm">
                      <div className="text-muted-foreground">{q}</div>
                      <div className="whitespace-pre-wrap">{ans || "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              {detail.selected_slot_id && slotsMap[detail.selected_slot_id] && (
                <div className="p-3 border rounded-md bg-muted/40 flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground">Horário escolhido</div>
                    <div className="font-medium">
                      {new Date(slotsMap[detail.selected_slot_id].start_at).toLocaleString("pt-BR", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => setReschedOpen(true)}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Reagendar
                  </Button>
                </div>
              )}

              {detail.resume_path && (
                <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/40">
                  <span className="text-xs text-muted-foreground">Currículo:</span>
                  <a
                    href={
                      supabase.storage.from("job-resumes").getPublicUrl(detail.resume_path).data
                        .publicUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline truncate"
                  >
                    {detail.resume_name || "baixar arquivo"}
                  </a>
                </div>
              )}

              <DialogFooter>
                {detail.interview_status === "pending" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => decide("rejected")}
                      disabled={savingDecision}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Rejeitar
                    </Button>
                    <Button
                      onClick={() => decide("approved")}
                      disabled={savingDecision}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Aprovar entrevista
                    </Button>
                  </>
                ) : (
                  <Badge className={STATUS_LABEL[detail.interview_status]?.cls}>
                    {STATUS_LABEL[detail.interview_status]?.label}
                  </Badge>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {detail && (
        <RescheduleInterviewDialog
          open={reschedOpen}
          onOpenChange={setReschedOpen}
          applicationId={detail.id}
          candidateName={detail.full_name}
          currentSlotId={detail.selected_slot_id}
          onRescheduled={() => {
            setDetail(null);
            load();
          }}
        />
      )}
    </div>
  );
}
