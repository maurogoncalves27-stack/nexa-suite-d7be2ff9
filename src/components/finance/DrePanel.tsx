import { Fragment, useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./_fetchAll";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DRE_GROUP_LABELS,
  addBreakdown,
  emptyDreColumn,
  finalizeDreColumn,
  fmtBRL,
  pct,
  type DreColumn,
  type DreGroup,
} from "@/lib/dre";
import DreAllocatedPanel from "./DreAllocatedPanel";
import DreByStorePanel from "./DreByStorePanel";

// A partir de maio/2026 a DRE usa 100% os dados do sistema.
// De abril/2026 para trás usamos o snapshot histórico importado das planilhas
// (public.dre_historical_snapshot, store_key='consolidated').
const HIST_CUTOFF = "2026-04"; // último mês fechado como histórico
const isHistoricalMonth = (key: string) => key <= HIST_CUTOFF;

type SnapshotByMonth = Record<string, Record<string, number>>;

const SNAPSHOT_FIELD_MAP: Record<string, keyof DreColumn> = {
  revenue_gross: "revenue_gross",
  revenue_deduction: "revenue_deduction",
  cmv: "cmv",
  expense_personnel: "expense_personnel",
  expense_admin: "expense_admin",
  expense_marketing: "expense_marketing",
  expense_financial: "expense_financial",
  expense_tax: "expense_tax",
  expense_other: "expense_other",
  non_operational: "non_operational",
};

const applySnapshotToColumn = (col: DreColumn, values: Record<string, number> | undefined) => {
  if (!values) return;
  for (const [line, amount] of Object.entries(values)) {
    const field = SNAPSHOT_FIELD_MAP[line];
    if (!field) continue;
    (col as any)[field] += Number(amount) || 0;
  }
};

const snapshotColumn = (
  key: string,
  label: string,
  monthKeys: string[],
  snap: SnapshotByMonth,
): DreColumn => {
  const col = emptyDreColumn(key, label);
  for (const m of monthKeys) applySnapshotToColumn(col, snap[m]);
  return finalizeDreColumn(col);
};

type CategoryInfo = { dre_group: DreGroup | null; kind: string; name: string };
type CategoryMap = Record<string, CategoryInfo>;

interface SaleRow { sale_date: string; gross_revenue: number }
interface PayableRow {
  id: string;
  paid_at: string | null;
  due_date: string | null;
  competence_date: string | null;
  amount: number;
  category_id: string | null;
  status: string;
}
interface ReceivableRow {
  id: string;
  received_at: string | null;
  amount: number;
  category_id: string | null;
  status: string;
}

const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgoISO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

interface ComputeArgs {
  sales: SaleRow[];
  payables: PayableRow[];
  receivables: ReceivableRow[];
  catMap: CategoryMap;
  deductionsByMonth: Record<string, number>;
  columnFor: (date: string) => string | null;
  columnMonths: Record<string, string[]>; // key -> meses YYYY-MM cobertos
  columns: { key: string; label: string }[];
}

