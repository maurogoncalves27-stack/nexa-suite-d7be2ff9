import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, ArrowRight, Target, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Analysis = {
  diagnostico?: string;
  pontos_fortes?: string[];
  pontos_de_atencao?: { titulo: string; detalhe: string; severidade: "baixa" | "media" | "alta" }[];
  acoes_sugeridas?: { titulo: string; descricao: string; impacto: string; esforco: string; quando: string }[];
  metrica_para_acompanhar?: string;
};

const SEV_COLOR: Record<string, string> = {
  alta: "text-destructive border-destructive/40 bg-destructive/5",
  media: "text-warning border-warning/40 bg-warning/5",
  baixa: "text-muted-foreground border-border bg-muted/40",
};

const IMPACT_LABEL: Record<string, string> = { alto: "Alto impacto", medio: "Médio impacto", baixo: "Baixo impacto" };
const WHEN_LABEL: Record<string, string> = { hoje: "Hoje", esta_semana: "Esta semana", este_mes: "Este mês" };

export function CrmAiInsightsButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-ai-insights", { body: {} });
      if (error) throw error;
      setAnalysis((data as any)?.analysis ?? null);
      setGeneratedAt((data as any)?.generated_at ?? null);
    } catch (e: any) {
      toast.error("Falha na análise", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    if (!analysis && !loading) void run();
  };

  return (
    <>
      <Button onClick={handleOpen} className="gap-2 shrink-0">
        <Sparkles className="h-4 w-4" />
        Análise IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Análise IA do CRM
            </DialogTitle>
            <DialogDescription>
              Diagnóstico dos últimos 14 dias com sugestões de ação.
              {generatedAt && ` · gerado ${new Date(generatedAt).toLocaleString("pt-BR")}`}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Analisando reservas, conversas, tickets, avaliações e feedback…
            </div>
          ) : !analysis ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sem análise disponível.</div>
          ) : (
            <div className="space-y-5">
              {analysis.diagnostico && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                  {analysis.diagnostico}
                </div>
              )}

              {analysis.metrica_para_acompanhar && (
                <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                  <Target className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div><span className="font-semibold">Métrica-chave: </span>{analysis.metrica_para_acompanhar}</div>
                </div>
              )}

              {analysis.pontos_fortes && analysis.pontos_fortes.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-success">
                    <CheckCircle2 className="h-4 w-4" />Pontos fortes
                  </h3>
                  <ul className="space-y-1">
                    {analysis.pontos_fortes.map((p, i) => (
                      <li key={i} className="text-sm flex gap-2"><span className="text-success">•</span>{p}</li>
                    ))}
                  </ul>
                </section>
              )}

              {analysis.pontos_de_atencao && analysis.pontos_de_atencao.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />Pontos de atenção
                  </h3>
                  <div className="space-y-2">
                    {analysis.pontos_de_atencao.map((p, i) => (
                      <div key={i} className={`rounded-md border p-2.5 text-sm ${SEV_COLOR[p.severidade] ?? SEV_COLOR.baixa}`}>
                        <div className="font-medium flex items-center justify-between gap-2">
                          <span>{p.titulo}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{p.severidade}</Badge>
                        </div>
                        <div className="text-muted-foreground mt-0.5">{p.detalhe}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {analysis.acoes_sugeridas && analysis.acoes_sugeridas.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-primary">
                    <ArrowRight className="h-4 w-4" />Ações sugeridas
                  </h3>
                  <div className="space-y-2">
                    {analysis.acoes_sugeridas.map((a, i) => (
                      <div key={i} className="rounded-md border p-2.5 text-sm">
                        <div className="font-medium">{a.titulo}</div>
                        <div className="text-muted-foreground mt-0.5">{a.descricao}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="secondary" className="text-[10px]">{IMPACT_LABEL[a.impacto] ?? a.impacto}</Badge>
                          <Badge variant="outline" className="text-[10px]">Esforço {a.esforco}</Badge>
                          <Badge variant="outline" className="text-[10px]">{WHEN_LABEL[a.quando] ?? a.quando}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" variant="outline" onClick={run} disabled={loading} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />Regerar análise
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
