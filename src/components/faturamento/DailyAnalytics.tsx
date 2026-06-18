import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip,
} from "recharts";
import { fmtBRL } from "@/lib/dre";

interface Store { id: string; name: string }
interface Brand { id: string; name: string }
interface DailyRow {
  year: number; month: number; day: number;
  store_id: string | null; brand_id: string | null;
  gross_revenue: number;
}
interface Holiday {
  holiday_date: string; name: string;
  scope?: string | null; store_id?: string | null;
}

const WD_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WD_LONG  = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function channelOf(name: string): "ifood" | "totem" | "salao" | "site" | "outro" {
  const n = normalize(name);
  if (/totem/.test(n)) return "totem";
  if (/salao/.test(n)) return "salao";
  if (/site/.test(n)) return "site";
  if (/fabri/.test(n)) return "outro";
  return "ifood";
}
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function fmtDate(y: number, m: number, d: number) {
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// Feriados nacionais fallback (caso a tabela holidays esteja vazia)
const FALLBACK_HOLIDAYS: Holiday[] = [
  { holiday_date: "2023-01-01", name: "Confraternização Universal" },
  { holiday_date: "2023-02-20", name: "Carnaval (segunda)" },
  { holiday_date: "2023-02-21", name: "Carnaval (terça)" },
  { holiday_date: "2023-04-07", name: "Sexta-feira Santa" },
  { holiday_date: "2023-04-21", name: "Tiradentes" },
  { holiday_date: "2023-05-01", name: "Dia do Trabalho" },
  { holiday_date: "2023-06-08", name: "Corpus Christi" },
  { holiday_date: "2023-09-07", name: "Independência do Brasil" },
  { holiday_date: "2023-10-12", name: "Nossa Senhora Aparecida" },
  { holiday_date: "2023-11-02", name: "Finados" },
  { holiday_date: "2023-11-15", name: "Proclamação da República" },
  { holiday_date: "2023-12-25", name: "Natal" },
  { holiday_date: "2024-01-01", name: "Confraternização Universal" },
  { holiday_date: "2024-02-12", name: "Carnaval (segunda)" },
  { holiday_date: "2024-02-13", name: "Carnaval (terça)" },
  { holiday_date: "2024-03-29", name: "Sexta-feira Santa" },
  { holiday_date: "2024-04-21", name: "Tiradentes" },
  { holiday_date: "2024-05-01", name: "Dia do Trabalho" },
  { holiday_date: "2024-05-30", name: "Corpus Christi" },
  { holiday_date: "2024-09-07", name: "Independência do Brasil" },
  { holiday_date: "2024-10-12", name: "Nossa Senhora Aparecida" },
  { holiday_date: "2024-11-02", name: "Finados" },
  { holiday_date: "2024-11-15", name: "Proclamação da República" },
  { holiday_date: "2024-11-20", name: "Consciência Negra" },
  { holiday_date: "2024-12-25", name: "Natal" },
  { holiday_date: "2025-01-01", name: "Confraternização Universal" },
  { holiday_date: "2025-03-03", name: "Carnaval (segunda)" },
  { holiday_date: "2025-03-04", name: "Carnaval (terça)" },
  { holiday_date: "2025-04-18", name: "Sexta-feira Santa" },
  { holiday_date: "2025-04-21", name: "Tiradentes" },
  { holiday_date: "2025-05-01", name: "Dia do Trabalho" },
  { holiday_date: "2025-06-19", name: "Corpus Christi" },
  { holiday_date: "2025-09-07", name: "Independência do Brasil" },
  { holiday_date: "2025-10-12", name: "Nossa Senhora Aparecida" },
  { holiday_date: "2025-11-02", name: "Finados" },
  { holiday_date: "2025-11-15", name: "Proclamação da República" },
  { holiday_date: "2025-11-20", name: "Consciência Negra" },
  { holiday_date: "2025-12-25", name: "Natal" },
];

export function DailyAnalytics() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [period, setPeriod] = useState<"90" | "365" | "730" | "all">("365");
  const [storeFilter, setStoreFilter] = useState<string>("__all");
  const [channelFilter, setChannelFilter] = useState<string>("__all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Filtro server-side por período: evita baixar a tabela inteira (>>1000 linhas).
      let cutoffStr: string | null = null;
      if (period !== "all") {
        const days = parseInt(period, 10);
        const d = new Date();
        d.setDate(d.getDate() - days);
        cutoffStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      const all: any[] = [];
      const step = 1000;
      for (let off = 0; ; off += step) {
        let q = supabase
          .from("daily_revenue")
          .select("sale_date,store_id,brand_id,gross_revenue")
          .order("sale_date")
          .range(off, off + step - 1);
        if (cutoffStr) q = q.gte("sale_date", cutoffStr);
        const { data, error } = await q;
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < step) break;
      }
      const [st, br, hd] = await Promise.all([
        supabase.from("stores").select("id,name").eq("is_virtual", false).order("name"),
        supabase.from("brands").select("id,name").order("name"),
        supabase.from("holidays").select("holiday_date,name,scope,store_id").order("holiday_date"),
      ]);
      setRows(all.map((r: any) => {
        const [y, m, d] = String(r.sale_date).split("-").map((n: string) => parseInt(n, 10));
        return {
          year: y, month: m, day: d,
          store_id: r.store_id, brand_id: r.brand_id,
          gross_revenue: Number(r.gross_revenue) || 0,
        };
      }));
      if (st.data) setStores(st.data as any);
      if (br.data) setBrands(br.data as any);
      if (hd.data) {
        const seen = new Set(hd.data.map((h: any) => h.holiday_date));
        setHolidays([
          ...hd.data as any,
          ...FALLBACK_HOLIDAYS.filter(h => !seen.has(h.holiday_date))
            .map(h => ({ ...h, scope: "national", store_id: null })),
        ]);
      } else {
        setHolidays(FALLBACK_HOLIDAYS);
      }
      setLoading(false);
    })();
  }, [period]);

  const operationalStores = useMemo(
    () => stores.filter(s => !/escrit|fabri|estoque/i.test(s.name)),
    [stores],
  );
  const brandMap = useMemo(() => {
    const m = new Map<string, Brand>();
    for (const b of brands) m.set(b.id, b);
    return m;
  }, [brands]);

  // rows após filtros
  const filtered = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (period !== "all") {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - parseInt(period, 10));
    }
    return rows.filter(r => {
      if (!r.day) return false;
      if (storeFilter !== "__all" && r.store_id !== storeFilter) return false;
      const brand = r.brand_id ? brandMap.get(r.brand_id) : null;
      const ch = brand ? channelOf(brand.name) : "outro";
      if (channelFilter !== "__all") {
        if (ch !== channelFilter) return false;
      } else {
        if (ch === "outro") return false;
      }
      if (cutoff && new Date(r.year, r.month - 1, r.day) < cutoff) return false;
      return true;
    });
  }, [rows, storeFilter, channelFilter, period, brandMap]);

  // agregado por dia
  const dayMap = useMemo(() => {
    const m = new Map<string, { y: number; m: number; d: number; total: number; weekday: number }>();
    for (const r of filtered) {
      if (!r.day) continue;
      const k = ymd(r.year, r.month, r.day);
      const cur = m.get(k);
      if (cur) cur.total += r.gross_revenue;
      else {
        const dt = new Date(r.year, r.month - 1, r.day);
        m.set(k, { y: r.year, m: r.month, d: r.day, total: r.gross_revenue, weekday: dt.getDay() });
      }
    }
    return m;
  }, [filtered]);

  // média por dia da semana
  const weekday = useMemo(() => {
    const sum = Array(7).fill(0);
    const cnt = Array(7).fill(0);
    for (const v of dayMap.values()) {
      sum[v.weekday] += v.total;
      cnt[v.weekday] += 1;
    }
    const data = WD_SHORT.map((w, i) => ({
      weekday: w, idx: i, avg: cnt[i] ? sum[i] / cnt[i] : 0, days: cnt[i],
    }));
    const ranked = [...data].filter(d => d.days > 0).sort((a, b) => b.avg - a.avg);
    return { data, best: ranked[0] ?? null, worst: ranked[ranked.length - 1] ?? null };
  }, [dayMap]);

  // Top 10
  const topBottom = useMemo(() => {
    const arr = [...Array.from(dayMap.values()).filter(d => d.total > 0)].sort((a, b) => b.total - a.total);
    return { top: arr.slice(0, 10), bottom: [...arr].reverse().slice(0, 10) };
  }, [dayMap]);

  // mapa de feriados por data
  const holidayByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const h of holidays) {
      const list = m.get(h.holiday_date) ?? [];
      list.push(h.name);
      m.set(h.holiday_date, list);
    }
    return m;
  }, [holidays]);

  // ranking feriados vs baseline mesma dia-semana
  const holidayPerf = useMemo(() => {
    const now = new Date();
    const grouped = new Map<string, { year: number; total: number; weekday: number }[]>();
    for (const h of holidays) {
      const [y, m, d] = h.holiday_date.split("-").map(n => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      if (dt > now) continue;
      const day = dayMap.get(ymd(y, m, d));
      if (!day) continue;
      const list = grouped.get(h.name) ?? [];
      list.push({ year: y, total: day.total, weekday: dt.getDay() });
      grouped.set(h.name, list);
    }
    // baseline por weekday (exclui feriados)
    const baseline: Record<number, { sum: number; c: number }> = {};
    for (let i = 0; i < 7; i++) baseline[i] = { sum: 0, c: 0 };
    for (const v of dayMap.values()) {
      const key = ymd(v.y, v.m, v.d);
      if (holidayByDate.has(key)) continue;
      baseline[v.weekday].sum += v.total;
      baseline[v.weekday].c += 1;
    }
    const out: {
      name: string; avgTotal: number; avgBaseline: number; deltaPct: number;
      years: number; yearList: string; weekdays: number[];
      tier: "alta" | "baixa" | "media";
    }[] = [];
    grouped.forEach((list, name) => {
      const avgTotal = list.reduce((a, x) => a + x.total, 0) / list.length;
      let sum = 0, c = 0;
      for (const x of list) {
        const b = baseline[x.weekday];
        if (b.c > 0) { sum += b.sum / b.c; c += 1; }
      }
      const avgBaseline = c ? sum / c : 0;
      const deltaPct = avgBaseline > 0 ? ((avgTotal - avgBaseline) / avgBaseline) * 100 : 0;
      const tier: "alta" | "baixa" | "media" =
        avgBaseline <= 0 ? "media" : deltaPct >= 15 ? "alta" : deltaPct <= -15 ? "baixa" : "media";
      out.push({
        name, avgTotal, avgBaseline, deltaPct,
        years: list.length,
        yearList: list.map(x => x.year).sort().join(", "),
        weekdays: Array.from(new Set(list.map(x => x.weekday))),
        tier,
      });
    });
    return out.sort((a, b) => b.deltaPct - a.deltaPct);
  }, [holidays, dayMap, holidayByDate]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Período</div>
              <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Últimos 12 meses</SelectItem>
                  <SelectItem value="730">Últimos 24 meses</SelectItem>
                  <SelectItem value="all">Todo o histórico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Loja</div>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas as lojas</SelectItem>
                  {operationalStores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Canal</div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos os canais</SelectItem>
                  <SelectItem value="ifood">iFood</SelectItem>
                  <SelectItem value="totem">Totem</SelectItem>
                  <SelectItem value="salao">Salão</SelectItem>
                  <SelectItem value="site">Site (Anota Aí)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Média por dia da semana */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Média por dia da semana</CardTitle>
        </CardHeader>
        <CardContent>
          {weekday.data.every(d => d.avg === 0) ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Sem dados no período/filtros selecionados.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Melhor dia</div>
                  <div className="text-sm font-semibold">
                    {weekday.best ? WD_LONG[weekday.best.idx] : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {weekday.best ? `Média ${fmtBRL(weekday.best.avg)}` : ""}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Pior dia</div>
                  <div className="text-sm font-semibold">
                    {weekday.worst ? WD_LONG[weekday.worst.idx] : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {weekday.worst ? `Média ${fmtBRL(weekday.worst.avg)}` : ""}
                  </div>
                </div>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer>
                  <BarChart data={weekday.data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <RTooltip
                      formatter={(v: any) => fmtBRL(Number(v))}
                      labelFormatter={(l: any) => `${l} (média)`}
                    />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {weekday.data.map((d, i) => {
                        const isBest = weekday.best?.idx === d.idx;
                        const isWorst = weekday.worst?.idx === d.idx;
                        return (
                          <Cell
                            key={i}
                            fill={isBest ? "hsl(142 71% 45%)" : isWorst ? "hsl(0 72% 51%)" : "hsl(var(--primary))"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Top 10 melhores e piores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {([
          { title: "Top 10 melhores dias", list: topBottom.top },
          { title: "Top 10 piores dias", list: topBottom.bottom },
        ] as const).map((block) => (
          <Card key={block.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{block.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {block.list.length === 0 ? (
                <div className="text-center text-muted-foreground py-6 text-sm">Sem dados.</div>
              ) : (
                <div className="overflow-x-auto -mx-3 px-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-1.5 pr-2">Data</th>
                        <th className="py-1.5 pr-2">Dia</th>
                        <th className="py-1.5 pr-2 text-right">Total</th>
                        <th className="py-1.5">Feriado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.list.map((row) => {
                        const k = ymd(row.y, row.m, row.d);
                        const hol = holidayByDate.get(k);
                        return (
                          <tr key={k} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(row.y, row.m, row.d)}</td>
                            <td className="py-1.5 pr-2">{WD_SHORT[row.weekday]}</td>
                            <td className="py-1.5 pr-2 text-right font-medium">{fmtBRL(row.total)}</td>
                            <td className="py-1.5 text-xs text-muted-foreground truncate max-w-[160px]">
                              {hol ? hol.join(", ") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feriados */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Feriados — desempenho vs. média do mesmo dia da semana no mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          {holidayPerf.length === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-sm">
              Sem feriados com vendas registradas no período.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-2">Feriado</th>
                    <th className="py-1.5 pr-2 text-right">Média vendida</th>
                    <th className="py-1.5 pr-2 text-right hidden sm:table-cell">Média do dia</th>
                    <th className="py-1.5 text-right">vs. média</th>
                  </tr>
                </thead>
                <tbody>
                  {holidayPerf.map((h, i) => {
                    const style =
                      h.tier === "alta"
                        ? { row: "bg-success/5", badge: "bg-success hover:bg-success text-success-foreground", label: "Vende mais" }
                        : h.tier === "baixa"
                        ? { row: "bg-destructive/5", badge: "bg-destructive hover:bg-destructive text-destructive-foreground", label: "Vende menos" }
                        : { row: "", badge: "bg-warning hover:bg-warning text-warning-foreground", label: "Na média" };
                    const wds = h.weekdays.map(d => WD_SHORT[d]).join("/");
                    return (
                      <tr key={i} className={`border-b last:border-0 ${style.row}`}>
                        <td className="py-1.5 pr-2">
                          <div className="font-medium truncate max-w-[220px]">{h.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {h.years} {h.years === 1 ? "ano" : "anos"} ({h.yearList}) · {wds} · {style.label}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 text-right">{fmtBRL(h.avgTotal)}</td>
                        <td className="py-1.5 pr-2 text-right hidden sm:table-cell text-muted-foreground">
                          {h.avgBaseline > 0 ? fmtBRL(h.avgBaseline) : "—"}
                        </td>
                        <td className="py-1.5 text-right">
                          <Badge className={style.badge}>
                            {h.avgBaseline > 0
                              ? `${h.deltaPct >= 0 ? "+" : ""}${h.deltaPct.toFixed(0)}%`
                              : "n/d"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
