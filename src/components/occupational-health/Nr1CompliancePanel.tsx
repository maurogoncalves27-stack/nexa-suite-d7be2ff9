import { useNr1Metrics } from "./useNr1Metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ShieldCheck,
  Brain,
  Stethoscope,
  FileCheck2,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Painel NR-1 — score 0-100 = média simples de 4 blocos (25% cada):
 *   Psicossocial (clima adesão + eNPS normalizado + humor + alertas)
 *   PCMSO (% ASOs válidos entre ativos)
 *   Atestados (100 − absenteísmo * 10, absenteísmo dos últimos 3 meses)
 *   Documentos SST (% vigentes)
 */
function scoreTone(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "Adequado", className: "bg-success/15 text-success border-success/40" };
  if (score >= 60) return { label: "Atenção", className: "bg-warning/15 text-warning border-warning/40" };
  return { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/40" };
}

function ScoreBadge({ score }: { score: number }) {
  const t = scoreTone(score);
  return <Badge variant="outline" className={t.className}>{score}/100 · {t.label}</Badge>;
}

export default function Nr1CompliancePanel({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data: m, isLoading } = useNr1Metrics();

  if (isLoading || !m) {
    return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Score geral */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Conformidade NR-1
            </span>
            <ScoreBadge score={m.scoreOverall} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={m.scoreOverall} className="h-3" />
          <p className="text-xs text-muted-foreground">
            Média ponderada dos 4 eixos abaixo (25% cada). NR-1 exige controle de riscos ocupacionais e psicossociais.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Bloco A — Psicossocial */}
        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => onNavigate("clima")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Riscos psicossociais</span>
              <ScoreBadge score={m.scorePsycho} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Última pesquisa de clima</span>
              <strong>{m.climateLastDate ? format(parseISO(m.climateLastDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Adesão</span>
              <strong>{m.climateAdherencePct != null ? `${m.climateAdherencePct}%` : "—"}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">eNPS</span>
              <strong>{m.climateENps != null ? m.climateENps : "—"}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Humor médio (30d)</span>
              <span className="flex items-center gap-1">
                {m.moodHiddenByPrivacy ? (
                  <span className="text-xs text-muted-foreground italic">oculto (N&lt;5, LGPD)</span>
                ) : (
                  <>
                    <strong>{m.moodAvg30d != null ? m.moodAvg30d.toFixed(2) : "—"}</strong>
                    {m.moodTrend != null && (m.moodTrend >= 0
                      ? <TrendingUp className="h-3 w-3 text-success" />
                      : <TrendingDown className="h-3 w-3 text-destructive" />)}
                  </>
                )}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Respondentes (30d)</span>
              <strong>{m.moodRespondents30d}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Alertas saúde mental abertos</span>
              <strong className={m.mentalAlertsOpen > 0 ? "text-warning" : ""}>{m.mentalAlertsOpen}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Resolvidos nos últimos 30d</span>
              <strong>{m.mentalAlertsResolved30d}</strong>
            </div>
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Riscos psicossociais abertos (PGR)</span>
                <strong className={m.psychoRisksHigh > 0 ? "text-destructive" : ""}>{m.psychoRisksOpen}</strong>
              </div>
              {m.psychoRisksHigh > 0 && (
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Alta severidade</span>
                  <strong className="text-destructive">{m.psychoRisksHigh}</strong>
                </div>
              )}
              {m.psychoRisksOverdue > 0 && (
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Fora do prazo</span>
                  <strong className="text-destructive">{m.psychoRisksOverdue}</strong>
                </div>
              )}
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Afastamentos CID F (12m)</span>
                <strong className={m.cidfCount12m > 0 ? "text-warning" : ""}>{m.cidfCount12m} · {m.cidfDays12m}d</strong>
              </div>
              {m.cidfEmployees90d >= 3 && (
                <div className="flex items-center gap-1 text-xs text-destructive pt-1">
                  <AlertTriangle className="h-3 w-3" /> {m.cidfEmployees90d} colaboradores com CID F em 90 dias — cluster detectado
                </div>
              )}
            </div>
            {Object.keys(m.climateAvgByDimension).length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Médias por dimensão</div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(m.climateAvgByDimension).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{k}</span><strong>{v.toFixed(2)}</strong></div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco B — PCMSO */}
        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => onNavigate("pcmso")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" />PCMSO / ASOs</span>
              <ScoreBadge score={m.scorePcmso} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Colaboradores ativos</span><strong>{m.activeEmployees}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Com ASO válido</span>
              <strong className="text-success">{m.pcmsoValid}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">A vencer em 60 dias</span>
              <strong className={m.pcmsoExpiring60 > 0 ? "text-warning" : ""}>{m.pcmsoExpiring60}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vencidos / sem ASO</span>
              <strong className={m.pcmsoExpired > 0 ? "text-destructive" : ""}>{m.pcmsoExpired}</strong>
            </div>
          </CardContent>
        </Card>

        {/* Bloco C — Atestados */}
        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => onNavigate("atestados")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Atestados e afastamentos</span>
              <ScoreBadge score={m.scoreAbsent} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Absenteísmo (últimos 3 meses)</span>
              <strong>{m.absenteeismRate3m != null ? `${m.absenteeismRate3m.toFixed(2)}%` : "—"}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dias perdidos (3m)</span><strong>{m.absenteeismDays3m}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dias perdidos (12m)</span><strong>{m.absenteeismDays12m}</strong></div>
            {m.topCids.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Top 5 CIDs (12m)</div>
                {m.topCids.map((c) => (
                  <div key={c.cid} className="flex justify-between text-xs"><span>{c.cid}</span><strong>{c.count}</strong></div>
                ))}
              </div>
            )}
            {m.daysByStoreMonth.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Dias perdidos no mês por loja</div>
                {m.daysByStoreMonth.map((s) => (
                  <div key={s.store} className="flex justify-between text-xs"><span>{s.store}</span><strong>{s.days}</strong></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco D — SST */}
        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => onNavigate("documentos-sst")}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />Documentos SST vigentes</span>
              <ScoreBadge score={m.scoreSst} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Documentos ativos</span><strong>{m.sstTotal}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vigentes</span>
              <strong className="text-success">{m.sstValid}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">A vencer em 60 dias</span>
              <strong className={m.sstExpiring60 > 0 ? "text-warning" : ""}>{m.sstExpiring60}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vencidos</span>
              <strong className={m.sstExpired > 0 ? "text-destructive" : ""}>{m.sstExpired}</strong>
            </div>
            {m.sstTotal === 0 && (
              <div className="flex items-center gap-2 text-warning text-xs pt-2 border-t">
                <AlertTriangle className="h-3 w-3" /> Nenhum documento SST cadastrado (PGR, LTCAT, PPP…).
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
