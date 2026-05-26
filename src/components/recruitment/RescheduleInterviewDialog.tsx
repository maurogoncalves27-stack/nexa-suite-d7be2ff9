import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarClock, MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Slot {
  id: string;
  start_at: string;
  duration_min: number;
  location: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicationId: string;
  candidateName: string;
  currentSlotId: string | null;
  candidateId?: string | null; // job_candidates.id, se já estiver aprovado
  onRescheduled?: () => void;
}

export default function RescheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
  currentSlotId,
  candidateId,
  onRescheduled,
}: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setReason("");
    (async () => {
      setLoading(true);
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("interview_slots")
        .select("id, start_at, duration_min, location")
        .eq("is_available", true)
        .gt("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(40);
      setSlots((data ?? []) as Slot[]);
      setLoading(false);
    })();
  }, [open]);

  const confirm = async () => {
    if (!selectedId) {
      toast({ title: "Escolha um novo horário", variant: "destructive" });
      return;
    }
    setSaving(true);

    // 1. Reserva o novo slot atomicamente
    const { data: newSlot, error: bookErr } = await supabase
      .from("interview_slots")
      .update({
        is_available: false,
        booked_at: new Date().toISOString(),
        booked_by_candidate_id: candidateId ?? null,
      })
      .eq("id", selectedId)
      .eq("is_available", true)
      .select("id, start_at")
      .maybeSingle();

    if (bookErr || !newSlot) {
      setSaving(false);
      toast({
        title: "Horário indisponível",
        description: "Esse slot acabou de ser reservado, escolha outro.",
        variant: "destructive",
      });
      return;
    }

    // 2. Libera o slot antigo
    if (currentSlotId) {
      await supabase
        .from("interview_slots")
        .update({ is_available: true, booked_at: null, booked_by_candidate_id: null })
        .eq("id", currentSlotId);
    }

    // 3. Atualiza a candidatura
    await supabase
      .from("job_applications")
      .update({ selected_slot_id: newSlot.id })
      .eq("id", applicationId);

    // 4. Atualiza candidato (se já existir no pipeline)
    if (candidateId) {
      await supabase
        .from("job_candidates")
        .update({
          interview_slot_id: newSlot.id,
          interview_scheduled_at: newSlot.start_at,
        })
        .eq("id", candidateId);
    }

    // 5. Loga o reagendamento
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("interview_reschedule_log").insert({
      application_id: applicationId,
      previous_slot_id: currentSlotId,
      new_slot_id: newSlot.id,
      reason: reason.trim() || null,
      rescheduled_by: userRes.user?.id ?? null,
    });

    setSaving(false);
    toast({
      title: "Entrevista reagendada",
      description: `${candidateName} — novo horário definido.`,
    });
    onOpenChange(false);
    onRescheduled?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Reagendar entrevista
          </DialogTitle>
          <DialogDescription>
            Escolha um dos horários disponíveis para <strong>{candidateName}</strong>. O horário
            anterior ficará liberado para outros candidatos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum horário disponível na agenda. Cadastre novos slots em "Agenda de entrevistas".
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {slots.map((s) => {
                const active = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left p-3 border rounded-md transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-medium text-sm">
                      {new Date(s.start_at).toLocaleString("pt-BR", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span>{s.duration_min} min</span>
                      {s.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {s.location}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Motivo (opcional)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: candidato pediu remarcação, conflito de agenda do entrevistador..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving || !selectedId} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar reagendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
