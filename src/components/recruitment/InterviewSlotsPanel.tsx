import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Trash2, MapPin, User, Loader2, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { isFactoryName } from "@/lib/factory";
import { sortStores } from "@/lib/storeSort";
import { CandidateFlowDialog as CandidateDetailDialog } from "./CandidateFlowDialog";

interface Slot {
  id: string;
  start_at: string;
  duration_min: number;
  location: string | null;
  store_id: string | null;
  notes: string | null;
  is_available: boolean;
  booked_by_candidate_id: string | null;
  booked_at: string | null;
}
interface Store { id: string; name: string; }
interface Candidate {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  current_stage: string;
  ai_score: number | null;
  ai_recommendation: string | null;
  job_opening_id: string;
  job_position?: string;
}

export default function InterviewSlotsPanel() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null);
  const [detailCandidateId, setDetailCandidateId] = useState<string | null>(null);
  const [detailJobPosition, setDetailJobPosition] = useState<string>("");

  // bulk form
  const [date, setDate] = useState("");
  const [times, setTimes] = useState("09:00, 09:30, 10:00, 10:30, 11:00");
  const [duration, setDuration] = useState("30");
  const [location, setLocation] = useState("");
  const [storeId, setStoreId] = useState<string>("none");

  const load = async () => {
    setLoading(true);
    const [slotsRes, storesRes] = await Promise.all([
      supabase.from("interview_slots").select("*").order("start_at", { ascending: true }),
      supabase.from("stores").select("id, name, store_type").eq("is_virtual", false).order("name"),
    ]);
    const list = (slotsRes.data ?? []) as Slot[];
    setSlots(list);
    const filteredStores = ((storesRes.data ?? []) as (Store & { store_type?: string | null })[]).filter(
      (s) => !isFactoryName(s.name),
    );
    setStores(sortStores(filteredStores) as Store[]);

    const candIds = Array.from(new Set(list.map((s) => s.booked_by_candidate_id).filter(Boolean) as string[]));
    if (candIds.length) {
      const { data: cands } = await supabase
        .from("job_candidates")
        .select("id, full_name, phone, email, current_stage, ai_score, ai_recommendation, job_opening_id")
        .in("id", candIds);
      const jobIds = Array.from(new Set((cands ?? []).map((c: any) => c.job_opening_id)));
      const { data: jobs } = jobIds.length
        ? await supabase.from("job_openings").select("id, position").in("id", jobIds)
        : { data: [] as any[] };
      const jobMap: Record<string, string> = {};
      (jobs ?? []).forEach((j: any) => { jobMap[j.id] = j.position; });
      const map: Record<string, Candidate> = {};
      (cands ?? []).forEach((c: any) => { map[c.id] = { ...c, job_position: jobMap[c.job_opening_id] ?? "" }; });
      setCandidates(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createSlots = async () => {
    if (!date) { toast({ title: "Informe a data", variant: "destructive" }); return; }
    const timeList = times.split(",").map((t) => t.trim()).filter(Boolean);
    if (!timeList.length) { toast({ title: "Informe pelo menos um horário", variant: "destructive" }); return; }

    setSaving(true);
    const rows = timeList.map((t) => ({
      start_at: new Date(`${date}T${t}:00`).toISOString(),
      duration_min: Number(duration) || 30,
      location: location || null,
      store_id: storeId === "none" ? null : storeId,
      is_available: true,
    }));
    const { error } = await supabase.from("interview_slots").insert(rows);
    setSaving(false);
    if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${rows.length} horário(s) criado(s)` });
    setOpen(false);
    setDate(""); setTimes("09:00, 09:30, 10:00, 10:30, 11:00"); setLocation("");
    load();
  };

  const removeSlot = async (id: string) => {
    if (!confirm("Excluir este horário?")) return;
    const { error } = await supabase.from("interview_slots").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const toggleAvailable = async (s: Slot) => {
    const { error } = await supabase.from("interview_slots")
      .update({ is_available: !s.is_available }).eq("id", s.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  // agrupa por dia (oculta dias passados)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const visibleSlots = slots.filter((s) => new Date(s.start_at) >= startOfToday);
  const grouped: Record<string, Slot[]> = {};
  for (const s of visibleSlots) {
    const d = new Date(s.start_at).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    (grouped[d] ??= []).push(s);
  }

  const totalBooked = slots.filter((s) => s.booked_by_candidate_id).length;
  const totalAvailable = slots.filter((s) => !s.booked_by_candidate_id && s.is_available).length;
  const totalBlocked = slots.filter((s) => !s.booked_by_candidate_id && !s.is_available).length;

  const recColor = (rec: string | null) =>
    rec === "forte_recomendado" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
    rec === "recomendado" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" :
    rec === "talvez" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" :
    rec === "nao_recomendado" ? "bg-destructive/10 text-destructive border-destructive/30" :
    "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" /> Agenda de entrevistas
          </CardTitle>
          {slots.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Badge className="bg-primary/15 text-primary border-primary/30 gap-1">
                <User className="h-3 w-3" /> {totalBooked} agendada{totalBooked === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="text-xs">{totalAvailable} disponíve{totalAvailable === 1 ? "l" : "is"}</Badge>
              {totalBlocked > 0 && (
                <Badge variant="secondary" className="text-xs">{totalBlocked} bloqueado{totalBlocked === 1 ? "" : "s"}</Badge>
              )}
            </div>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Novos horários</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Adicionar horários disponíveis</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Horários (separados por vírgula) *</Label>
                <Input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="09:00, 09:30, 10:00" />
                <p className="text-xs text-muted-foreground">Cria um slot para cada horário.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Duração (min)</Label>
                  <Input type="number" min={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Loja (opcional)</Label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Local (opcional)</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Loja Centro - Sala 2" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={createSlots} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum horário cadastrado. Adicione horários para que candidatos possam agendar.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([day, list]) => {
              const dayBooked = list.filter((s) => s.booked_by_candidate_id).length;
              return (
                <div key={day}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase font-semibold text-muted-foreground capitalize">{day}</div>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                      {dayBooked} de {list.length} agendada{list.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((s) => {
                      const time = new Date(s.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const cand = s.booked_by_candidate_id ? candidates[s.booked_by_candidate_id] : null;
                      return (
                        <div key={s.id} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                          <div className="font-mono text-sm font-semibold w-14">{time}</div>
                          <div className="text-xs text-muted-foreground">{s.duration_min}min</div>
                          {s.location && (
                            <Badge variant="outline" className="gap-1 text-xs"><MapPin className="h-3 w-3" />{s.location}</Badge>
                          )}
                          <div className="flex-1" />
                          {cand ? (
                            <button
                              type="button"
                              onClick={() => setPreviewCandidate(cand)}
                              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
                            >
                              <User className="h-3 w-3" />{cand.full_name}
                              <Eye className="h-3 w-3 ml-0.5 opacity-70" />
                            </button>
                          ) : s.is_available ? (
                            <Badge variant="outline" className="text-xs">Disponível</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Bloqueado</Badge>
                          )}
                          {!cand && (
                            <Button size="sm" variant="ghost" onClick={() => toggleAvailable(s)} className="text-xs h-7">
                              {s.is_available ? "Bloquear" : "Liberar"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => removeSlot(s.id)} className="text-destructive hover:text-destructive h-7 w-7 p-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Prévia do candidato */}
      <Dialog open={!!previewCandidate} onOpenChange={(o) => !o && setPreviewCandidate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> {previewCandidate?.full_name}
            </DialogTitle>
          </DialogHeader>
          {previewCandidate && (
            <div className="space-y-2 text-sm">
              {previewCandidate.job_position && (
                <div><span className="text-muted-foreground">Vaga:</span> {previewCandidate.job_position}</div>
              )}
              <div><span className="text-muted-foreground">Etapa:</span> {previewCandidate.current_stage}</div>
              {previewCandidate.phone && (
                <div><span className="text-muted-foreground">Telefone:</span> {previewCandidate.phone}</div>
              )}
              {previewCandidate.email && (
                <div><span className="text-muted-foreground">Email:</span> {previewCandidate.email}</div>
              )}
              {previewCandidate.ai_score != null && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Avaliação IA:</span>
                  <Badge variant="outline" className={recColor(previewCandidate.ai_recommendation)}>
                    {previewCandidate.ai_score}/100
                  </Badge>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewCandidate(null)}>Fechar</Button>
            <Button
              onClick={() => {
                if (!previewCandidate) return;
                setDetailCandidateId(previewCandidate.id);
                setDetailJobPosition(previewCandidate.job_position ?? "");
                setPreviewCandidate(null);
              }}
            >
              Ver detalhes completos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailCandidateId && (
        <CandidateDetailDialog
          candidateId={detailCandidateId}
          jobPosition={detailJobPosition}
          open={!!detailCandidateId}
          onOpenChange={(o) => !o && setDetailCandidateId(null)}
          onChanged={load}
        />
      )}
    </Card>
  );
}
