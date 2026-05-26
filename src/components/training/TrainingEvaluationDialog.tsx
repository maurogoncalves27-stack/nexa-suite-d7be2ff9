import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StarRating } from "@/components/evaluations/StarRating";
import { useAuth } from "@/hooks/useAuth";
import type { TrainingCriterion } from "@/pages/Trainings";

interface EmployeeLite {
  id: string;
  full_name: string;
  position: string | null;
  training_start_date: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  employee: EmployeeLite | null;
  criteria: TrainingCriterion[];
  onSaved: () => void;
  initialDay?: number;
}

interface ScoreEntry {
  criterion_id: string;
  day_number: number;
  score: number;
  notes?: string | null;
  id?: string;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function TrainingEvaluationDialog({ open, onClose, employee, criteria, onSaved, initialDay }: Props) {
  const { user } = useAuth();
  const [activeDay, setActiveDay] = useState<string>(String(initialDay ?? 1));

  useEffect(() => {
    if (open && initialDay) setActiveDay(String(initialDay));
  }, [open, initialDay]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoresMap, setScoresMap] = useState<Record<number, Record<string, ScoreEntry>>>({});
  const [dayNotes, setDayNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    const load = async () => {
      if (!open || !employee) return;
      setLoading(true);
      const { data } = await supabase
        .from("training_evaluations")
        .select("id, criterion_id, day_number, score, notes")
        .eq("employee_id", employee.id);
      const map: Record<number, Record<string, ScoreEntry>> = {};
      const notes: Record<number, string> = {};
      (data ?? []).forEach((s: any) => {
        if (!map[s.day_number]) map[s.day_number] = {};
        map[s.day_number][s.criterion_id] = {
          id: s.id,
          criterion_id: s.criterion_id,
          day_number: s.day_number,
          score: Number(s.score),
          notes: s.notes,
        };
        if (s.notes && !notes[s.day_number]) notes[s.day_number] = s.notes;
      });
      setScoresMap(map);
      setDayNotes(notes);
      setLoading(false);
    };
    load();
  }, [open, employee]);

  const setScore = (day: number, criterionId: string, value: number) => {
    setScoresMap((prev) => {
      const next = { ...prev };
      if (!next[day]) next[day] = {};
      next[day] = {
        ...next[day],
        [criterionId]: {
          ...(next[day][criterionId] ?? { criterion_id: criterionId, day_number: day, score: 0 }),
          criterion_id: criterionId,
          day_number: day,
          score: value,
        },
      };
      return next;
    });
  };

  const dayAverage = (day: number): number | null => {
    const entries = scoresMap[day];
    if (!entries) return null;
    let sw = 0, w = 0;
    for (const c of criteria) {
      const e = entries[c.id];
      if (e) { sw += e.score * Number(c.weight); w += Number(c.weight); }
    }
    return w > 0 ? sw / w : null;
  };

  const overallAverage = useMemo(() => {
    let sw = 0, w = 0;
    for (const day of DAYS) {
      const entries = scoresMap[day];
      if (!entries) continue;
      for (const c of criteria) {
        const e = entries[c.id];
        if (e) { sw += e.score * Number(c.weight); w += Number(c.weight); }
      }
    }
    return w > 0 ? sw / w : null;
  }, [scoresMap, criteria]);

  const saveDay = async (day: number) => {
    if (!employee) return;
    const entries = scoresMap[day];
    if (!entries || Object.keys(entries).length === 0) {
      toast({ title: "Nada para salvar", description: "Avalie ao menos um critério.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const rows = Object.values(entries)
      .filter((e) => e.score > 0)
      .map((e) => ({
        employee_id: employee.id,
        criterion_id: e.criterion_id,
        day_number: day,
        score: e.score,
        notes: dayNotes[day] || null,
        created_by: user?.id ?? null,
      }));
    const { error } = await supabase
      .from("training_evaluations")
      .upsert(rows, { onConflict: "employee_id,criterion_id,day_number" });
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Dia ${day} salvo` });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
        <DialogHeader>
          <DialogTitle>Avaliação diária — {employee?.full_name}</DialogTitle>
          <DialogDescription>
            {employee?.position ?? "—"} · Início: {employee?.training_start_date ?? "—"}
            {overallAverage != null && (
              <span className="ml-3">
                Média geral: <strong>{overallAverage.toFixed(1)} ★</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs value={activeDay} onValueChange={setActiveDay}>
            <TabsList className="grid grid-cols-7">
              {DAYS.map((d) => {
                const avg = dayAverage(d);
                return (
                  <TabsTrigger key={d} value={String(d)} className="flex flex-col gap-0.5 py-2">
                    <span className="text-xs">Dia {d}</span>
                    {avg != null && <span className="text-[10px] text-muted-foreground">{avg.toFixed(1)}★</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {DAYS.map((d) => (
              <TabsContent key={d} value={String(d)} className="space-y-4">
                <div className="space-y-3">
                  {criteria.map((c) => {
                    const value = scoresMap[d]?.[c.id]?.score ?? 0;
                    return (
                      <div key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b pb-3">
                        <div>
                          <div className="font-medium">
                            {c.name} <span className="text-xs text-muted-foreground">(peso {c.weight})</span>
                          </div>
                          {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <StarRating value={value} onChange={(v) => setScore(d, c.id, v)} />
                          <span className="text-xs text-muted-foreground w-8">{value.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <Label>Observações do dia {d}</Label>
                  <Textarea
                    value={dayNotes[d] ?? ""}
                    onChange={(e) => setDayNotes((prev) => ({ ...prev, [d]: e.target.value }))}
                    rows={2}
                    placeholder="Comentários sobre o desempenho do dia..."
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="text-sm">
                    Média do dia: <strong>{dayAverage(d) != null ? `${dayAverage(d)!.toFixed(1)} ★` : "—"}</strong>
                  </div>
                  <Button onClick={() => saveDay(d)} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar dia {d}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
