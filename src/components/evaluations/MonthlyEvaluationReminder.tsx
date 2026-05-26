import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, ArrowRight } from "lucide-react";

/**
 * Banner mensal exibido APENAS para usuários com cargo "ANALISTA DE RH",
 * lembrando de realizar as avaliações de desempenho do mês corrente.
 * Some automaticamente quando todos os colaboradores ativos tiverem
 * avaliação no ciclo aberto que cobre o mês atual.
 */
export default function MonthlyEvaluationReminder({ hideLink = false }: { hideLink?: boolean }) {
  const { user } = useAuth();
  const [isAnalystaRH, setIsAnalystaRH] = useState(false);
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

      // 1) Verifica se o usuário é Analista de RH
      const { data: emp } = await supabase
        .from("employees")
        .select("position")
        .eq("user_id", user.id)
        .maybeSingle();
      const isRH = (emp?.position ?? "").trim().toUpperCase() === "ANALISTA DE RH";
      if (cancelled) return;
      setIsAnalystaRH(isRH);
      if (!isRH) {
        setLoading(false);
        return;
      }

      // 2) Busca ciclo aberto que cobre HOJE
      const today = new Date().toISOString().slice(0, 10);
      const { data: cycles } = await supabase
        .from("evaluation_cycles")
        .select("id, name, start_date, end_date")
        .eq("status", "open")
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1);
      const cycle = cycles?.[0];
      if (!cycle) {
        if (!cancelled) setLoading(false);
        return;
      }
      setCycleName(cycle.name);

      // 3) Conta colaboradores ativos e quantos já têm avaliação no ciclo
      const [{ count: activeCount }, { data: evals }] = await Promise.all([
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("evaluations")
          .select("employee_id")
          .eq("cycle_id", cycle.id),
      ]);
      const evaluated = new Set((evals ?? []).map((e: any) => e.employee_id));
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
  }, [user]);

  if (loading || !isAnalystaRH || pending === null || pending === 0) return null;

  const done = total - pending;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="rounded-full bg-warning/20 p-2 shrink-0">
            <Award className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
              Avaliações de desempenho pendentes
              <Badge variant="outline" className="border-warning/50 text-foreground">
                {pending} de {total}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Ciclo <span className="font-medium text-foreground">{cycleName}</span> · {done} concluída(s) ({pct}%). Conclua as avaliações deste mês.
            </p>
          </div>
        </div>
        {!hideLink && (
          <Button asChild variant="default" className="shrink-0">
            <Link to="/avaliacoes">
              Ir para avaliações <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
