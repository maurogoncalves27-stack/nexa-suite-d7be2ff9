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
      const employees = (empRes.data ?? []) as Emp[];
      const levels = (levelsRes.data ?? []) as Level[];
      const criteria = (critRes.data ?? []) as (Criteria & { promotion_type?: string })[];
      const warnings = (warnRes.data ?? []) as { employee_id: string; issued_at: string }[];
      const stores = (storesRes.data ?? []) as { id: string; name: string }[];
      const schedules = (schedRes.data ?? []) as { employee_id: string; store_id: string | null }[];
      const evaluations = (evalRes.data ?? []) as { employee_id: string; final_score: number | null; updated_at: string }[];
      const tracks = (tracksRes.data ?? []) as { from_position_id: string | null; to_position_id: string; order_index: number }[];
      const positions = (posRes.data ?? []) as { id: string; name: string }[];
      const posName = new Map(positions.map((p) => [p.id, p.name]));
      

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

      // === Progressão vertical (troca de cargo) via career_track_steps ===
      // Próximo cargo por cargo atual (menor order_index)
      const nextByFrom = new Map<string, { to_position_id: string; order_index: number }>();
      tracks.forEach((t) => {
        if (!t.from_position_id) return;
        const cur = nextByFrom.get(t.from_position_id);
        if (!cur || t.order_index < cur.order_index) {
          nextByFrom.set(t.from_position_id, { to_position_id: t.to_position_id, order_index: t.order_index });
        }
      });

      const vout: VerticalResult[] = [];
      for (const emp of employees) {
        if (!emp.position_id || !emp.hire_date) continue;
        const next = nextByFrom.get(emp.position_id);
        if (!next) continue;

        // Salário-base do próximo cargo (menor order_index)
        const nextLevels = levelsByPos.get(next.to_position_id) ?? [];
        const toSalary = nextLevels[0]?.salary ?? null;

        // Ancoragem: last level_updated_at OU hire_date (proxy p/ tempo no cargo)
        const anchorDate = emp.level_updated_at ? new Date(emp.level_updated_at) : new Date(emp.hire_date);
        const monthsIn = differenceInMonths(today, anchorDate);

        const cVert = criteria.find((k) => k.position_id === emp.position_id && k.promotion_type === "vertical");
        const cAny = cVert ?? criteria.find((k) => k.position_id === emp.position_id);
        const minMonths = cAny?.min_months_in_role ?? 12;
        const minScore = cAny?.min_evaluation_score ?? 80;

        const warns = warnByEmp.get(emp.id) ?? 0;
        const score = evalByEmp.get(emp.id) ?? null;

        const gaps: string[] = [];
        if (monthsIn < minMonths) gaps.push(`Faltam ${minMonths - monthsIn}m no cargo`);
        if (warns > 0) gaps.push(`${warns} advertência(s) recentes`);
        if (score == null) gaps.push(`Sem avaliação registrada`);
        else if (score < minScore) gaps.push(`Avaliação ${score}% < ${minScore}%`);

        vout.push({
          employee: emp,
          store_name: storeName.get(allocatedStore.get(emp.id) ?? emp.store_id ?? "") ?? null,
          from_position: emp.position ?? posName.get(emp.position_id) ?? "—",
          to_position_id: next.to_position_id,
          to_position: posName.get(next.to_position_id) ?? "—",
          to_salary: toSalary,
          months_in_role: monthsIn,
          min_months: minMonths,
          eval_score: score,
          min_score: minScore,
          warnings: warns,
          is_eligible: gaps.length === 0,
          gaps,
        });
      }
      setVerticalResults(vout);

      setLastRun(new Date());
      toast({ title: `${out.filter((r) => r.is_eligible).length} elegíveis para subir de nível · ${vout.filter((v) => v.is_eligible).length} para promoção vertical` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { compute(); }, []);

  const eligibles = useMemo(() => results.filter((r) => r.is_eligible), [results]);
  const notEligibles = useMemo(() => results.filter((r) => !r.is_eligible && r.gaps.length <= 2), [results]);
  const verticalEligibles = useMemo(() => verticalResults.filter((v) => v.is_eligible), [verticalResults]);
  const verticalNear = useMemo(() => verticalResults.filter((v) => !v.is_eligible && v.gaps.length <= 2), [verticalResults]);

  const promote = async (r: Result) => {
    const salaryTxt = r.next_salary != null
      ? `R$ ${Number(r.next_salary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : "salário atual";
    if (!confirm(
      `Promover ${r.employee.full_name} do nível ${r.current_level} para o nível ${r.next_level}?\n\n` +
      `Novo salário: ${salaryTxt}\n` +
      `O tempo no nível será reiniciado a partir de hoje.`
    )) return;
    try {
      const { error } = await supabase
        .from("employees")
        .update({ current_level: r.next_level, level_updated_at: new Date().toISOString(), salary: r.next_salary })
        .eq("id", r.employee.id);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("promotion_history").insert({
        employee_id: r.employee.id,
        promotion_type: "horizontal",
        from_position: r.employee.position,
        to_position: r.employee.position,
        from_position_id: r.employee.position_id,
        to_position_id: r.employee.position_id,
        from_level: r.current_level,
        to_level: r.next_level,
        from_salary: r.current_salary,
        to_salary: r.next_salary,
        promoted_by: userData.user?.id ?? null,
        promoted_by_name: userData.user?.email ?? null,
      });
      toast({
        title: `✅ ${r.employee.full_name} promovido(a) para nível ${r.next_level}`,
        description: `Novo salário: ${salaryTxt}. Colaborador saiu da lista de elegíveis (tempo no nível reiniciado).`,
      });
      compute();
    } catch (e: any) {
      toast({ title: "Erro ao promover", description: e.message, variant: "destructive" });
    }
  };

  const promoteVertical = async (v: VerticalResult) => {
    if (!confirm(`Promover ${v.employee.full_name} de "${v.from_position}" para "${v.to_position}"?`)) return;
    try {
      const payload: any = {
        position_id: v.to_position_id,
        current_level: "I",
        level_updated_at: new Date().toISOString(),
      };
      if (v.to_salary != null) payload.salary = v.to_salary;
      const { error } = await supabase.from("employees").update(payload).eq("id", v.employee.id);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("promotion_history").insert({
        employee_id: v.employee.id,
        promotion_type: "vertical",
        from_position: v.from_position,
        to_position: v.to_position,
        from_position_id: v.employee.position_id,
        to_position_id: v.to_position_id,
        from_level: v.employee.current_level ?? "I",
        to_level: "I",
        from_salary: (v as any).from_salary ?? null,
        to_salary: v.to_salary ?? null,
        promoted_by: userData.user?.id ?? null,
        promoted_by_name: userData.user?.email ?? null,
      });
      toast({ title: `${v.employee.full_name} promovido para ${v.to_position}` });
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Elegíveis para promoção vertical (troca de cargo) ({verticalEligibles.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">Auxiliares e estagiários seguem trilha até Supervisor de Loja.</p>
        </CardHeader>
        <CardContent className="pt-0">
          {verticalEligibles.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Ninguém elegível para troca de cargo no momento.</p>
          ) : (
            <div className="space-y-2">
              {verticalEligibles.map((v) => (
                <div key={v.employee.id} className="border rounded-md p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{v.employee.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{v.from_position}</span> → <span className="font-medium text-foreground">{v.to_position}</span>
                      {v.to_salary != null && <> · novo salário R$ {v.to_salary.toFixed(2)}</>}
                      {v.store_name && <> · {v.store_name}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {v.months_in_role}m · {v.eval_score ?? "—"}%
                    </Badge>
                    <Button size="sm" onClick={() => promoteVertical(v)}>Promover</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {verticalNear.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4" />
              Perto da promoção vertical (até 2 critérios faltando)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {verticalNear.slice(0, 30).map((v) => (
                <div key={v.employee.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium text-sm">{v.employee.full_name}</div>
                    <span className="text-xs text-muted-foreground">
                      {v.from_position} → {v.to_position}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {v.gaps.map((g, j) => (
                      <Badge key={j} variant="outline" className="text-xs">{g}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
