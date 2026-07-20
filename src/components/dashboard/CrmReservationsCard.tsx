import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarHeart, Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CrmReservationsCard() {
  const { data } = useQuery({
    queryKey: ["dashboard-crm-reservations"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().slice(0, 10);

      const [todayList, monthCount, openCount] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, name, reservation_date, reservation_time, party_size, status")
          .eq("reservation_date", today)
          .in("status", ["pending", "confirmed"])
          .order("reservation_time", { ascending: true })
          .limit(4),
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .gte("reservation_date", monthStartStr),
        supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("reservation_date", today),
      ]);

      return {
        today: todayList.data ?? [],
        monthCount: monthCount.count ?? 0,
        openCount: openCount.count ?? 0,
      };
    },
    refetchInterval: 120_000,
  });

  const todayList = data?.today ?? [];

  return (
    <Link
      to="/crm"
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors"
    >
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-base font-semibold text-foreground">CRM · Reservas</div>
          <CalendarHeart className="h-4 w-4 text-primary shrink-0" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {data?.monthCount ?? 0} no mês
          </Badge>
          {(data?.openCount ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/50 text-warning">
              {data?.openCount} pendente{(data?.openCount ?? 0) > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Hoje</div>
        {todayList.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">Nenhuma reserva para hoje.</div>
        ) : (
          <ul className="space-y-1.5">
            {todayList.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {String(r.reservation_time).slice(0, 5)}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="h-3 w-3" />
                    {r.party_size}
                  </span>
                  {r.status === "pending" && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning/50 text-warning">
                      pend.
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
