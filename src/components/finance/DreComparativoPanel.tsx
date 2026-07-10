import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./_fetchAll";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Sparkles, BarChart3, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  emptyDreColumn,
  finalizeDreColumn,
  fmtBRL,
  type DreColumn,
} from "@/lib/dre";
import {
  applySnapshotToColumn,
  fetchSnapshotAll,
  isHistoricalMonth,
  monthLabelBR,
  type SnapshotByStoreMonth,
} from "@/lib/dreSnapshot";
import ReactMarkdown from "react-markdown";

type PeriodOption = "3m" | "6m" | "12m" | "24m" | "36m" | "ytd";

const PERIOD_LABELS: Record<PeriodOption, string> = {
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  "24m": "Últimos 24 meses",
  "36m": "Últimos 3 anos",
  ytd: "Este ano (YTD)",
};

const monthKey = (iso: string) => iso.slice(0, 7);

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Info do mês corrente parcial (dia atual, dias totais, fator de projeção linear)
const partialInfo = (mk: string): { day: number; total: number; factor: number } | null => {
  if (mk !== currentMonthKey()) return null;
  const now = new Date();
  const day = now.getDate();
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const factor = day > 0 ? total / day : 1;
  return { day, total, factor };
};

const buildMonthKeys = (opt: PeriodOption): string[] => {
  const now = new Date();
  now.setDate(1);
  const out: string[] = [];
  if (opt === "ytd") {
    for (let m = 0; m <= now.getMonth(); m++) {
      out.push(`${now.getFullYear()}-${String(m + 1).padStart(2, "0")}`);
    }
    return out;
  }
  const n = { "3m": 3, "6m": 6, "12m": 12, "24m": 24, "36m": 36 }[opt];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

interface PayableRow { paid_at: string | null; due_date: string | null; competence_date: string | null; amount: number; category_id: string | null; status: string }
interface ReceivableRow { received_at: string | null; amount: number; category_id: string | null; status: string }
interface SaleRow { sale_date: string; gross_revenue: number }

type Cat = { dre_group: string | null };

export default function DreComparativoPanel() {
  const [period, setPeriod] = useState<PeriodOption>("12m");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState<"sintetica" | "analitica" | null>(null);
  const [aiOutput, setAiOutput] = useState<string>("");
  const [aiTitle, setAiTitle] = useState<string>("");

  const [snapshot, setSnapshot] = useState<SnapshotByStoreMonth | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [catMap, setCatMap] = useState<Record<string, Cat>>({});
  const [ifoodByMonth, setIfoodByMonth] = useState<Record<string, number>>({});

  const monthKeys = useMemo(() => buildMonthKeys(period), [period]);
  const rangeStart = useMemo(() => `${monthKeys[0]}-01`, [monthKeys]);
  const rangeEnd = useMemo(() => {
    const last = monthKeys[monthKeys.length - 1];
    const [y, m] = last.split("-").map(Number);
    const d = new Date(y, m, 0);
    return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [monthKeys]);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, salesRes, payRes, recRes, catRes, dedRes] = await Promise.all([
        fetchSnapshotAll(),
        fetchAllPaged((from, to) =>
          supabase
            .from("monthly_revenue")
            .select("year,month,day,gross_revenue")
            .gte("year", Number(rangeStart.slice(0, 4)))
            .lte("year", Number(rangeEnd.slice(0, 4)))
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_payable")
            .select("paid_at,due_date,competence_date,amount,category_id,status")
            .neq("status", "cancelled")
            .or(`and(competence_date.gte.${rangeStart},competence_date.lte.${rangeEnd}),and(competence_date.is.null,due_date.gte.${rangeStart},due_date.lte.${rangeEnd})`)
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_receivable")
            .select("received_at,amount,category_id,status")
            .eq("status", "received")
            .gte("received_at", rangeStart)
            .lte("received_at", rangeEnd)
            .range(from, to),
        ),
        supabase.from("finance_categories").select("id,dre_group"),
        supabase.functions.invoke("dre-ifood-deductions"),
      ]);
      setSnapshot(snap);
      setSales(((salesRes.data ?? []) as any[]).map((r) => ({
        sale_date: `${String(r.year).padStart(4, "0")}-${String(r.month).padStart(2, "0")}-${String(r.day ?? 1).padStart(2, "0")}`,
        gross_revenue: Number(r.gross_revenue ?? 0),
      })));
      setPayables((payRes.data ?? []) as PayableRow[]);
      setReceivables((recRes.data ?? []) as ReceivableRow[]);
      const cm: Record<string, Cat> = {};
      for (const c of (catRes.data ?? []) as any[]) cm[c.id] = { dre_group: c.dre_group };
      setCatMap(cm);
      if (!dedRes.error && (dedRes.data as any)?.by_month) {
        setIfoodByMonth((dedRes.data as any).by_month as Record<string, number>);
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar comparativo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

  // Calcula uma coluna DRE por mês (snapshot para ≤ abr/26, cálculo ao vivo para depois)
  const perMonth = useMemo<DreColumn[]>(() => {
    if (!snapshot) return [];
    return monthKeys.map((mk) => {
      const col = emptyDreColumn(mk, monthLabelBR(mk));
      if (isHistoricalMonth(mk)) {
        applySnapshotToColumn(col, snapshot.consolidated[mk]);
        return finalizeDreColumn(col);
      }
      // Ao vivo
      for (const s of sales) if (monthKey(s.sale_date) === mk) col.revenue_gross += s.gross_revenue;
      for (const p of payables) {
        if (p.status === "cancelled") continue;
        const comp = p.competence_date ?? p.due_date ?? (p.paid_at?.slice(0, 10) ?? null);
        if (!comp || monthKey(comp) !== mk) continue;
        const g = p.category_id ? catMap[p.category_id]?.dre_group : null;
        const debit = Number(p.amount) || 0;
        if (g === "excluded") continue;
        if (g === "non_operational") { col.non_operational -= debit; continue; }
        if (g === "revenue_deduction") { col.revenue_deduction += debit; continue; }
        if (g === "cmv") { col.cmv += debit; continue; }
        if (g === "expense_personnel") col.expense_personnel += debit;
        else if (g === "expense_admin") col.expense_admin += debit;
        else if (g === "expense_marketing") col.expense_marketing += debit;
        else if (g === "expense_financial") col.expense_financial += debit;
        else if (g === "expense_tax") col.expense_tax += debit;
        else col.expense_other += debit;
      }
      for (const r of receivables) {
        if (r.status !== "received" || !r.received_at) continue;
        if (monthKey(r.received_at) !== mk) continue;
        const g = r.category_id ? catMap[r.category_id]?.dre_group : null;
        const credit = Number(r.amount) || 0;
        if (g === "excluded") continue;
        if (g === "non_operational") col.non_operational += credit;
        else if (g === "revenue_deduction") col.revenue_deduction -= credit;
      }
      // Deduções iFood (planilha)
      col.revenue_deduction += Number(ifoodByMonth[mk] ?? 0);
      return finalizeDreColumn(col);
    });
  }, [snapshot, monthKeys, sales, payables, receivables, catMap, ifoodByMonth]);

  const chartData = useMemo(() => perMonth.map((c) => {
    const p = partialInfo(c.key);
    const label = p ? `${c.label} (parcial d.${p.day})` : c.label;
    if (!p) {
      return {
        mes: label,
        "Receita líquida": Math.round(c.revenue_net),
        "Lucro bruto": Math.round(c.gross_profit),
        EBITDA: Math.round(c.ebitda),
        "Resultado líquido": Math.round(c.net_result),
        "Receita líquida (proj.)": null as number | null,
        "Lucro bruto (proj.)": null as number | null,
        "EBITDA (proj.)": null as number | null,
        "Resultado líquido (proj.)": null as number | null,
      };
    }
    // Mês parcial: mostra realizado e projeção linear (dia atual → mês inteiro)
    return {
      mes: label,
      "Receita líquida": Math.round(c.revenue_net),
      "Lucro bruto": Math.round(c.gross_profit),
      EBITDA: Math.round(c.ebitda),
      "Resultado líquido": Math.round(c.net_result),
      "Receita líquida (proj.)": Math.round(c.revenue_net * p.factor),
      "Lucro bruto (proj.)": Math.round(c.gross_profit * p.factor),
      "EBITDA (proj.)": Math.round(c.ebitda * p.factor),
      "Resultado líquido (proj.)": Math.round(c.net_result * p.factor),
    };
  }), [perMonth]);

  const expenseChartData = useMemo(() => perMonth.map((c) => {
    const p = partialInfo(c.key);
    const label = p ? `${c.label} (parcial)` : c.label;
    return {
      mes: label,
      CMV: Math.round(c.cmv),
      Pessoal: Math.round(c.expense_personnel),
      Admin: Math.round(c.expense_admin),
      Marketing: Math.round(c.expense_marketing),
      Outras: Math.round(c.expense_other),
      Financeiras: Math.round(c.expense_financial),
      Impostos: Math.round(c.expense_tax),
    };
  }), [perMonth]);

  // Totais: EXCLUI o mês corrente parcial para não distorcer médias/somatórios
  const closedMonths = useMemo(() => perMonth.filter((c) => !partialInfo(c.key)), [perMonth]);
  const partialMonth = useMemo(() => perMonth.find((c) => partialInfo(c.key)) ?? null, [perMonth]);
  const partialMeta = useMemo(() => (partialMonth ? partialInfo(partialMonth.key) : null), [partialMonth]);

  const totals = useMemo(() => {
    const t = emptyDreColumn("total", "Período");
    const fields: (keyof DreColumn)[] = [
      "revenue_gross","revenue_deduction","cmv","expense_personnel","expense_admin",
      "expense_marketing","expense_financial","expense_tax","expense_other","non_operational",
    ];
    for (const c of closedMonths) for (const f of fields) (t as any)[f] += (c as any)[f];
    return finalizeDreColumn(t);
  }, [closedMonths]);


  const runAi = async (mode: "sintetica" | "analitica") => {
    setAiLoading(mode);
    setAiOutput("");
    setAiTitle(mode === "sintetica" ? "Análise sintética" : "Análise analítica");
    try {
      const payload = {
        mode,
        period: PERIOD_LABELS[period],
        months: perMonth.map((c) => {
          const p = partialInfo(c.key);
          return {
            mes: c.label,
            parcial: !!p,
            dia_atual: p?.day ?? null,
            dias_no_mes: p?.total ?? null,
            receita_bruta: Math.round(c.revenue_gross),
            deducoes: Math.round(c.revenue_deduction),
            receita_liquida: Math.round(c.revenue_net),
            cmv: Math.round(c.cmv),
            lucro_bruto: Math.round(c.gross_profit),
            pessoal: Math.round(c.expense_personnel),
            admin: Math.round(c.expense_admin),
            marketing: Math.round(c.expense_marketing),
            outras: Math.round(c.expense_other),
            financeiras: Math.round(c.expense_financial),
            impostos: Math.round(c.expense_tax),
            nao_operacional: Math.round(c.non_operational),
            ebitda: Math.round(c.ebitda),
            resultado_liquido: Math.round(c.net_result),
            projecao_mes_inteiro: p ? {
              receita_liquida: Math.round(c.revenue_net * p.factor),
              lucro_bruto: Math.round(c.gross_profit * p.factor),
              ebitda: Math.round(c.ebitda * p.factor),
              resultado_liquido: Math.round(c.net_result * p.factor),
            } : null,
          };
        }),
        totals_excluding_partial: {
          receita_bruta: Math.round(totals.revenue_gross),
          receita_liquida: Math.round(totals.revenue_net),
          cmv: Math.round(totals.cmv),
          lucro_bruto: Math.round(totals.gross_profit),
          ebitda: Math.round(totals.ebitda),
          resultado_liquido: Math.round(totals.net_result),
        },

      };
      const { data, error } = await supabase.functions.invoke("dre-ai-analysis", { body: payload });
      if (error) throw error;
      setAiOutput(data?.analysis ?? "Sem resposta.");
    } catch (e: any) {
      toast({ title: "Erro na análise IA", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodOption)}
          >
            {(Object.keys(PERIOD_LABELS) as PeriodOption[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Atualizar</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniCard label="Receita líquida" value={totals.revenue_net} />
        <MiniCard label="Lucro bruto" value={totals.gross_profit} />
        <MiniCard label="EBITDA" value={totals.ebitda} />
        <MiniCard label="Resultado líquido" value={totals.net_result} />
      </div>

      {partialMeta && partialMonth && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">{partialMonth.label}</strong> ainda não fechou (dia {partialMeta.day} de {partialMeta.total}).
          Os totais acima excluem este mês para não distorcer a comparação.
          No gráfico, o realizado parcial aparece na linha cheia e a <em>projeção linear</em> para o mês inteiro na linha tracejada.
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="text-sm font-medium mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Evolução de resultados
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Receita líquida" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Lucro bruto" stroke="hsl(var(--chart-2, 173 58% 39%))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="EBITDA" stroke="hsl(var(--chart-3, 43 74% 49%))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Resultado líquido" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                {partialMeta && (
                  <>
                    <Line type="monotone" dataKey="Receita líquida (proj.)" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Lucro bruto (proj.)" stroke="hsl(var(--chart-2, 173 58% 39%))" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="EBITDA (proj.)" stroke="hsl(var(--chart-3, 43 74% 49%))" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Resultado líquido (proj.)" stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>

          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="text-sm font-medium mb-2">Composição das despesas por mês</div>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={expenseChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar stackId="a" dataKey="CMV" fill="hsl(var(--primary))" />
                <Bar stackId="a" dataKey="Pessoal" fill="hsl(var(--chart-2, 173 58% 39%))" />
                <Bar stackId="a" dataKey="Admin" fill="hsl(var(--chart-3, 43 74% 49%))" />
                <Bar stackId="a" dataKey="Marketing" fill="hsl(var(--chart-4, 27 87% 67%))" />
                <Bar stackId="a" dataKey="Outras" fill="hsl(var(--chart-5, 340 75% 55%))" />
                <Bar stackId="a" dataKey="Financeiras" fill="hsl(var(--muted-foreground))" />
                <Bar stackId="a" dataKey="Impostos" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Análise por IA</span>
            <span className="text-xs text-muted-foreground">— sobre {PERIOD_LABELS[period].toLowerCase()}</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={!!aiLoading || loading} onClick={() => runAi("sintetica")}>
                {aiLoading === "sintetica" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1">Sintética</span>
              </Button>
              <Button size="sm" disabled={!!aiLoading || loading} onClick={() => runAi("analitica")}>
                {aiLoading === "analitica" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1">Analítica</span>
              </Button>
            </div>
          </div>
          {aiOutput ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="text-xs font-semibold text-muted-foreground mb-2">{aiTitle}</div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{aiOutput}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Clique em <strong>Sintética</strong> para um resumo executivo ou <strong>Analítica</strong> para uma análise
              detalhada linha a linha, com tendências, alertas e sugestões de ação.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: number }) {
  const negative = value < 0;
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      <div className={`text-sm sm:text-base font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}>
        {fmtBRL(value)}
      </div>
    </div>
  );
}
