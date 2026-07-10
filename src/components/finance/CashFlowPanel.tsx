import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./_fetchAll";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  addBreakdown,
  emptyDreColumn,
  finalizeDreColumn,
  type DreColumn,
  type DreGroup,
} from "@/lib/dre";
import { DreTable } from "./DrePanel";

type CategoryInfo = { dre_group: DreGroup | null; kind: string; name: string };
type CategoryMap = Record<string, CategoryInfo>;

interface SaleRow { sale_date: string; gross_revenue: number }
interface PayableRow {
  id: string;
  paid_at: string | null;
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

// Fluxo de caixa começa quando começamos a registrar pagamentos no sistema (mai/2026).
const CASH_START = "2026-05-01";

const monthKey = (iso: string) => iso.slice(0, 7);
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
  const iso = d.toISOString().slice(0, 10);
  return iso < CASH_START ? CASH_START : iso;
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

interface ComputeArgs {
  sales: SaleRow[];
  payables: PayableRow[];
  receivables: ReceivableRow[];
  catMap: CategoryMap;
  columnFor: (date: string) => string | null;
  columns: { key: string; label: string }[];
}

const computeCashflow = ({
  sales,
  payables,
  receivables,
  catMap,
  columnFor,
  columns,
}: ComputeArgs): DreColumn[] => {
  const cols = new Map<string, DreColumn>(
    columns.map((c) => [c.key, emptyDreColumn(c.key, c.label)]),
  );

  // Receita bruta — usamos faturamento diário (regime de caixa da operação)
  for (const s of sales) {
    const key = columnFor(s.sale_date.slice(0, 10));
    if (!key) continue;
    const col = cols.get(key);
    if (!col) continue;
    col.revenue_gross += Number(s.gross_revenue) || 0;
  }

  // Despesas — SOMENTE pagas, pela data de pagamento
  for (const p of payables) {
    if (p.status === "cancelled") continue;
    if (!p.paid_at) continue;
    const key = columnFor(p.paid_at.slice(0, 10));
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
      group === "expense_financial" ||
      group === "expense_tax"
        ? group
        : "expense_admin";
    (col as any)[target] += debit;
    addBreakdown(col, target, p.category_id, catName, debit);
  }

  // Receitas extra-PDV (pela data de recebimento)
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
  }

  return columns.map((c) => finalizeDreColumn(cols.get(c.key)!));
};

export default function CashFlowPanel() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = usePersistentState<"monthly" | "custom">("finance:cashflow:tab", "monthly");
  const [monthsBack, setMonthsBack] = usePersistentState<number>("finance:cashflow:monthsBack", 6);
  const [customStart, setCustomStart] = usePersistentState<string>("finance:cashflow:customStart", monthsAgoISO(0));
  const [customEnd, setCustomEnd] = usePersistentState<string>("finance:cashflow:customEnd", todayISO());
  useScrollRestoration("finance:cashflow", !loading);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [catMap, setCatMap] = useState<CategoryMap>({});

  const periodStart = useMemo(() => {
    const raw = tab === "monthly" ? monthsAgoISO(monthsBack - 1) : customStart;
    return raw < CASH_START ? CASH_START : raw;
  }, [tab, monthsBack, customStart]);
  const periodEnd = useMemo(() => (tab === "monthly" ? todayISO() : customEnd), [tab, customEnd]);

  const load = async () => {
    setLoading(true);
    try {
      const [salesRes, payRes, recRes, catRes] = await Promise.all([
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
            .select("id,paid_at,amount,category_id,status")
            .neq("status", "cancelled")
            .not("paid_at", "is", null)
            .gte("paid_at", periodStart)
            .lte("paid_at", periodEnd)
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
    } catch (e: any) {
      toast({ title: "Erro ao carregar Fluxo de Caixa", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [periodStart, periodEnd]);

  const columns = useMemo<DreColumn[]>(() => {
    if (tab === "monthly") {
      const cols: { key: string; label: string }[] = [];
      const d = new Date();
      d.setDate(1);
      for (let i = monthsBack - 1; i >= 0; i--) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
        if (key < "2026-05") continue; // sem dados de caixa antes disso
        cols.push({ key, label: monthLabel(key) });
      }
      const keySet = new Set(cols.map((c) => c.key));
      return computeCashflow({
        sales,
        payables,
        receivables,
        catMap,
        columnFor: (date) => {
          const k = monthKey(date);
          return keySet.has(k) ? k : null;
        },
        columns: cols,
      });
    }
    const monthKeys = monthsInRange(periodStart, periodEnd).filter((m) => m >= "2026-05");
    if (monthKeys.length === 0) return [];
    const monthSet = new Set(monthKeys);
    return computeCashflow({
      sales,
      payables,
      receivables,
      catMap,
      columnFor: (date) => (monthSet.has(monthKey(date)) ? "period" : null),
      columns: [{ key: "period", label: "Período selecionado" }],
    });
  }, [tab, monthsBack, sales, payables, receivables, catMap, periodStart, periodEnd]);

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6 space-y-4">
        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
          Fluxo de caixa <strong>regime de caixa</strong>: despesas entram pela <strong>data de pagamento</strong> (não pela competência) e receitas pela data de recebimento.
          <br />Disponível a partir de <strong>mai/2026</strong> — meses anteriores não têm dados de pagamento no sistema.
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex-wrap h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="monthly" className="text-xs sm:text-sm">Mensal</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs sm:text-sm">Período</TabsTrigger>
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
                <Input type="date" value={customStart} min={CASH_START} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
