import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type FullResult = {
  ok: boolean;
  mode: string;
  dryRun: boolean;
  triggersOff?: any;
  triggersOn?: any;
  results: Record<string, { read?: number; written?: number; errors?: any[]; error?: string; dryRun?: boolean }>;
};

export default function MigrateNexa() {
  const { isSuperUser, loading } = useAuth();
  const [running, setRunning] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [result, setResult] = useState<FullResult | null>(null);

  if (loading) return null;
  if (!isSuperUser) return <Navigate to="/" replace />;

  const invoke = async (label: string, payload: Record<string, any>) => {
    setRunning(label);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-to-nexa", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (payload.mode === "plan") {
        setPlan(data as PlanResult);
        toast.success(`${(data as PlanResult).totalTables} tabelas listadas`);
      } else {
        setResult(data as FullResult);
        toast.success("Migração concluída — confira o log");
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setRunning(null);
    }
  };

  const totalRows = plan ? Object.values(plan.counts).reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          Migrar dados para o NEXA
        </h1>
        <p className="text-muted-foreground">
          Copia o conteúdo deste projeto para o projeto NEXA usando os secrets <code>NEXA_SUITE_URL</code> e{" "}
          <code>NEXA_SUITE_SERVICE_ROLE_KEY</code>. Pula <code>pdv_*</code>, <code>pos_*</code>, <code>saipos_*</code> e tabelas internas.
        </p>
      </div>

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p>Antes da primeira execução, rode no projeto NEXA o SQL auxiliar (peça no chat do NEXA). Sem ele a função retorna erro.</p>
            <p>A migração é <strong>idempotente</strong> (upsert por id) — pode rodar várias vezes. Triggers do destino são desabilitados durante a carga e religados no fim.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Listar o que será copiado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => invoke("plan", { mode: "plan" })} disabled={!!running}>
            {running === "plan" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Listar tabelas e contagens
          </Button>
          {plan && (
            <div className="text-sm space-y-2">
              <p><strong>{plan.totalTables}</strong> tabelas serão copiadas — total ~{totalRows.toLocaleString("pt-BR")} linhas.</p>
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
              <details>
                <summary className="cursor-pointer text-muted-foreground">Ver {plan.skipped.length} tabelas ignoradas</summary>
                <div className="mt-2 max-h-40 overflow-auto border rounded p-2 font-mono text-xs">
                  {plan.skipped.map((t) => <div key={t}>{t}</div>)}
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
            <Button variant="outline" onClick={() => invoke("dry", { mode: "full", dry: true })} disabled={!!running}>
              {running === "dry" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Dry-run (só lê)
            </Button>
            <Button onClick={() => invoke("full", { mode: "full" })} disabled={!!running}>
              {running === "full" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Migração completa
            </Button>
          </div>
          {result && (
            <details open className="text-sm">
              <summary className="cursor-pointer font-medium">Resultado</summary>
              <div className="mt-2 max-h-[60vh] overflow-auto border rounded p-2 font-mono text-xs">
                {Object.entries(result.results).map(([t, r]) => {
                  const hasErr = r.error || (r.errors && r.errors.length);
                  return (
                    <div key={t} className={`flex justify-between gap-4 ${hasErr ? "text-destructive" : ""}`}>
                      <span>{t}</span>
                      <span>
                        {r.error
                          ? `ERRO: ${r.error}`
                          : `${r.read ?? 0} lidas / ${r.written ?? 0} gravadas${r.errors?.length ? ` (${r.errors.length} erros)` : ""}`}
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
