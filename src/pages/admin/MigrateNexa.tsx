import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Database, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PlanResult = {
  ok: boolean;
  mode: string;
  totalTables: number;
  skipped: string[];
  order: string[];
  counts: Record<string, number>;
};

type TableResult = { read?: number; written?: number; errors?: any[]; error?: string; dryRun?: boolean };

const BATCH_SIZE = 8; // tabelas por chamada (cada call <150s)

export default function MigrateNexa() {
  const { isSuperUser, loading } = useAuth();
  const [running, setRunning] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [results, setResults] = useState<Record<string, TableResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null);

  if (loading) return null;
  if (!isSuperUser) return <Navigate to="/" replace />;

  const call = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("migrate-to-nexa", { body: payload });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const loadPlan = async () => {
    setRunning("plan");
    try {
      const d = await call({ mode: "plan" });
      setPlan(d as PlanResult);
      toast.success(`${d.totalTables} tabelas listadas`);
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setRunning(null);
    }
  };

  const runBatched = async (dry: boolean) => {
    setRunning(dry ? "dry" : "full");
    setResults({});
    try {
      // Garante plan
      const p: PlanResult = plan ?? (await call({ mode: "plan" }));
      if (!plan) setPlan(p);
      const total = p.totalTables;
      setProgress({ done: 0, total });

      // Desliga triggers no destino (só em full real)
      if (!dry) {
        try { await call({ mode: "triggers", triggers: "off" }); } catch (e) { /* segue */ }
      }

      try {
        let startIdx = 0;
        while (startIdx < total) {
          setProgress({ done: startIdx, total, current: p.order[startIdx] });
          const d = await call({ mode: "full", dry, startIdx, count: BATCH_SIZE });
          setResults((prev) => ({ ...prev, ...d.results }));
          startIdx = d.nextStartIdx ?? (startIdx + BATCH_SIZE);
          if (d.done) break;
        }
        setProgress({ done: total, total });
        toast.success(dry ? "Dry-run completo" : "Migração concluída");
      } finally {
        if (!dry) {
          try { await call({ mode: "triggers", triggers: "on" }); } catch (e) { /* segue */ }
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setRunning(null);
    }
  };

  const totalRows = plan ? Object.values(plan.counts).reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0;
  const resultEntries = Object.entries(results);
  const errored = resultEntries.filter(([, r]) => r.error || (r.errors && r.errors.length));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Migrar dados para o NEXA
        </h1>
        <p className="text-muted-foreground">
          Copia o conteúdo deste projeto para o projeto NEXA em lotes de {BATCH_SIZE} tabelas (para não estourar timeout). Pula{" "}
          <code>pdv_*</code>, <code>pos_*</code>, <code>saipos_*</code> e tabelas internas.
        </p>
      </div>

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p>Antes da primeira execução, rode no projeto NEXA o SQL auxiliar. Sem ele a função retorna erro.</p>
            <p>A migração é <strong>idempotente</strong> (upsert por id). Triggers do destino são desabilitados no início e religados no fim.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Listar o que será copiado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loadPlan} disabled={!!running}>
            {running === "plan" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Listar tabelas e contagens
          </Button>
          {plan && (
            <div className="text-sm space-y-2">
              <p><strong>{plan.totalTables}</strong> tabelas — total ~{totalRows.toLocaleString("pt-BR")} linhas.</p>
              <details>
                <summary className="cursor-pointer text-muted-foreground">Ver ordem e contagens</summary>
                <div className="mt-2 max-h-80 overflow-auto border rounded p-2 font-mono text-xs">
                  {plan.order.map((t) => (
                    <div key={t} className="flex justify-between gap-4">
                      <span>{t}</span>
                      <span className="text-muted-foreground">{plan.counts[t] ?? "?"}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Executar migração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runBatched(true)} disabled={!!running}>
              {running === "dry" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Dry-run (só lê)
            </Button>
            <Button onClick={() => runBatched(false)} disabled={!!running}>
              {running === "full" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Migração completa
            </Button>
          </div>

          {progress && (
            <div className="space-y-1">
              <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
              <p className="text-xs text-muted-foreground">
                {progress.done} / {progress.total} {progress.current ? `— processando: ${progress.current}` : ""}
              </p>
            </div>
          )}

          {resultEntries.length > 0 && (
            <details open className="text-sm">
              <summary className="cursor-pointer font-medium">
                Resultado — {resultEntries.length} tabelas, {errored.length} com erro
              </summary>
              <div className="mt-2 max-h-[60vh] overflow-auto border rounded p-2 font-mono text-xs">
                {resultEntries.map(([t, r]) => {
                  const hasErr = r.error || (r.errors && r.errors.length);
                  return (
                    <div key={t} className={`flex justify-between gap-4 ${hasErr ? "text-destructive" : ""}`}>
                      <span>{t}</span>
                      <span>
                        {r.error
                          ? `ERRO: ${r.error}`
                          : `${r.read ?? 0} lidas / ${r.written ?? 0} gravadas${r.errors?.length ? ` (${r.errors.length} erros chunk)` : ""}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
