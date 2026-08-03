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
import { DEFAULT_SCALE, scaleColorClass } from "@/lib/competencyEvaluation";
import { ensureEvaluationCycle } from "@/lib/monthlyCycle";

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
    // Avaliação é mensal e refere-se ao mês anterior (avaliar do dia 1 ao dia 3)
    const current = await ensureEvaluationCycle();
    const [{ data: c, error: ce }, { data: cr, error: cre }] = await Promise.all([
      supabase.from("evaluation_cycles").select("*").order("start_date", { ascending: false }),
      supabase.from("evaluation_criteria").select("*").order("name"),
    ]);
    if (ce) toast({ title: "Erro", description: ce.message, variant: "destructive" });
    if (cre) toast({ title: "Erro", description: cre.message, variant: "destructive" });
    const cs = (c ?? []) as Cycle[];
    setCycles(cs);
    setCriteria((cr ?? []) as Criterion[]);
    if (current && !selectedCycleId) setSelectedCycleId(current.id);
    else if (cs.length && !selectedCycleId) setSelectedCycleId(cs[0].id);
    setLoading(false);
  };


  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const activeCriteria = useMemo(() => criteria.filter((c) => c.is_active), [criteria]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 md:h-7 md:w-7 text-primary" /> Avaliação de Desempenho
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Ciclo <strong>mensal e obrigatório</strong>: todo gestor deve avaliar a equipe referente ao mês anterior entre os dias 1 e 3. Avaliação por competência do cargo, na escala 1 a 5. As infrações registradas entram automaticamente como "Disciplina" e o resultado alimenta o Plano de Carreira (PCCS).
          </p>
        </div>
        <Button variant="outline" onClick={() => setCriteriaOpen(true)} className="w-full sm:w-auto">
          <Settings2 className="h-4 w-4" /> Critérios (legado)
        </Button>
      </div>

      <MonthlyEvaluationReminder hideLink />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Escala de proficiência</CardTitle>
          <CardDescription>Mesma régua para todos os cargos — o que muda são as competências avaliadas.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {DEFAULT_SCALE.map((l) => (
            <div key={l.score} className={`rounded-md border p-2 ${scaleColorClass(l.score)}`}>
              <div className="text-sm font-bold">{l.score} · {l.label}</div>
              <div className="text-[11px] opacity-80 leading-tight mt-0.5">{l.description}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Avaliações do ciclo</CardTitle>
            <CardDescription>
              Lance a nota de 1 a 5 em cada competência do cargo. A nota final (0-10) é a média ponderada — competências obrigatórias pesam o dobro — somada à Disciplina (20%).
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
