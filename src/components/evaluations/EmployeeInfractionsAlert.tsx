import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, X, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface Row {
  id: string;
  occurred_on: string;
  notes: string | null;
  applied_weight: number;
  suspension_weeks: number;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  infraction_type: { name: string; severity: string } | null;
}

interface Props {
  employeeId: string;
}

export default function EmployeeInfractionsAlert({ employeeId }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_infractions")
      .select(
        "id, occurred_on, notes, applied_weight, suspension_weeks, suspension_start_date, suspension_end_date, infraction_type:infraction_types(name, severity)"
      )
      .eq("employee_id", employeeId)
      .is("acknowledged_at", null)
      .order("occurred_on", { ascending: false });
    setItems((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!employeeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const acknowledge = async (id: string) => {
    setAcking(id);
    const { error } = await supabase
      .from("employee_infractions")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id ?? null })
      .eq("id", id);
    setAcking(null);
    if (error) {
      toast({ title: "Erro ao confirmar", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading || items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const isCritical = r.infraction_type?.severity === "critical";
        return (
          <Card
            key={r.id}
            className={`border-2 ${isCritical ? "border-destructive/60 bg-destructive/5" : "border-amber-500/60 bg-amber-500/5"}`}
          >
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-start">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className={`shrink-0 rounded-full p-2 ${isCritical ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}
                >
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-base leading-tight">
                      {r.infraction_type?.name ?? "Infração"}
                    </h3>
                    {isCritical && (
                      <Badge variant="destructive" className="text-[10px]">CRÍTICA</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Registrada em{" "}
                    {format(parseISO(r.occurred_on), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    {" · Peso "}{r.applied_weight}
                  </p>
                  {r.suspension_weeks > 0 && r.suspension_start_date && r.suspension_end_date && (
                    <p className="text-xs font-medium text-destructive">
                      Suspensão de {r.suspension_weeks} semana(s):{" "}
                      {format(parseISO(r.suspension_start_date), "dd/MM/yyyy")} até{" "}
                      {format(parseISO(r.suspension_end_date), "dd/MM/yyyy")}
                    </p>
                  )}
                  {r.notes && (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                      {r.notes}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-end sm:self-start"
                onClick={() => acknowledge(r.id)}
                disabled={acking === r.id}
              >
                {acking === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" /> Ciente
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
