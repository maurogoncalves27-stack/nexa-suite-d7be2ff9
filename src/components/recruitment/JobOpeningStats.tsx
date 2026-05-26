import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, TrendingUp, AlertCircle } from "lucide-react";

interface Props { jobOpeningId: string; openedAt?: string | null; }

interface Stats {
  total: number;
  pendingDocs: number;
  inTraining: number;
  hired: number;
  avgDaysToHire: number | null;
  daysOpen: number;
}

export function JobOpeningStats({ jobOpeningId, openedAt }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("job_candidates")
        .select("current_stage, applied_at, updated_at, created_employee_id")
        .eq("job_opening_id", jobOpeningId);
      const rows = (data ?? []) as any[];
      const total = rows.length;
      const pendingDocs = rows.filter((r) => r.current_stage === "aguardando_inicio").length;
      const inTraining = rows.filter((r) => r.current_stage?.startsWith("treinamento_dia_") || r.current_stage === "teste_pratico" || r.current_stage === "cadastro").length;
      const hired = rows.filter((r) => r.current_stage === "contratado").length;

      // tempo médio (dias) entre applied_at e updated_at para contratados
      const hiredRows = rows.filter((r) => r.current_stage === "contratado" && r.applied_at && r.updated_at);
      const avgDaysToHire = hiredRows.length === 0 ? null : Math.round(
        hiredRows.reduce((acc, r) => {
          const days = (new Date(r.updated_at).getTime() - new Date(r.applied_at).getTime()) / (1000 * 60 * 60 * 24);
          return acc + days;
        }, 0) / hiredRows.length
      );

      const daysOpen = openedAt ? Math.floor((Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

      setStats({ total, pendingDocs, inTraining, hired, avgDaysToHire, daysOpen });
    };
    load();
  }, [jobOpeningId, openedAt]);

  if (!stats) return null;

  const isStale = stats.daysOpen > 30 && stats.total < 3;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <Badge variant="outline" className="gap-1 h-5 px-1.5">
        <Users className="h-3 w-3" /> {stats.total} {stats.total === 1 ? "candidato" : "candidatos"}
      </Badge>
      {stats.pendingDocs > 0 && (
        <Badge variant="outline" className="gap-1 h-5 px-1.5 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30">
          {stats.pendingDocs} em docs
        </Badge>
      )}
      {stats.inTraining > 0 && (
        <Badge variant="outline" className="gap-1 h-5 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
          {stats.inTraining} em treino
        </Badge>
      )}
      {stats.hired > 0 && (
        <Badge variant="outline" className="gap-1 h-5 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <TrendingUp className="h-3 w-3" /> {stats.hired} contratado{stats.hired > 1 ? "s" : ""}
        </Badge>
      )}
      {stats.avgDaysToHire !== null && (
        <Badge variant="outline" className="gap-1 h-5 px-1.5">
          <Clock className="h-3 w-3" /> {stats.avgDaysToHire}d médio
        </Badge>
      )}
      {isStale && (
        <Badge variant="outline" className="gap-1 h-5 px-1.5 bg-destructive/10 text-destructive border-destructive/30">
          <AlertCircle className="h-3 w-3" /> {stats.daysOpen}d aberta
        </Badge>
      )}
    </div>
  );
}
