import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CalendarClock, Shirt, Bus, Landmark, Award, ClipboardList, ChevronRight } from "lucide-react";

interface PendingCounts {
  schedule: number;
  uniform: number;
  transport: number;
  bank: number;
  bonus: number;
}

const items = [
  { key: "schedule" as const, label: "Sem horário/folga", icon: CalendarClock, to: "/escalas", color: "text-blue-600 dark:text-blue-400" },
  { key: "uniform" as const, label: "Sem uniforme", icon: Shirt, to: "/uniformes", color: "text-purple-600 dark:text-purple-400" },
  { key: "transport" as const, label: "Sem vale-transporte", icon: Bus, to: "/folha-pagamento", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "bank" as const, label: "Sem dados bancários", icon: Landmark, to: "/colaboradores", color: "text-amber-600 dark:text-amber-400" },
  { key: "bonus" as const, label: "Sem bonificação de cargo", icon: Award, to: "/avaliacoes", color: "text-pink-600 dark:text-pink-400" },
];

export default function PendingAssignmentsCard() {
  const [counts, setCounts] = useState<PendingCounts>({ schedule: 0, uniform: 0, transport: 0, bank: 0, bonus: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, position, work_schedule, bank_account, pix_key")
        .eq("status", "active")
        .eq("training_status", "approved");

      const list = emps ?? [];
      if (list.length === 0) {
        setLoading(false);
        return;
      }
      const ids = list.map((e) => e.id);

      const [{ data: deliveries }, { data: tv }, { data: bonuses }, { data: schedules }] = await Promise.all([
        supabase.from("uniform_deliveries").select("employee_id").in("employee_id", ids),
        supabase.from("employee_transport_vouchers").select("employee_id").in("employee_id", ids),
        supabase.from("position_bonuses").select("position"),
        supabase.from("work_schedules").select("employee_id").in("employee_id", ids),
      ]);

      const hasUniform = new Set((deliveries ?? []).map((d: any) => d.employee_id));
      const hasTV = new Set((tv ?? []).map((t: any) => t.employee_id));
      const hasSchedule = new Set((schedules ?? []).map((s: any) => s.employee_id));
      const positionsWithBonus = new Set(
        (bonuses ?? []).map((b: any) => (b.position ?? "").trim().toLowerCase()).filter(Boolean),
      );

      const c: PendingCounts = { schedule: 0, uniform: 0, transport: 0, bank: 0, bonus: 0 };
      for (const e of list) {
        if (!hasSchedule.has(e.id)) c.schedule++;
        if (!hasUniform.has(e.id)) c.uniform++;
        if (!hasTV.has(e.id)) c.transport++;
        if ((!e.bank_account || e.bank_account.trim() === "") && (!e.pix_key || e.pix_key.trim() === "")) c.bank++;
        const pos = (e.position ?? "").trim().toLowerCase();
        if (!pos || !positionsWithBonus.has(pos)) c.bonus++;
      }
      setCounts(c);
      setTotal(c.schedule + c.uniform + c.transport + c.bank + c.bonus);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <Card className={total > 0 ? "border-warning/40" : ""}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base min-w-0">
          <ClipboardList className="h-5 w-5 text-warning shrink-0" />
          <span className="truncate">Atribuições pendentes</span>
          {total > 0 && <Badge variant="outline" className="ml-1 shrink-0">{total}</Badge>}
        </CardTitle>
        <span className="text-[11px] sm:text-xs text-muted-foreground sm:text-right">
          Apenas colaboradores ativos pós-treinamento
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {items.map((it) => {
            const value = counts[it.key];
            return (
              <Link
                key={it.key}
                to={it.to}
                className="group rounded-md border p-3 hover:bg-muted/40 transition-colors flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <it.icon className={`h-4 w-4 ${it.color}`} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-2xl font-bold">{loading ? "—" : value}</div>
                <div className="text-xs text-muted-foreground">{it.label}</div>
              </Link>
            );
          })}
        </div>
        {!loading && total === 0 && (
          <p className="text-sm text-muted-foreground mt-3">
            Tudo certo! Nenhuma atribuição pendente no momento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
