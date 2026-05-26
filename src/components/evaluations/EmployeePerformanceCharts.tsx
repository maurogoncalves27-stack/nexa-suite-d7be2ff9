import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";
import type { Cycle, Criterion } from "@/pages/Evaluations";
import { StarRating } from "./StarRating";

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeName: string;
  cycles: Cycle[];
  criteria: Criterion[];
  disciplinePenaltyPerPoint: number; // em escala 0-10
}

const PENALTY_STARS_PER_POINT = 0.5;

export default function EmployeePerformanceCharts({
  open, onClose, employeeId, employeeName, cycles, criteria,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [evolution, setEvolution] = useState<{ cycle: string; estrelas: number }[]>([]);
  const [radar, setRadar] = useState<{ criterio: string; nota: number; fullMark: 5 }[]>([]);
  const [latestStars, setLatestStars] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !employeeId) return;
    const load = async () => {
      setLoading(true);
      // Avaliações deste colaborador em todos os ciclos
      const { data: evals } = await supabase
        .from("evaluations")
        .select("id, cycle_id, final_score")
        .eq("employee_id", employeeId);
      const evalIds = (evals ?? []).map((e: any) => e.id);

      // Notas por critério (para o radar do ciclo mais recente)
      const { data: scores } = evalIds.length
        ? await supabase
            .from("evaluation_scores")
            .select("evaluation_id, criterion_id, score")
            .in("evaluation_id", evalIds)
        : { data: [] as any[] };

      // Infrações por ciclo (para Disciplina e penalidade)
      const { data: infs } = await supabase
        .from("employee_infractions")
        .select("cycle_id, applied_weight, occurred_on")
        .eq("employee_id", employeeId);

      const infByCycle: Record<string, number> = {};
      for (const i of infs ?? []) {
        if (i.cycle_id) infByCycle[i.cycle_id] = (infByCycle[i.cycle_id] ?? 0) + Number(i.applied_weight);
      }

      // Mapas auxiliares
      const cycleById = Object.fromEntries(cycles.map((c) => [c.id, c]));
      const evalByCycle = Object.fromEntries((evals ?? []).map((e: any) => [e.cycle_id, e]));
      const totalCriteriaWeight = criteria.reduce((acc, c) => acc + Number(c.weight), 0);

      // Linha de evolução
      const points = cycles
        .filter((c) => evalByCycle[c.id] || infByCycle[c.id])
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
        .map((c) => {
          const ev = evalByCycle[c.id];
          const baseFinal = ev?.final_score != null ? Number(ev.final_score) : null;
          const w = infByCycle[c.id] ?? 0;
          const disc = Math.max(0, 10 - w * 1); // 1 ponto na escala 10 = 0.5 estrela
          const baseW = totalCriteriaWeight;
          const baseSum = (baseFinal ?? 0) * baseW;
          const total = baseSum + disc * 1;
          const div = baseW + 1;
          const adjusted10 = div > 0 ? total / div : 0;
          return {
            cycle: c.name,
            estrelas: Math.round((adjusted10 / 2) * 10) / 10,
          };
        });
      setEvolution(points);

      // Radar do ciclo mais recente com avaliação
      const sortedEvals = (evals ?? [])
        .filter((e: any) => cycleById[e.cycle_id])
        .sort((a: any, b: any) =>
          (cycleById[b.cycle_id]?.start_date ?? "").localeCompare(cycleById[a.cycle_id]?.start_date ?? ""),
        );
      const latest = sortedEvals[0];
      if (latest) {
        const scoreMap: Record<string, number> = {};
        for (const s of scores ?? []) {
          if (s.evaluation_id === latest.id) scoreMap[s.criterion_id] = Number(s.score);
        }
        const w = infByCycle[latest.cycle_id] ?? 0;
        const disciplina10 = Math.max(0, 10 - w);
        const radarData = [
          ...criteria.map((c) => ({
            criterio: c.name,
            nota: Math.round(((scoreMap[c.id] ?? 0) / 2) * 10) / 10,
            fullMark: 5 as const,
          })),
          {
            criterio: "Disciplina",
            nota: Math.round((disciplina10 / 2) * 10) / 10,
            fullMark: 5 as const,
          },
        ];
        setRadar(radarData);
        setLatestStars(points[points.length - 1]?.estrelas ?? null);
      } else {
        setRadar([]);
        setLatestStars(null);
      }
      setLoading(false);
    };
    load();
  }, [open, employeeId, cycles, criteria]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Desempenho — {employeeName}</DialogTitle>
          <DialogDescription>
            Histórico de avaliações ao longo dos ciclos e detalhamento por critério no ciclo mais recente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : evolution.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Sem avaliações ou infrações registradas para este colaborador.</div>
        ) : (
          <div className="space-y-6">
            {latestStars != null && (
              <div className="flex items-center justify-between border rounded-md p-3">
                <span className="text-sm text-muted-foreground">Nota mais recente</span>
                <div className="flex items-center gap-3">
                  <StarRating value={latestStars} readOnly size={20} />
                  <span className="font-semibold">{latestStars.toFixed(1)} / 5</span>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2">Evolução por ciclo</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="cycle" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toFixed(1)} ★`, "Nota"]}
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="estrelas"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {radar.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Critérios — ciclo mais recente</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radar}>
                      <PolarGrid className="stroke-muted" />
                      <PolarAngleAxis dataKey="criterio" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <Radar
                        dataKey="nota"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.4}
                      />
                      <Tooltip
                        formatter={(v: any) => [`${Number(v).toFixed(1)} ★`, "Nota"]}
                        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
