import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Wrench, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Banner persistente exibido para gestores/admins com:
 *  - solicitações de manutenção PENDENTES de aprovação
 *  - manutenções APROVADAS em andamento (ainda não concluídas)
 * Esconde-se sozinho quando não há pendências/em andamento ou quando
 * o usuário não é gestor.
 */
export default function MaintenanceRequestsAlert() {
  const { user, isAdmin, isManager } = useAuth();
  const [pending, setPending] = useState(0);
  const [highUrgency, setHighUrgency] = useState(0);
  const [inProgress, setInProgress] = useState(0);

  useEffect(() => {
    if (!user || (!isAdmin && !isManager)) return;

    const refresh = async () => {
      const [pendRes, highRes, progRes] = await Promise.all([
        supabase
          .from("nutri_maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("nutri_maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("urgency", "alta"),
        supabase
          .from("nutri_maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
      ]);
      setPending(pendRes.count ?? 0);
      setHighUrgency(highRes.count ?? 0);
      setInProgress(progRes.count ?? 0);
    };

    refresh();

    const channel = supabase
      .channel("maintenance-requests-alert")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nutri_maintenance_requests" },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, isManager]);

  if (!user || (!isAdmin && !isManager)) return null;
  if (pending === 0 && inProgress === 0) return null;

  const urgent = highUrgency > 0;

  return (
    <div className="space-y-2">
      {pending > 0 && (
        <Link
          to="/nutricontrol?tab=manutencao"
          className={[
            "block rounded-lg border px-4 py-2.5 transition-colors",
            urgent
              ? "border-destructive/50 bg-destructive/10 hover:bg-destructive/15"
              : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15",
          ].join(" ")}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={[
                "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                urgent ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-700 dark:text-amber-300",
              ].join(" ")}
            >
              {urgent ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {pending} solicitaç{pending > 1 ? "ões" : "ão"} de manutenção aguardando aprovação
                {urgent && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    • {highUrgency} urgente{highUrgency > 1 ? "s" : ""}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Toque para revisar e aprovar.</p>
            </div>
          </div>
        </Link>
      )}

      {inProgress > 0 && (
        <Link
          to="/nutricontrol?tab=manutencao"
          className="block rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15 px-4 py-2.5 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-primary/20 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {inProgress} manutenç{inProgress > 1 ? "ões" : "ão"} em andamento
              </p>
              <p className="text-xs text-muted-foreground">
                Aguardando conclusão pelo solicitante ou gestor.
              </p>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}
