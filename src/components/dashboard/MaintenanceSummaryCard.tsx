import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wrench, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Counts {
  pending: number;
  approved: number;
  monthCompleted: number;
  highUrgencyPending: number;
}

export default function MaintenanceSummaryCard() {
  const { user, isAdmin, isManager, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, monthCompleted: 0, highUrgencyPending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setCounts({ pending: 0, approved: 0, monthCompleted: 0, highUrgencyPending: 0 });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoading(true);

      let ids: string[] | null = null;

      if (!isAdmin && !isManager) {
        const { data: storeIds } = await supabase.rpc("user_accessible_stores" as any, { _user_id: user.id } as any);
        ids = ((storeIds ?? []) as Array<{ user_accessible_stores: string } | string>)
          .map((r) => (typeof r === "string" ? r : r.user_accessible_stores))
          .filter(Boolean);

        if (ids.length === 0) {
          if (cancelled) return;
          setCounts({ pending: 0, approved: 0, monthCompleted: 0, highUrgencyPending: 0 });
          setLoading(false);
          return;
        }
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      let pendingQuery = supabase
        .from("nutri_maintenance_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      let approvedQuery = supabase
        .from("nutri_maintenance_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved");

      let monthCompletedQuery = supabase
        .from("nutri_maintenance_records")
        .select("id", { count: "exact", head: true })
        .gte("date", monthStart.toISOString().slice(0, 10));

      let highUrgencyQuery = supabase
        .from("nutri_maintenance_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("urgency", "alta");

      if (ids) {
        pendingQuery = pendingQuery.in("store_id", ids);
        approvedQuery = approvedQuery.in("store_id", ids);
        monthCompletedQuery = monthCompletedQuery.in("store_id", ids);
        highUrgencyQuery = highUrgencyQuery.in("store_id", ids);
      }

      const [pendRes, apprRes, monthRes, highRes] = await Promise.all([
        pendingQuery,
        approvedQuery,
        monthCompletedQuery,
        highUrgencyQuery,
      ]);

      if (cancelled) return;

      setCounts({
        pending: pendRes.count ?? 0,
        approved: apprRes.count ?? 0,
        monthCompleted: monthRes.count ?? 0,
        highUrgencyPending: highRes.count ?? 0,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, isManager, authLoading]);

  const hasAlert = counts.highUrgencyPending > 0;

  return (
    <Card className={hasAlert ? "border-destructive/50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-5 w-5 text-primary" />
          Manutenções
          {hasAlert && <AlertTriangle className="h-4 w-4 text-destructive" />}
        </CardTitle>
        <Link to="/nutricontrol" className="text-sm text-primary hover:underline">Ver todas</Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            to="/nutricontrol"
            className={`rounded-md border p-3 hover:bg-muted/40 transition-colors ${
              counts.pending > 0 ? "border-amber-500/40" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Aguardando aprovação</span>
              <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold mt-1">{loading ? "—" : counts.pending}</div>
            {counts.highUrgencyPending > 0 && (
              <Badge variant="outline" className="mt-1 border-destructive/50 text-destructive text-[10px]">
                {counts.highUrgencyPending} urgente{counts.highUrgencyPending > 1 ? "s" : ""}
              </Badge>
            )}
          </Link>

          <Link
            to="/nutricontrol"
            className={`rounded-md border p-3 hover:bg-muted/40 transition-colors ${
              counts.approved > 0 ? "border-primary/40" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Aprovadas a executar</span>
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1">{loading ? "—" : counts.approved}</div>
          </Link>

          <Link
            to="/nutricontrol"
            className="rounded-md border p-3 hover:bg-muted/40 transition-colors col-span-2 md:col-span-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Realizadas no mês</span>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div className="text-2xl font-bold mt-1">{loading ? "—" : counts.monthCompleted}</div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
