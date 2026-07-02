import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, MessageSquare, TrendingUp, Lightbulb, AlertTriangle, Heart } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type WeeklyReport = {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  conversations_total: number;
  conversations_analyzed: number;
  metrics: any;
  analysis: any;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  rating: string | null;
  sentiment: string | null;
  comment: string | null;
  raw_response: string | null;
  created_at: string;
  phone: string | null;
};

export function GianaAnalyticsPanel() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, f] = await Promise.all([
        supabase.from("giana_weekly_reports").select("*").order("week_start", { ascending: false }).limit(8),
        supabase.from("giana_feedback").select("id, rating, sentiment, comment, raw_response, created_at, phone").order("created_at", { ascending: false }).limit(30),
      ]);
      setReports((r.data as any) ?? []);
      setFeedback((f.data as any) ?? []);
      if (r.data && r.data.length > 0 && !expandedReport) setExpandedReport(r.data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("giana-weekly-review", { body: { force: true } });
      if (error) throw error;
      toast.success("Análise gerada", { description: `${(data as any)?.report?.conversations_analyzed ?? 0} conversas analisadas` });
      await load();
    } catch (e: any) {
      toast.error("Falha ao gerar análise", { description: e.message });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const last = reports[0];
  const prev = reports[1];
  const csatNow = last?.metrics?.csat_pct as number | null;
  const csatPrev = prev?.metrics?.csat_pct as number | null;
  const csatDelta = (csatNow != null && csatPrev != null) ? +(csatNow - csatPrev).toFixed(1) : null;

  const positivos = feedback.filter(f => f.rating === "positive" || f.sentiment === "positive").length;
  const negativos = feedback.filter(f => f.rating === "negative" || f.sentiment === "negative").length;
  const respondidos = feedback.length;
  const csatRecente = respondidos > 0 ? Math.round(positivos / respondidos * 100) : null;

  return (
    <div className="space-y-4">
      {/* Cards de topo */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="h-3.5 w-3.5" />CSAT (últimos 30)</div>
            <div className="text-2xl font-bold mt-1">{csatRecente ?? "—"}{csatRecente != null && <span className="text-sm font-normal text-muted-foreground">%</span>}</div>
            <div className="text-xs text-muted-foreground mt-1">{respondidos} respostas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5 text-success" />Positivos</div>
            <div className="text-2xl font-bold mt-1 text-success">{positivos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsDown className="h-3.5 w-3.5 text-destructive" />Negativos</div>
            <div className="text-2xl font-bold mt-1 text-destructive">{negativos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />CSAT semana</div>
            <div className="text-2xl font-bold mt-1 flex items-baseline gap-2">
              {csatNow != null ? <>{csatNow}<span className="text-sm font-normal text-muted-foreground">%</span></> : "—"}
              {csatDelta != null && (
                <span className={`text-xs font-medium ${csatDelta >= 0 ? "text-success" : "text-destructive"}`}>
                  {csatDelta >= 0 ? "+" : ""}{csatDelta}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{last ? format(new Date(last.week_start), "dd/MM", { locale: ptBR }) + "–" + format(new Date(last.week_end), "dd/MM", { locale: ptBR }) : "sem relatório"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Botão rodar agora */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold">Relatórios semanais</h3>
          <p className="text-xs text-muted-foreground">Gerados automaticamente toda segunda 08:00</p>
        </div>
        <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Rodar análise agora
        </Button>
      </div>

      {/* Relatórios */}
      {reports.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum relatório ainda. Clique em "Rodar análise agora" para gerar o primeiro.
        </CardContent></Card>
      ) : reports.map((r) => {
        const open = expandedReport === r.id;
        const a = r.analysis ?? {};
        const m = r.metrics ?? {};
        return (
          <Card key={r.id}>
            <CardHeader className="cursor-pointer" onClick={() => setExpandedReport(open ? null : r.id)}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {format(new Date(r.week_start), "dd 'de' MMM", { locale: ptBR })} — {format(new Date(r.week_end), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                  </CardTitle>
                  <CardDescription>
                    {r.conversations_analyzed} de {r.conversations_total} conversas analisadas
                    {m.csat_pct != null && ` · CSAT ${m.csat_pct}%`}
                    {m.escaladas_para_humano > 0 && ` · ${m.escaladas_para_humano} escaladas`}
                  </CardDescription>
                </div>
                <Badge variant="outline">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</Badge>
              </div>
            </CardHeader>
            {open && (
              <CardContent className="space-y-4">
                {a.resumo_executivo && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">{a.resumo_executivo}</div>
                )}

                <Section title="Problemas recorrentes" icon={AlertTriangle} tone="destructive" items={a.problemas_recorrentes} render={(p: any) => (
                  <div>
                    <div className="font-medium">{p.categoria} <span className="text-muted-foreground">· {p.frequencia}x</span></div>
                    <div className="text-muted-foreground">{p.descricao}</div>
                  </div>
                )} />

                <Section title="Respostas ruins da Giana" icon={ThumbsDown} tone="warning" items={a.respostas_ruins} render={(p: any) => (
                  <div>
                    <div className="font-medium">{p.problema}</div>
                    <div className="italic text-muted-foreground">"{p.trecho_giana}"</div>
                    <div className="mt-1"><span className="text-xs font-semibold">Correção:</span> {p.correcao_sugerida}</div>
                  </div>
                )} />

                <Section title="Sugestões pro prompt" icon={Lightbulb} tone="primary" items={a.sugestoes_prompt} render={(p: any) => (
                  <div>
                    <div className="font-medium">{p.titulo}</div>
                    <div className="rounded bg-muted/50 px-2 py-1 font-mono text-xs mt-1">{p.instrucao_a_adicionar}</div>
                    <div className="text-xs text-muted-foreground mt-1">{p.por_que}</div>
                  </div>
                )} />

                <Section title="Oportunidades de nova tool" icon={Sparkles} tone="primary" items={a.oportunidades_de_tool} render={(p: any) => (
                  <div>
                    <div className="font-medium">{p.necessidade} <span className="text-muted-foreground">· {p.frequencia}x</span></div>
                    <div className="text-muted-foreground">{p.descricao}</div>
                  </div>
                )} />

                <Section title="Elogios" icon={Heart} tone="success" items={a.elogios} render={(p: any) => (
                  <div>
                    <div className="font-medium">{p.tema}</div>
                    <div className="italic text-muted-foreground">"{p.trecho}"</div>
                  </div>
                )} />
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Feedback recente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />Últimos feedbacks de cliente</CardTitle>
          <CardDescription>Respostas 👍/👎 coletadas ao final das conversas</CardDescription>
        </CardHeader>
        <CardContent>
          {feedback.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhum feedback coletado ainda.</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {feedback.map(f => (
                <div key={f.id} className="flex items-start gap-3 border-b pb-2 last:border-0">
                  <div className="mt-0.5">
                    {f.rating === "positive" ? <ThumbsUp className="h-4 w-4 text-success" /> :
                     f.rating === "negative" ? <ThumbsDown className="h-4 w-4 text-destructive" /> :
                     <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{f.comment || f.raw_response || <span className="text-muted-foreground italic">sem comentário</span>}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.phone ? `${f.phone.slice(-4).padStart(f.phone.length, "•")} · ` : ""}
                      {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, icon: Icon, tone, items, render }: {
  title: string; icon: any; tone: "destructive" | "warning" | "primary" | "success"; items: any[] | undefined; render: (i: any) => JSX.Element;
}) {
  if (!items || items.length === 0) return null;
  const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary";
  return (
    <div>
      <div className={`text-sm font-semibold flex items-center gap-2 mb-2 ${color}`}><Icon className="h-4 w-4" />{title}</div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-md border p-2 text-sm">{render(it)}</div>
        ))}
      </div>
    </div>
  );
}
