import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { differenceInMonths, subMonths } from "date-fns";

type Emp = {
  id: string; full_name: string; position: string | null; position_id: string | null;
  hire_date: string | null; status: string; store: { name: string } | null;
};
type Criteria = {
  position_id: string; promotion_type: "horizontal" | "vertical";
  min_months_in_role: number; min_evaluation_score: number; min_attendance_pct: number;
  no_warnings_months: number; require_training_completion: boolean; require_pdi_completion: boolean;
};
type TrackStep = { from_position_id: string | null; to_position_id: string; track_name: string };

type Result = {
  employee: Emp;
  promotion_type: "horizontal" | "vertical";
  target_position_id: string | null;
  target_position_name: string;
  is_eligible: boolean;
  gaps: string[];
  meets: string[];
};

export default function EligibilityPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const compute = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const cutoffWarn = subMonths(today, 6).toISOString();
      const cutoffSched = subMonths(today, 2).toISOString().slice(0, 10);

      const [empRes, critRes, trackRes, warnRes, posRes, storesRes, schedRes] = await Promise.all([
        supabase.from("employees").select("id, full_name, position, position_id, hire_date, status, store_id").eq("status", "active"),
        supabase.from("promotion_criteria").select("*"),
        supabase.from("career_track_steps").select("from_position_id, to_position_id, track_name").order("order_index"),
        supabase.from("employee_warnings").select("employee_id, issued_at").gte("issued_at", cutoffWarn),
        supabase.from("positions").select("id, name"),
        supabase.from("stores").select("id, name"),
        supabase.from("work_schedules").select("employee_id, store_id, schedule_date").gte("schedule_date", cutoffSched).eq("is_day_off", false),
      ]);

      const employees = (empRes.data ?? []) as any[];
      const criteria = (critRes.data ?? []) as Criteria[];
      const tracks = (trackRes.data ?? []) as TrackStep[];
      const warnings = (warnRes.data ?? []) as { employee_id: string; issued_at: string }[];
      const positions = (posRes.data ?? []) as { id: string; name: string }[];
      const stores = (storesRes.data ?? []) as { id: string; name: string }[];
      const schedules = (schedRes.data ?? []) as { employee_id: string; store_id: string | null }[];
      const posName = new Map(positions.map((p) => [p.id, p.name]));
      const storeName = new Map(stores.map((s) => [s.id, s.name]));

      // Loja alocada: store_id mais frequente nas escalas dos últimos 60 dias
      const schedCounts = new Map<string, Map<string, number>>();
      schedules.forEach((s) => {
        if (!s.store_id) return;
        const inner = schedCounts.get(s.employee_id) ?? new Map();
        inner.set(s.store_id, (inner.get(s.store_id) ?? 0) + 1);
        schedCounts.set(s.employee_id, inner);
      });
      const allocatedStore = new Map<string, string>();
      schedCounts.forEach((inner, empId) => {
        let best: string | null = null; let max = 0;
        inner.forEach((n, sid) => { if (n > max) { max = n; best = sid; } });
        if (best) allocatedStore.set(empId, best);
      });

      const empList: Emp[] = employees.map((e) => {
        const sid = allocatedStore.get(e.id) ?? e.store_id;
        return { ...e, store: sid ? { name: storeName.get(sid) ?? "—" } : null };
      });

      const warnByEmp = new Map<string, string[]>();
      warnings.forEach((w) => {
        const arr = warnByEmp.get(w.employee_id) ?? [];
        arr.push(w.issued_at);
        warnByEmp.set(w.employee_id, arr);
      });

      const out: Result[] = [];

      for (const emp of employees) {
        if (!emp.position_id || !emp.hire_date) continue;

        const monthsInRole = differenceInMonths(today, new Date(emp.hire_date));

        // Horizontal (mesmo cargo)
        const hCrit = criteria.find((c) => c.position_id === emp.position_id && c.promotion_type === "horizontal");
        if (hCrit) out.push(evaluate(emp, hCrit, monthsInRole, warnByEmp, emp.position_id, posName));

        // Vertical (próximo cargo em alguma trilha) — dedup por cargo destino
        const nextSteps = tracks.filter((t) => t.from_position_id === emp.position_id);
        const seenTargets = new Set<string>();
        for (const step of nextSteps) {
          if (seenTargets.has(step.to_position_id)) continue;
          seenTargets.add(step.to_position_id);
          const vCrit = criteria.find((c) => c.position_id === step.to_position_id && c.promotion_type === "vertical");
          if (vCrit) out.push(evaluate(emp, vCrit, monthsInRole, warnByEmp, step.to_position_id, posName));
        }
      }

      setResults(out);
      setLastRun(new Date());
      toast({ title: `${out.filter((r) => r.is_eligible).length} elegíveis identificados` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { compute(); }, []);

  const eligibles = useMemo(() => results.filter((r) => r.is_eligible), [results]);
  const notEligibles = useMemo(() => results.filter((r) => !r.is_eligible && r.gaps.length <= 2), [results]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Colaboradores prontos para promoção. O cálculo cruza tempo no cargo, advertências e critérios cadastrados.
          </p>
          {lastRun && <p className="text-xs text-muted-foreground mt-1">Última análise: {lastRun.toLocaleString("pt-BR")}</p>}
        </div>
        <Button size="sm" onClick={compute} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Recalcular
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Elegíveis agora ({eligibles.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {eligibles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Ninguém elegível no momento.</p>
          ) : (
            <div className="space-y-2">
              {eligibles.map((r, i) => (
                <div key={`${r.employee.id}-${i}`} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{r.employee.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employee.position} → <span className="font-medium text-foreground">{r.target_position_name}</span>
                      {r.employee.store?.name && <span> · {r.employee.store.name}</span>}
                    </div>
                  </div>
                  <Badge variant={r.promotion_type === "vertical" ? "default" : "secondary"}>
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {r.promotion_type === "vertical" ? "Promoção vertical" : "Progressão horizontal"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <XCircle className="h-4 w-4" />
            Perto de serem elegíveis (até 2 critérios faltando)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {notEligibles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhum próximo da elegibilidade.</p>
          ) : (
            <div className="space-y-2">
              {notEligibles.slice(0, 30).map((r, i) => (
                <div key={`${r.employee.id}-${i}`} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium text-sm">{r.employee.full_name}</div>
                    <span className="text-xs text-muted-foreground">
                      {r.employee.position} → {r.target_position_name}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.gaps.map((g, j) => (
                      <Badge key={j} variant="outline" className="text-xs">{g}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function evaluate(
  emp: Emp, c: Criteria, monthsInRole: number,
  warnByEmp: Map<string, string[]>, targetPositionId: string,
  posName: Map<string, string>
): Result {
  const gaps: string[] = [];
  const meets: string[] = [];

  if (monthsInRole >= c.min_months_in_role) meets.push(`${monthsInRole}m no cargo`);
  else gaps.push(`Faltam ${c.min_months_in_role - monthsInRole}m no cargo`);

  const warns = warnByEmp.get(emp.id) ?? [];
  if (warns.length === 0) meets.push(`Sem advertência (${c.no_warnings_months}m)`);
  else gaps.push(`${warns.length} advertência(s) recentes`);

  // Nota da avaliação e frequência: sem dados confiáveis para todos → marcamos como "sem dados" (bloqueia por padrão)
  // Isso evita falsos positivos; quando existir avaliação, o RH avalia caso a caso.
  gaps.push(`Requer avaliação ≥ ${c.min_evaluation_score}%`);
  if (c.require_training_completion) gaps.push("Treinamentos obrigatórios");
  if (c.require_pdi_completion) gaps.push("PDI concluído");

  // MVP: é elegível apenas se cumpre tempo + sem advertência (os demais são checagens manuais)
  const is_eligible = monthsInRole >= c.min_months_in_role && warns.length === 0;

  return {
    employee: emp,
    promotion_type: c.promotion_type,
    target_position_id: targetPositionId,
    target_position_name: posName.get(targetPositionId) ?? "—",
    is_eligible,
    gaps: is_eligible ? [] : gaps,
    meets,
  };
}
