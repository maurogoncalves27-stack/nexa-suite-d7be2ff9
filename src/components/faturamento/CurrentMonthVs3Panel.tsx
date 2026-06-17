import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts";
import { fmtBRL } from "@/lib/dre";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Store { id: string; name: string }

interface Props {
  stores: Store[];
  /** Cor por loja (mesma usada nos outros gráficos) */
  storeColor: (name: string, fallback: string) => string;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface DailyRow {
  sale_date: string;
  store_id: string;
  gross_revenue: number;
}

interface MonthBucket {
  key: string;          // "YYYY-MM"
  year: number;
  month: number;        // 1..12
  label: string;        // "Mai/26"
  isCurrent: boolean;
  byStore: Map<string, number>;
  total: number;
}

function ymKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(y: number, m: number) {
  return `${MONTH_LABELS[m - 1]}/${String(y).slice(-2)}`;
}

function pctVar(curr: number, base: number): number | null {
  if (!base) return null;
  return ((curr - base) / base) * 100;
}

function VarBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" />—</Badge>;
  if (Math.abs(value) < 0.05) {
    return <Badge variant="outline" className="gap-1"><Minus className="h-3 w-3" />0,0%</Badge>;
  }
  if (value > 0) {
    return (
      <Badge className="bg-success text-success-foreground gap-1">
        <TrendingUp className="h-3 w-3" />+{value.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <TrendingDown className="h-3 w-3" />{value.toFixed(1)}%
    </Badge>
  );
}

export default function CurrentMonthVs3Panel({ stores, storeColor }: Props) {
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyRow[]>([]);

  // Mês corrente + 3 anteriores
  const months = useMemo(() => {
    const today = new Date();
    const list: { year: number; month: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return list;
  }, []);

  const range = useMemo(() => {
    const first = months[0];
    const last = months[months.length - 1];
    const from = `${first.year}-${String(first.month).padStart(2, "0")}-01`;
    const lastDay = new Date(last.year, last.month, 0).getDate();
    const to = `${last.year}-${String(last.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }, [months]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all: DailyRow[] = [];
      const step = 1000;
      for (let off = 0; ; off += step) {
        const { data, error } = await supabase
          .from("daily_revenue")
          .select("sale_date, store_id, gross_revenue")
          .gte("sale_date", range.from)
          .lte("sale_date", range.to)
          .order("sale_date")
          .range(off, off + step - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as any[]).map((r) => ({
          sale_date: String(r.sale_date),
          store_id: String(r.store_id),
          gross_revenue: Number(r.gross_revenue) || 0,
        })));
        if (data.length < step) break;
      }
      if (!cancelled) {
        setDaily(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  // Corte do mês corrente = maior dia com lançamento (>0)
  const cutoffDay = useMemo(() => {
    const curr = months[months.length - 1];
    let maxDay = 0;
    for (const r of daily) {
      const [y, m, d] = r.sale_date.split("-").map(Number);
      if (y === curr.year && m === curr.month && r.gross_revenue > 0) {
        if (d > maxDay) maxDay = d;
      }
    }
    return maxDay;
  }, [daily, months]);

  // Agrega cada mês limitando ao mesmo intervalo de dias (1..cutoffDay)
  const buckets: MonthBucket[] = useMemo(() => {
    return months.map((m, idx) => {
      const isCurrent = idx === months.length - 1;
      const byStore = new Map<string, number>();
      let total = 0;
      for (const r of daily) {
        const [y, mm, d] = r.sale_date.split("-").map(Number);
        if (y !== m.year || mm !== m.month) continue;
        if (cutoffDay > 0 && d > cutoffDay) continue;
        byStore.set(r.store_id, (byStore.get(r.store_id) ?? 0) + r.gross_revenue);
        total += r.gross_revenue;
      }
      return {
        key: ymKey(m.year, m.month),
        year: m.year,
        month: m.month,
        label: monthLabel(m.year, m.month),
        isCurrent,
        byStore,
        total,
      };
    });
  }, [daily, months, cutoffDay]);

  const current = buckets[buckets.length - 1];
  const prevs = buckets.slice(0, -1); // 3 anteriores
  const avgPrev = prevs.length
    ? prevs.reduce((a, b) => a + b.total, 0) / prevs.length
    : 0;

  // Dados do gráfico: uma barra por loja, 4 séries (uma por mês)
  const chartData = useMemo(() => {
    return stores.map((s) => {
      const row: Record<string, any> = { store: s.name };
      for (const b of buckets) row[b.label] = b.byStore.get(s.id) ?? 0;
      return row;
    });
  }, [stores, buckets]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[380px] w-full" />
      </div>
    );
  }

  if (cutoffDay === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          O mês corrente ainda não tem nenhum faturamento diário lançado.
          Lance pelo menos um dia em <strong>Faturamento bruto</strong> para começar a comparação.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {current.label} (dias 1–{cutoffDay}) × mesmo intervalo dos 3 últimos meses
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Considera apenas os lançamentos diários ainda não consolidados. Para comparar de
            forma justa, todos os meses são somados apenas até o dia {cutoffDay}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
            <Card className="border-primary/40">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{current.label} (corrente)</div>
                <div className="text-lg sm:text-xl font-semibold">{fmtBRL(current.total)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">dias 1–{cutoffDay}</div>
              </CardContent>
            </Card>
            {prevs.map((b) => {
              const v = pctVar(current.total, b.total);
              return (
                <Card key={b.key}>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">{b.label}</div>
                    <div className="text-lg sm:text-xl font-semibold">{fmtBRL(b.total)}</div>
                    <div className="mt-1"><VarBadge value={v} /></div>
                  </CardContent>
                </Card>
              );
            })}
            <Card className="bg-muted/40">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Média dos 3 anteriores</div>
                <div className="text-lg sm:text-xl font-semibold">{fmtBRL(avgPrev)}</div>
                <div className="mt-1"><VarBadge value={pctVar(current.total, avgPrev)} /></div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comparativo por loja</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[380px] sm:h-[420px] w-full">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="store" interval={0} tick={{ fontSize: 11 }} height={40} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <RTooltip formatter={(v: any) => fmtBRL(Number(v))} />
                <Legend />
                {buckets.map((b, i) => {
                  // Mês corrente em destaque (cor primary); anteriores em tons neutros
                  const fill = b.isCurrent
                    ? "hsl(var(--primary))"
                    : `hsl(var(--muted-foreground) / ${0.35 + i * 0.15})`;
                  return (
                    <Bar
                      key={b.key}
                      dataKey={b.label}
                      fill={fill}
                      radius={[4, 4, 0, 0]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhe por loja</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 px-2">Loja</th>
                {buckets.map((b) => (
                  <th key={b.key} className={`text-right py-2 px-2 ${b.isCurrent ? "text-primary font-semibold" : ""}`}>
                    {b.label}
                  </th>
                ))}
                <th className="text-right py-2 px-2">Δ vs média</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const vals = buckets.map((b) => b.byStore.get(s.id) ?? 0);
                const currVal = vals[vals.length - 1];
                const baseAvg = vals.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, vals.length - 1);
                const v = pctVar(currVal, baseAvg);
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium" style={{ color: storeColor(s.name, "inherit") }}>
                      {s.name}
                    </td>
                    {vals.map((val, i) => (
                      <td
                        key={i}
                        className={`text-right py-2 px-2 ${i === vals.length - 1 ? "font-semibold" : "text-muted-foreground"}`}
                      >
                        {val > 0 ? fmtBRL(val) : "—"}
                      </td>
                    ))}
                    <td className="text-right py-2 px-2"><VarBadge value={v} /></td>
                  </tr>
                );
              })}
              <tr className="bg-muted/40 font-semibold">
                <td className="py-2 px-2">Total</td>
                {buckets.map((b) => (
                  <td key={b.key} className={`text-right py-2 px-2 ${b.isCurrent ? "text-primary" : ""}`}>
                    {fmtBRL(b.total)}
                  </td>
                ))}
                <td className="text-right py-2 px-2">
                  <VarBadge value={pctVar(current.total, avgPrev)} />
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
