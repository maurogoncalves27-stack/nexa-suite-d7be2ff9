import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, ShieldCheck, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ClimateQuestion, ClimateSurvey } from "@/pages/Climate";

interface Props {
  survey: ClimateSurvey | null;
  questions: ClimateQuestion[];
  onSubmitted: () => void;
}

interface AnswerMap {
  [questionId: string]: { numeric_value?: number | null; text_value?: string | null };
}

const DIMENSION_ORDER = ["Liderança", "Ambiente", "Reconhecimento", "Orgulho", "Geral"] as const;

export default function ClimateRespond({ survey, questions, onSubmitted }: Props) {
  const { user } = useAuth();
  const [alreadyAnswered, setAlreadyAnswered] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!survey || !user) { setAlreadyAnswered(false); return; }
      const { data } = await supabase
        .from("climate_response_tokens")
        .select("id")
        .eq("survey_id", survey.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setAlreadyAnswered(!!data);
    };
    check();
  }, [survey, user]);

  const grouped = useMemo(() => {
    const map: Record<string, ClimateQuestion[]> = {};
    for (const q of questions) {
      if (!map[q.dimension]) map[q.dimension] = [];
      map[q.dimension].push(q);
    }
    return map;
  }, [questions]);

  const setNumeric = (qid: string, value: number) => {
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], numeric_value: value } }));
  };
  const setText = (qid: string, value: string) => {
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], text_value: value } }));
  };

  const submit = async () => {
    if (!survey || !user) return;
    if (questions.length === 0) {
      toast({ title: "Aguarde", description: "As perguntas ainda estão carregando. Tente novamente em instantes.", variant: "destructive" });
      return;
    }
    // valida obrigatórias (todas exceto open_text)
    const required = questions.filter((q) => q.question_type !== "open_text");
    if (required.length === 0) {
      toast({ title: "Erro", description: "Esta pesquisa não possui perguntas configuradas.", variant: "destructive" });
      return;
    }
    const missing = required.filter((q) => answers[q.id]?.numeric_value == null);
    if (missing.length > 0) {
      toast({ title: "Faltam respostas", description: `Responda as ${missing.length} pergunta(s) pendente(s).`, variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // Buscar loja/cargo do colaborador para guardar agregadamente (sem identificá-lo)
    const { data: emp } = await supabase
      .from("employees")
      .select("store_id, position")
      .eq("user_id", user.id)
      .maybeSingle();

    // 1) cria a resposta anônima
    const { data: respIns, error: respErr } = await supabase
      .from("climate_responses")
      .insert({
        survey_id: survey.id,
        store_id: emp?.store_id ?? null,
        position: emp?.position ?? null,
      })
      .select("id")
      .single();
    if (respErr || !respIns) {
      setSubmitting(false);
      toast({ title: "Erro", description: respErr?.message ?? "Falha ao registrar resposta", variant: "destructive" });
      return;
    }

    // 2) insere respostas das perguntas
    const rows = questions
      .map((q) => {
        const a = answers[q.id];
        if (q.question_type === "open_text") {
          if (!a?.text_value?.trim()) return null;
          return { response_id: respIns.id, question_id: q.id, text_value: a.text_value.trim(), numeric_value: null };
        }
        return { response_id: respIns.id, question_id: q.id, numeric_value: a?.numeric_value ?? null, text_value: null };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const { error: ansErr } = await supabase.from("climate_response_answers").insert(rows);
    if (ansErr) {
      setSubmitting(false);
      toast({ title: "Erro", description: ansErr.message, variant: "destructive" });
      return;
    }

    // 3) marca token anti-duplicação (separado da resposta)
    const { error: tokErr } = await supabase
      .from("climate_response_tokens")
      .insert({ survey_id: survey.id, user_id: user.id });
    if (tokErr) {
      // não bloqueia — resposta já foi salva. Loga aviso.
      console.warn("Falha ao registrar token:", tokErr.message);
    }

    setSubmitting(false);
    setAlreadyAnswered(true);
    toast({ title: "Obrigado!", description: "Sua resposta foi registrada anonimamente. Próxima pesquisa em ~6 meses." });
    onSubmitted();
  };

  if (!survey) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Nenhuma pesquisa de clima aberta no momento. Aguarde a próxima campanha semestral.
        </CardContent>
      </Card>
    );
  }

  if (alreadyAnswered === null) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (alreadyAnswered) {
    return (
      <Alert className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertTitle>Você já respondeu esta pesquisa</AlertTitle>
        <AlertDescription>
          Obrigado por participar do <strong>{survey.name}</strong>. Suas respostas foram registradas de forma anônima.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>{survey.name} · período {survey.start_date} a {survey.end_date}</AlertTitle>
        <AlertDescription>
          Esta pesquisa é <strong>100% anônima</strong>. Suas respostas não são vinculadas ao seu nome ou e-mail.
          Os relatórios são apresentados apenas de forma agregada (mínimo de 5 respostas por loja).
        </AlertDescription>
      </Alert>

      {DIMENSION_ORDER.filter((d) => grouped[d]?.length).map((dim) => (
        <Card key={dim}>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base">{dim}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            {grouped[dim].map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium text-foreground">{q.text}</p>
                {q.question_type === "scale_1_5" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-1.5 sm:flex sm:gap-2">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const active = answers[q.id]?.numeric_value === n;
                        return (
                          <Button
                            key={n}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() => setNumeric(q.id, n)}
                            className="w-full sm:w-12"
                          >
                            <Star className={`h-3 w-3 mr-1 ${active ? "fill-current" : ""}`} />
                            {n}
                          </Button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground block">
                      1 = Discordo totalmente · 5 = Concordo totalmente
                    </span>
                  </div>
                )}
                {q.question_type === "enps_0_10" && (
                  <div className="grid grid-cols-6 sm:grid-cols-11 gap-1">
                    {Array.from({ length: 11 }, (_, i) => i).map((n) => {
                      const active = answers[q.id]?.numeric_value === n;
                      return (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => setNumeric(q.id, n)}
                          className="w-full sm:w-10 px-0"
                        >
                          {n}
                        </Button>
                      );
                    })}
                  </div>
                )}
                {q.question_type === "open_text" && (
                  <Textarea
                    rows={3}
                    placeholder="Opcional"
                    value={answers[q.id]?.text_value ?? ""}
                    onChange={(e) => setText(q.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-stretch sm:justify-end">
        <Button onClick={submit} disabled={submitting} size="lg" className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Enviar respostas
        </Button>
      </div>
    </div>
  );
}