const computeDre = ({
  sales,
  payables,
  receivables,
  catMap,
  deductionsByMonth,
  columnFor,
  columnMonths,
  columns,
}: ComputeArgs): DreColumn[] => {
  const cols = new Map<string, DreColumn>(
    columns.map((c) => [c.key, emptyDreColumn(c.key, c.label)]),
  );

  for (const s of sales) {
    const key = columnFor(s.sale_date.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    col.revenue_gross += Number(s.gross_revenue) || 0;
  }

  // Despesas — todos os lançamentos do extrato/+pagtos (pagos ou não), pela data de competência
  for (const p of payables) {
    if (p.status === "cancelled") continue;
    const competence = p.competence_date ?? p.due_date ?? (p.paid_at ? p.paid_at.slice(0, 10) : null);
    if (!competence) continue;
    const key = columnFor(competence.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    const debit = Number(p.amount) || 0;
    const info = p.category_id ? catMap[p.category_id] : null;
    const group = info?.dre_group ?? null;
    const catName = info?.name ?? null;

    if (group === "excluded") continue;
    if (group === "non_operational") {
      col.non_operational -= debit;
      addBreakdown(col, "non_operational", p.category_id, catName, -debit);
      continue;
    }
    if (group === "revenue_deduction") {
      col.revenue_deduction += debit;
      addBreakdown(col, "revenue_deduction", p.category_id, catName, debit);
      continue;
    }
    if (group === "cmv") {
      col.cmv += debit;
      addBreakdown(col, "cmv", p.category_id, catName, debit);
      continue;
    }
    const target: DreGroup =
      group === "expense_personnel" ||
      group === "expense_admin" ||
      group === "expense_marketing" ||
      group === "expense_financial" ||
      group === "expense_tax"
        ? group
        : "expense_other";
    (col as any)[target] += debit;
    addBreakdown(col, target, p.category_id, catName, debit);
  }

  // Receitas extra-PDV
  for (const r of receivables) {
    if (r.status !== "received" || !r.received_at) continue;
    const key = columnFor(r.received_at.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    const credit = Number(r.amount) || 0;
    const info = r.category_id ? catMap[r.category_id] : null;
    const group = info?.dre_group ?? null;
    const catName = info?.name ?? null;

    if (group === "excluded") continue;
    if (group === "non_operational") {
      col.non_operational += credit;
      addBreakdown(col, "non_operational", r.category_id, catName, credit);
      continue;
    }
    if (group === "revenue_deduction") {
      col.revenue_deduction -= credit;
      addBreakdown(col, "revenue_deduction", r.category_id, catName, -credit);
      continue;
    }
    // Receita bruta já vem integralmente de monthly_revenue (/faturamento).
    // Contas a receber representam liquidação/cobrança e não devem duplicar faturamento.
  }

  // Deduções vindas da planilha (Vendas iFood — coluna M)
  for (const col of cols.values()) {
    const months = columnMonths[col.key] ?? [];
    let total = 0;
    for (const m of months) total += deductionsByMonth[m] ?? 0;
    if (total > 0) {
      col.revenue_deduction += total;
      addBreakdown(col, "revenue_deduction", "__ifood_planilha__", "Custos iFood (planilha)", total);
    }
  }

  return columns.map((c) => finalizeDreColumn(cols.get(c.key)!));
};

const monthsInRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

export default function DrePanel() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = usePersistentState<"monthly" | "custom" | "allocated" | "by_store">("finance:dre:tab", "monthly");
  const [monthsBack, setMonthsBack] = usePersistentState<number>("finance:dre:monthsBack", 6);
  const [customStart, setCustomStart] = usePersistentState<string>("finance:dre:customStart", monthsAgoISO(0));
  const [customEnd, setCustomEnd] = usePersistentState<string>("finance:dre:customEnd", todayISO());
  useScrollRestoration("finance:dre", !loading);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [catMap, setCatMap] = useState<CategoryMap>({});
  const [deductionsByMonth, setDeductionsByMonth] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState<SnapshotByMonth>({});

  const periodStart = useMemo(() => {
    if (tab === "monthly") return monthsAgoISO(monthsBack - 1);
    return customStart;
  }, [tab, monthsBack, customStart]);
  const periodEnd = useMemo(() => (tab === "monthly" ? todayISO() : customEnd), [tab, customEnd]);

  const load = async () => {
    setLoading(true);
    try {
      const [salesRes, payRes, recRes, catRes, dedRes] = await Promise.all([
        fetchAllPaged((from, to) =>
          supabase
            .from("monthly_revenue")
            .select("year,month,day,gross_revenue")
            .gte("year", Number(periodStart.slice(0, 4)))
            .lte("year", Number(periodEnd.slice(0, 4)))
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_payable")
            .select("id,paid_at,due_date,competence_date,amount,category_id,status")
            .neq("status", "cancelled")
            .or(`and(competence_date.gte.${periodStart},competence_date.lte.${periodEnd}),and(competence_date.is.null,due_date.gte.${periodStart},due_date.lte.${periodEnd})`)
            .range(from, to),
        ),
        fetchAllPaged((from, to) =>
          supabase
            .from("accounts_receivable")
            .select("id,received_at,amount,category_id,status")
            .eq("status", "received")
            .gte("received_at", periodStart)
            .lte("received_at", periodEnd)
            .range(from, to),
        ),
        supabase.from("finance_categories").select("id,name,dre_group,kind"),
        supabase.functions.invoke("dre-ifood-deductions"),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (payRes.error) throw payRes.error;
      if (recRes.error) throw recRes.error;
      if (catRes.error) throw catRes.error;

      const cm: CategoryMap = {};
      for (const c of catRes.data ?? []) {
        cm[c.id] = {
          dre_group: c.dre_group as DreGroup | null,
          kind: c.kind,
          name: c.name,
        };
      }

      const mappedSales: SaleRow[] = ((salesRes.data ?? []) as any[])
        .map((r) => {
          const y = String(r.year).padStart(4, "0");
          const m = String(r.month).padStart(2, "0");
          const d = String(r.day ?? 1).padStart(2, "0");
          return { sale_date: `${y}-${m}-${d}`, gross_revenue: Number(r.gross_revenue ?? 0) };
        })
        .filter((r) => r.sale_date >= periodStart && r.sale_date <= periodEnd);

      setSales(mappedSales);

      setPayables((payRes.data ?? []) as PayableRow[]);
      setReceivables((recRes.data ?? []) as ReceivableRow[]);
      setCatMap(cm);
      if (!dedRes.error && dedRes.data?.by_month) {
        setDeductionsByMonth(dedRes.data.by_month as Record<string, number>);
      } else if (dedRes.error) {
        console.warn("Falha ao carregar deduções iFood:", dedRes.error);
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar DRE", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [periodStart, periodEnd]);

  const columns = useMemo<DreColumn[]>(() => {
    if (tab === "monthly") {
      const cols: { key: string; label: string }[] = [];
      const colMonths: Record<string, string[]> = {};
      const d = new Date();
      d.setDate(1);
      for (let i = monthsBack - 1; i >= 0; i--) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
        cols.push({ key, label: monthLabel(key) });
        colMonths[key] = [key];
      }
      return computeDre({
        sales,
        payables,
        receivables,
        catMap,
        deductionsByMonth,
        columnFor: (date) => {
          const k = monthKey(date);
          return cols.find((c) => c.key === k)?.key ?? null;
        },
        columnMonths: colMonths,
        columns: cols,
      });
    }
    const cols = [{ key: "period", label: "Período selecionado" }];
    const colMonths = { period: monthsInRange(periodStart, periodEnd) };
    return computeDre({
      sales,
      payables,
      receivables,
      catMap,
      deductionsByMonth,
      columnFor: () => "period",
      columnMonths: colMonths,
      columns: cols,
    });
  }, [tab, monthsBack, sales, payables, receivables, catMap, deductionsByMonth, periodStart, periodEnd]);

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6 space-y-4">
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
          Receita bruta vem do faturamento manual diário. Despesas vêm do Extrato/+Pagtos pela data de competência (inclui lançamentos ainda não pagos). Custos iFood (planilha) é a única dedução externa. Clique nas linhas de despesa para ver as categorias.
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex-wrap h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="monthly" className="text-xs sm:text-sm">Mensal</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs sm:text-sm">Período</TabsTrigger>
            <TabsTrigger value="by_store" className="text-xs sm:text-sm">Por loja</TabsTrigger>
            <TabsTrigger value="allocated" className="text-xs sm:text-sm">Rateado</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Meses exibidos</Label>
                <select
                  className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monthsBack}
                  onChange={(e) => setMonthsBack(Number(e.target.value))}
                >
                  {[3, 6, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Atualizar</span>
              </Button>
            </div>
            <DreTable columns={columns} loading={loading} />
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9" />
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="ml-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Atualizar</span>
              </Button>
            </div>
            <DreTable columns={columns} loading={loading} />
          </TabsContent>

          <TabsContent value="by_store" className="space-y-3">
            <DreByStorePanel />
          </TabsContent>

          <TabsContent value="allocated" className="space-y-3">
            <DreAllocatedPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface RowDef {
  label: string;
  field: keyof DreColumn;
  variant?: "header" | "subtotal" | "total" | "deduction" | "normal";
  refField?: keyof DreColumn; // base para %
  indent?: boolean;
  group?: DreGroup; // se presente, linha tem drill-down por categoria
}

const ROWS: RowDef[] = [
  { label: "Receita bruta", field: "revenue_gross", variant: "header" },
  { label: "(−) Deduções", field: "revenue_deduction", variant: "deduction", indent: true, group: "revenue_deduction" },
  { label: "= Receita líquida", field: "revenue_net", variant: "subtotal", refField: "revenue_gross" },
  { label: "(−) CMV", field: "cmv", variant: "deduction", group: "cmv" },
  { label: "= Lucro bruto", field: "gross_profit", variant: "subtotal", refField: "revenue_net" },
  { label: DRE_GROUP_LABELS.expense_personnel, field: "expense_personnel", variant: "deduction", indent: true, group: "expense_personnel" },
  { label: DRE_GROUP_LABELS.expense_admin, field: "expense_admin", variant: "deduction", indent: true, group: "expense_admin" },
  { label: DRE_GROUP_LABELS.expense_marketing, field: "expense_marketing", variant: "deduction", indent: true, group: "expense_marketing" },
  { label: DRE_GROUP_LABELS.expense_other, field: "expense_other", variant: "deduction", indent: true, group: "expense_other" },
  { label: "(−) Despesas operacionais", field: "operational_total", variant: "subtotal" },
  { label: "= EBITDA", field: "ebitda", variant: "subtotal", refField: "revenue_net" },
  { label: "(−) Despesas financeiras", field: "expense_financial", variant: "deduction", indent: true, group: "expense_financial" },
  { label: "(−) Impostos", field: "expense_tax", variant: "deduction", indent: true, group: "expense_tax" },
  { label: "(±) Resultado não operacional", field: "non_operational", variant: "normal", indent: true, group: "non_operational" },
  { label: "= Resultado líquido", field: "net_result", variant: "total", refField: "revenue_net" },
];

function DreTable({ columns, loading }: { columns: DreColumn[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>;
  }

  const toggle = (label: string) =>
    setExpanded((s) => ({ ...s, [label]: !s[label] }));

  // Agregação dos itens de breakdown para uma linha (uniao das categorias entre colunas)
  const breakdownItems = (row: RowDef) => {
    if (!row.group) return [];
    const map = new Map<string, { name: string; perCol: Record<string, number>; total: number }>();
    for (const col of columns) {
      const bucket = col.breakdown[row.group] ?? {};
      for (const [id, entry] of Object.entries(bucket)) {
        const cur = map.get(id) ?? { name: entry.name, perCol: {}, total: 0 };
        cur.perCol[col.key] = (cur.perCol[col.key] ?? 0) + entry.amount;
        cur.total += entry.amount;
        map.set(id, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  };

  return (
    <>
      {/* Mobile: cards por coluna */}
      <div className="sm:hidden space-y-3">
        {columns.map((col) => (
          <div key={col.key} className="rounded-md border overflow-hidden">
            <div className="bg-primary/10 px-3 py-2 text-sm font-semibold">{col.label}</div>
            <div className="divide-y">
              {ROWS.map((row) => {
                const value = col[row.field] as number;
                const ref = row.refField ? (col[row.refField] as number) : undefined;
                const hasDrill = !!row.group;
                const isOpen = expanded[row.label];
                const items = isOpen && hasDrill
                  ? Object.values(col.breakdown[row.group!] ?? {}).sort(
                      (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
                    )
                  : [];
                return (
                  <div key={row.label}>
                    <button
                      type="button"
                      disabled={!hasDrill}
                      onClick={() => hasDrill && toggle(row.label)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${rowClass(row.variant)} ${hasDrill ? "hover:bg-muted/40" : ""}`}
                    >
                      <span className={`flex items-center gap-1 ${row.indent ? "pl-3" : ""}`}>
                        {hasDrill && (
                          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        )}
                        {row.label}
                      </span>
                      <span className="text-right tabular-nums whitespace-nowrap">
                        {fmtBRL(value)}
                        {ref !== undefined && (
                          <span className="ml-1 text-[10px] text-muted-foreground">{pct(value, ref)}</span>
                        )}
                      </span>
                    </button>
                    {isOpen && items.length > 0 && (
                      <div className="bg-muted/20 px-3 py-1.5 space-y-1">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] text-muted-foreground">
                            <span className="pl-5 truncate">{it.name}</span>
                            <span className="tabular-nums">{fmtBRL(it.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/desktop: tabela */}
      <div className="hidden sm:block overflow-x-auto rounded-md border -mx-1 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-2 sm:px-3 py-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[200px] sm:min-w-[260px]">Linha</th>
              {columns.map((c) => (
                <th key={c.key} className="text-right px-2 sm:px-3 py-2 font-medium whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const hasDrill = !!row.group;
              const isOpen = expanded[row.label];
              const items = isOpen && hasDrill ? breakdownItems(row) : [];
              return (
                <Fragment key={row.label}>
                  <tr className={`${rowClass(row.variant)} ${hasDrill ? "cursor-pointer hover:bg-muted/30" : ""}`}
                      onClick={() => hasDrill && toggle(row.label)}>
                    <td className={`px-2 sm:px-3 py-1.5 sticky left-0 z-10 ${rowBg(row.variant)} ${row.indent ? "pl-4 sm:pl-6" : ""}`}>
                      <span className="inline-flex items-center gap-1">
                        {hasDrill && (
                          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        )}
                        {row.label}
                      </span>
                    </td>
                    {columns.map((col) => {
                      const value = col[row.field] as number;
                      const ref = row.refField ? (col[row.refField] as number) : undefined;
                      return (
                        <td key={col.key} className="px-2 sm:px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                          <div>{fmtBRL(value)}</div>
                          {ref !== undefined && (
                            <div className="text-[10px] text-muted-foreground">{pct(value, ref)}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && items.map((it, idx) => (
                    <tr key={`${row.label}-${idx}`} className="bg-muted/10 text-xs">
                      <td className={`px-2 sm:px-3 py-1 sticky left-0 z-10 bg-muted/10 ${row.indent ? "pl-8 sm:pl-12" : "pl-6 sm:pl-10"} text-muted-foreground`}>
                        {it.name}
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-2 sm:px-3 py-1 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                          {it.perCol[col.key] ? fmtBRL(it.perCol[col.key]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {isOpen && items.length === 0 && (
                    <tr className="bg-muted/10 text-xs">
                      <td colSpan={columns.length + 1} className="px-3 py-1 text-center text-muted-foreground italic">
                        Sem lançamentos.
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

const rowClass = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "font-semibold bg-primary/5";
    case "subtotal": return "font-medium bg-muted/30 border-y";
    case "total": return "font-bold bg-primary/10 border-y-2";
    case "deduction": return "text-rose-600 dark:text-rose-400";
    default: return "";
  }
};
const rowBg = (v?: RowDef["variant"]) => {
  switch (v) {
    case "header": return "bg-primary/5";
    case "subtotal": return "bg-muted/30";
    case "total": return "bg-primary/10";
    default: return "bg-card";
  }
};
