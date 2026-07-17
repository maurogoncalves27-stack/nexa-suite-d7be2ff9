import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, ShieldAlert } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { ClimateQuestion } from "@/pages/Climate";

interface Survey {
  id: string;
  name: string;
  year: number;
  semester: number;
  status: string;
  start_date: string;
  end_date: string;
}
interface ResponseRow { id: string; survey_id: string; }
interface AnswerRow { response_id: string; question_id: string; numeric_value: number | null; }

const MIN_FOR_DISPLAY = 5;
const DIMENSIONS = ["Liderança", "Ambiente", "Reconhecimento", "Orgulho", "Geral"] as const;

const DIM_COLORS: Record<string, string> = {
  "Liderança": "hsl(var(--primary))",
  "Ambiente": "hsl(var(--success))",
  "Reconhecimento": "hsl(var(--warning))",
  "Orgulho": "hsl(var(--accent))",
  "Geral": "hsl(var(--muted-foreground))",
};

interface Aggregated {
  surveyId: string;
  surveyLabel: string;
  totalResponses: number;
  overall: number | null;
  enps: number | null;
  byDimension: Record<string, number>;
}

export default function ClimateComparativo({ questions }: { questions: ClimateQuestion[] }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Aggregated[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: surveys } = await supabase
        .from("climate_surveys")
        .select("id, name, year, semester, status, start_date, end_date")
        .order("year", { ascending: true })
        .order("semester", { ascending: true });
      const surveyList = (surveys ?? []) as Survey[];

      if (surveyList.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const { data: responses } = await supabase
        .from("climate_responses")
        .select("id, survey_id")
        .in("survey_id", surveyList.map((s) => s.id));
      const respList = (responses ?? []) as ResponseRow[];

      const respIds = respList.map((r) => r.id);
      let answersList: AnswerRow[] = [];
      if (respIds.length > 0) {
        // batch to avoid IN() overflow
        const chunk = 500;
        for (let i = 0; i < respIds.length; i += chunk) {
          const slice = respIds.slice(i, i + chunk);
          const { data: ans } = await supabase
            .from("climate_response_answers")
            .select("response_id, question_id, numeric_value")
            .in("response_id", slice);
          answersList = answersList.concat((ans ?? []) as AnswerRow[]);
        }
      }

      // question lookups: need question_type + dimension. Load ALL (active + inactive)
      // so historical surveys with archived questions still resolve.
      const { data: allQs } = await supabase
        .from("climate_questions")
        .select("id, dimension, question_type");
      const qMap = new Map<string, { dimension: string; question_type: string }>();
      for (const q of (allQs ?? []) as any[]) qMap.set(q.id, { dimension: q.dimension, question_type: q.question_type });

      // group responses by survey
      const respBySurvey = new Map<string, string[]>();
      for (const r of respList) {
        if (!respBySurvey.has(r.survey_id)) respBySurvey.set(r.survey_id, []);
        respBySurvey.get(r.survey_id)!.push(r.id);
      }

      const answersByResp = new Map<string, AnswerRow[]>();
      for (const a of answersList) {
        if (!answersByResp.has(a.response_id)) answersByResp.set(a.response_id, []);
        answersByResp.get(a.response_id)!.push(a);
      }

      const aggregated: Aggregated[] = surveyList.map((s) => {
        const rIds = respBySurvey.get(s.id) ?? [];
        const allAns: AnswerRow[] = [];
        for (const rid of rIds) {
          const arr = answersByResp.get(rid);
          if (arr) allAns.push(...arr);
        }
        // overall + per-dim (scale_1_5 only)
        const dimAcc: Record<string, { sum: number; count: number }> = {};
        const scaleAcc: number[] = [];
        const enpsVals: number[] = [];
        for (const a of allAns) {
          const q = qMap.get(a.question_id);
          if (!q || a.numeric_value == null) continue;
          if (q.question_type === "scale_1_5") {
            scaleAcc.push(Number(a.numeric_value));
            if (!dimAcc[q.dimension]) dimAcc[q.dimension] = { sum: 0, count: 0 };
            dimAcc[q.dimension].sum += Number(a.numeric_value);
            dimAcc[q.dimension].count += 1;
          } else if (q.question_type === "enps_0_10") {
            enpsVals.push(Number(a.numeric_value));
          }
        }
        const byDimension: Record<string, number> = {};
        for (const [dim, v] of Object.entries(dimAcc)) {
          byDimension[dim] = v.count > 0 ? v.sum / v.count : 0;
        }
        const overall = scaleAcc.length > 0 ? scaleAcc.reduce((a, b) => a + b, 0) / scaleAcc.length : null;
        let enps: number | null = null;
        if (enpsVals.length > 0) {
          const prom = enpsVals.filter((v) => v >= 9).length;
          const detr = enpsVals.filter((v) => v <= 6).length;
          enps = ((prom - detr) / enpsVals.length) * 100;
        }
        return {
          surveyId: s.id,
          surveyLabel: s.name.length > 22 ? s.name.slice(0, 20) + "…" : s.name,
          totalResponses: rIds.length,
          overall,
          enps,
          byDimension,
        };
      }).filter((a) => a.totalResponses >= MIN_FOR_DISPLAY);

      setData(aggregated);
      setLoading(false);
    })();
  }, []);

  const lineChartData = useMemo(() => {
    return data.map((a) => {
      const row: any = { name: a.surveyLabel, respostas: a.totalResponses };
      for (const dim of DIMENSIONS) {
        if (a.byDimension[dim] != null) row[dim] = Number(a.byDimension[dim].toFixed(2));
      }
      if (a.overall != null) row["Média geral"] = Number(a.overall.toFixed(2));
      return row;
    });
  }, [data]);

  const enpsChartData = useMemo(
    () => data.filter((a) => a.enps != null).map((a) => ({ name: a.surveyLabel, eNPS: Math.round(a.enps!) })),
    [data]
  );

  const comparativoUltimas = useMemo(() => {
    if (data.length < 2) return null;
    const anterior = data[data.length - 2];
    const atual = data[data.length - 1];
    const rows = DIMENSIONS
      .filter((d) => atual.byDimension[d] != null || anterior.byDimension[d] != null)
      .map((d) => {
        const a = anterior.byDimension[d] ?? null;
        const b = atual.byDimension[d] ?? null;
        const delta = a != null && b != null ? b - a : null;
        return { dimension: d, anterior: a, atual: b, delta };
      });
    return { anterior, atual, rows };
  }, [data]);

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 text-warning mx-auto" />
          <p className="text-sm text-muted-foreground">
            Nenhuma campanha com <strong>{MIN_FOR_DISPLAY}+ respostas</strong> disponível para o comparativo.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 1) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 text-warning mx-auto" />
          <p className="text-sm text-muted-foreground">
            Apenas <strong>1 campanha</strong> disponível. O comparativo aparece a partir da 2ª rodada com respostas suficientes.
          </p>
          <p className="text-xs text-muted-foreground">
            Campanha atual: {data[0].surveyLabel} · {data[0].totalResponses} resposta(s)
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{data.length} campanhas</Badge>
        <span className="text-xs text-muted-foreground">
          Somente campanhas com {MIN_FOR_DISPLAY}+ respostas aparecem no comparativo (anonimato).
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução por dimensão (1-5)</CardTitle>
          <CardDescription>Média das respostas em cada campanha ao longo do tempo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {DIMENSIONS.map((dim) => (
                  <Line
                    key={dim}
                    type="monotone"
                    dataKey={dim}
                    stroke={DIM_COLORS[dim]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {enpsChartData.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">eNPS histórico</CardTitle>
            <CardDescription>Escala -100 a +100. Meta interna: acima de +30.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enpsChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[-100, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="eNPS" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {comparativoUltimas && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Última rodada vs anterior</CardTitle>
            <CardDescription>
              {comparativoUltimas.anterior.surveyLabel} → {comparativoUltimas.atual.surveyLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3">Dimensão</th>
                    <th className="py-2 pr-3 text-right">Anterior</th>
                    <th className="py-2 pr-3 text-right">Atual</th>
                    <th className="py-2 pr-3 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoUltimas.rows.map((r) => {
                    const Icon = r.delta == null ? Minus : r.delta > 0 ? TrendingUp : r.delta < 0 ? TrendingDown : Minus;
                    const color =
                      r.delta == null ? "text-muted-foreground" :
                      r.delta > 0.05 ? "text-success" :
                      r.delta < -0.05 ? "text-destructive" :
                      "text-muted-foreground";
                    return (
                      <tr key={r.dimension} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-foreground">{r.dimension}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {r.anterior != null ? r.anterior.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-foreground">
                          {r.atual != null ? r.atual.toFixed(2) : "—"}
                        </td>
                        <td className={`py-2 pr-3 text-right font-medium ${color}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            <Icon className="h-3.5 w-3.5" />
                            {r.delta != null ? (r.delta > 0 ? "+" : "") + r.delta.toFixed(2) : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
