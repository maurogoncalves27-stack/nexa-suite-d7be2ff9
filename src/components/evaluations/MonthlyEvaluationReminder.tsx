import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Award, ArrowRight, AlertTriangle } from "lucide-react";
import { ensureCurrentMonthlyCycle, monthBounds } from "@/lib/monthlyCycle";

/**
 * Banner de obrigatoriedade da avaliação MENSAL.
 * Exibido para gestores/admin/RH enquanto houver colaborador da equipe sem
 * avaliação finalizada no ciclo do mês corrente. Fica em estado de atraso
 * nos últimos dias do mês.
 */
export default function MonthlyEvaluationReminder({ hideLink = false }: { hideLink?: boolean }) {
  const { user, isAdmin, isManager } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [cycleName, setCycleName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: emp } = await supabase
        .from("employees")
        .select("position, store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const isRH = (emp?.position ?? "").trim().toUpperCase() === "ANALISTA DE RH";
      const can = isAdmin || isManager || isRH;
      if (cancelled) return;
      setAllowed(can);
      if (!can) {
        setLoading(false);
        return;
      }

      const cycle = await ensureCurrentMonthlyCycle();
      if (cancelled) return;
      if (!cycle) {
        setLoading(false);
        return;
      }
      setCycleName(cycle.name);

      // Equipe: admin/RH veem toda a empresa; gestor vê a própria loja
      let empQuery = supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .not("hire_date", "is", null);
      if (!isAdmin && !isRH && emp?.store_id) empQuery = empQuery.eq("store_id", emp.store_id);

      const [{ count: activeCount }, { data: evals }] = await Promise.all([
        empQuery,
        supabase
          .from("evaluations")
          .select("employee_id, status")
          .eq("cycle_id", cycle.id),
      ]);
      const evaluated = new Set(
        (evals ?? []).filter((e: any) => e.status === "finalized").map((e: any) => e.employee_id),
      );
      const totalActive = activeCount ?? 0;
      const pendingCount = Math.max(0, totalActive - evaluated.size);

      if (!cancelled) {
        setTotal(totalActive);
        setPending(pendingCount);
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, isManager]);

  if (loading || !allowed || pending === null || pending === 0) return null;

  const done = total - pending;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const { end } = monthBounds();
  const daysLeft = Math.ceil((new Date(`${end}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  const late = daysLeft <= 5;

  return (
    <Card className={late ? "border-destructive/50 bg-destructive/5" : "border-warning/40 bg-warning/5"}>
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`rounded-full p-2 shrink-0 ${late ? "bg-destructive/20" : "bg-warning/20"}`}>
            {late ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Award className="h-5 w-5 text-warning" />}
          </div>
          <div className="min-w-0 space-y-1 w-full">
            <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
              Avaliação mensal obrigatória
              <Badge variant={late ? "destructive" : "outline"} className={late ? "" : "border-warning/50 text-foreground"}>
                {pending} pendente(s)
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Ciclo <span className="font-medium text-foreground">{cycleName}</span> · {done} de {total} concluída(s) ({pct}%).{" "}
              {daysLeft > 0
                ? `Prazo: até o último dia do mês (${daysLeft} dia(s) restante(s)).`
                : "Prazo encerrado — conclua imediatamente."}
            </p>
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
        {!hideLink && (
          <Button asChild variant={late ? "destructive" : "default"} className="shrink-0">
            <Link to="/avaliacoes">
              Avaliar equipe <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
