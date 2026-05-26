import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, Award, ShieldAlert } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Legend } from "recharts";

const MONTHS_BACK = 6;

const monthsRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - (MONTHS_BACK - 1), 1);
  return start.toISOString().slice(0, 10);
};

interface Slice { name: string; value: number; color: string }

export default function AnalyticsCharts() {
  const [movement, setMovement] = useState<Slice[]>([]);
  const [scoreData, setScoreData] = useState<{ avg: number | null; slices: Slice[] }>({ avg: null, slices: [] });
  const [discipline, setDiscipline] = useState<Slice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const rangeStart = monthsRange();

      const [
        { data: emps },
        { data: evals },
        { data: warnings },
        { data: infractions },
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("admission_date, hire_date, termination_date")
          .or(`admission_date.gte.${rangeStart},hire_date.gte.${rangeStart},termination_date.gte.${rangeStart}`),
        supabase
          .from("evaluations")
          .select("final_score, created_at")
          .gte("created_at", rangeStart)
          .not("final_score", "is", null),
        supabase
          .from("employee_warnings")
          .select("issued_at")
          .gte("issued_at", rangeStart),
        supabase
          .from("employee_infractions")
          .select("occurred_on")
          .gte("occurred_on", rangeStart),
      ]);

      const admissoes = (emps ?? []).filter((e: any) => {
        const ref = e.admission_date || e.hire_date;
        return ref && ref >= rangeStart;
      }).length;
      const desligamentos = (emps ?? []).filter((e: any) => e.termination_date && e.termination_date >= rangeStart).length;

      setMovement([
        { name: "Admissões", value: admissoes, color: "hsl(var(--primary))" },
        { name: "Desligamentos", value: desligamentos, color: "hsl(var(--destructive))" },
      ]);

      const list = (evals ?? []) as { final_score: number }[];
      const avg = list.length
        ? list.reduce((s, e) => s + Number(e.final_score), 0) / list.length
        : null;
      // Buckets de notas (1-3 baixo, 4-6 médio, 7-8 bom, 9-10 ótimo)
      const buckets = { baixo: 0, medio: 0, bom: 0, otimo: 0 };
      list.forEach((e) => {
        const s = Number(e.final_score);
        if (s <= 3) buckets.baixo++;
        else if (s <= 6) buckets.medio++;
        else if (s <= 8) buckets.bom++;
        else buckets.otimo++;
      });
      setScoreData({
        avg,
        slices: [
          { name: "Baixo (≤3)", value: buckets.baixo, color: "hsl(var(--destructive))" },
          { name: "Médio (4-6)", value: buckets.medio, color: "hsl(var(--warning))" },
          { name: "Bom (7-8)", value: buckets.bom, color: "hsl(var(--primary))" },
          { name: "Ótimo (9-10)", value: buckets.otimo, color: "hsl(var(--success))" },
        ],
      });

      setDiscipline([
        { name: "Advertências", value: (warnings ?? []).length, color: "hsl(var(--warning))" },
        { name: "Infrações", value: (infractions ?? []).length, color: "hsl(var(--destructive))" },
      ]);

      setLoading(false);
    })();
  }, []);

  const renderDonut = (slices: Slice[], centerLabel?: string, centerValue?: string) => {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      return (
        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
          Sem dados no período
        </div>
      );
    }
    return (
      <ChartContainer
        config={Object.fromEntries(slices.map((s) => [s.name, { label: s.name, color: s.color }]))}
        className="h-[220px] w-full"
      >
        <ResponsiveContainer>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              strokeWidth={2}
              stroke="hsl(var(--background))"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Movimentação de pessoal
          </CardTitle>
          <p className="text-xs text-muted-foreground">Admissões vs. desligamentos · {MONTHS_BACK} meses</p>
        </CardHeader>
        <CardContent>{renderDonut(movement)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base flex-wrap">
            <Award className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Desempenho</span>
            {scoreData.avg != null && (
              <span className="ml-auto text-sm font-semibold text-primary shrink-0">
                Média {scoreData.avg.toFixed(1)}
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Distribuição de notas · {MONTHS_BACK} meses</p>
        </CardHeader>
        <CardContent>{renderDonut(scoreData.slices)}</CardContent>
      </Card>

      <Card className="md:col-span-2 xl:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            Disciplina
          </CardTitle>
          <p className="text-xs text-muted-foreground">Advertências e infrações · {MONTHS_BACK} meses</p>
        </CardHeader>
        <CardContent>{renderDonut(discipline)}</CardContent>
      </Card>
    </div>
  );
}
