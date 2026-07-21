import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { differenceInMonths, subMonths } from "date-fns";

type Emp = {
  id: string;
  full_name: string;
  position: string | null;
  position_id: string | null;
  hire_date: string | null;
  status: string;
  store_id: string | null;
  current_level: string | null;
  level_updated_at: string | null;
};

type Level = { position_id: string; level: string; salary: number; order_index: number };
type Criteria = {
  position_id: string;
  min_months_in_role: number;
  min_evaluation_score: number;
  no_warnings_months: number;
};

type Result = {
  employee: Emp;
  store_name: string | null;
  current_level: string;
  current_salary: number | null;
  next_level: string;
  next_salary: number | null;
  months_since_last: number;
  min_months: number;
  eval_score: number | null;
  min_score: number;
  warnings: number;
  is_eligible: boolean;
  gaps: string[];
};

type VerticalResult = {
  employee: Emp;
  store_name: string | null;
  from_position: string;
  to_position_id: string;
  to_position: string;
  to_salary: number | null;
  months_in_role: number;
  min_months: number;
  eval_score: number | null;
  min_score: number;
  warnings: number;
  is_eligible: boolean;
  gaps: string[];
};

export default function EligibilityPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [verticalResults, setVerticalResults] = useState<VerticalResult[]>([]);
  const [positionsMap, setPositionsMap] = useState<Map<string, string>>(new Map());
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const compute = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const cutoffWarn = subMonths(today, 6).toISOString();
      const cutoffSched = subMonths(today, 2).toISOString().slice(0, 10);

      const [empRes, levelsRes, critRes, warnRes, storesRes, schedRes, evalRes, tracksRes, posRes] = await Promise.all([
        supabase.from("employees").select("id, full_name, position, position_id, hire_date, status, store_id, current_level, level_updated_at").eq("status", "active"),
        supabase.from("position_salary_levels").select("position_id, level, salary, order_index").order("order_index"),
        supabase.from("promotion_criteria").select("position_id, promotion_type, min_months_in_role, min_evaluation_score, no_warnings_months"),
        supabase.from("employee_warnings").select("employee_id, issued_at").gte("issued_at", cutoffWarn),
        supabase.from("stores").select("id, name"),
        supabase.from("work_schedules").select("employee_id, store_id, schedule_date").gte("schedule_date", cutoffSched).eq("is_day_off", false),
        supabase.from("evaluations").select("employee_id, final_score, updated_at").in("status", ["finalized", "completed"]).not("final_score", "is", null),
        supabase.from("career_track_steps").select("from_position_id, to_position_id, order_index").order("order_index"),
        supabase.from("positions").select("id, name"),
      ]);
      const levels = (levelsRes.data ?? []) as Level[];
      const criteria = (critRes.data ?? []) as Criteria[];
      const warnings = (warnRes.data ?? []) as { employee_id: string; issued_at: string }[];
      const stores = (storesRes.data ?? []) as { id: string; name: string }[];
      const schedules = (schedRes.data ?? []) as { employee_id: string; store_id: string | null }[];
      const evaluations = (evalRes.data ?? []) as { employee_id: string; final_score: number | null; updated_at: string }[];

      const storeName = new Map(stores.map((s) => [s.id, s.name]));

      // Níveis agrupados por cargo, ordenados
      const levelsByPos = new Map<string, Level[]>();
      levels.forEach((l) => {
        const arr = levelsByPos.get(l.position_id) ?? [];
        arr.push(l);
        levelsByPos.set(l.position_id, arr);
      });
      levelsByPos.forEach((arr) => arr.sort((a, b) => a.order_index - b.order_index));

      // Loja alocada por escala (últimos 60d)
      const schedCounts = new Map<string, Map<string, number>>();
      schedules.forEach((s) => {
        if (!s.store_id) return;
        const inner = schedCounts.get(s.employee_id) ?? new Map();
        inner.set(s.store_id, (inner.get(s.store_id) ?? 0) + 1);
        schedCounts.set(s.employee_id, inner);
      });
      const allocatedStore = new Map<string, string>();
      schedCounts.forEach((inner, empId) => {
        let best: string | null = null;
        let max = 0;
        inner.forEach((n, sid) => { if (n > max) { max = n; best = sid; } });
        if (best) allocatedStore.set(empId, best);
      });

      const warnByEmp = new Map<string, number>();
      warnings.forEach((w) => warnByEmp.set(w.employee_id, (warnByEmp.get(w.employee_id) ?? 0) + 1));

      // Última avaliação por colaborador (normaliza escala 0-10 → 0-100)
      const evalByEmp = new Map<string, number>();
      evaluations
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        .forEach((e) => {
          if (!evalByEmp.has(e.employee_id) && e.final_score != null) {
            const raw = Number(e.final_score);
            const normalized = raw <= 10 ? raw * 10 : raw;
            evalByEmp.set(e.employee_id, normalized);
          }
        });

      const out: Result[] = [];

      for (const emp of employees) {
        if (!emp.position_id || !emp.hire_date) continue;
        const posLevels = levelsByPos.get(emp.position_id);
        if (!posLevels || posLevels.length === 0) continue;

        const currentLevel = emp.current_level ?? posLevels[0].level;
        const currentIdx = posLevels.findIndex((l) => l.level === currentLevel);
        const current = currentIdx >= 0 ? posLevels[currentIdx] : posLevels[0];
        const nextIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
        if (nextIdx >= posLevels.length) continue; // já no topo
        const next = posLevels[nextIdx];

        const anchorDate = emp.level_updated_at ? new Date(emp.level_updated_at) : new Date(emp.hire_date);
        const monthsSince = differenceInMonths(today, anchorDate);

        const c = criteria.find((k) => k.position_id === emp.position_id);
        const minMonths = c?.min_months_in_role ?? 12;
        const minScore = c?.min_evaluation_score ?? 80;

        const warns = warnByEmp.get(emp.id) ?? 0;
        const score = evalByEmp.get(emp.id) ?? null;

        const gaps: string[] = [];
        if (monthsSince < minMonths) gaps.push(`Faltam ${minMonths - monthsSince}m no nível`);
        if (warns > 0) gaps.push(`${warns} advertência(s) recentes`);
        if (score == null) gaps.push(`Sem avaliação registrada`);
        else if (score < minScore) gaps.push(`Avaliação ${score}% < ${minScore}%`);

        out.push({
          employee: emp,
          store_name: storeName.get(allocatedStore.get(emp.id) ?? emp.store_id ?? "") ?? null,
          current_level: current.level,
          current_salary: current.salary,
          next_level: next.level,
          next_salary: next.salary,
          months_since_last: monthsSince,
          min_months: minMonths,
          eval_score: score,
          min_score: minScore,
          warnings: warns,
          is_eligible: gaps.length === 0,
          gaps,
        });
      }

      setResults(out);
      setLastRun(new Date());
      toast({ title: `${out.filter((r) => r.is_eligible).length} elegíveis para subir de nível` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { compute(); }, []);

  const eligibles = useMemo(() => results.filter((r) => r.is_eligible), [results]);
  const notEligibles = useMemo(() => results.filter((r) => !r.is_eligible && r.gaps.length <= 2), [results]);

  const promote = async (r: Result) => {
    try {
      const { error } = await supabase
        .from("employees")
        .update({ current_level: r.next_level, level_updated_at: new Date().toISOString(), salary: r.next_salary })
        .eq("id", r.employee.id);
      if (error) throw error;
      toast({ title: `${r.employee.full_name} promovido para nível ${r.next_level}` });
      compute();
    } catch (e: any) {
      toast({ title: "Erro ao promover", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Progressão por níveis dentro do mesmo cargo (I → II → III…) com base em tempo no nível, avaliações e ausência de advertências.
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
            Elegíveis para subir de nível ({eligibles.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {eligibles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Ninguém elegível no momento.</p>
          ) : (
            <div className="space-y-2">
              {eligibles.map((r) => (
                <div key={r.employee.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{r.employee.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employee.position} · Nível <span className="font-medium text-foreground">{r.current_level}</span> → <span className="font-medium text-foreground">{r.next_level}</span>
                      {r.current_salary != null && r.next_salary != null && (
                        <> · R$ {r.current_salary.toFixed(2)} → R$ {r.next_salary.toFixed(2)}</>
                      )}
                      {r.store_name && <> · {r.store_name}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {r.months_since_last}m · {r.eval_score ?? "—"}%
                    </Badge>
                    <Button size="sm" onClick={() => promote(r)}>Promover</Button>
                  </div>
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
              {notEligibles.slice(0, 30).map((r) => (
                <div key={r.employee.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium text-sm">{r.employee.full_name}</div>
                    <span className="text-xs text-muted-foreground">
                      {r.employee.position} · Nível {r.current_level} → {r.next_level}
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
