import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Check, X, CalendarPlus, Trash2, Sparkles, Phone, MapPin, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sendApplicationDecisionEmail } from "@/lib/applicationEmails";

interface Application {
  id: string; full_name: string; email: string | null; phone: string;
  city: string | null; neighborhood: string | null; birth_date: string | null;
  has_transport: boolean | null; availability: string[];
  experience_years: number | null; last_job: string | null; last_job_company: string | null;
  behavioral_answers: Record<string, string>;
  screening_score: number | null; screening_summary: string | null; screening_recommendation: string | null;
  selected_slot_id: string | null; interview_status: string;
  manager_notes: string | null; created_at: string;
  resume_path: string | null; resume_name: string | null;
}
interface Slot { id: string; start_at: string; duration_min: number; location: string | null; is_available: boolean; taken_by_application_id: string | null; }

const REC_LABEL: Record<string, { label: string; cls: string }> = {
  forte_recomendado: { label: "Forte", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  recomendado: { label: "Recomendado", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  neutro: { label: "Neutro", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  nao_recomendado: { label: "Não recomendado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Aguardando análise", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  approved: { label: "Aprovada", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "Rejeitada", cls: "bg-destructive/10 text-destructive" },
};

export default function PublicApplicationsPanel({ jobOpeningId }: { jobOpeningId: string }) {
  const [tab, setTab] = useState("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSlot, setOpenSlot] = useState(false);
  const [slotForm, setSlotForm] = useState({ start_at: "", duration_min: "30", location: "", count: "1", interval_min: "30" });
  const [detail, setDetail] = useState<Application | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: s }] = await Promise.all([
      supabase.from("job_applications").select("*").eq("job_opening_id", jobOpeningId).order("created_at", { ascending: false }),
      supabase.from("job_interview_slots").select("*").eq("job_opening_id", jobOpeningId).order("start_at"),
    ]);
    setApps((a ?? []) as Application[]);
    setSlots((s ?? []) as Slot[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [jobOpeningId]);

  const slotMap = Object.fromEntries(slots.map((s) => [s.id, s]));

  const createSlots = async () => {
    if (!slotForm.start_at) { toast({ title: "Informe a data/hora inicial", variant: "destructive" }); return; }
    const count = Math.max(1, Number(slotForm.count) || 1);
    const interval = Math.max(0, Number(slotForm.interval_min) || 30);
    const duration = Math.max(5, Number(slotForm.duration_min) || 30);
    const base = new Date(slotForm.start_at);
    const rows = Array.from({ length: count }, (_, i) => ({
      job_opening_id: jobOpeningId,
      start_at: new Date(base.getTime() + i * interval * 60_000).toISOString(),
      duration_min: duration, location: slotForm.location || null, is_available: true,
    }));
    const { error } = await supabase.from("job_interview_slots").insert(rows);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${count} horário(s) criado(s)` });
    setOpenSlot(false);
    setSlotForm({ start_at: "", duration_min: "30", location: "", count: "1", interval_min: "30" });
    load();
  };

  const removeSlot = async (id: string) => {
    if (!confirm("Excluir este horário?")) return;
    const { error } = await supabase.from("job_interview_slots").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!detail) return;
    setSavingDecision(true);

    // 1) Atualiza a candidatura
    const { error } = await supabase.from("job_applications")
      .update({ interview_status: status, reviewed_at: new Date().toISOString() })
      .eq("id", detail.id);
    if (error) {
      setSavingDecision(false);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // 2) Se aprovou, cria candidato no pipeline em "entrevista_agendada" (ou "novos" se sem slot)
    if (status === "approved") {
      // Pega horário do slot escolhido
      let interviewAt: string | null = null;
      if (detail.selected_slot_id) {
        const { data: slot } = await supabase.from("job_interview_slots")
          .select("start_at").eq("id", detail.selected_slot_id).maybeSingle();
        interviewAt = slot?.start_at ?? null;
      }
      const { error: candErr } = await supabase.from("job_candidates").insert({
        job_opening_id: jobOpeningId,
        full_name: detail.full_name,
        email: detail.email,
        phone: detail.phone,
        city: detail.city,
        source: "Página pública /vagas",
        current_stage: interviewAt ? "entrevista_agendada" : "novos",
        expected_salary: null,
        availability: detail.availability?.join(", ") || null,
        has_experience: (detail.experience_years ?? 0) > 0,
        notes: detail.last_job ? `Última experiência: ${detail.last_job}${detail.last_job_company ? " — " + detail.last_job_company : ""}` : null,
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
      await supabase.from("job_interview_slots").update({ is_available: true, taken_by_application_id: null }).eq("id", detail.selected_slot_id);
    }

    setSavingDecision(false);
    toast({ title: status === "approved" ? "Candidato adicionado ao pipeline" : "Candidatura rejeitada" });

    // Envia email cordial ao candidato (não bloqueante)
    sendApplicationDecisionEmail({
      applicationId: detail.id,
      status,
      recipientEmail: detail.email,
      recipientName: detail.full_name,
      jobOpeningId,
      selectedSlotId: detail.selected_slot_id,
      slotsTable: "job_interview_slots",
    });

    setDetail(null); load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="applications">Candidaturas externas ({apps.length})</TabsTrigger>
          <TabsTrigger value="slots">Horários de entrevista ({slots.filter((s) => s.is_available).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-2 pt-3">
          {apps.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma candidatura externa ainda. Compartilhe o link <code className="px-1 bg-muted rounded">/vagas</code>.
            </CardContent></Card>
          ) : apps.map((a) => {
            const rec = a.screening_recommendation ? REC_LABEL[a.screening_recommendation] : null;
            const st = STATUS_LABEL[a.interview_status] ?? STATUS_LABEL.pending;
            const slot = a.selected_slot_id ? slotMap[a.selected_slot_id] : null;
            return (
              <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetail(a)}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{a.full_name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.phone}</span>
                        {a.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.city}{a.neighborhood ? ` · ${a.neighborhood}` : ""}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={st.cls} variant="outline">{st.label}</Badge>
                      {a.screening_score !== null && (
                        <Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />{a.screening_score}/100</Badge>
                      )}
                    </div>
                  </div>
                  {rec && (
                    <Badge variant="outline" className={rec.cls}>IA: {rec.label}</Badge>
                  )}
                  {slot && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(slot.start_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      {slot.location ? ` · ${slot.location}` : ""}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="slots" className="space-y-3 pt-3">
          <Button size="sm" onClick={() => setOpenSlot(true)} className="gap-2"><CalendarPlus className="h-4 w-4" />Adicionar horários</Button>
          {slots.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum horário cadastrado. Adicione para que candidatos possam agendar.
            </CardContent></Card>
          ) : (
            <div className="space-y-1.5">
              {slots.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                  <div>
                    <div className="font-medium">{new Date(s.start_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {s.duration_min}min</div>
                    <div className="text-xs text-muted-foreground">
                      {s.location || "—"} · {s.is_available ? <span className="text-emerald-600 dark:text-emerald-400">disponível</span> : <span className="text-amber-600 dark:text-amber-400">reservado</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeSlot(s.id)} className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detalhe candidato */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.full_name}</DialogTitle>
                <DialogDescription>Candidatura recebida em {new Date(detail.created_at).toLocaleString("pt-BR")}</DialogDescription>
              </DialogHeader>

              {detail.screening_score !== null && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Pré-triagem por IA</div>
                      <div className="text-2xl font-bold">{detail.screening_score}<span className="text-sm text-muted-foreground">/100</span></div>
                    </div>
                    {detail.screening_recommendation && (
                      <Badge variant="outline" className={REC_LABEL[detail.screening_recommendation]?.cls}>
                        {REC_LABEL[detail.screening_recommendation]?.label}
                      </Badge>
                    )}
                    {detail.screening_summary && <p className="text-sm">{detail.screening_summary}</p>}
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Telefone:</span> {detail.phone}</div>
                <div><span className="text-muted-foreground">E-mail:</span> {detail.email || "—"}</div>
                <div><span className="text-muted-foreground">Nascimento:</span> {detail.birth_date || "—"}</div>
                <div><span className="text-muted-foreground">Cidade/Bairro:</span> {detail.city || "—"} / {detail.neighborhood || "—"}</div>
                <div><span className="text-muted-foreground">Transporte próprio:</span> {detail.has_transport ? "Sim" : "Não"}</div>
                <div><span className="text-muted-foreground">Disponibilidade:</span> {detail.availability.join(", ") || "—"}</div>
                <div><span className="text-muted-foreground">Experiência:</span> {detail.experience_years ?? "—"} anos</div>
                <div><span className="text-muted-foreground">Último cargo:</span> {detail.last_job || "—"} {detail.last_job_company ? `(${detail.last_job_company})` : ""}</div>
              </div>

              {Object.keys(detail.behavioral_answers ?? {}).length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-sm">Respostas comportamentais</div>
                  {Object.entries(detail.behavioral_answers).map(([q, a]) => (
                    <div key={q} className="text-sm">
                      <div className="text-muted-foreground">{q}</div>
                      <div className="whitespace-pre-wrap">{a || "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              {detail.selected_slot_id && slotMap[detail.selected_slot_id] && (
                <div className="p-3 border rounded-md bg-muted/40">
                  <div className="text-xs text-muted-foreground">Horário escolhido</div>
                  <div className="font-medium">{new Date(slotMap[detail.selected_slot_id].start_at).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}</div>
                </div>
              )}

              {detail.resume_path && (
                <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/40">
                  <span className="text-xs text-muted-foreground">Currículo:</span>
                  <a
                    href={supabase.storage.from("job-resumes").getPublicUrl(detail.resume_path).data.publicUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline truncate"
                  >
                    {detail.resume_name || "baixar arquivo"}
                  </a>
                </div>
              )}

              <DialogFooter>
                {detail.interview_status === "pending" ? (
                  <>
                    <Button variant="outline" onClick={() => decide("rejected")} disabled={savingDecision} className="gap-2">
                      <X className="h-4 w-4" />Rejeitar
                    </Button>
                    <Button onClick={() => decide("approved")} disabled={savingDecision} className="gap-2">
                      <Check className="h-4 w-4" />Aprovar entrevista
                    </Button>
                  </>
                ) : (
                  <Badge className={STATUS_LABEL[detail.interview_status]?.cls}>{STATUS_LABEL[detail.interview_status]?.label}</Badge>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Novo slot */}
      <Dialog open={openSlot} onOpenChange={setOpenSlot}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar horários de entrevista</DialogTitle>
            <DialogDescription>Você pode criar vários horários em sequência.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Início *</Label><Input type="datetime-local" value={slotForm.start_at} onChange={(e) => setSlotForm({ ...slotForm, start_at: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Quantos</Label><Input type="number" min={1} value={slotForm.count} onChange={(e) => setSlotForm({ ...slotForm, count: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Duração (min)</Label><Input type="number" min={5} value={slotForm.duration_min} onChange={(e) => setSlotForm({ ...slotForm, duration_min: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Intervalo (min)</Label><Input type="number" min={0} value={slotForm.interval_min} onChange={(e) => setSlotForm({ ...slotForm, interval_min: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Local</Label><Input value={slotForm.location} onChange={(e) => setSlotForm({ ...slotForm, location: e.target.value })} placeholder="Ex.: loja Centro / online" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSlot(false)}>Cancelar</Button>
            <Button onClick={createSlots}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
