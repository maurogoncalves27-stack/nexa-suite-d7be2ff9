import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, ArrowUpRight } from "lucide-react";

interface Row {
  id: string;
  employee_id: string;
  promotion_type: string;
  from_position: string | null;
  to_position: string | null;
  from_level: string | null;
  to_level: string | null;
  from_salary: number | null;
  to_salary: number | null;
  effective_date: string | null;
  applied_at: string | null;
  created_at: string;
  employee_name?: string;
}

const brl = (n: number | null) =>
  n == null ? "—" : `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const dateBR = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function PromotionAlertsCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Pendentes futuras + aplicadas nos últimos 60 dias
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const { data } = await (supabase as any)
          .from("promotion_history")
          .select("*")
          .or(`applied_at.is.null,applied_at.gte.${cutoff.toISOString()}`)
          .order("effective_date", { ascending: true, nullsFirst: false });

        const list = (data ?? []) as Row[];
        const ids = Array.from(new Set(list.map((r) => r.employee_id)));
        if (ids.length) {
          const { data: emps } = await (supabase as any)
            .from("employees")
            .select("id, full_name")
            .in("id", ids);
          const map: Record<string, string> = {};
          (emps ?? []).forEach((e: any) => (map[e.id] = e.full_name));
          list.forEach((r) => (r.employee_name = map[r.employee_id] ?? "—"));
        }
        setRows(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pending = rows.filter((r) => !r.applied_at);
  const applied = rows.filter((r) => r.applied_at);
  const totalDelta = rows.reduce(
    (s, r) => s + (Number(r.to_salary || 0) - Number(r.from_salary || 0)),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Promoções de colaboradores
          {pending.length > 0 && (
            <Badge className="bg-warning text-warning-foreground">{pending.length} agendada(s)</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma promoção recente ou agendada.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Impacto total (últimos 60d + agendadas):{" "}
              <span className="font-semibold text-foreground">
                {brl(totalDelta)} /mês
              </span>
            </p>

            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-warning uppercase tracking-wide">
                  Agendadas — refletem na folha do mês da data efetiva
                </p>
                {pending.map((r) => (
                  <PromoRow key={r.id} r={r} pending />
                ))}
              </div>
            )}

            {applied.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-success uppercase tracking-wide">
                  Já aplicadas (últimos 60 dias)
                </p>
                {applied.map((r) => (
                  <PromoRow key={r.id} r={r} pending={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PromoRow({ r, pending }: { r: Row; pending: boolean }) {
  const delta = Number(r.to_salary || 0) - Number(r.from_salary || 0);
  const isVertical = r.promotion_type === "vertical";
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{r.employee_name}</span>
          <Badge variant={isVertical ? "default" : "secondary"} className="text-[10px]">
            {isVertical ? "Vertical" : "Horizontal"}
          </Badge>
          {pending ? (
            <Badge className="bg-warning text-warning-foreground text-[10px]">
              Efetiva em {dateBR(r.effective_date)}
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px]">
              Aplicada em {dateBR(r.effective_date)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isVertical
            ? `${r.from_position ?? "—"} → ${r.to_position ?? "—"}`
            : `${r.from_position ?? "—"} · Nível ${r.from_level ?? "—"} → ${r.to_level ?? "—"}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm">
          {brl(r.from_salary)} <ArrowUpRight className="inline h-3 w-3" /> {brl(r.to_salary)}
        </div>
        <div className={`text-xs font-semibold ${delta >= 0 ? "text-success" : "text-destructive"}`}>
          {delta >= 0 ? "+" : ""}
          {brl(delta)}
        </div>
      </div>
    </div>
  );
}
