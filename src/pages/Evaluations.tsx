import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Award, Loader2, Settings2 } from "lucide-react";
import PerformancePanel from "@/components/evaluations/PerformancePanel";
import CriteriaPanel from "@/components/evaluations/CriteriaPanel";
import MonthlyEvaluationReminder from "@/components/evaluations/MonthlyEvaluationReminder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
  notes: string | null;
  bonus_value_per_point: number;
  periodicity: "weekly" | "monthly" | "semiannual";
}
export interface Criterion {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  is_active: boolean;
  is_auto?: boolean;
}

export default function Evaluations() {
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: c, error: ce }, { data: cr, error: cre }] = await Promise.all([
      supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false }),
      supabase.from("evaluation_criteria").select("*").order("name"),
    ]);
    if (ce) toast({ title: "Erro", description: ce.message, variant: "destructive" });
    if (cre) toast({ title: "Erro", description: cre.message, variant: "destructive" });
    const cs = (c ?? []) as Cycle[];
    setCycles(cs);
    setCriteria((cr ?? []) as Criterion[]);
    if (cs.length && !selectedCycleId) setSelectedCycleId(cs[0].id);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const activeCriteria = useMemo(() => criteria.filter((c) => c.is_active), [criteria]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Award className="h-7 w-7 text-primary" /> Avaliação de Desempenho
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Avalie colaboradores por critérios ponderados. As infrações registradas impactam automaticamente a nota através do critério "Disciplina".
          </p>
        </div>
        <Button variant="outline" onClick={() => setCriteriaOpen(true)} className="w-full sm:w-auto">
          <Settings2 className="h-4 w-4" /> Gerenciar critérios
        </Button>
      </div>

      <MonthlyEvaluationReminder hideLink />

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Avaliações do ciclo</CardTitle>
            <CardDescription>
              Lance notas por critério. A nota final é a média ponderada e inclui o critério automático "Disciplina" (10 menos pontos perdidos por infrações).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerformancePanel
              cycles={cycles}
              criteria={activeCriteria}
              selectedCycleId={selectedCycleId}
              onSelectCycle={setSelectedCycleId}
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={criteriaOpen} onOpenChange={setCriteriaOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Critérios de avaliação</DialogTitle>
            <DialogDescription>
              Inclua, edite ou desative os critérios usados no cálculo da nota final.
            </DialogDescription>
          </DialogHeader>
          <CriteriaPanel criteria={criteria} onChange={load} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
