import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Smile, Meh, Frown, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClimateQuestion } from "@/pages/Climate";

interface Survey { id: string; name: string; year: number; semester: number; status: string; }
interface ResponseRow { id: string; survey_id: string; store_id: string | null; position: string | null; }
interface AnswerRow { response_id: string; question_id: string; numeric_value: number | null; text_value: string | null; }

const MIN_FOR_DISPLAY = 5;

export default function ClimateResults({ questions }: { questions: ClimateQuestion[] }) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from("climate_surveys")
          .select("id, name, year, semester, status")
          .order("year", { ascending: false })
          .order("semester", { ascending: false }),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
      ]);
      const list = (data ?? []) as Survey[];
      setSurveys(list);
      if (list.length > 0) setSelectedId(list[0].id);
      setEmployeeCount(count ?? 0);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      setLoading(true);
      const { data: rs } = await supabase
        .from("climate_responses")
        .select("id, survey_id, store_id, position")
        .eq("survey_id", selectedId);
      const list = (rs ?? []) as ResponseRow[];
      setResponses(list);
      if (list.length > 0) {
        const { data: ans } = await supabase
          .from("climate_response_answers")
          .select("response_id, question_id, numeric_value, text_value")
          .in("response_id", list.map((r) => r.id));
        setAnswers((ans ?? []) as AnswerRow[]);
      } else {
        setAnswers([]);
      }
      setLoading(false);
    })();
  }, [selectedId]);

  const dims = useMemo(() => {
    const acc: Record<string, { sum: number; count: number }> = {};
    for (const a of answers) {
      const q = questions.find((x) => x.id === a.question_id);
      if (!q || q.question_type !== "scale_1_5" || a.numeric_value == null) continue;
      if (!acc[q.dimension]) acc[q.dimension] = { sum: 0, count: 0 };
      acc[q.dimension].sum += Number(a.numeric_value);
      acc[q.dimension].count += 1;
    }
    return Object.entries(acc).map(([dim, v]) => ({
      dimension: dim,
      avg: v.count > 0 ? v.sum / v.count : 0,
      count: v.count,
    })).sort((a, b) => a.dimension.localeCompare(b.dimension));
  }, [answers, questions]);

  const overallAvg = useMemo(() => {
    const list = answers.filter((a) => {
      const q = questions.find((x) => x.id === a.question_id);
      return q?.question_type === "scale_1_5" && a.numeric_value != null;
    });
    if (list.length === 0) return null;
    return list.reduce((s, a) => s + Number(a.numeric_value!), 0) / list.length;
  }, [answers, questions]);

  const enps = useMemo(() => {
    const enpsQ = questions.find((q) => q.question_type === "enps_0_10");
    if (!enpsQ) return null;
    const vals = answers.filter((a) => a.question_id === enpsQ.id && a.numeric_value != null).map((a) => Number(a.numeric_value));
    if (vals.length === 0) return null;
    const promoters = vals.filter((v) => v >= 9).length;
    const detractors = vals.filter((v) => v <= 6).length;
    const score = ((promoters - detractors) / vals.length) * 100;
    return { score, total: vals.length, promoters, detractors, passives: vals.length - promoters - detractors };
  }, [answers, questions]);

  const comments = useMemo(() => {
    const openQs = new Set(questions.filter((q) => q.question_type === "open_text").map((q) => q.id));
    return answers.filter((a) => openQs.has(a.question_id) && a.text_value).map((a) => a.text_value!);
  }, [answers, questions]);

  const total = responses.length;

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (surveys.length === 0) {
    return <div className="text-center text-muted-foreground py-10">Nenhuma campanha cadastrada ainda.</div>;
  }

  const enpsLabel = (s: number) => s >= 50 ? "Excelente" : s >= 0 ? "Bom" : s >= -50 ? "Atenção" : "Crítico";
  const enpsIcon = (s: number) => s >= 30 ? Smile : s >= 0 ? Meh : Frown;
  const EnpsIcon = enps ? enpsIcon(enps.score) : Meh;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="text-sm text-muted-foreground shrink-0">Campanha:</span>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {surveys.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name} · {s.status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="self-start sm:self-auto">{total}/{employeeCount} respostas</Badge>
      </div>

      {total < MIN_FOR_DISPLAY ? (
        <Card>
          <CardContent className="py-8 text-center space-y-2">
            <ShieldAlert className="h-8 w-8 text-warning mx-auto" />
            <p className="text-sm text-muted-foreground">
              Mínimo de <strong>{MIN_FOR_DISPLAY} respostas</strong> necessário para exibir resultados (preserva o anonimato).
              <br />Atualmente: {total} resposta(s).
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6"><CardTitle className="text-xs sm:text-sm text-muted-foreground">Média geral</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{overallAvg ? overallAvg.toFixed(2) : "—"}<span className="text-sm sm:text-base text-muted-foreground"> / 5</span></div>
              </CardContent>
            </Card>
            {enps && (
              <Card>
                <CardHeader className="pb-2 p-3 sm:p-6"><CardTitle className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2"><EnpsIcon className="h-4 w-4" /> eNPS</CardTitle></CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-2xl sm:text-3xl font-bold text-foreground">{enps.score.toFixed(0)}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{enpsLabel(enps.score)} · {enps.promoters}p · {enps.passives}n · {enps.detractors}d</div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6"><CardTitle className="text-xs sm:text-sm text-muted-foreground">Total respostas</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{total}<span className="text-sm sm:text-base text-muted-foreground">/{employeeCount}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6"><CardTitle className="text-xs sm:text-sm text-muted-foreground">Comentários</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{comments.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Médias por dimensão</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {dims.map((d) => (
                <div key={d.dimension}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-foreground">{d.dimension}</span>
                    <span className="text-muted-foreground">{d.avg.toFixed(2)} / 5</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${(d.avg / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {comments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comentários abertos</CardTitle>
                <CardDescription>Apresentados em ordem aleatória, sem identificação.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {comments.map((c, i) => (
                    <li key={i} className="text-sm bg-muted/50 rounded p-3 text-foreground">"{c}"</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
