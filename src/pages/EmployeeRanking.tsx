import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trophy, Loader2, Users, Filter, X } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, LabelList, AreaChart, Area,
} from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";

// ===== Helpers =====
const PERCENT_PER_POINT = 1;

const money = (v: number) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const moneyShort = (v: number) => {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`;
  return `R$ ${n.toFixed(0)}`;
};

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const weekStartOf = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // domingo
  return d;
};
const weekEndOf = (ws: Date): Date => {
  const d = new Date(ws);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};
const addWeeks = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
};
const fmtShortBR = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// Paleta de cores para colaboradores selecionados
const COLORS = [
  "hsl(var(--primary))",
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(346 87% 60%)",
  "hsl(262 83% 58%)",
  "hsl(173 80% 40%)",
  "hsl(24 95% 53%)",
];

// ===== Tipos =====
interface EmployeeRow {
  id: string;
  full_name: string;
  position: string | null;
  store_id: string;
  admission_date: string | null;
  hire_date: string | null;
  created_at: string | null;
  contracting_store?: { id: string; name: string } | null;
}
interface PositionRow { id: string; name: string; cbo_title: string | null; }
interface PositionBonusRow { position_id: string; bonus_amount: number; }
interface InfractionRow { employee_id: string; occurred_on: string; applied_weight: number; }
interface SuspensionRow {
  employee_id: string;
  suspension_start_date: string;
  suspension_end_date: string;
}
interface AdjRow { employee_id: string; week_start: string; amount: number; }

// ===== Default período: últimas 8 semanas até a semana anterior =====
const defaultPeriod = (): { from: Date; to: Date } => {
  const lastFullWeekStart = addWeeks(weekStartOf(new Date()), -1);
  const to = weekEndOf(lastFullWeekStart);
  const from = addWeeks(lastFullWeekStart, -7);
  return { from, to };
};

export default function EmployeeRanking() {
  const [{ from, to }, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [positionBonuses, setPositionBonuses] = useState<PositionBonusRow[]>([]);
  const [infractions, setInfractions] = useState<InfractionRow[]>([]);
  const [suspensions, setSuspensions] = useState<SuspensionRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjRow[]>([]);

  // Filtros
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [empPickerSearch, setEmpPickerSearch] = useState("");

  const startIso = useMemo(() => isoDate(from), [from]);
  const endIso = useMemo(() => isoDate(to), [to]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [
        { data: emps },
        { data: poss },
        { data: pbs },
        { data: infs },
        { data: susps },
        { data: adjs },
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, position, store_id, admission_date, hire_date, created_at, contracting_store:stores!employees_store_id_fkey(id, name)")
          .order("full_name"),
        supabase.from("positions").select("id, name, cbo_title").eq("is_active", true),
        supabase.from("position_bonuses").select("position_id, bonus_amount"),
        supabase
          .from("employee_infractions")
          .select("employee_id, occurred_on, applied_weight")
          .gte("occurred_on", startIso)
          .lte("occurred_on", endIso),
        supabase
          .from("employee_infractions")
          .select("employee_id, suspension_start_date, suspension_end_date")
          .gt("suspension_weeks", 0)
          .is("suspension_revoked_at", null)
          .lte("suspension_start_date", endIso)
          .gte("suspension_end_date", startIso),
        supabase
          .from("weekly_payment_adjustments")
          .select("employee_id, week_start, amount")
          .gte("week_start", startIso)
          .lte("week_start", endIso),
      ]);

      setEmployees((emps ?? []) as unknown as EmployeeRow[]);
      setPositions((poss ?? []) as PositionRow[]);
      setPositionBonuses((pbs ?? []) as PositionBonusRow[]);
      setInfractions((infs ?? []) as InfractionRow[]);
      setSuspensions((susps ?? []) as SuspensionRow[]);
      setAdjustments((adjs ?? []) as AdjRow[]);
      setLoading(false);
    })();
  }, [startIso, endIso]);

  // ===== Lookups =====
  const resolveBonus = useMemo(() => {
    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const bonusByPid: Record<string, number> = {};
    for (const pb of positionBonuses) bonusByPid[pb.position_id] = Number(pb.bonus_amount);
    const pidByKey: Record<string, string> = {};
    for (const p of positions) {
      pidByKey[norm(p.name)] = p.id;
      if (p.cbo_title) pidByKey[norm(p.cbo_title)] = p.id;
    }
    return (pos: string | null | undefined) => {
      const k = norm(pos);
      if (!k) return 0;
      const pid = pidByKey[k];
      return pid ? (bonusByPid[pid] ?? 0) : 0;
    };
  }, [positions, positionBonuses]);

  // ===== Lista de semanas no período =====
  const weeks = useMemo(() => {
    const list: { start: Date; end: Date; iso: string; label: string }[] = [];
    let cur = weekStartOf(from);
    const limit = weekEndOf(weekStartOf(to)).getTime();
    while (cur.getTime() <= limit) {
      const end = weekEndOf(cur);
      list.push({
        start: new Date(cur),
        end,
        iso: isoDate(cur),
        label: `${fmtShortBR(cur)}–${fmtShortBR(end)}`,
      });
      cur = addWeeks(cur, 1);
    }
    return list;
  }, [from, to]);

  // ===== Calcula líquido pago para cada (colaborador, semana) =====
  const liquidByEmpWeek = useMemo(() => {
    // map[empId][weekIso] = liquido
    const out: Record<string, Record<string, number>> = {};

    // Indexar infrações por (emp, semana)
    const infByEmpWeek: Record<string, Record<string, number>> = {};
    for (const inf of infractions) {
      const occ = new Date(inf.occurred_on + "T00:00:00");
      const ws = isoDate(weekStartOf(occ));
      infByEmpWeek[inf.employee_id] ??= {};
      infByEmpWeek[inf.employee_id][ws] = (infByEmpWeek[inf.employee_id][ws] ?? 0) + Number(inf.applied_weight);
    }

    // Suspensões: marcar semanas suspensas por colaborador
    const suspByEmp: Record<string, Array<{ s: number; e: number }>> = {};
    for (const s of suspensions) {
      const sStart = new Date(s.suspension_start_date + "T00:00:00").getTime();
      const sEnd = new Date(s.suspension_end_date + "T23:59:59").getTime();
      suspByEmp[s.employee_id] ??= [];
      suspByEmp[s.employee_id].push({ s: sStart, e: sEnd });
    }

    // Ajustes
    const adjByEmpWeek: Record<string, Record<string, number>> = {};
    for (const a of adjustments) {
      adjByEmpWeek[a.employee_id] ??= {};
      adjByEmpWeek[a.employee_id][a.week_start] = Number(a.amount);
    }

    for (const e of employees) {
      const baseRaw = resolveBonus(e.position);
      const activeSinceStr = e.admission_date ?? e.hire_date ?? e.created_at ?? null;
      const activeSince = activeSinceStr
        ? new Date(activeSinceStr.length === 10 ? activeSinceStr + "T00:00:00" : activeSinceStr).getTime()
        : null;

      out[e.id] = {};
      for (const w of weeks) {
        // Carência: 15 dias até o fim da semana
        let bonusBase = baseRaw;
        if (activeSince != null) {
          const diffDays = Math.floor((w.end.getTime() - activeSince) / 86400000);
          if (diffDays < 15) bonusBase = 0;
        }

        // Suspenso?
        const susps = suspByEmp[e.id] ?? [];
        const wStart = w.start.getTime();
        const wEnd = w.end.getTime();
        const suspended = susps.some((x) => x.s <= wEnd && x.e >= wStart);

        if (suspended) { out[e.id][w.iso] = 0; continue; }

        const points = infByEmpWeek[e.id]?.[w.iso] ?? 0;
        const percent = Math.min(100, points * PERCENT_PER_POINT);
        const desconto = +(bonusBase * (percent / 100)).toFixed(2);
        const adj = adjByEmpWeek[e.id]?.[w.iso] ?? 0;
        const liquido = Math.max(0, bonusBase - desconto + adj);
        out[e.id][w.iso] = liquido;
      }
    }
    return out;
  }, [employees, weeks, resolveBonus, infractions, suspensions, adjustments]);

  // ===== Filtros aplicados =====
  const stores = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      if (e.contracting_store?.id) m.set(e.contracting_store.id, e.contracting_store.name);
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const positionList = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) if (e.position) set.add(e.position);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (storeFilter !== "all" && e.store_id !== storeFilter) return false;
      if (positionFilter !== "all" && (e.position ?? "") !== positionFilter) return false;
      return true;
    });
  }, [employees, storeFilter, positionFilter]);

  // Se nenhum selecionado, usa top 5 da filtragem por total
  const totalsByEmp = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of filteredEmployees) {
      let sum = 0;
      const wk = liquidByEmpWeek[e.id] ?? {};
      for (const w of weeks) sum += wk[w.iso] ?? 0;
      out[e.id] = +sum.toFixed(2);
    }
    return out;
  }, [filteredEmployees, liquidByEmpWeek, weeks]);

  const rankingRows = useMemo(() => {
    return filteredEmployees
      .map((e) => ({
        id: e.id,
        name: e.full_name,
        position: e.position ?? "—",
        store: e.contracting_store?.name ?? "—",
        total: totalsByEmp[e.id] ?? 0,
        weekly: weeks.map((w) => ({ week: w.label, value: liquidByEmpWeek[e.id]?.[w.iso] ?? 0 })),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredEmployees, totalsByEmp, weeks, liquidByEmpWeek]);

  const chartEmployees = useMemo(() => {
    if (selectedEmployees.size > 0) {
      return rankingRows.filter((r) => selectedEmployees.has(r.id));
    }
    return rankingRows.slice(0, 5);
  }, [rankingRows, selectedEmployees]);

  // Série temporal: cada ponto = semana, cada colaborador = uma chave
  const timeSeries = useMemo(() => {
    return weeks.map((w) => {
      const row: Record<string, any> = { week: w.label };
      for (const r of chartEmployees) {
        row[r.name] = liquidByEmpWeek[r.id]?.[w.iso] ?? 0;
      }
      return row;
    });
  }, [weeks, chartEmployees, liquidByEmpWeek]);

  // KPIs
  const totalGeral = useMemo(
    () => rankingRows.reduce((s, r) => s + r.total, 0),
    [rankingRows],
  );
  const mediaPorAtivo = useMemo(() => {
    const ativos = rankingRows.filter((r) => r.total > 0).length;
    return ativos > 0 ? totalGeral / ativos : 0;
  }, [rankingRows, totalGeral]);

  // Pickers
  const empPickerOptions = useMemo(() => {
    const q = empPickerSearch.trim().toLowerCase();
    return filteredEmployees
      .filter((e) => !q || e.full_name.toLowerCase().includes(q))
      .slice(0, 200);
  }, [filteredEmployees, empPickerSearch]);

  const toggleEmp = (id: string) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  };

  const setPresetMonths = (months: number) => {
    const lastFullWeekStart = addWeeks(weekStartOf(new Date()), -1);
    const to2 = weekEndOf(lastFullWeekStart);
    const from2 = addWeeks(lastFullWeekStart, -(months * 4 - 1));
    setPeriod({ from: from2, to: to2 });
  };

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold leading-tight">Ranking de Colaboradores</h1>
            <p className="text-xs text-muted-foreground hidden md:block">
              Comparativo de bonificações pagas no período
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap md:flex-nowrap">
          <Button size="sm" variant="outline" onClick={() => setPresetMonths(1)} className="h-8 text-xs">1 mês</Button>
          <Button size="sm" variant="outline" onClick={() => setPresetMonths(2)} className="h-8 text-xs">2 meses</Button>
          <Button size="sm" variant="outline" onClick={() => setPresetMonths(3)} className="h-8 text-xs">3 meses</Button>
          <Button size="sm" variant="outline" onClick={() => setPresetMonths(6)} className="h-8 text-xs">6 meses</Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={isoDate(from)}
                onChange={(e) => setPeriod((p) => ({ ...p, from: new Date(e.target.value + "T00:00:00") }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={isoDate(to)}
                onChange={(e) => setPeriod((p) => ({ ...p, to: new Date(e.target.value + "T23:59:59") }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loja</Label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo</Label>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  {positionList.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9">
                  <Users className="h-4 w-4" />
                  {selectedEmployees.size > 0
                    ? `${selectedEmployees.size} colaborador(es)`
                    : "Comparar (auto: top 5)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Buscar..."
                    value={empPickerSearch}
                    onChange={(e) => setEmpPickerSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="p-2 space-y-1">
                    {empPickerOptions.map((e) => {
                      const checked = selectedEmployees.has(e.id);
                      return (
                        <button
                          key={e.id}
                          onClick={() => toggleEmp(e.id)}
                          className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted flex items-center gap-2 ${checked ? "bg-primary/10" : ""}`}
                        >
                          <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
                          <span className="truncate">{e.full_name}</span>
                        </button>
                      );
                    })}
                    {empPickerOptions.length === 0 && (
                      <div className="text-xs text-muted-foreground p-2">Nenhum colaborador</div>
                    )}
                  </div>
                </ScrollArea>
                {selectedEmployees.size > 0 && (
                  <div className="p-2 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-8 text-xs"
                      onClick={() => setSelectedEmployees(new Set())}
                    >
                      <X className="h-3 w-3 mr-1" /> Limpar seleção
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {(storeFilter !== "all" || positionFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs gap-1"
                onClick={() => { setStoreFilter("all"); setPositionFilter("all"); }}
              >
                <Filter className="h-3 w-3" /> Limpar filtros
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground">
              {weeks.length} semana(s) · {filteredEmployees.length} colaborador(es)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total pago</div>
          <div className="text-xl md:text-2xl font-bold">{money(totalGeral)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Média por ativo</div>
          <div className="text-xl md:text-2xl font-bold">{money(mediaPorAtivo)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Maior bonificação</div>
          <div className="text-base md:text-xl font-bold truncate">
            {rankingRows[0] ? money(rankingRows[0].total) : money(0)}
          </div>
          <div className="text-xs text-muted-foreground truncate">{rankingRows[0]?.name ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem bônus</div>
          <div className="text-xl md:text-2xl font-bold">
            {rankingRows.filter((r) => r.total === 0).length}
          </div>
          <div className="text-xs text-muted-foreground">colaborador(es) zerados</div>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Linha temporal */}
          <Card>
            <CardHeader className="p-3 md:p-4 pb-0">
              <CardTitle className="text-sm md:text-base">
                Evolução semanal {selectedEmployees.size === 0 && <span className="text-xs font-normal text-muted-foreground">(top 5 do período)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-4">
              <div className="h-[360px] md:h-[400px] w-full">
                <ResponsiveContainer>
                  <LineChart data={timeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => moneyShort(v as number)} />
                    <Tooltip
                      formatter={(v: number) => money(v)}
                      contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {chartEmployees.map((r, i) => (
                      <Line
                        key={r.id}
                        type="monotone"
                        dataKey={r.name}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Ranking horizontal */}
          <Card>
            <CardHeader className="p-3 md:p-4 pb-0">
              <CardTitle className="text-sm md:text-base">Ranking — total no período</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-4">
              <div style={{ height: Math.max(220, rankingRows.slice(0, 15).length * 32 + 40) }}>
                <ResponsiveContainer>
                  <BarChart
                    data={rankingRows.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 5, right: 60, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => moneyShort(v as number)} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      width={140}
                    />
                    <Tooltip
                      formatter={(v: number) => money(v)}
                      contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="total"
                        position="right"
                        formatter={(v: number) => money(v)}
                        style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {rankingRows.length > 15 && (
                <div className="text-xs text-muted-foreground mt-2 text-right">
                  Mostrando top 15 de {rankingRows.length}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabela com sparklines */}
          <Card>
            <CardHeader className="p-3 md:p-4 pb-0">
              <CardTitle className="text-sm md:text-base">Detalhe por colaborador</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-4">
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead className="hidden md:table-cell">Cargo</TableHead>
                      <TableHead className="hidden lg:table-cell">Loja</TableHead>
                      <TableHead className="w-[140px]">Tendência</TableHead>
                      <TableHead className="text-right w-32">Total</TableHead>
                      <TableHead className="text-right w-28">Média/sem.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingRows.map((r, idx) => {
                      const wks = r.weekly.filter((w) => w.value > 0).length;
                      const media = wks > 0 ? r.total / wks : 0;
                      return (
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer ${selectedEmployees.has(r.id) ? "bg-primary/5" : ""}`}
                          onClick={() => toggleEmp(r.id)}
                        >
                          <TableCell className="font-semibold text-muted-foreground">
                            {idx + 1}
                            {idx === 0 && <Trophy className="h-3 w-3 inline ml-1 text-amber-500" />}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{r.name}</span>
                              {selectedEmployees.has(r.id) && (
                                <Badge variant="secondary" className="text-[10px] py-0 h-5">selecionado</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{r.position}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{r.store}</TableCell>
                          <TableCell>
                            <div className="h-8 w-[120px]">
                              <ResponsiveContainer>
                                <AreaChart data={r.weekly} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                  <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="hsl(var(--primary))"
                                    fill="hsl(var(--primary))"
                                    fillOpacity={0.2}
                                    strokeWidth={1.5}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{money(r.total)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{money(media)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {rankingRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhum colaborador no filtro atual.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Clique em uma linha para incluir/remover do gráfico de evolução.
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
